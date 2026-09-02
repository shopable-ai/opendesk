# Browser Automation Runtime Stack

本文件描述当前 `master` 的 runtime stack 事实，不记录历史施工结果。

## 1. Current runtime initialization

`automation.InitJSWithOptions` 当前会创建：

- `page`, `mouse`, `keyboard`, `touchscreen`
- `browser`, `context`
- raw compatibility handles: `page____Inject`, `browser____Inject`, `context____Inject`

随后加载 `polyfills/` 与 `jslibs/`。其中
`polyfills/010-browser-automation-upgraded.js` 会基于 raw handles 创建：

- `pageUpgraded`
- `browserUpgraded`
- `contextUpgraded`
- `Automation.getLegacy/getUpgraded/getPlaywrightFacade()`
- `playwright.chromium.launch()`

这些对象是同一 OpenDesk Runtime 内的 compatibility facade；不是独立浏览器进程、DOM realm
或 Playwright implementation。

## 2. Stack selection today

CLI/HTTP execution request 可以携带：

```text
legacy
upgraded
playwright
```

`automation/runtime_stack.go` 在 polyfill 加载后选择公开 alias：

- `legacy`: 保持 raw `page/browser/context` surface。
- `upgraded`: 把 `page` alias 到 `pageUpgraded`；`browser/context` 保持 legacy，同时可显式访问 upgraded handles。
- `playwright`: 把 `page/browser/context` 分别 alias 到对应 upgraded facade。

alias helper 本身仍是 conditional/fail-closed：在不加载正常 polyfill 的隔离 Runtime 中，如果 upgraded
global 不存在就保持原对象。正常 OpenDesk 初始化会加载该 polyfill，因此三个 upgraded global 和
`playwright` shim 均存在。

## 3. What current tests prove

当前 focused tests 证明：

- stack 名称 normalization；
- isolated Runtime 中 alias 只在 upgraded globals 确实存在时发生；
- 正常 Runtime 初始化会创建 upgraded globals、Automation getters 与 Playwright-shaped launch shim；
- upgraded page/browser/context 的 owner routing、close/introspection、locator carrier 和显式失败边界；
- execution/HTTP 接受 stack field；
- 当前仓库根目录的 legacy/upgraded/playwright smoke recipe 能由真实 JavaScript Runtime 执行。

它们不证明：

- DOM selector semantics；
- locator semantics；
- browser process launch；
- tab/session protocol；
- page realm evaluate；
- Playwright API parity。

## 4. Current Browser / Context / Page model

### Page

当前 `Page` 更接近桌面自动化 surface：

- OS URL/app open；
- desktop screenshot；
- mouse/keyboard/touchscreen；
- timeout/predicate wait；
- active-window title / best-effort URL-like state；
- system permission helpers。

`page.goto(url)` 当前通过 OS launcher 打开 URL，不是浏览器 driver navigation。

### Browser / Context

当前 Go 容器负责：

- Browser → Context → Page ownership；
- page/context enumeration；
- `newPage` / `newContext`；
- Browser/Context `close` / `isClosed`；
- in-memory cookies/storage/session state。

这些容器不是浏览器进程、真实 browser context 或 protocol session 的替代证明。

## 5. Compatibility policy

- 保留 `legacy/upgraded/playwright` stack 值和现有 facade，是为了兼容当前公开 recipe 与迁移代码。
- 文档可以声明 compatibility facade 已实现，但不得把它升级为 browser process、DOM、selector engine
  或 Playwright parity。
- 当前维护目标是收紧已有 facade 的契约与 evidence，不再创建另一套 stack abstraction。
- 如果未来确实需要 selector/locator/evaluate/browser-process 能力，应以最小真实场景、独立 contract、T1/T2 测试和可选 T3 smoke 重新立项。

权威能力表见：`docs/architecture/browser-automation/capabilities.md`。
