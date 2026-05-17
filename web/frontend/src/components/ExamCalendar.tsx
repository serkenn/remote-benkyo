"use client";

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  endOfWeek,
  differenceInCalendarDays,
} from "date-fns";
import { ja } from "date-fns/locale";
import { useState } from "react";
import type { Event, ExamDate } from "@/lib/types";

interface Props {
  exams: ExamDate[];
  events: Event[];
}

const DOW = ["日", "月", "火", "水", "木", "金", "土"];

export default function ExamCalendar({ exams, events }: Props) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const sessionDays = new Set(
    events
      .filter((e) => e.kind === "session_end" || e.kind === "session_start")
      .map((e) => e.ts.slice(0, 10))
  );

  const today = new Date();
  const nextExams = exams
    .map((e) => ({ ...e, d: parseISO(e.date) }))
    .filter((e) => e.d >= startOfMonth(today))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-4">
      {/* Countdown chips */}
      {nextExams.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {nextExams.slice(0, 4).map((exam) => {
            const days = differenceInCalendarDays(exam.d, today);
            return (
              <span
                key={exam.id}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${
                  days <= 0
                    ? "bg-red-100 text-red-700"
                    : days <= 7
                    ? "bg-orange-100 text-orange-700"
                    : days <= 30
                    ? "bg-amber-100 text-amber-700"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                📅 {exam.name}
                <span className="font-bold">
                  {days < 0
                    ? `${Math.abs(days)}日前`
                    : days === 0
                    ? "今日"
                    : `あと${days}日`}
                </span>
              </span>
            );
          })}
        </div>
      )}

      {/* Calendar header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCursor((c) => addMonths(c, -1))}
          className="p-2 rounded-xl hover:bg-slate-200 active:bg-slate-300 transition-colors text-slate-600"
        >
          ‹
        </button>
        <h3 className="font-semibold text-slate-700 text-base">
          {format(cursor, "yyyy年M月", { locale: ja })}
        </h3>
        <button
          onClick={() => setCursor((c) => addMonths(c, 1))}
          className="p-2 rounded-xl hover:bg-slate-200 active:bg-slate-300 transition-colors text-slate-600"
        >
          ›
        </button>
      </div>

      {/* DOW row */}
      <div className="grid grid-cols-7 gap-1">
        {DOW.map((d, i) => (
          <div
            key={d}
            className={`text-center text-xs font-medium py-1 ${
              i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-slate-400"
            }`}
          >
            {d}
          </div>
        ))}

        {/* Day cells */}
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const inMonth = isSameMonth(day, cursor);
          const isToday = isSameDay(day, today);
          const dayExams = exams.filter((e) => e.date === key);
          const hasSession = sessionDays.has(key);
          const dow = day.getDay();

          return (
            <div
              key={key}
              className={`relative flex flex-col items-center py-1 rounded-xl min-h-[48px] ${
                !inMonth ? "opacity-30" : ""
              } ${isToday ? "bg-indigo-50" : ""}`}
            >
              <span
                className={`text-sm leading-none w-7 h-7 flex items-center justify-center rounded-full ${
                  isToday
                    ? "bg-indigo-500 text-white font-bold"
                    : dow === 0
                    ? "text-red-500"
                    : dow === 6
                    ? "text-blue-500"
                    : "text-slate-700"
                }`}
              >
                {format(day, "d")}
              </span>
              <div className="flex flex-col items-center gap-0.5 mt-0.5">
                {hasSession && (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" title="学習セッション" />
                )}
                {dayExams.map((e) => (
                  <span
                    key={e.id}
                    className="w-1.5 h-1.5 rounded-full bg-red-500"
                    title={e.name}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          学習セッション
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          試験日
        </span>
      </div>
    </div>
  );
}
