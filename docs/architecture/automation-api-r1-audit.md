# OpenDesk Automation API R1.0 — Source-based gap audit

基线：2026-10-16，仓库 `shopable-ai/opendesk`，仅 `master` 修改。此文件记录
源码证据与优化取舍；正式 API 行为仍以 `docs/api/` 为准，不重复维护独立 Reference。

## P0/P1 gap matrix

| Domain | Existing owner / actual API | Gap / decision | Code & test evidence |
| --- | --- | --- | --- |
| Desktop page | `automation/page.go`、`polyfills/000-page.js` | 维持 OS Page 语义，不伪装 DOM Page；不改 | `docs/api/page.md`、`tests/runtime-api/unit/page.test.js` |
| Native Locator | `polyfills/012-ui-scope-locator.js`，`UI.within(win).locator(target)` | P0：禁止冲突 `text/name` 丢失约束；native ref read 后再确认身份；现有 wait/tap 入口不复制 | `tests/runtime-api/ui-scope-locator.contract.test.js`、`tests/runtime-api/unit/ui-scope-locator.test.js` |
| Native AX/UIA | `automation/accessibility.go`、`accessibility_runtime.go` | 复用当前 find/read/release 的唯一性/过期/完整性/权限；不发明元素 handle | `docs/api/accessibility.md` |
| OCR/Image | `polyfills/006-ui.js` | 保持实际 source 与局部视觉能力；不推导原生字段；保留高置信度模板门槛和 fail-closed | `docs/api/desktop-ui.md` |
| Browser DOM | `automation/browser_dom.go`、`automation/browser_core_adapter.mjs` | P0：显然无效的操作与多余顶层参数在启动 Client 前拒绝；其余请求仍受 Core 授权与生命周期保护 | `automation/browser_dom_preflight_test.go`、`tests/runtime-api/browser_dom.js` |
| Browser selector engine | `lab/browser-automation-core/extension/locator.js` | P0：未知 query 字段不得被忽略；纯空白身份必须拒绝；保留唯一匹配与非任意 JS/CSS 范围 | `tests/browser-automation-core/locator.test.mjs` |
| JS SDK ergonomics | `types/BrowserDOM.d.ts`、`types/UI.d.ts` | P1：BrowserDOM query/condition 改成语义区分类型，编辑器提示具体字段；不创建竞争 locator owner | `docs/api/browser-dom.md` |
| MCP / Agent | `pkg/mcpserver/browser.go` | P1：向 AI 暴露受约束的 Core query 字段提示，非法额外字段在 Core 前拦截；不发明快照 ref | `pkg/mcpserver/browser_test.go` |
| Legacy browser | `polyfills/010-browser-automation-upgraded.js`、`runtime_stack.go` | 保留旧脚本兼容；**不是** Playwright Browser / DOM / CDP | `docs/architecture/browser-automation/legacy-compatibility.md` |
| Developer selector UI | `apps/opendesk/inspector-launcher.js`、既有 Inspector/Recorder | P2：需要真实用户操作路径与截图差距再更改；不把新 UI 作为 API R1 前置条件 | 真机截图与正式安装验证待补 |

## Playwright / MCP feature comparison

| Playwright pattern | R1 disposition |
| --- | --- |
| Lazy Locator | 原生桌面 Scope Locator 已有；浏览器 Core 为显式即时 locate，不谎称 lazy |
| Exact role/text/label | 桌面支持原生 role/name/identifier、OCR text；浏览器仅现有受限查询 |
| Chaining/filter | 当前 Browser Core 只支持受控一层 descendant relation；不增加第二套 DOM selector engine |
| Strictness | 现有 find / locate 唯一性 + 新增未知条件拒绝；不取第一候选 |
| Auto-wait / actionability | 桌面 readonly waitFor、Core wait；未证明可见/稳定/无遮挡不虚构 |
| Target lifetime | native ref 只在一次 find/read 使用后释放；browser opaque target 随文档和 session 失效 |
| Postconditions | `UI.setValue` 同 ref 回读；BrowserDOM.verify；业务成功仍需独立验证 |
| Accessibility snapshots | 原生 `Accessibility.snapshot` 与 Core `observe` 来源区分；不合并成虚假统一树 |
| Agent target refs | 保持 Core opaque target 原样和生命周期；不拼接 Playwright MCP `e1` 风格假 ref |

## Tests and evidence classification

- 源码/契约：Node `tests/runtime-api/ui-scope-locator.contract.test.js`、
  `node --test tests/browser-automation-core/locator.test.mjs`、
  `go test ./automation ./pkg/mcpserver`（原生/Go 测试可能需要当前编译环境）。
- OpenDesk 正式 JS：`OPENDESK_RUNTIME_API_MODE=unit ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script`；
  `./dist/opendesk -script tests/runtime-api/browser_dom.js -console-mode script`。
- 独立复测：本轮在 JS V8 隔离环境执行了 18 条 Scope/Locator 合同用例与
  12 条 Runtime JS fake-owner 单元用例，通过；**不声称已经执行本地 Node、构建后的 Goja Runtime、
  真实 macOS AX、Chromium、MCP 调用或业务完成**。
- E5 待本地 Mac：先核验现有 `tests/runtime-api/ui-scope-locator-native-macos.js` 真实窗口、权限、
  真实图片与文字、点击次数、生命周期和截图；Browser Core 必须重新加载匹配代码 hash 的扩展，
  然后用受控 loopback fixture 验证真实 DOM、MCP target 和动作后置。
- 不可用的测试标记 NOT RUN 或 BLOCKED，禁止算 PASS。发布前独立验证
  `node scripts/api-docs.js check`、`node scripts/check_api_docs_contract.js`。

## Remaining risks / next step

1. P1：统一可读 Trace 摘要、错误恢复建议；不要从 action ACK 推断业务成功。
2. P1：需要正式的真实浏览器能力时由既有 Browser Core/独立 Browser SDK owner 提供，不把 legacy `playwright` 变成假驱动。
3. P2：用真实 Inspector 使用流程与屏幕证据评估选择器生成、匹配数和局部调试；不要为 R1 盲目建第二个面板。
4. Windows/macOS 平台能力和原生 UI 的真实工作流要分别验收；没有证据的评分不得标 95。
