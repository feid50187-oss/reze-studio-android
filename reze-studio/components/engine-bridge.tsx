"use client"

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react"
import { Engine, Model, Vec3, VMDLoader } from "reze-engine"
import type { AnimationClip, GizmoDragEvent } from "reze-engine"
import { useStudioActions, useStudioSelector } from "@/context/studio-context"
import { usePlayback, usePlaybackFrameRef } from "@/context/playback-context"
import { useStudioStatusActions } from "@/components/studio-status"
import { autoClassifyMaterials } from "@/lib/materials"
import { clipRetainedForModel, emptyStudioClip, interpolationTemplateForFrame, readLocalPoseAfterSeek } from "@/lib/utils"
import { loadDraft, type StoredTimelineView } from "@/lib/draft"
import { useEngineClip } from "@/lib/engine-sync"
import { useActiveOffset } from "@/components/arrange-view"
import { clearModelUpload, loadModelUpload } from "@/lib/model-store"

// APK 移植：动画/音频全部走本地打包资源（out/animations、out/audio），
// 离线可用，不再依赖 assets.reze.one CDN（移动网络下不可达）。
const ASSETS = ""

export const MODEL_PATH = "/models/reze/reze.pmx"
export const VMD_PATH = `${ASSETS}/animations/Classic.vmd`
export const CAMERA_VMD_PATH = `${ASSETS}/animations/Classic_camera.vmd`
export const MORPH_VMD_PATH = `${ASSETS}/animations/Classic_morph.vmd`
export const AUDIO_PATH = `${ASSETS}/audio/Classic.mp3`
export const STUDIO_ANIM_NAME = "studio"
export const BUNDLED_PMX_FILENAME = MODEL_PATH.replace(/^.*\//, "") || "model.pmx"

function hexToLinear(hex: string): Vec3 {
  const n = parseInt(hex.replace("#", ""), 16)
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  return new Vec3(lin(((n >> 16) & 0xff) / 255), lin(((n >> 8) & 0xff) / 255), lin((n & 0xff) / 255))
}

function sunDirection(azimuth: number, elevation: number): Vec3 {
  const az = (azimuth * Math.PI) / 180
  const el = (elevation * Math.PI) / 180
  return new Vec3(-Math.cos(el) * Math.sin(az), -Math.sin(el), -Math.cos(el) * Math.cos(az))
}

const LOOK = {
  world: { color: hexToLinear("#ed6aff"), strength: 0.4 },
  sun: { color: hexToLinear("#ffffff"), strength: 0.5, direction: sunDirection(205, 21) },
  bloom: { enabled: true, threshold: 0.7, scatter: 0.8, intensity: 0.6, color: hexToLinear("#ffc9c9") },
}

const NO = ["false", "0", "off", "no"]
const USE_DEFAULT_ASSETS = !NO.includes((process.env.NEXT_PUBLIC_USE_DEFAULT_ASSETS ?? "").trim().toLowerCase())

export function fileStem(pathOrName: string): string {
  const base = pathOrName.replace(/^.*[/\\]/, "")
  const i = base.lastIndexOf(".")
  return (i > 0 ? base.slice(0, i) : base).trim() || "clip"
}

export function sanitizeClipFilenameBase(name: string): string {
  const s = name.trim() || "clip"
  const cleaned = s.replace(/[/\\<>:"|?*\x00-\x1f]/g, "-").replace(/-+/g, "-")
  return cleaned.slice(0, 120).replace(/^-|-$/g, "") || "clip"
}

interface EngineBridgeProps {
  canvasRef: RefObject<HTMLCanvasElement | null>
  engineRef: RefObject<Engine | null>
  modelRef: RefObject<Model | null>
  loadedModelNameRef: RefObject<string>
  revealBoneInListRef: RefObject<((bone: string) => void) | null>
  currentFrameRef: RefObject<number>
  playheadDrawRef: RefObject<((frame: number) => void) | null>
  setTimelineView: Dispatch<SetStateAction<StoredTimelineView | undefined>>
  setSelectedGroup: Dispatch<SetStateAction<string>>
  setRightPanelTab: Dispatch<SetStateAction<"properties" | "materials">>
  setTimelineTab: Dispatch<SetStateAction<string>>
  setPmxBoneNames: Dispatch<SetStateAction<ReadonlySet<string>>>
  setModelBoneOrder: Dispatch<SetStateAction<string[]>>
  setMorphNames: Dispatch<SetStateAction<string[]>>
  setMaterialNames: Dispatch<SetStateAction<string[]>>
  setEngineError: Dispatch<SetStateAction<string | null>>
  setStudioReady: Dispatch<SetStateAction<boolean>>
  onFreshBoot?: () => void
}

export function EngineBridge({
  canvasRef,
  engineRef,
  modelRef,
  loadedModelNameRef,
  revealBoneInListRef,
  currentFrameRef,
  playheadDrawRef,
  setTimelineView,
  setSelectedGroup,
  setRightPanelTab,
  setTimelineTab,
  setPmxBoneNames,
  setModelBoneOrder,
  setMorphNames,
  setMaterialNames,
  setEngineError,
  setStudioReady,
  onFreshBoot,
}: EngineBridgeProps) {
  const clip = useStudioSelector((s) => s.clip)
  const toEngineClip = useEngineClip()
  const activeOffset = useActiveOffset()
  const activeOffsetRef = useRef(activeOffset)
  activeOffsetRef.current = activeOffset
  const selectedBone = useStudioSelector((s) => s.selectedBone)
  const selectedMaterial = useStudioSelector((s) => s.selectedMaterial)
  const gizmoVisible = useStudioSelector((s) => s.gizmoVisible)
  const cameraTrack = useStudioSelector((s) => s.cameraTrack)
  const cameraVmdEnabled = useStudioSelector((s) => s.cameraVmdEnabled)
  const {
    commit,
    replaceClip,
    openClip,
    restoreLibrary,
    setClipDisplayName,
    setSelectedBone,
    setSelectedMorph,
    setSelectedMaterial,
    setGizmoVisible,
    setSelectedKeyframes,
    setIkEnabled,
    replaceCameraTrack,
    setCameraSelected,
  } = useStudioActions()
  const { currentFrame, setCurrentFrame, playing, setPlaying } = usePlayback()
  const playbackFrameRef = usePlaybackFrameRef()
  const { setPmxFileName: setStatusPmxFileName, setFps: setStatusFps } = useStudioStatusActions()

  const engineClip = useMemo(() => toEngineClip(clip ?? emptyStudioClip()), [clip, toEngineClip])
  const loadedBonesRef = useRef<ReadonlySet<string>>(new Set())
  const lastCameraFrame = cameraTrack.length > 0 ? cameraTrack[cameraTrack.length - 1].frame : 0
  const frameCount = Math.max(engineClip?.frameCount ?? clip?.frameCount ?? 0, lastCameraFrame)

  const clipRef = useRef<AnimationClip | null>(clip)
  useEffect(() => {
    clipRef.current = clip
  }, [clip])
  const dragDirtyRef = useRef(false)
  const toEngineClipRef = useRef(toEngineClip)
  toEngineClipRef.current = toEngineClip

  const playRef = useRef(false)
  const lastFpsRef = useRef<number | null>(null)

  const RESET_PHYSICS_FRAME_THRESHOLD = 2
  const physicsResetRafRef = useRef<number | null>(null)
  const lastSeekFrameRef = useRef<number | null>(null)

  const maybeResetPhysicsAfterSeek = useCallback(
    (frame: number) => {
      const prev = lastSeekFrameRef.current
      lastSeekFrameRef.current = frame
      if (prev !== null && Math.abs(frame - prev) <= RESET_PHYSICS_FRAME_THRESHOLD) return
      if (physicsResetRafRef.current !== null) cancelAnimationFrame(physicsResetRafRef.current)
      physicsResetRafRef.current = requestAnimationFrame(() => {
        physicsResetRafRef.current = null
        engineRef.current?.resetPhysics()
      })
    },
    [engineRef],
  )

  useEffect(() => {
    return () => {
      if (physicsResetRafRef.current !== null) cancelAnimationFrame(physicsResetRafRef.current)
      physicsResetRafRef.current = null
    }
  }, [])

  const handleRaycast = useCallback(
    (modelName: string, _material: string | null, bone: string | null, _screenX: number, _screenY: number) => {
      if (!modelName) {
        setGizmoVisible(false)
        return
      }
      setSelectedBone(bone)
      if (bone) setGizmoVisible(true)
      setSelectedMorph(null)
      setSelectedMaterial(null)
      setSelectedKeyframes([])
      if (bone) revealBoneInListRef.current?.(bone)
    },
    [setSelectedBone, setSelectedMorph, setSelectedMaterial, setGizmoVisible, setSelectedKeyframes, revealBoneInListRef],
  )

  const handleGizmoDrag = useCallback(
    (e: GizmoDragEvent) => {
      const model = modelRef.current
      const clip = clipRef.current
      if (!model || !clip) return

      if (e.phase === "start") {
        dragDirtyRef.current = false
        setSelectedBone(e.boneName)
        setSelectedMorph(null)
        setSelectedMaterial(null)
        setSelectedKeyframes([])
        return
      }

      const frame = Math.round(Math.max(0, Math.min(clip.frameCount, playbackFrameRef.current - activeOffsetRef.current)))
      const bone = e.boneName
      const track = clip.boneTracks.get(bone) ?? []
      const atKey = track.find((k) => k.frame === frame)

      if (atKey) {
        if (e.kind === "rotate") atKey.rotation = e.localRotation
        else atKey.translation = e.localTranslation
      } else {
        model.loadClip(STUDIO_ANIM_NAME, toEngineClipRef.current(clip))
        model.seek(frame / 30)
        const pose = readLocalPoseAfterSeek(model, bone)
        if (!pose) return
        const rotation = e.kind === "rotate" ? e.localRotation : pose.rotation
        const translation = e.kind === "translate" ? e.localTranslation : pose.translation
        if (!clip.boneTracks.has(bone)) clip.boneTracks.set(bone, track)
        track.push({
          boneName: bone,
          frame,
          rotation,
          translation,
          interpolation: interpolationTemplateForFrame(track, frame),
        })
        track.sort((a, b) => a.frame - b.frame)
      }

      model.loadClip(STUDIO_ANIM_NAME, toEngineClipRef.current(clip))
      model.seek(frame / 30)

      if (e.phase === "end") {
        if (dragDirtyRef.current) {
          commit({ ...clip, boneTracks: new Map(clip.boneTracks) })
        }
        dragDirtyRef.current = false
      } else {
        dragDirtyRef.current = true
      }
    },
    [commit, modelRef, playbackFrameRef, setSelectedBone, setSelectedMorph, setSelectedMaterial, setSelectedKeyframes],
  )

  const handleRaycastRef = useRef(handleRaycast)
  const handleGizmoDragRef = useRef(handleGizmoDrag)
  useEffect(() => {
    handleRaycastRef.current = handleRaycast
  }, [handleRaycast])
  useEffect(() => {
    handleGizmoDragRef.current = handleGizmoDrag
  }, [handleGizmoDrag])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    engine.setSelectedBone(loadedModelNameRef.current, gizmoVisible ? selectedBone : null)
  }, [selectedBone, gizmoVisible, engineRef, loadedModelNameRef])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    engine.setSelectedMaterial(loadedModelNameRef.current, selectedMaterial)
  }, [selectedMaterial, engineRef, loadedModelNameRef])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    engine.loadCameraClip([...cameraTrack])
    engine.setCameraVmdEnabled(cameraVmdEnabled)
  }, [cameraTrack, cameraVmdEnabled, engineRef])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const el = canvas
    let disposed = false
    let renderSizeObserver: ResizeObserver | null = null

    async function initEngine() {
      try {
        const engine = new Engine(el, {
          camera: { distance: 31.5, target: new Vec3(0, 11.5, 0) },
          ...LOOK,
          onRaycast: (modelName, material, bone, screenX, screenY) =>
            handleRaycastRef.current(modelName, material, bone, screenX, screenY),
          onGizmoDrag: (event) => handleGizmoDragRef.current(event),
        })
        await engine.init()
        if (disposed) return
        ;(engine as unknown as { camera: { panSensitivity: number } }).camera.panSensitivity = 0.0004
        engine.addGround({ diffuseColor: new Vec3(0.05, 0.04, 0.06) })

        // APK 移植：移动端渲染分辨率上限。WebGPU 渲染成本 ≈ 像素 × MSAA，
        // 高 DPR 设备（dpr≈3）按 CSS×dpr 全分辨率渲染是"延迟感强"的主要来源。
        // 钉住 CSS 尺寸 × min(dpr, 2)：桌面端 dpr≤2 不受影响，移动端渲染量
        // 至多降到全分辨率的 ~44%（3→2），画面由浏览器放大，观感损失小。
        const capDpr = Math.min(window.devicePixelRatio || 1, 2)
        const applyRenderSize = () => {
          if (disposed || !el.isConnected) return
          try {
            engine.setRenderSize(Math.max(1, Math.floor(el.clientWidth * capDpr)), Math.max(1, Math.floor(el.clientHeight * capDpr)))
          } catch {
          }
        }
        applyRenderSize()
        renderSizeObserver = new ResizeObserver(applyRenderSize)
        renderSizeObserver.observe(el)

        lastFpsRef.current = null
        engine.runRenderLoop(() => {
          const fps = engine.getStats().fps
          if (fps === lastFpsRef.current) return
          lastFpsRef.current = fps
          setStatusFps(fps > 0 ? fps : null)
        })

        async function installModelIntoUi(instanceKey: string, model: Model, statusFileName: string) {
          const sk = model.getSkeleton().bones.map((b) => b.name)
          setPmxBoneNames(new Set(sk))
          setModelBoneOrder(sk)
          setMorphNames(model.getMorphing().morphs.map((m) => m.name))
          const materialNames = model.getMaterials().map((m) => m.name)
          setMaterialNames(materialNames)
          setStatusPmxFileName(statusFileName)
          await engine.autoStyleGroups(instanceKey, autoClassifyMaterials(materialNames))
        }

        let restoredStem: string | null = null
        const storedModel = await loadModelUpload()
        if (disposed) return

        if (storedModel) {
          const instanceKey = `u_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`
          try {
            const model = await engine.loadModel(instanceKey, { files: storedModel.files, pmxFile: storedModel.pmxFile })
            if (disposed) return
            engine.setModelTransform(instanceKey, { visible: false })
            model.setName(storedModel.stem)
            modelRef.current = model
            loadedModelNameRef.current = instanceKey
            const statusFileName = storedModel.pmxFile.name.split("/").pop() || storedModel.pmxFile.name
            await installModelIntoUi(instanceKey, model, statusFileName)
            if (disposed) return
            engine.setModelTransform(instanceKey, { visible: true })
            restoredStem = storedModel.stem
          } catch (e) {
            console.warn("[boot] stored model failed to load — falling back to the bundled default", e)
            void clearModelUpload()
          }
        }

        if (!modelRef.current && USE_DEFAULT_ASSETS) try {
          const model = await engine.loadModel("reze", MODEL_PATH)
          if (disposed) return
          engine.setModelTransform("reze", { visible: false })
          modelRef.current = model
          await installModelIntoUi("reze", model, BUNDLED_PMX_FILENAME)
          if (disposed) return
          engine.setModelTransform("reze", { visible: true })
        } catch {
          setEngineError(`Add model at public${MODEL_PATH}`)
        }

        const draft = await loadDraft()
        if (disposed) return
        const model = modelRef.current
        if (draft && model) {
          try {
            const boneSet = new Set(model.getSkeleton().bones.map((b) => b.name))
            const morphSet = new Set(model.getMorphing().morphs.map((m) => m.name))
            const materialSet = new Set(model.getMaterials().map((m) => m.name))
            const restored = draft.library.map((e) => ({
              ...e,
              clip: clipRetainedForModel(e.clip, boneSet, morphSet),
            }))
            restoreLibrary(restored, draft.tracks, draft.activeClipId)
            const active = restored.find((e) => e.id === draft.activeClipId) ?? restored[0] ?? null
            if (active) model.loadClip(STUDIO_ANIM_NAME, active.clip)
            model.show(STUDIO_ANIM_NAME)
            const restoredFrame = Math.min(Math.max(0, draft.currentFrame ?? 0), Math.max(0, active?.clip.frameCount ?? 0))
            model.seek(restoredFrame / 30)
            setCurrentFrame(restoredFrame)
            lastSeekFrameRef.current = restoredFrame
            setSelectedBone(draft.selectedBone && boneSet.has(draft.selectedBone) ? draft.selectedBone : null)
            setSelectedMorph(draft.selectedMorph && morphSet.has(draft.selectedMorph) ? draft.selectedMorph : null)
            setSelectedMaterial(
              draft.selectedMaterial && materialSet.has(draft.selectedMaterial) ? draft.selectedMaterial : null,
            )
            setSelectedGroup(draft.selectedGroup ?? "All Bones")
            setRightPanelTab(draft.rightPanelTab ?? "properties")
            setTimelineTab(draft.timelineTab ?? "allRot")
            setIkEnabled(draft.ikEnabled ?? true)
            setSelectedKeyframes(
              (draft.selectedKeyframes ?? []).filter((s) => s.type !== "curve" || !s.bone || boneSet.has(s.bone)),
            )
            if (draft.camera) {
              engine.setCameraAlpha(draft.camera.alpha)
              engine.setCameraBeta(draft.camera.beta)
              engine.setCameraDistance(draft.camera.distance)
            }
            setCameraSelected(draft.cameraSelected === true && (draft.cameraTrack?.length ?? 0) > 0)
            if (draft.cameraTrack?.length) {
              replaceCameraTrack(
                draft.cameraTrack.map((kf) => ({
                  ...kf,
                  target: new Vec3(kf.target.x, kf.target.y, kf.target.z),
                  rotation: new Vec3(kf.rotation.x, kf.rotation.y, kf.rotation.z),
                  interpolation: kf.interpolation ? new Uint8Array(kf.interpolation) : undefined,
                })),
              )
            }
            if (draft.timelineView) setTimelineView(draft.timelineView)
            requestAnimationFrame(() => engine.resetPhysics())
          } catch (e) {
            console.warn("[boot] stored draft failed to restore", e)
          }
        } else if (restoredStem === null) {
          try {
            await model?.loadVmd(STUDIO_ANIM_NAME, VMD_PATH)
            if (disposed) return
            const c = model?.getClip(STUDIO_ANIM_NAME)
            if (c) {
              openClip(sanitizeClipFilenameBase(fileStem(VMD_PATH)), c)
              model?.show(STUDIO_ANIM_NAME)
              model?.seek(0)
              lastSeekFrameRef.current = 0
              requestAnimationFrame(() => engine.resetPhysics())
            }
          } catch (e) {
            console.warn(`VMD load failed — add file at public${VMD_PATH}`, e)
          }
          try {
            await model?.loadVmd(STUDIO_ANIM_NAME, MORPH_VMD_PATH, { tracks: "morphs" })
            if (disposed) return
            const withMorphs = model?.getClip(STUDIO_ANIM_NAME)
            if (withMorphs) replaceClip(withMorphs)
          } catch (e) {
            console.warn(`Morph VMD load failed — add file at public${MORPH_VMD_PATH}`, e)
          }
          try {
            const camFrames = await VMDLoader.loadCamera(CAMERA_VMD_PATH)
            if (disposed) return
            if (camFrames.length > 0) replaceCameraTrack(camFrames)
          } catch (e) {
            console.warn(`Camera VMD load failed — add file at public${CAMERA_VMD_PATH}`, e)
          }
          onFreshBoot?.()
        } else if (model) {
          const fresh = emptyStudioClip()
          model.loadClip(STUDIO_ANIM_NAME, fresh)
          openClip(sanitizeClipFilenameBase(restoredStem), fresh)
          model.show(STUDIO_ANIM_NAME)
          model.seek(0)
          lastSeekFrameRef.current = 0
        }

        setStudioReady(true)
        engineRef.current = engine
      } catch (e) {
        console.error(e)
        setEngineError(e instanceof Error ? e.message : String(e))
      }
    }

    void initEngine()

    return () => {
      disposed = true
      renderSizeObserver?.disconnect()
      renderSizeObserver = null
      setStudioReady(false)
      setModelBoneOrder([])
      setPmxBoneNames(new Set())
      setMorphNames([])
      setMaterialNames([])
      setSelectedBone(null)
      setSelectedMorph(null)
      setSelectedMaterial(null)
      setStatusPmxFileName("—")
      setStatusFps(null)
      lastFpsRef.current = null
      modelRef.current = null
      engineRef.current?.stopRenderLoop()
      engineRef.current?.dispose()
      engineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const model = modelRef.current
    if (!model || !engineClip) return
    const next = new Set(engineClip.boneTracks.keys())
    let dropped = false
    for (const name of loadedBonesRef.current) {
      if (!next.has(name)) {
        dropped = true
        break
      }
    }
    loadedBonesRef.current = next
    if (dropped) model.resetAllBones()
    model.loadClip(STUDIO_ANIM_NAME, engineClip)
    const f = Math.max(0, currentFrameRef.current)
    model.seek(f / 30)
    maybeResetPhysicsAfterSeek(f)
  }, [engineClip, currentFrameRef, modelRef, maybeResetPhysicsAfterSeek])

  useLayoutEffect(() => {
    const model = modelRef.current
    if (!model || !clip) return
    if (!playing) {
      const f = Math.max(0, currentFrame)
      model.seek(f / 30)
      maybeResetPhysicsAfterSeek(f)
    }
  }, [currentFrame, clip, playing, modelRef, maybeResetPhysicsAfterSeek])

  useEffect(() => {
    const model = modelRef.current
    if (!model || !clip) return
    if (playing) {
      let startFrame = currentFrameRef.current
      if (startFrame >= frameCount) {
        startFrame = 0
        setCurrentFrame(0)
      }
      const f = Math.max(0, startFrame)
      model.seek(f / 30)
      maybeResetPhysicsAfterSeek(f)
      model.play()
    } else {
      model.pause()
    }
  }, [playing, clip, frameCount, setCurrentFrame, currentFrameRef, modelRef, maybeResetPhysicsAfterSeek])

  useEffect(() => {
    setCurrentFrame((c) => Math.min(c, frameCount))
  }, [frameCount, setCurrentFrame])

  useEffect(() => {
    playRef.current = playing
    if (!playing) return
    if (frameCount <= 0) return
    const model = modelRef.current
    if (!model) return
    let raf: number
    const tick = () => {
      if (!playRef.current) return
      const m = modelRef.current
      if (!m) return
      const progress = m.getAnimationProgress()
      const frame = progress.current * 30
      if (frame >= frameCount) {
        currentFrameRef.current = frameCount
        lastSeekFrameRef.current = frameCount
        setCurrentFrame(frameCount)
        setPlaying(false)
        return
      }
      currentFrameRef.current = frame
      playheadDrawRef.current?.(frame)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      lastSeekFrameRef.current = currentFrameRef.current
      setCurrentFrame(currentFrameRef.current)
    }
  }, [playing, frameCount, setCurrentFrame, setPlaying, currentFrameRef, modelRef, playheadDrawRef])

  return null
}
