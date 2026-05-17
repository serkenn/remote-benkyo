"use client";

import { differenceInDays, parseISO } from "date-fns";
import type { Project } from "@/lib/types";

interface Props {
  project: Project;
  onClick: () => void;
}

export default function ProjectCard({ project, onClick }: Props) {
  const today = new Date();
  const upcomingExam = project.exams
    .filter((e) => parseISO(e.date) >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const daysLeft = upcomingExam
    ? differenceInDays(parseISO(upcomingExam.date), today)
    : null;

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-2xl shadow-sm p-5 flex flex-col gap-3 active:scale-95 transition-transform touch-manipulation"
    >
      <div className="flex items-start gap-3">
        <span
          className="w-4 h-4 rounded-full mt-1 shrink-0"
          style={{ background: project.color }}
        />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-800 text-lg leading-tight truncate">
            {project.display_name}
          </h3>
          {project.description && (
            <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">{project.description}</p>
          )}
        </div>
      </div>

      {upcomingExam && daysLeft !== null && (
        <div
          className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg ${
            daysLeft <= 7
              ? "bg-red-50 text-red-600"
              : daysLeft <= 30
              ? "bg-amber-50 text-amber-600"
              : "bg-slate-50 text-slate-500"
          }`}
        >
          <span className="text-base">📅</span>
          <span className="font-medium">{upcomingExam.name}</span>
          <span className="ml-auto font-bold">
            {daysLeft === 0 ? "今日" : `あと${daysLeft}日`}
          </span>
        </div>
      )}

      {!upcomingExam && (
        <div className="text-sm text-slate-400 flex items-center gap-1.5">
          <span>試験日未設定</span>
        </div>
      )}
    </button>
  );
}
