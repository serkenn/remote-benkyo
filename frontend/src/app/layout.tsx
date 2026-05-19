import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Benkyo - AI学習ツール',
  description: 'AIを使った個人学習支援ツール',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja" className="dark">
      <body className="bg-slate-900 text-slate-100 min-h-screen">
        {children}
      </body>
    </html>
  )
}
