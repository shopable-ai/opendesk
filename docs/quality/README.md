# Quality

`docs/quality/` 只保存质量 contract、可复核 Evidence 规则、失败分类/案例与专项测试策略；不把施工日志或项目完成状态混入质量规范。

## Audited core

本轮实际校准的核心入口是：

```text
quality/
├── README.md
├── gates-and-evidence.md
├── failure-taxonomy.md
├── failure-cases.md
├── developer-test-catalog.md
├── golden-sample-strategy.md
├── agent-driven-rpa-competitive-benchmark.md
├── browser-automation/
├── layout/
└── wechat/
```

仓库可以存在其他平台/领域专项目录；它们不因为出现在 `quality/` 下就自动成为全局规范。上面的树只表示本轮已审计的核心角色，不虚构不存在的 `review/` 等目录。

## Desktop Measurement 状态入口

Desktop Measurement 当前产品完成度**不再**从历史 P0–P4、旧 Oracle Gap Matrix 或旧 Qualification 阶段结论推导。唯一 Current Coverage 入口是：

[`../architecture/desktop-automation/desktop-measurement-contract-coverage.md`](../architecture/desktop-automation/desktop-measurement-contract-coverage.md)

当前 UI / Interaction 合同是：

`apps/opendesk/prototypes/desktop-measurement/ORACLE.md`

以下文件保留历史与资格证据价值，但不是当前 Production 状态源：

- `desktop-measurement-oracle-gap-matrix.md`：2026-09-16 pre-fix audit；内部 `MATCH / WRONG / PARTIAL` 只描述当时树。
- `desktop-measurement-qualification.md`：保留历史 synthetic/native qualification 证据；其中旧的 “OPEN_IMPLEMENTATION / NOT_RUN” 快照必须以 Current Contract Coverage 重新核对后才能引用为当前状态。
- `desktop-measurement-prototype.md`：Prototype 过程与质量说明，不替代 Current Oracle。

三种状态始终分开：

```text
AUTOMATED_PASS
≠ MACOS_QUALIFIED
≠ WINDOWS_QUALIFIED
```

## Agent-driven RPA Competitive Benchmark

[`agent-driven-rpa-competitive-benchmark.md`](agent-driven-rpa-competitive-benchmark.md) 是当前公开 Top 3 / Top 1 竞争结论的 Benchmark 合同入口。

它固定：

```text
First-run
→ Author / Distill
→ Replay
→ Repair
→ Delivery
```

并要求：

- 各产品使用其最佳公开推荐路径；
- Human-first / Agent-first 分轨；
- macOS / Windows 分轨；
- 正常任务与 fault/mutation 分开；
- 业务结果使用独立 Oracle；
- 正常任务主动停止记 `INCOMPLETE`，只有 fault set 的正确停止才记 `CORRECT_STOP`；
- 无法公平取得环境的竞品记 `UNTESTED`，不能自动判负；
- Blog 或内部评分不能替代公开 Benchmark 结果。

## Document types

| Type | Question answered | Rule |
| --- | --- | --- |
| Gate | 什么时候允许继续？ | 必须有明确 pass/warn/fail 与停止条件 |
| Evidence | Claim 依据是什么？ | 指向当前存在的 code/test/runtime artifact；历史陈述不是证据 |
| Taxonomy | 有哪些失败类别？ | 根级只定义跨领域 Failure Class |
| Failure Case | 实际发生过什么？ | 必须记录环境、触发、期望/观测、Evidence、根因、修复、回归测试、状态 |
| Test Matrix | 当前测到哪一层？ | 区分 T1 unit / T2 integration / T3 real smoke |
| Golden Sample | 什么可以成为稳定回归基线？ | candidate 不等于 frozen；必须有 provenance/review/replay |
| Review | 如何人工/自动复核？ | 是文档角色，不要求存在独立 `review/` 目录；不负责宣告项目整体完成 |
| Benchmark | 如何比较版本/算法？ | 固定输入、断言、variance budget 与环境 |

开发测试脚本、测试域和 Markdown 失败记录的导航见
[`developer-test-catalog.md`](developer-test-catalog.md)。它是索引，不替代各域
的正式 gate、contract 或 Evidence 报告。

## Source-of-truth order

发生冲突时：

```text
current source
→ current runnable tests
→ current runtime evidence
→ formal quality/architecture docs
→ active plan
→ research
→ archive/history
```

## Global vs domain-specific

根级 `failure-taxonomy.md` 只定义 F0-F10 通用类别。

领域可以在子目录进一步定义症状/代码，例如：

- `browser-automation/`: stack/routing/runtime evidence
- `layout/`: separator/layout algorithm regression
- `wechat/`: window drift、OCR、chat target、send safety

领域代码必须映射回一个或多个全局 Failure Class，不应反向污染全局分类。

## Evidence language

禁止仅凭以下内容写 `passed/completed/supported/production ready`：

- 历史报告；
- 文件名；
- API 名称相似；
- 旧 smoke 曾成功；
- candidate golden sample；
- warn gate；
- 单个真实环境成功但没有范围边界。
