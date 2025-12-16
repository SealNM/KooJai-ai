import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { createPcmBlob, base64ToUint8Array, decodeAudioData } from "../utils/audioUtils";
import { TeacherReport, SeverityLevel } from "../types";

// --- ⚙️ ส่วนตั้งค่า (Configuration) ---

// ชื่อโมเดลที่ใช้
// 1. LIVE_MODEL: โมเดลคุยสด (เร็ว, รองรับเสียงโดยตรง)
const LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-09-2025';
// 2. ANALYSIS_MODEL: โมเดลวิเคราะห์ (ฉลาด, รองรับ JSON)
const ANALYSIS_MODEL = 'gemini-2.5-flash';

// คำสั่งเข้าระบบ (Prompt) สำหรับบทบาทของ AI
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

// --- 🔧 Service Implementation ---
// Class นี้ทำหน้าที่จัดการ "เสียง" และ "การเชื่อมต่อกับ AI" ทั้งหมด

export class GeminiService {
  private ai: GoogleGenAI;
  // AudioContext คือตัวจัดการเสียงของ Browser
  private inputAudioContext: AudioContext | null = null;  // ขาเข้า (ไมค์)
  private outputAudioContext: AudioContext | null = null; // ขาออก (ลำโพง)
  private mediaStream: MediaStream | null = null; // สายสัญญาณเสียงจากไมค์
  private inputNode: GainNode | null = null;
  private outputNode: GainNode | null = null;
  private sources: Set<AudioBufferSourceNode> = new Set(); // เก็บเสียงที่กำลังเล่นอยู่
  private nextStartTime: number = 0; // ตัวนับเวลาเพื่อให้เสียงเล่นต่อกันไม่สะดุด
  
  // เก็บ Session ปัจจุบันที่กำลังคุยอยู่
  private currentSession: any = null;
  
  // ฟังก์ชัน Callback เพื่อส่งข้อมูลกลับไปหน้า UI
  private onTranscriptUpdate: (text: string, isUser: boolean) => void;
  private onVolumeUpdate: (volume: number, isUser: boolean) => void;

  constructor(
    onTranscriptUpdate: (text: string, isUser: boolean) => void,
    onVolumeUpdate: (volume: number, isUser: boolean) => void
  ) {
    // เริ่มต้น SDK
    // @ts-ignore: process.env.API_KEY is assumed to be available
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    this.onTranscriptUpdate = onTranscriptUpdate;
    this.onVolumeUpdate = onVolumeUpdate;
  }

  // --- เริ่มการสนทนา (Start) ---
  async startLiveSession(previousContext: string = "") {
    // 1. ล้างค่าเก่าก่อน
    await this.stopLiveSession();
    this.nextStartTime = 0;
    this.sources.clear();

    // 2. สร้าง Audio Contexts (ถ้ายังไม่มี)
    // AudioContext ต้องสร้างใหม่หรือ Resume หลัง user interaction (กดปุ่ม) ไม่งั้น Browser จะบล็อกเสียง
    if (!this.inputAudioContext) {
      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    }
    if (!this.outputAudioContext) {
      this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }

    // ปลุกให้ตื่น (Resume) เผื่อมันหลับ (Suspended)
    if (this.inputAudioContext.state === 'suspended') await this.inputAudioContext.resume();
    if (this.outputAudioContext.state === 'suspended') await this.outputAudioContext.resume();

    // สร้าง Node ปรับเสียง
    this.inputNode = this.inputAudioContext.createGain();
    this.outputNode = this.outputAudioContext.createGain();
    this.outputNode.connect(this.outputAudioContext.destination); // ต่อลำโพง

    // ขออนุญาตใช้ไมค์
    this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // ใส่ความจำเก่าลงไปใน Prompt
    const finalInstruction = STUDENT_SYSTEM_INSTRUCTION_TEMPLATE.replace(
      '{{MEMORY_CONTEXT}}', 
      previousContext || "ไม่มีข้อมูลเก่า (เพิ่งเจอกันครั้งแรก หรือคุยเรื่องใหม่ได้เลย)"
    );

    // 3. เชื่อมต่อ WebSocket กับ Gemini
    this.currentSession = await this.ai.live.connect({
      model: LIVE_MODEL,
      callbacks: {
        onopen: () => {
          console.log("Gemini Live Connected");
          if (this.mediaStream) {
            // พอต่อติดปุ๊บ เริ่มส่งเสียงไมค์ไปปั๊บ
            this.handleAudioInput(this.mediaStream);
          }
        },
        onmessage: async (message: LiveServerMessage) => {
          // พอมีข้อความตอบกลับ ให้จัดการ
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
        responseModalities: [Modality.AUDIO], // ขอคำตอบเป็นเสียง
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }, // เสียง Kore (นุ่มนวล)
        },
        systemInstruction: { parts: [{ text: finalInstruction }] },
        // เปิดระบบแปลงเสียงเป็นตัวหนังสือ (Transcription) ทั้งขาเข้าและออก
        inputAudioTranscription: {}, 
        outputAudioTranscription: {}, 
      },
    });
  }

  // --- จัดการไมโครโฟน (Input) ---
  private handleAudioInput(stream: MediaStream) {
    if (!this.inputAudioContext) return;

    // แปลง Stream จากไมค์เป็นข้อมูลดิจิตอล
    const source = this.inputAudioContext.createMediaStreamSource(stream);
    const scriptProcessor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);
    
    // ฟังก์ชันนี้จะถูกเรียกซ้ำๆ ทุกๆ เสี้ยววินาที เมื่อมีเสียงเข้ามา
    scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
      if (!this.currentSession) return;

      const inputData = audioProcessingEvent.inputBuffer.getChannelData(0); // ข้อมูลเสียงดิบ (PCM)
      
      // คำนวณความดัง (RMS) เพื่อเอาไปทำ Visualizer
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);
      const boostedVolume = Math.min(1, rms * 10); // คูณ 10 ให้กราฟิกขยับชัดๆ
      
      this.onVolumeUpdate(boostedVolume, true); // true = User speaking

      // แปลงข้อมูลเสียงส่งไปให้ AI
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

  // --- จัดการเสียงตอบกลับ (Output) ---
  private async handleServerMessage(message: LiveServerMessage) {
    // 1. ถ้ามีข้อมูลเสียงส่งมา (AI พูด)
    const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
    if (base64Audio && this.outputAudioContext && this.outputNode) {
        this.onVolumeUpdate(0.5, false); // ขยับ Visualizer ฝั่ง AI
        
        // เทคนิคการเล่นเสียงให้ต่อเนื่อง (Buffering)
        // ถ้าเวลาปัจจุบันเลยเวลาที่กำหนดไว้ ให้รีเซ็ตเวลาใหม่ (กันเสียงขาด)
        if (this.nextStartTime < this.outputAudioContext.currentTime) {
             this.nextStartTime = this.outputAudioContext.currentTime;
        }
        
        const audioBytes = base64ToUint8Array(base64Audio);
        const audioBuffer = await decodeAudioData(audioBytes, this.outputAudioContext, 24000, 1);
        
        // สร้าง Source เพื่อเล่นเสียง
        const source = this.outputAudioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.outputNode);
        source.addEventListener('ended', () => {
            this.sources.delete(source); // เล่นจบแล้วลบทิ้ง
        });
        
        // เล่นเสียงต่อจากเสียงที่แล้ว (Queuing)
        source.start(this.nextStartTime);
        this.nextStartTime += audioBuffer.duration;
        this.sources.add(source);
    }

    // 2. ถ้า AI โดนขัดจังหวะ (Interruption) เช่น User พูดแทรก
    if (message.serverContent?.interrupted) {
      // หยุดเสียงทั้งหมดทันที
      this.sources.forEach(src => {
        try { src.stop(); } catch(e) {}
      });
      this.sources.clear();
      if (this.outputAudioContext) {
        this.nextStartTime = this.outputAudioContext.currentTime;
      }
    }

    // 3. จัดการข้อความตัวหนังสือ (Transcript)
    
    // สิ่งที่ AI พูด
    const outputTranscript = message.serverContent?.outputTranscription?.text;
    if (outputTranscript) {
         // (Cleanup Code) ลบอักขระแปลกปลอม เอาเฉพาะภาษาไทย
         const thaiMatch = outputTranscript.match(/[\u0E00-\u0E7F]/);
         if (thaiMatch && thaiMatch.index !== undefined) {
             const cleanText = outputTranscript.substring(thaiMatch.index);
             const superCleanText = cleanText.replace(/\*\*.*?\*\*/g, "").trim(); // ลบ Markdown
             if (superCleanText) {
                 this.onTranscriptUpdate(superCleanText, false);
             }
         }
    }

    // สิ่งที่ User พูด
    const inputTranscript = message.serverContent?.inputTranscription?.text;
    if (inputTranscript) {
        this.onTranscriptUpdate(inputTranscript, true);
    }
  }

  // --- หยุดการสนทนา ---
  async stopLiveSession() {
    this.currentSession = null;

    // ปิดไมค์ (ไฟสีแดงดับ)
    if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
    }

    // หยุดเสียงที่กำลังเล่นอยู่
    this.sources.forEach(s => {
      try { s.stop(); } catch (e) {}
    });
    this.sources.clear();
    
    this.nextStartTime = 0;
  }

  // --- ฟังก์ชันวิเคราะห์ (ใช้ Text Model) ---
  // แยกออกมาไม่เกี่ยวกับ Live API
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
        responseMimeType: "application/json", // บังคับให้ตอบเป็น JSON
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