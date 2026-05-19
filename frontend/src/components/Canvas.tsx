'use client'

import dynamic from 'next/dynamic'
import type { Editor } from '@tldraw/tldraw'

interface CanvasProps {
  onExport: (blob: Blob) => void
  onEditorReady: (editor: Editor) => void
}

const TldrawCanvas = dynamic(
  () => import('./TldrawCanvas'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-white">
        <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
      </div>
    ),
  }
)

export default function Canvas({ onExport, onEditorReady }: CanvasProps) {
  return (
    <div className="w-full h-full canvas-area" style={{ touchAction: 'none' }}>
      <TldrawCanvas onExport={onExport} onEditorReady={onEditorReady} />
    </div>
  )
}
