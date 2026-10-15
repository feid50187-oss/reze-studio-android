import type { Metadata } from "next"
import { Instrument_Sans, JetBrains_Mono } from "next/font/google"
import "./globals.css"
import { Analytics } from "@vercel/analytics/next"
import { I18nProvider } from "@/lib/i18n"
import { SiteNotice } from "@/components/site-notice"
import { CrashLogCapture } from "@/components/crash-log-capture"
import { NoStickyFocus } from "@/components/no-sticky-focus"
import { NoNativeContextMenu } from "@/components/no-native-context-menu"

const instrumentSans = Instrument_Sans({ variable: "--font-instrument-sans", subsets: ["latin"] })
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Reze Studio",
  description: "Web-based MMD animation curve editor",
  keywords: ["MMD", "animation", "curve editor", "WebGPU", "Reze Engine"],
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`dark select-none ${instrumentSans.variable} ${jetbrainsMono.variable}`}>
      <body className="antialiased outline-none">
        <CrashLogCapture />
        <NoStickyFocus />
        <NoNativeContextMenu />
        <I18nProvider>
          {children}
          <SiteNotice />
        </I18nProvider>
        <Analytics />
      </body>
    </html>
  )
}
