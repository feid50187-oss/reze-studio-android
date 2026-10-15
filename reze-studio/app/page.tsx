"use client"

import dynamic from "next/dynamic"
import { Studio } from "@/context/studio-context"
import { Playback } from "@/context/playback-context"
import { StudioStatusProvider } from "@/components/studio-status"
import { I18nProvider } from "@/lib/i18n"

const StudioPage = dynamic(() => import("@/components/studio").then((m) => m.StudioPage), { ssr: false })

export default function Home() {
  return (
    <I18nProvider>
      <Studio>
        <Playback>
          <StudioStatusProvider>
            <StudioPage />
          </StudioStatusProvider>
        </Playback>
      </Studio>
    </I18nProvider>
  )
}
