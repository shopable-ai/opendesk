---
title: 编辑器类型与自动补全
description: Clawdesk 的 types/*.d.ts、jsconfig.json 与用户 API 文档之间的关系。
order: 16
---

# 编辑器类型与自动补全

Clawdesk 的正式 API 有三种互补表达：

```text
当前源码 / Runtime
├── docs-user-api/*.md
│   └── 给人阅读并直接渲染成文档
├── docs-user-api/runtime-api.ai.json
│   └── 给 Agent 做机器可读索引
└── types/*.d.ts
    └── 给 VS Code / TypeScript 做自动补全与静态签名提示
```

`types/*.d.ts` **不是另一套 API 文档**，也不是独立 Source of Truth。

如果类型声明、Markdown 与运行时冲突，以当前源码/运行时为准，并修正派生资料。

## 为什么保留 types/

Clawdesk 的脚本运行时会直接注入：

- `page`
- `mouse`
- `keyboard`
- `touchscreen`
- `window`
- `Screen`
- `Vision`
- `OCR`
- `ImageColor`
- `System`
- `File`
- `AppStorage`
- `clipboard`
- `http`
- `axios`
- `Sound`
- 条件注入的 `FloatingWindow`
- compatibility `browser` / `context`
- `notify()`、timers、sleep 等全局函数

这些对象不是 npm 包导入，普通 JavaScript 编辑器无法天然知道它们的签名。

`types/*.d.ts` 的作用就是告诉编辑器：

> 这些对象已经由 Clawdesk Runtime 提供，不需要 `new`、`import` 或 `require`。

## jsconfig.json

仓库根目录的 `jsconfig.json` 会把：

- JavaScript 脚本
- `examples/**/*.js`
- `polyfills/**/*.js`
- `types/**/*.d.ts`

放进同一个 VS Code JavaScript 工程。

因此编辑脚本时可以直接获得：

- 方法名自动补全
- 参数提示
- 返回结构提示
- 明显拼写错误提示

`checkJs` 当前保持关闭，避免把 Clawdesk 的 Goja 运行时误当成浏览器或 Node.js 项目做强类型检查。

## 类型文件与文档映射

| 类型声明 | 对应用户文档 |
| --- | --- |
| `types/page.d.ts` | `page.md` |
| `types/mouse.d.ts` / `keyboard.d.ts` / `touchscreen.d.ts` | `input.md` |
| `types/window.d.ts` | `window.md` |
| `types/Screen.d.ts` | `screen.md` |
| `types/Vision.d.ts` | `vision.md` |
| `types/ImageColor.d.ts` | `image-color.md` |
| `types/System.d.ts` | `system.md` |
| `types/File.d.ts` | `file.md` |
| `types/AppStorage.d.ts` | `storage.md` |
| `types/clipboard.d.ts` / `console.d.ts` | `clipboard-console.md` |
| `types/http.d.ts` / `axios.d.ts` | `http.md` |
| `types/Sound.d.ts` / `FloatingWindow.d.ts` | `runtime-utilities.md` |
| `types/browser.d.ts` | `runtime.md` |
| `types/global.d.ts` | `polyfills.md` |

## Native 与 Polyfill 的类型语义

Clawdesk 的 Go Native 对象通过 AutoMap 映射到 JavaScript，调用本身通常是同步的；如果 Go 返回错误，运行时会抛出 JS 异常。

Polyfill 可以把某些用户入口包装成 Promise，例如：

- `page.screenshot()`
- `page.goto()`
- `page.waitForTimeout()`
- `page.waitForFunction()`
- `page.checkPermissions()`
- `axios.*`

因此 `.d.ts` 应描述**用户最终拿到的 Runtime API**，不能简单把所有 Go 方法统一写成 `Promise`。

JavaScript 对同步返回值使用 `await` 仍然有效，所以示例为了流程一致可以保留 `await`，但类型声明应尽量表达真实返回语义。

## 维护规则

API 变化时按下面顺序检查：

```text
源码 / Runtime 变化
→ 更新可渲染 Markdown
→ 更新 runtime-api.ai.json
→ 更新对应 types/*.d.ts
→ 运行 TypeScript 声明检查
→ 检查示例
```

需要重点防止：

- 源码新增对象但 `.d.ts` 没有声明
- 旧 `.d.ts` 误复制到错误文件
- 方法名从 `isGray` 漂移成 `isGrey`
- 对象返回值被错误声明成字符串或 Promise
- 文档写 lowerCamelCase，类型却继续使用旧 snake_case
- Conditional / Compatibility API 被误写成永远存在的 Stable API

## 边界

`.d.ts` 不应该承担：

- 大段 API 教程
- 架构解释
- 历史迁移说明
- 平台行为分析
- 示例集合

这些内容统一进入 `docs-user-api/*.md`。

类型文件只保留对自动补全真正有价值的：

- 方法
- 参数
- 返回值
- 关键结构
- 少量状态/兼容提示
