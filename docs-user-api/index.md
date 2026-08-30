---
title: Clawdesk API 文档
description: Clawdesk 用户 API 总览、全局对象地图与阅读导航。
order: 1
---

# Clawdesk API 文档

这套文档面向脚本作者、自动化使用者和直接生成 Clawdesk 脚本的 Agent。

## 一句话理解

Clawdesk 在 JavaScript 运行时中注入桌面自动化、窗口、视觉、文件、网络和系统对象，再加载 polyfill 与内置 JS 库；外部程序还可以通过 HTTP 与 MCP 使用更高层能力。

## 先读哪些

- 写桌面脚本：`page.md` → `input.md` → `window.md`
- 做 OCR / 找按钮：`vision.md`
- 做模板匹配 / 颜色判断：`image-color.md`
- 做系统与文件操作：`system.md`、`file.md`、`storage.md`
- 做网络调用：`http.md`
- 从外部服务触发：`http-server.md`
- 理解 legacy / upgraded / playwright：`runtime.md`
- 配置 VS Code 自动补全：`types.md`
- 直接拿范例：`cookbook.md`
- 给 Agent / 工具读取：`runtime-api.ai.json`

## 当前用户可见 API 地图

| 对象 / 能力 | 类型 | 状态 | 主要用途 | 文档 |
| --- | --- | --- | --- | --- |
| `page` | Native + Polyfill | Stable | 截图、打开 URL/App、等待、权限 | `page.md` |
| `mouse` / `keyboard` / `touchscreen` | Native | Stable | 输入控制 | `input.md` |
| `window` | Native + Polyfill | Stable | 窗口读取与控制 | `window.md` |
| `Screen` | Native | Stable | 显示器、像素、截图别名 | `screen.md` |
| `Vision` | Native | Stable | OCR、UI 文本检测、provider 能力 | `vision.md` |
| `OCR` | Native | Secondary | 本地 Tesseract 纯文本 OCR | `vision.md` |
| `ImageColor` | Native | Secondary | 模板匹配、颜色、图像辅助分析 | `image-color.md` |
| `System` | Native | Stable | 系统、进程、网络、指标 | `system.md` |
| `File` | Native | Stable | 文件与目录操作 | `file.md` |
| `AppStorage` | Native | Secondary | 持久化键值存储 | `storage.md` |
| `clipboard` | Native | Stable | 系统剪贴板 | `clipboard-console.md` |
| `console` | Native/Runtime wrapper | Stable | 日志与事件输出 | `clipboard-console.md` |
| `http` | Native | Stable | 底层 HTTP 请求 | `http.md` |
| `axios` | Polyfill | Stable | 日常 HTTP 请求 | `http.md` |
| `notify()` | Polyfill + Native bridge | Secondary | 系统通知 | `polyfills.md` |
| `Sound` | Native | Secondary | 播放提示音 / 音频文件 | `runtime-utilities.md` |
| `FloatingWindow` | Native | Conditional / Experimental | Fyne 浮动控制窗 | `runtime-utilities.md` |
| Promise / timers / sleep | Native + Polyfill | Stable | 异步与等待 | `polyfills.md` |
| lodash / moment / query-string / cheerio / beautify | JS Libraries | Secondary | 脚本辅助库 | `libs.md` |
| `browser` / `context` / upgraded facade | Native + Compatibility facade | Compatibility | 浏览器风格迁移接口 | `runtime.md` |

## 三层接口来源

### 1. 原生对象

由 Go 运行时注入，例如：

`page`、`mouse`、`keyboard`、`window`、`Screen`、`System`、`File`、`AppStorage`、`Vision`、`ImageColor`、`Sound`、`http`。

### 2. Polyfill / Runtime wrapper

运行时会加载 `polyfills/*.js`，用于：

- 包装原生对象
- 提供 `page.waitForTimeout()`、`page.ensurePermissions()` 等最终用户 API
- 提供 `axios`
- 提供 `notify()`、Promise、timers、sleep、URLSearchParams 等

### 3. Compatibility facade

`legacy` / `upgraded` / `playwright` stack 会改变 `page` / `browser` / `context` 的默认指向。

这些 facade 主要提供迁移友好的 API 形状，**不等于完整 Playwright 浏览器引擎**。

## 文档、Agent 索引与编辑器类型

同一用户 API 面有三种消费形式：

| 消费者 | 入口 | 作用 |
| --- | --- | --- |
| 人类 | `docs-user-api/*.md` | 直接渲染的正式说明、行为边界和示例 |
| Agent | `runtime-api.ai.json` | 机器可读对象地图、状态和文档路由 |
| VS Code / TypeScript | `types/*.d.ts` + `jsconfig.json` | 全局对象自动补全、参数与返回值提示 |

详细说明见 `types.md`。

`types/*.d.ts` 是从当前 Runtime 派生出来的编辑器声明，不是第四套 API 文档。它与 Markdown 或源码冲突时必须修正类型声明，而不是反过来修改真实 API 去迎合旧类型。

## HTTP 服务接口

`http-server.md` 记录 Clawdesk 自身服务端接口，包括：

- `POST /SCRIPT_RUN`
- `POST /executions`
- `GET /executions/{id}`
- `GET /executions/{id}/summary`
- `GET /executions/{id}/events`
- `GET /status`
- `POST /vision/ocr`
- `POST /vision/detect-ui`

## 事实与兼容原则

- 当前源码优先。
- 新脚本优先采用标记为 Stable 的接口。
- `page.$`、`page.$$`、旧 DOM 风格 `page.click(selector)` / `page.type(selector, text)` 不属于当前稳定桌面 API。
- upgraded / playwright facade 只按 `runtime.md` 描述理解，不推断不存在的浏览器能力。
- 历史 TestMonkey 文档仅保留在 Git 历史中，不再参与当前文档解析。
- `dev/api.md` 与仓库根旧 `types.md` 属于已被正式文档/类型体系取代的历史草稿，不应重新恢复。
