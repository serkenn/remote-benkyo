'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import {
  ArrowLeft, Upload, Trash2, FileText, Loader2,
  Play, Network, BookOpen, X, CheckCircle2, AlertCircle
} from 'lucide-react'
import { isAuthenticated } from '@/lib/auth'
import { api, type Subject, type FileInfo } from '@/lib/api'
import dynamic from 'next/dynamic'

const GraphView = dynamic(() => import('@/components/GraphView'), { ssr: false })

type Tab = 'materials' | 'graph'

export default function SubjectDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [subject, setSubject] = useState<Subject | null>(null)
  const [files, setFiles] = useState<FileInfo[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('materials')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null)
  const [initializing, setInitializing] = useState(false)
  const [initResult, setInitResult] = useState<{ concepts: number; problems: number } | null>(null)
  const [instructions, setInstructions] = useState('')
  const [mermaidString, setMermaidString] = useState<string | null>(null)
  const [graphLoading, setGraphLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadData = useCallback(async () => {
    try {
      const [subjectData, filesData] = await Promise.all([
        api.subjects.get(id),
        api.files.list(id),
      ])
      setSubject(subjectData)
      setFiles(filesData)
      if (subjectData.initialized) {
        setInitResult({
          concepts: subjectData.concept_count,
          problems: subjectData.problem_count,
        })
      }
    } catch (err) {
      setError('データの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/auth')
      return
    }
    loadData()
  }, [router, loadData])

  async function handleFilesUpload(fileList: FileList | File[]) {
    const files = Array.from(fileList)
    if (files.length === 0) return
    setUploading(true)
    setUploadProgress({ current: 0, total: files.length })
    let failed = 0
    for (let i = 0; i < files.length; i++) {
      setUploadProgress({ current: i + 1, total: files.length })
      try {
        await api.files.upload(id, files[i])
      } catch {
        failed++
      }
    }
    const updated = await api.files.list(id)
    setFiles(updated)
    setUploading(false)
    setUploadProgress(null)
    if (failed > 0) setError(`${failed} 件のアップロードに失敗しました`)
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) handleFilesUpload(e.target.files)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0)
      handleFilesUpload(e.dataTransfer.files)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave() {
    setIsDragging(false)
  }

  async function handleDeleteFile(fileId: string) {
    try {
      await api.files.delete(id, fileId)
      setFiles(prev => prev.filter(f => f.id !== fileId))
    } catch {
      setError('ファイルの削除に失敗しました')
    }
  }

  async function handleInit() {
    setInitializing(true)
    setError(null)
    try {
      const result = await api.study.init(id, instructions || undefined)
      setInitResult({ concepts: result.concepts, problems: result.problems })
      const updated = await api.subjects.get(id)
      setSubject(updated)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '初期化に失敗しました'
      if (msg.includes('401')) {
        router.replace('/auth')
        return
      }
      setError(`初期化に失敗しました: ${msg}`)
    } finally {
      setInitializing(false)
    }
  }

  async function handleGraphTabClick() {
    setActiveTab('graph')
    if (!mermaidString && subject?.initialized) {
      setGraphLoading(true)
      try {
        const data = await api.study.graph(id)
        setMermaidString(data.mermaid)
      } catch {
        setError('グラフの読み込みに失敗しました')
      } finally {
        setGraphLoading(false)
      }
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 text-slate-500 animate-spin" />
      </div>
    )
  }

  if (!subject) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <p className="text-slate-400 mb-4">教科が見つかりません</p>
        <button
          onClick={() => router.push('/subjects')}
          className="text-indigo-400 hover:text-indigo-300 text-sm"
        >
          一覧に戻る
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/subjects')}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-lg font-semibold text-slate-100">{subject.name}</h1>
                {subject.initialized && (
                  <p className="text-xs text-slate-500">
                    {subject.concept_count} 概念 · {subject.problem_count} 問題
                  </p>
                )}
              </div>
            </div>

            {subject.initialized && (
              <button
                onClick={() => router.push(`/subjects/${id}/session`)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500
                           text-white text-sm font-medium transition-colors min-h-[44px]"
              >
                <Play className="w-4 h-4" />
                学習開始
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4">
            <button
              onClick={() => setActiveTab('materials')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${activeTab === 'materials'
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
            >
              <BookOpen className="w-4 h-4" />
              教材
            </button>
            <button
              onClick={handleGraphTabClick}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${activeTab === 'graph'
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
            >
              <Network className="w-4 h-4" />
              グラフ
            </button>
          </div>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="max-w-4xl mx-auto px-4 pt-4">
          <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-red-950 border border-red-800 text-red-300 text-sm">
            <span>{error}</span>
            <button onClick={() => setError(null)}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        {activeTab === 'materials' && (
          <div className="space-y-6">
            {/* Upload area */}
            <div>
              <h2 className="text-sm font-medium text-slate-300 mb-3">教材をアップロード</h2>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                  ${isDragging
                    ? 'border-indigo-500 bg-indigo-950/30'
                    : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/30'
                  }
                  ${uploading ? 'pointer-events-none opacity-60' : ''}`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept=".pdf,.png,.jpg,.jpeg,.txt,.md"
                  onChange={handleFileInputChange}
                />
                {uploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                    <p className="text-sm text-slate-400">
                      {uploadProgress
                        ? `アップロード中... ${uploadProgress.current} / ${uploadProgress.total}`
                        : 'アップロード中...'}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-8 h-8 text-slate-500" />
                    <p className="text-sm text-slate-300">
                      ファイルをドラッグ＆ドロップ、またはクリックしてアップロード
                    </p>
                    <p className="text-xs text-slate-500">PDF, 画像, テキストに対応</p>
                  </div>
                )}
              </div>
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-slate-300 mb-3">
                  アップロード済みファイル ({files.length})
                </h2>
                <div className="space-y-2">
                  {files.map(file => (
                    <div
                      key={file.id}
                      className="flex items-center gap-3 px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl"
                    >
                      <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-200 truncate">{file.filename}</p>
                        <p className="text-xs text-slate-500">
                          {formatFileSize(file.size_bytes)} ·{' '}
                          {new Date(file.uploaded_at).toLocaleDateString('ja-JP')}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteFile(file.id)}
                        className="flex-shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-red-400
                                   hover:bg-red-950/50 transition-colors"
                        title="削除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Init section */}
            <div className="border border-slate-700 rounded-xl p-5 bg-slate-800/50">
              <h2 className="text-sm font-semibold text-slate-200 mb-1">
                学習データを分析する
              </h2>
              <p className="text-xs text-slate-500 mb-4">
                AIがアップロードされた教材を分析し、概念グラフと問題を生成します
              </p>

              {initResult && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-emerald-950 border border-emerald-900 mb-4">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span className="text-sm text-emerald-300">
                    分析完了: {initResult.concepts} 概念、{initResult.problems} 問題を生成しました
                  </span>
                </div>
              )}

              <div className="space-y-3">
                <textarea
                  value={instructions}
                  onChange={e => setInstructions(e.target.value)}
                  placeholder="追加の指示（任意）例: 「高校数学レベルで」「試験範囲は第3章まで」"
                  rows={2}
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-700 border border-slate-600 text-slate-100
                             placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500
                             focus:border-transparent resize-none transition-colors"
                />
                <button
                  onClick={handleInit}
                  disabled={initializing || files.length === 0}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500
                             disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed
                             text-white text-sm font-medium transition-colors min-h-[44px]"
                >
                  {initializing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      分析中... (しばらくかかります)
                    </>
                  ) : (
                    <>
                      <Network className="w-4 h-4" />
                      {initResult ? '再分析する' : '分析開始'}
                    </>
                  )}
                </button>
                {files.length === 0 && (
                  <p className="text-xs text-slate-500">
                    ファイルをアップロードしてから分析を開始してください
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'graph' && (
          <div>
            <h2 className="text-sm font-medium text-slate-300 mb-4">概念依存グラフ</h2>
            {!subject.initialized ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Network className="w-12 h-12 text-slate-600 mb-3" />
                <p className="text-slate-400 text-sm">
                  グラフを表示するには、先に学習データを分析してください
                </p>
              </div>
            ) : graphLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 text-slate-500 animate-spin" />
              </div>
            ) : mermaidString ? (
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 overflow-auto">
                <GraphView mermaidString={mermaidString} />
              </div>
            ) : (
              <div className="flex items-center justify-center py-16">
                <p className="text-slate-500 text-sm">グラフデータがありません</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
