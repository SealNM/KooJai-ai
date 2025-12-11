export enum SeverityLevel {
  NONE = 'NONE',
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export interface TeacherReport {
  student_id: string;
  severity_level: SeverityLevel;
  problem_category: string[];
  summary_for_teacher: string;
  recommendation_for_teacher: string;
  should_notify_teacher: boolean;
  // New features
  memory_for_next_session: string; // Context for the AI to remember
  healing_quote: string; // Encouraging message for the student
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface MoodEntry {
  id?: number;
  student_id: string;
  mood: 'happy' | 'neutral' | 'sad' | 'angry' | 'tired';
  timestamp: number;
}