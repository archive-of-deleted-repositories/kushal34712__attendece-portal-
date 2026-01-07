
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
  FileUp, Loader2, TrendingUp, Zap, Target, Share2, Download, Copy, Check
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
  const [studentsList, setStudentsList] = useState<User[]>(AUTHORIZED_STUDENTS);

  // UI State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'schedule' | 'subjects' | 'history' | 'admin' | 'sync'>('dashboard');
  const [selectedDate, setSelectedDate] = useState<Date>(startOfToday());
  const [isParsingPDF, setIsParsingPDF] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  
  // Admin & Modals
  const [selectedAdminStudent, setSelectedAdminStudent] = useState<string | null>(null);
  const [showStatusModal, setShowStatusModal] = useState<{lectureId: string, subject: string} | null>(null);
  const [showSyncInput, setShowSyncInput] = useState(false);
  const [syncKeyInput, setSyncKeyInput] = useState('');
  
  // Core Data
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isAdmin = currentUser?.sapId === ADMIN_SAP_ID;

  // Load User Records
  useEffect(() => {
    if (currentUser) {
      const saved = localStorage.getItem(`nmims_v2_db_${currentUser.sapId}`);
      if (saved) setRecords(JSON.parse(saved));
      else setRecords([]);
    }
  }, [currentUser]);

  // Persist Records
  useEffect(() => {
    if (currentUser && records.length > 0) {
      localStorage.setItem(`nmims_v2_db_${currentUser.sapId}`, JSON.stringify(records));
    }
  }, [records, currentUser]);

  // Sync Hub Functions
  const generateSyncKey = () => {
    if (!currentUser) return '';
    const data = {
      user: currentUser,
      records: records,
      timestamp: Date.now()
    };
    return btoa(JSON.stringify(data));
  };

  const handleImportSyncKey = () => {
    try {
      const decoded = JSON.parse(atob(syncKeyInput));
      if (decoded.user && decoded.records) {
        setRecords(decoded.records);
        setCurrentUser(decoded.user);
        localStorage.setItem('nmims_session_user', JSON.stringify(decoded.user));
        localStorage.setItem(`nmims_v2_db_${decoded.user.sapId}`, JSON.stringify(decoded.records));
        alert('Profile Synced Successfully!');
        setShowSyncInput(false);
        setSyncKeyInput('');
      }
    } catch (e) {
      alert('Invalid Sync Key. Please ensure you copied the full code.');
    }
  };

  // Improved AI Parsing
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;

    setIsParsingPDF(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        // Initializing GoogleGenAI client with the required named parameter object.
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        // Using ai.models.generateContent to parse the document using Gemini 3 Flash.
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: {
            parts: [
              { inlineData: { data: base64Data, mimeType: file.type } },
              { text: `Extract NMIMS Attendance. Look for a table with Subject Names and their Attendance Status (Present/P or Absent/A). 
                       Format as a JSON array of objects with keys: "subject", "status" (must be 'present' or 'absent'), and "date" (YYYY-MM-DD). 
                       If date is missing, use "${format(new Date(), 'yyyy-MM-dd')}".` }
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

        const extracted = JSON.parse(response.text || '[]');
        if (extracted.length > 0) {
          const newBatch: AttendanceRecord[] = extracted.map((item: any) => ({
            id: `ai-${Date.now()}-${Math.random()}`,
            date: item.date,
            lectureId: 'imported',
            originalSubjectName: item.subject,
            actualSubjectName: item.subject,
            status: item.status.toLowerCase().includes('p') ? 'present' : 'absent'
          }));

          setRecords(prev => [...prev, ...newBatch]);
          alert(`Imported ${newBatch.length} sessions.`);
        }
      };
    } catch (err) {
      alert('Failed to parse document. Try a clearer image or a direct PDF export.');
    } finally {
      setIsParsingPDF(false);
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
      const subRecords = records.filter(r => r.actualSubjectName.toLowerCase().trim() === sub.name.toLowerCase().trim());
      const present = subRecords.filter(r => r.status === 'present').length;
      const total = subRecords.filter(r => r.status === 'present' || r.status === 'absent').length;
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
    if (user && pass === DEFAULT_PASSWORD) {
      setCurrentUser(user);
      localStorage.setItem('nmims_session_user', JSON.stringify(user));
    } else {
      alert('Invalid SAP ID or Password');
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6 text-white">
        <div className="w-full max-sm space-y-8">
          <div className="text-center">
            <div className="w-20 h-20 bg-indigo-600 rounded-[30px] flex items-center justify-center text-white font-black text-3xl mx-auto mb-6 shadow-[0_0_50px_rgba(79,70,229,0.3)]">NM</div>
            <h1 className="text-3xl font-black tracking-tighter">Attendance Portal</h1>
            <p className="text-slate-500 text-sm mt-2 font-bold uppercase tracking-widest">Authorized Access Only</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4 bg-slate-900/40 p-8 rounded-[40px] border border-white/5 backdrop-blur-xl">
            <input name="sap" type="text" placeholder="SAP ID" className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 px-6 focus:border-indigo-500 outline-none font-bold" required />
            <input name="pass" type="password" placeholder="Password" className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 px-6 focus:border-indigo-500 outline-none font-bold" required />
            <button type="submit" className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-black uppercase tracking-widest transition-all">Authorize</button>
          </form>
          <div className="text-center">
            <button onClick={() => setShowSyncInput(true)} className="text-indigo-400 font-bold text-xs uppercase tracking-widest">Import Existing Profile</button>
          </div>
        </div>
        {showSyncInput && (
          <div className="fixed inset-0 bg-black/95 flex items-center justify-center p-6 z-[200]">
            <div className="w-full max-w-md bg-slate-900 border border-white/10 p-10 rounded-[48px] space-y-6">
              <h2 className="text-2xl font-black">Sync Profile</h2>
              <textarea 
                value={syncKeyInput} 
                onChange={(e) => setSyncKeyInput(e.target.value)}
                placeholder="Paste your Sync Key here..." 
                className="w-full h-48 bg-black/40 border border-white/10 rounded-2xl p-6 text-xs font-mono text-indigo-300 outline-none"
              />
              <div className="flex gap-4">
                <button onClick={() => setShowSyncInput(false)} className="flex-1 py-4 bg-white/5 rounded-2xl font-black uppercase text-xs">Cancel</button>
                <button onClick={handleImportSyncKey} className="flex-1 py-4 bg-indigo-600 rounded-2xl font-black uppercase text-xs">Sync Data</button>
              </div>
            </div>
          </div>
        )}
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
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">ID: {currentUser.sapId}</p>
          </div>
        </div>
        <nav className="space-y-2 flex-grow">
          <SidebarLink icon={<Layout />} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <SidebarLink icon={<Calendar />} label="Schedule" active={activeTab === 'schedule'} onClick={() => setActiveTab('schedule')} />
          <SidebarLink icon={<BarChart2 />} label="Analytics" active={activeTab === 'subjects'} onClick={() => setActiveTab('subjects')} />
          <SidebarLink icon={<History />} label="Logs" active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
          <SidebarLink icon={<RefreshCcw />} label="Sync Hub" active={activeTab === 'sync'} onClick={() => setActiveTab('sync')} />
          {isAdmin && <SidebarLink icon={<ShieldCheck />} label="Admin" active={activeTab === 'admin'} onClick={() => setActiveTab('admin')} />}
        </nav>
        <button onClick={() => { localStorage.removeItem('nmims_session_user'); window.location.reload(); }} className="mt-auto flex items-center gap-4 px-6 py-4 text-rose-500 font-black text-xs uppercase hover:bg-rose-500/10 rounded-xl">
          <LogOut className="w-5 h-5" /> Logout
        </button>
      </aside>

      {/* Main Container */}
      <main className="flex-grow overflow-y-auto pb-32 md:pb-12">
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
              <header className="relative bg-gradient-to-br from-indigo-600 to-violet-700 p-10 sm:p-14 rounded-[48px] shadow-2xl overflow-hidden group">
                <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 blur-[100px] rounded-full -mr-32 -mt-32 transition-all duration-1000 group-hover:scale-125" />
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-10">
                  <div className="text-center md:text-left">
                    <span className="bg-white/20 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest text-white/90 backdrop-blur-md mb-6 inline-block">Real-time Portal</span>
                    <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tighter leading-none mb-4">Term II Matrix</h1>
                    <p className="text-indigo-100/70 font-bold max-w-md">Your subjects are being tracked across all academic nodes.</p>
                  </div>
                  <div className="w-48 h-48 sm:w-56 sm:h-56 relative flex items-center justify-center">
                    <svg className="w-full h-full -rotate-90">
                      <circle cx="50%" cy="50%" r="45%" stroke="rgba(255,255,255,0.1)" strokeWidth="12" fill="transparent" />
                      <circle cx="50%" cy="50%" r="45%" stroke="white" strokeWidth="12" fill="transparent" strokeDasharray="283" strokeDashoffset={283 - (283 * stats.overall) / 100} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
                    </svg>
                    <div className="absolute flex flex-col items-center">
                      <span className="text-5xl font-black text-white">{stats.overall}%</span>
                      <span className="text-[10px] font-black uppercase text-indigo-100/60 mt-1">Total</span>
                    </div>
                  </div>
                </div>
              </header>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard icon={<CheckCircle className="text-emerald-400" />} label="Present" value={stats.totalP} />
                <StatCard icon={<Zap className="text-yellow-400" />} label="Avg Progress" value={`${stats.overall}%`} />
                <StatCard icon={<Target className="text-indigo-400" />} label="Goal" value="75%" />
                <StatCard icon={<AlertCircle className={`text-rose-400 ${stats.overall < 75 ? 'animate-pulse' : ''}`} />} label="Status" value={stats.overall >= 75 ? 'Safe' : 'Critical'} />
              </div>

              <section className="space-y-8">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-black text-white flex items-center gap-4"><BookOpen className="w-8 h-8 text-indigo-500" /> Subject Nodes</h2>
                  <button onClick={() => setActiveTab('subjects')} className="text-xs font-black uppercase text-indigo-400 hover:text-white transition-colors">View All Analytics</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {stats.summary.map(sub => (
                    <div key={sub.name} className="bg-[#0d0d0d] p-8 rounded-[40px] border border-white/5 hover:border-indigo-500/20 transition-all flex flex-col h-64 shadow-xl group hover:-translate-y-2">
                      <div className="flex justify-between items-start mb-6">
                        <div className="min-w-0 pr-4">
                          <h4 className="font-black text-white text-lg leading-tight truncate group-hover:text-indigo-400">{sub.name}</h4>
                          <p className="text-[9px] text-slate-500 font-black uppercase mt-1 tracking-widest">{sub.faculty}</p>
                        </div>
                        <div className={`text-3xl font-black ${sub.percentage >= 75 ? 'text-emerald-400' : 'text-rose-400'}`}>{sub.percentage}%</div>
                      </div>
                      <div className="mt-auto space-y-4">
                        <div className="flex justify-between items-end text-[10px] font-black uppercase tracking-widest text-slate-600">
                          <span>Progress</span>
                          <span>{sub.present} / {sub.total}</span>
                        </div>
                        <div className="h-3 bg-black/40 rounded-full overflow-hidden border border-white/5">
                          <div 
                            className={`h-full transition-all duration-1000 ${sub.percentage >= 75 ? 'bg-emerald-500' : 'bg-rose-500'}`} 
                            style={{ width: `${Math.min(sub.percentage, 100)}%` }} 
                          />
                        </div>
                        <div className="flex justify-between items-center pt-2">
                           <span className={`text-[9px] font-black uppercase tracking-widest ${sub.percentage < 75 ? 'text-rose-400' : 'text-emerald-400'}`}>
                             {sub.percentage < 75 ? `Need ${sub.needed} more` : 'Safe zone'}
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
              <header>
                <h1 className="text-5xl font-black tracking-tighter">Sync Hub</h1>
                <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mt-2">Transfer your profile across devices</p>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-indigo-600/10 border border-indigo-500/20 p-10 rounded-[48px] space-y-6">
                  <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white"><Share2 className="w-7 h-7" /></div>
                  <h3 className="text-2xl font-black">Export Profile</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">Generate a unique Sync Key. Copy this code and paste it on your other device to instantly sync all your attendance data.</p>
                  <div className="relative group">
                    <div className="bg-black/60 p-6 rounded-2xl text-[10px] font-mono text-indigo-300 break-all h-32 overflow-y-auto no-scrollbar border border-white/5">
                      {generateSyncKey()}
                    </div>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(generateSyncKey());
                        setCopySuccess(true);
                        setTimeout(() => setCopySuccess(false), 2000);
                      }}
                      className="absolute top-4 right-4 p-3 bg-indigo-600 text-white rounded-xl shadow-lg active:scale-95 transition-all"
                    >
                      {copySuccess ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="bg-slate-900/40 border border-white/5 p-10 rounded-[48px] space-y-6">
                  <div className="w-14 h-14 bg-emerald-600/20 rounded-2xl flex items-center justify-center text-emerald-400"><Download className="w-7 h-7" /></div>
                  <h3 className="text-2xl font-black">Import Profile</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">Paste a Sync Key from another device to overwrite your local data and sync your profile.</p>
                  <textarea 
                    value={syncKeyInput}
                    onChange={(e) => setSyncKeyInput(e.target.value)}
                    placeholder="Paste Sync Key here..." 
                    className="w-full h-32 bg-black/40 border border-white/10 rounded-2xl p-6 text-xs font-mono text-indigo-300 outline-none focus:border-indigo-500"
                  />
                  <button onClick={handleImportSyncKey} className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs">Authorize Sync</button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'schedule' && (
            <div className="space-y-10 animate-in fade-in duration-500">
               <header className="flex items-center justify-between bg-slate-900/40 p-8 rounded-[40px] border border-white/5">
                 <button onClick={() => setSelectedDate(subDays(selectedDate, 1))} className="p-4 bg-black/40 rounded-2xl hover:text-indigo-400"><ChevronLeft className="w-6 h-6" /></button>
                 <div className="text-center">
                   <h2 className="text-2xl font-black text-white">{format(selectedDate, 'EEEE')}</h2>
                   <p className="text-[10px] text-slate-500 uppercase font-black mt-1 tracking-widest">{format(selectedDate, 'MMM do, yyyy')}</p>
                 </div>
                 <button onClick={() => setSelectedDate(addDays(selectedDate, 1))} className="p-4 bg-black/40 rounded-2xl hover:text-indigo-400"><ChevronRight className="w-6 h-6" /></button>
               </header>
               <div className="grid gap-4">
                 {timetable.filter(l => l.day === format(selectedDate, 'EEEE')).length > 0 ? (
                   timetable.filter(l => l.day === format(selectedDate, 'EEEE')).map(lecture => {
                     const record = records.find(r => r.id === `${format(selectedDate, 'yyyy-MM-dd')}-${lecture.id}`);
                     return (
                       <div key={lecture.id} className="bg-slate-900/20 p-6 rounded-[32px] border border-white/5 flex flex-col sm:flex-row items-center justify-between gap-6 group">
                         <div className="flex items-center gap-6 w-full sm:w-auto">
                           <div className="w-16 h-16 bg-black/40 rounded-2xl flex items-center justify-center border border-white/5 group-hover:text-indigo-400"><Clock className="w-6 h-6" /></div>
                           <div className="min-w-0 flex-grow">
                             <h4 className="text-lg font-black text-white truncate">{lecture.subject}</h4>
                             <p className="text-[10px] font-bold text-slate-600 uppercase mt-1">{lecture.time} • {lecture.faculty}</p>
                           </div>
                         </div>
                         <button 
                           onClick={() => setShowStatusModal({lectureId: lecture.id, subject: lecture.subject})}
                           className={`w-full sm:w-auto px-10 py-4 rounded-2xl font-black text-[10px] uppercase border tracking-widest transition-all ${record?.status === 'present' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : record?.status === 'absent' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-white/5 text-slate-500 border-white/5'}`}
                         >
                           {record?.status || 'Record Status'}
                         </button>
                       </div>
                     );
                   })
                 ) : (
                   <div className="py-20 text-center opacity-20 flex flex-col items-center gap-4">
                     <Umbrella className="w-12 h-12" />
                     <p className="font-black uppercase text-xs">No Nodes Scheduled</p>
                   </div>
                 )}
               </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-10 animate-in fade-in duration-500">
               <header className="flex flex-col sm:flex-row justify-between items-center bg-slate-900/30 p-10 rounded-[48px] border border-white/5 gap-6">
                 <div>
                   <h2 className="text-4xl font-black text-white tracking-tighter">Session Logs</h2>
                   <p className="text-slate-500 text-[10px] font-black uppercase mt-2 tracking-widest">Total: {records.length} entries</p>
                 </div>
                 <div className="flex gap-4">
                   <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*,.pdf" className="hidden" />
                   <button onClick={() => fileInputRef.current?.click()} disabled={isParsingPDF} className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-4 shadow-xl active:scale-95 disabled:opacity-50">
                     {isParsingPDF ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
                     {isParsingPDF ? 'Syncing AI...' : 'AI Import'}
                   </button>
                 </div>
               </header>
               <div className="space-y-6">
                 {/* Explicitly typing Object.entries result to resolve 'unknown' type inference error on dayRecords.map */}
                 {(Object.entries(records.reduce((acc, curr) => {
                   if (!acc[curr.date]) acc[curr.date] = [];
                   acc[curr.date].push(curr);
                   return acc;
                 }, {} as Record<string, AttendanceRecord[]>)) as [string, AttendanceRecord[]][])
                 .sort((a,b) => b[0].localeCompare(a[0])).map(([date, dayRecords]) => (
                   <div key={date} className="bg-slate-900/20 rounded-[40px] border border-white/5 overflow-hidden">
                     <div className="bg-black/40 px-8 py-4 border-b border-white/5"><h3 className="font-black text-[10px] text-slate-500 uppercase tracking-widest">{format(parseISO(date), 'EEEE, MMM do yyyy')}</h3></div>
                     <div className="divide-y divide-white/5">
                       {dayRecords.map(r => (
                         <div key={r.id} className="px-8 py-6 flex items-center justify-between hover:bg-black/20 group">
                           <div className="min-w-0 pr-6">
                             <p className="text-white font-black text-base truncate">{r.actualSubjectName}</p>
                             <p className="text-[9px] text-slate-600 font-bold uppercase mt-1">{r.status}</p>
                           </div>
                           <button onClick={() => setRecords(prev => prev.filter(x => x.id !== r.id))} className="p-3 bg-rose-500/10 text-rose-500 rounded-xl opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="w-4 h-4" /></button>
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
                <h1 className="text-5xl font-black tracking-tighter">Analytics</h1>
                <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mt-2">Term Health Metrics</p>
              </header>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {stats.summary.map(sub => (
                  <div key={sub.name} className="bg-[#0d0d0d] p-10 rounded-[56px] border border-white/5 space-y-8 flex flex-col justify-between shadow-2xl">
                    <div className="flex justify-between items-start">
                      <div className="min-w-0 pr-6">
                        <h4 className="font-black text-2xl text-white tracking-tight truncate leading-tight mb-2">{sub.name}</h4>
                        <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest">{sub.faculty}</p>
                      </div>
                      <Calculator className="w-8 h-8 text-indigo-500 shrink-0" />
                    </div>
                    <div className="flex justify-between items-end">
                       <div>
                         <p className="text-slate-600 text-[10px] font-black uppercase tracking-widest mb-1">Percentage</p>
                         <p className={`text-6xl font-black tracking-tighter ${sub.percentage >= 75 ? 'text-emerald-400' : 'text-rose-400'}`}>{sub.percentage}%</p>
                       </div>
                       <div className="text-right">
                         <p className="text-slate-600 text-[10px] font-black uppercase tracking-widest mb-1">Sessions</p>
                         <p className="text-2xl font-black text-white">{sub.present} / {sub.total}</p>
                       </div>
                    </div>
                    <div className={`p-6 rounded-[32px] border ${sub.percentage < 75 ? 'bg-rose-500/5 border-rose-500/10 text-rose-300' : 'bg-emerald-500/5 border-emerald-500/10 text-emerald-300'}`}>
                      <p className="text-[9px] font-black uppercase mb-2 opacity-60">Strategic Intel</p>
                      <p className="font-bold text-sm">{sub.percentage < 75 ? `Warning: Attend next ${sub.needed} sessions to reach 75%.` : 'Status clear. Safe for selective absences.'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#080808]/90 backdrop-blur-3xl border-t border-white/5 flex items-center justify-around p-6 pb-12 z-[100]">
        <MobileNavItem icon={<Layout />} active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
        <MobileNavItem icon={<Calendar />} active={activeTab === 'schedule'} onClick={() => setActiveTab('schedule')} />
        <MobileNavItem icon={<Calculator />} active={activeTab === 'subjects'} onClick={() => setActiveTab('subjects')} />
        <MobileNavItem icon={<History />} active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
      </nav>

      {/* Modals */}
      {showStatusModal && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-2xl" onClick={() => setShowStatusModal(null)} />
          <div className="relative bg-[#080808] w-full sm:max-w-xl rounded-t-[56px] sm:rounded-[64px] p-12 shadow-2xl border-t sm:border border-white/10 animate-in slide-in-from-bottom-full duration-500">
            <div className="flex justify-between items-start mb-12">
              <div className="min-w-0 pr-10">
                <h3 className="text-3xl font-black text-white tracking-tighter">Record Status</h3>
                <p className="text-slate-500 uppercase text-[10px] mt-2 font-bold tracking-widest truncate">{showStatusModal.subject}</p>
              </div>
              <button onClick={() => setShowStatusModal(null)} className="p-4 bg-white/5 rounded-2xl text-slate-500"><X className="w-8 h-8" /></button>
            </div>
            <div className="grid gap-4">
              <button onClick={() => markAttendance(showStatusModal.lectureId, showStatusModal.subject, 'present')} className="w-full p-8 bg-emerald-500/10 border border-emerald-500/20 rounded-[40px] flex items-center gap-6 font-black uppercase text-xs text-emerald-400 group active:scale-95 transition-all">
                <CheckCircle className="w-10 h-10" /> Present
              </button>
              <button onClick={() => markAttendance(showStatusModal.lectureId, showStatusModal.subject, 'absent')} className="w-full p-8 bg-rose-500/10 border border-rose-500/20 rounded-[40px] flex items-center gap-6 font-black uppercase text-xs text-rose-400 group active:scale-95 transition-all">
                <XCircle className="w-10 h-10" /> Absent
              </button>
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => markAttendance(showStatusModal.lectureId, showStatusModal.subject, 'cancelled')} className="p-6 bg-white/5 rounded-[32px] flex items-center justify-center gap-4 font-black uppercase text-[10px] text-slate-500 active:scale-95">
                  <Ban className="w-5 h-5" /> Cancelled
                </button>
                <button onClick={() => markAttendance(showStatusModal.lectureId, showStatusModal.subject, 'holiday')} className="p-6 bg-white/5 rounded-[32px] flex items-center justify-center gap-4 font-black uppercase text-[10px] text-slate-500 active:scale-95">
                  <Umbrella className="w-5 h-5" /> Holiday
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
  <button onClick={onClick} className={`w-full flex items-center gap-6 px-10 py-5 rounded-[28px] transition-all font-black text-[11px] uppercase tracking-widest ${active ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/30' : 'text-slate-600 hover:bg-white/5 hover:text-slate-300'}`}>
    {React.cloneElement(icon as React.ReactElement<any>, { className: `w-6 h-6` })}
    {label}
  </button>
);

const MobileNavItem: React.FC<{ icon: React.ReactNode; active: boolean; onClick: () => void }> = ({ icon, active, onClick }) => (
  <button onClick={onClick} className={`flex items-center justify-center w-14 h-14 rounded-3xl transition-all ${active ? 'bg-indigo-600 text-white shadow-xl scale-110' : 'text-slate-600'}`}>
    {React.cloneElement(icon as React.ReactElement<any>, { className: `w-7 h-7` })}
  </button>
);

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string | number }> = ({ icon, label, value }) => (
  <div className="bg-[#0d0d0d] p-8 rounded-[40px] border border-white/5 flex items-center gap-6 shadow-xl">
    <div className="w-14 h-14 bg-black/40 rounded-2xl flex items-center justify-center border border-white/5 shadow-inner">{icon}</div>
    <div>
      <p className="text-[9px] font-black uppercase text-slate-600 tracking-widest mb-1">{label}</p>
      <h4 className="text-2xl font-black text-white tracking-tighter">{value}</h4>
    </div>
  </div>
);

export default App;
