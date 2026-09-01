---
title: Runtime API composition
description: OpenDesk JavaScript Runtime 的内部注入、polyfill、compatibility facade 与资源组成说明。
---

# Runtime API composition

本文面向 OpenDesk 维护者，记录 JavaScript Runtime 的内部组成与排障边界。用户应从
[Runtime Stacks](../../api/runtime.md) 和对应 API 页面了解可调用契约；不要把这里的内部名
当作公开接口。

## 文档职责

| 位置 | 负责回答的问题 |
| --- | --- |
| `docs/api/` | 用户能调用什么，参数、返回值、平台限制、错误和示例是什么。 |
| `docs/implementation/` | Runtime 如何组装，内部对象、资源与架构边界是什么。 |
| `docs/maintenance/` | Markdown、机器索引、类型和测试如何同步维护。 |

## Runtime API 形成过程

`automation.InitJSWithOptions()` 的组装顺序应保持可追溯。当前主链路依次：

1. 注册 `console`、`http` 与 timers，然后注册 `System`、`window`、`clipboard`、
   `globalShortcut`、`File`、`AppStorage`、`Sound`、`ImageColor`、`OCR` 和 `Vision`。
2. 根据显式 gate 注册 `NativeExtensions` / `NativeExtension`，再注册 Custom UI 和始终
   fail-closed 的 `Dialog`。
3. 创建 `mouse`、`keyboard`、`touchscreen`、`page`，以及原始 `browser` / `context` 对象，
   并在加载 polyfill 前提供 notify bridge。
4. 按文件名顺序加载 `polyfills/*.js`，再加载 `jslibs/*.js`。
5. 接入运行期 console event sink，注入 `Screen`，并把 `Screen.screenshot` 绑定到
   `page.screenshot`。

因此用户看到的是 native 对象、polyfill 增强、JS libraries 与 stack facade 的组合，而不是
单一 Go 方法集合。用户调用入口仍须以 `docs/api/` 标明的 Stable / Conditional 契约为准。

## 原生对象、polyfill 与 facade

- native binding 提供底层桌面、系统、输入、视觉和文件能力；对应用户语义应写在 API 页面。
- polyfill 负责用户层组合与别名，例如等待、权限辅助、`axios`、全局 Promise / timer 能力。
- `legacy`、`upgraded`、`playwright` facade 主要服务迁移；它们不承诺完整第三方浏览器库语义。
- `Dialog` 的公开行为、能力 gate 与隐私边界留在 [Dialog API](../../api/dialog.md)，实现时不要
  通过 facade 再造第二套 dialog 逻辑。

## 内部注入面

`page____Inject`、`browser____Inject`、`context____Inject` 是 polyfill / facade 的内部构造面。
它们可以为 Runtime 实现保留，但不应出现在面向用户的脚本示例、类型声明或机器索引中，也不
应被标记为 Stable API。

`NativeExtensions` 与低层 `NativeExtension` 的 gate、manifest discovery 和 one-shot process
边界属于实现与安全设计；公开调用形状、安装说明和 Experimental 限制只在
[Native Extension API](../../api/native-extension.md) 中向用户说明。

## 资源与 stack 排障

`polyfills/` 与 `jslibs/` 的资源查找、加载失败和发布路径属于运行时交付问题，不应把这类
实现细节写进普通 API 教程。排障时确认：

1. 可执行文件及其资源来自同一构建产物。
2. 目标 stack 的 facade 已被实际选中。
3. 失败接口的 native binding、polyfill 与 compatibility layer 各自的测试均被覆盖。
4. 不要将 facade 缺口误报为完整 DOM / Playwright 兼容性回归。

## 变更同步

内部组成变化如果改变用户可见能力、参数、返回、注入条件或默认行为，必须同步更新用户 API
页面、`runtime-api.ai.json`、`types/*.d.ts` 和相应 JavaScript Runtime API 测试。具体治理流程
见 [API documentation maintenance](../../maintenance/docs-user-api-editme-toc-maintenance.md)。
