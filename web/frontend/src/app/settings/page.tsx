"use client";

import Link from "next/link";
import TunnelSettings from "@/components/TunnelSettings";

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-slate-100 pb-24">
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-sm border-b border-slate-200 px-4 pt-[env(safe-area-inset-top)]">
        <div className="max-w-2xl mx-auto flex items-center gap-3 h-14">
          <Link
            href="/"
            className="p-2 -ml-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors text-lg leading-none"
          >
            ‹
          </Link>
          <h1 className="font-bold text-slate-800">設定</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        <TunnelSettings />

        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-2">
          <h2 className="font-semibold text-slate-800 text-base">このアプリについて</h2>
          <p className="text-sm text-slate-500">
            benkyo — 問題駆動型学習支援システム
          </p>
          <p className="text-xs text-slate-400">
            Web UI は Claude Code と組み合わせて動作します。
            CLI コマンドで教科・概念・問題を管理し、このダッシュボードで学習状況を確認できます。
          </p>
        </div>
      </main>
    </div>
  );
}
