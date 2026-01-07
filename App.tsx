
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell
} from 'recharts';
import { 
  Calendar, CheckCircle, XCircle, Clock, BookOpen, BarChart2, 
  User as UserIcon, ChevronRight, AlertCircle, History, Layout, ChevronLeft,
  MinusCircle, RefreshCcw, X, Plus, Sparkles, Wand2, LogOut, Lock, Cloud, ShieldCheck, Database, FileText, ArrowLeft, Palmtree, Trash2, UserCog, Settings, UserPlus, Calculator, Bell, BellRing, Send, Megaphone, Ban, Umbrella, Upload, FileUp, Loader2, TrendingUp, Zap, Target, MoreHorizontal
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

  // AI-Powered PDF/Image Parsing with responseSchema
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;

    setIsParsingPDF(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        // Initialize Gemini API client
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        // Use gemini-3-pro-preview for complex data extraction tasks
        const response = await ai.models.generateContent({
          model: 'gemini-3-pro-preview',
          contents: [
            {
              parts: [
                { inlineData: { data: base64Data, mimeType: file.type } },
                { text: `Extract NMIMS student attendance records from this file. Find the table containing Subject Name, Status (Present/Absent), and Date. 
                         If date is not available, use the current year with today's month/day as placeholders.` }
              ]
            }
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  subject: { type: Type.STRING },
                  status: { type: Type.STRING, description: "Must be 'present' or 'absent'" },
                  date: { type: Type.STRING, description: "Format: YYYY-MM-DD" }
                },
                required: ["subject", "status", "date"]
              }
            }
          }
        });

        const extracted = JSON.parse(response.text || '[]');
        if (extracted && Array.isArray(extracted)) {
          const newBatch: AttendanceRecord[] = extracted.map(item => ({
            id: `imported-${Date.now()}-${Math.random()}`,
            date: item.date,
            lectureId: 'imported',
            originalSubjectName: item.subject,
            actualSubjectName: item.subject,
            status: item.status.toLowerCase() === 'present' ? 'present' : 'absent'
          }));

          setRecords(prev => {
            const updated = [...prev, ...newBatch];
            localStorage.setItem(`nmims_backend_db_${currentUser.sapId}`, JSON.stringify(updated));
            return updated;
          });
          alert(`Successfully imported ${newBatch.length} records.`);
        }
      };
    } catch (err) {
      console.error(err);
      alert('AI Extraction Error: Please ensure the document is clear and readable.');
    } finally {
      setIsParsingPDF(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
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
        strategy = "No history";
      }

      return { name: sub.name, present, total, percentage: total === 0 ? 0 : Math.round((present / total) * 100), strategy, strategyType };
    });

    const totalP = summary.reduce((a, s) => a + s.present, 0);
    const totalC = summary.reduce((a, s) => a + s.total, 0);
    const overall = totalC === 0 ? 0 : Math.round((totalP / totalC) * 100);
    return { summary, totalP, totalC, overall };
  };

  const stats = useMemo(() => calculateStats(records), [records, subjectsList]);

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

  // Auth Handler
  const handleLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const sapId = formData.get('sap') as string;
    const password = formData.get('pass') as string;

    const student = studentsList.find(s => s.sapId === sapId);
    if (student && password === DEFAULT_PASSWORD) {
      setCurrentUser(student);
      localStorage.setItem('nmims_session_user', JSON.stringify(student));
    } else {
      alert('Invalid Credentials');
    }
  };

  // UI Components
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-indigo-600 rounded-[30px] flex items-center justify-center text-white font-black text-3xl mx-auto mb-6 shadow-2xl">NM</div>
            <h1 className="text-3xl font-black text-white tracking-tighter">Attendence Portal</h1>
          </div>
          <form onSubmit={handleLogin} className="bg-slate-900/40 backdrop-blur-xl border border-white/5 p-8 rounded-[40px] shadow-2xl space-y-6">
            <input name="sap" type="text" placeholder="SAP ID" className="w-full bg-black/40 border border-white/10 rounded-xl py-4 px-6 text-white outline-none font-bold" required />
            <input name="pass" type="password" placeholder="Password" className="w-full bg-black/40 border border-white/10 rounded-xl py-4 px-6 text-white outline-none font-bold" required />
            <button type="submit" className="w-full py-4 bg-indigo-600 text-white font-black uppercase rounded-xl shadow-lg">Authenticate</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-slate-100 flex flex-col md:flex-row">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex flex-col w-72 lg:w-80 bg-[#080808] border-r border-white/5 p-10 sticky top-0 h-screen z-50">
        <div className="flex items-center gap-5 mb-16">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-xl">NM</div>
          <div>
            <h2 className="font-black text-white truncate text-sm">{currentUser.name}</h2>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">SAP: {currentUser.sapId}</p>
          </div>
        </div>
        <nav className="space-y-4 flex-grow">
          <NavItem icon={<Layout />} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <NavItem icon={<Calendar />} label="Schedule" active={activeTab === 'schedule'} onClick={() => setActiveTab('schedule')} />
          <NavItem icon={<Calculator />} label="Analytics" active={activeTab === 'subjects'} onClick={() => setActiveTab('subjects')} />
          <NavItem icon={<History />} label="Logs" active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
          {isAdmin && <NavItem icon={<ShieldCheck />} label="Admin" active={activeTab === 'admin'} onClick={() => setActiveTab('admin')} />}
        </nav>
        <button onClick={() => { localStorage.removeItem('nmims_session_user'); window.location.reload(); }} className="mt-auto flex items-center gap-4 px-6 py-4 text-rose-500 font-black text-xs uppercase hover:bg-rose-500/10 rounded-xl">
          <LogOut className="w-5 h-5" /> Logout
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-grow overflow-y-auto pb-32 md:pb-12">
        {/* Mobile Nav Header */}
        <div className="md:hidden flex items-center justify-between p-6 bg-[#080808]/90 backdrop-blur-3xl sticky top-0 z-[60] border-b border-white/5">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-xs">NM</div>
             <span className="font-black text-sm text-white uppercase tracking-tighter truncate max-w-[120px]">{currentUser.name}</span>
          </div>
          <button onClick={() => { localStorage.removeItem('nmims_session_user'); window.location.reload(); }} className="p-3 bg-rose-500/10 text-rose-500 rounded-xl">
            <LogOut className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 sm:p-12 space-y-12">
          {activeTab === 'dashboard' && (
            <div className="space-y-12 animate-in fade-in slide-in-from-bottom-6 duration-700">
              <header className="flex flex-col sm:flex-row justify-between items-center gap-8 bg-indigo-600 p-10 rounded-[48px] shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 blur-3xl rounded-full -mr-20 -mt-20" />
                <div className="relative z-10 text-center sm:text-left">
                  <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tighter">Current Status</h1>
                  <p className="text-indigo-100 font-bold mt-4">System integrity verified at {stats.overall}%</p>
                </div>
                <div className="relative z-10 w-48 h-48 bg-white/10 rounded-full flex flex-col items-center justify-center backdrop-blur-xl border border-white/20">
                  <span className="text-5xl font-black text-white">{stats.overall}%</span>
                  <span className="text-[10px] font-black uppercase text-indigo-100 tracking-widest mt-2">Aggregate</span>
                </div>
              </header>

              {/* Subject List Grid on Home Screen */}
              <section className="space-y-8">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-black text-white flex items-center gap-4"><BookOpen className="w-8 h-8 text-indigo-500" /> Module Nodes</h2>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500" /><span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Stable (75%+)</span></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {stats.summary.map(sub => (
                    <div key={sub.name} className="bg-slate-900/30 p-8 rounded-[40px] border border-white/5 hover:border-indigo-500/20 transition-all flex flex-col justify-between h-56 shadow-xl group">
                      <div>
                        <div className="flex justify-between items-start mb-4">
                          <h4 className="font-black text-white text-lg leading-tight truncate pr-4 group-hover:text-indigo-400">{sub.name}</h4>
                          <span className={`text-2xl font-black ${sub.percentage >= 75 ? 'text-emerald-400' : 'text-rose-400'}`}>{sub.percentage}%</span>
                        </div>
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Sessions: {sub.present} / {sub.total}</p>
                      </div>
                      <div className="space-y-4">
                        <div className="h-2 bg-black/40 rounded-full overflow-hidden">
                          <div className={`h-full transition-all duration-700 ${sub.percentage >= 75 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${Math.min(sub.percentage, 100)}%` }} />
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{sub.strategy}</span>
                          <TrendingUp className={`w-4 h-4 ${sub.percentage >= 75 ? 'text-emerald-500' : 'text-rose-500'}`} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activeTab === 'schedule' && (
            <div className="space-y-10 animate-in fade-in duration-500">
               <header className="flex items-center justify-between bg-slate-900/40 p-10 rounded-[48px] border border-white/5">
                 <button onClick={() => setSelectedDate(subDays(selectedDate, 1))} className="p-4 bg-black/40 rounded-2xl"><ChevronLeft className="w-6 h-6" /></button>
                 <div className="text-center">
                   <h2 className="text-3xl font-black text-white">{format(selectedDate, 'EEEE')}</h2>
                   <p className="text-[11px] text-slate-500 uppercase font-black mt-1 tracking-widest">{format(selectedDate, 'MMM do')}</p>
                 </div>
                 <button onClick={() => setSelectedDate(addDays(selectedDate, 1))} className="p-4 bg-black/40 rounded-2xl"><ChevronRight className="w-6 h-6" /></button>
               </header>
               <div className="grid gap-6">
                 {timetable.filter(l => l.day === format(selectedDate, 'EEEE')).map(lecture => {
                   const record = records.find(r => r.id === `${format(selectedDate, 'yyyy-MM-dd')}-${lecture.id}`);
                   return (
                     <div key={lecture.id} className="bg-slate-900/20 p-8 rounded-[40px] border border-white/5 flex flex-col sm:flex-row items-center justify-between gap-8 group">
                       <div className="flex items-center gap-8 w-full sm:w-auto">
                         <div className="w-20 h-20 bg-black/40 rounded-[32px] flex items-center justify-center border border-white/5"><Clock className="w-8 h-8 text-slate-700 group-hover:text-indigo-400" /></div>
                         <div className="min-w-0 flex-grow">
                           <h4 className="text-xl font-black text-white truncate">{record?.actualSubjectName || lecture.subject}</h4>
                           <div className="flex gap-6 mt-3 text-[10px] font-bold text-slate-600 uppercase tracking-widest">
                             <span>{lecture.time}</span>
                             <span>{lecture.faculty}</span>
                           </div>
                         </div>
                       </div>
                       <button 
                         onClick={() => setShowStatusModal({lectureId: lecture.id, subject: lecture.subject})}
                         className={`w-full sm:w-auto px-12 py-5 rounded-[32px] font-black text-[10px] uppercase border tracking-widest transition-all ${record?.status === 'present' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/10' : record?.status === 'absent' ? 'bg-rose-500/10 text-rose-400 border-rose-500/10' : 'bg-white/5 text-slate-500 border-white/5'}`}
                       >
                         {record?.status || 'Update Status'}
                       </button>
                     </div>
                   );
                 })}
               </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-10 animate-in fade-in duration-500">
               <header className="flex flex-col sm:flex-row justify-between items-center bg-slate-900/30 p-10 rounded-[48px] border border-white/5 gap-6">
                 <h2 className="text-4xl font-black text-white">Archives</h2>
                 <div className="flex gap-4">
                   <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*,.pdf" className="hidden" />
                   <button onClick={() => fileInputRef.current?.click()} disabled={isParsingPDF} className="px-10 py-5 bg-indigo-600 text-white rounded-3xl font-black text-[11px] uppercase tracking-widest flex items-center gap-4 shadow-xl active:scale-95 disabled:opacity-50 transition-all">
                     {isParsingPDF ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileUp className="w-5 h-5" />}
                     {isParsingPDF ? 'Syncing...' : 'Cloud Import'}
                   </button>
                 </div>
               </header>
               <div className="space-y-8">
                 {Object.entries(records.reduce((acc, curr) => {
                   if (!acc[curr.date]) acc[curr.date] = [];
                   acc[curr.date].push(curr);
                   return acc;
                 }, {} as Record<string, AttendanceRecord[]>)).sort((a,b) => b[0].localeCompare(a[0])).map(([date, dayRecords]: [string, AttendanceRecord[]]) => (
                   <div key={date} className="bg-slate-900/20 rounded-[40px] border border-white/5 overflow-hidden">
                     <div className="bg-black/40 px-10 py-5 border-b border-white/5"><h3 className="font-black text-xs text-slate-500 uppercase tracking-widest">{format(parseISO(date), 'EEEE, MMM do')}</h3></div>
                     <div className="divide-y divide-white/5">
                       {dayRecords.map(r => (
                         <div key={r.id} className="px-10 py-8 flex items-center justify-between hover:bg-black/20 group">
                           <div className="min-w-0 pr-6">
                             <p className="text-white font-black text-lg truncate leading-tight">{r.actualSubjectName}</p>
                             <p className="text-[10px] text-slate-600 font-bold uppercase mt-1">{r.status}</p>
                           </div>
                           <button onClick={() => setRecords(prev => prev.filter(x => x.id !== r.id))} className="p-4 bg-rose-500/10 text-rose-500 rounded-2xl opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="w-5 h-5" /></button>
                         </div>
                       ))}
                     </div>
                   </div>
                 ))}
               </div>
            </div>
          )}

          {activeTab === 'admin' && isAdmin && (
            <div className="space-y-12 animate-in fade-in duration-500">
               <header className="flex flex-col lg:flex-row justify-between items-center bg-indigo-600 p-12 rounded-[56px] gap-10">
                 <h2 className="text-5xl font-black text-white tracking-tighter">Root Control</h2>
                 <div className="flex bg-white/20 p-2 rounded-[32px] backdrop-blur-3xl overflow-x-auto no-scrollbar w-full lg:w-auto">
                   <button onClick={() => setAdminView('students')} className={`px-10 py-5 rounded-[24px] font-black uppercase text-[10px] tracking-widest transition-all ${adminView === 'students' ? 'bg-white text-indigo-600' : 'text-white'}`}>Students</button>
                   <button onClick={() => setAdminView('timetable')} className={`px-10 py-5 rounded-[24px] font-black uppercase text-[10px] tracking-widest transition-all ${adminView === 'timetable' ? 'bg-white text-indigo-600' : 'text-white'}`}>Rules</button>
                 </div>
               </header>

               {adminView === 'students' && (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                   {allStudentData.map(s => (
                     <div key={s.sapId} className="bg-slate-900/30 p-10 rounded-[48px] border border-white/5 flex flex-col gap-10 shadow-2xl">
                       <div className="flex justify-between items-start">
                         <div className="min-w-0 pr-6">
                           <h4 className="font-black text-white text-2xl truncate">{s.name}</h4>
                           <p className="text-[11px] text-slate-600 font-black uppercase mt-2 tracking-widest">SAP: {s.sapId}</p>
                         </div>
                         <div className={`text-4xl font-black tracking-tighter ${s.overall >= 75 ? 'text-emerald-400' : 'text-rose-400'}`}>{s.overall}%</div>
                       </div>
                       <button onClick={() => setSelectedAdminStudent(s.sapId)} className="w-full py-6 bg-indigo-600/10 text-indigo-400 rounded-[32px] font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-4 hover:bg-indigo-600 hover:text-white transition-all shadow-lg active:scale-95">
                         <Settings className="w-6 h-6" /> Analyze Node
                       </button>
                     </div>
                   ))}
                   <button onClick={() => setShowAddStudentModal(true)} className="bg-indigo-600/5 border-2 border-dashed border-indigo-500/20 p-10 rounded-[48px] flex flex-col items-center justify-center gap-6 group hover:bg-indigo-600/10 transition-all min-h-[250px]">
                     <UserPlus className="w-12 h-12 text-indigo-500 group-hover:scale-110 transition-all" />
                     <span className="text-2xl font-black uppercase text-indigo-400 tracking-widest">Enroll User</span>
                   </button>
                 </div>
               )}
            </div>
          )}
        </div>
      </main>

      {/* Persistent Mobile Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#080808]/90 backdrop-blur-3xl border-t border-white/5 flex items-center justify-around p-6 pb-12 z-[100]">
        <MobileNavItem icon={<Layout />} active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
        <MobileNavItem icon={<Calendar />} active={activeTab === 'schedule'} onClick={() => setActiveTab('schedule')} />
        <MobileNavItem icon={<Calculator />} active={activeTab === 'subjects'} onClick={() => setActiveTab('subjects')} />
        <MobileNavItem icon={<History />} active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
        {isAdmin && <MobileNavItem icon={<Database />} active={activeTab === 'admin'} onClick={() => setActiveTab('admin')} />}
      </nav>

      {/* Modals */}
      {showStatusModal && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-2xl" onClick={() => setShowStatusModal(null)} />
          <div className="relative bg-[#080808] w-full sm:max-w-xl rounded-t-[56px] sm:rounded-[64px] p-12 shadow-2xl border-t sm:border border-white/10 animate-in slide-in-from-bottom-full duration-500">
            <div className="flex justify-between items-start mb-14">
              <div className="min-w-0 pr-10">
                <h3 className="text-3xl font-black text-white tracking-tighter leading-tight">Record Logic</h3>
                <p className="text-slate-500 uppercase text-[10px] mt-2 font-bold tracking-widest truncate">{showStatusModal.subject}</p>
              </div>
              <button onClick={() => setShowStatusModal(null)} className="p-4 bg-white/5 rounded-2xl text-slate-500"><X className="w-8 h-8" /></button>
            </div>
            <div className="grid gap-4 mb-10">
              <StatusBtn icon={<CheckCircle className="text-emerald-500" />} label="Present" color="hover:bg-emerald-500/10" onClick={() => markAttendance(showStatusModal.lectureId, showStatusModal.subject, 'present')} />
              <StatusBtn icon={<XCircle className="text-rose-500" />} label="Absent" color="hover:bg-rose-500/10" onClick={() => markAttendance(showStatusModal.lectureId, showStatusModal.subject, 'absent')} />
              <div className="grid grid-cols-2 gap-4">
                <StatusBtn icon={<Ban className="text-slate-400" />} label="Cancel" color="hover:bg-white/5" onClick={() => markAttendance(showStatusModal.lectureId, showStatusModal.subject, 'cancelled')} />
                <StatusBtn icon={<Umbrella className="text-amber-500" />} label="Holiday" color="hover:bg-amber-500/5" onClick={() => markAttendance(showStatusModal.lectureId, showStatusModal.subject, 'holiday')} />
              </div>
              <StatusBtn icon={<RefreshCcw className="text-indigo-500" />} label="Substitution" color="hover:bg-indigo-500/10" onClick={() => setShowStatusSubModal({lectureId: showStatusModal.lectureId, originalSubject: showStatusModal.subject})} />
            </div>
          </div>
        </div>
      )}

      {selectedAdminStudent && selectedStudentDetails && (
        <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0">
          <div className="absolute inset-0 bg-black/98 backdrop-blur-3xl" onClick={() => setSelectedAdminStudent(null)} />
          <div className="relative bg-[#080808] w-full sm:max-w-2xl h-[90vh] rounded-t-[64px] sm:rounded-[72px] p-12 flex flex-col border-t sm:border border-white/10">
             <div className="flex justify-between items-start mb-12">
               <div>
                 <h3 className="text-4xl font-black text-white tracking-tighter">{selectedStudentDetails.name}</h3>
                 <p className="text-slate-500 font-bold uppercase text-[11px] mt-2 tracking-widest">Aggregate: {selectedStudentDetails.stats.overall}%</p>
               </div>
               <button onClick={() => setSelectedAdminStudent(null)} className="p-4 bg-white/5 rounded-2xl text-slate-500"><X className="w-8 h-8" /></button>
             </div>
             <div className="flex-grow overflow-y-auto space-y-6 custom-scrollbar pr-3">
               {selectedStudentDetails.stats.summary.map(sub => (
                 <div key={sub.name} className="bg-black/40 border border-white/5 p-10 rounded-[48px] flex justify-between items-center group">
                   <div className="min-w-0 pr-8">
                     <p className="font-black text-white text-xl truncate group-hover:text-indigo-400 transition-colors">{sub.name}</p>
                     <p className="text-[11px] text-slate-600 font-black uppercase mt-2">Sessions: {sub.present} / {sub.total}</p>
                   </div>
                   <h4 className={`text-4xl font-black ${sub.percentage >= 75 ? 'text-emerald-400' : 'text-rose-400'}`}>{sub.percentage}%</h4>
                 </div>
               ))}
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Atoms
const NavItem: React.FC<{ icon: React.ReactNode; label: string; active: boolean; onClick: () => void }> = ({ icon, label, active, onClick }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-6 px-10 py-6 rounded-[28px] transition-all font-black text-[12px] uppercase tracking-widest ${active ? 'bg-indigo-600 text-white shadow-2xl shadow-indigo-600/40' : 'text-slate-600 hover:bg-white/5 hover:text-slate-300'}`}>
    {React.cloneElement(icon as React.ReactElement<any>, { className: `w-6 h-6` })}
    {label}
  </button>
);

const MobileNavItem: React.FC<{ icon: React.ReactNode; active: boolean; onClick: () => void }> = ({ icon, active, onClick }) => (
  <button onClick={onClick} className={`flex items-center justify-center w-14 h-14 rounded-3xl transition-all ${active ? 'bg-indigo-600 text-white shadow-xl scale-110' : 'text-slate-600'}`}>
    {React.cloneElement(icon as React.ReactElement<any>, { className: `w-7 h-7` })}
  </button>
);

const StatusBtn: React.FC<{ icon: React.ReactNode; label: string; color: string; onClick: () => void }> = ({ icon, label, color, onClick }) => (
  <button onClick={onClick} className={`flex items-center gap-6 w-full p-8 bg-black/40 border border-white/5 rounded-[40px] transition-all ${color} font-black uppercase text-[11px] text-slate-400 text-left active:scale-[0.98]`}>
    {React.cloneElement(icon as React.ReactElement<any>, { className: 'w-10 h-10' })}
    {label}
  </button>
);

export default App;
