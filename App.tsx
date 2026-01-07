
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell
} from 'recharts';
import { 
  Calendar, CheckCircle, XCircle, Clock, BookOpen, BarChart2, 
  User as UserIcon, ChevronRight, AlertCircle, History, Layout, ChevronLeft,
  MinusCircle, RefreshCcw, X, Plus, Sparkles, Wand2, LogOut, Lock, Cloud, ShieldCheck, Database, FileText, ArrowLeft, Palmtree, Trash2, UserCog, Settings, UserPlus, Calculator, Bell, BellRing, Send, Megaphone
} from 'lucide-react';
import { format, addDays, subDays, startOfToday, parseISO, addMinutes } from 'date-fns';
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
  const [now, setNow] = useState(new Date());
  const [isSyncing, setIsSyncing] = useState(false);
  const [showNotificationCenter, setShowNotificationCenter] = useState(false);
  
  // Admin UI
  const [selectedAdminStudent, setSelectedAdminStudent] = useState<string | null>(null);
  const [selectedSubjectLog, setSelectedSubjectLog] = useState<string | null>(null);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [adminView, setAdminView] = useState<'students' | 'timetable' | 'broadcast'>('students');
  const [broadcastInput, setBroadcastInput] = useState('');
  
  // Modals
  const [showStatusModal, setShowStatusModal] = useState<{lectureId: string, subject: string} | null>(null);
  const [showSubModal, setShowSubModal] = useState<{lectureId: string, originalSubject: string} | null>(null);
  const [showExtraModal, setShowExtraModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddLectureModal, setShowAddLectureModal] = useState<DayOfWeek | null>(null);
  
  // Core Data
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isAdmin = currentUser?.sapId === ADMIN_SAP_ID;

  // Persistence
  useEffect(() => {
    localStorage.setItem('nmims_system_students', JSON.stringify(studentsList));
    localStorage.setItem('nmims_system_timetable', JSON.stringify(timetable));
    localStorage.setItem('nmims_system_subjects', JSON.stringify(subjectsList));
    if (broadcast) localStorage.setItem('nmims_system_broadcast', JSON.stringify(broadcast));
  }, [studentsList, timetable, subjectsList, broadcast]);

  useEffect(() => {
    if (currentUser) {
      const saved = localStorage.getItem(`nmims_backend_db_${currentUser.sapId}`);
      if (saved) setRecords(JSON.parse(saved));
      else setRecords([]);
    }
  }, [currentUser]);

  // Real-time Monitoring
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // Sync Simulation
  const syncToBackend = async (newRecords: AttendanceRecord[]) => {
    if (!currentUser) return;
    setIsSyncing(true);
    await new Promise(r => setTimeout(r, 600));
    localStorage.setItem(`nmims_backend_db_${currentUser.sapId}`, JSON.stringify(newRecords));
    setRecords(newRecords);
    setIsSyncing(false);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const sap = (form.elements[0] as HTMLInputElement).value;
    const pass = (form.elements[1] as HTMLInputElement).value;
    const user = studentsList.find(s => s.sapId === sap);
    if (user && pass === DEFAULT_PASSWORD) {
      setCurrentUser(user);
      localStorage.setItem('nmims_session_user', JSON.stringify(user));
    } else {
      alert('Invalid Credentials');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('nmims_session_user');
    setActiveTab('dashboard');
  };

  const todayStr = format(selectedDate, 'yyyy-MM-dd');
  const selectedDayName = format(selectedDate, 'EEEE') as DayOfWeek;

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
          strategy = `Next ${needed} needed`;
          strategyType = 'recovery';
        } else {
          const skip = Math.floor((present - 0.75 * total) / 0.75);
          strategy = skip > 0 ? `${skip} skips safe` : "Stay regular";
          strategyType = 'safe';
        }
      } else {
        strategy = "No sessions yet";
      }

      return { name: sub.name, present, total, percentage: total === 0 ? 0 : Math.round((present / total) * 100), strategy, strategyType };
    });

    const totalP = summary.reduce((a, s) => a + s.present, 0);
    const totalC = summary.reduce((a, s) => a + s.total, 0);
    const overall = totalC === 0 ? 0 : Math.round((totalP / totalC) * 100);
    return { summary, totalP, totalC, overall };
  };

  const stats = useMemo(() => calculateStats(records), [records, subjectsList]);

  const markAttendance = (lectureId: string, originalSubject: string, status: AttendanceStatus, actualSubject?: string) => {
    const recordId = lectureId.startsWith('extra-') ? `extra-${Date.now()}` : `${todayStr}-${lectureId}`;
    const newRecords = records.filter(r => r.id !== recordId);
    newRecords.push({ id: recordId, date: todayStr, lectureId, originalSubjectName: originalSubject, actualSubjectName: actualSubject || originalSubject, status });
    syncToBackend(newRecords);
    setShowStatusModal(null);
    setShowSubModal(null);
    setShowExtraModal(false);
  };

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

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-in fade-in zoom-in duration-700">
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-indigo-600 rounded-[30px] flex items-center justify-center text-white font-black text-3xl mx-auto mb-6 shadow-2xl">NM</div>
            <h1 className="text-3xl font-black text-white tracking-tighter">Portal Auth</h1>
          </div>
          <form onSubmit={handleLogin} className="bg-slate-900/40 backdrop-blur-xl border border-white/5 p-8 rounded-[40px] shadow-2xl space-y-6">
            <input type="text" placeholder="SAP ID" className="w-full bg-black/40 border border-white/10 rounded-xl py-4 px-6 text-white focus:border-indigo-500 outline-none font-bold" required />
            <input type="password" placeholder="Password" className="w-full bg-black/40 border border-white/10 rounded-xl py-4 px-6 text-white focus:border-indigo-500 outline-none font-bold" required />
            <button type="submit" className="w-full py-4 bg-indigo-600 text-white font-black uppercase rounded-xl shadow-lg active:scale-95 transition-all">Authorize</button>
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
            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-1">{currentUser.sapId}</p>
          </div>
        </div>
        <nav className="space-y-3 flex-grow">
          <NavItem icon={<Layout />} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <NavItem icon={<Calendar />} label="Schedule" active={activeTab === 'schedule'} onClick={() => setActiveTab('schedule')} />
          {!isAdmin && (
            <>
              <NavItem icon={<BookOpen />} label="Subjects" active={activeTab === 'subjects'} onClick={() => setActiveTab('subjects')} />
              <NavItem icon={<History />} label="Logs" active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
            </>
          )}
          {isAdmin && <NavItem icon={<Database />} label="Admin" active={activeTab === 'admin'} onClick={() => setActiveTab('admin')} />}
        </nav>
        <button onClick={handleLogout} className="mt-auto flex items-center gap-4 px-6 py-4 rounded-xl text-rose-500 font-black text-xs uppercase hover:bg-rose-500/10 transition-all"><LogOut className="w-5 h-5" /> Logout</button>
      </aside>

      {/* Main Container */}
      <main className="flex-grow h-screen overflow-y-auto custom-scrollbar relative flex flex-col">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between p-4 bg-[#080808]/90 backdrop-blur-xl border-b border-white/5 sticky top-0 z-[60]">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black text-xs">NM</div>
             <span className="font-black text-[10px] text-white uppercase tracking-widest">{currentUser.sapId}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowNotificationCenter(true)} className="p-2 text-slate-400 relative">
              <Bell className="w-5 h-5" />
              {broadcast && <span className="absolute top-1 right-1 w-2 h-2 bg-indigo-600 rounded-full border-2 border-[#080808]" />}
            </button>
            <button onClick={handleLogout} className="p-2 text-rose-500"><LogOut className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-5 sm:p-12 lg:p-20 space-y-8 sm:space-y-12">
          {activeTab === 'dashboard' && (
            <div className="space-y-8 sm:space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
              <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div>
                  <h1 className="text-3xl sm:text-6xl font-black text-white tracking-tighter">Overview</h1>
                  <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-[10px] sm:text-xs mt-2">Personal Analytics Terminal</p>
                </div>
                <button 
                  onClick={() => setShowNotificationCenter(true)}
                  className="hidden sm:flex items-center gap-3 px-6 py-4 bg-slate-900/30 border border-white/5 rounded-2xl hover:bg-indigo-600/10 transition-all group"
                >
                  <Bell className="w-5 h-5 text-slate-500 group-hover:text-indigo-500" />
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Broadcasts</span>
                </button>
              </header>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                <div className="bg-slate-900/30 p-8 sm:p-10 rounded-[32px] sm:rounded-[48px] border border-white/5 flex items-center justify-between group hover:border-indigo-500/20 transition-all">
                  <div>
                    <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest">Aggregate</p>
                    <h3 className="text-4xl sm:text-6xl font-black mt-2 text-white tracking-tighter">{stats.overall}%</h3>
                  </div>
                  <div className="h-20 w-20 sm:h-24 sm:w-24">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={[{v: stats.totalP}, {v: stats.totalC-stats.totalP || 1}]} innerRadius={28} outerRadius={38} paddingAngle={4} dataKey="v" stroke="none">
                          <Cell fill="#6366f1" />
                          <Cell fill="#1a1a1a" />
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="bg-slate-900/30 p-8 sm:p-10 rounded-[32px] sm:rounded-[48px] border border-white/5 flex flex-col justify-center group hover:border-indigo-500/20 transition-all">
                  <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest">Total Presence</p>
                  <div className="flex items-baseline gap-3 mt-2 sm:mt-4">
                    <h3 className="text-4xl sm:text-6xl font-black text-indigo-400 tracking-tighter">{stats.totalP}</h3>
                    <span className="text-slate-600 text-xl font-bold tracking-tighter">/ {stats.totalC}</span>
                  </div>
                </div>
                <div className="bg-slate-900/30 p-8 sm:p-10 rounded-[32px] sm:rounded-[48px] border border-white/5 group hover:border-indigo-500/20 transition-all sm:col-span-2 lg:col-span-1">
                  <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest">System Health</p>
                  <div className="mt-4 sm:mt-8 h-4 bg-black/40 rounded-full overflow-hidden">
                    <div className={`h-full transition-all duration-1000 ${stats.overall >= 75 ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.3)]'}`} style={{ width: `${Math.min(stats.overall, 100)}%` }} />
                  </div>
                  <p className={`text-[9px] mt-4 font-black uppercase tracking-widest ${stats.overall >= 75 ? 'text-emerald-400' : 'text-rose-400'}`}>{stats.overall >= 75 ? 'Operational' : 'Critical Warning'}</p>
                </div>
              </div>

              <section className="space-y-6">
                <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-3"><BarChart2 className="w-6 h-6 sm:w-8 sm:h-8 text-indigo-500" /> Statistical View</h2>
                <div className="bg-slate-900/30 p-6 sm:p-10 rounded-[40px] sm:rounded-[64px] border border-white/5 shadow-2xl">
                  <div className="h-64 sm:h-80 w-full relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.summary}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1a1a1a" />
                        <XAxis dataKey="name" hide />
                        <YAxis hide domain={[0, 100]} />
                        <Tooltip cursor={{ fill: '#ffffff05' }} contentStyle={{ backgroundColor: '#080808', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', fontSize: '10px' }} />
                        <Bar dataKey="percentage" fill="#6366f1" radius={[8, 8, 0, 0]} barSize={32} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-6 mt-8 sm:mt-12">
                    {stats.summary.map(s => (
                      <div key={s.name} className="bg-black/40 border border-white/5 p-4 sm:p-6 rounded-2xl sm:rounded-3xl hover:border-indigo-500/20 transition-all group" onClick={() => { setActiveTab('subjects'); setSelectedSubjectLog(s.name); }}>
                        <p className="text-[8px] sm:text-[9px] text-slate-500 font-black uppercase tracking-widest mb-2 truncate">{s.name}</p>
                        <div className="flex items-end justify-between">
                          <h4 className={`text-xl sm:text-2xl font-black tracking-tighter ${s.percentage >= 75 ? 'text-emerald-400' : 'text-rose-400'}`}>{s.percentage}%</h4>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'schedule' && (
            <div className="space-y-8 sm:space-y-10 animate-in fade-in slide-in-from-right-8 duration-700">
              <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-slate-900/30 p-6 sm:p-10 rounded-[32px] sm:rounded-[56px] border border-white/5 gap-6 sm:gap-8">
                <div className="flex items-center gap-4 sm:gap-8 justify-between w-full sm:w-auto">
                  <button onClick={() => setSelectedDate(subDays(selectedDate, 1))} className="p-4 sm:p-6 bg-black/40 rounded-2xl sm:rounded-3xl text-slate-500 hover:text-white transition-all"><ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" /></button>
                  <div className="text-center min-w-[120px] sm:min-w-[200px]"><h2 className="text-xl sm:text-3xl font-black text-white tracking-tighter">{format(selectedDate, 'EEEE')}</h2><p className="text-slate-500 text-[9px] sm:text-[11px] font-black uppercase mt-1 tracking-widest">{format(selectedDate, 'MMM do, yyyy')}</p></div>
                  <button onClick={() => setSelectedDate(addDays(selectedDate, 1))} className="p-4 sm:p-6 bg-black/40 rounded-2xl sm:rounded-3xl text-slate-500 hover:text-white transition-all"><ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" /></button>
                </div>
                <div className="flex gap-2 sm:gap-4 overflow-x-auto no-scrollbar">
                  <button onClick={() => setSelectedDate(startOfToday())} className="px-5 sm:px-8 py-3 sm:py-5 bg-slate-900 text-slate-400 rounded-xl sm:rounded-2xl font-black uppercase text-[8px] sm:text-[10px] tracking-widest whitespace-nowrap">Today</button>
                  <button onClick={() => setShowExtraModal(true)} className="px-5 sm:px-8 py-3 sm:py-5 bg-indigo-600 text-white rounded-xl sm:rounded-2xl font-black uppercase text-[8px] sm:text-[10px] tracking-widest flex items-center gap-2 whitespace-nowrap shadow-xl shadow-indigo-600/20"><Plus className="w-4 h-4" /> Extra</button>
                </div>
              </header>

              <div className="grid gap-4 sm:gap-6">
                {timetable.filter(l => l.day === selectedDayName).map(lecture => {
                  const record = records.find(r => r.id === `${todayStr}-${lecture.id}`);
                  return (
                    <div key={lecture.id} className="bg-slate-900/20 p-6 sm:p-10 rounded-[32px] sm:rounded-[56px] border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-6 sm:gap-8 group hover:bg-slate-900/30 transition-all">
                      <div className="flex items-center gap-5 sm:gap-8">
                        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-black/40 rounded-[24px] sm:rounded-[32px] flex items-center justify-center border border-white/5 group-hover:border-indigo-500/20 transition-all"><Clock className="w-8 h-8 sm:w-10 sm:h-10 text-slate-700 group-hover:text-indigo-400" /></div>
                        <div>
                          <h4 className="font-black text-slate-100 text-lg sm:text-2xl tracking-tight">{record?.actualSubjectName || lecture.subject}</h4>
                          <div className="flex items-center gap-4 sm:gap-6 text-slate-600 text-[9px] sm:text-[11px] mt-3 sm:mt-5 font-black uppercase tracking-widest">
                            <span className="flex items-center gap-2"><Clock className="w-4 h-4" /> {lecture.time}</span>
                            <span className="flex items-center gap-2"><UserIcon className="w-4 h-4" /> {lecture.faculty}</span>
                          </div>
                        </div>
                      </div>
                      <button onClick={() => setShowStatusModal({lectureId: lecture.id, subject: lecture.subject})} className={`w-full sm:w-auto px-10 py-4 sm:py-6 rounded-2xl sm:rounded-[32px] font-black text-[10px] sm:text-[11px] uppercase border tracking-widest transition-all ${ record?.status === 'present' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : record?.status === 'absent' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-black/40 text-slate-500 border-white/10' }`}>
                        {record?.status || 'Log Status'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'subjects' && !isAdmin && (
            <div className="space-y-8 sm:space-y-12 animate-in fade-in slide-in-from-left-8 duration-700">
              <header>
                <h1 className="text-3xl sm:text-6xl font-black text-white tracking-tighter">Subjects</h1>
                <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-[10px] sm:text-xs mt-2">Tactical Strategy Mode</p>
              </header>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-10">
                {stats.summary.map(sub => (
                  <div key={sub.name} className="bg-slate-900/40 rounded-[32px] sm:rounded-[64px] border border-white/5 overflow-hidden shadow-2xl flex flex-col group hover:border-indigo-500/20 transition-all">
                    <div className="p-8 sm:p-12 bg-black/40 border-b border-white/5 flex justify-between items-start gap-4">
                      <div className="min-w-0">
                        <h3 className="font-black text-white text-xl sm:text-2xl leading-tight mb-2 tracking-tight group-hover:text-indigo-400 transition-colors line-clamp-2">{sub.name}</h3>
                        <p className="text-[8px] sm:text-[10px] text-slate-600 font-black uppercase tracking-widest">Sem-II Module</p>
                      </div>
                      <button onClick={() => { setActiveTab('history'); setSelectedSubjectLog(sub.name); }} className="p-3 bg-slate-950 rounded-xl text-slate-500 hover:text-white shrink-0"><History className="w-5 h-5" /></button>
                    </div>
                    <div className="p-8 sm:p-12 space-y-8 sm:space-y-12 flex-grow">
                      <div className="flex justify-between items-end">
                        <div>
                           <p className="text-slate-600 text-[8px] sm:text-[9px] font-black uppercase tracking-widest mb-1">Score</p>
                           <p className={`text-4xl sm:text-6xl font-black tracking-tighter ${sub.percentage >= 75 ? 'text-emerald-400' : 'text-rose-400'}`}>{sub.percentage}%</p>
                        </div>
                        <div className="text-right">
                           <p className="text-slate-600 text-[8px] sm:text-[9px] font-black uppercase tracking-widest mb-1">Ratio</p>
                           <p className="text-2xl sm:text-3xl font-black text-slate-300 tracking-tighter">{sub.present} / {sub.total}</p>
                        </div>
                      </div>
                      <div className={`p-6 sm:p-8 rounded-[24px] sm:rounded-[36px] border flex items-center gap-4 sm:gap-6 ${sub.strategyType === 'recovery' ? 'bg-rose-500/5 border-rose-500/20 text-rose-300' : 'bg-indigo-500/5 border-indigo-500/20 text-indigo-300'}`}>
                        <Calculator className={`w-6 h-6 sm:w-8 sm:h-8 shrink-0 ${sub.strategyType === 'recovery' ? 'text-rose-500' : 'text-indigo-500'}`} />
                        <div>
                           <p className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest opacity-60 mb-1">Prediction</p>
                           <p className="font-bold text-xs sm:text-base leading-snug">{sub.strategy}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'history' && !isAdmin && (
            <div className="space-y-8 sm:space-y-12 animate-in fade-in zoom-in-95 duration-700">
              <header className="flex flex-col sm:flex-row justify-between items-center bg-slate-900/30 p-8 sm:p-12 rounded-[32px] sm:rounded-[64px] border border-white/5 gap-8">
                <div><h2 className="text-3xl sm:text-4xl font-black text-white tracking-tighter">Session Logs</h2><p className="text-[10px] text-slate-500 font-black uppercase mt-4 tracking-widest">Encrypted Local Archive</p></div>
                <button onClick={() => setShowImportModal(true)} className="w-full sm:w-auto px-10 py-5 bg-emerald-500 text-black rounded-2xl sm:rounded-[32px] font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-3 shadow-2xl shadow-emerald-500/20"><Sparkles className="w-5 h-5" /> Cloud Sync</button>
              </header>

              <div className="space-y-6 sm:space-y-8">
                {groupedHistory.length > 0 ? groupedHistory.map(([date, dayRecords]) => (
                  <div key={date} className="bg-slate-900/20 rounded-[32px] sm:rounded-[56px] border border-white/5 overflow-hidden shadow-2xl">
                    <div className="bg-black/40 px-8 sm:px-12 py-5 sm:py-8 flex justify-between items-center border-b border-white/5">
                      <h3 className="font-black text-[9px] sm:text-xs text-slate-500 uppercase tracking-widest">{format(parseISO(date), 'EEEE, MMM do, yyyy')}</h3>
                    </div>
                    <div className="divide-y divide-white/5">
                      {dayRecords.map(r => (
                        <div key={r.id} className="px-8 sm:px-12 py-6 sm:py-8 flex items-center justify-between hover:bg-black/20 transition-all gap-4">
                          <div className="min-w-0">
                            <p className="text-white font-black text-lg sm:text-2xl tracking-tight truncate">{r.actualSubjectName}</p>
                            <p className="text-[8px] sm:text-[10px] text-slate-600 font-black uppercase mt-2 sm:mt-4 tracking-widest flex items-center gap-2">
                              {r.lectureId === 'imported' ? <Cloud className="w-3 h-3 text-indigo-500" /> : <Lock className="w-3 h-3 text-emerald-500" />}
                              {r.lectureId === 'imported' ? 'Imported' : 'Local Node'}
                            </p>
                          </div>
                          <div className="flex items-center gap-4 sm:gap-8 shrink-0">
                            <span className={`px-5 py-2 rounded-xl text-[9px] sm:text-[11px] font-black uppercase border ${r.status === 'present' ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' : 'text-rose-400 border-rose-500/20 bg-rose-500/5'}`}>{r.status}</span>
                            <button onClick={() => { if(confirm('Erase this record?')) syncToBackend(records.filter(x => x.id !== r.id)); }} className="p-3 bg-rose-500/10 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )) : (
                  <div className="p-20 sm:p-40 text-center border-4 border-dashed border-white/5 rounded-[40px] sm:rounded-[80px]">
                    <Database className="w-12 h-12 sm:w-16 sm:h-16 text-slate-900 mx-auto mb-6" />
                    <p className="text-slate-700 font-black uppercase text-[10px] sm:text-sm tracking-widest">No Logs Available</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'admin' && isAdmin && (
            <div className="space-y-10 animate-in fade-in duration-700">
              <header className="flex flex-col lg:flex-row justify-between items-center bg-indigo-600 p-8 sm:p-12 rounded-[40px] sm:rounded-[64px] gap-8 shadow-2xl">
                <div><h2 className="text-3xl sm:text-5xl font-black text-white tracking-tighter">Root Terminal</h2><p className="text-indigo-100 text-[10px] font-black uppercase mt-4 tracking-widest">Global State Management</p></div>
                <div className="flex bg-indigo-700/50 p-2 sm:p-3 rounded-2xl sm:rounded-[32px] backdrop-blur-2xl w-full lg:w-auto overflow-x-auto no-scrollbar">
                  <button onClick={() => setAdminView('students')} className={`px-6 sm:px-10 py-3 sm:py-5 rounded-xl sm:rounded-2xl font-black uppercase text-[9px] sm:text-[11px] tracking-widest transition-all whitespace-nowrap ${adminView === 'students' ? 'bg-white text-indigo-600 shadow-xl' : 'text-white/70'}`}>Profiles</button>
                  <button onClick={() => setAdminView('timetable')} className={`px-6 sm:px-10 py-3 sm:py-5 rounded-xl sm:rounded-2xl font-black uppercase text-[9px] sm:text-[11px] tracking-widest transition-all whitespace-nowrap ${adminView === 'timetable' ? 'bg-white text-indigo-600 shadow-xl' : 'text-white/70'}`}>Schedule</button>
                  <button onClick={() => setAdminView('broadcast')} className={`px-6 sm:px-10 py-3 sm:py-5 rounded-xl sm:rounded-2xl font-black uppercase text-[9px] sm:text-[11px] tracking-widest transition-all whitespace-nowrap ${adminView === 'broadcast' ? 'bg-white text-indigo-600 shadow-xl' : 'text-white/70'}`}>Broadcast</button>
                </div>
              </header>

              {adminView === 'broadcast' && (
                <div className="bg-slate-900/30 p-8 sm:p-12 rounded-[32px] sm:rounded-[64px] border border-white/5 space-y-6 animate-in fade-in zoom-in duration-500">
                  <h3 className="text-xl sm:text-2xl font-black text-white flex items-center gap-3"><Megaphone className="w-6 h-6 sm:w-8 sm:h-8 text-indigo-500" /> Cloud Broadcast</h3>
                  <textarea value={broadcastInput} onChange={(e) => setBroadcastInput(e.target.value)} placeholder="Type emergency protocol update..." className="w-full bg-black/40 border border-white/10 rounded-[24px] sm:rounded-[32px] p-6 sm:p-8 text-white outline-none focus:border-indigo-500 h-32 sm:h-40 font-bold transition-all text-sm sm:text-lg" />
                  <button onClick={() => { if(broadcastInput) { setBroadcast({message: broadcastInput, timestamp: Date.now()}); setBroadcastInput(''); alert('Deployed.'); } }} className="w-full sm:w-auto px-10 py-4 sm:py-6 bg-indigo-600 text-white rounded-xl sm:rounded-[28px] font-black uppercase text-xs tracking-widest shadow-2xl flex items-center justify-center gap-3"><Send className="w-5 h-5" /> Deploy</button>
                </div>
              )}

              {adminView === 'students' && (
                <div className="space-y-8 animate-in fade-in duration-500">
                   <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                      <div className="bg-slate-900/20 p-8 rounded-[32px] sm:rounded-[48px] border border-white/5"><p className="text-slate-500 text-[9px] font-black uppercase tracking-widest">Enrolled</p><h4 className="text-4xl sm:text-5xl font-black text-white mt-2">{allStudentData.length}</h4></div>
                      <button onClick={() => setShowAddStudentModal(true)} className="sm:col-span-2 bg-indigo-600/5 border-2 border-dashed border-indigo-500/20 rounded-[32px] sm:rounded-[48px] flex items-center justify-center gap-4 group hover:bg-indigo-600/10 transition-all p-8">
                        <UserPlus className="w-8 h-8 text-indigo-500" />
                        <span className="text-sm font-black uppercase tracking-widest text-indigo-400">Enroll Profile</span>
                      </button>
                   </div>
                   <div className="bg-slate-900/20 rounded-[32px] sm:rounded-[64px] border border-white/5 overflow-x-auto">
                      <table className="w-full text-left min-w-[650px]">
                        <thead>
                          <tr className="bg-black/40 border-b border-white/5">
                            <th className="px-10 sm:px-12 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest">Profile</th>
                            <th className="px-10 sm:px-12 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest text-center">Score</th>
                            <th className="px-10 sm:px-12 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {allStudentData.map(s => (
                            <tr key={s.sapId} className="hover:bg-black/20 transition-all group">
                              <td className="px-10 sm:px-12 py-6">
                                <p className="font-black text-white text-xl sm:text-2xl tracking-tight">{s.name}</p>
                                <p className="text-[10px] text-slate-600 uppercase font-bold tracking-widest mt-1">ID: {s.sapId}</p>
                              </td>
                              <td className="px-10 sm:px-12 py-6 text-center font-black"><span className={`text-2xl sm:text-3xl tracking-tighter ${s.overall >= 75 ? 'text-emerald-400' : 'text-rose-400'}`}>{s.overall}%</span></td>
                              <td className="px-10 sm:px-12 py-6 text-right">
                                <div className="flex justify-end gap-3">
                                  <button onClick={() => setSelectedAdminStudent(s.sapId)} className="p-4 bg-indigo-600/10 text-indigo-400 rounded-xl"><Settings className="w-5 h-5" /></button>
                                  <button onClick={() => { if(confirm('Erase profile data?')) setStudentsList(p => p.filter(x => x.sapId !== s.sapId)); }} className="p-4 bg-rose-600/10 text-rose-500 rounded-xl"><Trash2 className="w-5 h-5" /></button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                   </div>
                </div>
              )}
              
              {adminView === 'timetable' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-10 animate-in fade-in duration-500 pb-20">
                  {DAYS.map(day => (
                    <div key={day} className="bg-slate-900/20 rounded-[32px] sm:rounded-[64px] border border-white/5 overflow-hidden shadow-2xl flex flex-col">
                      <div className="bg-black/40 p-8 sm:p-12 flex justify-between items-center border-b border-white/5">
                        <h3 className="font-black text-xl sm:text-2xl text-white tracking-widest uppercase">{day}</h3>
                        <button onClick={() => setShowAddLectureModal(day)} className="p-4 sm:p-5 bg-indigo-600 rounded-2xl sm:rounded-3xl text-white hover:bg-indigo-500 transition-all shadow-2xl shadow-indigo-600/30"><Plus className="w-5 h-5 sm:w-6 sm:h-6" /></button>
                      </div>
                      <div className="p-6 sm:p-10 space-y-4 sm:space-y-6">
                        {timetable.filter(l => l.day === day).map(lecture => (
                          <div key={lecture.id} className="flex items-center justify-between p-6 sm:p-8 bg-black/20 rounded-[24px] sm:rounded-[40px] border border-white/5 group hover:border-indigo-500 transition-all gap-4">
                            <div className="min-w-0">
                              <p className="font-black text-white text-lg sm:text-xl truncate tracking-tight">{lecture.subject}</p>
                              <p className="text-[9px] sm:text-[11px] text-slate-600 uppercase font-black tracking-widest mt-2 sm:mt-4 flex items-center gap-2 sm:gap-4"><Clock className="w-3 h-3 sm:w-4 sm:h-4" /> {lecture.time}</p>
                            </div>
                            <button onClick={() => setTimetable(prev => prev.filter(x => x.id !== lecture.id))} className="p-3 sm:p-4 bg-rose-500/10 text-rose-500 rounded-xl sm:rounded-2xl lg:opacity-0 lg:group-hover:opacity-100 transition-all shrink-0"><Trash2 className="w-4 h-4 sm:w-5 sm:h-5" /></button>
                          </div>
                        ))}
                        {timetable.filter(l => l.day === day).length === 0 && (
                          <p className="text-center py-10 text-slate-700 text-[10px] font-black uppercase tracking-widest">No Sessions Planned</p>
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

      {/* Mobile Tab Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#080808]/90 backdrop-blur-2xl border-t border-white/5 flex items-center justify-around p-4 pb-8 z-[100]">
        <MobileNavItem icon={<Layout />} active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
        <MobileNavItem icon={<Calendar />} active={activeTab === 'schedule'} onClick={() => setActiveTab('schedule')} />
        <MobileNavItem icon={<Calculator />} active={activeTab === 'subjects'} onClick={() => setActiveTab('subjects')} />
        <MobileNavItem icon={<History />} active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
        {isAdmin && <MobileNavItem icon={<Database />} active={activeTab === 'admin'} onClick={() => setActiveTab('admin')} />}
      </nav>

      {/* Notification Center */}
      {showNotificationCenter && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" onClick={() => setShowNotificationCenter(false)} />
          <div className="relative bg-[#080808] w-full sm:max-w-xl rounded-t-[40px] sm:rounded-[48px] p-8 sm:p-12 shadow-2xl border-t sm:border border-white/5 max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-2xl font-black text-white tracking-tighter flex items-center gap-3"><BellRing className="text-indigo-500" /> Inbox</h3>
              <button onClick={() => setShowNotificationCenter(false)} className="p-3 bg-white/5 rounded-2xl text-slate-500"><X className="w-6 h-6" /></button>
            </div>
            <div className="flex-grow overflow-y-auto space-y-4 custom-scrollbar pr-2 pb-6">
              {broadcast ? (
                <div className="bg-indigo-600/10 border border-indigo-500/20 p-8 rounded-[32px] space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-black uppercase text-indigo-400 tracking-widest">System Update</span>
                    <span className="text-[9px] font-bold text-slate-600">{format(broadcast.timestamp, 'HH:mm • MMM do')}</span>
                  </div>
                  <p className="text-white font-bold text-sm leading-relaxed">{broadcast.message}</p>
                </div>
              ) : (
                <div className="py-20 text-center opacity-30 flex flex-col items-center">
                  <Megaphone className="w-12 h-12 mb-4" />
                  <p className="font-black uppercase text-[10px] tracking-widest">No Broadcasts</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Status Log Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" onClick={() => setShowStatusModal(null)} />
          <div className="relative bg-[#080808] w-full sm:max-w-xl rounded-t-[40px] sm:rounded-[48px] p-8 sm:p-12 shadow-2xl border-t sm:border border-white/5">
            <div className="flex justify-between items-start mb-10">
              <div className="min-w-0">
                <h3 className="text-2xl font-black text-white tracking-tighter truncate">Log Attendance</h3>
                <p className="text-slate-500 uppercase text-[10px] mt-2 font-bold tracking-widest line-clamp-1">{showStatusModal.subject}</p>
              </div>
              <button onClick={() => setShowStatusModal(null)} className="p-4 bg-white/5 rounded-2xl text-slate-500 shrink-0"><X className="w-6 h-6" /></button>
            </div>
            <div className="grid gap-3 sm:gap-4">
              <StatusBtn icon={<CheckCircle className="text-emerald-500" />} label="Present" color="hover:bg-emerald-500/10" onClick={() => markAttendance(showStatusModal.lectureId, showStatusModal.subject, 'present')} />
              <StatusBtn icon={<XCircle className="text-rose-500" />} label="Absent" color="hover:bg-rose-500/10" onClick={() => markAttendance(showStatusModal.lectureId, showStatusModal.subject, 'absent')} />
              <StatusBtn icon={<MinusCircle className="text-slate-600" />} label="Cancelled" color="hover:bg-white/5" onClick={() => markAttendance(showStatusModal.lectureId, showStatusModal.subject, 'cancelled')} />
              <StatusBtn icon={<RefreshCcw className="text-indigo-500" />} label="Substitute Session" color="hover:bg-indigo-500/10" onClick={() => setShowSubModal({lectureId: showStatusModal.lectureId, originalSubject: showStatusModal.subject})} />
            </div>
          </div>
        </div>
      )}

      {/* Profile Enrollment Modal */}
      {showAddStudentModal && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-300">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-2xl" onClick={() => setShowAddStudentModal(false)} />
          <div className="relative bg-[#080808] w-full max-w-lg rounded-[48px] sm:rounded-[64px] border border-white/10 p-8 sm:p-14 shadow-2xl">
            <h3 className="text-3xl font-black text-white tracking-tighter mb-8 sm:text-center">Enroll Student</h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              const f = e.currentTarget as HTMLFormElement;
              const n = (f.elements[0] as HTMLInputElement).value;
              const s = (f.elements[1] as HTMLInputElement).value;
              setStudentsList(p => [...p, {name: n, sapId: s}]);
              setShowAddStudentModal(false);
            }} className="space-y-6">
              <input type="text" placeholder="Full Identity Name" className="w-full bg-black/40 border border-white/10 rounded-2xl py-5 px-8 text-white outline-none focus:border-indigo-500 font-bold" required />
              <input type="text" placeholder="Authorized SAP ID" className="w-full bg-black/40 border border-white/10 rounded-2xl py-5 px-8 text-white outline-none focus:border-indigo-500 font-bold" required />
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowAddStudentModal(false)} className="flex-1 py-4 bg-white/5 text-slate-500 rounded-2xl font-black uppercase text-[10px] tracking-widest">Discard</button>
                <button type="submit" className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-indigo-600/20">Enroll</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deploy Lecture Modal */}
      {showAddLectureModal && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-300">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-2xl" onClick={() => setShowAddLectureModal(null)} />
          <div className="relative bg-[#080808] w-full max-w-lg rounded-[48px] sm:rounded-[64px] border border-white/10 p-8 sm:p-14 shadow-2xl">
            <h3 className="text-3xl font-black text-white tracking-tighter mb-2 sm:text-center">New Session</h3>
            <p className="sm:text-center text-indigo-500 font-black uppercase tracking-widest text-[9px] mb-8">{showAddLectureModal} Template</p>
            <form onSubmit={(e) => {
              e.preventDefault();
              const f = e.currentTarget as HTMLFormElement;
              const sub = (f.elements.namedItem('sub') as HTMLSelectElement).value;
              const time = (f.elements.namedItem('time') as HTMLInputElement).value;
              const faculty = subjectsList.find(s => s.name === sub)?.faculty || 'TBD';
              setTimetable(p => [...p, {id: Date.now().toString(), day: showAddLectureModal!, subject: sub, time, faculty}]);
              setShowAddLectureModal(null);
            }} className="space-y-6">
              <select name="sub" className="w-full bg-black/40 border border-white/10 rounded-2xl py-5 px-8 text-white outline-none focus:border-indigo-500 font-bold appearance-none">
                {subjectsList.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
              <input name="time" type="text" placeholder="e.g. 09:00 - 10:00" className="w-full bg-black/40 border border-white/10 rounded-2xl py-5 px-8 text-white outline-none focus:border-indigo-500 font-bold" required />
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowAddLectureModal(null)} className="flex-1 py-4 bg-white/5 text-slate-500 rounded-2xl font-black uppercase text-[10px] tracking-widest">Cancel</button>
                <button type="submit" className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl">Deploy</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cloud Sync Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-500">
          <div className="absolute inset-0 bg-black/98 backdrop-blur-3xl" onClick={() => setShowImportModal(false)} />
          <div className="relative bg-[#080808] w-full max-w-xl rounded-[40px] sm:rounded-[80px] border border-white/10 p-10 sm:p-16 shadow-2xl flex flex-col items-center text-center">
             <div className="w-16 h-16 sm:w-20 sm:h-20 bg-emerald-500/10 rounded-3xl flex items-center justify-center text-emerald-500 mb-8 border border-emerald-500/20 shadow-2xl">
                <Cloud className="w-10 h-10" />
             </div>
             <h3 className="text-4xl sm:text-5xl font-black text-white tracking-tighter mb-4">Cloud Sync</h3>
             <p className="text-slate-500 uppercase font-black text-[9px] tracking-[0.3em] mb-12">Authorize SAP Analytics Logic</p>
             <div onClick={() => fileInputRef.current?.click()} className="w-full border-4 border-dashed border-white/5 bg-black/20 rounded-[48px] p-12 sm:p-20 cursor-pointer hover:border-emerald-500/30 transition-all group">
                <input type="file" ref={fileInputRef} accept="application/pdf" className="hidden" onChange={(e) => { alert('Initializing cloud auth...'); setShowImportModal(false); }} />
                <FileText className="w-12 h-12 text-slate-800 mx-auto mb-6 transition-all group-hover:text-emerald-500" />
                <p className="text-slate-600 font-black uppercase text-[10px] tracking-widest">Drop Official PDF</p>
             </div>
          </div>
        </div>
      )}

      {/* Extra Session / Substitute Lists */}
      {(showExtraModal || showSubModal) && (
        <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-0 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-2xl" onClick={() => { setShowExtraModal(false); setShowSubModal(null); }} />
          <div className="relative bg-[#080808] w-full sm:max-w-xl h-[80vh] rounded-t-[40px] sm:rounded-[48px] p-8 sm:p-12 flex flex-col shadow-2xl border-t sm:border border-white/10">
            <div className="flex justify-between items-center mb-10">
              <h3 className="text-2xl font-black text-white tracking-tighter">{showExtraModal ? 'Log Extra' : 'Sub Session'}</h3>
              <button onClick={() => { setShowExtraModal(false); setShowSubModal(null); }} className="p-4 bg-white/5 rounded-2xl text-slate-500"><X className="w-6 h-6" /></button>
            </div>
            <div className="flex-grow overflow-y-auto space-y-4 pr-3 custom-scrollbar pb-10">
              {subjectsList.map(sub => (
                <div key={sub.name} className="bg-black/40 p-8 rounded-[40px] border border-white/5 flex items-center justify-between gap-6 group hover:border-indigo-500/30 transition-all shadow-xl">
                  <span className="font-black text-slate-200 text-lg sm:text-xl truncate leading-tight tracking-tight">{sub.name}</span>
                  <div className="flex gap-2">
                    <button onClick={() => {
                      if(showExtraModal) markAttendance(`extra-${Date.now()}`, 'Extra', 'present', sub.name);
                      else markAttendance(showSubModal!.lectureId, showSubModal!.originalSubject, 'present', sub.name);
                    }} className="w-12 h-12 sm:w-14 sm:h-14 bg-emerald-500 text-black rounded-2xl font-black shadow-lg shadow-emerald-500/20 active:scale-90 transition-all">P</button>
                    <button onClick={() => {
                      if(showExtraModal) markAttendance(`extra-${Date.now()}`, 'Extra', 'absent', sub.name);
                      else markAttendance(showSubModal!.lectureId, showSubModal!.originalSubject, 'absent', sub.name);
                    }} className="w-12 h-12 sm:w-14 sm:h-14 bg-rose-500 text-black rounded-2xl font-black shadow-lg shadow-rose-500/20 active:scale-90 transition-all">A</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// UI Atoms
const NavItem: React.FC<{ icon: React.ReactNode; label: string; active: boolean; onClick: () => void }> = ({ icon, label, active, onClick }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-6 px-10 py-5 rounded-2xl transition-all font-black text-xs uppercase tracking-widest ${active ? 'bg-indigo-600 text-white shadow-2xl shadow-indigo-600/40' : 'text-slate-600 hover:bg-white/5 hover:text-slate-300'}`}>
    {React.cloneElement(icon as React.ReactElement<any>, { className: `w-6 h-6` })}
    {label}
  </button>
);

const MobileNavItem: React.FC<{ icon: React.ReactNode; active: boolean; onClick: () => void }> = ({ icon, active, onClick }) => (
  <button onClick={onClick} className={`flex flex-col items-center justify-center w-14 h-14 rounded-2xl transition-all ${active ? 'bg-indigo-600 text-white shadow-xl scale-110' : 'text-slate-600'}`}>
    {React.cloneElement(icon as React.ReactElement<any>, { className: `w-6 h-6` })}
  </button>
);

const StatusBtn: React.FC<{ icon: React.ReactNode; label: string; color: string; onClick: () => void }> = ({ icon, label, color, onClick }) => (
  <button onClick={onClick} className={`flex items-center gap-6 sm:gap-8 w-full p-6 sm:p-8 bg-black/40 border border-white/5 rounded-[30px] sm:rounded-[40px] transition-all ${color} font-black uppercase text-[10px] sm:text-xs text-slate-400 text-left group tracking-widest`}>
    {React.cloneElement(icon as React.ReactElement<any>, { className: 'w-8 h-8 sm:w-10 sm:h-10 shrink-0 transition-all group-hover:scale-125' })}
    {label}
  </button>
);

export default App;
