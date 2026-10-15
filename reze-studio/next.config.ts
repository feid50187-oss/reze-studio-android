import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: false,
  devIndicators: false,
  /**
   * APK 移植（独立开源 Android 版）：
   * 静态导出到 out/，由 Capacitor 8 作为 Web 资源打包进 Android WebView。
   * 原 headers()（Cache-Control 长缓存）在静态导出下不适用且无意义，已移除。
   */
  output: "export",
}

export default nextConfig
