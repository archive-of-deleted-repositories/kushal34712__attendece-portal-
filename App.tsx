
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell
} from 'recharts';
import { 
  Calendar, CheckCircle, XCircle, Clock, BookOpen, BarChart2, 
  User as UserIcon, ChevronRight, AlertCircle, History, Layout, ChevronLeft,
  MinusCircle, RefreshCcw, X, Plus, Sparkles, Wand2, LogOut, Lock, Cloud, ShieldCheck, Database, FileText, ArrowLeft, Palmtree, Trash2, UserCog, Settings, UserPlus, Calculator, Bell, BellRing, Send, Megaphone, Ban, Umbrella
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
    // Using a stable ID for regular lectures and timestamp for extra ones
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
    setShowSubModal(null);
    setShowExtraModal(false);
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

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('nmims_session_user');
    setActiveTab('dashboard');
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

  const todayStr = format(selectedDate, 'yyyy-MM-dd');
  const selectedDayName = format(selectedDate, 'EEEE') as DayOfWeek;

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
        <button onClick={handleLogout} className="mt-auto flex items-center gap-4 px-6 py-4 rounded-xl text-rose-500 font-black text-xs uppercase hover:bg-rose-500/10 transition-all"><LogOut className="w-5 h-5" /> Terminate</button>
      </aside>

      {/* Main Container */}
      <main className="flex-grow h-screen overflow-y-auto custom-scrollbar relative flex flex-col pb-24 md:pb-0">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between p-4 bg-[#080808]/90 backdrop-blur-xl border-b border-white/5 sticky top-0 z-[60]">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black text-xs shadow-lg">NM</div>
             <span className="font-black text-[10px] text-white uppercase tracking-widest truncate max-w-[100px]">{currentUser.name}</span>
          </div>
          <div className="flex items-center gap-1">
            {isSyncing && <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse mr-2" />}
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
                  <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-[10px] sm:text-xs mt-2">Personal Analytics Terminal</p>
                </div>
                <button onClick={() => setShowNotificationCenter(true)} className="hidden sm:flex items-center gap-3 px-8 py-4 bg-slate-900/30 border border-white/5 rounded-2xl hover:bg-indigo-600/10 transition-all group">
                  <Bell className="w-5 h-5 text-slate-500 group-hover:text-indigo-500" />
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Global Broadcasts</span>
                </button>
              </header>

              {/* Aggregated Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-slate-900/30 p-8 sm:p-10 rounded-[40px] border border-white/5 flex items-center justify-between group hover:border-indigo-500/20 transition-all">
                  <div>
                    <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest">Aggregate</p>
                    <h3 className="text-5xl sm:text-7xl font-black mt-2 text-white tracking-tighter">{stats.overall}%</h3>
                  </div>
                  <div className="h-20 w-20 sm:h-28 sm:w-28">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={[{v: stats.totalP}, {v: Math.max(0.1, stats.totalC-stats.totalP)}]} innerRadius={30} outerRadius={42} paddingAngle={4} dataKey="v" stroke="none">
                          <Cell fill="#6366f1" />
                          <Cell fill="#1a1a1a" />
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="bg-slate-900/30 p-8 sm:p-10 rounded-[40px] border border-white/5 flex flex-col justify-center group hover:border-indigo-500/20 transition-all">
                  <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest">Attendance Ratio</p>
                  <div className="flex items-baseline gap-3 mt-3">
                    <h3 className="text-5xl sm:text-7xl font-black text-indigo-400 tracking-tighter">{stats.totalP}</h3>
                    <span className="text-slate-600 text-2xl font-bold tracking-tighter">/ {stats.totalC}</span>
                  </div>
                </div>
                <div className="bg-slate-900/30 p-8 sm:p-10 rounded-[40px] border border-white/5 group hover:border-indigo-500/20 transition-all sm:col-span-2 lg:col-span-1">
                  <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest">Integrity</p>
                  <div className="mt-8 h-4 bg-black/40 rounded-full overflow-hidden">
                    <div className={`h-full transition-all duration-1000 ${stats.overall >= 75 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${Math.min(stats.overall, 100)}%` }} />
                  </div>
                  <p className={`text-[9px] mt-4 font-black uppercase tracking-widest ${stats.overall >= 75 ? 'text-emerald-400' : 'text-rose-400'}`}>{stats.overall >= 75 ? 'Operational' : 'Critical Hazard'}</p>
                </div>
              </div>

              {/* Subject Performance List on Home Screen */}
              <section className="space-y-8">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-black text-white flex items-center gap-4"><BookOpen className="w-8 h-8 text-indigo-500" /> Subject Metrics</h2>
                  <button onClick={() => setActiveTab('subjects')} className="text-[10px] font-black uppercase text-indigo-400 tracking-widest hover:underline">View Strategy</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {stats.summary.map(sub => (
                    <div key={sub.name} className="bg-slate-900/20 p-6 rounded-[32px] border border-white/5 flex items-center justify-between group hover:bg-slate-900/40 transition-all">
                      <div className="min-w-0 pr-4">
                        <h4 className="font-black text-white text-lg tracking-tight truncate leading-tight">{sub.name}</h4>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Sessions: {sub.present}/{sub.total}</p>
                      </div>
                      <div className={`text-2xl font-black tracking-tighter ${sub.percentage >= 75 ? 'text-emerald-400' : 'text-rose-400'}`}>{sub.percentage}%</div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-8">
                <h2 className="text-2xl font-black text-white flex items-center gap-4"><BarChart2 className="w-8 h-8 text-indigo-500" /> Analytics Graph</h2>
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
                {timetable.filter(l => l.day === selectedDayName).length > 0 ? (
                  timetable.filter(l => l.day === selectedDayName).map(lecture => {
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
                        <button 
                          onClick={() => setShowStatusModal({lectureId: lecture.id, subject: lecture.subject})} 
                          className={`w-full sm:w-auto px-14 py-6 rounded-[32px] font-black text-[11px] uppercase border tracking-widest transition-all pointer-events-auto active:scale-95 ${ record?.status === 'present' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : record?.status === 'absent' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : record?.status === 'cancelled' || record?.status === 'holiday' ? 'bg-slate-500/10 text-slate-500 border-slate-500/20' : 'bg-black/40 text-slate-500 border-white/10' }`}
                        >
                          {record?.status || 'Record Entry'}
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-24 text-center opacity-30 flex flex-col items-center gap-6">
                    <Calendar className="w-16 h-16" />
                    <p className="font-black uppercase text-xs tracking-widest">No Sessions Scheduled</p>
                  </div>
                )}
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
                  <div key={sub.name} className="bg-slate-900/40 rounded-[48px] border border-white/5 overflow-hidden shadow-2xl flex flex-col group hover:border-indigo-500/20 transition-all">
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
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2">System Intelligence</p>
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
              </header>
              <div className="space-y-8">
                {groupedHistory.length > 0 ? (
                  groupedHistory.map(([date, dayRecords]) => (
                    <div key={date} className="bg-slate-900/20 rounded-[48px] border border-white/5 overflow-hidden shadow-2xl">
                      <div className="bg-black/40 px-10 py-6 border-b border-white/5"><h3 className="font-black text-xs text-slate-500 uppercase tracking-widest">{format(parseISO(date), 'EEEE, MMM do, yyyy')}</h3></div>
                      <div className="divide-y divide-white/5">
                        {dayRecords.map(r => (
                          <div key={r.id} className="px-10 py-8 flex items-center justify-between hover:bg-black/20 transition-all gap-4">
                            <div className="min-w-0 pr-4">
                              <p className="text-white font-black text-2xl tracking-tight truncate">{r.actualSubjectName}</p>
                            </div>
                            <div className="flex items-center gap-6 shrink-0">
                              <span className={`px-5 py-2 rounded-xl text-[11px] font-black uppercase border ${r.status === 'present' ? 'text-emerald-400 border-emerald-500/20' : r.status === 'absent' ? 'text-rose-400 border-rose-500/20' : 'text-slate-500 border-white/10'}`}>{r.status}</span>
                              <button onClick={() => { if(confirm('Delete record?')) setRecords(prev => prev.filter(x => x.id !== r.id)); }} className="p-4 bg-rose-500/10 text-rose-500 rounded-2xl hover:bg-rose-600 hover:text-white transition-all"><Trash2 className="w-5 h-5" /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-40 text-center opacity-20 flex flex-col items-center gap-6">
                    <History className="w-24 h-24" />
                    <p className="font-black uppercase text-sm tracking-widest">No Logs Found</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'admin' && isAdmin && (
            <div className="space-y-12 animate-in fade-in duration-700">
              <header className="flex flex-col lg:flex-row justify-between items-center bg-indigo-600 p-10 sm:p-14 rounded-[56px] gap-10 shadow-2xl">
                <div><h2 className="text-4xl sm:text-6xl font-black text-white tracking-tighter">Root Admin</h2><p className="text-indigo-100 text-[11px] font-black uppercase mt-4 tracking-widest">Master Node Logic</p></div>
                <div className="flex bg-indigo-700/50 p-2 rounded-[36px] backdrop-blur-3xl overflow-x-auto no-scrollbar w-full sm:w-auto">
                  <button onClick={() => setAdminView('students')} className={`px-12 py-5 rounded-[28px] font-black uppercase text-[11px] tracking-widest transition-all ${adminView === 'students' ? 'bg-white text-indigo-600 shadow-lg' : 'text-white/70 hover:text-white'}`}>Students</button>
                  <button onClick={() => setAdminView('timetable')} className={`px-12 py-5 rounded-[28px] font-black uppercase text-[11px] tracking-widest transition-all ${adminView === 'timetable' ? 'bg-white text-indigo-600 shadow-lg' : 'text-white/70 hover:text-white'}`}>Schedule</button>
                  <button onClick={() => setAdminView('broadcast')} className={`px-12 py-5 rounded-[28px] font-black uppercase text-[11px] tracking-widest transition-all ${adminView === 'broadcast' ? 'bg-white text-indigo-600 shadow-lg' : 'text-white/70 hover:text-white'}`}>Broadcast</button>
                </div>
              </header>

              {adminView === 'broadcast' && (
                <div className="bg-slate-900/30 p-10 rounded-[56px] border border-white/5 space-y-8 animate-in zoom-in duration-300">
                  <h3 className="text-3xl font-black text-white flex items-center gap-4"><Megaphone className="w-8 h-8 text-indigo-500" /> Global Dispatch</h3>
                  <textarea value={broadcastInput} onChange={(e) => setBroadcastInput(e.target.value)} placeholder="Enter emergency broadcast message for all students..." className="w-full bg-black/40 border border-white/10 rounded-[32px] p-8 text-white outline-none focus:border-indigo-500 h-48 font-bold text-lg transition-all" />
                  <button onClick={() => { if(broadcastInput) { setBroadcast({message: broadcastInput, timestamp: Date.now()}); setBroadcastInput(''); alert('Broadcast deployed successfully.'); } }} className="w-full sm:w-auto px-14 py-6 bg-indigo-600 text-white rounded-[28px] font-black uppercase text-xs tracking-widest shadow-2xl flex items-center justify-center gap-4 active:scale-95 transition-all"><Send className="w-6 h-6" /> Deploy Broadcast</button>
                </div>
              )}

              {adminView === 'students' && (
                <div className="space-y-10">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                    <div className="bg-slate-900/20 p-10 rounded-[48px] border border-white/5"><p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Enrolled Nodes</p><h4 className="text-5xl font-black text-white mt-4">{allStudentData.length}</h4></div>
                    <button onClick={() => setShowAddStudentModal(true)} className="sm:col-span-2 bg-indigo-600/5 border-2 border-dashed border-indigo-500/20 rounded-[48px] flex items-center justify-center gap-6 group hover:bg-indigo-600/10 transition-all p-8">
                      <UserPlus className="w-10 h-10 text-indigo-500 group-hover:scale-110 transition-all" />
                      <span className="text-xl font-black uppercase tracking-widest text-indigo-400">Enroll New Node</span>
                    </button>
                  </div>
                  
                  {/* Redesigned Admin Student List for Mobile Compatibility */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {allStudentData.map(s => (
                      <div key={s.sapId} className="bg-slate-900/20 rounded-[40px] border border-white/5 p-8 flex flex-col gap-6 hover:bg-slate-900/30 transition-all">
                        <div className="flex justify-between items-start">
                          <div className="min-w-0 pr-4">
                            <h4 className="font-black text-white text-2xl tracking-tight leading-tight truncate">{s.name}</h4>
                            <p className="text-[11px] text-slate-600 font-bold uppercase tracking-widest mt-1">ID: {s.sapId}</p>
                          </div>
                          <div className={`text-3xl font-black tracking-tighter shrink-0 ${s.overall >= 75 ? 'text-emerald-400' : 'text-rose-400'}`}>{s.overall}%</div>
                        </div>
                        <div className="flex gap-4">
                          <button onClick={() => setSelectedAdminStudent(s.sapId)} className="flex-grow py-5 bg-indigo-600/10 text-indigo-400 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center gap-3">
                            <Settings className="w-5 h-5" /> Analytics
                          </button>
                          <button onClick={() => { if(confirm('Erase profile?')) setStudentsList(p => p.filter(x => x.sapId !== s.sapId)); }} className="p-5 bg-rose-600/10 text-rose-500 rounded-2xl hover:bg-rose-600 hover:text-white transition-all">
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {allStudentData.length === 0 && (
                      <div className="md:col-span-2 py-20 text-center opacity-20">
                        <p className="font-black uppercase text-xs tracking-widest">Database Synchronized - No Students Found</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {adminView === 'timetable' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 pb-20">
                  {DAYS.map(day => (
                    <div key={day} className="bg-slate-900/20 rounded-[56px] border border-white/5 overflow-hidden shadow-2xl flex flex-col hover:border-indigo-500/10 transition-all">
                      <div className="bg-black/40 p-10 flex justify-between items-center border-b border-white/5">
                        <h3 className="font-black text-2xl text-white tracking-widest uppercase">{day}</h3>
                        <button onClick={() => setShowAddLectureModal(day)} className="p-5 bg-indigo-600 rounded-3xl text-white shadow-xl active:scale-95 transition-all"><Plus className="w-6 h-6" /></button>
                      </div>
                      <div className="p-10 space-y-6">
                        {timetable.filter(l => l.day === day).length > 0 ? (
                          timetable.filter(l => l.day === day).map(lecture => (
                            <div key={lecture.id} className="flex items-center justify-between p-8 bg-black/30 rounded-[40px] border border-white/5 group hover:border-indigo-500 transition-all gap-4">
                              <div className="min-w-0">
                                <p className="font-black text-white text-2xl tracking-tight leading-tight truncate">{lecture.subject}</p>
                                <p className="text-[11px] text-slate-600 uppercase font-black tracking-widest mt-4 flex items-center gap-3"><Clock className="w-4 h-4" /> {lecture.time}</p>
                              </div>
                              <button onClick={() => setTimetable(prev => prev.filter(x => x.id !== lecture.id))} className="p-4 bg-rose-500/10 text-rose-500 rounded-2xl hover:bg-rose-600 hover:text-white transition-all active:scale-95 shrink-0"><Trash2 className="w-5 h-5" /></button>
                            </div>
                          ))
                        ) : (
                          <div className="py-10 text-center opacity-20">
                            <p className="text-[10px] font-black uppercase tracking-widest">No Sessions Defined</p>
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
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#080808]/90 backdrop-blur-3xl border-t border-white/5 flex items-center justify-around p-4 pb-10 z-[100]">
        <MobileNavItem icon={<Layout />} active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
        <MobileNavItem icon={<Calendar />} active={activeTab === 'schedule'} onClick={() => setActiveTab('schedule')} />
        <MobileNavItem icon={<Calculator />} active={activeTab === 'subjects'} onClick={() => setActiveTab('subjects')} />
        <MobileNavItem icon={<History />} active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
        {isAdmin && <MobileNavItem icon={<Database />} active={activeTab === 'admin'} onClick={() => setActiveTab('admin')} />}
      </nav>

      {/* --- ALL MODALS START HERE --- */}

      {/* Status Log Modal - FIXED WITH CANCEL OPTIONS */}
      {showStatusModal && (
        <div className="fixed inset-0 z-[250] flex items-end sm:items-center justify-center p-0 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-2xl" onClick={() => setShowStatusModal(null)} />
          <div className="relative bg-[#080808] w-full sm:max-w-xl rounded-t-[56px] sm:rounded-[64px] p-10 sm:p-14 shadow-2xl border-t sm:border border-white/10 overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-start mb-12">
              <div className="min-w-0 pr-6">
                <h3 className="text-3xl font-black text-white tracking-tighter leading-tight">Record Entry</h3>
                <p className="text-slate-500 uppercase text-[10px] mt-2 font-bold tracking-widest truncate">{showStatusModal.subject}</p>
              </div>
              <button onClick={() => setShowStatusModal(null)} className="p-4 bg-white/5 rounded-3xl text-slate-500 shrink-0"><X className="w-8 h-8" /></button>
            </div>
            <div className="grid gap-3 mb-8">
              <StatusBtn icon={<CheckCircle className="text-emerald-500" />} label="Present" color="hover:bg-emerald-500/10" onClick={() => markAttendance(showStatusModal.lectureId, showStatusModal.subject, 'present')} />
              <StatusBtn icon={<XCircle className="text-rose-500" />} label="Absent" color="hover:bg-rose-500/10" onClick={() => markAttendance(showStatusModal.lectureId, showStatusModal.subject, 'absent')} />
              <div className="grid grid-cols-2 gap-3">
                <StatusBtn icon={<Ban className="text-slate-400" />} label="Cancel" color="hover:bg-white/5" onClick={() => markAttendance(showStatusModal.lectureId, showStatusModal.subject, 'cancelled')} />
                <StatusBtn icon={<Umbrella className="text-amber-500" />} label="Holiday" color="hover:bg-amber-500/5" onClick={() => markAttendance(showStatusModal.lectureId, showStatusModal.subject, 'holiday')} />
              </div>
              <StatusBtn icon={<RefreshCcw className="text-indigo-500" />} label="Substitute Session" color="hover:bg-indigo-500/10" onClick={() => setShowSubModal({lectureId: showStatusModal.lectureId, originalSubject: showStatusModal.subject})} />
            </div>
          </div>
        </div>
      )}

      {/* Substitution Modal */}
      {showSubModal && (
        <div className="fixed inset-0 z-[260] flex items-end sm:items-center justify-center p-0 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-3xl" onClick={() => setShowSubModal(null)} />
          <div className="relative bg-[#080808] w-full sm:max-w-xl h-[80vh] rounded-t-[56px] sm:rounded-[64px] border-t sm:border border-white/10 p-10 flex flex-col shadow-2xl">
            <div className="flex justify-between items-center mb-10">
              <h3 className="text-2xl font-black text-white tracking-tighter">Choose Sub Subject</h3>
              <button onClick={() => setShowSubModal(null)} className="p-4 bg-white/5 rounded-3xl text-slate-500"><X className="w-8 h-8" /></button>
            </div>
            <div className="flex-grow overflow-y-auto space-y-4 custom-scrollbar pr-3 pb-10">
              {subjectsList.map(sub => (
                <div key={sub.name} className="bg-black/40 p-8 rounded-[40px] border border-white/5 flex items-center justify-between gap-6 group hover:border-indigo-500/30 transition-all shadow-xl">
                  <span className="font-black text-slate-200 text-lg truncate leading-tight tracking-tight">{sub.name}</span>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => markAttendance(showSubModal.lectureId, showSubModal.originalSubject, 'present', sub.name)} className="w-12 h-12 bg-emerald-500 text-black rounded-2xl font-black shadow-lg active:scale-90 transition-all">P</button>
                    <button onClick={() => markAttendance(showSubModal.lectureId, showSubModal.originalSubject, 'absent', sub.name)} className="w-12 h-12 bg-rose-500 text-black rounded-2xl font-black shadow-lg active:scale-90 transition-all">A</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Extra Session Modal */}
      {showExtraModal && (
        <div className="fixed inset-0 z-[260] flex items-end sm:items-center justify-center p-0 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-3xl" onClick={() => setShowExtraModal(false)} />
          <div className="relative bg-[#080808] w-full sm:max-w-xl h-[80vh] rounded-t-[56px] sm:rounded-[64px] border-t sm:border border-white/10 p-10 flex flex-col shadow-2xl">
            <div className="flex justify-between items-center mb-10">
              <h3 className="text-2xl font-black text-white tracking-tighter">Log Extra Session</h3>
              <button onClick={() => setShowExtraModal(false)} className="p-4 bg-white/5 rounded-3xl text-slate-500"><X className="w-8 h-8" /></button>
            </div>
            <div className="flex-grow overflow-y-auto space-y-4 custom-scrollbar pr-3 pb-10">
              {subjectsList.map(sub => (
                <div key={sub.name} className="bg-black/40 p-8 rounded-[40px] border border-white/5 flex items-center justify-between gap-6 group hover:border-indigo-500/30 transition-all shadow-xl">
                  <span className="font-black text-slate-200 text-lg truncate leading-tight tracking-tight">{sub.name}</span>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => markAttendance(`extra-${Date.now()}`, 'Extra', 'present', sub.name)} className="w-12 h-12 bg-emerald-500 text-black rounded-2xl font-black shadow-lg active:scale-90 transition-all">P</button>
                    <button onClick={() => markAttendance(`extra-${Date.now()}`, 'Extra', 'absent', sub.name)} className="w-12 h-12 bg-rose-500 text-black rounded-2xl font-black shadow-lg active:scale-90 transition-all">A</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Admin Student Details Modal - FIXED DATA VIEW */}
      {selectedAdminStudent && selectedStudentDetails && (
        <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-3xl" onClick={() => setSelectedAdminStudent(null)} />
          <div className="relative bg-[#080808] w-full sm:max-w-2xl h-[90vh] sm:h-[85vh] rounded-t-[56px] sm:rounded-[64px] border-t sm:border border-white/10 p-8 sm:p-12 flex flex-col shadow-2xl">
            <div className="flex justify-between items-start mb-10">
              <div className="min-w-0 pr-8">
                <h3 className="text-3xl font-black text-white tracking-tighter truncate leading-tight">{selectedStudentDetails.name}</h3>
                <div className="flex items-center gap-4 mt-2">
                  <p className="text-slate-500 uppercase text-[10px] font-bold tracking-widest">Aggregate: {selectedStudentDetails.stats.overall}%</p>
                  <span className="w-1 h-1 bg-slate-700 rounded-full" />
                  <p className="text-slate-500 uppercase text-[10px] font-bold tracking-widest">ID: {selectedStudentDetails.sapId}</p>
                </div>
              </div>
              <button onClick={() => setSelectedAdminStudent(null)} className="p-4 bg-white/5 rounded-3xl text-slate-500 shrink-0"><X className="w-8 h-8" /></button>
            </div>
            <div className="flex-grow overflow-y-auto space-y-4 custom-scrollbar pr-3 pb-20">
              {selectedStudentDetails.stats.summary.map(sub => (
                <div key={sub.name} className="bg-black/40 border border-white/5 p-8 rounded-[40px] flex justify-between items-center group hover:border-indigo-500/20 transition-all shadow-lg">
                  <div className="min-w-0 pr-6">
                    <p className="font-black text-white text-xl truncate tracking-tight leading-tight">{sub.name}</p>
                    <p className="text-[10px] text-slate-600 font-black uppercase mt-2 tracking-widest">Sessions: {sub.present} / {sub.total}</p>
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
        <div className="fixed inset-0 z-[320] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-300">
          <div className="absolute inset-0 bg-black/98 backdrop-blur-2xl" onClick={() => setShowAddStudentModal(false)} />
          <div className="relative bg-[#080808] w-full max-w-lg rounded-[64px] border border-white/10 p-12 shadow-2xl">
            <h3 className="text-3xl font-black text-white tracking-tighter mb-8 text-center">Enroll Student</h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const n = f.get('name') as string;
              const s = f.get('sap') as string;
              if(n && s) {
                setStudentsList(p => [...p, { name: n, sapId: s }]);
                setShowAddStudentModal(false);
              }
            }} className="space-y-6">
              <input name="name" type="text" placeholder="Full Student Name" className="w-full bg-black/40 border border-white/10 rounded-2xl py-6 px-10 text-white outline-none focus:border-indigo-500 font-bold" required />
              <input name="sap" type="text" placeholder="Official SAP ID" className="w-full bg-black/40 border border-white/10 rounded-2xl py-6 px-10 text-white outline-none focus:border-indigo-500 font-bold" required />
              <div className="flex gap-4 pt-6">
                <button type="button" onClick={() => setShowAddStudentModal(false)} className="flex-1 py-6 bg-white/5 text-slate-500 rounded-3xl font-black uppercase text-[10px] tracking-widest transition-all">Discard</button>
                <button type="submit" className="flex-1 py-6 bg-indigo-600 text-white rounded-3xl font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-all">Enroll Node</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Notification Center */}
      {showNotificationCenter && (
        <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-xl" onClick={() => setShowNotificationCenter(false)} />
          <div className="relative bg-[#080808] w-full sm:max-w-xl rounded-t-[56px] sm:rounded-[64px] p-12 shadow-2xl border-t sm:border border-white/10 max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-10">
              <h3 className="text-3xl font-black text-white tracking-tighter flex items-center gap-4"><BellRing className="text-indigo-500" /> Dispatch</h3>
              <button onClick={() => setShowNotificationCenter(false)} className="p-4 bg-white/5 rounded-3xl text-slate-500"><X className="w-7 h-7" /></button>
            </div>
            <div className="flex-grow overflow-y-auto space-y-6 custom-scrollbar pr-3 pb-8">
              {broadcast ? (
                <div className="bg-indigo-600/10 border border-indigo-500/20 p-10 rounded-[48px] space-y-5 shadow-2xl">
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

      {/* Add Lecture Template Modal */}
      {showAddLectureModal && (
        <div className="fixed inset-0 z-[350] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-300">
          <div className="absolute inset-0 bg-black/98 backdrop-blur-2xl" onClick={() => setShowAddLectureModal(null)} />
          <div className="relative bg-[#080808] w-full max-w-lg rounded-[64px] border border-white/10 p-12 shadow-2xl">
            <h3 className="text-3xl font-black text-white tracking-tighter mb-2 text-center">New Session</h3>
            <p className="text-center text-indigo-500 font-black uppercase tracking-widest text-[10px] mb-12">{showAddLectureModal} Protocol</p>
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
              <select name="sub" className="w-full bg-black/40 border border-white/10 rounded-3xl py-6 px-10 text-white outline-none focus:border-indigo-500 font-bold text-lg appearance-none">
                {subjectsList.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
              <input name="time" type="text" placeholder="e.g. 09:00 - 10:00" className="w-full bg-black/40 border border-white/10 rounded-3xl py-6 px-10 text-white outline-none focus:border-indigo-500 font-bold text-lg" required />
              <div className="flex gap-4 pt-6">
                <button type="button" onClick={() => setShowAddLectureModal(null)} className="flex-1 py-6 bg-white/5 text-slate-500 rounded-3xl font-black uppercase text-[10px] tracking-widest transition-all">Discard</button>
                <button type="submit" className="flex-1 py-6 bg-indigo-600 text-white rounded-3xl font-black uppercase text-[10px] tracking-widest shadow-2xl active:scale-95 transition-all">Deploy</button>
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
  <button onClick={onClick} className={`flex items-center gap-4 sm:gap-8 w-full p-6 sm:p-8 bg-black/40 border border-white/5 rounded-[32px] sm:rounded-[40px] transition-all ${color} font-black uppercase text-[10px] sm:text-xs text-slate-400 text-left group tracking-widest pointer-events-auto active:scale-[0.98]`}>
    {React.cloneElement(icon as React.ReactElement<any>, { className: 'w-8 h-8 sm:w-10 sm:h-10 shrink-0 transition-all group-hover:scale-110' })}
    {label}
  </button>
);

export default App;
