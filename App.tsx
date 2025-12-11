import React, { useState, useEffect, useRef } from 'react';
import { GeminiService } from './services/geminiService';
import Visualizer from './components/Visualizer';
import { TeacherReport, ChatMessage, SeverityLevel, MoodEntry } from './types';
import { initDB, saveReport, saveMood, getLastMemory } from './utils/db';

// --- Icons (SVGs) ---

// Cute Kawaii Heart (Chubby Version)
const HeartIcon = () => (
  <svg viewBox="0 0 100 100" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Chubby Heart Shape - Adjusted path for maximum cuteness */}
    <path d="M50 88C50 88 12 65 12 40C12 22 26 12 38 14C45 15 50 20 50 20C50 20 55 15 62 14C74 12 88 22 88 40C88 65 50 88 50 88Z" fill="white" stroke="white" strokeWidth="4" strokeLinejoin="round"/>
    
    {/* Cute Face */}
    <circle cx="35" cy="42" r="4.5" fill="#1E293B"/>
    <circle cx="65" cy="42" r="4.5" fill="#1E293B"/>
    
    {/* Smile */}
    <path d="M43 52Q50 58 57 52" stroke="#1E293B" strokeWidth="3" strokeLinecap="round"/>
    
    {/* Cheeks */}
    <circle cx="26" cy="48" r="5" fill="#FECACA" opacity="0.8"/>
    <circle cx="74" cy="48" r="5" fill="#FECACA" opacity="0.8"/>
  </svg>
);

const MicIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="22"/>
  </svg>
);

const StopIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="3" />
  </svg>
);

const LogoutIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);

const TeacherIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
);

const SettingsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const App: React.FC = () => {
  // Application State
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState<string>('');
  const [studentId, setStudentId] = useState<string>('');
  const [step, setStep] = useState<'apikey' | 'login' | 'mood' | 'chat'>('apikey');
  
  // Data State
  const [lastMemory, setLastMemory] = useState<string>('');
  const [selectedMood, setSelectedMood] = useState<MoodEntry['mood'] | null>(null);

  // Chat State
  const [isLive, setIsLive] = useState(false);
  const [volume, setVolume] = useState(0);
  const [speakerSource, setSpeakerSource] = useState<'user' | 'ai'>('user');
  const [transcript, setTranscript] = useState<ChatMessage[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  
  // Teacher/Report State
  const [report, setReport] = useState<TeacherReport | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [showHealingCard, setShowHealingCard] = useState(false);

  // Service Reference
  const geminiServiceRef = useRef<GeminiService | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initialize DB and Check for API Key
  useEffect(() => {
    initDB().catch(e => console.error("DB Init failed", e));
    
    // Check Local Storage for Key
    const storedKey = localStorage.getItem('gemini_api_key');
    if (storedKey) {
      setApiKey(storedKey);
      setStep('login');
    } else {
      setStep('apikey');
    }
  }, []);

  // Initialize Service when API Key is available
  useEffect(() => {
    if (!apiKey) return;

    geminiServiceRef.current = new GeminiService(
      apiKey,
      (text, isUser) => {
        if (!text) return; // Prevent empty updates

        setSpeakerSource(isUser ? 'user' : 'ai');

        setTranscript(prev => {
          const lastMsg = prev[prev.length - 1];
          const role = isUser ? 'user' : 'model';
          
          if (lastMsg && lastMsg.role === role) {
             const newTranscript = [...prev];
             // Append chunk text instead of replacing it
             newTranscript[newTranscript.length - 1].text += text; 
             return newTranscript;
          } else {
             return [...prev, { role, text, timestamp: Date.now() }];
          }
        });
      },
      (vol, isUser) => {
          setVolume(vol);
          setSpeakerSource(isUser ? 'user' : 'ai');
      }
    );
  }, [apiKey]);

  // Auto-scroll transcript
  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript]);

  // Volume decay
  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(() => {
        setVolume(prev => Math.max(0, prev - 0.05));
    }, 50);
    return () => clearInterval(interval);
  }, [isLive]);

  const handleApiKeySubmit = (e: React.FormEvent, key: string) => {
    e.preventDefault();
    if (key.trim().length > 10) {
      localStorage.setItem('gemini_api_key', key.trim());
      setApiKey(key.trim());
      setStep('login');
    } else {
      alert("กรุณากรอก API Key ที่ถูกต้อง");
    }
  };

  const resetApiKey = () => {
    if(confirm("ต้องการเปลี่ยน API Key ใช่หรือไม่?")) {
      localStorage.removeItem('gemini_api_key');
      setApiKey(null);
      setStep('apikey');
      setStudentId('');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (studentId.trim()) {
      // 1. Fetch Memory
      const mem = await getLastMemory(studentId);
      setLastMemory(mem || '');
      
      // 2. Go to Mood Check
      setStep('mood');
    }
  };

  const handleMoodSelect = async (mood: MoodEntry['mood']) => {
      setSelectedMood(mood);
      await saveMood({
          student_id: studentId,
          mood,
          timestamp: Date.now()
      });
      // Delay slightly for animation effect
      setTimeout(() => setStep('chat'), 500);
  };

  const startSession = async () => {
    try {
      if (geminiServiceRef.current) {
        setIsConnecting(true);
        setTranscript([]);
        setReport(null);
        setShowHealingCard(false);
        
        // Pass the last memory context to the AI
        await geminiServiceRef.current.startLiveSession(lastMemory);
        
        setIsLive(true);
        setIsConnecting(false);
      }
    } catch (error) {
      console.error("Failed to start session:", error);
      setIsConnecting(false);
      alert("ขออภัย ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองใหม่ หรือตรวจสอบ API Key");
    }
  };

  const endSession = async () => {
    // 1. Immediate UI update
    setIsLive(false);
    setVolume(0);
    setTranscript([]); 
    
    // 2. Stop Service logic
    if (geminiServiceRef.current) {
      await geminiServiceRef.current.stopLiveSession();
      performAnalysis();
    }
  };

  const performAnalysis = async () => {
    if (!geminiServiceRef.current || transcript.length === 0) return;

    setIsAnalyzing(true);
    try {
      const log = transcript.map(m => `${m.role === 'user' ? 'นักเรียน' : 'AI'}: ${m.text}`).join('\n');
      const result = await geminiServiceRef.current.analyzeConversation(studentId, log);
      setReport(result);
      
      // Save to IndexedDB
      await saveReport(result);
      console.log("Report saved");
      
      // Show Healing Card
      setShowHealingCard(true);

    } catch (e) {
      console.error("Analysis failed", e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // --- Screens ---

  const renderApiKeyInput = () => {
    return (
      <div className="h-screen w-screen flex items-center justify-center p-6 bg-slate-50 relative overflow-hidden animate-fade-in">
        <div className="bg-white p-10 rounded-3xl shadow-2xl w-full max-w-md text-center z-10 border border-slate-100">
          <div className="mb-6 flex justify-center">
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center">
               <span className="text-3xl">🔑</span>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">ตั้งค่า API Key</h1>
          <p className="text-slate-500 mb-6 font-light text-sm">
            โปรดใส่ Gemini API Key เพื่อเริ่มต้นใช้งาน<br/>
            (ข้อมูลจะถูกเก็บในเครื่องของคุณเท่านั้น)
          </p>
          
          <form onSubmit={(e) => handleApiKeySubmit(e, inputKey)} className="space-y-4">
            <input
              type="password"
              placeholder="Paste your API Key here"
              className="w-full px-5 py-4 bg-slate-50 rounded-2xl border border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all text-center text-sm"
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              required
            />
            <button
              type="submit"
              className="w-full bg-slate-800 hover:bg-slate-900 text-white text-lg font-semibold py-4 rounded-2xl transition duration-200 shadow-lg btn-press"
            >
              บันทึกและใช้งาน
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-100">
            <p className="text-xs text-slate-400 mb-2">ยังไม่มี API Key ใช่ไหม?</p>
            <a 
              href="https://aistudio.google.com/app/apikey" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-500 text-sm font-medium hover:underline flex items-center justify-center gap-1"
            >
              รับ API Key จาก Google AI Studio ↗
            </a>
          </div>
        </div>
      </div>
    );
  };

  const renderLogin = () => (
    <div className="h-screen w-screen flex items-center justify-center p-6 bg-slate-50 relative overflow-hidden animate-fade-in">
      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-blue-100 rounded-full opacity-30 blur-3xl translate-x-1/2 -translate-y-1/2"></div>
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-100 rounded-full opacity-30 blur-3xl -translate-x-1/3 translate-y-1/3"></div>

      <div className="bg-white p-10 rounded-3xl shadow-2xl w-full max-w-md text-center animate-slide-up relative z-10 border border-slate-100">
        
        {/* Reset Key Button */}
        <button 
          onClick={resetApiKey}
          className="absolute top-6 right-6 text-slate-300 hover:text-slate-500 transition-colors"
          title="Change API Key"
        >
          <SettingsIcon />
        </button>

        <div className="mb-6 flex justify-center">
          <div className="w-32 h-32 bg-blue-500 rounded-full flex items-center justify-center shadow-lg shadow-blue-200 p-6">
             <HeartIcon />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-slate-800 mb-2 font-display">KooJai</h1>
        <p className="text-slate-500 mb-8 font-light text-base">เพื่อนคู่ใจ ที่พร้อมรับฟังเธอเสมอ</p>
        
        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="text"
            placeholder="รหัสนักเรียน (Student ID)"
            className="w-full px-5 py-4 bg-slate-50 rounded-2xl border border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all text-center text-lg placeholder-slate-400"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            required
          />
          <button
            type="submit"
            className="w-full bg-blue-500 hover:bg-blue-600 text-white text-lg font-semibold py-4 rounded-2xl transition duration-200 shadow-xl shadow-blue-100 btn-press"
          >
            เริ่มใช้งาน
          </button>
        </form>
      </div>
    </div>
  );

  const renderMoodCheckin = () => (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-white p-6 animate-fade-in">
        <h2 className="text-2xl font-bold text-slate-800 mb-2">วันนี้รู้สึกยังไงบ้าง?</h2>
        <p className="text-slate-500 mb-8">บอกให้เรารู้หน่อยนะ</p>

        <div className="grid grid-cols-2 gap-4 w-full max-w-xs">
            {[
                { mood: 'happy', emoji: '😊', label: 'มีความสุข' },
                { mood: 'neutral', emoji: '😐', label: 'เฉยๆ' },
                { mood: 'tired', emoji: '😴', label: 'เหนื่อย' },
                { mood: 'sad', emoji: '😢', label: 'เศร้า' },
                { mood: 'angry', emoji: '😠', label: 'หงุดหงิด' },
            ].map((m) => (
                <button
                    key={m.mood}
                    onClick={() => handleMoodSelect(m.mood as any)}
                    className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-blue-50 rounded-2xl border border-slate-100 hover:border-blue-200 transition-all btn-press shadow-sm"
                >
                    <span className="text-4xl mb-2">{m.emoji}</span>
                    <span className="text-sm text-slate-600 font-medium">{m.label}</span>
                </button>
            ))}
        </div>
    </div>
  );

  const renderActiveSession = () => (
    <div className="h-screen w-screen flex flex-col bg-white relative overflow-hidden animate-fade-in">
      
      {/* Header */}
      <header className="p-4 flex justify-between items-center z-20 absolute top-0 left-0 right-0">
        <div className="flex items-center space-x-3 bg-white/80 backdrop-blur-md px-4 py-2 rounded-full border border-slate-100 shadow-sm">
          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center p-1.5 shadow-sm">
             <HeartIcon />
          </div>
          <div>
            <h2 className="font-bold text-slate-800 text-sm">KooJai</h2>
            <p className="text-xs text-slate-400">ID: {studentId}</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
            <button 
                onClick={() => setShowReport(true)}
                disabled={!report}
                className={`flex items-center space-x-1 px-3 py-2 rounded-full text-xs font-bold transition
                    ${report 
                        ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 cursor-pointer' 
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }
                `}
            >
                <TeacherIcon />
                <span>Report</span>
            </button>

            <button 
                onClick={() => { setStep('login'); setStudentId(''); }}
                className="text-slate-400 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition duration-200"
            >
                <LogoutIcon />
            </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-between w-full h-full pt-20 pb-10">
        
        <div className="w-full text-center z-10 px-6 h-12 flex items-end justify-center">
          {!isLive && !isConnecting && (
             <div className="animate-slide-up">
                <h2 className="text-xl font-semibold text-slate-700">
                   {lastMemory ? "กลับมาคุยกันต่อนะ..." : "สวัสดี... วันนี้เป็นไงบ้าง?"}
                </h2>
                <p className="text-sm font-normal text-slate-400 mt-1">กดปุ่มไมค์เพื่อเริ่มคุยได้เลยนะ</p>
             </div>
          )}
          {isConnecting && (
             <h2 className="text-lg text-slate-500 animate-pulse font-medium">กำลังเชื่อมต่อ...</h2>
          )}
        </div>

        <div className="relative w-full flex-1 flex items-center justify-center min-h-0">
           <Visualizer isActive={isLive} volume={volume} source={speakerSource} />
        </div>

        <div className="w-full flex flex-col items-center justify-end z-20 space-y-6">
            <div className="w-full px-6 h-32 flex flex-col justify-end items-center">
              <div ref={scrollRef} className="w-full max-w-2xl max-h-32 overflow-y-auto no-scrollbar flex flex-col items-center space-y-4 text-center">
                {transcript.length > 0 && isLive ? (
                   <div className="w-full py-2">
                      <span 
                        className={`
                          inline-block px-6 py-4 rounded-3xl text-lg font-medium leading-relaxed
                          transition-all duration-300 shadow-sm border
                          ${transcript[transcript.length-1].role === 'user' 
                            ? 'bg-blue-600 text-white border-blue-500' 
                            : 'bg-white text-slate-700 border-slate-200'}
                        `}
                      >
                        {transcript[transcript.length - 1].text}
                      </span>
                   </div>
                ) : (
                   isLive && !isConnecting && (
                     <p className="text-slate-300 text-lg animate-pulse">...</p>
                   )
                )}
              </div>
            </div>

            <div className="pb-6">
              {!isLive ? (
                <button
                  onClick={startSession}
                  disabled={isConnecting}
                  className={`group flex items-center justify-center w-20 h-20 rounded-full shadow-xl transition-all duration-300 btn-press 
                    ${isConnecting 
                      ? 'bg-slate-100 cursor-not-allowed border-2 border-slate-200' 
                      : 'bg-blue-500 hover:bg-blue-600 hover:scale-110 shadow-blue-200 ring-4 ring-blue-50'}`}
                >
                  {isConnecting ? (
                     <div className="w-6 h-6 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin"></div>
                  ) : (
                    <div className="text-white">
                      <MicIcon />
                    </div>
                  )}
                </button>
              ) : (
                <button
                  onClick={endSession}
                  className="group flex items-center justify-center w-20 h-20 bg-red-500 hover:bg-red-600 rounded-full shadow-xl shadow-red-200 transition-all duration-300 btn-press ring-4 ring-red-50"
                >
                  <div className="text-white group-hover:scale-110 transition-transform">
                    <StopIcon />
                  </div>
                </button>
              )}
            </div>
        </div>
      </main>

      {/* Processing Overlay */}
      {isAnalyzing && (
        <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-50 flex flex-col items-center justify-center animate-fade-in">
          <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin mb-6"></div>
          <h3 className="text-xl font-bold text-slate-800">กำลังบันทึกความทรงจำ...</h3>
          <p className="text-slate-500 mt-2 text-sm">ไว้คุยกันใหม่นะ</p>
        </div>
      )}
    </div>
  );

  const renderHealingCard = () => {
    if (!report || !showHealingCard) return null;
    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-fade-in">
         <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl relative overflow-hidden animate-slide-up">
            {/* Decoration Circles */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white opacity-10 rounded-full translate-y-1/2 -translate-x-1/2"></div>
            
            <div className="relative z-10">
                <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-6 backdrop-blur-md">
                    <span className="text-4xl">💌</span>
                </div>
                <h3 className="text-2xl font-bold text-white mb-4 font-display">ข้อความถึงเธอ</h3>
                <p className="text-white/90 text-lg leading-relaxed font-light italic mb-8">
                  "{report.healing_quote}"
                </p>
                <button 
                  onClick={() => setShowHealingCard(false)}
                  className="bg-white text-blue-600 font-bold py-3 px-8 rounded-full shadow-lg hover:scale-105 transition btn-press"
                >
                  ขอบคุณนะ
                </button>
            </div>
         </div>
      </div>
    );
  };

  const renderTeacherReport = () => {
    if (!report) return null;
    return (
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex justify-center items-center animate-fade-in p-4">
        <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl p-6 md:p-8 animate-slide-up max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
            <div>
               <h3 className="text-xl font-bold text-slate-800">Teacher Report</h3>
               <p className="text-slate-400 text-xs mt-1">ID: {report.student_id}</p>
            </div>
            <button onClick={() => setShowReport(false)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition">✕</button>
          </div>

          <div className="space-y-6">
            <div className={`p-4 rounded-xl flex items-center justify-between
                ${report.severity_level === SeverityLevel.HIGH || report.severity_level === SeverityLevel.CRITICAL ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-green-50 text-green-700 border border-green-100'}
            `}>
                <div>
                   <span className="font-bold text-lg block">{report.severity_level}</span>
                   <span className="text-xs opacity-75">Risk Level</span>
                </div>
                {report.should_notify_teacher && (
                  <span className="bg-white/80 px-3 py-1 rounded-lg text-xs font-bold text-red-600 shadow-sm">⚠️ ALERT</span>
                )}
            </div>
            
            {/* New Memory Field */}
            <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                <p className="text-xs font-bold text-amber-500 uppercase mb-2">Memory for Next Session</p>
                <p className="text-slate-700 text-sm leading-relaxed italic">{report.memory_for_next_session}</p>
            </div>

            <div>
              <p className="text-xs font-bold text-slate-400 uppercase mb-2">Categories</p>
              <div className="flex flex-wrap gap-2">
                {report.problem_category.map((cat, idx) => (
                  <span key={idx} className="bg-slate-100 text-slate-600 px-3 py-1 rounded-lg text-xs font-medium">
                    {cat}
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
               <p className="text-xs font-bold text-slate-400 uppercase mb-2">Summary</p>
               <p className="text-slate-700 text-sm leading-relaxed">{report.summary_for_teacher}</p>
            </div>

            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
               <p className="text-xs font-bold text-blue-400 uppercase mb-2">Recommendation</p>
               <p className="text-slate-700 text-sm leading-relaxed">{report.recommendation_for_teacher}</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {step === 'apikey' && renderApiKeyInput()}
      {step === 'login' && renderLogin()}
      {step === 'mood' && renderMoodCheckin()}
      {step === 'chat' && renderActiveSession()}
      
      {showHealingCard && renderHealingCard()}
      {showReport && report && renderTeacherReport()}
    </>
  );
};

export default App;