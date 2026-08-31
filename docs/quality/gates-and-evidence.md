# Gates and Evidence

本文件定义 OpenDesk framework-level 质量门禁。Scenario 可以增加字段与 Gate，但不能把领域专有 artifact 写成全局 runtime 必然产物。

## Core principles

- 没有 Evidence 不算完成；没有可复核工件不算通过。
- 结构先于语义，语义先于动作。
- 高风险动作必须有独立 Gate，不能由低风险 smoke 成功自动放行。
- `pass` 才能进入依赖该 Gate 的下一阶段；`warn` 只能继续 probe/diagnosis；`fail` 必须 stop、recovery 或 escalate。
- Golden candidate != frozen baseline。

## Current generic runtime evidence baseline

`pkg/execution/artifacts.go` 当前通用 execution runtime 明确准备：

```text
stdout.log
stderr.log
script_snapshot.<ext>
summary.json
agent_summary.json
events.ndjson
```

这些是当前 framework-level artifact baseline。

以下工件只在对应 scenario/runtime 明确生成时才可要求，不能写成全局默认：

```text
capture/source.png
dom_snapshot.json
a11y_snapshot.json
detect/layout_model.json
infer/zones.json
infer/ocr_map.json
verify/actionability_report.json
checkpoints/
replay/
decision.json
```

## Framework-level gates

### G0 Environment / Precondition

检查当前任务真正依赖的环境：输入、权限、目标进程/窗口、依赖版本、可写 artifact 目录等。

失败：不得执行依赖该条件的动作。

### G1 Acquisition / Observation

要求：

- 当前状态可观察；
- 目标身份/窗口/页面/坐标没有明显漂移；
- 关键 raw evidence 可追溯到本次 run。

如果任务不需要 screenshot/OCR/DOM，不得强制制造这些 artifact。

### G2 Perception / Structure

适用于需要视觉/OCR/结构检测的场景。

要求：结构输出完整、关键异常可解释、明显漂移不被静默吞掉。

### G3 Semantic / Target Resolution

要求：

- semantic interpretation 有 supporting evidence；
- target candidate 可解释；
- blocking/ambiguous state 优先暴露；
- 不能把低置信度单点 OCR/视觉结果直接升级为动作目标。

### G4 Actionability

每个将被执行的 intent 至少需要：

- target；
- precondition；
- expected postcondition；
- failure/stop strategy；
- 足以回溯目标选择的 evidence。

### G5 Action Verification

动作完成不等于任务完成。必须根据场景验证 postcondition；不能只以 API 返回 nil/error 作为业务成功证明。

### G6 High-Risk Safety

对于 send / submit / delete / purchase / payment 等高风险动作：

- 必须独立判断 target identity、current state、user intent/authorization 与 postcondition；
- 必须允许 stop / human confirmation；
- 普通 click/open/screenshot smoke 不能自动放行高风险动作。

### G7 Evidence / Recovery

要求：

- 最终 Claim 能追到当前 code/test/runtime artifact；
- 失败原因能映射到 failure taxonomy/case；
- 需要 retry/replay 的场景有足够 checkpoint/state evidence；
- 缺失关键 evidence 时 verdict 不能是 pass。

## Scenario-specific gates

Scenario 文档可以增加 Gate，例如：

- layout separator quality；
- browser stack routing；
- WeChat chat identity/send safety；
- OCR provider quality；
- MCP transport contract。

但必须明确：

- 适用 scope；
- 依赖哪些 current artifacts；
- 哪些是 mandatory，哪些是 optional；
- pass/warn/fail 语义；
- 失败对应 F0-F10 哪一类。

## Golden promotion

Golden sample 的 promotion 不属于普通 run 的默认 G0-G7。Candidate 只有在 provenance、assertions、variance budget、review 和 replay evidence 足够时，才能进入 `Frozen` 状态。详细规则见 `golden-sample-strategy.md`。

## Reporting language

允许：

- `T1 unit test passed for X contract`
- `T2 routing integration passed`
- `T3 smoke passed on <environment> for <bounded scenario>`

不允许把上述任一项直接扩写为：

- all scenarios passed
- production ready
- full Playwright support
- fully safe send flow

除非存在与该范围匹配的当前 Evidence。
