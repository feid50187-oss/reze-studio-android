"use client" // Error boundaries must be Client Components

import { CrashScreen } from "@/components/crash-screen"
import "./globals.css"

export default function GlobalError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <title>Reze Studio — something broke</title>
      <body className="min-h-full text-foreground">
        <CrashScreen error={error} retry={unstable_retry} />
      </body>
    </html>
  )
}
