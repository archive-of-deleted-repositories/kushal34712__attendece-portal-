
import { Lecture, Subject, DayOfWeek } from './types';

export const DEFAULT_PASSWORD = 'NMIMS_STUDENT';

// Authorized SAP IDs (specified by admin)
export const AUTHORIZED_STUDENTS = [
  { sapId: '17001250020', name: 'Kushal Agrawal' },
  { sapId: '70012345679', name: 'Student B' },
  { sapId: '70012345680', name: 'Student C' },
  { sapId: '70012345681', name: 'Student D' },
  { sapId: '12345678901', name: 'Demo Student' },
  { sapId: '0000', name: 'System Admin' }
];

export const ADMIN_SAP_ID = '0000';

export const SUBJECTS: Subject[] = [
  { name: 'Cost Accounting', faculty: 'CA Pratik Tholiya', credits: 3 },
  { name: 'Principles of Marketing', faculty: 'Prof. Rajendra Agrawal', credits: 3 },
  { name: 'Microeconomics', faculty: 'Ms. Paridhi Ajmera', credits: 2 },
  { name: 'Quantitative Techniques – II', faculty: 'Dr. Sunil Patil', credits: 4 },
  { name: 'Advanced Excel', faculty: 'Ms. Alka Ghundiyal', credits: 2 },
  { name: 'Indian Language - Hindi', faculty: 'Dr. Manju Sindhani', credits: 2 },
  { name: 'Indian Management Thoughts', faculty: 'Prof. Rajendra Agrawal', credits: 2 },
  { name: 'Personal Finance', faculty: 'CA Pooja Sadane', credits: 2 },
  { name: 'Active Living', faculty: 'Mr. Kushagra Wadhwa', credits: 2 },
].map(sub => ({
  ...sub,
  // 4 credit = 60, 3 credit = 45, 2 credit = 30
  targetLectures: sub.credits === 4 ? 60 : sub.credits === 3 ? 45 : sub.credits === 2 ? 30 : 0
})) as (Subject & { targetLectures: number })[];

export const FULL_SCHEDULE: Lecture[] = [
  // Monday
  { id: 'mon-1', subject: 'Principles of Marketing', time: '09:00 - 10:00', faculty: 'Prof. Rajendra Agrawal', day: 'Monday' },
  { id: 'mon-2', subject: 'Microeconomics', time: '10:05 - 11:05', faculty: 'Ms. Paridhi Ajmera', day: 'Monday' },
  { id: 'mon-3', subject: 'Active Living', time: '11:15 - 12:15', faculty: 'Mr. Kushagra Wadhwa', day: 'Monday' },
  { id: 'mon-4', subject: 'Indian Language - Hindi', time: '01:00 - 02:00', faculty: 'Dr. Manju Sindhani', day: 'Monday' },
  
  // Tuesday
  { id: 'tue-1', subject: 'Advanced Excel', time: '09:00 - 10:00', faculty: 'Ms. Alka Ghundiyal', day: 'Tuesday' },
  { id: 'tue-2', subject: 'Quantitative Techniques – II', time: '10:05 - 11:05', faculty: 'Dr. Sunil Patil', day: 'Tuesday' },
  { id: 'tue-3', subject: 'Quantitative Techniques – II', time: '11:15 - 12:15', faculty: 'Dr. Sunil Patil', day: 'Tuesday' },
  { id: 'tue-4', subject: 'Indian Language - Hindi', time: '01:00 - 02:00', faculty: 'Dr. Manju Sindhani', day: 'Tuesday' },

  // Wednesday
  { id: 'wed-1', subject: 'Active Living', time: '09:00 - 10:00', faculty: 'Mr. Kushagra Wadhwa', day: 'Wednesday' },
  { id: 'wed-2', subject: 'Microeconomics', time: '10:05 - 11:05', faculty: 'Ms. Paridhi Ajmera', day: 'Wednesday' },
  { id: 'wed-3', subject: 'Principles of Marketing', time: '11:15 - 12:15', faculty: 'Prof. Rajendra Agrawal', day: 'Wednesday' },
  { id: 'wed-4', subject: 'Personal Finance', time: '01:00 - 02:00', faculty: 'CA Pooja Sadane', day: 'Wednesday' },

  // Thursday
  { id: 'thu-1', subject: 'Advanced Excel', time: '09:00 - 10:00', faculty: 'Ms. Alka Ghundiyal', day: 'Thursday' },
  { id: 'thu-2', subject: 'Cost Accounting', time: '10:05 - 11:05', faculty: 'CA Pratik Tholiya', day: 'Thursday' },
  { id: 'thu-3', subject: 'Principles of Marketing', time: '11:15 - 12:15', faculty: 'Prof. Rajendra Agrawal', day: 'Thursday' },
  { id: 'thu-4', subject: 'Indian Management Thoughts', time: '01:00 - 02:00', faculty: 'Prof. Rajendra Agrawal', day: 'Thursday' },

  // Friday
  { id: 'fri-1', subject: 'Personal Finance', time: '09:00 - 10:00', faculty: 'CA Pooja Sadane', day: 'Friday' },
  { id: 'fri-2', subject: 'Quantitative Techniques – II', time: '10:05 - 11:05', faculty: 'Dr. Sunil Patil', day: 'Friday' },
  { id: 'fri-3', subject: 'Indian Management Thoughts', time: '11:15 - 12:15', faculty: 'Prof. Rajendra Agrawal', day: 'Friday' },
  { id: 'fri-4', subject: 'Active Living', time: '01:00 - 02:00', faculty: 'Mr. Kushagra Wadhwa', day: 'Friday' },

  // Saturday
  { id: 'sat-2', subject: 'Cost Accounting', time: '10:05 - 11:05', faculty: 'CA Pratik Tholiya', day: 'Saturday' },
  { id: 'sat-3', subject: 'Cost Accounting', time: '11:15 - 12:15', faculty: 'CA Pratik Tholiya', day: 'Saturday' },
  { id: 'sat-4', subject: 'Quantitative Techniques – II', time: '01:00 - 02:00', faculty: 'Dr. Sunil Patil', day: 'Saturday' },
];

export const DAYS: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const COLORS = {
  'Principles of Marketing': 'bg-blue-100 border-blue-200 text-blue-700',
  'Microeconomics': 'bg-purple-100 border-purple-200 text-purple-700',
  'Active Living': 'bg-yellow-100 border-yellow-200 text-yellow-700',
  'Indian Language - Hindi': 'bg-orange-100 border-orange-200 text-orange-700',
  'Advanced Excel': 'bg-pink-100 border-pink-200 text-pink-700',
  'Quantitative Techniques – II': 'bg-green-100 border-green-200 text-green-700',
  'Cost Accounting': 'bg-cyan-100 border-cyan-200 text-cyan-700',
  'Indian Management Thoughts': 'bg-teal-100 border-teal-200 text-teal-700',
  'Personal Finance': 'bg-rose-100 border-rose-200 text-rose-700',
};
