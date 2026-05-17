export interface ExamDate {
  id: string;
  project_id: string;
  name: string;
  date: string;
  created_at: string;
}

export interface ScheduleItem {
  id: string;
  project_id: string;
  title: string;
  start_date: string;
  end_date: string;
  progress: number;
  color: string | null;
  created_at: string;
}

export interface Concept {
  id: string;
  name: string;
  content: string;
  treatment?: "blackbox" | "whitebox";
}

export interface Project {
  id: string;
  display_name: string;
  description: string;
  color: string;
  metadata: string;
  goals: string[];
  exams: ExamDate[];
  schedule?: ScheduleItem[];
  concepts?: Concept[];
  created_at: string;
}

export interface TunnelStatus {
  token_set: boolean;
  running: boolean;
  container_status: string;
}

export interface Event {
  id: string;
  ts: string;
  project_id: string | null;
  kind: string;
  payload: Record<string, unknown>;
  notes: string;
}
