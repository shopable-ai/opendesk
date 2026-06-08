---
title: Runtime Stacks
description: legacy、upgraded、playwright 三种运行时栈，以及 pageUpgraded / browserUpgraded / contextUpgraded 的用户视角说明。
order: 14
---

# runtime stacks

当前项目支持三种运行时栈模式：
- legacy
- upgraded
- playwright

它们控制的是：脚本里默认暴露给你的 `page` / `browser` / `context` 指向哪一层对象。

源码依据
- `main.go` 中 `-stack` 参数
- `automation/runtime_stack.go`
- `polyfills/010-browser-automation-upgraded.js`

## 一句话理解

- legacy：保留旧默认对象，不主动切换全局 page
- upgraded：把全局 `page` 指向 `pageUpgraded`
- playwright：把全局 `page`、`browser`、`context` 都切到升级 facade

## 什么时候该关心 stack

如果你只是写：
- page.screenshot()
- page.openURL()
- mouse.click()
- Vision.runOCR()

通常直接用 legacy 也能工作。

如果你开始写这些风格：
- page.locator(...)
- page.query(...)
- page.cookies(...)
- browser.newContext()
- context.newPage()
- playwright.chromium.launch()

那你就需要理解 upgraded / playwright。

## 1. legacy

含义
- 默认模式
- 不修改 polyfill 已经暴露的旧式 page 对象

全局对象表现
- `page`：保持 legacy 默认对象
- `browser`：legacy browser
- `context`：legacy default context

适合场景
- 已有老脚本
- 主要使用 page.screenshot / page.openURL / mouse / keyboard / Vision
- 不需要新 facade 的 locator / context / browser 风格封装

启动示例

```bash
go run main.go -script script.js -stack legacy
```

## 2. upgraded

含义
- 把全局 `page` 切换为 `pageUpgraded`
- 但 `browser` 仍保持 legacy browser

源码行为
- `ApplyRuntimeStackMode(..., "upgraded")`
- 等价于把 `pageUpgraded` 赋给全局 `page`

全局对象表现
- `page === pageUpgraded`
- `browser !== browserUpgraded`
- `context` 仍不是 playwright 风格默认入口

适合场景
- 想保留大部分旧脚本结构
- 但希望在 page 上使用新 facade 能力

启动示例

```bash
go run main.go -script script.js -stack upgraded
```

## 3. playwright

含义
- 把全局 `page`、`browser`、`context` 都切换到升级 facade

源码行为
- `page = pageUpgraded`
- `browser = browserUpgraded`
- `context = contextUpgraded`

适合场景
- 你想按更现代的 page / browser / context 思路写脚本
- 想使用 `browser.newContext()`、`context.newPage()` 一类 API
- 想做兼容 Playwright 风格的迁移脚本

启动示例

```bash
go run main.go -script script.js -stack playwright
```

## 注入对象总览

运行时里会先准备这些对象：
- page____Inject
- browser____Inject
- context____Inject
- pageLegacy
- browserLegacy
- contextLegacy
- pageUpgraded
- browserUpgraded
- contextUpgraded
- Automation

对普通用户最重要的是这几个：
- pageLegacy
- pageUpgraded
- browserUpgraded
- contextUpgraded
- Automation.getLegacy()
- Automation.getUpgraded()
- Automation.getPlaywrightFacade()

## pageUpgraded 是什么

`pageUpgraded` 是建立在 legacy page 之上的升级 facade。

它不是全新的底层引擎，而是兼容层。

**常见增强方法**

| 方法 | 说明 |
| --- | --- |
| pageUpgraded.open(target, options) | 统一打开 URL / 指定 app 打开 |
| pageUpgraded.locator(selector) | 返回 locator 兼容对象 |
| pageUpgraded.query(selector) | locator 别名风格入口 |
| pageUpgraded.waitFor(...) | 更灵活的等待分发 |
| pageUpgraded.waitForSelector(selector, options) | 若底层有则透传，否则 fallback |
| pageUpgraded.click(...) | 兼容式 click |
| pageUpgraded.type(...) | 兼容式 type |
| pageUpgraded.press(...) | 兼容式按键 |
| pageUpgraded.cookies(...) | 路由到 context cookies |
| pageUpgraded.storage(...) | 路由到 context storage |
| pageUpgraded.session(...) | 路由到 context session |
| pageUpgraded.getBrowser() | 取 browser |
| pageUpgraded.getContext() | 取 context |
| pageUpgraded.getPage() | 取当前 page |

**重要提醒**

- 这里的 selector / locator 不是完整浏览器 DOM 引擎能力
- 它更像“兼容式 API 形状”
- 对当前项目最稳定的能力仍是：
  - 截图
  - 打开 URL / app
  - 权限
  - mouse / keyboard / touchscreen
  - Vision
  - window

## browserUpgraded 是什么

`browserUpgraded` 是升级版 browser facade。

常见方法

| 方法 | 说明 |
| --- | --- |
| browserUpgraded.open(options) | 打开上下文并可带 url |
| browserUpgraded.newContext(options) | 创建新 context facade |
| browserUpgraded.getContext() | 取默认 context |
| browserUpgraded.getPage() | 取 page |
| browserUpgraded.pages() | 返回 pages |
| browserUpgraded.close() | 关闭 facade |

## contextUpgraded 是什么

`contextUpgraded` 是升级版 context facade。

常见方法

| 方法 | 说明 |
| --- | --- |
| contextUpgraded.newPage() | 新建 page facade |
| contextUpgraded.getBrowser() | 取 browser |
| contextUpgraded.getPage() | 取最近 page |
| contextUpgraded.cookies(...) | cookies 容器接口 |
| contextUpgraded.storage(...) | storage 容器接口 |
| contextUpgraded.session(...) | session 容器接口 |
| contextUpgraded.close() | 关闭 context |

## Automation 命名空间

当前运行时还会提供：

```js
Automation.getLegacy()
Automation.getUpgraded()
Automation.getPlaywrightFacade()
```

**示例**

```js
const legacy = Automation.getLegacy();
const upgraded = Automation.getUpgraded();
const pw = Automation.getPlaywrightFacade();

console.log(legacy.page === pageLegacy);
console.log(upgraded.page === pageUpgraded);
console.log(pw.browser === browserUpgraded);
```

## page.open() 的兼容语义

在 upgraded facade 中：

```js
await page.open('https://example.com');
await page.open('https://example.com', { appName: 'Safari' });
```

行为
- 若有 `openURLInApp` 且传了 appName，就走它
- 否则优先 `openURL`
- 再 fallback 到 `goto`

这比 legacy 直接调用 `goto()` 更适合用户脚本表达意图。

## locator / query 的兼容语义

```js
const locator = page.locator('#app');
await locator.click();
await locator.type('hello');
await locator.press('Enter');
```

注意
- 这是 facade 兼容对象
- 它依赖当前 page 是否提供相应底层方法
- 对本项目而言，这一层更适合迁移脚本，不应误认为完整 DOM 自动化引擎

## cookies / storage / session 的容器接口

在 upgraded facade 中：

```js
page.cookies()
page.cookies([{ name: 'sid', value: '1' }])
page.storage('token')
page.storage('token', 'abc')
page.storage({ token: 'abc', lang: 'zh' })
page.session('room', 'wechat')
```

这些调用会被路由到 context 层。

## 推荐用法

**推荐 1：用户脚本默认仍以 legacy 思维写核心能力**

如果你的目标是稳定桌面自动化：
- page.screenshot
- page.openApp / page.openURL
- window
- mouse / keyboard
- Vision

这套最稳。

**推荐 2：做 API 迁移或新语义包装时再用 upgraded**

如果你要写：
- 更像现代自动化 API 的脚本
- 兼容历史脚本但想逐步迁移

可以用 upgraded。

**推荐 3：需要 page / browser / context 三层语义统一时用 playwright**

如果你希望脚本组织方式接近：
- browser -> context -> page

再用 playwright。

## 示例

**legacy**

```js
console.log(page === pageUpgraded); // 通常不是
await page.openURL('https://example.com');
await page.screenshot({ path: './artifacts/legacy.png' });
```

**upgraded**

```js
console.log(page === pageUpgraded); // true
await page.open('https://example.com');
```

**playwright**

```js
console.log(page === pageUpgraded);
console.log(browser === browserUpgraded);
console.log(context === contextUpgraded);

const ctx = browser.newContext();
const p = ctx.newPage();
await p.open('https://example.com');
```

## 最后建议

如果你是在写“给最终用户看的脚本示例”，默认优先展示：
- legacy 可跑的核心能力
- 在必要时补充 upgraded / playwright 版写法

这样最符合当前项目的真实能力边界，也最不容易误导用户把 facade 当成完整浏览器引擎。
