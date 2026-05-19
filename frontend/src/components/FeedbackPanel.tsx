'use client'

import { CheckCircle2, AlertCircle, XCircle, ChevronRight } from 'lucide-react'

interface FeedbackPanelProps {
  score: 'correct' | 'partial' | 'incorrect'
  feedback: string
  onNext: () => void
}

const scoreConfig = {
  correct: {
    icon: CheckCircle2,
    label: '正解',
    bgClass: 'bg-emerald-950 border-emerald-800',
    iconClass: 'text-emerald-400',
    textClass: 'text-emerald-400',
  },
  partial: {
    icon: AlertCircle,
    label: '部分正解',
    bgClass: 'bg-amber-950 border-amber-800',
    iconClass: 'text-amber-400',
    textClass: 'text-amber-400',
  },
  incorrect: {
    icon: XCircle,
    label: '不正解',
    bgClass: 'bg-red-950 border-red-800',
    iconClass: 'text-red-400',
    textClass: 'text-red-400',
  },
}

export default function FeedbackPanel({ score, feedback, onNext }: FeedbackPanelProps) {
  const config = scoreConfig[score]
  const Icon = config.icon

  return (
    <div className={`border rounded-xl p-4 ${config.bgClass}`}>
      {/* Score badge */}
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-5 h-5 ${config.iconClass}`} />
        <span className={`font-semibold text-sm ${config.textClass}`}>
          {config.label}
        </span>
      </div>

      {/* Feedback text */}
      <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap mb-4">
        {feedback}
      </p>

      {/* Next button */}
      <button
        onClick={onNext}
        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500
                   text-white text-sm font-medium transition-colors min-h-[44px]"
      >
        次の問題へ
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}
