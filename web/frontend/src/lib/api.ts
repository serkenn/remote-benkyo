import type { Event, ExamDate, Project, ScheduleItem, TunnelStatus } from "./types";

const BASE = "/api";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${res.status}: ${err}`);
  }
  return res.json() as Promise<T>;
}

// Projects
export const fetchProjects = () => req<Project[]>("/projects");
export const fetchProject = (id: string) => req<Project>(`/projects/${id}`);
export const createProject = (body: { name: string; description?: string; color?: string }) =>
  req<Project>("/projects", { method: "POST", body: JSON.stringify(body) });
export const updateProject = (
  id: string,
  body: { name?: string; description?: string; color?: string }
) => req<Project>(`/projects/${id}`, { method: "PUT", body: JSON.stringify(body) });
export const deleteProject = (id: string) =>
  req<{ deleted_id: string }>(`/projects/${id}`, { method: "DELETE" });

// Schedule
export const fetchSchedule = (projectId: string) =>
  req<ScheduleItem[]>(`/projects/${projectId}/schedule`);
export const createScheduleItem = (
  projectId: string,
  body: { title: string; start_date: string; end_date: string; progress?: number; color?: string }
) =>
  req<ScheduleItem>(`/projects/${projectId}/schedule`, {
    method: "POST",
    body: JSON.stringify(body),
  });
export const updateScheduleItem = (
  projectId: string,
  itemId: string,
  body: Partial<ScheduleItem>
) =>
  req<ScheduleItem>(`/projects/${projectId}/schedule/${itemId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
export const deleteScheduleItem = (projectId: string, itemId: string) =>
  req<{ deleted_id: string }>(`/projects/${projectId}/schedule/${itemId}`, { method: "DELETE" });

// Exams
export const fetchExams = (projectId: string) =>
  req<ExamDate[]>(`/projects/${projectId}/exams`);
export const createExam = (projectId: string, body: { name: string; date: string }) =>
  req<ExamDate>(`/projects/${projectId}/exams`, {
    method: "POST",
    body: JSON.stringify(body),
  });
export const deleteExam = (projectId: string, examId: string) =>
  req<{ deleted_id: string }>(`/projects/${projectId}/exams/${examId}`, { method: "DELETE" });

// Events
export const fetchEvents = (params?: {
  project_id?: string;
  kind?: string;
  limit?: number;
}) => {
  const qs = new URLSearchParams();
  if (params?.project_id) qs.set("project_id", params.project_id);
  if (params?.kind) qs.set("kind", params.kind);
  if (params?.limit) qs.set("limit", String(params.limit));
  return req<Event[]>(`/events?${qs}`);
};

// Tunnel
export const fetchTunnelStatus = () => req<TunnelStatus>("/tunnel/status");
export const setTunnelToken = (token: string) =>
  req<{ ok: boolean; warning?: string }>("/tunnel/token", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
export const deleteTunnelToken = () =>
  req<{ ok: boolean; warning?: string }>("/tunnel/token", { method: "DELETE" });
