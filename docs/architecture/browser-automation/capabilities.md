# Browser Automation Capability Matrix

本页只描述当前 `master` 能从源码与当前测试中证明的事实。API 命名、历史文档或旧 smoke 记录不能替代当前 Evidence。

## Evidence Levels

- `E0`：文档/需求层存在过 Claim，但当前没有找到实现证据。
- `E1`：API / TypeScript declaration / facade shape 存在。
- `E2`：shim / alias / routing 存在。
- `E3`：Go/runtime implementation 存在。
- `E4`：当前仓库中存在针对该事实的 automated test。
- `E5`：本轮在真实环境中实际完成 smoke，并保留可复核证据。

`E4` 只证明测试实际断言的范围；它不会自动把 routing shim 升格为 Playwright runtime semantics。

## Current Matrix

| Capability | Current Surface | Runtime Reality | Evidence Level | Evidence Files | Known Boundary | Next Action |
| --- | --- | --- | --- | --- | --- | --- |
| Runtime stack name selection | `legacy` / `upgraded` / `playwright` | `NormalizeRuntimeStack` 接受三个名称；正常初始化加载 upgraded polyfill 后，`ApplyRuntimeStackMode` 选择 legacy、page-only upgraded 或 page/browser/context playwright alias | E4 | `automation/runtime_stack.go`; `automation/runtime_stack_test.go`; `automation/browser_compat_test.go`; `pkg/execution/runner.go` | compatibility alias，不创建浏览器进程 | 保持三种现有迁移入口，不增加同义 stack |
| Current JS globals | `page`, `browser`, `context`, raw handles, `pageUpgraded`, `browserUpgraded`, `contextUpgraded`, `Automation`, `playwright` | `InitJSWithOptions` 注入 Go 对象并加载 `010-browser-automation-upgraded.js` 创建 compatibility facade | E4 | `automation/utils.go`; `polyfills/010-browser-automation-upgraded.js`; `automation/browser_compat_test.go` | 不是浏览器 DOM runtime | 保持 facade 边界与 current-source smoke |
| Raw inject handles | `page____Inject`, `browser____Inject`, `context____Inject` | 初始化时明确保留，主要供兼容 wrapper 使用 | E3 | `automation/utils.go` | 私有兼容入口，不应作为新公共 API 扩散 | 仅在迁移/诊断时使用 |
| `page` API shape | legacy desktop page + `pageUpgraded` compatibility methods | Type declarations 与 Go Page 提供底层桌面能力；upgraded polyfill 提供迁移路由 | E4 | `types/page.d.ts`; `automation/page.go`; `polyfills/000-page.js`; `polyfills/010-browser-automation-upgraded.js`; `automation/browser_compat_test.go` | upgraded 方法不增加 DOM/selector engine | 文档区分 legacy primitive 与 compatibility routing |
| `goto` / URL open | `page.goto`, `openURL`, `openURLInApp` | 通过 OS `open` / `start` / `xdg-open` 启动 URL/应用 | E3 | `automation/page.go`; `polyfills/000-page.js` | 不控制 tab、DOM navigation 或 network-idle | 若需要浏览器导航语义，单独设计 runtime adapter |
| `waitFor` / `waitForTimeout` | number / predicate compatibility | timer/polling compatibility；Go string 分支不是 selector wait | E3 | `automation/page.go`; `polyfills/000-page.js`; `types/page.d.ts` | 不等于 Playwright selector/event semantics | 保持 timer/predicate 口径；不要把字符串解释为 selector Claim |
| `waitForNavigation` | compatibility method | 当前主要通过 timeout/URL change polling 近似 | E3 | `automation/page.go`; `polyfills/000-page.js` | 没有真实浏览器 navigation event contract | 若业务需要，先定义可验证 postcondition |
| `pageUpgraded.waitForSelector` | compatibility route | 只调用 owner 已提供的 `waitForSelector`，缺失时显式报 unsupported | E4 | `polyfills/010-browser-automation-upgraded.js`; `automation/browser_compat_test.go` | 没有内置 selector engine | 仅作为 owner adapter 使用 |
| `pageUpgraded.locator` | selector carrier + owner router | 保存 selector，并把 click/type/press/wait/evaluate/screenshot 路由给 owning page | E4 | `polyfills/010-browser-automation-upgraded.js`; `automation/browser_compat_test.go` | 不查找 DOM，也不验证 selector | 不宣称 Playwright locator semantics |
| `pageUpgraded.click/type/press` | compatibility action route | 优先调用 owner 方法；无 target 的 type/press 可回退 keyboard；缺失能力显式失败 | E4 | `polyfills/010-browser-automation-upgraded.js`; `automation/browser_compat_test.go` | desktop input 与 owner route 不等于 selector action engine | 保持显式 unsupported 边界 |
| `pageUpgraded.evaluate` | owner route or local compatibility result | owner 有 evaluate 时转发；否则只对函数做本地 Goja 计算并标记 `local-compatibility-evaluate` | E4 | `polyfills/010-browser-automation-upgraded.js`; `automation/browser_compat_test.go` | 不是页面 DOM realm | browser realm 需求必须另建 adapter |
| screenshot | `page.screenshot` / `Screen.screenshot` | 当前实现是桌面/窗口/屏幕截图 | E3 | `automation/page.go`; `automation/utils.go`; `types/page.d.ts` | 不是浏览器 page screenshot semantics；本轮无 E5 | 增加可控 fixture 后再做 T3 smoke |
| Browser / Context containers | `browser`, `context`; `newPage/newContext/pages/contexts` | Go 中维护 in-memory Browser/Context/Page ownership | E4 | `automation/browser.go`; `types/browser.d.ts`; `automation/browser_lifecycle_test.go` | 不代表 browser process、incognito context 或 tab protocol | 维持 focused lifecycle regression |
| cookies | `context.cookies/setCookies/clearCookies` | in-memory map slice | E4 | `automation/browser.go`; `automation/browser_compat_test.go`; `types/browser.d.ts` | 不连接真实浏览器 cookie jar | 若要真实 session，需要 runtime adapter |
| storage | `context.storage/...` | in-memory key/value store | E4 | `automation/browser.go`; `automation/browser_compat_test.go`; `types/browser.d.ts` | 不等于 localStorage/sessionStorage | 保持命名边界 |
| session | `context.session/...` | in-memory key/value store | E4 | `automation/browser.go`; `automation/browser_compat_test.go`; `types/browser.d.ts` | 不等于浏览器 network/session protocol | 仅作为 OpenDesk context state 使用 |
| lifecycle | `newPage/newContext/close/isClosed` on Browser/Context | closed container 拒绝创建新对象，重复 close 幂等 | E4 | `automation/browser.go`; `automation/browser_lifecycle_test.go`; `types/browser.d.ts` | `Page` 没有独立 close/isClosed contract | 保持当前 bounded contract |
| HTTP stack request | `/executions` stack field | HTTP handler 接受 stack 并传给 execution request | E4 | `pkg/http/handler_test.go`; `pkg/execution/runner.go` | 证明 request routing，不证明 upgraded/playwright semantics | 保留 handler tests；以后 T2/T3 要另建 fixture |
| Playwright namespace / launch | `playwright.chromium.launch()` compatibility shim | 返回基于 `browserUpgraded` 的 launch handle，支持 newContext/getContext/getPage/close 组合 | E4 | `polyfills/010-browser-automation-upgraded.js`; `automation/browser_compat_test.go`; `examples/browser_stack_playwright_smoke.js` | 不启动 Chromium，不提供 DOM、tab 或 protocol | 仅按 Playwright-shaped shim 描述 |
| Compatibility facade recipes | legacy/upgraded/playwright smoke scripts | 当前 recipe 与 focused tests 验证同一 Runtime 内 facade/routing | E4 | `automation/browser_compat_test.go`; `examples/browser_stack_legacy_smoke.js`; `examples/browser_stack_upgraded_smoke.js`; `examples/browser_stack_playwright_smoke.js` | 没有浏览器进程、DOM 或真实 selector target | 保持 current-source T2 运行证据 |
| Real browser/desktop browser smoke | none | 当前没有 browser-driver T3 fixture/evidence | E0 | — | facade recipe 不能替代真实 target interaction | 真实 browser workload 出现后另建 T3 fixture |

## Current Interpretation

当前 Browser Automation 更准确的描述是：

> OpenDesk 拥有桌面级 `page`、输入与截图能力、内存 Browser/Context/Page 容器，以及当前
> Runtime 内的 upgraded/playwright compatibility facade；它们不是独立 browser process、DOM runtime
> 或 Playwright implementation。

因此当前禁止使用以下完成性措辞：

- full Playwright support
- Playwright parity
- fully supported browser automation
- production ready browser runtime
- well-tested browser semantics

除非未来对应能力达到与 Claim 匹配的 E4/E5 证据。
