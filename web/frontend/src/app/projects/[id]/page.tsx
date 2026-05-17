"use client";

import {
  createExam,
  createScheduleItem,
  deleteExam,
  deleteProject,
  deleteScheduleItem,
  fetchProject,
  updateScheduleItem,
} from "@/lib/api";
import type { ExamDate, ScheduleItem } from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import GanttChart from "@/components/GanttChart";
import ExamCalendar from "@/components/ExamCalendar";
import DrawingCanvas from "@/components/DrawingCanvas";
import { fetchEvents } from "@/lib/api";

interface Params {
  params: { id: string };
}

export default function ProjectPage({ params }: Params) {
  const router = useRouter();
  const { data: project, mutate } = useSWR(
    `/projects/${params.id}`,
    () => fetchProject(params.id)
  );
  const { data: events = [] } = useSWR(
    `/events/${params.id}`,
    () => fetchEvents({ project_id: params.id, limit: 200 })
  );

  const [tab, setTab] = useState<"overview" | "gantt" | "concepts">("overview");
  const [showCanvas, setShowCanvas] = useState(false);
  const [addingExam, setAddingExam] = useState(false);
  const [examName, setExamName] = useState("");
  const [examDate, setExamDate] = useState("");
  const [addingSchedule, setAddingSchedule] = useState(false);
  const [schedTitle, setSchedTitle] = useState("");
  const [schedStart, setSchedStart] = useState("");
  const [schedEnd, setSchedEnd] = useState("");

  if (!project) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <p className="text-slate-400">読み込み中…</p>
      </div>
    );
  }

  async function handleAddExam() {
    if (!examName || !examDate) return;
    await createExam(params.id, { name: examName, date: examDate });
    setExamName(""); setExamDate(""); setAddingExam(false);
    mutate();
  }

  async function handleDeleteExam(examId: string) {
    await deleteExam(params.id, examId);
    mutate();
  }

  async function handleAddSchedule() {
    if (!schedTitle || !schedStart || !schedEnd) return;
    await createScheduleItem(params.id, {
      title: schedTitle,
      start_date: schedStart,
      end_date: schedEnd,
      color: project?.color,
    });
    setSchedTitle(""); setSchedStart(""); setSchedEnd(""); setAddingSchedule(false);
    mutate();
  }

  async function handleProgressChange(item: ScheduleItem, progress: number) {
    await updateScheduleItem(params.id, item.id, { progress });
    mutate();
  }

  async function handleDeleteSchedule(itemId: string) {
    await deleteScheduleItem(params.id, itemId);
    mutate();
  }

  async function handleDeleteProject() {
    if (!project) return;
    if (!confirm(`「${project.display_name}」を削除しますか？`)) return;
    await deleteProject(params.id);
    router.push("/");
  }

  const allSchedule = project.schedule
    ? [{ projectId: project.id, items: project.schedule }]
    : [];

  return (
    <>
    {showCanvas && <DrawingCanvas onClose={() => setShowCanvas(false)} />}
    <div className="min-h-screen bg-slate-100 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-sm border-b border-slate-200 px-4 pt-[env(safe-area-inset-top)]">
        <div className="max-w-3xl mx-auto flex items-center gap-3 h-14">
          <Link
            href="/"
            className="p-2 -ml-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors text-lg"
          >
            ‹
          </Link>
          <span
            className="w-3 h-3 rounded-full shrink-0"
            style={{ background: project.color }}
          />
          <h1 className="font-bold text-slate-800 truncate">{project.display_name}</h1>
          <button
            onClick={handleDeleteProject}
            className="ml-auto p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors text-sm"
          >
            削除
          </button>
        </div>

        {/* Tabs */}
        <div className="max-w-3xl mx-auto flex border-t border-slate-100">
          {(["overview", "gantt", "concepts"] as const).map((t) => {
            const labels = { overview: "概要", gantt: "スケジュール", concepts: "概念" };
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                  tab === t
                    ? "text-indigo-600 border-b-2 border-indigo-500"
                    : "text-slate-400 border-b-2 border-transparent"
                }`}
              >
                {labels[t]}
              </button>
            );
          })}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        {tab === "overview" && (
          <>
            {/* Exam dates */}
            <section className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-slate-700">試験日</h2>
                <button
                  onClick={() => setAddingExam((v) => !v)}
                  className="text-sm text-indigo-500 font-medium px-3 py-1.5 rounded-lg hover:bg-indigo-50"
                >
                  + 追加
                </button>
              </div>

              {addingExam && (
                <div className="flex flex-col gap-2 p-3 bg-slate-50 rounded-xl">
                  <input
                    type="text"
                    placeholder="試験名（例: 期末試験）"
                    value={examName}
                    onChange={(e) => setExamName(e.target.value)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                  <input
                    type="date"
                    value={examDate}
                    onChange={(e) => setExamDate(e.target.value)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAddingExam(false)}
                      className="flex-1 py-2 rounded-lg border border-slate-200 text-sm text-slate-500"
                    >
                      キャンセル
                    </button>
                    <button
                      onClick={handleAddExam}
                      disabled={!examName || !examDate}
                      className="flex-1 py-2 rounded-lg bg-indigo-500 text-white text-sm font-medium disabled:opacity-50"
                    >
                      追加
                    </button>
                  </div>
                </div>
              )}

              {(project.exams ?? []).length === 0 && !addingExam && (
                <p className="text-sm text-slate-400">試験日が未設定です</p>
              )}
              {(project.exams ?? []).map((exam: ExamDate) => (
                <div
                  key={exam.id}
                  className="flex items-center justify-between py-1.5"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-700">{exam.name}</p>
                    <p className="text-xs text-slate-400">{exam.date}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteExam(exam.id)}
                    className="text-xs text-red-400 p-1.5"
                  >
                    削除
                  </button>
                </div>
              ))}
            </section>

            {/* Calendar */}
            <section className="bg-white rounded-2xl shadow-sm p-4">
              <ExamCalendar exams={project.exams ?? []} events={events} />
            </section>
          </>
        )}

        {tab === "gantt" && (
          <>
            <section className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-slate-700">学習スケジュール</h2>
                <button
                  onClick={() => setAddingSchedule((v) => !v)}
                  className="text-sm text-indigo-500 font-medium px-3 py-1.5 rounded-lg hover:bg-indigo-50"
                >
                  + 追加
                </button>
              </div>

              {addingSchedule && (
                <div className="flex flex-col gap-2 p-3 bg-slate-50 rounded-xl">
                  <input
                    type="text"
                    placeholder="タスク名（例: 第1章 微分積分）"
                    value={schedTitle}
                    onChange={(e) => setSchedTitle(e.target.value)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-xs text-slate-400 mb-1">開始日</label>
                      <input
                        type="date"
                        value={schedStart}
                        onChange={(e) => setSchedStart(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-slate-400 mb-1">終了日</label>
                      <input
                        type="date"
                        value={schedEnd}
                        onChange={(e) => setSchedEnd(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAddingSchedule(false)}
                      className="flex-1 py-2 rounded-lg border border-slate-200 text-sm text-slate-500"
                    >
                      キャンセル
                    </button>
                    <button
                      onClick={handleAddSchedule}
                      disabled={!schedTitle || !schedStart || !schedEnd}
                      className="flex-1 py-2 rounded-lg bg-indigo-500 text-white text-sm font-medium disabled:opacity-50"
                    >
                      追加
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section className="bg-white rounded-2xl shadow-sm p-4">
              <GanttChart projects={[project]} allSchedule={allSchedule} />
            </section>

            {/* Progress sliders */}
            {(project.schedule ?? []).length > 0 && (
              <section className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
                <h2 className="font-semibold text-slate-700 text-sm">進捗を更新</h2>
                {(project.schedule ?? []).map((item: ScheduleItem) => (
                  <div key={item.id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600 truncate mr-2">{item.title}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-slate-500 text-xs">
                          {Math.round(item.progress * 100)}%
                        </span>
                        <button
                          onClick={() => handleDeleteSchedule(item.id)}
                          className="text-xs text-red-400"
                        >
                          削除
                        </button>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(item.progress * 100)}
                      onChange={(e) =>
                        handleProgressChange(item, Number(e.target.value) / 100)
                      }
                      className="w-full h-2 accent-indigo-500"
                    />
                  </div>
                ))}
              </section>
            )}
          </>
        )}

        {tab === "concepts" && (
          <section className="bg-white rounded-2xl shadow-sm p-4 space-y-2">
            <h2 className="font-semibold text-slate-700 mb-3">登録済み概念</h2>
            {(project.concepts ?? []).length === 0 ? (
              <p className="text-sm text-slate-400">
                概念がまだありません。Claude Code で benkyo CLI を使って追加してください。
              </p>
            ) : (
              (project.concepts ?? []).map((c) => (
                <div
                  key={c.id}
                  className="flex items-start gap-3 py-2 border-b border-slate-50 last:border-0"
                >
                  <span
                    className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium mt-0.5 ${
                      c.treatment === "blackbox"
                        ? "bg-slate-100 text-slate-500"
                        : "bg-indigo-50 text-indigo-600"
                    }`}
                  >
                    {c.treatment === "blackbox" ? "ブラックボックス" : "ホワイトボックス"}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700">{c.name || c.id}</p>
                    <p className="text-xs text-slate-400 line-clamp-2">{c.content}</p>
                  </div>
                </div>
              ))
            )}
          </section>
        )}
      </main>

      {/* Floating draw button */}
      <button
        onClick={() => setShowCanvas(true)}
        title="図を書く（Apple Pencil 対応）"
        className="fixed bottom-6 right-6 z-30 flex items-center gap-2 bg-indigo-500 text-white rounded-2xl px-4 py-3 shadow-lg text-sm font-medium active:scale-95 transition-transform"
        style={{ paddingBottom: `max(0.75rem, env(safe-area-inset-bottom))` }}
      >
        ✏️ 図を書く
      </button>
    </div>
    </>
  );
}
