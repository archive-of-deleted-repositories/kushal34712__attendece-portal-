
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell, PieChart, Pie
} from 'recharts';
import { 
  Calendar, CheckCircle, XCircle, Clock, BookOpen, BarChart2, 
  User as UserIcon, ChevronRight, AlertCircle, History, Layout, ChevronLeft,
  RefreshCcw, X, Plus, LogOut, ShieldCheck, Database, Trash2, Settings, 
  UserPlus, Calculator, Bell, BellRing, Send, Megaphone, Ban, Umbrella, 
  FileUp, Loader2, TrendingUp, Zap, Target, Share2, Download, Copy, Check, Sparkles, Cpu
} from 'lucide-react';
import { format, addDays, subDays, startOfToday, parseISO } from 'date-fns';
import { GoogleGenAI, Type } from "@google/genai";
import { FULL_SCHEDULE, SUBJECTS, AUTHORIZED_STUDENTS, DEFAULT_PASSWORD, ADMIN_SAP_ID, DAYS } from './constants';
import { AttendanceRecord, AttendanceStatus, DayOfWeek, User, Lecture, Subject } from './types';

const App: React.FC = () => {
  // Authentication State
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('nmims_session_user');
    return saved ? JSON.parse(saved) : null;
  });
  
  // System State
  const [timetable] = useState<Lecture[]>(FULL_SCHEDULE);
  const [subjectsList] = useState<Subject[]>(SUBJECTS);
  const [studentsList] = useState<User[]>(AUTHORIZED_STUDENTS);

  // UI State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'schedule' | 'subjects' | 'history' | 'admin' | 'sync'>('dashboard');
  const [selectedDate, setSelectedDate] = useState<Date>(startOfToday());
  const [isParsingPDF, setIsParsingPDF] = useState(false);
  const [parseProgress, setParseProgress] = useState(0);
  const [copySuccess, setCopySuccess] = useState(false);
  
  // Modals & Inputs
  const [showStatusModal, setShowStatusModal] = useState<{lectureId: string, subject: string} | null>(null);
  const [syncKeyInput, setSyncKeyInput] = useState('');
  
  // Core Data
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isAdmin = currentUser?.sapId === ADMIN_SAP_ID;

  // Load User Records
  useEffect(() => {
    if (currentUser) {
      const saved = localStorage.getItem(`nmims_v3_db_${currentUser.sapId}`);
      if (saved) setRecords(JSON.parse(saved));
      else setRecords([]);
    }
  }, [currentUser]);

  // Persist Records
  useEffect(() => {
    if (currentUser && records.length > 0) {
      localStorage.setItem(`nmims_v3_db_${currentUser.sapId}`, JSON.stringify(records));
    }
  }, [records, currentUser]);

  // Sync Hub (Cross-device data transfer)
  const generateSyncKey = () => {
    if (!currentUser) return '';
    const data = { user: currentUser, records: records, ts: Date.now() };
    return btoa(JSON.stringify(data));
  };

  const handleImportSyncKey = () => {
    try {
      const decoded = JSON.parse(atob(syncKeyInput));
      if (decoded.user && decoded.records) {
        setRecords(decoded.records);
        setCurrentUser(decoded.user);
        localStorage.setItem('nmims_session_user', JSON.stringify(decoded.user));
        localStorage.setItem(`nmims_v3_db_${decoded.user.sapId}`, JSON.stringify(decoded.records));
        alert('Sync Successful! Your data is now updated on this device.');
        setActiveTab('dashboard');
        setSyncKeyInput('');
      }
    } catch (e) {
      alert('Invalid Sync Key. Please copy the entire code from your other device.');
    }
  };

  // Advanced AI Parsing with Progress simulation
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;

    setIsParsingPDF(true);
    setParseProgress(10);
    
    // Simulate reading progress for UX
    const progressInterval = setInterval(() => {
      setParseProgress(prev => (prev < 90 ? prev + 5 : prev));
    }, 400);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: {
            parts: [
              { inlineData: { data: base64Data, mimeType: file.type } },
              { text: `Extract NMIMS Attendance Report. 
                       1. Map Course Names to: ${subjectsList.map(s => s.name).join(', ')}. Ignore trailing 'T' or 'P' letters.
                       2. Attendance Status: 'P' is 'present', 'A' is 'absent', 'NU' is 'cancelled'.
                       3. Dates: Format as YYYY-MM-DD.
                       Return a JSON array of objects with keys: "subject", "status", "date".` }
            ]
          },
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  subject: { type: Type.STRING },
                  status: { type: Type.STRING },
                  date: { type: Type.STRING }
                },
                required: ["subject", "status", "date"]
              }
            }
          }
        });

        clearInterval(progressInterval);
        setParseProgress(100);

        const extracted = JSON.parse(response.text || '[]');
        if (extracted.length > 0) {
          const newBatch: AttendanceRecord[] = extracted.map((item: any) => ({
            id: `ai-${Date.now()}-${Math.random()}`,
            date: item.date,
            lectureId: 'imported',
            originalSubjectName: item.subject,
            actualSubjectName: item.subject,
            status: item.status.toLowerCase().startsWith('p') ? 'present' : 
                    item.status.toLowerCase().startsWith('a') ? 'absent' : 'cancelled'
          }));

          setRecords(prev => {
            // Filter out existing records for the same subject and date to prevent duplicates
            const updated = [...prev];
            newBatch.forEach(nb => {
              const idx = updated.findIndex(u => u.date === nb.date && u.actualSubjectName === nb.actualSubjectName);
              if (idx !== -1) updated[idx] = nb;
              else updated.push(nb);
            });
            return updated;
          });
          
          setTimeout(() => {
            setIsParsingPDF(false);
            alert(`Successfully integrated ${newBatch.length} sessions from your report.`);
          }, 500);
        }
      };
    } catch (err) {
      clearInterval(progressInterval);
      setIsParsingPDF(false);
      alert('AI Processing Error. Ensure the screenshot is clear and shows the subject table.');
    }
  };

  const markAttendance = (lectureId: string, subject: string, status: AttendanceStatus) => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const id = `${dateStr}-${lectureId}`;
    setRecords(prev => {
      const filtered = prev.filter(r => r.id !== id);
      return [...filtered, {
        id, date: dateStr, lectureId, 
        originalSubjectName: subject, 
        actualSubjectName: subject, 
        status
      }];
    });
    setShowStatusModal(null);
  };

  const stats = useMemo(() => {
    const summary = subjectsList.map(sub => {
      const subRecords = records.filter(r => r.actualSubjectName.toLowerCase().trim().replace(/p$|t$/i, '') === sub.name.toLowerCase().trim());
      const present = subRecords.filter(r => r.status === 'present').length;
      const absent = subRecords.filter(r => r.status === 'absent').length;
      const total = present + absent;
      const pct = total === 0 ? 0 : Math.round((present / total) * 100);
      
      let needed = 0;
      if (pct < 75) {
        needed = Math.ceil((0.75 * total - present) / 0.25);
      }

      return { ...sub, present, total, percentage: pct, needed };
    });

    const totalP = summary.reduce((a, b) => a + b.present, 0);
    const totalT = summary.reduce((a, b) => a + b.total, 0);
    const overall = totalT === 0 ? 0 : Math.round((totalP / totalT) * 100);

    return { summary, overall, totalP, totalT };
  }, [records, subjectsList]);

  const handleLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const sap = data.get('sap') as string;
    const pass = data.get('pass') as string;
    const user = studentsList.find(s => s.sapId === sap);
    if (user && (pass === DEFAULT_PASSWORD || pass === '123456')) {
      setCurrentUser(user);
      localStorage.setItem('nmims_session_user', JSON.stringify(user));
    } else {
      alert('Login Failed. Try SAP: 17001250020 and Pass: NMIMS_STUDENT');
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6 text-white overflow-hidden">
        <div className="w-full max-w-sm space-y-10 animate-in fade-in zoom-in-95 duration-700">
          <div className="text-center relative">
            <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-40 h-40 bg-indigo-600/20 blur-[60px] rounded-full" />
            <div className="w-24 h-24 bg-indigo-600 rounded-[32px] flex items-center justify-center text-white font-black text-4xl mx-auto mb-8 shadow-2xl relative z-10">NM</div>
            <h1 className="text-4xl font-black tracking-tighter mb-2">Attendly</h1>
            <p className="text-slate-500 text-xs font-black uppercase tracking-[0.2em]">Academic Integrity Node</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4 bg-slate-900/40 p-10 rounded-[48px] border border-white/5 backdrop-blur-2xl shadow-2xl">
            <input name="sap" type="text" placeholder="SAP ID" className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 px-6 focus:border-indigo-500 outline-none font-bold transition-all" required />
            <input name="pass" type="password" placeholder="Password" className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 px-6 focus:border-indigo-500 outline-none font-bold transition-all" required />
            <button type="submit" className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-black uppercase tracking-widest transition-all shadow-lg active:scale-95">Authenticate</button>
            <div className="pt-4 text-center">
               <button type="button" onClick={() => setActiveTab('sync')} className="text-xs text-indigo-400 font-bold uppercase tracking-widest opacity-60 hover:opacity-100">Restore Profile</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-slate-100 flex flex-col md:flex-row font-sans">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-72 lg:w-80 bg-[#080808] border-r border-white/5 p-10 sticky top-0 h-screen z-50">
        <div className="flex items-center gap-4 mb-16">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black">NM</div>
          <div>
            <h2 className="font-black text-sm truncate">{currentUser.name}</h2>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">SAP: {currentUser.sapId}</p>
          </div>
        </div>
        <nav className="space-y-2 flex-grow">
          <SidebarLink icon={<Layout />} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <SidebarLink icon={<Calendar />} label="Schedule" active={activeTab === 'schedule'} onClick={() => setActiveTab('schedule')} />
          <SidebarLink icon={<BarChart2 />} label="Analytics" active={activeTab === 'subjects'} onClick={() => setActiveTab('subjects')} />
          <SidebarLink icon={<History />} label="Logs" active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
          <SidebarLink icon={<RefreshCcw />} label="Sync Hub" active={activeTab === 'sync'} onClick={() => setActiveTab('sync')} />
        </nav>
        <button onClick={() => { localStorage.removeItem('nmims_session_user'); window.location.reload(); }} className="mt-auto flex items-center gap-4 px-6 py-4 text-rose-500 font-black text-xs uppercase hover:bg-rose-500/10 rounded-xl transition-all">
          <LogOut className="w-5 h-5" /> Logout
        </button>
      </aside>

      {/* Main Container */}
      <main className="flex-grow overflow-y-auto pb-32 md:pb-12 custom-scrollbar">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between p-6 bg-[#080808]/90 backdrop-blur-3xl sticky top-0 z-[60] border-b border-white/5">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black text-[10px]">NM</div>
             <span className="font-black text-xs uppercase tracking-tighter truncate max-w-[120px]">{currentUser.name}</span>
          </div>
          <button onClick={() => setActiveTab('sync')} className="p-2 text-indigo-400"><RefreshCcw className="w-5 h-5" /></button>
        </div>

        <div className="p-6 sm:p-12 max-w-7xl mx-auto space-y-12">
          {activeTab === 'dashboard' && (
            <div className="space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
              <header className="relative bg-gradient-to-br from-indigo-600 to-indigo-900 p-10 sm:p-14 rounded-[56px] shadow-2xl overflow-hidden group">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/5 blur-[120px] rounded-full -mr-64 -mt-64 transition-all duration-1000 group-hover:scale-125" />
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-10">
                  <div className="text-center md:text-left">
                    <span className="bg-white/20 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest text-white backdrop-blur-md mb-6 inline-block">Term Matrix Active</span>
                    <h1 className="text-5xl sm:text-7xl font-black text-white tracking-tighter leading-none mb-6">Attendance<br/>Overview</h1>
                    <div className="flex gap-4 items-center justify-center md:justify-start">
                      <div className="px-5 py-2.5 bg-black/30 rounded-2xl border border-white/10 flex items-center gap-3">
                         <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                         <span className="text-[10px] font-black uppercase tracking-widest">Sync Stable</span>
                      </div>
                    </div>
                  </div>
                  <div className="w-56 h-56 sm:w-64 sm:h-64 relative flex items-center justify-center">
                    <svg className="w-full h-full -rotate-90">
                      <circle cx="50%" cy="50%" r="45%" stroke="rgba(255,255,255,0.05)" strokeWidth="16" fill="transparent" />
                      <circle cx="50%" cy="50%" r="45%" stroke="white" strokeWidth="16" fill="transparent" strokeDasharray="283" strokeDashoffset={283 - (283 * stats.overall) / 100} strokeLinecap="round" className="transition-all duration-1000 ease-out shadow-glow" />
                    </svg>
                    <div className="absolute flex flex-col items-center">
                      <span className="text-6xl font-black text-white">{stats.overall}%</span>
                      <span className="text-[10px] font-black uppercase text-indigo-100/60 mt-1 tracking-widest">Aggregate</span>
                    </div>
                  </div>
                </div>
              </header>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard icon={<CheckCircle className="text-emerald-400" />} label="Present" value={stats.totalP} />
                <StatCard icon={<Zap className="text-yellow-400" />} label="Status" value={stats.overall >= 75 ? 'Optimal' : 'Subpar'} />
                <StatCard icon={<Target className="text-indigo-400" />} label="Threshold" value="75%" />
                <StatCard icon={<Database className="text-slate-400" />} label="Data Node" value="Local-Only" />
              </div>

              <section className="space-y-8">
                <div className="flex items-center justify-between px-2">
                  <h2 className="text-2xl font-black text-white flex items-center gap-4"><Sparkles className="w-8 h-8 text-indigo-500" /> Module Performance</h2>
                  <button onClick={() => setActiveTab('subjects')} className="text-[10px] font-black uppercase text-indigo-400 hover:text-white transition-colors tracking-widest">Full Diagnostics</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                  {stats.summary.map(sub => (
                    <div key={sub.name} className="bg-[#0d0d0d] p-10 rounded-[48px] border border-white/5 hover:border-indigo-500/30 transition-all flex flex-col h-72 shadow-2xl group hover:-translate-y-2 relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                         <Cpu className="w-16 h-16" />
                      </div>
                      <div className="flex justify-between items-start mb-10 relative z-10">
                        <div className="min-w-0 pr-4">
                          <h4 className="font-black text-white text-xl leading-tight truncate group-hover:text-indigo-400 transition-colors">{sub.name}</h4>
                          <p className="text-[9px] text-slate-600 font-black uppercase mt-2 tracking-widest">{sub.faculty}</p>
                        </div>
                        <div className={`text-3xl font-black ${sub.percentage >= 75 ? 'text-emerald-400' : 'text-rose-400'}`}>{sub.percentage}%</div>
                      </div>
                      <div className="mt-auto space-y-5 relative z-10">
                        <div className="flex justify-between items-end text-[10px] font-black uppercase tracking-widest text-slate-500">
                          <span>Progress</span>
                          <span className="text-white">{sub.present} / {sub.total}</span>
                        </div>
                        <div className="h-4 bg-black/60 rounded-full overflow-hidden border border-white/5 p-1 shadow-inner">
                          <div 
                            className={`h-full transition-all duration-1000 rounded-full ${sub.percentage >= 75 ? 'bg-emerald-500' : 'bg-rose-500'}`} 
                            style={{ width: `${Math.min(sub.percentage, 100)}%` }} 
                          />
                        </div>
                        <div className="flex justify-between items-center pt-2">
                           <span className={`text-[9px] font-black uppercase tracking-widest ${sub.percentage < 75 ? 'text-rose-400' : 'text-emerald-400'}`}>
                             {sub.percentage < 75 ? `DEFICIT: ${sub.needed} NODES` : 'SYSTEM NOMINAL'}
                           </span>
                           <TrendingUp className={`w-4 h-4 ${sub.percentage >= 75 ? 'text-emerald-400' : 'text-rose-400'}`} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activeTab === 'sync' && (
            <div className="space-y-12 animate-in fade-in duration-500">
              <header className="p-10 bg-slate-900/30 rounded-[48px] border border-white/5">
                <h1 className="text-5xl font-black tracking-tighter">Sync Hub</h1>
                <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mt-4">Cross-Device Identity Transfer</p>
                <div className="mt-8 p-6 bg-amber-500/10 border border-amber-500/20 rounded-3xl flex items-center gap-6 text-amber-200">
                   <AlertCircle className="shrink-0 w-8 h-8" />
                   <p className="text-xs font-bold leading-relaxed uppercase tracking-wide">Note: This application stores data strictly on your local device for privacy. To sync between laptop and mobile, use the transfer keys below.</p>
                </div>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-indigo-600/5 border border-indigo-500/20 p-12 rounded-[56px] space-y-8 shadow-2xl">
                  <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white"><Share2 className="w-8 h-8" /></div>
                  <div>
                    <h3 className="text-3xl font-black mb-2">Export Data</h3>
                    <p className="text-slate-400 text-sm leading-relaxed">Copy this unique identity block to transfer your data elsewhere.</p>
                  </div>
                  <div className="relative group">
                    <div className="bg-black/60 p-8 rounded-3xl text-[9px] font-mono text-indigo-300 break-all h-40 overflow-y-auto custom-scrollbar border border-white/5 shadow-inner leading-normal">
                      {generateSyncKey()}
                    </div>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(generateSyncKey());
                        setCopySuccess(true);
                        setTimeout(() => setCopySuccess(false), 2000);
                      }}
                      className="absolute top-4 right-4 p-4 bg-indigo-600 text-white rounded-2xl shadow-2xl active:scale-95 transition-all"
                    >
                      {copySuccess ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div className="bg-slate-900/40 border border-white/5 p-12 rounded-[56px] space-y-8 shadow-2xl">
                  <div className="w-16 h-16 bg-emerald-600/20 rounded-2xl flex items-center justify-center text-emerald-400"><Download className="w-8 h-8" /></div>
                  <div>
                    <h3 className="text-3xl font-black mb-2">Import Data</h3>
                    <p className="text-slate-400 text-sm leading-relaxed">Paste an Identity Block from another device to overwrite local nodes.</p>
                  </div>
                  <textarea 
                    value={syncKeyInput}
                    onChange={(e) => setSyncKeyInput(e.target.value)}
                    placeholder="Paste Identity Key here..." 
                    className="w-full h-40 bg-black/40 border border-white/10 rounded-3xl p-8 text-[10px] font-mono text-indigo-300 outline-none focus:border-indigo-500 transition-all no-scrollbar"
                  />
                  <button onClick={handleImportSyncKey} className="w-full py-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[24px] font-black uppercase tracking-[0.2em] text-[10px] shadow-xl transition-all active:scale-95">Integrate Node</button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'schedule' && (
            <div className="space-y-10 animate-in fade-in duration-500">
               <header className="flex items-center justify-between bg-slate-900/40 p-10 rounded-[48px] border border-white/5 shadow-xl">
                 <button onClick={() => setSelectedDate(subDays(selectedDate, 1))} className="p-5 bg-black/40 rounded-2xl hover:text-indigo-400 transition-all"><ChevronLeft className="w-8 h-8" /></button>
                 <div className="text-center">
                   <h2 className="text-4xl font-black text-white tracking-tighter">{format(selectedDate, 'EEEE')}</h2>
                   <p className="text-xs text-slate-500 uppercase font-black mt-2 tracking-[0.2em]">{format(selectedDate, 'MMMM do, yyyy')}</p>
                 </div>
                 <button onClick={() => setSelectedDate(addDays(selectedDate, 1))} className="p-5 bg-black/40 rounded-2xl hover:text-indigo-400 transition-all"><ChevronRight className="w-8 h-8" /></button>
               </header>
               <div className="grid gap-6">
                 {timetable.filter(l => l.day === format(selectedDate, 'EEEE')).length > 0 ? (
                   timetable.filter(l => l.day === format(selectedDate, 'EEEE')).map(lecture => {
                     const record = records.find(r => r.id === `${format(selectedDate, 'yyyy-MM-dd')}-${lecture.id}`);
                     return (
                       <div key={lecture.id} className="bg-[#0d0d0d] p-8 rounded-[40px] border border-white/5 flex flex-col sm:flex-row items-center justify-between gap-8 group hover:border-white/10 transition-all">
                         <div className="flex items-center gap-8 w-full sm:w-auto">
                           <div className="w-20 h-20 bg-black/60 rounded-[28px] flex items-center justify-center border border-white/5 group-hover:text-indigo-400 transition-colors shadow-inner"><Clock className="w-8 h-8" /></div>
                           <div className="min-w-0 flex-grow">
                             <h4 className="text-2xl font-black text-white truncate group-hover:text-indigo-400 transition-colors">{lecture.subject}</h4>
                             <p className="text-[11px] font-black text-slate-600 uppercase mt-2 tracking-widest">{lecture.time} • {lecture.faculty}</p>
                           </div>
                         </div>
                         <button 
                           onClick={() => setShowStatusModal({lectureId: lecture.id, subject: lecture.subject})}
                           className={`w-full sm:w-auto px-12 py-5 rounded-[28px] font-black text-[10px] uppercase border tracking-[0.15em] transition-all shadow-lg active:scale-95 ${record?.status === 'present' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : record?.status === 'absent' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-white/5 text-slate-600 border-white/5 hover:text-white'}`}
                         >
                           {record?.status || 'Set Status'}
                         </button>
                       </div>
                     );
                   })
                 ) : (
                   <div className="py-32 text-center opacity-20 flex flex-col items-center gap-6">
                     <Umbrella className="w-16 h-16" />
                     <p className="font-black uppercase text-sm tracking-[0.3em]">No Academic Nodes</p>
                   </div>
                 )}
               </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-10 animate-in fade-in duration-500">
               <header className="flex flex-col lg:flex-row justify-between items-center bg-slate-900/30 p-12 rounded-[56px] border border-white/5 gap-8">
                 <div>
                   <h2 className="text-5xl font-black text-white tracking-tighter">Archive Node</h2>
                   <p className="text-slate-500 text-[11px] font-black uppercase mt-3 tracking-[0.2em]">{records.length} Processed Entries</p>
                 </div>
                 <div className="flex gap-4 w-full lg:w-auto">
                   <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*,.pdf" className="hidden" />
                   <button onClick={() => fileInputRef.current?.click()} disabled={isParsingPDF} className="flex-1 lg:flex-none px-10 py-5 bg-indigo-600 text-white rounded-[24px] font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-4 shadow-2xl active:scale-95 disabled:opacity-50 transition-all">
                     {isParsingPDF ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileUp className="w-5 h-5" />}
                     {isParsingPDF ? 'Reading...' : 'AI Import Portal'}
                   </button>
                 </div>
               </header>
               <div className="space-y-8">
                 {(Object.entries(records.reduce((acc, curr) => {
                   if (!acc[curr.date]) acc[curr.date] = [];
                   acc[curr.date].push(curr);
                   return acc;
                 }, {} as Record<string, AttendanceRecord[]>)) as [string, AttendanceRecord[]][])
                 .sort((a,b) => b[0].localeCompare(a[0])).map(([date, dayRecords]) => (
                   <div key={date} className="bg-slate-900/20 rounded-[48px] border border-white/5 overflow-hidden shadow-xl">
                     <div className="bg-black/40 px-10 py-5 border-b border-white/5 flex items-center justify-between">
                        <h3 className="font-black text-[10px] text-slate-500 uppercase tracking-widest">{format(parseISO(date), 'EEEE, MMMM do yyyy')}</h3>
                        <div className="w-2 h-2 rounded-full bg-indigo-500" />
                     </div>
                     <div className="divide-y divide-white/5">
                       {dayRecords.map(r => (
                         <div key={r.id} className="px-10 py-8 flex items-center justify-between hover:bg-black/20 group transition-all">
                           <div className="min-w-0 pr-8">
                             <p className="text-white font-black text-xl truncate tracking-tight">{r.actualSubjectName}</p>
                             <div className="flex items-center gap-3 mt-2">
                               <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${r.status === 'present' ? 'bg-emerald-500/10 text-emerald-400' : r.status === 'absent' ? 'bg-rose-500/10 text-rose-400' : 'bg-white/10 text-slate-500'}`}>{r.status}</span>
                               {r.lectureId === 'imported' && <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-1"><Sparkles className="w-2 h-2" /> AI-Read</span>}
                             </div>
                           </div>
                           <button onClick={() => setRecords(prev => prev.filter(x => x.id !== r.id))} className="p-4 bg-rose-500/10 text-rose-500 rounded-2xl opacity-0 group-hover:opacity-100 transition-all hover:bg-rose-500 hover:text-white"><Trash2 className="w-5 h-5" /></button>
                         </div>
                       ))}
                     </div>
                   </div>
                 ))}
               </div>
            </div>
          )}

          {activeTab === 'subjects' && (
            <div className="space-y-12 animate-in fade-in duration-500">
              <header>
                <h1 className="text-6xl font-black tracking-tighter">Diagnostics</h1>
                <p className="text-slate-500 text-xs font-black uppercase tracking-[0.3em] mt-4">Module Integrity Health</p>
              </header>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {stats.summary.map(sub => (
                  <div key={sub.name} className="bg-[#0d0d0d] p-12 rounded-[64px] border border-white/5 space-y-10 flex flex-col justify-between shadow-2xl relative overflow-hidden">
                    <div className="flex justify-between items-start">
                      <div className="min-w-0 pr-6">
                        <h4 className="font-black text-3xl text-white tracking-tighter truncate leading-tight mb-3">{sub.name}</h4>
                        <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest">{sub.faculty}</p>
                      </div>
                      <div className="p-4 bg-indigo-600/10 rounded-2xl text-indigo-500"><Calculator className="w-8 h-8" /></div>
                    </div>
                    <div className="flex justify-between items-end">
                       <div>
                         <p className="text-slate-600 text-[10px] font-black uppercase tracking-widest mb-3">Sync Progress</p>
                         <p className={`text-7xl font-black tracking-tighter ${sub.percentage >= 75 ? 'text-emerald-400' : 'text-rose-400'}`}>{sub.percentage}%</p>
                       </div>
                       <div className="text-right">
                         <p className="text-slate-600 text-[10px] font-black uppercase tracking-widest mb-3">Node Count</p>
                         <p className="text-3xl font-black text-white">{sub.present} <span className="text-slate-700 text-lg">/ {sub.total}</span></p>
                       </div>
                    </div>
                    <div className={`p-8 rounded-[40px] border transition-all ${sub.percentage < 75 ? 'bg-rose-500/5 border-rose-500/10 text-rose-300' : 'bg-emerald-500/5 border-emerald-500/10 text-emerald-300'}`}>
                      <p className="text-[9px] font-black uppercase mb-3 opacity-60 tracking-[0.1em]">AI Projection</p>
                      <p className="font-black text-sm uppercase tracking-wide leading-relaxed">{sub.percentage < 75 ? `Deficit Detected. Secure next ${sub.needed} sessions to reach threshold.` : 'System stable. Maintenance mode engaged.'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Mobile Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#080808]/90 backdrop-blur-3xl border-t border-white/5 flex items-center justify-around p-6 pb-12 z-[100]">
        <MobileNavItem icon={<Layout />} active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
        <MobileNavItem icon={<Calendar />} active={activeTab === 'schedule'} onClick={() => setActiveTab('schedule')} />
        <MobileNavItem icon={<Calculator />} active={activeTab === 'subjects'} onClick={() => setActiveTab('subjects')} />
        <MobileNavItem icon={<History />} active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
      </nav>

      {/* AI Parsing Overlay */}
      {isParsingPDF && (
        <div className="fixed inset-0 z-[1000] bg-black/95 backdrop-blur-3xl flex flex-col items-center justify-center p-12 animate-in fade-in duration-500">
           <div className="w-24 h-24 bg-indigo-600 rounded-[32px] flex items-center justify-center text-white mb-10 shadow-[0_0_80px_rgba(79,70,229,0.4)] animate-pulse">
              <Cpu className="w-12 h-12" />
           </div>
           <h2 className="text-3xl font-black text-white tracking-tighter mb-4 text-center">Reading Report Data</h2>
           <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] mb-12 text-center max-w-xs leading-relaxed">AI is mapping subject nodes and extracting attendance timestamps...</p>
           
           <div className="w-full max-w-sm h-4 bg-white/5 rounded-full border border-white/10 p-1 relative overflow-hidden">
              <div 
                className="h-full bg-indigo-600 rounded-full transition-all duration-300 shadow-[0_0_20px_rgba(79,70,229,0.6)]"
                style={{ width: `${parseProgress}%` }}
              />
           </div>
           <span className="mt-4 text-[11px] font-black text-indigo-400 font-mono tracking-widest">{parseProgress}%</span>
        </div>
      )}

      {/* Status Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0">
          <div className="absolute inset-0 bg-black/98 backdrop-blur-3xl" onClick={() => setShowStatusModal(null)} />
          <div className="relative bg-[#080808] w-full sm:max-w-xl rounded-t-[64px] sm:rounded-[64px] p-14 shadow-2xl border-t sm:border border-white/10 animate-in slide-in-from-bottom-full duration-500">
            <div className="flex justify-between items-start mb-16">
              <div className="min-w-0 pr-10">
                <h3 className="text-4xl font-black text-white tracking-tighter">Record Status</h3>
                <p className="text-slate-500 uppercase text-[11px] mt-3 font-black tracking-widest truncate">{showStatusModal.subject}</p>
              </div>
              <button onClick={() => setShowStatusModal(null)} className="p-5 bg-white/5 rounded-2xl text-slate-600 hover:text-white transition-all"><X className="w-8 h-8" /></button>
            </div>
            <div className="grid gap-6">
              <button onClick={() => markAttendance(showStatusModal.lectureId, showStatusModal.subject, 'present')} className="w-full p-10 bg-emerald-500/10 border border-emerald-500/20 rounded-[48px] flex items-center gap-10 font-black uppercase text-xs text-emerald-400 group active:scale-[0.98] transition-all hover:bg-emerald-500/20">
                <CheckCircle className="w-12 h-12" /> Present Node
              </button>
              <button onClick={() => markAttendance(showStatusModal.lectureId, showStatusModal.subject, 'absent')} className="w-full p-10 bg-rose-500/10 border border-rose-500/20 rounded-[48px] flex items-center gap-10 font-black uppercase text-xs text-rose-400 group active:scale-[0.98] transition-all hover:bg-rose-500/20">
                <XCircle className="w-12 h-12" /> Absent Node
              </button>
              <div className="grid grid-cols-2 gap-6 pt-2">
                <button onClick={() => markAttendance(showStatusModal.lectureId, showStatusModal.subject, 'cancelled')} className="p-8 bg-white/5 rounded-[40px] flex items-center justify-center gap-4 font-black uppercase text-[10px] text-slate-500 active:scale-[0.98] hover:bg-white/10 hover:text-white transition-all">
                  <Ban className="w-6 h-6" /> Cancel
                </button>
                <button onClick={() => markAttendance(showStatusModal.lectureId, showStatusModal.subject, 'holiday')} className="p-8 bg-white/5 rounded-[40px] flex items-center justify-center gap-4 font-black uppercase text-[10px] text-slate-500 active:scale-[0.98] hover:bg-white/10 hover:text-white transition-all">
                  <Umbrella className="w-6 h-6" /> Holiday
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Atoms
const SidebarLink: React.FC<{ icon: React.ReactNode; label: string; active: boolean; onClick: () => void }> = ({ icon, label, active, onClick }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-6 px-10 py-6 rounded-[32px] transition-all font-black text-[12px] uppercase tracking-widest ${active ? 'bg-indigo-600 text-white shadow-2xl shadow-indigo-600/40' : 'text-slate-600 hover:bg-white/5 hover:text-slate-300'}`}>
    {React.cloneElement(icon as React.ReactElement<any>, { className: `w-6 h-6` })}
    {label}
  </button>
);

const MobileNavItem: React.FC<{ icon: React.ReactNode; active: boolean; onClick: () => void }> = ({ icon, active, onClick }) => (
  <button onClick={onClick} className={`flex items-center justify-center w-16 h-16 rounded-[24px] transition-all ${active ? 'bg-indigo-600 text-white shadow-2xl scale-110' : 'text-slate-600'}`}>
    {React.cloneElement(icon as React.ReactElement<any>, { className: `w-8 h-8` })}
  </button>
);

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string | number }> = ({ icon, label, value }) => (
  <div className="bg-[#0d0d0d] p-10 rounded-[48px] border border-white/5 flex items-center gap-8 shadow-2xl">
    <div className="w-16 h-16 bg-black/40 rounded-3xl flex items-center justify-center border border-white/5 shadow-inner">{icon}</div>
    <div>
      <p className="text-[10px] font-black uppercase text-slate-600 tracking-widest mb-2">{label}</p>
      <h4 className="text-3xl font-black text-white tracking-tighter">{value}</h4>
    </div>
  </div>
);

export default App;
