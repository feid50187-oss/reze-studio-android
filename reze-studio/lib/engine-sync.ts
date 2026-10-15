"use client"

import { useCallback } from "react"
import type { AnimationClip } from "reze-engine"
import { bakeProject } from "@/lib/bake"
import { projectOf, useStudioSelector } from "@/context/studio-context"
import type { Project } from "@/lib/project"

export function isSingleClipAtOrigin(project: Project): boolean {
  const placements = project.tracks.flatMap((t) => t.placements)
  if (placements.length !== 1) return false
  const only = placements[0]
  return only.start === 0 && only.in === 0 && only.out == null && !project.tracks.some((t) => t.mute || t.solo)
}

export function engineClipFor(
  project: Project,
  activeClip: AnimationClip,
  cameraLastFrame = 0,
): AnimationClip {
  if (isSingleClipAtOrigin(project)) {
    return cameraLastFrame > activeClip.frameCount ? { ...activeClip, frameCount: cameraLastFrame } : activeClip
  }
  return bakeProject(project, cameraLastFrame)
}

export function useEngineClip(): (clip: AnimationClip) => AnimationClip {
  const library = useStudioSelector((s) => s.library)
  const tracks = useStudioSelector((s) => s.tracks)
  const clipDisplayName = useStudioSelector((s) => s.clipDisplayName)
  const cameraTrack = useStudioSelector((s) => s.cameraTrack)
  const cameraLastFrame = cameraTrack.length > 0 ? cameraTrack[cameraTrack.length - 1].frame : 0
  return useCallback(
    (clip: AnimationClip) => engineClipFor(projectOf({ library, tracks, clipDisplayName }), clip, cameraLastFrame),
    [library, tracks, clipDisplayName, cameraLastFrame],
  )
}
