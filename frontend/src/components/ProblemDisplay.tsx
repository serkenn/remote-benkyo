'use client'

import type { Problem } from '@/lib/api'

interface ProblemDisplayProps {
  problem: Problem
}

export default function ProblemDisplay({ problem }: ProblemDisplayProps) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 h-full overflow-y-auto">
      <h2 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-2">
        問題
      </h2>
      <h3 className="text-base font-semibold text-slate-100 mb-3">
        {problem.name}
      </h3>
      <div className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
        {problem.statement}
      </div>
    </div>
  )
}
