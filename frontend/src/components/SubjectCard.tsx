'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, BookOpen, Network, CheckCircle2, Clock } from 'lucide-react'
import type { Subject } from '@/lib/api'

interface SubjectCardProps {
  subject: Subject
  onDelete: (id: string) => void
}

export default function SubjectCard({ subject, onDelete }: SubjectCardProps) {
  const router = useRouter()
  const [confirmDelete, setConfirmDelete] = useState(false)

  function handleCardClick(e: React.MouseEvent) {
    // Don't navigate if clicking delete area
    if ((e.target as HTMLElement).closest('[data-delete-zone]')) return
    router.push(`/subjects/${subject.id}`)
  }

  function handleDeleteClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (confirmDelete) {
      onDelete(subject.id)
    } else {
      setConfirmDelete(true)
    }
  }

  function handleDeleteBlur() {
    setTimeout(() => setConfirmDelete(false), 300)
  }

  const createdDate = new Date(subject.created_at).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div
      onClick={handleCardClick}
      className="group relative bg-slate-800 border border-slate-700 rounded-2xl p-5
                 hover:border-slate-600 hover:bg-slate-750 transition-all cursor-pointer
                 active:scale-[0.98]"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-lg font-semibold text-slate-100 leading-tight pr-2">
          {subject.name}
        </h3>

        {/* Delete button */}
        <div data-delete-zone className="flex-shrink-0">
          <button
            onClick={handleDeleteClick}
            onBlur={handleDeleteBlur}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium
                        transition-all min-h-[32px]
                        ${confirmDelete
                          ? 'bg-red-600 text-white'
                          : 'text-slate-500 hover:text-red-400 hover:bg-slate-700 opacity-0 group-hover:opacity-100'
                        }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            {confirmDelete ? '確認' : '削除'}
          </button>
        </div>
      </div>

      {/* Status badge */}
      <div className="mb-4">
        {subject.initialized ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs
                           bg-emerald-950 text-emerald-400 border border-emerald-900">
            <CheckCircle2 className="w-3 h-3" />
            初期化済み
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs
                           bg-slate-700 text-slate-400 border border-slate-600">
            <Clock className="w-3 h-3" />
            未初期化
          </span>
        )}
      </div>

      {/* Stats */}
      {subject.initialized && (
        <div className="flex items-center gap-4 text-sm text-slate-400">
          <div className="flex items-center gap-1.5">
            <Network className="w-4 h-4 text-indigo-400" />
            <span>{subject.concept_count} 概念</span>
          </div>
          <div className="flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 text-violet-400" />
            <span>{subject.problem_count} 問題</span>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 pt-3 border-t border-slate-700">
        <p className="text-xs text-slate-500">{createdDate}</p>
      </div>
    </div>
  )
}
