# Browser Automation Capability Matrix

本页以 2026-10-16 的 OpenDesk `master` 源码为基线，区分老兼容 facade、桌面 API
与真实（但有明确范围限制）的 Browser Core。公开签名仍以 `docs/api/` 为唯一来源。
E4 仅表示自动化测试存在，**不等于本轮真机 E5 通过**。

## Evidence levels

- E0：计划、历史声明或尚无实现
- E1：仅名称、签名或类型
- E2：适配、包装或路由
- E3：有真实运行代码
- E4：有可检查的自动化测试（仅证明对应测试所断言的行为）
- E5：本轮已在真实目标环境运行并保留审计证据

## Current capabilities

| Capability | Current owner / runtime reality | Evidence & scope | Public status |
| --- | --- | --- | --- |
| Desktop `page` | `automation/page.go`：截图、OS URL/App 打开、等待和权限；不是浏览器 DOM Page | E4：`tests/runtime-api/unit/page.test.js` | 正式桌面 API：`docs/api/page.md` |
| Desktop UI Locator | `UI.within(win).locator()`；懒解析当前窗口、OCR/image/native 目标；严格匹配，窗口身份保护，现有动作 owner | E4：`tests/runtime-api/ui-scope-locator.contract.test.js` 与 `tests/runtime-api/unit/ui-scope-locator.test.js`；原生场景另需 E5 | Experimental · Local：`docs/api/desktop-ui.md` |
| Native Accessibility | macOS AX / Windows UIA，执行期 refs、唯一性、read/perform/release | E4：`automation/accessibility*.go`、`tests/runtime-api/accessibility.js`；跨 OS 真机另验 | Experimental：`docs/api/accessibility.md` |
| BrowserDOM / Native adapter | `automation/browser_dom.go` → 已安装 Core Client；固定执行权限、真实 Tab/Frame/Document | E3/E4：`tests/runtime-api/browser_dom.js`、Browser Core 合同、MCP 测试；运行依赖 macOS Chrome + 安装 | 有范围限制的公开接口：`docs/api/browser-dom.md` |
| Browser Core Demo | `lab/browser-automation-core/` 的 broker/Chrome extension、有限语义 DOM 与动作 | E4：`tests/browser-automation-core/`，并非 Chrome 常规任意站点驱动 | 独立受控 browser execution（本仓库 lab） |
| Browser MCP tools | `pkg/mcpserver/browser.go` 转交同一 BrowserDOM owner，保留 Core 结构化结果 | E4：`pkg/mcpserver/browser_test.go` | MCP 工具 `tm_browser_*`，非新执行引擎 |
| Canonical browser evidence | Core Trace + Native adapter execution trace 记录实际 request/target/outcome | E4：`tests/browser-automation-core/evidence-contract.mjs` 等 | 结构化证据；ACK 不证明业务成功 |
| Legacy `browser/context/pageUpgraded/playwright` | `runtime_stack.go`、`polyfills/010-browser-automation-upgraded.js` 内兼容路由 / in-memory maps | E4：`automation/browser_compat_test.go`，只证明兼容 facade | 非公开旧接口，不提供 DOM/CDP/Playwright 驱动 |
| General browser Playwright Page / CSS / arbitrary JS / cross-origin | 不由上述旧 shim 或受控 BrowserDOM 实现 | E0 | 不支持，不能宣称 Playwright parity |
| Cross-surface orchestrated Browser + Desktop actions | 分别已有执行入口，尚无统一正式跨 surface 作业保证 | E0/E1 视具体入口而定 | 未作为完整统一框架发布 |
| Browser human-recording semantics | Desktop Recorder 不能直接推断真实 DOM 意图 | E0 | 未证明具备完整 browser semantic Recorder |

## Limits and directions

- 桌面：不把像素当成原生角色或控件值；不把观察视为业务完成；不在非幂等 unknown 后自动重试。
- 浏览器：实际授权受 origin/tab/document/session 约束；当前查询仅含 Core 的有限 role/label/text/testId/attribute/descendant，
  不应虚构 CSS、任意页面脚本、完整 ARIA/shadow DOM 或通用 Playwright 自动等待。
- MCP：不拼接元素 ref，不复用旧 document 的 target；trace、可见动作、业务成功须分别验证。
- 后续独立扩展方向：统一真实浏览器会话、通用网站覆盖和跨 surface orchestration；须重新取得 E4/E5，不通过扩张 legacy shim 实现。

关联：[正式 BrowserDOM Reference](../../api/browser-dom.md)、
[Desktop UI Reference](../../api/desktop-ui.md)、
[现有 Runtime Stack](stack.md)、
[旧兼容边界](legacy-compatibility.md)。
