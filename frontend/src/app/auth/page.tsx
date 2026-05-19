'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { isAuthenticated, setToken } from '@/lib/auth'
import { ExternalLink, Loader2, CheckCircle2, Copy, Check, Send } from 'lucide-react'

type Phase = 'idle' | 'starting' | 'pending' | 'polling' | 'done' | 'error'

export default function AuthPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('idle')
  const [loginUrl, setLoginUrl] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [authCode, setAuthCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [codeSending, setCodeSending] = useState(false)
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (isAuthenticated()) router.replace('/subjects')
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [router])

  async function handleStart() {
    setPhase('starting')
    setErrorMsg(null)
    setLoginUrl(null)
    setAuthCode('')
    setCodeSent(false)

    try {
      const res = await fetch('/api/auth/start', { method: 'POST' })
      const data = await res.json()

      if (data.status === 'complete') {
        await checkPoll()
        return
      }
      if (data.status === 'error' || !data.url) {
        setPhase('error')
        setErrorMsg('ログインURLの取得に失敗しました。サーバーログを確認してください。')
        return
      }

      setLoginUrl(data.url)
      setPhase('pending')
      startPolling()
    } catch {
      setPhase('error')
      setErrorMsg('サーバーへの接続に失敗しました。')
    }
  }

  function startPolling() {
    setPhase('polling')
    pollRef.current = setInterval(checkPoll, 3000)
  }

  async function checkPoll() {
    try {
      const res = await fetch('/api/auth/poll')
      const data = await res.json()
      if (data.authenticated) {
        if (pollRef.current) clearInterval(pollRef.current)
        setToken('claude-oauth')
        setPhase('done')
        setTimeout(() => router.push('/subjects'), 800)
      }
    } catch {
      // Network hiccup — keep polling
    }
  }

  async function handleCopy() {
    if (!loginUrl) return
    await navigator.clipboard.writeText(loginUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleSubmitCode() {
    if (!authCode.trim()) return
    setCodeSending(true)
    try {
      await fetch('/api/auth/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: authCode.trim() }),
      })
      setCodeSent(true)
      if (pollRef.current === null) startPolling()
    } catch {
      // ignore
    } finally {
      setCodeSending(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 mb-4">
            <svg viewBox="0 0 24 24" className="w-7 h-7 text-orange-400" fill="currentColor">
              <path d="M17.304 12.235c.045-.111.09-.222.09-.334 0-.356-.178-.69-.445-.912L9.915 5.234a1.14 1.14 0 0 0-.757-.267c-.267 0-.512.089-.713.267L2.41 10.79c-.267.222-.4.556-.4.912 0 .111.022.222.067.334l2.98 7.604c.134.334.49.556.847.556h8.41c.356 0 .69-.222.847-.556l2.143-2.937.556-2.937-.556-1.531zm-5.48 5.073H7.373l-2.053-5.229 3.958-3.425 3.958 3.425-1.412 5.229z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-slate-100">Claudeでログイン</h1>
          <p className="mt-2 text-sm text-slate-400 leading-relaxed">
            Claude アカウントでログインして学習を開始します
          </p>
        </div>

        {/* Idle state */}
        {phase === 'idle' && (
          <button
            onClick={handleStart}
            className="w-full py-3.5 px-4 rounded-xl bg-orange-500 hover:bg-orange-400
                       text-white font-semibold text-sm transition-colors min-h-[52px]
                       flex items-center justify-center gap-2"
          >
            Claudeでログイン
          </button>
        )}

        {/* Starting */}
        {phase === 'starting' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="w-7 h-7 text-orange-400 animate-spin" />
            <p className="text-sm text-slate-400">ログインURLを取得中...</p>
          </div>
        )}

        {/* Pending / Polling — show URL + code input */}
        {(phase === 'pending' || phase === 'polling') && loginUrl && (
          <div className="space-y-4">
            {/* URL card */}
            <div className="px-4 py-4 rounded-xl bg-slate-800 border border-slate-700">
              <p className="text-sm font-medium text-slate-200 mb-3">
                ① 以下の URL をブラウザで開いて、Claudeアカウントでログインしてください。
              </p>
              <div className="flex items-center gap-2 mb-3">
                <a
                  href={loginUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-xs text-indigo-400 hover:text-indigo-300 break-all
                             underline underline-offset-2 transition-colors"
                >
                  {loginUrl}
                </a>
                <button
                  onClick={handleCopy}
                  className="flex-shrink-0 p-2 rounded-lg bg-slate-700 hover:bg-slate-600
                             text-slate-300 transition-colors"
                  title="URLをコピー"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <a
                href={loginUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg
                           bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium
                           transition-colors min-h-[44px]"
              >
                <ExternalLink className="w-4 h-4" />
                ブラウザで開く
              </a>
            </div>

            {/* Auth code input */}
            <div className="px-4 py-4 rounded-xl bg-slate-800 border border-slate-700 space-y-3">
              <p className="text-sm font-medium text-slate-200">
                ② ブラウザに表示された認証コードを貼り付けてください。
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={authCode}
                  onChange={e => setAuthCode(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmitCode()}
                  placeholder="認証コードを貼り付け..."
                  disabled={codeSent}
                  className="flex-1 px-3 py-2 rounded-lg bg-slate-700 border border-slate-600
                             text-slate-100 text-sm placeholder-slate-500
                             focus:outline-none focus:border-indigo-500
                             disabled:opacity-50"
                />
                <button
                  onClick={handleSubmitCode}
                  disabled={!authCode.trim() || codeSent || codeSending}
                  className="flex-shrink-0 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500
                             text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {codeSending
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : codeSent
                      ? <Check className="w-4 h-4 text-emerald-400" />
                      : <Send className="w-4 h-4" />}
                </button>
              </div>
              {codeSent && (
                <p className="text-xs text-emerald-400">送信しました。認証完了を待っています...</p>
              )}
            </div>

            {/* Polling indicator */}
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-slate-800/60 border border-slate-700">
              <Loader2 className="w-4 h-4 text-orange-400 animate-spin flex-shrink-0" />
              <p className="text-xs text-slate-400">
                認証完了を確認中... 自動でログインされます。
              </p>
            </div>

            {phase === 'pending' && (
              <button
                onClick={startPolling}
                className="w-full py-2.5 rounded-xl border border-slate-700 hover:border-slate-600
                           text-slate-300 text-sm transition-colors"
              >
                認証しました（確認する）
              </button>
            )}
          </div>
        )}

        {/* Done */}
        {phase === 'done' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <CheckCircle2 className="w-10 h-10 text-emerald-400" />
            <p className="text-sm text-slate-200 font-medium">ログイン成功！</p>
            <p className="text-xs text-slate-400">教科一覧へ移動します...</p>
          </div>
        )}

        {/* Error */}
        {phase === 'error' && (
          <div className="space-y-4">
            <div className="px-4 py-3 rounded-xl bg-red-950 border border-red-800 text-red-300 text-sm">
              {errorMsg}
            </div>
            <button
              onClick={handleStart}
              className="w-full py-3 rounded-xl border border-slate-700 hover:border-slate-600
                         text-slate-300 text-sm transition-colors"
            >
              もう一度試す
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
