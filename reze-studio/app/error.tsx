"use client" // Error boundaries must be Client Components

import { CrashScreen } from "@/components/crash-screen"

export default function Error({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <CrashScreen error={error} retry={unstable_retry} />
}
