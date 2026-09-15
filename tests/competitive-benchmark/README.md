# Agent-driven RPA Competitive Benchmark

本目录是 `docs/quality/agent-driven-rpa-competitive-benchmark.md` 的执行入口。

当前状态：**只建立 qualification manifest 与执行合同，尚未运行任何跨产品 Benchmark。**

因此这里的 `UNTESTED` / `NOT_RUN` / `BLOCKED_*` 都是事实状态，不表示任何竞品失败。

## 当前入口

- [`qualification-manifest.json`](qualification-manifest.json)：产品、任务族、phase、发布 Gate 和当前阻塞状态；
- [`../../docs/quality/agent-driven-rpa-competitive-benchmark.md`](../../docs/quality/agent-driven-rpa-competitive-benchmark.md)：公平比较规则、Oracle、指标和 Top 3 / Top 1 宣传门槛；
- [`../../docs/research/commercialization/agent-driven-rpa-competitor-matrix-2026.md`](../../docs/research/commercialization/agent-driven-rpa-competitor-matrix-2026.md)：决定测谁、为什么测的当前竞品研究。

## 实施顺序

```text
S1 Freeze public baseline apps / versions / models
→ S2 Implement independent task oracles
→ S3 Implement OpenDesk runner + neutral result schema
→ S4 Add competitor adapters one by one
→ S5 Run First-run / Author-Distill / Replay
→ S6 Build controlled mutation fixture
→ S7 Run Repair
→ S8 Freeze independent-developer comparison set
→ S9 Run clean-machine Delivery
→ S10 Publish stable report under docs/quality/competitive-benchmark/
```

## 结果格式原则

每个 run 至少输出：

```text
benchmarkVersion
product
productVersion
platform
appVersion
agentClient
model
phase
taskFamily
inputId
start/end/duration
actionCount
observationCount
humanInterventions
modelUsage (when measurable)
outcome
oracleResult
falseSuccess
unsafeSideEffects
evidenceRefs
notes
```

统一 outcome：

```text
CORRECT_SUCCESS
CORRECT_STOP
INCOMPLETE
FALSE_SUCCESS
UNSAFE_SIDE_EFFECT
HARNESS_FAILURE
EXTERNAL_BLOCKER
UNTESTED
```

正常任务停止是 `INCOMPLETE`；`CORRECT_STOP` 只用于故障/异常样本。

## 近期最小可执行目标

第一轮不要同时接所有竞品。

优先完成：

```text
macOS:
OpenDesk + Cua + Peekaboo

Windows:
OpenDesk + Cua + ADH
```

任务先固定：

```text
Calculator
Text editor
File manager
```

先把：

```text
First-run
→ reusable asset
→ 20 normal replay inputs
```

跑通完整证据链，再增加 Spreadsheet、Electron、Repair fixture 和 enterprise products。

任何公开排名前，再按 Quality Contract 提升到规定的 held-out 样本量和 strongest-substitute coverage。
