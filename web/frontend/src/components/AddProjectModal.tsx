"use client";

import { createProject } from "@/lib/api";
import type { Project } from "@/lib/types";
import { useState } from "react";

const COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#06b6d4",
];

interface Props {
  onClose: () => void;
  onCreated: (p: Project) => void;
}

export default function AddProjectModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setErr(null);
    try {
      const proj = await createProject({ name: name.trim(), description, color });
      onCreated(proj);
    } catch (e) {
      setErr(`作成に失敗しました: ${e}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="p-6 pb-4">
          <h2 className="text-lg font-bold text-slate-800 mb-4">教科を追加</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                教科名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例: 数学、英語、物理…"
                autoFocus
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                メモ（任意）
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="例: 大学入試向け"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">
                カラー
              </label>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-8 h-8 rounded-full transition-transform active:scale-90 ${
                      color === c ? "ring-2 ring-offset-2 ring-slate-700 scale-110" : ""
                    }`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>

            {err && <p className="text-sm text-red-500">{err}</p>}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-medium text-base active:bg-slate-50"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={loading || !name.trim()}
                className="flex-1 py-3 rounded-xl bg-indigo-500 text-white font-medium text-base disabled:opacity-50 active:bg-indigo-600 transition-colors"
              >
                {loading ? "作成中…" : "追加"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
