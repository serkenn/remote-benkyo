"use client";

import { addDays, differenceInDays, format, parseISO, startOfDay } from "date-fns";
import { ja } from "date-fns/locale";
import type { Project, ScheduleItem } from "@/lib/types";

interface Props {
  projects: Project[];
  allSchedule: { projectId: string; items: ScheduleItem[] }[];
}

const CELL_WIDTH = 28;
const ROW_HEIGHT = 44;
const LABEL_WIDTH = 140;

function getDateRange(items: ScheduleItem[]): { start: Date; end: Date } {
  const today = startOfDay(new Date());
  if (items.length === 0) {
    return { start: today, end: addDays(today, 60) };
  }
  const starts = items.map((i) => parseISO(i.start_date));
  const ends = items.map((i) => parseISO(i.end_date));
  const minStart = starts.reduce((a, b) => (a < b ? a : b));
  const maxEnd = ends.reduce((a, b) => (a > b ? a : b));
  const start = minStart < today ? minStart : today;
  const end = maxEnd > addDays(today, 30) ? maxEnd : addDays(today, 60);
  return { start: startOfDay(start), end: startOfDay(end) };
}

export default function GanttChart({ projects, allSchedule }: Props) {
  const allItems = allSchedule.flatMap((s) => s.items);
  const { start, end } = getDateRange(allItems);
  const totalDays = differenceInDays(end, start) + 1;
  const today = startOfDay(new Date());
  const todayOffset = differenceInDays(today, start);

  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p]));

  const rows: { label: string; color: string; item: ScheduleItem }[] = allSchedule.flatMap(
    ({ projectId, items }) => {
      const proj = projectMap[projectId];
      return items.map((item) => ({
        label: `${proj?.display_name ?? projectId} — ${item.title}`,
        color: item.color ?? proj?.color ?? "#6366f1",
        item,
      }));
    }
  );

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-slate-400 text-sm">
        スケジュールがありません。教科を追加してガントチャートを作成してください。
      </div>
    );
  }

  const chartWidth = totalDays * CELL_WIDTH;

  return (
    <div className="overflow-x-auto gantt-scroll rounded-xl border border-slate-200">
      <div style={{ width: LABEL_WIDTH + chartWidth, minWidth: "100%" }}>
        {/* Header */}
        <div className="flex sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
          <div
            className="shrink-0 px-3 flex items-center text-xs font-medium text-slate-500 border-r border-slate-200"
            style={{ width: LABEL_WIDTH, height: ROW_HEIGHT }}
          >
            タスク
          </div>
          <div className="flex" style={{ height: ROW_HEIGHT }}>
            {Array.from({ length: totalDays }).map((_, i) => {
              const d = addDays(start, i);
              const isToday = i === todayOffset;
              const isMonday = d.getDay() === 1;
              const isFirstOfMonth = d.getDate() === 1;
              const showLabel = isFirstOfMonth || isMonday || i === 0;
              return (
                <div
                  key={i}
                  className={`shrink-0 flex items-end justify-center pb-1 text-[10px] border-r border-slate-100 ${
                    isToday ? "bg-indigo-50 text-indigo-600 font-bold" : "text-slate-400"
                  } ${d.getDay() === 0 || d.getDay() === 6 ? "bg-slate-50/50" : ""}`}
                  style={{ width: CELL_WIDTH, height: ROW_HEIGHT }}
                >
                  {showLabel && (
                    <span className="leading-none">
                      {isFirstOfMonth
                        ? format(d, "M/d", { locale: ja })
                        : format(d, "d", { locale: ja })}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Rows */}
        {rows.map(({ label, color, item }) => {
          const itemStart = differenceInDays(parseISO(item.start_date), start);
          const itemLen = Math.max(
            1,
            differenceInDays(parseISO(item.end_date), parseISO(item.start_date)) + 1
          );
          const progressWidth = Math.round(itemLen * item.progress);
          return (
            <div
              key={item.id}
              className="flex border-b border-slate-100 last:border-0 group"
              style={{ height: ROW_HEIGHT }}
            >
              <div
                className="shrink-0 px-3 flex items-center text-xs text-slate-600 border-r border-slate-200 truncate"
                style={{ width: LABEL_WIDTH }}
                title={label}
              >
                {label}
              </div>
              <div className="relative flex-1" style={{ minWidth: chartWidth }}>
                {/* weekend shading */}
                {Array.from({ length: totalDays }).map((_, i) => {
                  const d = addDays(start, i);
                  if (d.getDay() === 0 || d.getDay() === 6) {
                    return (
                      <div
                        key={i}
                        className="absolute inset-y-0 bg-slate-50/60"
                        style={{ left: i * CELL_WIDTH, width: CELL_WIDTH }}
                      />
                    );
                  }
                  return null;
                })}
                {/* today line */}
                {todayOffset >= 0 && todayOffset < totalDays && (
                  <div
                    className="absolute inset-y-0 w-px bg-indigo-400 z-10"
                    style={{ left: todayOffset * CELL_WIDTH + CELL_WIDTH / 2 }}
                  />
                )}
                {/* bar */}
                <div
                  className="absolute top-2.5 rounded-full overflow-hidden"
                  style={{
                    left: itemStart * CELL_WIDTH + 2,
                    width: itemLen * CELL_WIDTH - 4,
                    height: ROW_HEIGHT - 20,
                    background: color + "33",
                    border: `2px solid ${color}`,
                  }}
                >
                  {progressWidth > 0 && (
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${item.progress * 100}%`,
                        background: color,
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
