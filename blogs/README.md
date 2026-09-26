# OpenDesk Blogs

`blogs/` 用于保存面向外部传播的文章草稿与已发布内容，不作为 OpenDesk 当前能力、架构或实现的 Source of Truth。

正式工程事实仍以当前源码、测试、Evidence 与 `docs/` / `docs/api/` 对应正式文档为准。

## 内容来源与当前策略

仓库**不创建 `docs/blogs/`**。不同生命周期的信息分别归属：

```text
docs/research/
= 市场、竞品、关键词、证据和未知项

docs/plans/commercialization/
= 产品定位、验证路线、内容增长和商业行动计划

docs/project/
= 已冻结且仍然有效的高层项目共识

blogs/
= 真正面向外部读者的传播正文
```

当前 Agent-driven RPA 内容入口：

- 产品定位与领先证明计划：[`../docs/plans/commercialization/agent-driven-rpa-positioning.md`](../docs/plans/commercialization/agent-driven-rpa-positioning.md)
- 内容增长策略：[`../docs/plans/commercialization/agent-driven-rpa-content-strategy.md`](../docs/plans/commercialization/agent-driven-rpa-content-strategy.md)
- 全球竞争位置与竞品研究：[`../docs/research/commercialization/agent-driven-rpa-positioning-2026.md`](../docs/research/commercialization/agent-driven-rpa-positioning-2026.md)
- 全球竞品能力矩阵：[`../docs/research/commercialization/agent-driven-rpa-competitor-matrix-2026.md`](../docs/research/commercialization/agent-driven-rpa-competitor-matrix-2026.md)
- Competitive Benchmark 合同：[`../docs/quality/agent-driven-rpa-competitive-benchmark.md`](../docs/quality/agent-driven-rpa-competitive-benchmark.md)
- 关键词与候选标题池：[`../docs/research/commercialization/agent-driven-rpa-content-keywords.md`](../docs/research/commercialization/agent-driven-rpa-content-keywords.md)

文章只有在完成内容策略规定的证据卡后，才进入 `blogs/drafts/`。Blog 中出现的竞争结论、Benchmark 数字或当前能力必须回指当前证据，不能靠旧 Blog 自我引用维持事实。

## 当前重点草稿

- [`drafts/where-opendesk-can-compete-top-3.md`](drafts/where-opendesk-can-compete-top-3.md)
  - 保存当前 Top 1 / Top 3 候选小山头的对外表达；
  - 明确区分“准备竞争的位置”和“已经取得的排名”；
  - 当前三条主线为 `Agent → Verified Reusable Desktop RPA`、`Commercial Delivery Runtime`、`Human + Agent → Same Maintainable Workflow`；
  - 只有后续 Competitive Benchmark 达到公开 Gate 后，才能把候选表述升级成有限范围内的排名结论。

- [`drafts/muse-vs-openclaw-personal-agent.md`](drafts/muse-vs-openclaw-personal-agent.md)
  - 比较 Meta Muse 与 OpenClaw 的产品理念、执行环境、设备控制和运维边界；
  - 将“更方便懒人用的 OpenClaw”限定为产品心智类比，而不是技术实现或代码来源判断；
  - 提炼 OpenDesk 可借鉴的组合：Muse 级易用性 + OpenClaw 级本机控制 + OpenDesk 的 Agent-to-Recipe / Verified Replay。

## 推荐结构

```text
blogs/
├── README.md
├── drafts/
└── published/        # 有正式发布内容后再创建
```

### `drafts/`

保存尚未正式发布，但已经具有传播价值的文章草稿。

适合：

- 为什么做某个设计；
- 为什么暂时不做某个功能；
- 技术方案取舍；
- 开发过程中的反直觉结论；
- Benchmark / Evidence 背后的工程故事；
- 产品定位与边界说明。

这类文章可以来自 `docs/research/`、`docs/plans/`、ADR、测试报告，但不要反过来让 Blog 成为工程事实源。

### `published/`

只有文章已经对外发布、且仓库确实需要保留最终版本时再创建。

如果未来官网或文档站有自己的内容目录，应以发布系统的正式结构为准，再决定是否迁移本目录。

## “否定型 Blog”

OpenDesk 很适合保留一类“为什么现在不做 X”的文章。

它们不是为了否定技术本身，而是说明：

```text
这个功能解决什么问题
→ 当前是否真的存在该问题
→ 引入它的新增复杂度
→ 为什么现阶段不值得做
→ 什么触发条件出现后会重新评估
```

这类文章有几个价值：

- 解释产品边界；
- 避免重复讨论已经评估过的方案；
- 让外部开发者理解技术选择；
- 为未来路线变化留下决策上下文；
- 可以形成持续的工程内容输出。

当前示例：

```text
drafts/why-opendesk-does-not-add-lua-yet.md
```

## 与工程文档的边界

```text
docs/research/
= 研究、证据、方案比较

docs/plans/
= 尚未实施或待验证的路线

docs/frameworks/ / architecture/ / implementation/
= 正式工程框架、架构与当前实现

blogs/
= 面向人的传播表达
```

Blogs 可以引用工程文档，但不要复制一整套事实导致双重维护。
