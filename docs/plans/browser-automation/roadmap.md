# Browser Automation Current Backlog

本文件只保存当前未完成工作。历史 “completed in this pass / implemented outcome / previous pass” 不再作为 Active Plan。

Evidence 引用漂移由 `python3 scripts/validate_browser_automation_evidence.py` 做确定性检查；该脚本只验证引用完整性，不是 capability/semantics 认证器。

## Real Browser execution track

这条路线用于建立真实 Browser execution surface；它与下面的历史 compatibility container 工作分开。所有条目在实际实现和验证前均为 planned，不因本文存在而获得 capability Evidence。

### B10 — Surface / ownership contract

Status: planned

冻结 Browser Agent、Browser Human、Desktop Agent、Desktop Human 四类事实来源。Desktop Recorder 不监听 Browser DOM；Browser Agent 的权威轨迹来自 Browser MCP/API execution；Browser Human demonstration 由 Browser Extension 独立采集。正文见 `docs/architecture/browser-automation/extension-runtime-bridge.md`。

### B11 — Browser execution owner + Extension connection

Status: planned

建立或复用唯一 Browser execution owner。P0 只选择一条主 transport，并在 Native Messaging、Native Messaging bootstrap + authenticated local WebSocket、直接 localhost 或 OS IPC 中基于生命周期、安全、事件吞吐和安装成本做决定。不得并行建设多套正式 transport。

### B12 — Browser MCP vertical slice

Status: planned

优先扩展现有 `cmd/opendesk-mcp` / `pkg/mcpserver`，让 Agent 能通过同一 Browser owner 完成受控 fixture 的 observe / locate / read / act / verify。没有当前代码证据时不新建第二个 MCP server。

### B13 — Browser Agent structured trace

Status: planned

把 Browser 请求、实际 target、动作、结果、后置 observation、verification 和 Evidence 绑定为一条权威 Agent Trace。不得再通过 Browser Recorder 或 Desktop Recorder 重录同一次 Agent action。

### B14 — Browser Agent golden sample

Status: planned

使用仓库可控网页 fixture 验证“输入业务参数 → 查询 → 读取运行时值 → 消费该真实值 → 提交 → 验证页面状态”的完整 Agent Browser 链。先证明 MCP/Browser owner/Extension/DOM/Trace/Evidence，再进入 Recipe 生产。

### B15 — Recipe Fresh Run + Qualification

Status: planned

将通过的 Browser Agent 示例接入现有 Agent-to-Recipe 后半段，生成普通 OpenDesk JavaScript Recipe 并独立 Fresh Run。不得因一次 MCP 成功就宣称可重复自动化。

### B16 — Browser Human capture

Status: planned

在 Agent Browser 链稳定后，再由 Extension 建立独立的人工网页演示采集。它保存 Browser-specific DOM/Tab 事实，不复制 Desktop Recorder，也不创建第二套 Human-to-Recipe。

### B17 — Human-to-Recipe Browser source

Status: planned

把固定 Browser Human Trace 作为新的 demonstration source 接入现有 Human-to-Recipe 生产链，复用适用的 Distill / Procedure / Recipe / Qualification 职责，同时保留 browser provenance。

### B18 — Browser + Desktop cross-surface

Status: planned

至少验证一个需要 Browser DOM → native/system UI → Browser DOM 的任务，证明 surface transition 由 Workflow/Recipe 显式编排，而不是两个 Recorder 相互监听。

### B19 — Driver / Playwright / Cloud provider

Status: deferred

在 Extension Provider 的 contract 与黄金链路稳定后，再评估 Playwright/CDP/Cloud Browser provider。不得为 API parity 扩展历史 Playwright-shaped shim。

## P0

### B01 — Browser/Context lifecycle regression coverage

Status: done

Problem: `automation/browser.go` 已有 Browser/Context/Page ownership、close/isClosed、newPage/newContext，但当前缺 focused regression tests。

Current evidence: E3 implementation in `automation/browser.go`; no maintained public TypeScript surface.

Target: 用确定性 Go tests 固定当前 container contract。

Acceptance:

- 覆盖 default context/page ownership；
- 覆盖 closed browser/context 后不能创建新对象；
- 覆盖 repeated close 不 panic；
- 不引入 browser-process/Playwright 语义 Claim。

Dependencies: none.

Risk: 测试可能暴露当前 API 对 closed state 返回 `nil` 而非 error 的模糊 contract。

Stop condition: 如果这些容器没有实际调用方，应优先缩小公开 contract，而不是扩展 abstraction。

Out of scope: real browser process lifecycle.

Execution record (2026-09-02):

- Decision: `EXTEND`; the existing container tests already covered most ownership and close behavior, so no second browser abstraction was added.
- Added a closed-state guard to `Browser.NewContext()` so a closed browser cannot append another context; the existing Go signature deliberately reports that state as `nil` rather than introducing a breaking return-type change.
- Added focused deterministic coverage for default context/page ownership, closed Browser/Context object creation, inventory stability, and repeated idempotent close.
- Updated the browser test matrix and capability Evidence manifest from E3 to E4 for this bounded container claim.
- Focused tests and the current-source JavaScript probe are recorded under `.runtime/tests/browser-automation/b01-browser-lifecycle-20260902/`; the successful Runtime run is `direct-20260902-154722-427000`.
- `go test ./automation -count=1` passed; the lifecycle-focused selection passed 7/7. The canonical JavaScript Runtime `unit` gate passed 418/418 in `.runtime/tests/runtime-api/20260902T-b01-browser-lifecycle/`.
- `python3 scripts/validate_browser_automation_evidence.py` passed with 8 claims / 26 references after calibrating one pre-existing screenshot type-name reference to the current `OpenDeskPageScreenshotOptions` declaration; the final manifest also cites the already-existing context-state tests rather than overextending the new lifecycle tests.
- `go test ./... -count=1` passed every package except the four known `pkg/visionrun` real-input/fixture baseline failures; B01 added no full-suite failure.
- The first JavaScript diagnostic used object identity across Goja exports and failed only those two invalid `===` assumptions. The retained passing probe instead verifies observable owner inventories; both logs remain in the B01 Evidence directory.
- Validation is limited to the in-process compatibility container. It is not browser-process, DOM, navigation, or Playwright runtime evidence.

### B02 — Stack mode product decision

Status: done

Problem: execution/HTTP 接受 `legacy/upgraded/playwright`，但当前初始化不会创建 upgraded facade globals。

Current evidence: conditional alias implementation + focused routing tests.

Target: 明确选择以下之一：

1. 仅把三个值保留为兼容 request metadata；或
2. 有真实消费方后，实现一个最小 upgraded facade contract。

Acceptance:

- 找到至少一个真实 caller/fixture；
- contract 明确列出支持与不支持语义；
- 新能力至少 T1 + T2；
- 文档不得使用 Playwright parity 表述。

Dependencies: consumer/use-case evidence.

Risk: 为名称一致性恢复历史 facade，会重新制造无语义的兼容层。

Stop condition: 没有真实 consumer 时不实现。

Out of scope: full Playwright compatibility.

Execution record (2026-09-02):

- Decision: `EXTEND`; current source already chose the bounded upgraded/playwright compatibility facade option through `polyfills/010-browser-automation-upgraded.js`, so no second stack system was created.
- At the time of this 2026-09-02 record, tracked callers existed in
  `examples/browser_stack_{legacy,upgraded,playwright}_smoke.js`. They were removed from the public examples on
  2026-09-05 when the facade was reclassified as implementation-only compatibility code.
- Audit found architecture/quality documents that incorrectly said the facade, Playwright-shaped shim, and smoke recipes were absent; those facts were calibrated to current source and focused tests.
- The upgraded and playwright public recipes initially hung because they overwrote an owner's same-name `waitFor`/`evaluate` method and relied on Goja wrapper identity. They now retain owner methods on the prototype and assert observable facade behavior before reporting success.
- From the repository root, the exact README commands passed against current source: legacy run `direct-20260902-155842-667000`, upgraded run `direct-20260902-160242-685000`, and playwright run `direct-20260902-160242-291000`. Logs are under `.runtime/tests/browser-automation/b02-stack-mode-product-decision-20260902/`.
- Focused facade tests passed 28/28; execution stack tests passed 5/5 and HTTP stack handler tests passed 4/4. The Evidence validator passed with 9 claims / 32 references.
- `go test ./... -count=1` again passed every package except the same four known `pkg/visionrun` real-input/fixture baseline failures; B02 added no Go test failure.
- Proof remains T1/T2 compatibility routing only: no browser process, DOM selector engine, tab protocol, page realm, or Playwright parity is claimed.
- Product recalibration (2026-09-05): example files and public Runtime API catalog/type entries were removed.
  The underlying shim remains only to avoid an unreviewed breaking deletion; new scripts omit `-stack` and cannot
  treat `browser` / `context` as maintained user APIs.

## P1

### B04 — Page navigation contract

Status: open

Problem: `page.goto` 名称容易让调用方误以为是 browser navigation，但当前实现是 OS URL launcher。

Current evidence: `automation/page.go`, `polyfills/000-page.js`.

Target: 决定是保留并强化文档边界，还是新增名称更准确的 browser-driver adapter。

Acceptance: 任一新 browser navigation 实现都必须有可验证 postcondition，而不是只看调用成功。

Dependencies: real browser automation use case.

Risk: API 名称产生能力错觉。

Stop condition: 没有 DOM/tab 需求时保持现状，不新增 adapter。

Out of scope: migration solely for naming aesthetics.

### B05 — Screenshot evidence fixture

Status: open

Problem: screenshot 有 E3 runtime implementation，但本轮没有受控 T2/T3 fixture。

Current evidence: `automation/page.go`.

Target: 建立平台可控、低风险 screenshot smoke。

Acceptance: 记录 platform、target、bounds、artifact path、expected postcondition；失败可区分 permission/environment 与 implementation。

Dependencies: available desktop environment.

Risk: CI/headless 与桌面权限差异。

Stop condition: 无受控桌面环境时不伪造 E5。

Out of scope: arbitrary app visual benchmark.

## P2

### B06 — Selector / locator / evaluate exploration

Status: deferred

Problem: 当前没有 `waitForSelector/locator/page.evaluate/page.click/type/press` browser surface。

Current evidence: E0 in capability matrix.

Target: 仅在真实 workload 无法由现有 desktop target-resolution 表达时研究。

Acceptance: 先定义 target model、page realm、安全边界、failure modes 和 T1/T2 fixture，再写实现。

Dependencies: validated workload and browser runtime choice.

Risk: 重建一个表面像 Playwright、实际语义不完整的 facade。

Stop condition: 可以通过现有 desktop automation 或外部成熟 browser driver 解决时，不自研。

Out of scope: parity for parity's sake.
