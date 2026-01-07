
export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';

export interface Lecture {
  id: string;
  subject: string;
  time: string;
  faculty?: string;
  day: DayOfWeek;
}

export interface Subject {
  name: string;
  faculty: string;
  credits: number;
  targetLectures?: number;
}

export type AttendanceStatus = 'present' | 'absent' | 'cancelled' | 'holiday';

export interface AttendanceRecord {
  id: string;
  date: string; // ISO string (YYYY-MM-DD)
  lectureId: string;
  originalSubjectName: string;
  actualSubjectName: string; // Different if substituted
  status: AttendanceStatus;
}

export interface User {
  sapId: string;
  name: string;
}

export interface AppState {
  records: AttendanceRecord[];
  startDate: string;
}
