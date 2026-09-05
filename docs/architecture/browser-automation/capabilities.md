# Browser Automation Capability Matrix

本页只描述当前源码和测试能证明的事实。公开用户 API 以 `docs/api/` 为准；源码里仍存在的
browser-shaped 兼容对象不因此成为用户 API。

## Evidence Levels

- `E0`：只有需求或历史 Claim，没有实现证据。
- `E1`：API shape 或类型存在。
- `E2`：shim、alias 或 routing 存在。
- `E3`：Go/Runtime 实现存在。
- `E4`：当前仓库有自动化测试。
- `E5`：本轮在真实环境完成 smoke，并保留可复核证据。

`E4` 只证明测试断言的范围；兼容 shim 的测试不能证明 browser 或 Playwright 语义。

## Current Matrix

| Capability | Current Surface | Runtime Reality | Evidence | Public status |
| --- | --- | --- | --- | --- |
| Desktop page | `page` | 截图、OS URL/App 打开、等待和权限；不是网页 DOM page | E4：`automation/page.go`、`polyfills/000-page.js`、`tests/runtime-api/unit/page.test.js` | Maintained；见 `docs/api/page.md` |
| URL open | `page.openURL()` / `goto()` | 调用 OS `open` / `start` / `xdg-open`，不控制 tab 或 navigation lifecycle | E3：`automation/page.go` | Maintained desktop API |
| Screenshot | `page.screenshot()` / `Screen.screenshot()` | 捕获桌面、显示器或窗口像素 | E4；真实环境能力另需 E5 | Maintained desktop API |
| Stack label | `legacy` / `upgraded` / `playwright` | `NormalizeRuntimeStack` 接受历史名称，`ApplyRuntimeStackMode` 只做同一 Goja Runtime 内 alias | E4：`automation/runtime_stack*.go` | 新调用省略 `-stack`；旧值仅兼容 |
| Browser-shaped globals | `browser`、`context`、upgraded globals、`Automation`、`playwright` | 初始化仍为旧脚本创建 in-process facade | E4：`automation/utils.go`、`polyfills/010-browser-automation-upgraded.js`、`automation/browser_compat_test.go` | Not public；不在 docs/types/catalog/examples |
| Browser/Context container | internal `Browser` / `BrowserContext` | 只维护内存 page ownership、close 状态和 map | E4：`automation/browser.go`、`tests/automation/browser_lifecycle_test.go` | Not public |
| Compatibility locator | internal selector carrier | 只把字符串和调用路由给 owner；没有 selector engine 或 actionability | E4：`polyfills/010-browser-automation-upgraded.js`、`automation/browser_compat_test.go` | Not public |
| Compatibility evaluate | owner route 或本地 Goja 函数调用 | 不是网页 page realm | E4：同上 | Not public |
| Cookies/storage/session | internal context maps | 不连接 cookie jar、profile、localStorage、sessionStorage 或网络会话 | E4：`automation/browser.go`、`automation/browser_compat_test.go` | Not public |
| Real browser driver | none | 没有 browser process、tab protocol、DOM、CSS/XPath selector 或 network-idle | E0 | Unsupported |

## Current Interpretation

OpenDesk 当前公开的是桌面自动化能力。源码仍含历史 Browser/Context 容器和
upgraded/playwright shim，但它们已从用户 API catalog、类型和示例中隔离；保留实现只是避免
未经审计的破坏性删除。

禁止用以下措辞描述当前产品：

- full Playwright support / Playwright parity；
- production-ready browser runtime；
- DOM、tab、browser context 或真实 locator 支持；
- 已验证的 cookie、profile 或 browser storage。

真实 browser/DOM workload 出现后，应选择独立成熟的 browser driver，并为目标、权限、页面状态、
失败模式和 E2E fixture 建立新的契约；不应继续扩展现有 shim。
