"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Tool = "pen" | "highlighter" | "eraser";
type StrokeSize = "s" | "m" | "l";

interface Props {
  onClose: () => void;
}

const COLORS = [
  { value: "#1a1a1a", label: "黒" },
  { value: "#ef4444", label: "赤" },
  { value: "#3b82f6", label: "青" },
  { value: "#22c55e", label: "緑" },
  { value: "#f97316", label: "橙" },
  { value: "#8b5cf6", label: "紫" },
];
const STROKE_PX: Record<StrokeSize, number> = { s: 2, m: 5, l: 12 };

export default function DrawingCanvas({ onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#1a1a1a");
  const [size, setSize] = useState<StrokeSize>("m");
  const [canUndo, setCanUndo] = useState(false);

  // mutable refs — no re-render needed
  const snapshots = useRef<ImageData[]>([]);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const penLive = useRef(false); // true while Apple Pencil is hovering/touching

  // ── canvas init ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
  }, []);

  // ── helpers ───────────────────────────────────────────────────────────────
  const g = () => canvasRef.current?.getContext("2d") ?? null;

  const pt = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const pushSnapshot = useCallback(() => {
    const c = canvasRef.current;
    const ctx = g();
    if (!c || !ctx) return;
    const snap = ctx.getImageData(0, 0, c.width, c.height);
    snapshots.current = [...snapshots.current.slice(-29), snap];
    setCanUndo(true);
  }, []);

  const stroke = useCallback(
    (
      from: { x: number; y: number },
      to: { x: number; y: number },
      pressure: number
    ) => {
      const ctx = g();
      if (!ctx) return;

      const base = STROKE_PX[size];
      let lw: number;
      let alpha = 1;

      if (tool === "eraser") {
        lw = base * 6;
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
      } else if (tool === "highlighter") {
        lw = base * 4;
        alpha = 0.35;
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = color;
      } else {
        // pen — pressure-sensitive width
        lw = Math.max(1, base * (0.4 + pressure * 1.8));
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = color;
      }

      ctx.globalAlpha = alpha;
      ctx.lineWidth = lw;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    },
    [tool, color, size]
  );

  // ── pointer events (Apple Pencil + touch + mouse) ─────────────────────────
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      // palm rejection: ignore finger/touch when pen is present
      if (penLive.current && e.pointerType === "touch") return;
      if (e.pointerType === "pen") penLive.current = true;

      e.currentTarget.setPointerCapture(e.pointerId);
      pushSnapshot();
      drawing.current = true;
      last.current = pt(e);

      // dot at tap point
      const pressure =
        e.pointerType === "pen" ? Math.max(0.1, e.pressure || 0.5) : 0.5;
      const p = pt(e);
      stroke({ x: p.x - 0.1, y: p.y }, p, pressure);
    },
    [pushSnapshot, stroke]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawing.current || !last.current) return;
      if (penLive.current && e.pointerType === "touch") return;

      const pressure =
        e.pointerType === "pen" ? Math.max(0.1, e.pressure || 0.5) : 0.5;
      const cur = pt(e);

      // use getCoalescedEvents for smoother Apple Pencil strokes
      if (e.nativeEvent && "getCoalescedEvents" in e.nativeEvent) {
        const coalesced = (
          e.nativeEvent as PointerEvent & {
            getCoalescedEvents: () => PointerEvent[];
          }
        ).getCoalescedEvents();
        for (const ce of coalesced) {
          const cpt = {
            x: ce.clientX - canvasRef.current!.getBoundingClientRect().left,
            y: ce.clientY - canvasRef.current!.getBoundingClientRect().top,
          };
          const cp =
            e.pointerType === "pen"
              ? Math.max(0.1, ce.pressure || pressure)
              : 0.5;
          if (last.current) stroke(last.current, cpt, cp);
          last.current = cpt;
        }
      } else {
        stroke(last.current, cur, pressure);
        last.current = cur;
      }
    },
    [stroke]
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "pen") penLive.current = false;
    drawing.current = false;
    last.current = null;
  }, []);

  // ── toolbar actions ───────────────────────────────────────────────────────
  const undo = useCallback(() => {
    const c = canvasRef.current;
    const ctx = g();
    if (!c || !ctx || snapshots.current.length === 0) return;
    const snap = snapshots.current[snapshots.current.length - 1];
    ctx.putImageData(snap, 0, 0);
    snapshots.current = snapshots.current.slice(0, -1);
    setCanUndo(snapshots.current.length > 0);
  }, []);

  const clear = useCallback(() => {
    const c = canvasRef.current;
    const ctx = g();
    if (!c || !ctx) return;
    pushSnapshot();
    const dpr = window.devicePixelRatio || 1;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width / dpr, c.height / dpr);
  }, [pushSnapshot]);

  const saveImage = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = `benkyo-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
  }, []);

  // ── render ────────────────────────────────────────────────────────────────
  const toolBtn = (t: Tool, icon: string, label: string) => (
    <button
      onClick={() => setTool(t)}
      title={label}
      className={`flex flex-col items-center justify-center w-12 h-11 rounded-xl text-lg transition-colors ${
        tool === t
          ? "bg-indigo-100 text-indigo-600"
          : "text-slate-500 hover:bg-slate-100"
      }`}
    >
      {icon}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white select-none">
      {/* ── Toolbar ── */}
      <div
        className="shrink-0 flex items-center gap-1 px-3 py-2 bg-white border-b border-slate-200 overflow-x-auto"
        style={{ paddingTop: `max(0.5rem, env(safe-area-inset-top))` }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="flex items-center justify-center w-11 h-11 rounded-xl text-slate-500 hover:bg-slate-100 shrink-0 text-xl"
        >
          ✕
        </button>

        <div className="w-px h-8 bg-slate-200 shrink-0 mx-1" />

        {/* Tools */}
        {toolBtn("pen", "✏️", "ペン（筆圧対応）")}
        {toolBtn("highlighter", "🖌️", "ハイライト")}
        {toolBtn("eraser", "🧹", "消しゴム")}

        <div className="w-px h-8 bg-slate-200 shrink-0 mx-1" />

        {/* Colors */}
        {tool !== "eraser" &&
          COLORS.map((c) => (
            <button
              key={c.value}
              onClick={() => setColor(c.value)}
              title={c.label}
              className={`w-8 h-8 rounded-full shrink-0 transition-transform active:scale-90 ${
                color === c.value && tool !== "eraser"
                  ? "ring-2 ring-offset-2 ring-slate-600 scale-110"
                  : ""
              }`}
              style={{ background: c.value }}
            />
          ))}

        {tool !== "eraser" && (
          <div className="w-px h-8 bg-slate-200 shrink-0 mx-1" />
        )}

        {/* Stroke size */}
        {(["s", "m", "l"] as StrokeSize[]).map((s) => (
          <button
            key={s}
            onClick={() => setSize(s)}
            title={s === "s" ? "細" : s === "m" ? "中" : "太"}
            className={`flex items-center justify-center w-10 h-11 rounded-xl shrink-0 transition-colors ${
              size === s
                ? "bg-indigo-100 text-indigo-600 font-bold"
                : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            <span
              className="rounded-full bg-current"
              style={{
                width: s === "s" ? 4 : s === "m" ? 7 : 12,
                height: s === "s" ? 4 : s === "m" ? 7 : 12,
              }}
            />
          </button>
        ))}

        <div className="w-px h-8 bg-slate-200 shrink-0 mx-1" />

        {/* Actions */}
        <button
          onClick={undo}
          disabled={!canUndo}
          title="元に戻す"
          className="flex items-center justify-center w-11 h-11 rounded-xl text-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 shrink-0"
        >
          ↩
        </button>
        <button
          onClick={clear}
          title="全消去"
          className="flex items-center justify-center w-11 h-11 rounded-xl text-lg text-slate-500 hover:bg-slate-100 shrink-0"
        >
          🗑️
        </button>
        <button
          onClick={saveImage}
          title="画像として保存"
          className="flex items-center justify-center w-11 h-11 rounded-xl text-lg text-slate-500 hover:bg-slate-100 shrink-0"
        >
          ⬇️
        </button>
      </div>

      {/* ── Canvas ── */}
      <div
        ref={wrapRef}
        className="flex-1 overflow-hidden bg-white relative"
        style={{ touchAction: "none" }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0"
          style={{ touchAction: "none", cursor: tool === "eraser" ? "cell" : "crosshair" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />

        {/* hint — fades after first stroke */}
        {!canUndo && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-slate-300 text-sm select-none">
              Apple Pencil または指で描いてください
            </p>
          </div>
        )}
      </div>

      {/* ── Bottom safe area ── */}
      <div
        className="shrink-0 bg-white"
        style={{ height: "env(safe-area-inset-bottom, 0px)" }}
      />
    </div>
  );
}
