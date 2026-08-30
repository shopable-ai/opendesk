# Browser Automation Current Backlog

本文件只保存当前未完成工作。历史 “completed in this pass / implemented outcome / previous pass” 不再作为 Active Plan。

Evidence 引用漂移由 `python3 scripts/validate_browser_automation_evidence.py` 做确定性检查；该脚本只验证引用完整性，不是 capability/semantics 认证器。

## P0

### B01 — Browser/Context lifecycle regression coverage

Status: open

Problem: `automation/browser.go` 已有 Browser/Context/Page ownership、close/isClosed、newPage/newContext，但当前缺 focused regression tests。

Current evidence: E3 implementation in `automation/browser.go`; public shape in `types/browser.d.ts`.

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

### B02 — Stack mode product decision

Status: open

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
