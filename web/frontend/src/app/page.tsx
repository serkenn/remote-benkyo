"use client";

import { fetchEvents, fetchProjects, fetchSchedule } from "@/lib/api";
import type { Project, ScheduleItem } from "@/lib/types";
import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import AddProjectModal from "@/components/AddProjectModal";
import ExamCalendar from "@/components/ExamCalendar";
import GanttChart from "@/components/GanttChart";
import ProjectCard from "@/components/ProjectCard";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();
  const { data: projects = [], mutate: mutateProjects } = useSWR(
    "/projects",
    fetchProjects
  );
  const { data: events = [] } = useSWR("/events", () =>
    fetchEvents({ limit: 200 })
  );
  const [showAdd, setShowAdd] = useState(false);
  const [allSchedule, setAllSchedule] = useState<
    { projectId: string; items: ScheduleItem[] }[]
  >([]);

  // Fetch schedule for all projects
  useEffect(() => {
    if (!projects.length) return;
    Promise.all(
      projects.map(async (p) => ({
        projectId: p.id,
        items: await fetchSchedule(p.id).catch(() => []),
      }))
    ).then(setAllSchedule);
  }, [projects]);

  const allExams = projects.flatMap((p) => p.exams);

  return (
    <div className="min-h-screen bg-slate-100 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-sm border-b border-slate-200 px-4 pt-[env(safe-area-inset-top)] safe-top">
        <div className="max-w-4xl mx-auto flex items-center justify-between h-14">
          <h1 className="text-xl font-bold text-indigo-600 tracking-tight">benkyo</h1>
          <div className="flex items-center gap-2">
            <Link
              href="/settings"
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              title="設定"
            >
              ⚙️
            </Link>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-500 text-white rounded-xl text-sm font-medium active:bg-indigo-600 transition-colors"
            >
              <span className="text-base leading-none">+</span>
              <span>教科追加</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-5 space-y-6">
        {/* Subject cards */}
        <section>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
            教科一覧
          </h2>
          {projects.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center text-slate-400">
              <p className="text-3xl mb-3">📚</p>
              <p className="font-medium">教科がまだありません</p>
              <p className="text-sm mt-1">「教科追加」から始めましょう</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {projects.map((p: Project) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  onClick={() => router.push(`/projects/${p.id}`)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Gantt chart */}
        <section>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
            目標ガントチャート
          </h2>
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <GanttChart projects={projects} allSchedule={allSchedule} />
          </div>
        </section>

        {/* Calendar */}
        <section>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
            カレンダー
          </h2>
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <ExamCalendar exams={allExams} events={events} />
          </div>
        </section>
      </main>

      {showAdd && (
        <AddProjectModal
          onClose={() => setShowAdd(false)}
          onCreated={(p) => {
            mutateProjects([...projects, p]);
            setShowAdd(false);
          }}
        />
      )}
    </div>
  );
}
