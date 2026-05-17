import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "benkyo",
  description: "問題駆動型学習支援",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "benkyo" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-slate-100 font-sans">{children}</body>
    </html>
  );
}
