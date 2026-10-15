"use client"

/**
 * FilePicker —— APK 移植：自建文件管理器的前端单例。
 *
 * 参考 MikuPlayReburn 的 FilePicker 模块：跨平台文件浏览/选择。
 * - Android（Capacitor）：走原生 FilePickerPlugin（listFiles/getParentPath/readFile，
 *   根路径 /storage/emulated/0，MANAGE_EXTERNAL_STORAGE 全部文件访问权）。
 * - Web：保持浏览器原有 folder/file input 流程（由上层组件决定），此处只做
 *   平台判定与原生分支。
 *
 * 文件被选中后，用 Capacitor.convertFileSrc(path) 转成 http://localhost/_capacitor_file_/
 * 形式的本地服务 URL，交给 reze-engine 按 URL 加载（PMX 内贴图相对路径会自动
 * 从同目录解析），零预读、按需加载。
 */

import { Capacitor, registerPlugin } from "@capacitor/core"

export interface FileItem {
  name: string
  path: string
  isDirectory: boolean
  size?: number
  lastModified?: number
  extension?: string
  mimeType?: string
}

export interface FilePickerPlugin {
  checkPermissions(): Promise<{ granted: boolean }>
  requestPermissions(): Promise<{ granted: boolean }>
  listFiles(options: { path: string }): Promise<{ files: FileItem[] }>
  getParentPath(options: { path: string }): Promise<{ parentPath: string }>
  readFile(options: { path: string }): Promise<{ data: string; mimeType: string }>
}

const FilePickerPlugin = registerPlugin<FilePickerPlugin>("FilePicker")

/** Android 用户主存储根。 */
export const ROOT_PATH = "/storage/emulated/0"

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false
  return !!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
}

/** 将文件系统路径转成本地服务 URL（仅原生平台有效）。 */
export function filePathToUrl(filePath: string): string {
  return Capacitor.convertFileSrc(filePath)
}

export class FilePicker {
  private static instance: FilePicker
  private currentPath: string = ROOT_PATH
  private fileFilter: string[] = []
  private enableFilter: boolean = false

  private constructor() {}

  static getInstance(): FilePicker {
    if (!FilePicker.instance) FilePicker.instance = new FilePicker()
    return FilePicker.instance
  }

  /** 判断当前是否为原生（Android）平台。 */
  private isNative(): boolean {
    return isNativeApp()
  }

  setFileFilter(extensions: string[]): void {
    this.fileFilter = extensions
    this.enableFilter = true
  }

  enableFileFilter(enable: boolean): void {
    this.enableFilter = enable
  }

  clearFileFilter(): void {
    this.fileFilter = []
    this.enableFilter = false
  }

  getCurrentPath(): string {
    return this.currentPath
  }

  isRootPath(): boolean {
    return this.currentPath === ROOT_PATH
  }

  async checkPermissions(): Promise<boolean> {
    if (!this.isNative()) return true
    try {
      const r = await FilePickerPlugin.checkPermissions()
      return r.granted
    } catch {
      return false
    }
  }

  async requestPermissions(): Promise<boolean> {
    if (!this.isNative()) return true
    try {
      const r = await FilePickerPlugin.requestPermissions()
      return r.granted
    } catch {
      return false
    }
  }

  /** 列出当前（或指定）目录下的文件与文件夹。 */
  async listFiles(path?: string): Promise<FileItem[]> {
    const targetPath = path || this.currentPath
    if (!this.isNative()) return []
    try {
      const r = await FilePickerPlugin.listFiles({ path: targetPath })
      let files = r.files
      if (this.enableFilter && this.fileFilter.length > 0) {
        const allowed = this.fileFilter.map((e) => e.toLowerCase())
        files = files.filter((f) => f.isDirectory || (f.extension?.toLowerCase() && allowed.includes(f.extension.toLowerCase())))
      }
      // 目录优先，其次按名称排序
      files = [...files].sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      this.currentPath = targetPath
      return files
    } catch {
      return []
    }
  }

  /** 进入子目录。 */
  async navigateTo(path: string): Promise<FileItem[]> {
    this.currentPath = path
    return this.listFiles(path)
  }

  /** 返回上一级；已在根路径返回 null。 */
  async navigateUp(): Promise<FileItem[] | null> {
    if (this.isRootPath()) return null
    try {
      const r = await FilePickerPlugin.getParentPath({ path: this.currentPath })
      this.currentPath = r.parentPath
      return this.listFiles(this.currentPath)
    } catch {
      return null
    }
  }

  /** 读取文件内容为 base64（保存 VMD 时写盘用，或贴图缺失排查）。 */
  async readFileAsBase64(path: string): Promise<string> {
    const r = await FilePickerPlugin.readFile({ path })
    return r.data
  }
}
