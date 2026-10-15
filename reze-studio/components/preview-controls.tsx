"use client"

/**
 * PreviewControls —— APK 移植：预览窗口右下角 MMD 式操纵面板。
 *
 * 六个键：移动 X/Y/Z、旋转 X/Y/Z。按住任一键进入激活态（高亮），
 * 在屏幕上向上拖动 = +（增大），向下拖动 = -（减小），松手停止。
 * 拖动距离 → 增量回调给上层（移动按 0.01 单位/px，旋转按 0.25°/px）。
 */

import { useCallback, useRef, useState } from "react"

export type MoveAxis = "x" | "y" | "z"

interface Props {
  /** 当前选中的骨骼名（无选中时按键置灰）。 */
  selectedBone: string | null
  onTranslate: (axis: MoveAxis, delta: number) => void
  onRotate: (axis: MoveAxis, delta: number) => void
}

interface ActiveDrag {
  axis: MoveAxis
  kind: "move" | "rotate"
  pointerId: number
  lastY: number
  acc: number
}

const MOVE_PX = 0.01 // 每像素 0.01 模型单位
const ROT_DEG_PX = 0.25 // 每像素 0.25°

export function PreviewControls({ selectedBone, onTranslate, onRotate }: Props) {
  const [active, setActive] = useState<{ kind: "move" | "rotate"; axis: MoveAxis } | null>(null)
  const dragRef = useRef<ActiveDrag | null>(null)

  const startDrag = useCallback(
    (kind: "move" | "rotate", axis: MoveAxis) => (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!selectedBone) return
      e.preventDefault()
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      dragRef.current = { axis, kind, pointerId: e.pointerId, lastY: e.clientY, acc: 0 }
      setActive({ kind, axis })
    },
    [selectedBone],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current
      if (!d || e.pointerId !== d.pointerId) return
      const dy = e.clientY - d.lastY
      d.lastY = e.clientY
      if (dy === 0) return
      d.acc += dy
      // 累积满 1px 才回调一次，避免每帧小数点抖动
      const whole = Math.trunc(d.acc)
      if (whole === 0) return
      d.acc -= whole
      if (d.kind === "move") onTranslate(d.axis, -whole * MOVE_PX)
      else onRotate(d.axis, -whole * ROT_DEG_PX * (Math.PI / 180))
    },
    [onTranslate, onRotate],
  )

  const endDrag = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d || e.pointerId !== d.pointerId) return
    dragRef.current = null
    setActive(null)
  }, [])

  const Key = ({
    kind,
    axis,
    label,
    sub,
  }: {
    kind: "move" | "rotate"
    axis: MoveAxis
    label: string
    sub: string
  }) => {
    const isActive = active?.kind === kind && active.axis === axis
    const disabled = !selectedBone
    return (
      <button
        type="button"
        disabled={disabled}
        onPointerDown={startDrag(kind, axis)}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={[
          "flex h-11 w-11 select-none flex-col items-center justify-center rounded-md border text-[10px] font-medium leading-tight transition-colors touch-none",
          disabled
            ? "border-line/40 bg-black/30 text-muted-foreground/40"
            : isActive
              ? "border-primary bg-primary/80 text-primary-foreground shadow-lg shadow-primary/30"
              : "border-line-strong bg-black/45 text-foreground backdrop-blur-sm hover:bg-black/60 active:scale-95",
        ].join(" ")}
      >
        <span className="text-[8px] uppercase opacity-70">{sub}</span>
        <span className="text-[11px]">{label}</span>
      </button>
    )
  }

  return (
    <div
      className="pointer-events-auto flex flex-col gap-1.5 rounded-lg border border-line-strong/60 bg-black/35 p-1.5 backdrop-blur-sm"
      onPointerUp={endDrag}
    >
      <div className="flex items-center gap-1">
        <span className="w-4 text-center text-[9px] uppercase text-muted-foreground/70">移动</span>
        <Key kind="move" axis="x" sub="X" label="移" />
        <Key kind="move" axis="y" sub="Y" label="移" />
        <Key kind="move" axis="z" sub="Z" label="移" />
      </div>
      <div className="flex items-center gap-1">
        <span className="w-4 text-center text-[9px] uppercase text-muted-foreground/70">旋转</span>
        <Key kind="rotate" axis="x" sub="X" label="旋" />
        <Key kind="rotate" axis="y" sub="Y" label="旋" />
        <Key kind="rotate" axis="z" sub="Z" label="旋" />
      </div>
    </div>
  )
}
