import { getToken } from './auth'

export type Subject = {
  id: string
  name: string
  created_at: string
  benkyo_project_id: string | null
  initialized: boolean
  problem_count: number
  concept_count: number
}

export type Problem = {
  id: string
  name: string
  statement: string
}

export type FileInfo = {
  id: string
  filename: string
  uploaded_at: string
  size_bytes: number
}

export type AnswerResult = {
  feedback: string
  score: 'correct' | 'partial' | 'incorrect'
  next_problem?: Problem
}

export type InitResult = {
  ok: boolean
  concepts: number
  problems: number
}

export type InitStatus = {
  status: 'not_started' | 'running' | 'done' | 'error'
  concepts?: number
  problems?: number
  error?: string
  auth_expired?: boolean
  logs?: string[]
}

function authHeaders(): HeadersInit {
  const token = getToken()
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.headers || {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error')
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  auth: {
    async status(): Promise<{ authenticated: boolean }> {
      return request('/api/auth/status')
    },
    async startLogin(): Promise<{ status: string; url: string | null }> {
      return request('/api/auth/start', { method: 'POST' })
    },
    async pollLogin(): Promise<{ authenticated: boolean; status?: string; error?: string }> {
      return request('/api/auth/poll')
    },
    async submitCode(code: string): Promise<{ ok: boolean; error?: string }> {
      return request('/api/auth/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
    },
    async removeToken(): Promise<{ ok: boolean }> {
      return request('/api/auth/token', { method: 'DELETE' })
    },
  },

  subjects: {
    async list(): Promise<Subject[]> {
      return request('/api/subjects')
    },
    async create(name: string): Promise<Subject> {
      return request('/api/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
    },
    async get(id: string): Promise<Subject> {
      return request(`/api/subjects/${id}`)
    },
    async delete(id: string): Promise<{ ok: boolean }> {
      return request(`/api/subjects/${id}`, { method: 'DELETE' })
    },
  },

  files: {
    async list(subjectId: string): Promise<FileInfo[]> {
      return request(`/api/subjects/${subjectId}/files`)
    },
    async upload(subjectId: string, file: File): Promise<{ filename: string; file_id: string }> {
      const formData = new FormData()
      formData.append('file', file)
      return request(`/api/subjects/${subjectId}/files`, {
        method: 'POST',
        body: formData,
      })
    },
    async delete(subjectId: string, fileId: string): Promise<{ ok: boolean }> {
      return request(`/api/subjects/${subjectId}/files/${fileId}`, { method: 'DELETE' })
    },
  },

  study: {
    async init(subjectId: string, instructions?: string): Promise<{ status: string }> {
      return request(`/api/subjects/${subjectId}/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructions }),
      })
    },
    async initStatus(subjectId: string): Promise<InitStatus> {
      return request(`/api/subjects/${subjectId}/init/status`)
    },
    async graph(subjectId: string): Promise<{ mermaid: string }> {
      return request(`/api/subjects/${subjectId}/graph`)
    },
    async getProblem(subjectId: string): Promise<Problem | null> {
      return request(`/api/subjects/${subjectId}/problem`)
    },
    async submitAnswer(
      subjectId: string,
      problemId: string,
      canvasPng: Blob
    ): Promise<AnswerResult> {
      const formData = new FormData()
      formData.append('canvas_png', canvasPng, 'answer.png')
      formData.append('problem_id', problemId)
      return request(`/api/subjects/${subjectId}/answer`, {
        method: 'POST',
        body: formData,
      })
    },
    async chat(
      subjectId: string,
      message: string,
      problemId?: string
    ): Promise<{ response: string }> {
      return request(`/api/subjects/${subjectId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, problem_id: problemId }),
      })
    },
  },
}
