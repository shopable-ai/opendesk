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
├── golden-sample-strategy.md
├── browser-automation/
├── layout/
└── wechat/
```

仓库可以存在其他平台/领域专项目录；它们不因为出现在 `quality/` 下就自动成为全局规范。上面的树只表示本轮已审计的核心角色，不虚构不存在的 `review/` 等目录。

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
