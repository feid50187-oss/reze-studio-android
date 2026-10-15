# Reze Studio — Android（独立开源版）

Reze Studio 是 [AmyangXYZ/reze-studio](https://github.com/AmyangXYZ/reze-studio)（GPLv3）的 Android 移植：
基于 Capacitor 8 将 WebGPU 版 MMD 动画编辑器打包为原生 APK，目标平台 Android 12+（minSdk 26），同时保留 Web 静态导出。

## 目录结构

```
reze-studio/          前端（Next.js 静态导出，out/ 由 Capacitor 打包进 APK）
  app/                App Router 入口
  components/         UI 组件（studio / timeline / engine-bridge / properties-inspector 等）
  lib/                业务逻辑（animation / bake / project / materials / model-store / model-folder-picker 等）
  context/            状态（studio-context / playback-context）
  public/             模型 / 动画 / 音频资产（二进制资产不入仓库，见下）
android/              Capacitor 原生工程（Java / Gradle / Manifest / 资源）
.github/workflows/    CI：push 后自动编译 APK
```

## Android 移植改动（相对上游）

1. **面板折叠**：左/右工具面板可折叠，竖屏不再遮挡视口（studio.tsx）
2. **时间线双模式**：骨骼编辑 / 镜头编辑切换，轨道以骨骼名纵列铺开（timeline.tsx）
3. **性能**：引擎视口渲染 DPR≤2 + ResizeObserver；时间线 canvas DPR≤2（engine-bridge.tsx / timeline.tsx）
4. **全盘访问权**：MANAGE_EXTERNAL_STORAGE，启动时引导授予（AndroidManifest / MainActivity.java）
5. **文件夹载入 PMX**：按路径递归读取文件夹内的 PMX + 贴图（lib/model-folder-picker.ts）
6. **非官方警告豁免**：Capacitor 原生容器不弹"非官方"警告（lib/device.ts）

## 本地构建

```bash
# 依赖：JDK 21、Android SDK（platform 36 + build-tools 36.0.0）、Node 20
npm install                 # 根工程（@capacitor/*）
cd reze-studio && npm install && npm run build   # 静态导出 out/
cd .. && npx cap sync android
cd android && gradle assembleDebug   # 或 ./gradlew（需 wrapper jar）
# APK 输出：android/app/build/outputs/apk/debug/app-debug.apk
```

## GitHub Actions

`.github/workflows/build-apk.yml` 在每次 push 到 main 时自动构建，产物上传为 `reze-studio-debug-apk` artifact。

## 资产说明（重要）

- 本仓库经 GitHub 连接器推送，**仅含文本源码**；模型 / 贴图 / 动画 / 音频等二进制资产
  （reze.pmx、Classic.vmd、*.png、*.mp3 等）不在仓库内。
- 运行时模型可由用户通过 App 内"从文件夹路径载入 PMX…"从手机存储加载（配合全盘访问权），
  不依赖内置 demo 资产。如需内置 demo，请从源码包补充 `reze-studio/public/` 后重新构建。
- `reze-studio/public/models/塞尔凯特/`（"请勿二次配布"）**禁止**进入公开仓库。

## 许可证

GPL-3.0-or-later。前端与引擎均为 GPLv3，详见 reze-studio/LICENSE（源码包内）与 reze-engine 的 LICENSE。
