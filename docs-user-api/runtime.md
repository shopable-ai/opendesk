---
title: Runtime Stacks
description: Clawdesk JS 运行时注入顺序、全局对象形成过程，以及 legacy / upgraded / playwright 三种运行时栈。
order: 14
---

# runtime stacks

本页解释两个问题：

1. Clawdesk 的 JavaScript 全局 API 是怎样形成的。
2. `legacy` / `upgraded` / `playwright` 如何改变 `page` / `browser` / `context`。

## 运行时 API 形成过程

当前 `automation.InitJSWithOptions()` 的主顺序是：

1. 注入基础原生对象
   - `console`
   - `http`
   - `System`
   - `window`
   - `clipboard`
   - `FloatingWindow`（仅当未设置 `SKIP_FYNE_INIT`）
   - `File`
   - `AppStorage`
   - `Sound`
   - `ImageColor`
   - `OCR`
   - `Vision`
2. 注册 timer 能力
3. 创建输入与 page 对象
   - `mouse`
   - `keyboard`
   - `touchscreen`
   - `page`
   - `page____Inject`
4. 创建 browser/context 原始对象
   - `browser`
   - `browser____Inject`
   - `context`
   - `context____Inject`
5. 按文件名排序加载 `polyfills/*.js`
6. 按文件名排序加载 `jslibs/*.js`
7. 将 `console` 切换到真正的运行期事件 sink
8. 注入 `Screen`
9. 绑定 `Screen.screenshot = page.screenshot`

这意味着用户最终看到的 API 不是单纯的 Go 方法集合，而是：

**Native 对象 + Polyfill 覆盖/增强 + JS Libraries + Stack 选择**

## 为什么要区分 Native 与 Polyfill

例如 `page.screenshot()` 来自原生 Page；而：

- `page.waitForTimeout()`
- `page.waitForFunction()`
- `page.checkPermissions()`
- `page.requestPermissions()`
- `page.ensurePermissions()`

来自 polyfill。

对用户来说它们都可调用，但维护文档和排查问题时必须知道来源不同。

`axios` 也是典型例子：正式脚本中的全局 `axios` 由 `polyfills/004-axios.js` 构造，并最终调用底层 `http.request()`。

## 核心全局对象

完整导航见 `index.md`。运行时核心可以按职责理解：

- **动作与观察**：`page`、`mouse`、`keyboard`、`touchscreen`、`window`、`Screen`
- **视觉**：`Vision`、`OCR`、`ImageColor`
- **数据与系统**：`File`、`AppStorage`、`System`、`clipboard`
- **网络**：`http`、`axios`
- **运行时辅助**：`console`、Promise、timers、sleep、`notify()`、`Sound`
- **条件能力**：`FloatingWindow`
- **兼容 facade**：`browser`、`context`、upgraded/playwright 相关对象

## 三种 stack

### legacy

默认模式。

- `page` 保持 legacy 用户对象
- `browser` / `context` 保持基础兼容对象
- 最适合已有桌面自动化脚本

```bash
go run main.go -script script.js -stack legacy
```

如果主要使用下面这些能力，优先从 legacy 开始：

- `page.screenshot()`
- `page.openURL()`
- `window`
- `mouse` / `keyboard`
- `Vision`
- `ImageColor`

### upgraded

将全局 `page` 切换到 `pageUpgraded` facade，同时尽量保留旧脚本结构。

```bash
go run main.go -script script.js -stack upgraded
```

常见增强形态包括：

- `page.open(...)`
- `page.locator(...)`
- `page.query(...)`
- 兼容式 click/type/press
- cookies/storage/session facade

这些能力的主要目的，是降低迁移成本。

### playwright

把全局 `page`、`browser`、`context` 切换到 upgraded facade 的 Playwright 风格组合。

```bash
go run main.go -script script.js -stack playwright
```

适合需要：

- `browser.newContext()`
- `context.newPage()`
- Playwright 风格对象关系

的迁移代码。

## 重要边界：不是完整 Playwright

Clawdesk 的 upgraded/playwright 层是**兼容 facade**，不是完整浏览器 DOM 引擎。

因此不要因为方法名相似就推断：

- 完整 CSS/XPath DOM 查询
- 完整 browser lifecycle
- 与官方 Playwright 等价的 locator 语义
- 所有 cookie/storage/session 行为均等价

需要浏览器风格能力时，应以当前 facade 实际实现和测试为准。

## 原始注入对象

运行时内部还会保留：

- `page____Inject`
- `browser____Inject`
- `context____Inject`

它们主要用于 polyfill/facade 构造，不建议普通脚本直接依赖。

新脚本应使用公开入口，而不是内部注入名。

## 资源加载位置

`polyfills/` 与 `jslibs/` 会从可执行文件目录和当前工作目录的向上路径中寻找。

如果运行时日志出现：

- 找不到 polyfills
- 找不到 jslibs
- 加载某个 JS 文件失败

应优先排查资源目录是否随二进制正确发布，而不是把问题误判为业务脚本错误。

## 选择建议

| 场景 | 推荐 |
| --- | --- |
| 常规桌面自动化 | `legacy` |
| 需要 page 新 facade，但想保持旧结构 | `upgraded` |
| 明确需要 Playwright 风格对象关系 | `playwright` |
| 新功能是否稳定不确定 | 先在 `legacy` 验证底层能力，再考虑 facade |

## 机器可读索引

Agent 不需要从多套旧文档猜接口。

优先读取：

`docs-user-api/runtime-api.ai.json`

其中只记录当前文档体系认可的对象、状态、来源和推荐入口；最终事实仍以当前源码为准。
