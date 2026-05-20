'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import {
  ArrowLeft, Send, Eraser, MessageSquare, X,
  Loader2, ChevronDown, ChevronUp, RefreshCw, Download
} from 'lucide-react'
import { isAuthenticated } from '@/lib/auth'
import { api, type Problem, type Subject } from '@/lib/api'
import type { Editor } from '@tldraw/tldraw'
import ProblemDisplay from '@/components/ProblemDisplay'
import FeedbackPanel from '@/components/FeedbackPanel'
import dynamic from 'next/dynamic'

const Canvas = dynamic(() => import('@/components/Canvas'), { ssr: false })

type FeedbackState = {
  score: 'correct' | 'partial' | 'incorrect'
  feedback: string
  nextProblem?: Problem
}

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export default function SessionPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [subject, setSubject] = useState<Subject | null>(null)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [loadingProblem, setLoadingProblem] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const [feedbackCollapsed, setFeedbackCollapsed] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [wsRef] = useState<{ current: WebSocket | null }>({ current: null })

  const editorRef = useRef<Editor | null>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/auth')
      return
    }
    loadSubjectAndProblem()
  }, [id])

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [chatMessages])

  async function loadSubjectAndProblem() {
    setLoadingProblem(true)
    try {
      const [subjectData, problemData] = await Promise.all([
        api.subjects.get(id),
        api.study.getProblem(id),
      ])
      setSubject(subjectData)
      setProblem(problemData)
    } catch (err) {
      console.error('Failed to load:', err)
    } finally {
      setLoadingProblem(false)
    }
  }

  async function handleSubmit() {
    if (!problem || !editorRef.current || submitting) return

    setSubmitting(true)
    setFeedback(null)

    try {
      const editor = editorRef.current
      const shapeIds = editor.getCurrentPageShapeIds()

      let pngBlob: Blob

      if (shapeIds.size === 0) {
        // Empty canvas — create a white 800x600 blob
        const canvas = document.createElement('canvas')
        canvas.width = 800
        canvas.height = 600
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, 800, 600)
        pngBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
        })
      } else {
        const { exportToBlob } = await import('@tldraw/tldraw')
        pngBlob = await exportToBlob({
          editor,
          ids: [...shapeIds],
          format: 'png',
          opts: { background: true },
        })
      }

      const result = await api.study.submitAnswer(id, problem.id, pngBlob)
      setFeedback({
        score: result.score,
        feedback: result.feedback,
        nextProblem: result.next_problem,
      })
      setFeedbackCollapsed(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('401')) {
        router.replace('/auth')
        return
      }
      console.error('Submit failed:', err)
    } finally {
      setSubmitting(false)
    }
  }

  function handleNextProblem() {
    if (feedback?.nextProblem) {
      setProblem(feedback.nextProblem)
    } else {
      // Fetch a new problem
      api.study.getProblem(id).then(p => setProblem(p))
    }
    setFeedback(null)
    setFeedbackCollapsed(false)
    // Clear canvas
    if (editorRef.current) {
      editorRef.current.selectAll()
      editorRef.current.deleteShapes(editorRef.current.getSelectedShapeIds())
    }
  }

  function handleChangeProblem() {
    setFeedback(null)
    api.study.getProblem(id).then(p => setProblem(p))
    // Clear canvas
    if (editorRef.current) {
      editorRef.current.selectAll()
      editorRef.current.deleteShapes(editorRef.current.getSelectedShapeIds())
    }
  }

  function handleClearCanvas() {
    if (editorRef.current) {
      editorRef.current.selectAll()
      editorRef.current.deleteShapes(editorRef.current.getSelectedShapeIds())
    }
  }

  async function handleExportPng() {
    if (!editorRef.current) return
    const editor = editorRef.current
    const shapeIds = editor.getCurrentPageShapeIds()

    let pngBlob: Blob
    if (shapeIds.size === 0) {
      const canvas = document.createElement('canvas')
      canvas.width = 2048
      canvas.height = 1536
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      pngBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
      })
    } else {
      const { exportToBlob } = await import('@tldraw/tldraw')
      pngBlob = await exportToBlob({
        editor,
        ids: [...shapeIds],
        format: 'png',
        opts: { background: true, scale: 2 },
      })
    }

    const url = URL.createObjectURL(pngBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${problem?.name ?? 'canvas'}.png`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleEditorReady(editor: Editor) {
    editorRef.current = editor
  }

  // Chat via WebSocket or fallback to POST
  function openChat() {
    setChatOpen(true)
    if (!wsRef.current || wsRef.current.readyState > 1) {
      try {
        const ws = new WebSocket(`ws://${window.location.host}/ws/${id}`)
        ws.onmessage = e => {
          setChatMessages(prev => {
            const last = prev[prev.length - 1]
            if (last?.role === 'assistant') {
              return [...prev.slice(0, -1), { role: 'assistant', content: last.content + e.data }]
            }
            return [...prev, { role: 'assistant', content: e.data }]
          })
          setChatLoading(false)
        }
        ws.onerror = () => {
          // WS failed — will use POST fallback
        }
        wsRef.current = ws
      } catch {}
    }
  }

  async function sendChatMessage() {
    if (!chatInput.trim() || chatLoading) return
    const message = chatInput.trim()
    setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: message }])
    setChatLoading(true)

    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ message, problem_id: problem?.id }))
      // Response comes via ws.onmessage
    } else {
      // Fallback to REST
      try {
        const result = await api.study.chat(id, message, problem?.id)
        setChatMessages(prev => [...prev, { role: 'assistant', content: result.response }])
      } catch (err) {
        const msg = err instanceof Error ? err.message : ''
        if (msg.includes('401')) {
          router.replace('/auth')
          return
        }
        setChatMessages(prev => [
          ...prev,
          { role: 'assistant', content: 'エラーが発生しました。もう一度お試しください。' },
        ])
      } finally {
        setChatLoading(false)
      }
    }
  }

  return (
    <div className="flex flex-col h-screen bg-slate-900 overflow-hidden">
      {/* Top bar */}
      <header className="flex-shrink-0 flex items-center justify-between px-4 py-3
                          border-b border-slate-800 bg-slate-900">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/subjects/${id}`)}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800
                       transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-medium text-slate-300 truncate max-w-[140px]">
            {subject?.name ?? '...'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleChangeProblem}
            disabled={loadingProblem}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-slate-400
                       hover:text-slate-200 hover:bg-slate-800 text-sm transition-colors
                       min-h-[44px] disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">問題を変える</span>
          </button>
          <button
            onClick={openChat}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-slate-400
                       hover:text-slate-200 hover:bg-slate-800 text-sm transition-colors
                       min-h-[44px]"
          >
            <MessageSquare className="w-4 h-4" />
            <span className="hidden sm:inline">AIに質問する</span>
          </button>
        </div>
      </header>

      {/* Problem area */}
      <div className="flex-shrink-0 px-4 pt-3 pb-2" style={{ maxHeight: '35vh' }}>
        {loadingProblem ? (
          <div className="flex items-center justify-center h-24 bg-slate-800 border border-slate-700 rounded-xl">
            <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
          </div>
        ) : problem ? (
          <div style={{ height: '100%', minHeight: '80px', maxHeight: '35vh' }}>
            <ProblemDisplay problem={problem} />
          </div>
        ) : (
          <div className="flex items-center justify-center h-24 bg-slate-800 border border-slate-700 rounded-xl">
            <p className="text-slate-500 text-sm">問題がありません</p>
          </div>
        )}
      </div>

      {/* Canvas area */}
      <div className="flex-1 px-4 py-2 min-h-0">
        <div className="w-full h-full rounded-xl overflow-hidden border border-slate-700">
          <Canvas onExport={() => {}} onEditorReady={handleEditorReady} />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-slate-800 bg-slate-900">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleClearCanvas}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800
                         hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors
                         min-h-[44px] border border-slate-700"
            >
              <Eraser className="w-4 h-4" />
              <span className="hidden sm:inline">消去</span>
            </button>
            <button
              onClick={handleExportPng}
              title="GoodNotesなどにインポートできるPNGを保存"
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800
                         hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors
                         min-h-[44px] border border-slate-700"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">PNG保存</span>
            </button>
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting || !problem}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500
                       disabled:bg-indigo-800 disabled:cursor-not-allowed text-white font-medium text-sm
                       transition-colors min-h-[44px] shadow-lg shadow-indigo-900/30"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                採点中...
              </>
            ) : (
              <>
                送信
                <Send className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Feedback panel */}
      {feedback && (
        <div className="flex-shrink-0 px-4 pb-4 border-t border-slate-800 pt-3 bg-slate-900">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              フィードバック
            </span>
            <button
              onClick={() => setFeedbackCollapsed(c => !c)}
              className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
            >
              {feedbackCollapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
          {!feedbackCollapsed && (
            <FeedbackPanel
              score={feedback.score}
              feedback={feedback.feedback}
              onNext={handleNextProblem}
            />
          )}
        </div>
      )}

      {/* Chat slide-up panel */}
      {chatOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setChatOpen(false)}
          />
          <div className="relative bg-slate-900 border-t border-slate-700 rounded-t-2xl
                          flex flex-col"
               style={{ maxHeight: '70vh', height: '70vh' }}>
            {/* Chat header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 flex-shrink-0">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-400" />
                <span className="text-sm font-semibold text-slate-200">AIに質問する</span>
              </div>
              <button
                onClick={() => setChatOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages */}
            <div
              ref={chatScrollRef}
              className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
            >
              {chatMessages.length === 0 && (
                <div className="text-center text-slate-500 text-sm py-8">
                  <p>問題について何でも質問してください</p>
                  {problem && (
                    <p className="mt-1 text-xs">現在の問題: {problem.name}</p>
                  )}
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed
                      ${msg.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-br-sm'
                        : 'bg-slate-800 text-slate-200 rounded-bl-sm border border-slate-700'
                      }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-slate-800 border border-slate-700 px-4 py-3 rounded-2xl rounded-bl-sm">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce [animation-delay:0ms]" />
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce [animation-delay:150ms]" />
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="flex-shrink-0 px-4 py-3 border-t border-slate-800">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage() } }}
                  placeholder="メッセージを入力..."
                  className="flex-1 px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-100
                             placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500
                             focus:border-transparent transition-colors"
                />
                <button
                  onClick={sendChatMessage}
                  disabled={!chatInput.trim() || chatLoading}
                  className="p-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700
                             disabled:cursor-not-allowed text-white transition-colors min-h-[48px] min-w-[48px]
                             flex items-center justify-center"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
