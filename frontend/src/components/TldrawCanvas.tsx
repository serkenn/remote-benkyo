'use client'

import { useCallback } from 'react'
import { Tldraw, type Editor } from '@tldraw/tldraw'
import '@tldraw/tldraw/tldraw.css'

interface TldrawCanvasProps {
  onExport: (blob: Blob) => void
  onEditorReady: (editor: Editor) => void
}

export default function TldrawCanvas({ onExport, onEditorReady }: TldrawCanvasProps) {
  const handleMount = useCallback(
    (editor: Editor) => {
      // Set draw tool as default
      editor.setCurrentTool('draw')
      onEditorReady(editor)
    },
    [onEditorReady]
  )

  return (
    <div className="w-full h-full" style={{ touchAction: 'none' }}>
      <Tldraw
        onMount={handleMount}
        hideUi
        inferDarkMode
      />
    </div>
  )
}
