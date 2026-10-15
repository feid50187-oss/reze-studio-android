"use client"

/**
 * APK 移植：从手机文件系统的任意文件夹载入 MMD 模型（PMX + 贴图）。
 * 依赖 Android 的"全部文件访问权"（MANAGE_EXTERNAL_STORAGE，由 MainActivity
 * 启动时引导授予）。读回的每个文件被包装成 `File` 并写入 `webkitRelativePath`
 * ——这正是 reze-engine `fileListToMap` 匹配贴图所用的字段，可直接复用现有
 * `loadPmxFromFolder(files, pmxFile)` 加载链路。
 */

import { Filesystem } from "@capacitor/filesystem"

export const DEFAULT_MODEL_FOLDER = "/storage/emulated/0/Download"

export async function readModelFolderRecursive(rootPath: string): Promise<File[]> {
  const normalizedRoot = rootPath.replace(/\/+$/, "")
  const out: File[] = []
  const seen = new Set<string>()

  const walk = async (dir: string) => {
    let listing
    try {
      listing = await Filesystem.readdir({ path: dir })
    } catch (e) {
      throw new Error(`无法读取文件夹：${dir}（${e instanceof Error ? e.message : String(e)}）`)
    }
    for (const entry of listing.files) {
      const full = `${dir.replace(/\/+$/, "")}/${entry.name}`
      if (seen.has(full)) continue
      if (entry.type === "directory") {
        seen.add(full)
        await walk(full)
        continue
      }
      let data
      try {
        data = await Filesystem.readFile({ path: full })
      } catch {
        continue
      }
      const bytes =
        typeof data.data === "string"
          ? base64ToBytes(data.data)
          : new Uint8Array(await (data.data as Blob).arrayBuffer())
      const rel = full.slice(normalizedRoot.length).replace(/^\/+/, "")
      const file = new File([bytes.buffer as ArrayBuffer], entry.name, { type: "application/octet-stream" })
      try {
        Object.defineProperty(file, "webkitRelativePath", { value: rel, configurable: true })
      } catch {
      }
      out.push(file)
    }
  }

  await walk(normalizedRoot)
  out.sort((a, b) =>
    ((a as File & { webkitRelativePath?: string }).webkitRelativePath || a.name).localeCompare(
      (b as File & { webkitRelativePath?: string }).webkitRelativePath || b.name,
    ),
  )
  return out
}

export function findPmxFileInList(files: File[]): File | null {
  const list = files.filter((f) => f.name.toLowerCase().endsWith(".pmx"))
  if (list.length === 0) return null
  list.sort((a, b) =>
    ((a as File & { webkitRelativePath?: string }).webkitRelativePath || a.name).localeCompare(
      (b as File & { webkitRelativePath?: string }).webkitRelativePath || b.name,
    ),
  )
  return list[0] ?? null
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof atob === "function") {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
  }
  const buf = Buffer.from(b64, "base64")
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
}
