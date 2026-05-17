"use client";

import { deleteTunnelToken, fetchTunnelStatus, setTunnelToken } from "@/lib/api";
import { useState } from "react";
import useSWR from "swr";

export default function TunnelSettings() {
  const { data: status, mutate } = useSWR("/tunnel/status", fetchTunnelStatus, {
    refreshInterval: 10000,
  });
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleSave() {
    if (!token.trim()) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await setTunnelToken(token.trim());
      setToken("");
      if (res.warning) setMsg(`⚠️ ${res.warning}`);
      else setMsg("✅ トークンを保存しました。トンネルを起動中…");
      await mutate();
    } catch (e) {
      setMsg(`エラー: ${e}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    setMsg(null);
    try {
      await deleteTunnelToken();
      setMsg("トークンを削除しました。");
      await mutate();
    } catch (e) {
      setMsg(`エラー: ${e}`);
    } finally {
      setSaving(false);
    }
  }

  const statusColor = !status?.token_set
    ? "bg-slate-300"
    : status.running
    ? "bg-green-500"
    : status.container_status === "unknown"
    ? "bg-yellow-400"
    : "bg-red-500";

  const statusLabel = !status
    ? "取得中…"
    : !status.token_set
    ? "未設定"
    : status.running
    ? "接続中"
    : status.container_status === "unknown"
    ? "不明"
    : "切断";

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
      <h2 className="font-semibold text-slate-800 text-base">外部アクセス設定</h2>

      <div>
        <p className="text-sm text-slate-500 mb-2">Cloudflare Tunnel トークン</p>
        <div className="flex gap-2">
          <input
            type="password"
            placeholder={status?.token_set ? "••••••••••••••••••••" : "トークンを入力"}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <button
            onClick={handleSave}
            disabled={saving || !token.trim()}
            className="px-4 py-3 bg-indigo-500 text-white rounded-xl text-sm font-medium disabled:opacity-50 active:bg-indigo-600 transition-colors"
          >
            保存
          </button>
          {status?.token_set && (
            <button
              onClick={handleDelete}
              disabled={saving}
              className="px-4 py-3 bg-red-500 text-white rounded-xl text-sm font-medium disabled:opacity-50 active:bg-red-600 transition-colors"
            >
              削除
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
        <span className={`w-2.5 h-2.5 rounded-full ${statusColor} shrink-0`} />
        <span className="text-sm text-slate-600">
          ステータス: <span className="font-medium">{statusLabel}</span>
        </span>
      </div>

      {msg && (
        <p className="text-sm text-slate-500 bg-slate-50 rounded-xl px-3 py-2">{msg}</p>
      )}

      <p className="text-xs text-slate-400 leading-relaxed">
        Cloudflare Tunnel を使うと、外出先からも HTTPS で安全にアクセスできます。
        トークン未設定時は LAN 内からのみアクセス可能です。
      </p>
    </div>
  );
}
