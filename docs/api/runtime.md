---
title: Runtime Stacks
description: 面向脚本作者的 legacy、upgraded 与 playwright runtime stack 选择和兼容边界。
order: 14
---

# Runtime Stacks：选择脚本运行时

本页说明脚本作者如何选择运行时栈，以及可复用 recipe 如何接收结构化输入。它不描述
OpenDesk 内部如何注入 Go 对象、加载 polyfill 或构造 compatibility facade。

## 先用哪个 stack

| 你的目标 | 推荐 | 原因 |
| --- | --- | --- |
| 新建或维护常规桌面自动化 | `legacy` | 默认且最直接地使用 `page`、`window`、输入和视觉 API。 |
| 迁移已有的 `page` 风格代码 | `upgraded` | 提供迁移友好的 page facade，同时尽量保留旧结构。 |
| 迁移需要 `browser` / `context` 对象关系的代码 | `playwright` | 提供 Playwright 风格对象组合。 |

所有命令从仓库根目录运行。未指定 `-stack` 时使用默认 `legacy`：

```bash
./opendesk -script script.js
```

需要特定兼容栈时显式指定：

```bash
./opendesk -script script.js -stack upgraded
./opendesk -script script.js -stack playwright
```

若任务只需截图、窗口、鼠标、键盘、OCR 或图像能力，先在 `legacy` 验证底层动作；只有
确实依赖 facade 形状时再切换 stack。

## 各 stack 的用户可见差异

### legacy

默认模式。适合 `page.screenshot()`、`page.openURL()`、`window`、`mouse`、`keyboard`、
`Vision` 和 `ImageColor` 等桌面自动化原语。

### upgraded

将全局 `page` 切换到 upgraded facade。常见的迁移友好入口包括 `page.open(...)`、
`page.locator(...)`、`page.query(...)` 以及兼容式 click/type/press。

### playwright

将全局 `page`、`browser`、`context` 切换到 Playwright 风格组合，适合需要
`browser.newContext()` 和 `context.newPage()` 对象关系的迁移代码。

## 兼容边界

`upgraded` 和 `playwright` 是兼容 facade，**不是完整的浏览器 DOM 自动化引擎**。不要因
方法名相似就推断以下能力存在：

- 完整 CSS 或 XPath DOM 查询
- 完整 browser lifecycle
- 与官方 Playwright 等价的 locator 语义
- 所有 cookie、storage、session 行为均等价

实际可用范围以对应 facade 的当前实现、测试和各 API 页面为准。

## browser / context：已公开的方法

下表只列出当前兼容 facade 公开的调用形状；返回的 `page` 仍应主要按 [Page API](page.md) 使用。

### browser

| 方法 | 参数 | 返回 |
| --- | --- | --- |
| `browser.newPage()` | 无 | `OpenDeskPage` |
| `browser.newContext()` | 无 | `OpenDeskBrowserContext` |
| `browser.defaultContext()` | 无 | `OpenDeskBrowserContext` |
| `browser.contexts()` | 无 | `OpenDeskBrowserContext[]` |
| `browser.pages()` | 无 | `OpenDeskPage[]` |
| `browser.lastPage()` | 无 | `OpenDeskPage \| null` |
| `browser.close()` | 无 | `void` |
| `browser.isClosed()` | 无 | boolean |

### context

| 方法 | 参数 | 返回 |
| --- | --- | --- |
| `context.browser()` | 无 | `OpenDeskBrowser` |
| `context.newPage()` | 无 | `OpenDeskPage` |
| `context.adoptPage(page)` | `page: OpenDeskPage` | `void` |
| `context.pages()` | 无 | `OpenDeskPage[]` |
| `context.lastPage()` | 无 | `OpenDeskPage \| null` |
| `context.close()` | 无 | `void` |
| `context.isClosed()` | 无 | boolean |
| `context.cookies()` | 无 | `Array<Record<string, unknown>>` |
| `context.setCookies(cookies)` | `cookies: Array<Record<string, unknown>>` | `void` |
| `context.clearCookies()` | 无 | `void` |
| `context.storage()` | 无 | `Record<string, unknown>` |
| `context.setStorage(key, value)` | `key: string`、`value: unknown` | `void` |
| `context.getStorage(key)` | `key: string` | `unknown` |
| `context.clearStorage()` | 无 | `void` |
| `context.session()` | 无 | `Record<string, unknown>` |
| `context.setSessionValue(key, value)` | `key: string`、`value: unknown` | `void` |
| `context.getSessionValue(key)` | `key: string` | `unknown` |
| `context.clearSession()` | 无 | `void` |

这些方法仅管理当前 Runtime 的轻量 page/context 状态；不要把它们当作跨进程浏览器 profile、完整 cookie jar 或 Playwright storageState。

## Execution：recipe 的执行上下文

每次由 OpenDesk Execution Runtime 运行的脚本都会得到 `Execution` 元数据，包括
`executionId`、`artifactDir`、`source` 和 `stack`。通过 `opendesk ai run` 执行可复用
recipe 时，还可以使用：

```js
Execution.id;       // executionId 的短别名
Execution.input;    // --input / --input-file / --input-stdin 解析后的 JSON；默认 {}
Execution.workdir;  // 启动命令所在的工作目录
```

`Execution.input` 是复杂参数化 workflow 的正式输入通道，不要用不受约束的 argv 位置参数
替代。Execution artifact、输入互斥规则和 JSON 输出契约见 [AI CLI](ai-cli.md)。

## 内部实现说明

Runtime 注入顺序、原生与 polyfill 的组成、内部构造对象和资源查找规则属于维护者
说明，见 [Runtime API composition](../implementation/runtime/runtime-api-composition.md)。
