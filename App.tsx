
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell
} from 'recharts';
import { 
  Calendar, CheckCircle, XCircle, Clock, BookOpen, BarChart2, 
  User as UserIcon, ChevronRight, AlertCircle, History, Layout, ChevronLeft,
  MinusCircle, RefreshCcw, X, Plus, Sparkles, Wand2, LogOut, Lock, Cloud, ShieldCheck, Database, FileText, ArrowLeft, Palmtree, Trash2, UserCog, Settings, UserPlus, Calculator, Bell, BellRing, Send, Megaphone, Ban, Umbrella, Upload, FileUp, Loader2, TrendingUp, Zap, Target
} from 'lucide-react';
import { format, addDays, subDays, startOfToday, parseISO } from 'date-fns';
import { GoogleGenAI } from "@google/genai";
import { FULL_SCHEDULE, SUBJECTS, AUTHORIZED_STUDENTS, DEFAULT_PASSWORD, ADMIN_SAP_ID, DAYS } from './constants';
import { AttendanceRecord, AttendanceStatus, DayOfWeek, User, Lecture, Subject } from './types';

const App: React.FC = () => {
  // Authentication State
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('nmims_session_user');
    return saved ? JSON.parse(saved) : null;
  });
  
  // System State
  const [timetable, setTimetable] = useState<Lecture[]>(() => {
    const saved = localStorage.getItem('nmims_system_timetable');
    return saved ? JSON.parse(saved) : FULL_SCHEDULE;
  });

  const [subjectsList, setSubjectsList] = useState<Subject[]>(() => {
    const saved = localStorage.getItem('nmims_system_subjects');
    return saved ? JSON.parse(saved) : SUBJECTS;
  });

  const [studentsList, setStudentsList] = useState<User[]>(() => {
    const saved = localStorage.getItem('nmims_system_students');
    return saved ? JSON.parse(saved) : AUTHORIZED_STUDENTS;
  });

  const [broadcast, setBroadcast] = useState<{message: string, timestamp: number} | null>(() => {
    const saved = localStorage.getItem('nmims_system_broadcast');
    return saved ? JSON.parse(saved) : null;
  });

  // UI State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'schedule' | 'subjects' | 'history' | 'admin'>('dashboard');
  const [selectedDate, setSelectedDate] = useState<Date>(startOfToday());
  const [isSyncing, setIsSyncing] = useState(false);
  const [isParsingPDF, setIsParsingPDF] = useState(false);
  const [showNotificationCenter, setShowNotificationCenter] = useState(false);
  
  // Admin UI
  const [selectedAdminStudent, setSelectedAdminStudent] = useState<string | null>(null);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [adminView, setAdminView] = useState<'students' | 'timetable' | 'broadcast'>('students');
  const [broadcastInput, setBroadcastInput] = useState('');
  
  // Modals
  const [showStatusModal, setShowStatusModal] = useState<{lectureId: string, subject: string} | null>(null);
  const [showSubModal, setShowStatusSubModal] = useState<{lectureId: string, originalSubject: string} | null>(null);
  const [showExtraModal, setShowExtraModal] = useState(false);
  const [showAddLectureModal, setShowAddLectureModal] = useState<DayOfWeek | null>(null);
  
  // Core Data
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isAdmin = currentUser?.sapId === ADMIN_SAP_ID;

  // Persistence Effects
  useEffect(() => {
    localStorage.setItem('nmims_system_students', JSON.stringify(studentsList));
    localStorage.setItem('nmims_system_timetable', JSON.stringify(timetable));
    localStorage.setItem('nmims_system_subjects', JSON.stringify(subjectsList));
    localStorage.setItem('nmims_system_broadcast', JSON.stringify(broadcast));
  }, [studentsList, timetable, subjectsList, broadcast]);

  useEffect(() => {
    if (currentUser) {
      const saved = localStorage.getItem(`nmims_backend_db_${currentUser.sapId}`);
      if (saved) setRecords(JSON.parse(saved));
      else setRecords([]);
    }
  }, [currentUser]);

  // Unified Attendance Logic
  const markAttendance = async (lectureId: string, originalSubject: string, status: AttendanceStatus, actualSubject?: string) => {
    if (!currentUser) return;
    
    setIsSyncing(true);
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const recordId = lectureId.startsWith('extra-') ? `extra-${Date.now()}` : `${dateStr}-${lectureId}`;
    
    const newRecord: AttendanceRecord = { 
      id: recordId, 
      date: dateStr, 
      lectureId, 
      originalSubjectName: originalSubject, 
      actualSubjectName: actualSubject || originalSubject, 
      status 
    };

    setRecords(prev => {
      const filtered = prev.filter(r => r.id !== recordId);
      const updated = [...filtered, newRecord];
      localStorage.setItem(`nmims_backend_db_${currentUser.sapId}`, JSON.stringify(updated));
      return updated;
    });

    await new Promise(r => setTimeout(r, 200));
    setIsSyncing(false);
    
    setShowStatusModal(null);
    setShowStatusSubModal(null);
    setShowExtraModal(false);
  };

  // AI-Powered PDF/Image Parsing
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;

    setIsParsingPDF(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: [
            {
              parts: [
                { inlineData: { data: base64Data, mimeType: file.type } },
                { text: `Extract NMIMS student attendance records from this image/PDF. 
                         Format as JSON array: [{"subject": "string", "status": "present|absent", "date": "YYYY-MM-DD"}].
                         Ignore cancelled sessions or holidays. Only return the JSON block.` }
              ]
            }
          ]
        });

        const jsonStr = response.text?.match(/\[.*\]/s)?.[0];
        if (jsonStr) {
          const extracted: {subject: string, status: string, date: string}[] = JSON.parse(jsonStr);
          const newBatch: AttendanceRecord[] = extracted.map(item => ({
            id: `imported-${Date.now()}-${Math.random()}`,
            date: item.date,
            lectureId: 'imported',
            originalSubjectName: item.subject,
            actualSubjectName: item.subject,
            status: item.status as AttendanceStatus
          }));

          setRecords(prev => {
            const updated = [...prev, ...newBatch];
            localStorage.setItem(`nmims_backend_db_${currentUser.sapId}`, JSON.stringify(updated));
            return updated;
          });
          alert(`Successfully synced ${newBatch.length} sessions.`);
        }
      };
    } catch (err) {
      console.error(err);
      alert('AI Parsing failed. Ensure image is clear.');
    } finally {
      setIsParsingPDF(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const sap = formData.get('sap') as string;
    const pass = formData.get('pass') as string;
    
    const user = studentsList.find(s => s.sapId === sap);
    if (user && pass === DEFAULT_PASSWORD) {
      setCurrentUser(user);
      localStorage.setItem('nmims_session_user', JSON.stringify(user));
    } else {
      alert('Invalid Credentials.');
    }
  };

  const calculateStats = (userRecords: AttendanceRecord[]) => {
    const summary = subjectsList.map(sub => {
      const subRecords = userRecords.filter(r => r.actualSubjectName.trim().toLowerCase() === sub.name.trim().toLowerCase());
      const valid = subRecords.filter(r => r.status !== 'cancelled' && r.status !== 'holiday');
      const present = valid.filter(r => r.status === 'present').length;
      const total = valid.length;
      
      let strategy = "";
      let strategyType: 'recovery' | 'safe' | 'none' = 'none';
      if (total > 0) {
        const pct = (present / total) * 100;
        if (pct < 75) {
          const needed = Math.ceil((0.75 * total - present) / 0.25);
          strategy = `Attend next ${needed} sessions`;
          strategyType = 'recovery';
        } else {
          const skip = Math.floor((present - 0.75 * total) / 0.75);
          strategy = skip > 0 ? `${skip} skips safe` : "Stay regular";
          strategyType = 'safe';
        }
      } else {
        strategy = "No history recorded";
      }

      return { name: sub.name, present, total, percentage: total === 0 ? 0 : Math.round((present / total) * 100), strategy, strategyType };
    });

    const totalP = summary.reduce((a, s) => a + s.present, 0);
    const totalC = summary.reduce((a, s) => a + s.total, 0);
    const overall = totalC === 0 ? 0 : Math.round((totalP / totalC) * 100);
    return { summary, totalP, totalC, overall };
  };

  const stats = useMemo(() => calculateStats(records), [records, subjectsList]);

  const groupedHistory = useMemo(() => {
    const groups: Record<string, AttendanceRecord[]> = {};
    records.forEach(r => {
      if (!groups[r.date]) groups[r.date] = [];
      groups[r.date].push(r);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [records]);

  const allStudentData = useMemo(() => {
    if (!isAdmin) return [];
    return studentsList.map(s => {
      const d = localStorage.getItem(`nmims_backend_db_${s.sapId}`);
      const st = calculateStats(d ? JSON.parse(d) : []);
      return { ...s, ...st };
    }).filter(s => s.sapId !== ADMIN_SAP_ID);
  }, [isAdmin, studentsList, subjectsList]);

  const selectedStudentDetails = useMemo(() => {
    if (!selectedAdminStudent) return null;
    const student = studentsList.find(s => s.sapId === selectedAdminStudent);
    if (!student) return null;
    const d = localStorage.getItem(`nmims_backend_db_${student.sapId}`);
    const st = calculateStats(d ? JSON.parse(d) : []);
    return { ...student, stats: st };
  }, [selectedAdminStudent, studentsList, subjectsList]);

  const todayStr = format(selectedDate, 'yyyy-MM-dd');
  const selectedDayName = format(selectedDate, 'EEEE') as DayOfWeek;

  // Dynamic Greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  }, []);

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-in fade-in zoom-in duration-700">
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-indigo-600 rounded-[30px] flex items-center justify-center text-white font-black text-3xl mx-auto mb-6 shadow-2xl">NM</div>
            <h1 className="text-3xl font-black text-white tracking-tighter">Portal Auth</h1>
          </div>
          <form onSubmit={handleLogin} className="bg-slate-900/40 backdrop-blur-xl border border-white/5 p-8 rounded-[40px] shadow-2xl space-y-6">
            <input name="sap" type="text" placeholder="SAP ID" className="w-full bg-black/40 border border-white/10 rounded-xl py-4 px-6 text-white focus:border-indigo-500 outline-none font-bold" required />
            <input name="pass" type="password" placeholder="Password" className="w-full bg-black/40 border border-white/10 rounded-xl py-4 px-6 text-white focus:border-indigo-500 outline-none font-bold" required />
            <button type="submit" className="w-full py-4 bg-indigo-600 text-white font-black uppercase rounded-xl shadow-lg active:scale-95 transition-all">Authorize Access</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-slate-100 flex flex-col md:flex-row max-w-[1920px] mx-auto overflow-hidden">
      {/* Sidebar (Desktop) */}
      <aside className="hidden md:flex flex-col w-72 lg:w-80 bg-[#080808] border-r border-white/5 p-10 sticky top-0 h-screen z-50">
        <div className="flex items-center gap-5 mb-16">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-2xl">NM</div>
          <div className="min-w-0">
            <h2 className="font-black text-white truncate leading-tight">{currentUser.name}</h2>
            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-1">ID: {currentUser.sapId}</p>
          </div>
        </div>
        <nav className="space-y-3 flex-grow">
          <NavItem icon={<Layout />} label="Overview" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <NavItem icon={<Calendar />} label="Schedule" active={activeTab === 'schedule'} onClick={() => setActiveTab('schedule')} />
          {!isAdmin && (
            <>
              <NavItem icon={<BookOpen />} label="Subject Mode" active={activeTab === 'subjects'} onClick={() => setActiveTab('subjects')} />
              <NavItem icon={<History />} label="Archives" active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
            </>
          )}
          {isAdmin && <NavItem icon={<Database />} label="Root Admin" active={activeTab === 'admin'} onClick={() => setActiveTab('admin')} />}
        </nav>
        <button onClick={() => { localStorage.removeItem('nmims_session_user'); window.location.reload(); }} className="mt-auto flex items-center gap-4 px-6 py-4 rounded-xl text-rose-500 font-black text-xs uppercase hover:bg-rose-500/10 transition-all"><LogOut className="w-5 h-5" /> Terminate</button>
      </aside>

      {/* Main Container */}
      <main className="flex-grow h-screen overflow-y-auto custom-scrollbar relative flex flex-col pb-32 md:pb-0">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between p-4 bg-[#080808]/90 backdrop-blur-xl border-b border-white/5 sticky top-0 z-[60]">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black text-xs shadow-lg">NM</div>
             <span className="font-black text-[10px] text-white uppercase tracking-widest truncate max-w-[100px]">{currentUser.name}</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowNotificationCenter(true)} className="p-2 text-slate-400 relative">
              <Bell className="w-5 h-5" />
              {broadcast && <span className="absolute top-1 right-1 w-2 h-2 bg-indigo-600 rounded-full border-2 border-[#080808]" />}
            </button>
            <button onClick={() => { localStorage.removeItem('nmims_session_user'); window.location.reload(); }} className="p-2 text-rose-500"><LogOut className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-5 sm:p-12 lg:p-20 space-y-12">
          {activeTab === 'dashboard' && (
            <div className="space-y-14 animate-in fade-in slide-in-from-bottom-8 duration-700">
              {/* Modern Hero Section */}
              <header className="relative overflow-hidden p-10 sm:p-16 rounded-[64px] bg-indigo-600 shadow-2xl flex flex-col lg:flex-row items-center justify-between gap-12 group">
                <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -mr-48 -mt-48 group-hover:scale-125 transition-transform duration-1000" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-black/10 rounded-full blur-3xl -ml-32 -mb-32 group-hover:scale-125 transition-transform duration-1000" />
                
                <div className="relative z-10 text-center lg:text-left">
                  <span className="bg-white/20 px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.3em] text-white/90 backdrop-blur-md mb-6 inline-block">System Operational</span>
                  <h1 className="text-4xl sm:text-7xl font-black text-white tracking-tighter leading-tight">
                    {greeting}, <br className="hidden sm:block" /> {currentUser.name.split(' ')[0]}
                  </h1>
                  <p className="text-indigo-100/70 font-bold text-lg mt-4 max-w-md">Your attendance matrix is currently synchronization at {stats.overall}% efficiency.</p>
                  
                  <div className="flex flex-wrap gap-4 mt-10 justify-center lg:justify-start">
                    <button onClick={() => setActiveTab('schedule')} className="px-10 py-5 bg-white text-indigo-600 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl hover:scale-105 active:scale-95 transition-all">View Schedule</button>
                    <button onClick={() => setActiveTab('history')} className="px-10 py-5 bg-indigo-700 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-indigo-800 transition-all">Session Logs</button>
                  </div>
                </div>

                <div className="relative z-10 flex flex-col items-center">
                  <div className="w-56 h-56 sm:w-72 sm:h-72 relative">
                    <div className="absolute inset-0 border-[12px] border-white/10 rounded-full" />
                    <div className="absolute inset-0 border-[12px] border-white rounded-full transition-all duration-1000" style={{ clipPath: `inset(0 0 ${100 - stats.overall}% 0)` }} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-6xl sm:text-8xl font-black text-white tracking-tighter">{stats.overall}%</span>
                      <span className="text-[10px] font-black uppercase tracking-widest text-indigo-100/60 mt-2">Aggregate</span>
                    </div>
                  </div>
                </div>
              </header>

              {/* Status Row Widgets */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatusWidget icon={<Zap className="text-yellow-400" />} label="Total Present" value={stats.totalP} suffix={`/ ${stats.totalC}`} />
                <StatusWidget icon={<TrendingUp className="text-emerald-400" />} label="Avg. Efficiency" value={`${stats.overall}%`} />
                <StatusWidget icon={<Target className="text-indigo-400" />} label="Target Goal" value="75%" />
                <StatusWidget icon={<History className="text-purple-400" />} label="Total Logs" value={records.length} />
              </div>

              {/* REDESIGNED SUBJECT CARDS GRID */}
              <section className="space-y-10">
                <div className="flex items-center justify-between">
                  <h2 className="text-3xl font-black text-white flex items-center gap-6"><BookOpen className="w-10 h-10 text-indigo-500" /> Subject Nodes</h2>
                  <div className="hidden sm:flex items-center gap-3">
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500" /><span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Stable</span></div>
                    <div className="flex items-center gap-2 ml-4"><div className="w-3 h-3 rounded-full bg-rose-500" /><span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Critical</span></div>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {stats.summary.map(sub => (
                    <div key={sub.name} className="group relative bg-[#0d0d0d] rounded-[48px] border border-white/5 hover:border-indigo-500/20 transition-all duration-500 overflow-hidden shadow-2xl flex flex-col p-10 hover:translate-y-[-8px]">
                      {/* Subject Percentage Header */}
                      <div className="flex justify-between items-start mb-8">
                        <div className="min-w-0 pr-6">
                          <h4 className="font-black text-white text-2xl leading-tight truncate group-hover:text-indigo-400 transition-colors">{sub.name}</h4>
                          <p className="text-[11px] text-slate-600 font-black uppercase tracking-widest mt-2">ID: {sub.name.substring(0,3).toUpperCase()}-NODE</p>
                        </div>
                        <div className={`text-5xl font-black tracking-tighter ${sub.percentage >= 75 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {sub.percentage}%
                        </div>
                      </div>

                      {/* Main Progress Indicator */}
                      <div className="relative h-4 bg-black/40 rounded-full overflow-hidden mb-10 shadow-inner">
                        <div 
                          className={`h-full transition-all duration-1000 ${sub.percentage >= 75 ? 'bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)]' : 'bg-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.3)]'}`} 
                          style={{ width: `${Math.min(sub.percentage, 100)}%` }} 
                        />
                        <div className="absolute top-0 left-[75%] w-0.5 h-full bg-white/20 z-10" />
                      </div>

                      {/* Info & Strategy */}
                      <div className="flex justify-between items-center mt-auto bg-black/30 p-6 rounded-3xl border border-white/5 group-hover:bg-indigo-600/5 transition-all">
                        <div className="space-y-1">
                          <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Sessions</p>
                          <p className="text-xl font-black text-white">{sub.present} / {sub.total}</p>
                        </div>
                        <div className="text-right space-y-1">
                          <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Strategic Intel</p>
                          <p className={`font-bold text-xs ${sub.percentage < 75 ? 'text-rose-400' : 'text-emerald-400'}`}>{sub.strategy}</p>
                        </div>
                      </div>
                      
                      {/* Hover Highlight Overlay */}
                      <div className="absolute inset-0 bg-indigo-600 opacity-0 group-hover:opacity-[0.02] transition-opacity pointer-events-none" />
                    </div>
                  ))}
                </div>
              </section>

              {/* Stats Visualizer */}
              <section className="space-y-10">
                <div className="flex items-center justify-between">
                  <h2 className="text-3xl font-black text-white flex items-center gap-6"><BarChart2 className="w-10 h-10 text-indigo-500" /> Matrix Analytics</h2>
                  <button onClick={() => setActiveTab('subjects')} className="p-4 bg-slate-900/40 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:text-white transition-all flex items-center gap-3">Full Report <ChevronRight className="w-4 h-4" /></button>
                </div>
                <div className="bg-[#0d0d0d] p-10 sm:p-14 rounded-[64px] border border-white/5 shadow-2xl relative h-[500px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.summary} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
                      <defs>
                        <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#6366f1" stopOpacity={0.8}/>
                          <stop offset="100%" stopColor="#6366f1" stopOpacity={0.2}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1a1a1a" />
                      <XAxis dataKey="name" stroke="#334155" fontSize={10} fontWeight="bold" tick={{ fill: '#475569' }} axisLine={false} tickLine={false} dy={20} />
                      <YAxis hide domain={[0, 100]} />
                      <Tooltip 
                        cursor={{ fill: '#ffffff05' }} 
                        contentStyle={{ backgroundColor: '#080808', borderRadius: '32px', border: '1px solid rgba(255,255,255,0.05)', fontSize: '12px', fontWeight: 'bold', padding: '16px' }}
                        itemStyle={{ color: '#fff' }}
                      />
                      <Bar dataKey="percentage" fill="url(#barGradient)" radius={[16, 16, 16, 16]} barSize={50} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'schedule' && (
            <div className="space-y-12 animate-in fade-in slide-in-from-right-8 duration-700">
              <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-slate-900/30 p-10 rounded-[48px] border border-white/5 gap-8">
                <div className="flex items-center gap-10 justify-between w-full sm:w-auto">
                  <button onClick={() => setSelectedDate(subDays(selectedDate, 1))} className="p-6 bg-black/40 rounded-[32px] text-slate-500 hover:text-white transition-all"><ChevronLeft className="w-8 h-8" /></button>
                  <div className="text-center min-w-[200px]"><h2 className="text-4xl font-black text-white tracking-tighter">{format(selectedDate, 'EEEE')}</h2><p className="text-slate-500 text-[11px] font-black uppercase mt-2 tracking-widest">{format(selectedDate, 'MMM do, yyyy')}</p></div>
                  <button onClick={() => setSelectedDate(addDays(selectedDate, 1))} className="p-6 bg-black/40 rounded-[32px] text-slate-500 hover:text-white transition-all"><ChevronRight className="w-8 h-8" /></button>
                </div>
                <div className="flex gap-4">
                  <button onClick={() => setSelectedDate(startOfToday())} className="px-12 py-6 bg-slate-900 text-slate-400 rounded-3xl font-black uppercase text-[10px] tracking-widest whitespace-nowrap active:scale-95 transition-all">Today</button>
                  <button onClick={() => setShowExtraModal(true)} className="px-12 py-6 bg-indigo-600 text-white rounded-3xl font-black uppercase text-[10px] tracking-widest flex items-center gap-4 whitespace-nowrap shadow-2xl active:scale-95 transition-all"><Plus className="w-6 h-6" /> Extra</button>
                </div>
              </header>

              <div className="grid gap-6">
                {timetable.filter(l => l.day === selectedDayName).length > 0 ? (
                  timetable.filter(l => l.day === selectedDayName).map(lecture => {
                    const record = records.find(r => r.id === `${todayStr}-${lecture.id}`);
                    return (
                      <div key={lecture.id} className="bg-slate-900/20 p-10 rounded-[56px] border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-10 group hover:bg-slate-900/30 transition-all shadow-xl relative overflow-hidden">
                        <div className="flex items-center gap-10">
                          <div className="w-24 h-24 bg-black/40 rounded-[40px] flex items-center justify-center border border-white/5 group-hover:border-indigo-500/20 transition-all shadow-inner"><Clock className="w-12 h-12 text-slate-700 group-hover:text-indigo-400" /></div>
                          <div>
                            <h4 className="font-black text-slate-100 text-3xl tracking-tight leading-tight mb-4">{record?.actualSubjectName || lecture.subject}</h4>
                            <div className="flex flex-wrap items-center gap-8 text-slate-600 text-[11px] font-black uppercase tracking-widest">
                              <span className="flex items-center gap-3"><Clock className="w-4 h-4" /> {lecture.time}</span>
                              <span className="flex items-center gap-3"><UserIcon className="w-4 h-4" /> {lecture.faculty}</span>
                            </div>
                          </div>
                        </div>
                        <button 
                          onClick={() => setShowStatusModal({lectureId: lecture.id, subject: lecture.subject})} 
                          className={`w-full sm:w-auto px-16 py-7 rounded-[40px] font-black text-[11px] uppercase border tracking-widest transition-all pointer-events-auto active:scale-95 ${ record?.status === 'present' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-emerald-500/5' : record?.status === 'absent' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-rose-500/5' : record?.status === 'cancelled' || record?.status === 'holiday' ? 'bg-slate-500/10 text-slate-500 border-slate-500/20' : 'bg-black/40 text-slate-500 border-white/10' }`}
                        >
                          {record?.status || 'Record Entry'}
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-32 text-center opacity-30 flex flex-col items-center gap-8">
                    <Calendar className="w-20 h-20" />
                    <p className="font-black uppercase text-sm tracking-widest">No Sessions Scheduled</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'subjects' && (
            <div className="space-y-12 animate-in fade-in duration-700">
              <header>
                <h1 className="text-5xl sm:text-7xl font-black text-white tracking-tighter">Tactical Strategy</h1>
                <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-[11px] sm:text-xs mt-2">Predictive Modeling Engine</p>
              </header>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                {stats.summary.map(sub => (
                  <div key={sub.name} className="bg-slate-900/40 rounded-[56px] border border-white/5 overflow-hidden shadow-2xl flex flex-col group hover:border-indigo-500/20 transition-all">
                    <div className="p-10 bg-black/40 border-b border-white/5 flex justify-between items-start gap-6">
                      <div className="min-w-0">
                        <h3 className="font-black text-white text-2xl leading-tight mb-3 tracking-tight group-hover:text-indigo-400 transition-colors line-clamp-2">{sub.name}</h3>
                        <p className="text-[11px] text-slate-600 font-black uppercase tracking-widest">Module Analytics</p>
                      </div>
                      <Calculator className="w-8 h-8 text-indigo-500 shrink-0" />
                    </div>
                    <div className="p-12 space-y-12">
                      <div className="flex justify-between items-end">
                        <div>
                          <p className="text-slate-600 text-[11px] font-black uppercase tracking-widest mb-2">Percentage</p>
                          <p className={`text-6xl font-black tracking-tighter ${sub.percentage >= 75 ? 'text-emerald-400' : 'text-rose-400'}`}>{sub.percentage}%</p>
                        </div>
                        <div className="text-right">
                          <p className="text-slate-600 text-[11px] font-black uppercase tracking-widest mb-2">Ratio</p>
                          <p className="text-3xl font-black text-slate-300 tracking-tighter">{sub.present}/{sub.total}</p>
                        </div>
                      </div>
                      <div className={`p-8 rounded-[40px] border ${sub.strategyType === 'recovery' ? 'bg-rose-500/5 border-rose-500/20 text-rose-300 shadow-rose-500/5' : 'bg-indigo-500/5 border-indigo-500/20 text-indigo-300 shadow-indigo-500/5'}`}>
                        <p className="text-[11px] font-black uppercase tracking-widest opacity-60 mb-3">System Intelligence</p>
                        <p className="font-bold text-base leading-snug">{sub.strategy}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-12 animate-in fade-in duration-700">
              <header className="flex flex-col sm:flex-row justify-between items-center bg-slate-900/30 p-10 rounded-[56px] border border-white/5 gap-8">
                <div><h2 className="text-4xl font-black text-white tracking-tighter">Session Logs</h2><p className="text-[11px] text-slate-500 font-black uppercase mt-4 tracking-widest">Archive Management</p></div>
                <div className="flex gap-4 w-full sm:w-auto">
                  <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*,.pdf" className="hidden" />
                  <button 
                    onClick={() => fileInputRef.current?.click()} 
                    disabled={isParsingPDF}
                    className="flex-grow sm:flex-none px-12 py-6 bg-indigo-600 text-white rounded-[32px] font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-4 shadow-2xl active:scale-95 disabled:opacity-50 transition-all"
                  >
                    {isParsingPDF ? <Loader2 className="w-6 h-6 animate-spin" /> : <FileUp className="w-6 h-6" />}
                    {isParsingPDF ? 'Analyzing...' : 'Cloud Import'}
                  </button>
                </div>
              </header>
              <div className="space-y-10">
                {groupedHistory.length > 0 ? (
                  groupedHistory.map(([date, dayRecords]) => (
                    <div key={date} className="bg-slate-900/20 rounded-[56px] border border-white/5 overflow-hidden shadow-2xl">
                      <div className="bg-black/40 px-12 py-8 border-b border-white/5"><h3 className="font-black text-xs text-slate-500 uppercase tracking-widest">{format(parseISO(date), 'EEEE, MMM do, yyyy')}</h3></div>
                      <div className="divide-y divide-white/5">
                        {dayRecords.map(r => (
                          <div key={r.id} className="px-12 py-10 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-black/20 transition-all gap-8">
                            <div className="min-w-0 pr-6">
                              <p className="text-white font-black text-2xl tracking-tight truncate leading-tight">{r.actualSubjectName}</p>
                              <p className="text-[10px] text-slate-600 uppercase font-bold tracking-widest mt-2">{r.originalSubjectName === 'Extra' ? 'Custom Session' : 'Scheduled Node'}</p>
                            </div>
                            <div className="flex items-center justify-between sm:justify-end gap-10 shrink-0">
                              <span className={`px-8 py-3 rounded-2xl text-[12px] font-black uppercase border shadow-lg ${r.status === 'present' ? 'text-emerald-400 border-emerald-500/20' : r.status === 'absent' ? 'text-rose-400 border-rose-500/20' : 'text-slate-500 border-white/10'}`}>{r.status}</span>
                              <button onClick={() => { if(confirm('Delete record?')) setRecords(prev => prev.filter(x => x.id !== r.id)); }} className="p-6 bg-rose-500/10 text-rose-500 rounded-[28px] hover:bg-rose-600 hover:text-white transition-all shadow-lg"><Trash2 className="w-7 h-7" /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-48 text-center opacity-20 flex flex-col items-center gap-10">
                    <History className="w-28 h-28" />
                    <p className="font-black uppercase text-base tracking-widest">Database Synchronized - No Logs</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'admin' && isAdmin && (
            <div className="space-y-12 animate-in fade-in duration-700">
              <header className="flex flex-col lg:flex-row justify-between items-center bg-indigo-600 p-12 sm:p-16 rounded-[64px] gap-12 shadow-2xl">
                <div><h2 className="text-5xl sm:text-7xl font-black text-white tracking-tighter leading-none">Root Admin</h2><p className="text-indigo-100 text-[11px] font-black uppercase mt-6 tracking-[0.2em] opacity-80">Master Control Interface</p></div>
                <div className="flex bg-indigo-700/50 p-3 rounded-[40px] backdrop-blur-3xl overflow-x-auto no-scrollbar w-full sm:w-auto shadow-2xl">
                  <button onClick={() => setAdminView('students')} className={`px-14 py-6 rounded-[32px] font-black uppercase text-[11px] tracking-widest transition-all ${adminView === 'students' ? 'bg-white text-indigo-600 shadow-2xl' : 'text-white/70 hover:text-white'}`}>Nodes</button>
                  <button onClick={() => setAdminView('timetable')} className={`px-14 py-6 rounded-[32px] font-black uppercase text-[11px] tracking-widest transition-all ${adminView === 'timetable' ? 'bg-white text-indigo-600 shadow-2xl' : 'text-white/70 hover:text-white'}`}>Rules</button>
                  <button onClick={() => setAdminView('broadcast')} className={`px-14 py-6 rounded-[32px] font-black uppercase text-[11px] tracking-widest transition-all ${adminView === 'broadcast' ? 'bg-white text-indigo-600 shadow-2xl' : 'text-white/70 hover:text-white'}`}>Comms</button>
                </div>
              </header>

              {adminView === 'students' && (
                <div className="space-y-12">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                    <div className="bg-slate-900/30 p-12 rounded-[56px] border border-white/5 flex flex-col justify-center shadow-2xl"><p className="text-slate-500 text-[11px] font-black uppercase tracking-widest opacity-60">Verified Users</p><h4 className="text-7xl font-black text-white mt-6 tracking-tighter">{allStudentData.length}</h4></div>
                    <button onClick={() => setShowAddStudentModal(true)} className="sm:col-span-2 bg-indigo-600/5 border-2 border-dashed border-indigo-500/20 rounded-[56px] flex flex-col items-center justify-center gap-6 group hover:bg-indigo-600/10 transition-all p-12 active:scale-[0.98]">
                      <UserPlus className="w-16 h-16 text-indigo-500 group-hover:scale-110 transition-all" />
                      <span className="text-2xl font-black uppercase tracking-widest text-indigo-400">Enroll Student</span>
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {allStudentData.map(s => (
                      <div key={s.sapId} className="bg-slate-900/20 rounded-[48px] border border-white/5 p-10 flex flex-col gap-10 hover:bg-slate-900/30 transition-all shadow-2xl relative group">
                        <div className="flex justify-between items-start">
                          <div className="min-w-0 pr-6">
                            <h4 className="font-black text-white text-3xl tracking-tight leading-tight truncate">{s.name}</h4>
                            <p className="text-[12px] text-slate-600 font-bold uppercase tracking-widest mt-2">SAP ID: {s.sapId}</p>
                          </div>
                          <div className={`text-4xl font-black tracking-tighter shrink-0 ${s.overall >= 75 ? 'text-emerald-400' : 'text-rose-400'}`}>{s.overall}%</div>
                        </div>
                        <div className="flex gap-4">
                          <button onClick={() => setSelectedAdminStudent(s.sapId)} className="flex-grow py-7 bg-indigo-600/10 text-indigo-400 rounded-[32px] font-black uppercase text-[11px] tracking-widest hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center gap-4 shadow-lg active:scale-95">
                            <Settings className="w-6 h-6" /> View Analytics
                          </button>
                          <button onClick={() => { if(confirm('Erase profile?')) setStudentsList(p => p.filter(x => x.sapId !== s.sapId)); }} className="p-7 bg-rose-600/10 text-rose-500 rounded-[32px] hover:bg-rose-600 hover:text-white transition-all shadow-lg active:scale-95">
                            <Trash2 className="w-7 h-7" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {adminView === 'broadcast' && (
                <div className="bg-slate-900/30 p-12 rounded-[64px] border border-white/5 space-y-10 animate-in zoom-in duration-300 shadow-2xl">
                  <h3 className="text-4xl font-black text-white flex items-center gap-6"><Megaphone className="w-10 h-10 text-indigo-500" /> Global Dispatch</h3>
                  <textarea value={broadcastInput} onChange={(e) => setBroadcastInput(e.target.value)} placeholder="Enter emergency broadcast message for all system users..." className="w-full bg-black/40 border border-white/10 rounded-[40px] p-10 text-white outline-none focus:border-indigo-500 h-64 font-bold text-xl transition-all shadow-inner" />
                  <button onClick={() => { if(broadcastInput) { setBroadcast({message: broadcastInput, timestamp: Date.now()}); setBroadcastInput(''); alert('Message deployed.'); } }} className="w-full sm:w-auto px-16 py-8 bg-indigo-600 text-white rounded-[36px] font-black uppercase text-[12px] tracking-widest shadow-2xl flex items-center justify-center gap-6 active:scale-95 transition-all"><Send className="w-7 h-7" /> Deploy Transmission</button>
                </div>
              )}

              {adminView === 'timetable' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 pb-20">
                  {DAYS.map(day => (
                    <div key={day} className="bg-slate-900/20 rounded-[64px] border border-white/5 overflow-hidden shadow-2xl flex flex-col hover:border-indigo-500/10 transition-all">
                      <div className="bg-black/40 p-12 flex justify-between items-center border-b border-white/5">
                        <h3 className="font-black text-3xl text-white tracking-widest uppercase leading-none">{day}</h3>
                        <button onClick={() => setShowAddLectureModal(day)} className="p-6 bg-indigo-600 rounded-[32px] text-white shadow-2xl active:scale-95 transition-all"><Plus className="w-7 h-7" /></button>
                      </div>
                      <div className="p-12 space-y-8">
                        {timetable.filter(l => l.day === day).length > 0 ? (
                          timetable.filter(l => l.day === day).map(lecture => (
                            <div key={lecture.id} className="flex items-center justify-between p-10 bg-black/30 rounded-[48px] border border-white/5 group hover:border-indigo-500 transition-all gap-8">
                              <div className="min-w-0 pr-6">
                                <p className="font-black text-white text-2xl tracking-tight leading-tight mb-4 truncate">{lecture.subject}</p>
                                <p className="text-[12px] text-slate-600 uppercase font-black tracking-widest flex items-center gap-4"><Clock className="w-5 h-5" /> {lecture.time}</p>
                              </div>
                              <button onClick={() => setTimetable(prev => prev.filter(x => x.id !== lecture.id))} className="p-6 bg-rose-500/10 text-rose-500 rounded-[28px] hover:bg-rose-600 hover:text-white transition-all active:scale-95 shrink-0 shadow-lg"><Trash2 className="w-6 h-6" /></button>
                            </div>
                          ))
                        ) : (
                          <div className="py-14 text-center opacity-20">
                            <p className="text-[11px] font-black uppercase tracking-widest">No Operational Nodes</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Persistent Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#080808]/90 backdrop-blur-3xl border-t border-white/5 flex items-center justify-around p-5 pb-10 z-[100]">
        <MobileNavItem icon={<Layout />} active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
        <MobileNavItem icon={<Calendar />} active={activeTab === 'schedule'} onClick={() => setActiveTab('schedule')} />
        <MobileNavItem icon={<Calculator />} active={activeTab === 'subjects'} onClick={() => setActiveTab('subjects')} />
        <MobileNavItem icon={<History />} active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
        {isAdmin && <MobileNavItem icon={<Database />} active={activeTab === 'admin'} onClick={() => setActiveTab('admin')} />}
      </nav>

      {/* Modals */}
      {showStatusModal && (
        <div className="fixed inset-0 z-[250] flex items-end sm:items-center justify-center p-0 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-3xl" onClick={() => setShowStatusModal(null)} />
          <div className="relative bg-[#080808] w-full sm:max-w-2xl rounded-t-[64px] sm:rounded-[72px] p-12 sm:p-16 shadow-2xl border-t sm:border border-white/10 overflow-y-auto max-h-[95vh]">
            <div className="flex justify-between items-start mb-14">
              <div className="min-w-0 pr-10">
                <h3 className="text-4xl font-black text-white tracking-tighter leading-tight">Update Node</h3>
                <p className="text-slate-500 uppercase text-[11px] mt-4 font-bold tracking-[0.2em] truncate">{showStatusModal.subject}</p>
              </div>
              <button onClick={() => setShowStatusModal(null)} className="p-6 bg-white/5 rounded-[32px] text-slate-500 shrink-0"><X className="w-10 h-10" /></button>
            </div>
            <div className="grid gap-4 mb-10">
              <StatusBtn icon={<CheckCircle className="text-emerald-500" />} label="Present" color="hover:bg-emerald-500/10 border-emerald-500/10 shadow-emerald-500/5" onClick={() => markAttendance(showStatusModal.lectureId, showStatusModal.subject, 'present')} />
              <StatusBtn icon={<XCircle className="text-rose-500" />} label="Absent" color="hover:bg-rose-500/10 border-rose-500/10 shadow-rose-500/5" onClick={() => markAttendance(showStatusModal.lectureId, showStatusModal.subject, 'absent')} />
              <div className="grid grid-cols-2 gap-4">
                <StatusBtn icon={<Ban className="text-slate-400" />} label="Cancel" color="hover:bg-white/5" onClick={() => markAttendance(showStatusModal.lectureId, showStatusModal.subject, 'cancelled')} />
                <StatusBtn icon={<Umbrella className="text-amber-500" />} label="Holiday" color="hover:bg-amber-500/5" onClick={() => markAttendance(showStatusModal.lectureId, showStatusModal.subject, 'holiday')} />
              </div>
              <StatusBtn icon={<RefreshCcw className="text-indigo-500" />} label="Substitution" color="hover:bg-indigo-500/10 border-indigo-500/10" onClick={() => setShowStatusSubModal({lectureId: showStatusModal.lectureId, originalSubject: showStatusModal.subject})} />
            </div>
          </div>
        </div>
      )}

      {selectedAdminStudent && selectedStudentDetails && (
        <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/98 backdrop-blur-3xl" onClick={() => setSelectedAdminStudent(null)} />
          <div className="relative bg-[#080808] w-full sm:max-w-2xl h-[95vh] sm:h-[90vh] rounded-t-[72px] sm:rounded-[80px] border-t sm:border border-white/10 p-10 sm:p-14 flex flex-col shadow-2xl">
            <div className="flex justify-between items-start mb-12">
              <div className="min-w-0 pr-10">
                <h3 className="text-4xl font-black text-white tracking-tighter truncate leading-tight">{selectedStudentDetails.name}</h3>
                <div className="flex items-center gap-6 mt-4">
                  <p className="text-slate-500 uppercase text-[11px] font-black tracking-widest">Aggregate: {selectedStudentDetails.stats.overall}%</p>
                  <span className="w-1.5 h-1.5 bg-slate-800 rounded-full" />
                  <p className="text-slate-500 uppercase text-[11px] font-black tracking-widest">ID: {selectedStudentDetails.sapId}</p>
                </div>
              </div>
              <button onClick={() => setSelectedAdminStudent(null)} className="p-6 bg-white/5 rounded-[32px] text-slate-500 shrink-0"><X className="w-10 h-10" /></button>
            </div>
            <div className="flex-grow overflow-y-auto space-y-6 custom-scrollbar pr-3 pb-24">
              {selectedStudentDetails.stats.summary.map(sub => (
                <div key={sub.name} className="bg-black/40 border border-white/5 p-10 rounded-[56px] flex justify-between items-center group hover:border-indigo-500/20 transition-all shadow-2xl">
                  <div className="min-w-0 pr-10">
                    <p className="font-black text-white text-2xl truncate tracking-tight leading-tight">{sub.name}</p>
                    <p className="text-[11px] text-slate-600 font-black uppercase mt-3 tracking-widest">Ratio: {sub.present} / {sub.total}</p>
                  </div>
                  <h4 className={`text-5xl font-black tracking-tighter shrink-0 ${sub.percentage >= 75 ? 'text-emerald-400' : 'text-rose-400'}`}>{sub.percentage}%</h4>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showAddStudentModal && (
        <div className="fixed inset-0 z-[320] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-300">
          <div className="absolute inset-0 bg-black/98 backdrop-blur-3xl" onClick={() => setShowAddStudentModal(false)} />
          <div className="relative bg-[#080808] w-full max-w-lg rounded-[64px] border border-white/10 p-14 shadow-2xl">
            <h3 className="text-4xl font-black text-white tracking-tighter mb-10 text-center">Enroll Student</h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const n = f.get('name') as string;
              const s = f.get('sap') as string;
              if(n && s) {
                setStudentsList(p => [...p, { name: n, sapId: s }]);
                setShowAddStudentModal(false);
              }
            }} className="space-y-8">
              <input name="name" type="text" placeholder="Full Student Name" className="w-full bg-black/40 border border-white/10 rounded-[32px] py-7 px-10 text-white outline-none focus:border-indigo-500 font-bold text-lg shadow-inner" required />
              <input name="sap" type="text" placeholder="Official SAP ID" className="w-full bg-black/40 border border-white/10 rounded-[32px] py-7 px-10 text-white outline-none focus:border-indigo-500 font-bold text-lg shadow-inner" required />
              <div className="flex gap-4 pt-10">
                <button type="button" onClick={() => setShowAddStudentModal(false)} className="flex-1 py-7 bg-white/5 text-slate-500 rounded-[32px] font-black uppercase text-[11px] tracking-widest transition-all">Discard</button>
                <button type="submit" className="flex-1 py-7 bg-indigo-600 text-white rounded-[32px] font-black uppercase text-[11px] tracking-widest shadow-2xl active:scale-95 transition-all">Enroll User</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showExtraModal && (
        <div className="fixed inset-0 z-[260] flex items-end sm:items-center justify-center p-0 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-3xl" onClick={() => setShowExtraModal(false)} />
          <div className="relative bg-[#080808] w-full sm:max-w-2xl h-[85vh] rounded-t-[64px] sm:rounded-[72px] border-t sm:border border-white/10 p-12 flex flex-col shadow-2xl">
            <div className="flex justify-between items-center mb-12">
              <h3 className="text-3xl font-black text-white tracking-tighter">Log Custom Session</h3>
              <button onClick={() => setShowExtraModal(false)} className="p-6 bg-white/5 rounded-[32px] text-slate-500"><X className="w-10 h-10" /></button>
            </div>
            <div className="flex-grow overflow-y-auto space-y-6 custom-scrollbar pr-3 pb-12">
              {subjectsList.map(sub => (
                <div key={sub.name} className="bg-black/40 p-10 rounded-[56px] border border-white/5 flex items-center justify-between gap-10 group hover:border-indigo-500/30 transition-all shadow-xl">
                  <span className="font-black text-slate-200 text-2xl truncate leading-tight tracking-tight">{sub.name}</span>
                  <div className="flex gap-4 shrink-0">
                    <button onClick={() => markAttendance(`extra-${Date.now()}`, 'Extra', 'present', sub.name)} className="w-16 h-16 bg-emerald-500 text-black rounded-[24px] font-black shadow-2xl active:scale-90 transition-all text-xl">P</button>
                    <button onClick={() => markAttendance(`extra-${Date.now()}`, 'Extra', 'absent', sub.name)} className="w-16 h-16 bg-rose-500 text-black rounded-[24px] font-black shadow-2xl active:scale-90 transition-all text-xl">A</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showSubModal && (
        <div className="fixed inset-0 z-[270] flex items-end sm:items-center justify-center p-0 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-3xl" onClick={() => setShowStatusSubModal(null)} />
          <div className="relative bg-[#080808] w-full sm:max-w-2xl h-[85vh] rounded-t-[64px] sm:rounded-[72px] border-t sm:border border-white/10 p-12 flex flex-col shadow-2xl">
            <div className="flex justify-between items-center mb-12">
              <h3 className="text-3xl font-black text-white tracking-tighter">Substitute With</h3>
              <button onClick={() => setShowStatusSubModal(null)} className="p-6 bg-white/5 rounded-[32px] text-slate-500"><X className="w-10 h-10" /></button>
            </div>
            <div className="flex-grow overflow-y-auto space-y-6 custom-scrollbar pr-3 pb-12">
              {subjectsList.map(sub => (
                <div key={sub.name} className="bg-black/40 p-10 rounded-[56px] border border-white/5 flex items-center justify-between gap-10 group hover:border-indigo-500/30 transition-all shadow-xl">
                  <span className="font-black text-slate-200 text-2xl truncate leading-tight tracking-tight">{sub.name}</span>
                  <div className="flex gap-4 shrink-0">
                    <button onClick={() => markAttendance(showSubModal.lectureId, showSubModal.originalSubject, 'present', sub.name)} className="w-16 h-16 bg-emerald-500 text-black rounded-[24px] font-black shadow-2xl active:scale-90 transition-all text-xl">P</button>
                    <button onClick={() => markAttendance(showSubModal.lectureId, showSubModal.originalSubject, 'absent', sub.name)} className="w-16 h-16 bg-rose-500 text-black rounded-[24px] font-black shadow-2xl active:scale-90 transition-all text-xl">A</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showNotificationCenter && (
        <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-xl" onClick={() => setShowNotificationCenter(false)} />
          <div className="relative bg-[#080808] w-full sm:max-w-2xl rounded-t-[64px] sm:rounded-[72px] p-14 shadow-2xl border-t sm:border border-white/10 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center mb-12">
              <h3 className="text-4xl font-black text-white tracking-tighter flex items-center gap-6"><BellRing className="text-indigo-500 w-10 h-10" /> Dispatches</h3>
              <button onClick={() => setShowNotificationCenter(false)} className="p-6 bg-white/5 rounded-[32px] text-slate-500"><X className="w-10 h-10" /></button>
            </div>
            <div className="flex-grow overflow-y-auto space-y-8 custom-scrollbar pr-3 pb-10">
              {broadcast ? (
                <div className="bg-indigo-600/10 border border-indigo-500/20 p-12 rounded-[56px] space-y-6 shadow-2xl">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-black uppercase text-indigo-400 tracking-widest">Global Admin</span>
                    <span className="text-[11px] font-bold text-slate-600">{format(broadcast.timestamp, 'HH:mm')}</span>
                  </div>
                  <p className="text-white font-bold text-lg leading-relaxed">{broadcast.message}</p>
                </div>
              ) : (
                <div className="py-32 text-center opacity-20 flex flex-col items-center gap-10">
                  <Megaphone className="w-24 h-24" />
                  <p className="font-black uppercase text-base tracking-widest">Nodes Synchronized</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showAddLectureModal && (
        <div className="fixed inset-0 z-[350] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-300">
          <div className="absolute inset-0 bg-black/98 backdrop-blur-3xl" onClick={() => setShowAddLectureModal(null)} />
          <div className="relative bg-[#080808] w-full max-w-lg rounded-[72px] border border-white/10 p-14 shadow-2xl">
            <h3 className="text-4xl font-black text-white tracking-tighter mb-4 text-center">New Logic Rule</h3>
            <p className="text-center text-indigo-500 font-black uppercase tracking-[0.3em] text-[11px] mb-14">{showAddLectureModal} Protocol</p>
            <form onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const sub = f.get('sub') as string;
              const time = f.get('time') as string;
              const faculty = subjectsList.find(s => s.name === sub)?.faculty || 'TBD';
              if(sub && time) {
                setTimetable(p => [...p, {id: `custom-${Date.now()}`, day: showAddLectureModal!, subject: sub, time, faculty}]);
                setShowAddLectureModal(null);
              }
            }} className="space-y-8">
              <select name="sub" className="w-full bg-black/40 border border-white/10 rounded-[32px] py-7 px-10 text-white outline-none focus:border-indigo-500 font-bold text-xl appearance-none shadow-inner">
                {subjectsList.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
              <input name="time" type="text" placeholder="e.g. 09:00 - 10:00" className="w-full bg-black/40 border border-white/10 rounded-[32px] py-7 px-10 text-white outline-none focus:border-indigo-500 font-bold text-xl shadow-inner" required />
              <div className="flex gap-4 pt-10">
                <button type="button" onClick={() => setShowAddLectureModal(null)} className="flex-1 py-7 bg-white/5 text-slate-500 rounded-[32px] font-black uppercase text-[11px] tracking-widest transition-all">Discard</button>
                <button type="submit" className="flex-1 py-7 bg-indigo-600 text-white rounded-[32px] font-black uppercase text-[11px] tracking-widest shadow-2xl active:scale-95 transition-all">Deploy Rule</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

// UI Atoms
const NavItem: React.FC<{ icon: React.ReactNode; label: string; active: boolean; onClick: () => void }> = ({ icon, label, active, onClick }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-6 px-10 py-6 rounded-3xl transition-all font-black text-[12px] uppercase tracking-widest ${active ? 'bg-indigo-600 text-white shadow-2xl shadow-indigo-600/40' : 'text-slate-600 hover:bg-white/5 hover:text-slate-300'}`}>
    {React.cloneElement(icon as React.ReactElement<any>, { className: `w-7 h-7` })}
    {label}
  </button>
);

const MobileNavItem: React.FC<{ icon: React.ReactNode; active: boolean; onClick: () => void }> = ({ icon, active, onClick }) => (
  <button onClick={onClick} className={`flex flex-col items-center justify-center w-16 h-16 rounded-3xl transition-all ${active ? 'bg-indigo-600 text-white shadow-2xl shadow-indigo-600/20 scale-110' : 'text-slate-600 active:scale-95'}`}>
    {React.cloneElement(icon as React.ReactElement<any>, { className: `w-7 h-7` })}
  </button>
);

const StatusBtn: React.FC<{ icon: React.ReactNode; label: string; color: string; onClick: () => void }> = ({ icon, label, color, onClick }) => (
  <button onClick={onClick} className={`flex items-center gap-6 sm:gap-10 w-full p-8 sm:p-10 bg-black/40 border border-white/5 rounded-[40px] sm:rounded-[48px] transition-all ${color} font-black uppercase text-[11px] sm:text-xs text-slate-400 text-left group tracking-widest pointer-events-auto active:scale-[0.98] shadow-lg`}>
    {React.cloneElement(icon as React.ReactElement<any>, { className: 'w-10 h-10 sm:w-12 sm:h-12 shrink-0 transition-all group-hover:scale-110' })}
    {label}
  </button>
);

const StatusWidget: React.FC<{ icon: React.ReactNode; label: string; value: string | number; suffix?: string }> = ({ icon, label, value, suffix }) => (
  <div className="bg-[#0d0d0d] p-8 rounded-[40px] border border-white/5 flex items-center gap-6 shadow-xl hover:border-indigo-500/20 transition-all">
    <div className="w-16 h-16 bg-black/40 rounded-[24px] flex items-center justify-center shadow-inner">{icon}</div>
    <div>
      <p className="text-[9px] font-black uppercase text-slate-600 tracking-widest mb-1">{label}</p>
      <div className="flex items-baseline gap-2">
        <h4 className="text-2xl font-black text-white tracking-tighter">{value}</h4>
        {suffix && <span className="text-[10px] font-bold text-slate-700">{suffix}</span>}
      </div>
    </div>
  </div>
);

export default App;
