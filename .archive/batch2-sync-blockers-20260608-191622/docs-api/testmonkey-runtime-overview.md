---
title: TestMonkey 运行时总览
description: 介绍 TestMonkey JS runtime 的注入顺序、全局对象地图与推荐阅读路径。
order: 20
---

# TestMonkey 运行时总览

更新时间：2026-05-18

本文是 TestMonkey JS Runtime API 的入口说明，适合先建立整体地图，再进入具体分主题文档。

## 运行时接口分层

当前项目主要暴露两层接口：

1. JS Runtime API
- 面向脚本作者
- 运行 JS 脚本时直接使用全局对象
- 注入逻辑主要在 `automation.InitJSWithOptions()`

2. HTTP Server API
- 面向外部服务调用
- 启动 `go run main.go -http` 后提供
- 详见 `testmonkey-http-api.md`

## 运行时初始化顺序

根据 `automation/utils.go`，初始化顺序大致为：

1. 注入原生对象
- `console`
- `http`
- `System`
- `window`
- `clipboard`
- `FloatingWindow`（未设置 `SKIP_FYNE_INIT` 时）
- `File`
- `AppStorage`
- `Sound`
- `ImageColor`
- `OCR`
- `Vision`
- timer 相关能力

2. 加载 `polyfills/` 下全部 `.js`
- 按文件名排序执行

3. 加载 `jslibs/` 下全部 `.js`
- 按文件名排序执行

4. 重置运行期 `console`

5. 创建并注入高频对象
- `page`
- `mouse`
- `keyboard`
- `touchscreen`
- `Screen`

6. 绑定别名
- `Screen.screenshot = page.screenshot`

这意味着最终行为应以“原生对象 + polyfill 覆盖后的结果”为准。

## 可确认的全局对象

当前源码可确认注入：

- `console`
- `http`
- `System`
- `window`
- `clipboard`
- `FloatingWindow`
- `File`
- `AppStorage`
- `Sound`
- `ImageColor`
- `OCR`
- `Vision`
- `mouse`
- `keyboard`
- `touchscreen`
- `page`
- `Screen`
- `axios`
- `Promise`
- `setTimeout` / `setInterval` / `clearTimeout` / `clearInterval`
- `sleep` / `sleepSeconds`
- `copyToClipboard` / `getClipboard`
- `notify`
- `URLSearchParams`

## 推荐阅读路径

### 如果你要写自动化脚本
先看：

- `testmonkey-runtime-page-input.md`
- `testmonkey-runtime-system-window-file.md`
- `testmonkey-runtime-network-and-vision.md`

### 如果你要理解兼容层
看：

- `testmonkey-polyfills.md`

### 如果你要复用内置 JS 库
看：

- `testmonkey-js-runtime-libraries.md`

### 如果你要从 HTTP 调用能力
看：

- `testmonkey-http-api.md`

## 与现有旧文档的关系

仓库里已有：

- `docs/api/runtime-api.md`

当前 `docs-api/` 这组文档的定位是：

- 更贴近当前源码
- 明确覆盖 `polyfills/` 和 `jslibs/`
- 更适合接入 CLI 文档系统进行分主题浏览
