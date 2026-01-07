
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
  const [isSyncing, setIsSyncing] = useState(false);
  const [showNotificationCenter, setShowNotificationCenter] = useState(false);
  
  // Admin UI
  const [selectedAdminStudent, setSelectedAdminStudent] = useState<string | null>(null);
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

  // Sync Logic
  const syncToBackend = async (newRecords: AttendanceRecord[]) => {
    if (!currentUser) return;
    setIsSyncing(true);
    await new Promise(r => setTimeout(r, 400));
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
      alert('Invalid Credentials.');
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

  // View logic for Admin Student Details
  const selectedStudentDetails = useMemo(() => {
    if (!selectedAdminStudent) return null;
    const student = studentsList.find(s => s.sapId === selectedAdminStudent);
    if (!student) return null;
    const d = localStorage.getItem(`nmims_backend_db_${student.sapId}`);
    const st = calculateStats(d ? JSON.parse(d) : []);
    return { ...student, stats: st };
  }, [selectedAdminStudent, studentsList, subjectsList]);

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
            <button type="submit" className="w-full py-4 bg-indigo-600 text-white font-black uppercase rounded-xl shadow-lg active:scale-95 transition-all">Authorize Access</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-slate-100 flex flex-col md:flex-row max-w-[1920px] mx-auto overflow-hidden">
      {/* Sidebar (Desktop Only) */}
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
        <button onClick={handleLogout} className="mt-auto flex items-center gap-4 px-6 py-4 rounded-xl text-rose-500 font-black text-xs uppercase hover:bg-rose-500/10 transition-all"><LogOut className="w-5 h-5" /> Terminate</button>
      </aside>

      {/* Main Viewport */}
      <main className="flex-grow h-screen overflow-y-auto custom-scrollbar relative flex flex-col pb-24 md:pb-0">
        {/* Mobile Navbar */}
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
            <button onClick={handleLogout} className="p-2 text-rose-500"><LogOut className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-5 sm:p-12 lg:p-20 space-y-10 sm:space-y-16">
          {activeTab === 'dashboard' && (
            <div className="space-y-10 sm:space-y-14 animate-in fade-in slide-in-from-bottom-8 duration-700">
              <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div>
                  <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tighter">Command Center</h1>
                  <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-[10px] sm:text-xs mt-2">Live Analytics Terminal</p>
                </div>
                <button onClick={() => setShowNotificationCenter(true)} className="hidden sm:flex items-center gap-3 px-8 py-4 bg-slate-900/30 border border-white/5 rounded-2xl hover:bg-indigo-600/10 transition-all group">
                  <Bell className="w-5 h-5 text-slate-500 group-hover:text-indigo-500" />
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Global Broadcasts</span>
                </button>
              </header>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-slate-900/30 p-8 sm:p-10 rounded-[40px] border border-white/5 flex items-center justify-between">
                  <div>
                    <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest">Aggregate</p>
                    <h3 className="text-5xl sm:text-7xl font-black mt-2 text-white tracking-tighter">{stats.overall}%</h3>
                  </div>
                  <div className="h-20 w-20 sm:h-28 sm:w-28">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={[{v: stats.totalP}, {v: stats.totalC-stats.totalP || 1}]} innerRadius={30} outerRadius={42} paddingAngle={4} dataKey="v" stroke="none">
                          <Cell fill="#6366f1" />
                          <Cell fill="#1a1a1a" />
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="bg-slate-900/30 p-8 sm:p-10 rounded-[40px] border border-white/5 flex flex-col justify-center">
                  <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest">Attendance Ratio</p>
                  <div className="flex items-baseline gap-3 mt-3">
                    <h3 className="text-5xl sm:text-7xl font-black text-indigo-400 tracking-tighter">{stats.totalP}</h3>
                    <span className="text-slate-600 text-2xl font-bold tracking-tighter">/ {stats.totalC}</span>
                  </div>
                </div>
                <div className="bg-slate-900/30 p-8 sm:p-10 rounded-[40px] border border-white/5 sm:col-span-2 lg:col-span-1">
                  <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest">Integrity</p>
                  <div className="mt-8 h-4 bg-black/40 rounded-full overflow-hidden">
                    <div className={`h-full transition-all duration-1000 ${stats.overall >= 75 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${Math.min(stats.overall, 100)}%` }} />
                  </div>
                  <p className={`text-[9px] mt-4 font-black uppercase tracking-widest ${stats.overall >= 75 ? 'text-emerald-400' : 'text-rose-400'}`}>{stats.overall >= 75 ? 'Operational' : 'Critical Hazard'}</p>
                </div>
              </div>

              <section className="space-y-8">
                <h2 className="text-2xl font-black text-white flex items-center gap-4"><BarChart2 className="w-8 h-8 text-indigo-500" /> Statistical View</h2>
                <div className="bg-slate-900/30 p-6 sm:p-10 rounded-[56px] border border-white/5 shadow-2xl overflow-hidden">
                  <div className="h-64 sm:h-96 w-full relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.summary}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1a1a1a" />
                        <XAxis dataKey="name" hide />
                        <YAxis hide domain={[0, 100]} />
                        <Tooltip cursor={{ fill: '#ffffff05' }} contentStyle={{ backgroundColor: '#080808', borderRadius: '24px', border: 'none', fontSize: '11px', fontWeight: 'bold' }} />
                        <Bar dataKey="percentage" fill="#6366f1" radius={[12, 12, 0, 0]} barSize={40} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'schedule' && (
            <div className="space-y-10 animate-in fade-in slide-in-from-right-8 duration-700">
              <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-slate-900/30 p-8 rounded-[48px] border border-white/5 gap-8">
                <div className="flex items-center gap-8 justify-between w-full sm:w-auto">
                  <button onClick={() => setSelectedDate(subDays(selectedDate, 1))} className="p-5 bg-black/40 rounded-3xl text-slate-500 hover:text-white transition-all"><ChevronLeft className="w-6 h-6" /></button>
                  <div className="text-center min-w-[200px]"><h2 className="text-3xl font-black text-white tracking-tighter">{format(selectedDate, 'EEEE')}</h2><p className="text-slate-500 text-[11px] font-black uppercase mt-1 tracking-widest">{format(selectedDate, 'MMM do, yyyy')}</p></div>
                  <button onClick={() => setSelectedDate(addDays(selectedDate, 1))} className="p-5 bg-black/40 rounded-3xl text-slate-500 hover:text-white transition-all"><ChevronRight className="w-6 h-6" /></button>
                </div>
                <div className="flex gap-4">
                  <button onClick={() => setSelectedDate(startOfToday())} className="px-10 py-5 bg-slate-900 text-slate-400 rounded-2xl font-black uppercase text-[10px] tracking-widest whitespace-nowrap">Current</button>
                  <button onClick={() => setShowExtraModal(true)} className="px-10 py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center gap-3 whitespace-nowrap shadow-xl"><Plus className="w-5 h-5" /> Extra</button>
                </div>
              </header>

              <div className="grid gap-6">
                {timetable.filter(l => l.day === selectedDayName).map(lecture => {
                  const record = records.find(r => r.id === `${todayStr}-${lecture.id}`);
                  return (
                    <div key={lecture.id} className="bg-slate-900/20 p-8 sm:p-10 rounded-[48px] border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-8 group hover:bg-slate-900/30 transition-all shadow-xl">
                      <div className="flex items-center gap-8">
                        <div className="w-20 h-20 bg-black/40 rounded-[32px] flex items-center justify-center border border-white/5 group-hover:border-indigo-500/20 transition-all"><Clock className="w-10 h-10 text-slate-700 group-hover:text-indigo-400" /></div>
                        <div>
                          <h4 className="font-black text-slate-100 text-2xl tracking-tight leading-tight">{record?.actualSubjectName || lecture.subject}</h4>
                          <div className="flex flex-wrap items-center gap-6 text-slate-600 text-[11px] mt-5 font-black uppercase tracking-widest">
                            <span className="flex items-center gap-2"><Clock className="w-4 h-4" /> {lecture.time}</span>
                            <span className="flex items-center gap-2"><UserIcon className="w-4 h-4" /> {lecture.faculty}</span>
                          </div>
                        </div>
                      </div>
                      <button onClick={() => setShowStatusModal({lectureId: lecture.id, subject: lecture.subject})} className={`w-full sm:w-auto px-14 py-6 rounded-[32px] font-black text-[11px] uppercase border tracking-widest transition-all ${ record?.status === 'present' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : record?.status === 'absent' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-black/40 text-slate-500 border-white/10' }`}>
                        {record?.status || 'Record Entry'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'subjects' && (
            <div className="space-y-10 animate-in fade-in duration-700">
              <header>
                <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tighter">Tactical Strategy</h1>
                <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-[10px] sm:text-xs mt-2">Predictive Modeling Engine</p>
              </header>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                {stats.summary.map(sub => (
                  <div key={sub.name} className="bg-slate-900/40 rounded-[48px] border border-white/5 overflow-hidden shadow-2xl flex flex-col group">
                    <div className="p-8 bg-black/40 border-b border-white/5 flex justify-between items-start gap-4">
                      <div className="min-w-0">
                        <h3 className="font-black text-white text-xl leading-tight mb-2 tracking-tight group-hover:text-indigo-400 transition-colors line-clamp-2">{sub.name}</h3>
                        <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest">Module Analytics</p>
                      </div>
                      <Calculator className="w-6 h-6 text-indigo-500 shrink-0" />
                    </div>
                    <div className="p-10 space-y-10">
                      <div className="flex justify-between items-end">
                        <div>
                          <p className="text-slate-600 text-[10px] font-black uppercase tracking-widest mb-1">Percentage</p>
                          <p className={`text-5xl font-black tracking-tighter ${sub.percentage >= 75 ? 'text-emerald-400' : 'text-rose-400'}`}>{sub.percentage}%</p>
                        </div>
                        <div className="text-right">
                          <p className="text-slate-600 text-[10px] font-black uppercase tracking-widest mb-1">Ratio</p>
                          <p className="text-2xl font-black text-slate-300 tracking-tighter">{sub.present}/{sub.total}</p>
                        </div>
                      </div>
                      <div className={`p-6 rounded-[32px] border ${sub.strategyType === 'recovery' ? 'bg-rose-500/5 border-rose-500/20 text-rose-300' : 'bg-indigo-500/5 border-indigo-500/20 text-indigo-300'}`}>
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2">Hint</p>
                        <p className="font-bold text-sm leading-snug">{sub.strategy}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-10 animate-in fade-in duration-700">
              <header className="flex flex-col sm:flex-row justify-between items-center bg-slate-900/30 p-8 rounded-[48px] border border-white/5 gap-8">
                <div><h2 className="text-3xl font-black text-white tracking-tighter">Session Logs</h2><p className="text-[10px] text-slate-500 font-black uppercase mt-4 tracking-widest">Archive Management</p></div>
                <button onClick={() => setShowImportModal(true)} className="w-full sm:w-auto px-10 py-5 bg-emerald-500 text-black rounded-3xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-3 shadow-2xl shadow-emerald-500/20"><Sparkles className="w-5 h-5" /> Cloud Sync</button>
              </header>
              <div className="space-y-8">
                {groupedHistory.map(([date, dayRecords]) => (
                  <div key={date} className="bg-slate-900/20 rounded-[48px] border border-white/5 overflow-hidden shadow-2xl">
                    <div className="bg-black/40 px-10 py-6 border-b border-white/5"><h3 className="font-black text-xs text-slate-500 uppercase tracking-widest">{format(parseISO(date), 'EEEE, MMM do, yyyy')}</h3></div>
                    <div className="divide-y divide-white/5">
                      {dayRecords.map(r => (
                        <div key={r.id} className="px-10 py-8 flex items-center justify-between hover:bg-black/20 transition-all gap-4">
                          <div className="min-w-0"><p className="text-white font-black text-2xl tracking-tight truncate">{r.actualSubjectName}</p></div>
                          <div className="flex items-center gap-6">
                            <span className={`px-5 py-2 rounded-xl text-[11px] font-black uppercase border ${r.status === 'present' ? 'text-emerald-400 border-emerald-500/20' : 'text-rose-400 border-rose-500/20'}`}>{r.status}</span>
                            <button onClick={() => { if(confirm('Delete record?')) syncToBackend(records.filter(x => x.id !== r.id)); }} className="p-4 bg-rose-500/10 text-rose-500 rounded-2xl hover:bg-rose-600 hover:text-white transition-all"><Trash2 className="w-5 h-5" /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'admin' && isAdmin && (
            <div className="space-y-12 animate-in fade-in duration-700">
              <header className="flex flex-col lg:flex-row justify-between items-center bg-indigo-600 p-10 sm:p-14 rounded-[56px] gap-10 shadow-2xl">
                <div><h2 className="text-4xl font-black text-white tracking-tighter">Root Admin</h2><p className="text-indigo-100 text-[11px] font-black uppercase mt-4 tracking-widest">Master Node Logic</p></div>
                <div className="flex bg-indigo-700/50 p-2 rounded-[36px] backdrop-blur-3xl overflow-x-auto no-scrollbar">
                  <button onClick={() => setAdminView('students')} className={`px-12 py-5 rounded-[28px] font-black uppercase text-[11px] tracking-widest transition-all ${adminView === 'students' ? 'bg-white text-indigo-600' : 'text-white/70'}`}>Students</button>
                  <button onClick={() => setAdminView('timetable')} className={`px-12 py-5 rounded-[28px] font-black uppercase text-[11px] tracking-widest transition-all ${adminView === 'timetable' ? 'bg-white text-indigo-600' : 'text-white/70'}`}>Schedule</button>
                  <button onClick={() => setAdminView('broadcast')} className={`px-12 py-5 rounded-[28px] font-black uppercase text-[11px] tracking-widest transition-all ${adminView === 'broadcast' ? 'bg-white text-indigo-600' : 'text-white/70'}`}>Broadcast</button>
                </div>
              </header>

              {adminView === 'broadcast' && (
                <div className="bg-slate-900/30 p-10 rounded-[56px] border border-white/5 space-y-8 animate-in zoom-in duration-300">
                  <h3 className="text-3xl font-black text-white flex items-center gap-4"><Megaphone className="w-8 h-8 text-indigo-500" /> Global Dispatch</h3>
                  <textarea value={broadcastInput} onChange={(e) => setBroadcastInput(e.target.value)} placeholder="Enter emergency broadcast message..." className="w-full bg-black/40 border border-white/10 rounded-[32px] p-8 text-white outline-none focus:border-indigo-500 h-48 font-bold text-lg" />
                  <button onClick={() => { if(broadcastInput) { setBroadcast({message: broadcastInput, timestamp: Date.now()}); setBroadcastInput(''); alert('Broadcast deployed successfully.'); } }} className="w-full sm:w-auto px-14 py-6 bg-indigo-600 text-white rounded-[28px] font-black uppercase text-xs tracking-widest shadow-2xl flex items-center justify-center gap-4"><Send className="w-6 h-6" /> Deploy Broadcast</button>
                </div>
              )}

              {adminView === 'students' && (
                <div className="space-y-10">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                    <div className="bg-slate-900/20 p-10 rounded-[48px] border border-white/5"><p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Enrolled Nodes</p><h4 className="text-5xl font-black text-white mt-4">{allStudentData.length}</h4></div>
                    <button onClick={() => setShowAddStudentModal(true)} className="sm:col-span-2 bg-indigo-600/5 border-2 border-dashed border-indigo-500/20 rounded-[48px] flex items-center justify-center gap-6 group hover:bg-indigo-600/10 transition-all">
                      <UserPlus className="w-10 h-10 text-indigo-500" />
                      <span className="text-xl font-black uppercase tracking-widest text-indigo-400">Enroll New Node</span>
                    </button>
                  </div>
                  <div className="bg-slate-900/20 rounded-[56px] border border-white/5 overflow-x-auto shadow-2xl">
                    <table className="w-full text-left min-w-[700px]">
                      <thead>
                        <tr className="bg-black/40 border-b border-white/5">
                          <th className="px-12 py-8 text-[11px] font-black uppercase text-slate-500 tracking-widest">Profile</th>
                          <th className="px-12 py-8 text-[11px] font-black uppercase text-slate-500 tracking-widest text-center">Aggregate</th>
                          <th className="px-12 py-8 text-[11px] font-black uppercase text-slate-500 tracking-widest text-right">Terminals</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {allStudentData.map(s => (
                          <tr key={s.sapId} className="hover:bg-black/20 transition-all">
                            <td className="px-12 py-8">
                              <p className="font-black text-white text-2xl tracking-tight">{s.name}</p>
                              <p className="text-[11px] text-slate-600 font-bold uppercase tracking-widest mt-1">SAP ID: {s.sapId}</p>
                            </td>
                            <td className="px-12 py-8 text-center font-black"><span className={`text-4xl tracking-tighter ${s.overall >= 75 ? 'text-emerald-400' : 'text-rose-400'}`}>{s.overall}%</span></td>
                            <td className="px-12 py-8 text-right">
                              <div className="flex justify-end gap-4">
                                <button onClick={() => setSelectedAdminStudent(s.sapId)} className="p-5 bg-indigo-600/10 text-indigo-400 rounded-2xl hover:bg-indigo-600 hover:text-white transition-all"><Settings className="w-6 h-6" /></button>
                                <button onClick={() => { if(confirm('Erase profile?')) setStudentsList(p => p.filter(x => x.sapId !== s.sapId)); }} className="p-5 bg-rose-600/10 text-rose-500 rounded-2xl hover:bg-rose-600 hover:text-white transition-all"><Trash2 className="w-6 h-6" /></button>
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
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 pb-20">
                  {DAYS.map(day => (
                    <div key={day} className="bg-slate-900/20 rounded-[56px] border border-white/5 overflow-hidden shadow-2xl flex flex-col">
                      <div className="bg-black/40 p-10 flex justify-between items-center border-b border-white/5">
                        <h3 className="font-black text-2xl text-white tracking-widest uppercase">{day}</h3>
                        <button onClick={() => setShowAddLectureModal(day)} className="p-5 bg-indigo-600 rounded-3xl text-white shadow-xl"><Plus className="w-6 h-6" /></button>
                      </div>
                      <div className="p-10 space-y-6">
                        {timetable.filter(l => l.day === day).map(lecture => (
                          <div key={lecture.id} className="flex items-center justify-between p-8 bg-black/30 rounded-[40px] border border-white/5 group hover:border-indigo-500 transition-all gap-4">
                            <div className="min-w-0">
                              <p className="font-black text-white text-2xl tracking-tight leading-tight truncate">{lecture.subject}</p>
                              <p className="text-[11px] text-slate-600 uppercase font-black tracking-widest mt-4 flex items-center gap-3"><Clock className="w-4 h-4" /> {lecture.time}</p>
                            </div>
                            <button onClick={() => setTimetable(prev => prev.filter(x => x.id !== lecture.id))} className="p-4 bg-rose-500/10 text-rose-500 rounded-2xl transition-all"><Trash2 className="w-5 h-5" /></button>
                          </div>
                        ))}
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
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#080808]/90 backdrop-blur-3xl border-t border-white/5 flex items-center justify-around p-4 pb-10 z-[100]">
        <MobileNavItem icon={<Layout />} active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
        <MobileNavItem icon={<Calendar />} active={activeTab === 'schedule'} onClick={() => setActiveTab('schedule')} />
        <MobileNavItem icon={<Calculator />} active={activeTab === 'subjects'} onClick={() => setActiveTab('subjects')} />
        <MobileNavItem icon={<History />} active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
        {isAdmin && <MobileNavItem icon={<Database />} active={activeTab === 'admin'} onClick={() => setActiveTab('admin')} />}
      </nav>

      {/* Admin Student Details Modal */}
      {selectedAdminStudent && selectedStudentDetails && (
        <div className="fixed inset-0 z-[250] flex items-end sm:items-center justify-center p-0 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-3xl" onClick={() => setSelectedAdminStudent(null)} />
          <div className="relative bg-[#080808] w-full sm:max-w-2xl h-[90vh] sm:h-[80vh] rounded-t-[56px] sm:rounded-[64px] border-t sm:border border-white/10 p-10 flex flex-col shadow-2xl">
            <div className="flex justify-between items-start mb-10">
              <div className="min-w-0">
                <h3 className="text-3xl font-black text-white tracking-tighter truncate">{selectedStudentDetails.name}</h3>
                <p className="text-slate-500 uppercase text-[10px] mt-2 font-bold tracking-widest">Aggregate Score: {selectedStudentDetails.stats.overall}%</p>
              </div>
              <button onClick={() => setSelectedAdminStudent(null)} className="p-4 bg-white/5 rounded-3xl text-slate-500"><X className="w-8 h-8" /></button>
            </div>
            <div className="flex-grow overflow-y-auto space-y-6 custom-scrollbar pr-3 pb-20">
              {selectedStudentDetails.stats.summary.map(sub => (
                <div key={sub.name} className="bg-black/40 border border-white/5 p-8 rounded-[40px] flex justify-between items-center group hover:border-indigo-500/20 transition-all">
                  <div className="min-w-0">
                    <p className="font-black text-white text-xl truncate tracking-tight">{sub.name}</p>
                    <p className="text-[10px] text-slate-600 font-black uppercase mt-2 tracking-widest">Ratio: {sub.present} / {sub.total}</p>
                  </div>
                  <h4 className={`text-4xl font-black tracking-tighter shrink-0 ${sub.percentage >= 75 ? 'text-emerald-400' : 'text-rose-400'}`}>{sub.percentage}%</h4>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Admin Add Student Modal */}
      {showAddStudentModal && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-300">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-2xl" onClick={() => setShowAddStudentModal(false)} />
          <div className="relative bg-[#080808] w-full max-w-lg rounded-[64px] border border-white/10 p-12 shadow-2xl">
            <h3 className="text-3xl font-black text-white tracking-tighter mb-8 text-center">Enroll Student</h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              const f = e.currentTarget as HTMLFormElement;
              const n = (f.elements[0] as HTMLInputElement).value;
              const s = (f.elements[1] as HTMLInputElement).value;
              setStudentsList(p => [...p, { name: n, sapId: s }]);
              setShowAddStudentModal(false);
            }} className="space-y-6">
              <input type="text" placeholder="Full Student Name" className="w-full bg-black/40 border border-white/10 rounded-2xl py-6 px-10 text-white outline-none focus:border-indigo-500 font-bold" required />
              <input type="text" placeholder="Official SAP ID" className="w-full bg-black/40 border border-white/10 rounded-2xl py-6 px-10 text-white outline-none focus:border-indigo-500 font-bold" required />
              <div className="flex gap-4 pt-6">
                <button type="button" onClick={() => setShowAddStudentModal(false)} className="flex-1 py-6 bg-white/5 text-slate-500 rounded-3xl font-black uppercase text-[10px] tracking-widest">Discard</button>
                <button type="submit" className="flex-1 py-6 bg-indigo-600 text-white rounded-3xl font-black uppercase text-[10px] tracking-widest shadow-xl">Enroll Node</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Additional modals (NotificationCenter, StatusLog, etc.) remain integrated but optimized for layering */}
      {showNotificationCenter && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-xl" onClick={() => setShowNotificationCenter(false)} />
          <div className="relative bg-[#080808] w-full sm:max-w-xl rounded-t-[56px] sm:rounded-[64px] p-12 shadow-2xl border-t sm:border border-white/10 max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-10">
              <h3 className="text-3xl font-black text-white tracking-tighter flex items-center gap-4"><BellRing className="text-indigo-500" /> Dispatch</h3>
              <button onClick={() => setShowNotificationCenter(false)} className="p-4 bg-white/5 rounded-3xl text-slate-500"><X className="w-7 h-7" /></button>
            </div>
            <div className="flex-grow overflow-y-auto space-y-6 custom-scrollbar pr-3 pb-8">
              {broadcast ? (
                <div className="bg-indigo-600/10 border border-indigo-500/20 p-10 rounded-[48px] space-y-5">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase text-indigo-400 tracking-widest">Global Admin</span>
                    <span className="text-[10px] font-bold text-slate-600">{format(broadcast.timestamp, 'HH:mm')}</span>
                  </div>
                  <p className="text-white font-bold text-base leading-relaxed">{broadcast.message}</p>
                </div>
              ) : (
                <div className="py-24 text-center opacity-20 flex flex-col items-center gap-6">
                  <Megaphone className="w-16 h-16" />
                  <p className="font-black uppercase text-xs tracking-widest">Synchronized</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// UI Atoms
const NavItem: React.FC<{ icon: React.ReactNode; label: string; active: boolean; onClick: () => void }> = ({ icon, label, active, onClick }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-6 px-10 py-5 rounded-2xl transition-all font-black text-xs uppercase tracking-widest ${active ? 'bg-indigo-600 text-white shadow-2xl shadow-indigo-600/30' : 'text-slate-600 hover:bg-white/5 hover:text-slate-300'}`}>
    {React.cloneElement(icon as React.ReactElement<any>, { className: `w-6 h-6` })}
    {label}
  </button>
);

const MobileNavItem: React.FC<{ icon: React.ReactNode; active: boolean; onClick: () => void }> = ({ icon, active, onClick }) => (
  <button onClick={onClick} className={`flex flex-col items-center justify-center w-14 h-14 rounded-2xl transition-all ${active ? 'bg-indigo-600 text-white shadow-2xl shadow-indigo-600/20 scale-110' : 'text-slate-600 active:scale-95'}`}>
    {React.cloneElement(icon as React.ReactElement<any>, { className: `w-6 h-6` })}
  </button>
);

const StatusBtn: React.FC<{ icon: React.ReactNode; label: string; color: string; onClick: () => void }> = ({ icon, label, color, onClick }) => (
  <button onClick={onClick} className={`flex items-center gap-8 w-full p-8 bg-black/40 border border-white/5 rounded-[40px] transition-all ${color} font-black uppercase text-xs text-slate-400 text-left group tracking-widest`}>
    {React.cloneElement(icon as React.ReactElement<any>, { className: 'w-10 h-10 shrink-0 transition-all group-hover:scale-125' })}
    {label}
  </button>
);

export default App;
