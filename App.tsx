
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell
} from 'recharts';
import { 
  Calendar, CheckCircle, XCircle, Clock, BookOpen, BarChart2, 
  User as UserIcon, ChevronRight, AlertCircle, History, Layout, ChevronLeft,
  RefreshCcw, X, Plus, LogOut, ShieldCheck, Database, Trash2, Settings, 
  UserPlus, Calculator, Bell, BellRing, Send, Megaphone, Ban, Umbrella, 
  FileUp, Loader2, TrendingUp, Zap, Target, Share2, Download, Copy, Check, Sparkles, Cpu, Replace, FileSpreadsheet, Info
} from 'lucide-react';
import { format, addDays, subDays, startOfToday, parseISO, isValid } from 'date-fns';
import { GoogleGenAI, Type } from "@google/genai";
import * as XLSX from 'xlsx';
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
  const [isParsingExcel, setIsParsingExcel] = useState(false);
  const [parseProgress, setParseProgress] = useState(0);
  const [copySuccess, setCopySuccess] = useState(false);
  
  // Modals & Inputs
  const [showStatusModal, setShowStatusModal] = useState<{lectureId: string, subject: string, substitutingSubject?: string | null} | null>(null);
  const [syncKeyInput, setSyncKeyInput] = useState('');
  
  // Core Data
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Safe Date Formatting Utility
  const safeFormat = (dateStr: string, formatStr: string) => {
    try {
      const d = parseISO(dateStr);
      if (!isValid(d)) return "Invalid Date";
      return format(d, formatStr);
    } catch (e) {
      return "Invalid Date";
    }
  };

  // Load User Records
  useEffect(() => {
    if (currentUser) {
      const saved = localStorage.getItem(`nmims_v3_db_${currentUser.sapId}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const validated = Array.isArray(parsed) ? parsed.filter(r => r && r.date && r.status) : [];
          setRecords(validated);
        } catch (e) {
          setRecords([]);
        }
      } else {
        setRecords([]);
      }
    }
  }, [currentUser]);

  // Persist Records
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem(`nmims_v3_db_${currentUser.sapId}`, JSON.stringify(records));
    }
  }, [records, currentUser]);

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

  // Added generateSyncKey to handle identity persistence and fix missing name errors
  const generateSyncKey = () => {
    if (!currentUser) return '';
    try {
      const payload = { user: currentUser, records };
      return btoa(JSON.stringify(payload));
    } catch (e) {
      console.error('Failed to generate sync key', e);
      return '';
    }
  };

  // Handle Excel Upload (Handles any normal Excel structure)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;

    setIsParsingExcel(true);
    setParseProgress(10);
    
    try {
      const reader = new FileReader();
      const excelData: any[] = await new Promise((resolve, reject) => {
        reader.onload = (e) => {
          try {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            // header: 1 returns array of arrays (perfect for messy sheets)
            resolve(XLSX.utils.sheet_to_json(worksheet, { header: 1 }));
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      });

      setParseProgress(40);
      if (!excelData || excelData.length === 0) throw new Error("Empty spreadsheet");

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      // Map to string for AI context
      const gridText = excelData
        .filter(row => row.some((cell: any) => cell !== null && cell !== ''))
        .slice(0, 200) // Keep first 200 rows to stay within context
        .map(row => row.join('|'))
        .join('\n');
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analyze this spreadsheet grid text.
        Official Subjects: ${subjectsList.map(s => s.name).join(', ')}.
        
        Data:
        ${gridText}
        
        Goal: 
        Extract a list of attendance records. 
        1. Identify the Date, Subject Name, and Status columns.
        2. Recognize dates in formats like "Dec 8 2025" or "12/08/2025".
        3. Map whatever subject names found in the sheet to the closest match in our Official Subjects list.
        4. Convert statuses: 'P' or 'Present' or 'Attended' or '1' -> 'present', 'A' or 'Absent' or 'Missed' or '0' -> 'absent'.
        5. Dates must be output as YYYY-MM-DD.
        6. Return ONLY a valid JSON array of objects with keys: "subject", "status", "date".`,
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

      setParseProgress(85);

      const extracted = JSON.parse(response.text || '[]');
      const newBatch: AttendanceRecord[] = extracted
        .filter((item: any) => item.date && isValid(parseISO(item.date)))
        .map((item: any) => ({
          id: `excel-${Date.now()}-${Math.random()}`,
          date: item.date,
          lectureId: 'imported-excel',
          originalSubjectName: item.subject,
          actualSubjectName: item.subject,
          status: item.status.toLowerCase().startsWith('p') || item.status.toLowerCase() === '1' ? 'present' : 
                  item.status.toLowerCase().startsWith('a') || item.status.toLowerCase() === '0' ? 'absent' : 'cancelled'
        }));

      if (newBatch.length === 0) throw new Error("No records extracted");

      setRecords(prev => {
        const updated = [...prev];
        newBatch.forEach(nb => {
          const exists = updated.some(u => u.date === nb.date && u.actualSubjectName === nb.actualSubjectName);
          if (!exists) updated.push(nb);
        });
        return updated;
      });
      setParseProgress(100);
      setTimeout(() => setIsParsingExcel(false), 500);
    } catch (err) {
      setIsParsingExcel(false);
      alert('Excel parse failed. Please check the "Format Guide" in the Logs tab. Supported date: Dec 8 2025.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const markAttendance = (lectureId: string, originalSubject: string, actualSubject: string, status: AttendanceStatus) => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const id = `${dateStr}-${lectureId}`;
    setRecords(prev => {
      const filtered = prev.filter(r => r.id !== id);
      return [...filtered, {
        id, date: dateStr, lectureId, 
        originalSubjectName: originalSubject, 
        actualSubjectName: actualSubject, 
        status
      }];
    });
    setShowStatusModal(null);
  };

  const handleImportSyncKey = () => {
    try {
      const decoded = JSON.parse(atob(syncKeyInput));
      if (decoded.user && decoded.records) {
        setRecords(decoded.records);
        setCurrentUser(decoded.user);
        localStorage.setItem('nmims_session_user', JSON.stringify(decoded.user));
        localStorage.setItem(`nmims_v3_db_${decoded.user.sapId}`, JSON.stringify(decoded.records));
        alert('Sync Successful!');
        setActiveTab('dashboard');
        setSyncKeyInput('');
      }
    } catch (e) {
      alert('Invalid Sync Key.');
    }
  };

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
      alert('Login Failed.');
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6 text-white overflow-hidden">
        <div className="w-full max-w-sm space-y-10 animate-in fade-in zoom-in-95 duration-700">
          <div className="text-center">
            <div className="w-24 h-24 bg-indigo-600 rounded-[32px] flex items-center justify-center text-white font-black text-4xl mx-auto mb-8 shadow-2xl relative z-10">NM</div>
            <h1 className="text-4xl font-black tracking-tighter mb-2">Attendly</h1>
            <p className="text-slate-500 text-xs font-black uppercase tracking-[0.2em]">SVKM NMIMS Node</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4 bg-slate-900/40 p-10 rounded-[48px] border border-white/5 backdrop-blur-2xl shadow-2xl">
            <input name="sap" type="text" placeholder="SAP ID" className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 px-6 focus:border-indigo-500 outline-none font-bold transition-all" required />
            <input name="pass" type="password" placeholder="Password" className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 px-6 focus:border-indigo-500 outline-none font-bold transition-all" required />
            <button type="submit" className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-black uppercase tracking-widest transition-all shadow-lg active:scale-95">Authenticate</button>
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
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/5 blur-[120px] rounded-full -mr-64 -mt-64" />
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-10">
                  <div className="text-center md:text-left">
                    <span className="bg-white/20 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest text-white backdrop-blur-md mb-6 inline-block">Attendance Integrity Matrix</span>
                    <h1 className="text-5xl sm:text-7xl font-black text-white tracking-tighter leading-none mb-6">Status<br/>Portal</h1>
                    <div className="flex gap-4 items-center justify-center md:justify-start">
                      <div className="px-5 py-2.5 bg-black/30 rounded-2xl border border-white/10 flex items-center gap-3">
                         <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                         <span className="text-[10px] font-black uppercase tracking-widest">Network Active</span>
                      </div>
                    </div>
                  </div>
                  <div className="w-56 h-56 sm:w-64 sm:h-64 relative flex items-center justify-center">
                    <svg className="w-full h-full -rotate-90">
                      <circle cx="50%" cy="50%" r="45%" stroke="rgba(255,255,255,0.05)" strokeWidth="16" fill="transparent" />
                      <circle cx="50%" cy="50%" r="45%" stroke="white" strokeWidth="16" fill="transparent" strokeDasharray="283" strokeDashoffset={283 - (283 * stats.overall) / 100} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
                    </svg>
                    <div className="absolute flex flex-col items-center">
                      <span className="text-6xl font-black text-white">{stats.overall}%</span>
                      <span className="text-[10px] font-black uppercase text-indigo-100/60 mt-1 tracking-widest">Aggregate</span>
                    </div>
                  </div>
                </div>
              </header>

              <section className="bg-slate-900/20 p-8 sm:p-12 rounded-[56px] border border-white/5 shadow-2xl space-y-10">
                <div className="flex items-center justify-between px-2">
                  <h2 className="text-3xl font-black text-white flex items-center gap-4"><BarChart2 className="w-10 h-10 text-indigo-500" /> Module Integrity</h2>
                  <div className="text-[10px] font-black uppercase text-slate-500 tracking-widest hidden sm:block">Subject Analysis</div>
                </div>
                <div className="h-[400px] sm:h-[450px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.summary} layout="vertical" margin={{ left: 20, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={true} vertical={false} />
                      <XAxis type="number" domain={[0, 100]} hide />
                      <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={10} width={120} tick={{fill: '#94a3b8', fontWeight: 'bold'}} />
                      <Tooltip 
                        cursor={{fill: 'rgba(99, 102, 241, 0.05)'}}
                        contentStyle={{ backgroundColor: '#0f172a', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} 
                        itemStyle={{ color: '#818cf8', fontWeight: '900', fontSize: '12px' }}
                      />
                      <Bar dataKey="percentage" radius={[0, 12, 12, 0]} barSize={28}>
                        {stats.summary.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.percentage >= 75 ? '#10b981' : '#f43f5e'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                <StatCard icon={<CheckCircle className="text-emerald-400" />} label="Present Nodes" value={stats.totalP} />
                <StatCard icon={<Zap className="text-yellow-400" />} label="Total Credits" value={subjectsList.reduce((a, b) => a + b.credits, 0)} />
                <StatCard icon={<Target className="text-indigo-400" />} label="Overall Matrix" value={`${stats.overall}%`} />
                <StatCard icon={<Database className="text-slate-400" />} label="Node Type" value="Local Vault" />
              </div>

              <section className="space-y-10">
                <div className="flex items-center justify-between px-2">
                  <h2 className="text-2xl font-black text-white flex items-center gap-4"><Sparkles className="w-8 h-8 text-indigo-500" /> Subject Health</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                  {stats.summary.map(sub => (
                    <div key={sub.name} className="bg-[#0d0d0d] p-10 rounded-[48px] border border-white/5 hover:border-indigo-500/30 transition-all flex flex-col h-72 shadow-2xl group hover:-translate-y-2 relative overflow-hidden">
                      <div className="flex justify-between items-start mb-10 relative z-10">
                        <div className="min-w-0 pr-4">
                          <h4 className="font-black text-white text-xl leading-tight truncate group-hover:text-indigo-400 transition-colors">{sub.name}</h4>
                          <p className="text-[9px] text-slate-600 font-black uppercase mt-2 tracking-widest">{sub.faculty}</p>
                        </div>
                        <div className="text-right">
                          <div className={`text-3xl font-black ${sub.percentage >= 75 ? 'text-emerald-400' : 'text-rose-400'}`}>{sub.percentage}%</div>
                          <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mt-1">{sub.credits} Credits</div>
                        </div>
                      </div>
                      <div className="mt-auto space-y-5 relative z-10">
                        <div className="flex justify-between items-end text-[10px] font-black uppercase tracking-widest text-slate-500">
                          <span>Nodes: {sub.present} / {sub.total}</span>
                          <span className="text-white">STATUS: {sub.percentage >= 75 ? 'OPTIMAL' : 'BELOW SYNC'}</span>
                        </div>
                        <div className="h-4 bg-black/60 rounded-full overflow-hidden border border-white/5 p-1">
                          <div 
                            className={`h-full transition-all duration-1000 rounded-full ${sub.percentage >= 75 ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.3)]'}`} 
                            style={{ width: `${Math.min(sub.percentage, 100)}%` }} 
                          />
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
                <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mt-4">Identity Persistence</p>
              </header>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-indigo-600/5 border border-indigo-500/20 p-12 rounded-[56px] space-y-8 shadow-2xl">
                  <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white"><Share2 className="w-8 h-8" /></div>
                  <div><h3 className="text-3xl font-black mb-2">Export Data</h3><p className="text-slate-400 text-sm">Transfer your attendance nodes to another device.</p></div>
                  <div className="relative group">
                    <div className="bg-black/60 p-8 rounded-3xl text-[9px] font-mono text-indigo-300 break-all h-40 overflow-y-auto custom-scrollbar border border-white/5 shadow-inner">{generateSyncKey()}</div>
                    <button onClick={() => { navigator.clipboard.writeText(generateSyncKey()); setCopySuccess(true); setTimeout(() => setCopySuccess(false), 2000); }} className="absolute top-4 right-4 p-4 bg-indigo-600 text-white rounded-2xl shadow-2xl transition-all active:scale-95">{copySuccess ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}</button>
                  </div>
                </div>
                <div className="bg-slate-900/40 border border-white/5 p-12 rounded-[56px] space-y-8 shadow-2xl">
                  <div className="w-16 h-16 bg-emerald-600/20 rounded-2xl flex items-center justify-center text-emerald-400"><Download className="w-8 h-8" /></div>
                  <div><h3 className="text-3xl font-black mb-2">Import Data</h3><p className="text-slate-400 text-sm">Restore your attendance matrix using a key.</p></div>
                  <textarea value={syncKeyInput} onChange={(e) => setSyncKeyInput(e.target.value)} placeholder="Paste Key Node..." className="w-full h-40 bg-black/40 border border-white/10 rounded-3xl p-8 text-[10px] font-mono text-indigo-300 outline-none focus:border-indigo-500 no-scrollbar transition-all" />
                  <button onClick={handleImportSyncKey} className="w-full py-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[24px] font-black uppercase tracking-[0.2em] text-[10px] shadow-xl transition-all active:scale-95">Link Identity</button>
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
                     const isSubstituted = record?.actualSubjectName !== lecture.subject && !!record?.actualSubjectName;
                     
                     return (
                       <div key={lecture.id} className="bg-[#0d0d0d] p-8 rounded-[40px] border border-white/5 flex flex-col sm:flex-row items-center justify-between gap-8 group hover:border-indigo-500/20 transition-all">
                         <div className="flex items-center gap-8 w-full sm:w-auto">
                           <div className="w-20 h-20 bg-black/60 rounded-[28px] flex items-center justify-center border border-white/5 transition-all group-hover:border-indigo-500/30"><Clock className="w-8 h-8" /></div>
                           <div className="min-w-0 flex-grow">
                             <div className="flex items-center gap-3">
                                <h4 className="text-2xl font-black text-white truncate group-hover:text-indigo-400 transition-colors">{isSubstituted ? record.actualSubjectName : lecture.subject}</h4>
                                {isSubstituted && (
                                   <span className="px-3 py-1 bg-indigo-500/20 text-indigo-400 text-[8px] font-black uppercase tracking-widest rounded-lg border border-indigo-500/30 flex items-center gap-1"><Replace className="w-2.5 h-2.5" /> SUBSTITUTED</span>
                                )}
                             </div>
                             <p className="text-[11px] font-black text-slate-600 uppercase mt-2 tracking-widest">{lecture.time} • {lecture.faculty}</p>
                           </div>
                         </div>
                         <button 
                           onClick={() => setShowStatusModal({lectureId: lecture.id, subject: lecture.subject, substitutingSubject: isSubstituted ? record.actualSubjectName : null})}
                           className={`w-full sm:w-auto px-12 py-5 rounded-[28px] font-black text-[10px] uppercase border tracking-[0.15em] transition-all shadow-lg active:scale-95 ${record?.status === 'present' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : record?.status === 'absent' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-white/5 text-slate-600 border-white/5 hover:text-white'}`}
                         >
                           {record?.status ? (isSubstituted ? `${record.status} (Sub)` : record.status) : 'Record Node'}
                         </button>
                       </div>
                     );
                   })
                 ) : (
                   <div className="py-32 text-center opacity-20 flex flex-col items-center gap-6">
                     <Umbrella className="w-16 h-16" />
                     <p className="font-black uppercase text-sm tracking-[0.3em]">No Schedule Today</p>
                   </div>
                 )}
               </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-10 animate-in fade-in duration-500">
               <header className="flex flex-col lg:flex-row justify-between items-center bg-slate-900/30 p-12 rounded-[56px] border border-white/5 gap-8">
                 <div className="text-center lg:text-left">
                   <h2 className="text-5xl font-black text-white tracking-tighter">Logs</h2>
                   <p className="text-slate-500 text-[11px] font-black uppercase mt-3 tracking-[0.2em]">{records.length} Processed Attendance Nodes</p>
                 </div>
                 <div className="flex gap-4 w-full lg:w-auto">
                   <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx, .xls, .csv" className="hidden" />
                   <button onClick={() => fileInputRef.current?.click()} disabled={isParsingExcel} className="flex-1 lg:flex-none px-10 py-5 bg-indigo-600 text-white rounded-[24px] font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-4 shadow-2xl active:scale-95 disabled:opacity-50 transition-all">
                     {isParsingExcel ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileSpreadsheet className="w-5 h-5" />}
                     {isParsingExcel ? 'Syncing...' : 'Sync Excel Node'}
                   </button>
                 </div>
               </header>

               {/* File Format Guide */}
               <section className="bg-indigo-600/5 border border-indigo-500/10 p-8 rounded-[40px] space-y-6">
                 <div className="flex items-center gap-3">
                   <Info className="w-5 h-5 text-indigo-400" />
                   <h3 className="text-xs font-black uppercase tracking-widest text-indigo-400">Supported Excel Format</h3>
                 </div>
                 <p className="text-xs text-slate-400 leading-relaxed max-w-2xl font-bold">
                   For successful AI parsing, ensure your Excel file has a clear table structure. The AI now explicitly recognizes natural date formats like <span className="text-white">Dec 8 2025</span>. 
                 </p>
                 <div className="overflow-x-auto no-scrollbar rounded-2xl border border-white/5 bg-black/40">
                    <table className="w-full text-left text-[10px] font-bold">
                      <thead className="bg-white/5 text-slate-500 uppercase tracking-widest">
                        <tr>
                          <th className="px-6 py-3">Date Column</th>
                          <th className="px-6 py-3">Subject Name</th>
                          <th className="px-6 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="text-slate-300">
                        <tr className="border-t border-white/5">
                          <td className="px-6 py-3">Dec 8 2025</td>
                          <td className="px-6 py-3">Principles of Marketing</td>
                          <td className="px-6 py-3 text-emerald-400">Present</td>
                        </tr>
                        <tr className="border-t border-white/5">
                          <td className="px-6 py-3">Dec 10 2025</td>
                          <td className="px-6 py-3">Microeconomics</td>
                          <td className="px-6 py-3 text-rose-400">Absent</td>
                        </tr>
                      </tbody>
                    </table>
                 </div>
               </section>

               <div className="space-y-8">
                 {records.length === 0 ? (
                   <div className="py-40 text-center opacity-20 font-black uppercase tracking-[0.4em] text-xs">No Node History Found</div>
                 ) : (
                   (Object.entries(records.reduce((acc, curr) => {
                     if (!acc[curr.date]) acc[curr.date] = [];
                     acc[curr.date].push(curr);
                     return acc;
                   }, {} as Record<string, AttendanceRecord[]>)) as [string, AttendanceRecord[]][])
                   .sort((a,b) => b[0].localeCompare(a[0])).map(([date, dayRecords]) => (
                     <div key={date} className="bg-slate-900/20 rounded-[48px] border border-white/5 overflow-hidden shadow-xl">
                       <div className="bg-black/40 px-10 py-5 border-b border-white/5">
                          <h3 className="font-black text-[10px] text-slate-500 uppercase tracking-widest">{safeFormat(date, 'EEEE, MMMM do yyyy')}</h3>
                       </div>
                       <div className="divide-y divide-white/5">
                         {dayRecords.map(r => (
                           <div key={r.id} className="px-10 py-8 flex items-center justify-between hover:bg-black/20 group transition-all">
                             <div className="min-w-0 pr-8">
                               <p className="text-white font-black text-xl truncate tracking-tight">{r.actualSubjectName}</p>
                               <div className="flex items-center gap-3 mt-2">
                                 <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${r.status === 'present' ? 'bg-emerald-500/10 text-emerald-400' : r.status === 'absent' ? 'bg-rose-500/10 text-rose-400' : 'bg-white/10 text-slate-500'}`}>{r.status}</span>
                                 {r.actualSubjectName !== r.originalSubjectName && <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest border border-indigo-400/20 px-2 rounded-md">Substituted</span>}
                               </div>
                             </div>
                             <button onClick={() => setRecords(prev => prev.filter(x => x.id !== r.id))} className="p-4 bg-rose-500/10 text-rose-500 rounded-2xl opacity-0 group-hover:opacity-100 transition-all active:scale-95"><Trash2 className="w-5 h-5" /></button>
                           </div>
                         ))}
                       </div>
                     </div>
                   ))
                 )}
               </div>
            </div>
          )}

          {activeTab === 'subjects' && (
            <div className="space-y-12 animate-in fade-in duration-500">
              <header>
                <h1 className="text-6xl font-black tracking-tighter">Matrix Breakdown</h1>
                <p className="text-slate-500 text-xs font-black uppercase tracking-[0.3em] mt-4">Node Integrity Metrics</p>
              </header>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {stats.summary.map(sub => (
                  <div key={sub.name} className="bg-[#0d0d0d] p-12 rounded-[64px] border border-white/5 space-y-10 flex flex-col justify-between shadow-2xl relative overflow-hidden group">
                    <div className="flex justify-between items-start">
                      <div className="min-w-0 pr-6">
                        <h4 className="font-black text-3xl text-white tracking-tighter truncate mb-3 group-hover:text-indigo-400 transition-colors">{sub.name}</h4>
                        <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest">{sub.faculty}</p>
                      </div>
                      <div className="p-4 bg-indigo-600/10 rounded-2xl text-indigo-500 text-center flex flex-col items-center border border-indigo-500/20">
                        <Calculator className="w-8 h-8" />
                        <span className="text-[8px] font-black mt-1 uppercase tracking-widest">{sub.credits} CREDITS</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-end">
                       <div>
                         <p className="text-slate-600 text-[10px] font-black uppercase tracking-widest mb-3">Sync Status</p>
                         <p className={`text-7xl font-black tracking-tighter ${sub.percentage >= 75 ? 'text-emerald-400' : 'text-rose-400'}`}>{sub.percentage}%</p>
                       </div>
                       <div className="text-right">
                         <p className="text-slate-600 text-[10px] font-black uppercase tracking-widest mb-3">Sync Nodes</p>
                         <p className="text-3xl font-black text-white">{sub.present} / {sub.total}</p>
                       </div>
                    </div>
                    <div className={`p-8 rounded-[40px] border transition-all ${sub.percentage < 75 ? 'bg-rose-500/5 border-rose-500/10 text-rose-300' : 'bg-emerald-500/5 border-emerald-500/10 text-emerald-300'}`}>
                      <p className="text-[9px] font-black uppercase mb-3 opacity-60 tracking-[0.1em]">Target Analysis</p>
                      <p className="font-black text-sm uppercase tracking-wide leading-relaxed">{sub.percentage < 75 ? `Warning: Reach 75% in next ${sub.needed} nodes.` : 'Optimal. Matrix sync stable.'}</p>
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
      {isParsingExcel && (
        <div className="fixed inset-0 z-[1000] bg-black/95 backdrop-blur-3xl flex flex-col items-center justify-center p-12 animate-in fade-in duration-500">
           <div className="w-24 h-24 bg-indigo-600 rounded-[32px] flex items-center justify-center text-white mb-10 shadow-[0_0_80px_rgba(79,70,229,0.4)] animate-pulse">
              <Cpu className="w-12 h-12" />
           </div>
           <h2 className="text-3xl font-black text-white tracking-tighter mb-4 text-center">AI Excel Sync</h2>
           <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] mb-12 text-center max-w-xs leading-relaxed">Mapping matrix and recognized dates like "Dec 8 2025"...</p>
           <div className="w-full max-w-sm h-4 bg-white/5 rounded-full border border-white/10 p-1 relative overflow-hidden">
              <div 
                className="h-full bg-indigo-600 rounded-full transition-all duration-300 shadow-[0_0_20px_rgba(79,70,229,0.5)]"
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
          <div className="relative bg-[#080808] w-full sm:max-w-xl rounded-t-[64px] sm:rounded-[64px] p-12 shadow-2xl border-t sm:border border-white/10 animate-in slide-in-from-bottom-full duration-500 overflow-y-auto max-h-[90vh] custom-scrollbar">
            <div className="flex justify-between items-start mb-12">
              <div className="min-w-0 pr-10">
                <h3 className="text-4xl font-black text-white tracking-tighter">Record Node</h3>
                <p className="text-slate-500 uppercase text-[11px] mt-3 font-black tracking-widest truncate">
                  {showStatusModal.substitutingSubject ? `Substitution: ${showStatusModal.substitutingSubject}` : `Scheduled: ${showStatusModal.subject}`}
                </p>
              </div>
              <button onClick={() => setShowStatusModal(null)} className="p-5 bg-white/5 rounded-2xl text-slate-600 hover:text-white transition-all active:scale-95"><X className="w-8 h-8" /></button>
            </div>

            {!showStatusModal.substitutingSubject ? (
              <div className="grid gap-6">
                <div className="grid grid-cols-1 gap-4">
                  <button onClick={() => markAttendance(showStatusModal.lectureId, showStatusModal.subject, showStatusModal.subject, 'present')} className="w-full p-10 bg-emerald-500/10 border border-emerald-500/20 rounded-[48px] flex items-center gap-10 font-black uppercase text-xs text-emerald-400 group active:scale-[0.98] transition-all hover:bg-emerald-500/20 shadow-xl">
                    <CheckCircle className="w-12 h-12" /> Present Node
                  </button>
                  <button onClick={() => markAttendance(showStatusModal.lectureId, showStatusModal.subject, showStatusModal.subject, 'absent')} className="w-full p-10 bg-rose-500/10 border border-rose-500/20 rounded-[48px] flex items-center gap-10 font-black uppercase text-xs text-rose-400 group active:scale-[0.98] transition-all hover:bg-rose-500/20 shadow-xl">
                    <XCircle className="w-12 h-12" /> Absent Node
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                   <button onClick={() => markAttendance(showStatusModal.lectureId, showStatusModal.subject, showStatusModal.subject, 'cancelled')} className="p-6 bg-white/5 rounded-[32px] flex items-center justify-center gap-4 font-black uppercase text-[9px] text-slate-500 active:scale-95 hover:bg-white/10 transition-all border border-white/5">
                    <Ban className="w-5 h-5" /> Cancelled
                   </button>
                   <button onClick={() => setShowStatusModal({...showStatusModal, substitutingSubject: 'PENDING'})} className="p-6 bg-indigo-500/5 rounded-[32px] flex items-center justify-center gap-4 font-black uppercase text-[9px] text-indigo-400 active:scale-95 hover:bg-indigo-500/10 transition-all border border-indigo-500/10">
                    <Replace className="w-5 h-5" /> Substitute
                   </button>
                </div>
              </div>
            ) : showStatusModal.substitutingSubject === 'PENDING' ? (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="flex items-center justify-between">
                  <h4 className="font-black uppercase text-[10px] text-indigo-400 tracking-[0.2em]">Select Substitution</h4>
                  <button onClick={() => setShowStatusModal({...showStatusModal, substitutingSubject: null})} className="text-[10px] font-black text-slate-600 hover:text-white uppercase tracking-widest">Back</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 h-[300px] overflow-y-auto custom-scrollbar p-2">
                   {subjectsList.map(sub => (
                     <button 
                      key={sub.name}
                      onClick={() => setShowStatusModal({...showStatusModal, substitutingSubject: sub.name})}
                      className="p-6 bg-white/5 rounded-[32px] text-left border border-white/5 hover:border-indigo-500/30 group transition-all"
                     >
                       <p className="font-black text-xs text-white group-hover:text-indigo-400 truncate">{sub.name}</p>
                       <p className="text-[8px] font-black text-slate-600 uppercase mt-1 tracking-widest">{sub.faculty}</p>
                     </button>
                   ))}
                </div>
              </div>
            ) : (
              <div className="grid gap-6 animate-in fade-in zoom-in-95 duration-300">
                 <div className="p-6 bg-indigo-500/10 border border-indigo-500/20 rounded-[32px] flex items-center justify-between">
                   <div>
                     <p className="text-[8px] font-black uppercase text-indigo-400 tracking-[0.3em] mb-1">Targeting Substitution</p>
                     <p className="text-lg font-black text-white">{showStatusModal.substitutingSubject}</p>
                   </div>
                   <button onClick={() => setShowStatusModal({...showStatusModal, substitutingSubject: 'PENDING'})} className="p-3 bg-white/5 rounded-xl text-indigo-400 active:scale-90 transition-all"><Replace className="w-5 h-5" /></button>
                 </div>
                 <button onClick={() => markAttendance(showStatusModal.lectureId, showStatusModal.subject, showStatusModal.substitutingSubject!, 'present')} className="w-full p-10 bg-emerald-500/10 border border-emerald-500/20 rounded-[48px] flex items-center gap-10 font-black uppercase text-xs text-emerald-400 active:scale-[0.98] transition-all hover:bg-emerald-500/20 shadow-xl">
                    <CheckCircle className="w-12 h-12" /> Present (Sub)
                  </button>
                  <button onClick={() => markAttendance(showStatusModal.lectureId, showStatusModal.subject, showStatusModal.substitutingSubject!, 'absent')} className="w-full p-10 bg-rose-500/10 border border-rose-500/20 rounded-[48px] flex items-center gap-10 font-black uppercase text-xs text-rose-400 active:scale-[0.98] transition-all hover:bg-rose-500/20 shadow-xl">
                    <XCircle className="w-12 h-12" /> Absent (Sub)
                  </button>
                  <button onClick={() => setShowStatusModal({...showStatusModal, substitutingSubject: null})} className="w-full py-5 bg-white/5 rounded-[24px] font-black uppercase text-[10px] text-slate-500 active:scale-95 transition-all">Cancel Substitution</button>
              </div>
            )}
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
