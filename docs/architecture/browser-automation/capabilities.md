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
| Runtime stack name selection | `legacy` / `upgraded` / `playwright` | `NormalizeRuntimeStack` 接受三个名称；`ApplyRuntimeStackMode` 仅在 `*Upgraded` globals 已存在时做 alias | E4 | `automation/runtime_stack.go`; `automation/runtime_stack_test.go`; `pkg/execution/runner.go`; `pkg/http/handler_test.go` | 当前初始化代码不会创建 `pageUpgraded/browserUpgraded/contextUpgraded` | 保持名称兼容；除非有真实需求，不宣称 upgraded/playwright facade 已落地 |
| Current JS globals | `page`, `browser`, `context`, `mouse`, `keyboard`, `touchscreen` | `InitJSWithOptions` 注入当前 Go 对象，再加载现有 polyfills | E3 | `automation/utils.go`; `polyfills/000-page.js` | 不是浏览器 DOM runtime | 为关键 surface 补小型 runtime integration tests |
| Raw inject handles | `page____Inject`, `browser____Inject`, `context____Inject` | 初始化时明确保留，主要供兼容 wrapper 使用 | E3 | `automation/utils.go` | 私有兼容入口，不应作为新公共 API 扩散 | 仅在迁移/诊断时使用 |
| `page` API shape | screenshot/goto/open/wait/permission + input devices | Type declarations 与 Go Page 基础能力存在 | E3 | `types/page.d.ts`; `automation/page.go`; `polyfills/000-page.js` | 没有当前 `page.click/type/press/waitForSelector/locator/evaluate` surface | 文档与调用方只使用真实 surface |
| `goto` / URL open | `page.goto`, `openURL`, `openURLInApp` | 通过 OS `open` / `start` / `xdg-open` 启动 URL/应用 | E3 | `automation/page.go`; `polyfills/000-page.js` | 不控制 tab、DOM navigation 或 network-idle | 若需要浏览器导航语义，单独设计 runtime adapter |
| `waitFor` / `waitForTimeout` | number / predicate compatibility | timer/polling compatibility；Go string 分支不是 selector wait | E3 | `automation/page.go`; `polyfills/000-page.js`; `types/page.d.ts` | 不等于 Playwright selector/event semantics | 保持 timer/predicate 口径；不要把字符串解释为 selector Claim |
| `waitForNavigation` | compatibility method | 当前主要通过 timeout/URL change polling 近似 | E3 | `automation/page.go`; `polyfills/000-page.js` | 没有真实浏览器 navigation event contract | 若业务需要，先定义可验证 postcondition |
| `waitForSelector` | none | 当前未找到公开声明、polyfill 或 Go implementation | E0 | — | 不支持当前 Claim | 仅在明确用户场景需要时实现 |
| `locator` | none | 当前未找到 locator facade | E0 | — | 不支持当前 Claim | 不从 API 名称推导 Playwright parity |
| `page.click` / `page.type` / `page.press` | none | 页面级 selector action 当前不存在；桌面输入仍由 `mouse` / `keyboard` 提供 | E0 | — | desktop input ≠ selector action | 需要 selector action 时先定义 target-resolution contract |
| `page.evaluate` | none | 当前没有浏览器页面 realm evaluate | E0 | — | Goja 脚本执行不等于页面 DOM evaluate | 需要时单独实现并测试隔离边界 |
| screenshot | `page.screenshot` / `Screen.screenshot` | 当前实现是桌面/窗口/屏幕截图 | E3 | `automation/page.go`; `automation/utils.go`; `types/page.d.ts` | 不是浏览器 page screenshot semantics；本轮无 E5 | 增加可控 fixture 后再做 T3 smoke |
| Browser / Context containers | `browser`, `context`; `newPage/newContext/pages/contexts` | Go 中维护 in-memory Browser/Context/Page ownership | E3 | `automation/browser.go`; `types/browser.d.ts`; `automation/utils.go` | 不代表 browser process、incognito context 或 tab protocol | 为 ownership/lifecycle 补 focused unit tests |
| cookies | `context.cookies/setCookies/clearCookies` | in-memory map slice | E3 | `automation/browser.go`; `types/browser.d.ts` | 不连接真实浏览器 cookie jar | 若要真实 session，需要 runtime adapter |
| storage | `context.storage/...` | in-memory key/value store | E3 | `automation/browser.go`; `types/browser.d.ts` | 不等于 localStorage/sessionStorage | 保持命名边界或未来重命名避免歧义 |
| session | `context.session/...` | in-memory key/value store | E3 | `automation/browser.go`; `types/browser.d.ts` | 不等于浏览器 network/session protocol | 仅作为 OpenDesk context state 使用 |
| lifecycle | `newPage/newContext/close/isClosed` on Browser/Context | Go container 有 closed state；closed 后拒绝创建 page/context | E3 | `automation/browser.go`; `types/browser.d.ts` | `Page` 没有独立 close/isClosed contract | 补 Browser/Context lifecycle unit tests |
| HTTP stack request | `/executions` stack field | HTTP handler 接受 stack 并传给 execution request | E4 | `pkg/http/handler_test.go`; `pkg/execution/runner.go` | 证明 request routing，不证明 upgraded/playwright semantics | 保留 handler tests；以后 T2/T3 要另建 fixture |
| Playwright namespace / launch | none | 当前 tree 未找到 `playwright.chromium.launch()` 实现 | E0 | — | 不存在 Playwright runtime shim 的当前证据 | 删除/降级历史 Claim；有真实需求再设计 |
| Real browser/desktop browser smoke | none in current browser evidence set | 本轮没有可运行的 Browser T3 fixture/evidence entrypoint | E0 | — | 历史 smoke 文件已不在当前 tree | 先建立确定性 T1/T2，再决定是否恢复最小 T3 |

## Current Interpretation

当前 Browser Automation 更准确的描述是：

> OpenDesk 拥有桌面级 `page`、输入与截图能力，以及内存中的 Browser/Context/Page 容器；execution/HTTP 接受 `legacy/upgraded/playwright` stack 名称，但 upgraded/playwright 当前没有独立 facade/runtime 实现。

因此当前禁止使用以下完成性措辞：

- full Playwright support
- Playwright parity
- fully supported browser automation
- production ready browser runtime
- well-tested browser semantics

除非未来对应能力达到与 Claim 匹配的 E4/E5 证据。
