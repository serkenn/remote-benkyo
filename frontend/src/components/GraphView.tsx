'use client'

import { useEffect, useRef, useState } from 'react'

interface GraphViewProps {
  mermaidString: string
}

export default function GraphView({ mermaidString }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [rendered, setRendered] = useState(false)

  useEffect(() => {
    if (!mermaidString || !containerRef.current) return

    let cancelled = false

    async function renderGraph() {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          themeVariables: {
            darkMode: true,
            background: '#1e293b',
            mainBkg: '#1e293b',
            nodeBorder: '#475569',
            clusterBkg: '#0f172a',
            titleColor: '#f1f5f9',
            edgeLabelBackground: '#1e293b',
            lineColor: '#64748b',
          },
        })

        const id = `mermaid-${Date.now()}`
        const { svg } = await mermaid.render(id, mermaidString)

        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg
          setRendered(true)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Mermaid render error:', err)
          setError('グラフの描画に失敗しました')
        }
      }
    }

    renderGraph()

    return () => {
      cancelled = true
    }
  }, [mermaidString])

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-red-400 text-sm mb-2">{error}</p>
        <details className="text-xs text-slate-500 max-w-lg">
          <summary className="cursor-pointer mb-2">Mermaidソース</summary>
          <pre className="text-left bg-slate-800 rounded-lg p-3 overflow-auto">{mermaidString}</pre>
        </details>
      </div>
    )
  }

  return (
    <div className="w-full overflow-auto">
      {!rendered && mermaidString && (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-slate-600 border-t-slate-300 rounded-full animate-spin" />
        </div>
      )}
      <div
        ref={containerRef}
        className="min-w-full [&_svg]:max-w-full [&_svg]:h-auto"
      />
    </div>
  )
}
