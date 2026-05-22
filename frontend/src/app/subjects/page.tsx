'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, LogOut, BookMarked, X, Loader2 } from 'lucide-react'
import { isAuthenticated, removeToken } from '@/lib/auth'
import { api, type Subject } from '@/lib/api'
import SubjectCard from '@/components/SubjectCard'

export default function SubjectsPage() {
  const router = useRouter()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newSubjectName, setNewSubjectName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const loadSubjects = useCallback(async () => {
    try {
      const data = await api.subjects.list()
      setSubjects(data)
    } catch (err) {
      console.error('Failed to load subjects:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/auth')
      return
    }
    loadSubjects()
  }, [router, loadSubjects])

  async function handleLogout() {
    try {
      await api.auth.removeToken()
    } catch {}
    removeToken()
    router.push('/auth')
  }

  async function handleCreateSubject(e: React.FormEvent) {
    e.preventDefault()
    if (!newSubjectName.trim()) {
      setCreateError('教科名を入力してください')
      return
    }
    setCreating(true)
    setCreateError(null)
    try {
      const subject = await api.subjects.create(newSubjectName.trim())
      setSubjects(prev => [subject, ...prev])
      setNewSubjectName('')
      setShowAddModal(false)
    } catch (err) {
      setCreateError('作成に失敗しました。もう一度お試しください。')
    } finally {
      setCreating(false)
    }
  }

  async function handleDeleteSubject(id: string) {
    try {
      await api.subjects.delete(id)
      setSubjects(prev => prev.filter(s => s.id !== id))
    } catch (err) {
      console.error('Failed to delete subject:', err)
    }
  }

  function handleModalClose() {
    setShowAddModal(false)
    setNewSubjectName('')
    setCreateError(null)
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BookMarked className="w-5 h-5 text-indigo-400" />
            <h1 className="text-lg font-semibold text-slate-100">教科一覧</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500
                         text-white text-sm font-medium transition-colors min-h-[40px]"
            >
              <Plus className="w-4 h-4" />
              教科を追加
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-slate-400 hover:text-slate-200
                         hover:bg-slate-800 text-sm transition-colors min-h-[40px]"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">ログアウト</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-slate-500 animate-spin" />
          </div>
        ) : subjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-4">
              <BookMarked className="w-8 h-8 text-slate-500" />
            </div>
            <p className="text-slate-300 font-medium mb-1">まだ教科がありません</p>
            <p className="text-slate-500 text-sm mb-6">教科を追加して学習を始めましょう</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500
                         text-white text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              教科を追加
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {subjects.map(subject => (
              <SubjectCard
                key={subject.id}
                subject={subject}
                onDelete={handleDeleteSubject}
              />
            ))}
          </div>
        )}
      </main>

      {/* Add Subject Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleModalClose}
          />

          {/* Modal */}
          <div className="relative w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-slate-100">教科を追加</h2>
              <button
                onClick={handleModalClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubject} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  教科名
                </label>
                <input
                  type="text"
                  value={newSubjectName}
                  onChange={e => setNewSubjectName(e.target.value)}
                  placeholder="例: 数学、物理、英語..."
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl bg-slate-700 border border-slate-600 text-slate-100
                             placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500
                             focus:border-transparent transition-colors text-sm"
                />
              </div>

              {createError && (
                <div className="px-3 py-2.5 rounded-xl bg-red-950 border border-red-800 text-red-300 text-sm">
                  {createError}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleModalClose}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-600 text-slate-300
                             hover:bg-slate-700 text-sm font-medium transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500
                             disabled:bg-indigo-800 disabled:cursor-not-allowed text-white text-sm
                             font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {creating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      作成中...
                    </>
                  ) : (
                    '追加する'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
