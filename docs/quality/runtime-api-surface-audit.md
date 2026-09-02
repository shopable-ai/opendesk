---
title: Runtime API surface and lifecycle audit
description: Sound/Audio/Page/Vision/Window/Input/Dialog/Notify/Scheduler/Browser/NativeExtensions 的实现、映射、文档、类型、测试与 teardown 对照。
order: 22
---

# Runtime API surface and lifecycle audit

本表审查的是当前源码链路，不以旧二进制或历史日志作结论。公共 Runtime surface 的机器源是 `tests/runtime-api/manifest.js`，运行时实现源是 `automation/utils.go` 及各显式 `registerXxx`。

## 实现与公开面闭合

| 领域 | native/服务 owner | Go→Goja→JS 暴露 | docs / types | JS 公共测试 | 创建与结束路径 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| Sound | `automation/sound.go` | allowlist 提供同步旧方法；`registerSound` 显式提供 `start/playAsync/stop/stopAll/getActive` 和 playback handle | `docs/api/sound.md` / `types/Sound.d.ts` | `unit/sound.test.js` | playback `pause/resume/stop/wait`；execution `Close/Wait/ResourceCounts` | 闭合 |
| Audio | `automation/audio.go` + platform backend | `registerAudio` 显式同步注册，非 allowlist | `docs/api/audio.md` / `types/Audio.d.ts` | `unit/audio.test.js` | 当前仅同步设备控制，无持续 worker；真实设备枚举单独 opt-in | 闭合；无伪造 start/stop |
| Page | `automation/page.go` | allowlist → `page____Inject` → `polyfills/000-page.js` facade | `docs/api/page.md` / `types/page.d.ts` | `unit/page.test.js`、`page-compat.test.js` | screenshot/open 为 one-shot；wait/HTTP callback 由 EventLoop/cancel drain | 闭合 |
| Vision / ImageColor | `automation/vision*.go`、`imageColor.go` | allowlist lowerCamelCase | `docs/api/vision.md`、`image-color.md` / 对应 types | `unit/vision*.test.js`、`image-color.test.js` | one-shot provider/图像调用；provider deadline 在调用内结束 | 闭合 |
| Window | `automation/window_manager*.go` | allowlist + `polyfills/003-window.js` 结果规范化 | `docs/api/window.md` / `types/window.d.ts` | `unit/window.test.js` + live composition | 操作均 one-shot；没有“打开 session”需要 stop | 闭合 |
| Mouse / Keyboard | `automation/mouse.go`、`keyboard.go` | allowlist，经 Page 组合为全局和嵌套输入对象 | `docs/api/mouse.md`、`input.md` / 对应 types | `unit/mouse.test.js`、`keyboard.test.js` + live | `down` 与 `up` 对称；click/wheel/type 为 one-shot | 闭合 |
| Dialog | `automation/dialog.go` + Custom UI owner | `registerDialog` Promise bridge；`000-dialog.js` 仅提供全局别名 | `docs/api/dialog.md` / `types/dialog.d.ts` | `unit/dialog.test.js`；原生 AX/截图由 dialog gate | resolve/reject、cancel、窗口 close、worker Wait | 闭合 |
| Notify / Notifications | `automation/notify*.go`、`notifications*.go` | `notify____Inject` 先于 `000-systemBase.js`；Notifications 由 `registerNotifications` | `docs/api/notify.md`、`notifications.md` / `global.d.ts`、`Notifications.d.ts` | `unit/notify.test.js`、`notifications.test.js` | notify 是 one-shot；Notifications 有 dismiss；wait worker 纳入 Close/Wait/ResourceCounts | 已修复 teardown 计数闭环 |
| Screen capture | `automation/screen_capture*.go` | 显式合入 `Screen` | `docs/api/screen.md` / `types/Screen.d.ts` | `unit/screen.test.js` + live | `startRecording` 返回带 `stop()` 的 session；execution close 强制 finalize | 闭合 |
| Scheduler | `pkg/scheduler` + HTTP/CLI owner | 不是 JavaScript Runtime global；通过 scheduler service/HTTP 与 inline Runtime executor | `docs/api/scheduler*.md` | `pkg/scheduler/*_test.go`；inline script 为 fixture | `Service.Start/Close`、`Store.Close` | 闭合；不伪装成 Runtime global |
| Browser / Context | `automation/browser.go` | raw `browser____Inject/context____Inject` + compatibility polyfill | `docs/api/runtime.md` / `types/browser.d.ts` | `unit/browser.test.js`、`context.test.js`、`page-compat.test.js` | `close/isClosed`；page/context ownership 有 Go lifecycle seam | 闭合 |
| NativeExtensions | `automation/native_extensions.go` + `pkg/nativeextension` | manifest-bound immutable namespace；unsafe V0 仅显式 diagnostic gate | `docs/api/native-extension.md` / `types/NativeExtension.d.ts` | `unit/native-extension.test.js` + proof harness | one-shot child有 deadline、等待与 reap；无常驻 session | 闭合；跨平台 package 与 live 分级 |

## 本轮发现并修复的不一致

| 问题 | 修复 | 证据边界 |
| --- | --- | --- |
| `RuntimeLifecycle.ResourceCounts()` 漏记 Notifications，cleanup 可能假零 | 增加 notification worker/pending 到计数、`IsZero`、字符串、execution event 与 shell zero-check | Go lifecycle seam + 当前 Runtime gate |
| CoreAudio 和 NSPasteboard 测试默认访问真实主机 | 分别要求 `OPENDESK_LIVE_AUDIO_TEST=1`、`OPENDESK_LIVE_CLIPBOARD_TEST=1` | 默认 package gate 不再冒充 live |
| OpenCV JS fixture 调用未公开的 `ImageColor.templateMatchBackend()` | JS 只测公开 ImageColor 行为；backend identity 留给 `-tags opencv` 的 Go 私有 seam | JS contract 与 Go backend 证据分离 |
| WeChat 测试调用 `System.writeFile` 与不存在的 ImageColor 可视化方法 | 改用 `File.write` 和文档化的 `Vision.annotateRegions` | 开发者命令可由当前 Runtime 解析 |
| examples 调用 `bringToTopByPID`、`mouse.scroll`、`File.mkdir` | 改用 `window.bringToTop`、`mouse.wheel`、`File.ensureDir` | 公开示例与 docs/types/manifest 对齐 |
| 固定 run id 重跑曾复用旧 Native Extension helper/fixture-ready，并使 provenance 丢失或 async 连接旧端口 | 入口校验 run id 后只清理该 `.runtime` run 目录；helper 每次从当前源码 staging build 并同步 manifest/types/context | 同一 run id 连续执行也不接受旧 binary、ready 文件或日志 |
| `unit/mouse.test.js` 曾移动并读取真实指针，受用户同时移动鼠标影响 | unit 只保留 surface 与无副作用参数校验；`mouse.move/getPos` 行为由既有 `live/mouse.test.js` 验收 | 普通 unit 不再操作真实桌面，live 仍保留 JS-first 行为证据 |

## 剩余边界

- `contract/unit` 证明当前构建的 JS surface 与确定性行为，不证明真实窗口可见、权限或设备状态。
- Linux/Windows 的 Native Extension 在本轮只可记 compile/package；没有目标系统 live Runtime 时不能升级表述。
- `.archive/`、`dist/` 和旧 `.runtime/` 产物不计入当前评分。最终证据必须引用本轮 run id 与 binary hash。
