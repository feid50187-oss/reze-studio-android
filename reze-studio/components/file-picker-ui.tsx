"use client"

/**
 * FilePickerUI —— APK 移植：应用内文件浏览器（React 版）。
 *
 * 参考 MikuPlayReburn 的 FilePickerUI 设计：遮罩层 + 路径栏 + 返回上一级 +
 * 文件/文件夹列表（类型图标、名称、大小）+ 过滤 + 防抖选择。
 *
 * 两种模式：
 * - selectFile（默认）：点文件即回调；点文件夹进入。
 * - selectDirectory：点文件夹进入；底部按钮"选择此目录"回调当前目录（保存用）。
 *
 * 悬浮于主界面之上，点击遮罩空白处或关闭按钮即消失，不占用主窗口布局。
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { FileItem, FilePicker, ROOT_PATH, isNativeApp } from "@/lib/file-picker"

export type FilePickerMode = "selectFile" | "selectDirectory"

interface Props {
  open: boolean
  title?: string
  /** 扩展名过滤（如 ["pmx"]）。默认不过滤。 */
  filter?: string[]
  mode?: FilePickerMode
  onSelectFile?: (file: FileItem) => void
  onSelectDirectory?: (path: string) => void
  onClose: () => void
}

const EXT_ICONS: Record<string, string> = {
  pmx: "🧊",
  pmd: "🧊",
  bpmx: "🧊",
  vmd: "🎞️",
  png: "🖼️",
  jpg: "🖼️",
  jpeg: "🖼️",
  bmp: "🖼️",
  tga: "🖼️",
  mp3: "🎵",
  wav: "🎵",
}

export function FilePickerUI({
  open,
  title = "选择文件",
  filter,
  mode = "selectFile",
  onSelectFile,
  onSelectDirectory,
  onClose,
}: Props) {
  const picker = useMemo(() => FilePicker.getInstance(), [])
  const [path, setPath] = useState(ROOT_PATH)
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [permDenied, setPermDenied] = useState(false)
  const selectingRef = useRef(false)

  // 打开时：应用过滤 → 检查权限 → 加载根目录
  useEffect(() => {
    if (!open) return
    if (filter) picker.setFileFilter(filter)
    else picker.clearFileFilter()
    setError(null)
    setPermDenied(false)

    const boot = async () => {
      if (!isNativeApp()) {
        setError("请在浏览器中使用" + (filter?.[0] ?? "文件") + "上传，或使用 APK 版本的文件浏览器。")
        return
      }
      setLoading(true)
      try {
        const has = await picker.checkPermissions()
        if (!has) {
          const granted = await picker.requestPermissions()
          if (!granted) {
            setPermDenied(true)
            return
          }
        }
        const list = await picker.listFiles()
        setFiles(list)
        setPath(picker.getCurrentPath())
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载文件列表失败")
      } finally {
        setLoading(false)
      }
    }
    void boot()
  }, [open, filter, picker])

  if (!open) return null

  const navigate = async (dir: string) => {
    setLoading(true)
    setError(null)
    try {
      const list = await picker.navigateTo(dir)
      setFiles(list)
      setPath(picker.getCurrentPath())
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法打开此文件夹")
    } finally {
      setLoading(false)
    }
  }

  const goUp = async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await picker.navigateUp()
      if (list) {
        setFiles(list)
        setPath(picker.getCurrentPath())
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法返回上一级")
    } finally {
      setLoading(false)
    }
  }

  const selectFile = (file: FileItem) => {
    if (selectingRef.current) return
    selectingRef.current = true
    onSelectFile?.(file)
    onClose()
    setTimeout(() => {
      selectingRef.current = false
    }, 600)
  }

  const icon = (f: FileItem) => {
    if (f.isDirectory) return "📁"
    const ext = f.extension?.toLowerCase()
    if (ext && EXT_ICONS[ext]) return EXT_ICONS[ext]
    return "📄"
  }

  const sizeText = (f: FileItem) => {
    if (f.isDirectory) return "文件夹"
    if (!f.size) return ""
    if (f.size < 1024) return `${f.size} B`
    if (f.size < 1024 * 1024) return `${(f.size / 1024).toFixed(1)} KB`
    return `${(f.size / 1024 / 1024).toFixed(1)} MB`
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex h-[70vh] w-[min(92vw,560px)] flex-col overflow-hidden rounded-xl border border-line-strong bg-surface shadow-2xl">
        {/* 标题栏 */}
        <div className="flex shrink-0 items-center justify-between border-b border-line px-3 py-2">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          <button
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={onClose}
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {/* 路径栏 */}
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-1.5">
          <button
            className="shrink-0 rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
            onClick={goUp}
            disabled={path === ROOT_PATH || loading}
          >
            ← 返回
          </button>
          <div className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/80">{path}</div>
          {mode === "selectDirectory" && (
            <button
              className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
              disabled={loading}
              onClick={() => {
                onSelectDirectory?.(path)
                onClose()
              }}
            >
              选择此目录
            </button>
          )}
        </div>

        {/* 文件列表 */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {permDenied ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="text-3xl">🔒</div>
              <p className="text-sm text-muted-foreground">
                需要"全部文件访问权"才能浏览模型文件夹。
                <br />
                请在系统设置中为本应用授予"所有文件访问权限"后重试。
              </p>
              <button
                className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground"
                onClick={async () => {
                  setLoading(true)
                  try {
                    const granted = await picker.requestPermissions()
                    if (granted) {
                      setPermDenied(false)
                      setFiles(await picker.listFiles())
                      setPath(picker.getCurrentPath())
                    }
                  } finally {
                    setLoading(false)
                  }
                }}
              >
                去授权
              </button>
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">{error}</div>
          ) : loading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">加载中…</div>
          ) : files.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">此文件夹为空</div>
          ) : (
            files.map((f) => (
              <button
                key={f.path}
                className="flex w-full items-center gap-2.5 border-b border-line/40 px-3 py-2 text-left hover:bg-accent/60"
                onClick={() => (f.isDirectory ? void navigate(f.path) : selectFile(f))}
              >
                <span className="text-base leading-none">{icon(f)}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{f.name}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{sizeText(f)}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
