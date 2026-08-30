# Browser Automation Runtime Stack

本文件描述当前 `master` 的 runtime stack 事实，不记录历史施工结果。

## 1. Current runtime initialization

`automation.InitJSWithOptions` 当前会创建：

- `page`, `mouse`, `keyboard`, `touchscreen`
- `browser`, `context`
- raw compatibility handles: `page____Inject`, `browser____Inject`, `context____Inject`

随后加载 `polyfills/` 与 `jslibs/`。

当前 `polyfills/` 中没有 upgraded-browser facade 文件，当前初始化路径也不会创建：

- `pageUpgraded`
- `browserUpgraded`
- `contextUpgraded`
- `Automation.getUpgraded()`
- `playwright.chromium.launch()`

因此这些名称不得作为当前能力写入完成性 Claim。

## 2. Stack selection today

CLI/HTTP execution request 可以携带：

```text
legacy
upgraded
playwright
```

`automation/runtime_stack.go` 的真实行为是：

- `legacy`: 保持当前注入 surface。
- `upgraded`: 只有当 runtime 已经存在 `pageUpgraded` 时，才把 `page` alias 到它；否则保持当前 `page`。
- `playwright`: 只有当对应 `pageUpgraded/browserUpgraded/contextUpgraded` 已存在时，才逐个 alias `page/browser/context`；否则保持已有对象。

这是一层 **conditional routing compatibility hook**，不是独立 upgraded runtime，也不是 Playwright runtime。

## 3. What current tests prove

当前 focused tests 应只证明：

- stack 名称 normalization；
- alias 只在 upgraded globals 确实存在时发生；
- execution/HTTP 接受 stack field；
- 无 upgraded globals 时选择 upgraded/playwright 不会凭空制造 facade，也不会破坏当前 legacy surface。

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

- 保留 `legacy/upgraded/playwright` stack 值，是为了不立即破坏已有调用协议。
- 文档不得因为名称存在就声称对应 runtime 已实现。
- 如果没有明确消费方，不为了让旧文档成立而恢复历史 upgraded polyfill 或 smoke scripts。
- 如果未来确实需要 selector/locator/evaluate/browser-process 能力，应以最小真实场景、独立 contract、T1/T2 测试和可选 T3 smoke 重新立项。

权威能力表见：`docs/architecture/browser-automation/capabilities.md`。
