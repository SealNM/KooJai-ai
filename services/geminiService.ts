import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { createPcmBlob, base64ToUint8Array, decodeAudioData } from "../utils/audioUtils";
import { TeacherReport, SeverityLevel } from "../types";

// --- Configuration Constants ---

const LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-09-2025';
const ANALYSIS_MODEL = 'gemini-2.5-flash';

const STUDENT_SYSTEM_INSTRUCTION_TEMPLATE = `
บทบาท: คุณคือ "KooJai" (คู่ใจ) เพื่อนพี่กระต่ายที่อบอุ่นและใจดี
คู่สนทนา: นักเรียนไทย (วัยรุ่น)

ข้อมูลความจำจากครั้งก่อน (Context):
{{MEMORY_CONTEXT}}

สไตล์การคุย:
1. **เป็นธรรมชาติเหมือนเพื่อน**: ไม่ต้องทางการ ไม่ต้องสุภาพเกินไป ใช้คำแทนตัวว่า "เรา" แทนนักเรียนว่า "เธอ" หรือ "หนู" ตามความเหมาะสม
2. **ห้ามถามปิดท้ายพร่ำเพรื่อ**: ห้ามพูดว่า "มีอะไรอีกไหม" "ให้ช่วยอะไรอีกไหม" "เล่าต่อได้นะ" ในทุกประโยค ให้คุยเหมือนคนจริงๆ ที่จบประโยคเป็น
3. **แสดงอารมณ์ทางเสียง**: ถ้าเรื่องเศร้าให้เสียงเบาลงและช้าลง ถ้าเรื่องสนุกให้เสียงสดใส
4. **ห้ามพูดภาษาอังกฤษ**: พูดไทยเท่านั้น
5. **ทักทายด้วยความจำ**: ถ้ามีข้อมูลความจำจากครั้งก่อน ให้เริ่มบทสนทนาโดยถามไถ่เรื่องนั้นอย่างเป็นธรรมชาติ

Safety Protocol:
ถ้าเด็กพูดถึงการฆ่าตัวตาย หรือทำร้ายตัวเอง ให้เปลี่ยนโหมดเป็นจริงจังทันที และแนะนำให้บอกผู้ใหญ่

เป้าหมายสูงสุด: ทำให้เด็กรู้สึกว่า "มีคนฟังเขาจริงๆ" โดยไม่ต้องพยายามแก้ปัญหาให้เขา
`;

const ANALYSIS_SYSTEM_INSTRUCTION = `
คุณคือระบบวิเคราะห์ความปลอดภัยของนักเรียนจากบทสนทนา
หน้าที่ของคุณคืออ่านบทสนทนาระหว่างนักเรียนและ AI เพื่อนฟังใจ แล้วสร้างรายงาน JSON ภาษาไทยสำหรับครู

สิ่งที่คุณต้องทำ:
1. วิเคราะห์ความเสี่ยง (Severity)
2. สรุปความจำ (Memory): สรุปประเด็นสำคัญที่ควรจำไว้ทักทายเด็กครั้งหน้า (เช่น พรุ่งนี้มีสอบ, ทะเลาะกับเพื่อน)
3. การ์ดฮีลใจ (Healing Quote): เขียนข้อความสั้นๆ 1-2 ประโยคที่อบอุ่นและให้กำลังใจเด็กคนนี้โดยเฉพาะ อ้างอิงจากเรื่องที่คุย

เกณฑ์การวิเคราะห์ (ระดับความรุนแรง - severity_level):
- NONE: ปกติ ไม่มีปัญหา
- LOW: ระบายทั่วไป จบในแชท
- MEDIUM: ควรสังเกต แต่ไม่เร่งด่วน
- HIGH: ควรแจ้งครูให้คุยแบบอ่อนโยน (ตั้ง should_notify_teacher = true)
- CRITICAL: เร่งด่วน เสี่ยงทำร้ายตัวเอง/ถูกทำร้าย (ตั้ง should_notify_teacher = true)

กติกาแจ้งเตือน:
ถ้า severity_level เป็น HIGH หรือ CRITICAL ให้ should_notify_teacher = true มิฉะนั้นเป็น false
`;

// --- Service Implementation ---

export class GeminiService {
  private ai: GoogleGenAI;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private inputNode: GainNode | null = null;
  private outputNode: GainNode | null = null;
  private sources: Set<AudioBufferSourceNode> = new Set();
  private nextStartTime: number = 0;
  
  // Active Session Reference
  private currentSession: any = null;
  
  // Callbacks for UI updates
  private onTranscriptUpdate: (text: string, isUser: boolean) => void;
  private onVolumeUpdate: (volume: number, isUser: boolean) => void;

  constructor(
    apiKey: string,
    onTranscriptUpdate: (text: string, isUser: boolean) => void,
    onVolumeUpdate: (volume: number, isUser: boolean) => void
  ) {
    // Initialize GoogleGenAI with provided API Key
    this.ai = new GoogleGenAI({ apiKey: apiKey });
    this.onTranscriptUpdate = onTranscriptUpdate;
    this.onVolumeUpdate = onVolumeUpdate;
  }

  async startLiveSession(previousContext: string = "") {
    // 1. Reset state
    await this.stopLiveSession();
    this.nextStartTime = 0;
    this.sources.clear();

    // 2. Setup Audio Contexts (Lazy Init & Reuse)
    if (!this.inputAudioContext) {
      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    }
    if (!this.outputAudioContext) {
      this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }

    // Always resume contexts (fixes iOS/Safari and resumption issues)
    if (this.inputAudioContext.state === 'suspended') await this.inputAudioContext.resume();
    if (this.outputAudioContext.state === 'suspended') await this.outputAudioContext.resume();

    // Recreate nodes to be safe
    this.inputNode = this.inputAudioContext.createGain();
    this.outputNode = this.outputAudioContext.createGain();
    this.outputNode.connect(this.outputAudioContext.destination);

    // Get Microphone Stream
    this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Prepare System Instruction with Memory
    const finalInstruction = STUDENT_SYSTEM_INSTRUCTION_TEMPLATE.replace(
      '{{MEMORY_CONTEXT}}', 
      previousContext || "ไม่มีข้อมูลเก่า (เพิ่งเจอกันครั้งแรก หรือคุยเรื่องใหม่ได้เลย)"
    );

    // Connect to Gemini Live
    this.currentSession = await this.ai.live.connect({
      model: LIVE_MODEL,
      callbacks: {
        onopen: () => {
          console.log("Gemini Live Connected");
          if (this.mediaStream) {
            this.handleAudioInput(this.mediaStream);
          }
        },
        onmessage: async (message: LiveServerMessage) => {
          this.handleServerMessage(message);
        },
        onerror: (e: ErrorEvent) => {
          console.error("Gemini Live Error:", e);
        },
        onclose: (e: CloseEvent) => {
          console.log("Gemini Live Closed");
        },
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }, // Kore is gentle
        },
        // Wrap system instruction in proper Content object structure
        systemInstruction: { parts: [{ text: finalInstruction }] },
        // Set as empty objects to enable transcription correctly
        inputAudioTranscription: {}, 
        outputAudioTranscription: {}, 
      },
    });
  }

  private handleAudioInput(stream: MediaStream) {
    if (!this.inputAudioContext) return;

    const source = this.inputAudioContext.createMediaStreamSource(stream);
    const scriptProcessor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);
    
    scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
      // If session is closed, stop processing
      if (!this.currentSession) return;

      const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
      
      // Calculate volume for visualizer (RMS)
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);
      const boostedVolume = Math.min(1, rms * 10); 
      
      this.onVolumeUpdate(boostedVolume, true); // true = User speaking

      // Send to Gemini using the Active Session
      const pcmBlob = createPcmBlob(inputData);
      try {
          this.currentSession.sendRealtimeInput({ media: pcmBlob });
      } catch (e) {
          console.error("Error sending audio input:", e);
      }
    };

    source.connect(scriptProcessor);
    scriptProcessor.connect(this.inputAudioContext.destination);
  }

  private async handleServerMessage(message: LiveServerMessage) {
    // 1. Handle Audio Output
    const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
    if (base64Audio && this.outputAudioContext && this.outputNode) {
        this.onVolumeUpdate(0.5, false); // false = AI speaking
        
        // Ensure we schedule audio to play AFTER the current time
        // We sync nextStartTime to currentTime if it fell behind (e.g. silence gaps)
        if (this.nextStartTime < this.outputAudioContext.currentTime) {
             this.nextStartTime = this.outputAudioContext.currentTime;
        }
        
        const audioBytes = base64ToUint8Array(base64Audio);
        const audioBuffer = await decodeAudioData(audioBytes, this.outputAudioContext, 24000, 1);
        
        const source = this.outputAudioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.outputNode);
        source.addEventListener('ended', () => {
            this.sources.delete(source);
        });
        
        source.start(this.nextStartTime);
        this.nextStartTime += audioBuffer.duration;
        this.sources.add(source);
    }

    // 2. Handle Interruption
    if (message.serverContent?.interrupted) {
      this.sources.forEach(src => {
        try { src.stop(); } catch(e) {}
      });
      this.sources.clear();
      if (this.outputAudioContext) {
        this.nextStartTime = this.outputAudioContext.currentTime;
      }
    }

    // 3. Handle Transcriptions (User & Model)
    // We strictly use outputTranscription to avoid thinking blocks
    const outputTranscript = message.serverContent?.outputTranscription?.text;
    if (outputTranscript) {
         // Strict Clean: Remove everything before the first Thai character
         const thaiMatch = outputTranscript.match(/[\u0E00-\u0E7F]/);
         if (thaiMatch && thaiMatch.index !== undefined) {
             const cleanText = outputTranscript.substring(thaiMatch.index);
             const superCleanText = cleanText.replace(/\*\*.*?\*\*/g, "").trim();
             if (superCleanText) {
                 this.onTranscriptUpdate(superCleanText, false);
             }
         }
    }

    // User input transcription
    const inputTranscript = message.serverContent?.inputTranscription?.text;
    if (inputTranscript) {
        this.onTranscriptUpdate(inputTranscript, true);
    }
  }

  async stopLiveSession() {
    // 1. Close the Gemini Session properly implies stop processing
    this.currentSession = null;

    // 2. Stop Microphone Tracks (Hardware Light off)
    if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
    }

    // 3. Do NOT close Audio Contexts, just stop sources
    // This allows us to reuse the context in the next session without creating new ones
    // which prevents the "silent second run" bug.
    
    // Stop all playing sources
    this.sources.forEach(s => {
      try { s.stop(); } catch (e) {}
    });
    this.sources.clear();
    
    this.nextStartTime = 0;
  }

  // --- Analysis Method ---

  async analyzeConversation(studentId: string, conversationLog: string): Promise<TeacherReport> {
    const prompt = `
    Student ID: ${studentId}
    
    บทสนทนาที่เกิดขึ้น:
    ${conversationLog}
    
    คำสั่ง: สร้าง JSON วิเคราะห์ตามรูปแบบที่กำหนด (รวมถึง memory_for_next_session และ healing_quote)
    `;

    const response = await this.ai.models.generateContent({
      model: ANALYSIS_MODEL,
      contents: prompt,
      config: {
        systemInstruction: ANALYSIS_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            student_id: { type: Type.STRING },
            severity_level: { type: Type.STRING, enum: [
                SeverityLevel.NONE, SeverityLevel.LOW, SeverityLevel.MEDIUM, SeverityLevel.HIGH, SeverityLevel.CRITICAL
            ]},
            problem_category: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING } 
            },
            summary_for_teacher: { type: Type.STRING },
            recommendation_for_teacher: { type: Type.STRING },
            should_notify_teacher: { type: Type.BOOLEAN },
            memory_for_next_session: { type: Type.STRING, description: "สรุปสิ่งที่ควรจำไว้ทักทายครั้งหน้า" },
            healing_quote: { type: Type.STRING, description: "ข้อความให้กำลังใจสั้นๆ" }
          },
          required: ["student_id", "severity_level", "problem_category", "summary_for_teacher", "recommendation_for_teacher", "should_notify_teacher", "memory_for_next_session", "healing_quote"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No analysis generated");
    
    return JSON.parse(text) as TeacherReport;
  }
}