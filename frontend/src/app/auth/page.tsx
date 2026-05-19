'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { setToken, removeToken, isAuthenticated } from '@/lib/auth'
import { api } from '@/lib/api'
import { Key, ExternalLink, Loader2 } from 'lucide-react'

export default function AuthPage() {
  const router = useRouter()
  const [apiKey, setApiKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace('/subjects')
    }
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!apiKey.trim()) {
      setError('APIキーを入力してください')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Store token first so the API call includes it
      setToken(apiKey.trim())
      const result = await api.auth.setToken(apiKey.trim())
      if (result.ok) {
        router.push('/subjects')
      } else {
        setError('APIキーが無効です。正しいキーを入力してください。')
        removeToken()
      }
    } catch (err) {
      setError('ログインに失敗しました。APIキーを確認してください。')
      removeToken()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-md">
        {/* Logo / branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 mb-4">
            <Key className="w-7 h-7 text-indigo-400" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-100">
            Claude APIキーでログイン
          </h1>
          <p className="mt-2 text-sm text-slate-400 leading-relaxed">
            AnthropicコンソールまたはClaude Codeの認証で<br />
            発行されたAPIキーを入力してください
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="apiKey" className="block text-sm font-medium text-slate-300 mb-1.5">
              APIキー
            </label>
            <input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="sk-ant-api03-..."
              autoComplete="off"
              spellCheck={false}
              className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                         transition-colors text-sm font-mono"
            />
          </div>

          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-950 border border-red-800 text-red-300 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800
                       disabled:cursor-not-allowed text-white font-medium text-sm
                       transition-colors flex items-center justify-center gap-2 min-h-[48px]"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                確認中...
              </>
            ) : (
              'ログイン'
            )}
          </button>
        </form>

        {/* Help link */}
        <div className="mt-6 text-center">
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            コンソールでキーを発行
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  )
}
