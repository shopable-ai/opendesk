# OpenDesk 商业化与定位计划

本目录保存已经从 Research 收口、但仍需要通过真实产品、市场和收入证据完成的商业化计划。

它不是市场事实库，也不是 Blog 目录。

## 当前执行链

```text
Research / Evidence
        ↓
产品定位与竞争位置
        ↓
12 个月产品 / 商业路线
        ↓
首批客户与付费验证
        ↓
内容 / Demo / Benchmark 获客
        ↓
真实付费、复用与维护证据
        ↓
更新定位和下一阶段路线
```

## 1. Agent-driven RPA 定位与领先证明

[`agent-driven-rpa-positioning.md`](agent-driven-rpa-positioning.md)

负责：

- 当前主赛道：`Agent-driven RPA`；
- 第一个全球竞争小山头：`Agent → Verified Reusable Desktop RPA`；
- 五个竞争位置各自的产品角色；
- 全球与中国两套竞争账本；
- Agent-first + Human-first authoring 的统一方向；
- First-run / Replay / Repair / Delivery 四类领先证明；
- 什么时候可以说“领先”、什么时候仍只能说“候选”。

上游研究：

[`../../research/commercialization/agent-driven-rpa-positioning-2026.md`](../../research/commercialization/agent-driven-rpa-positioning-2026.md)

## 2. 未来 12 个月战略

[`opendesk-12-month-strategy.md`](opendesk-12-month-strategy.md)

负责：

- 真实付费与续费；
- Desktop Reliability / Business Verification；
- Demonstration / Agent → Recipe → Qualification；
- 低摩擦交付；
- 复用、Repair 和支持成本；
- 0—3 / 3—6 / 6—12 个月阶段门槛。

它回答“未来一年优先投入什么”，不重复维护竞品事实。

## 3. 商业验证推进

[`business-validation-roadmap.md`](business-validation-roadmap.md)

负责：

- 首批客户；
- 1—3 个有限场景；
- 商品与报价；
- 付费试点；
- 成本、维护与跨客户复用；
- 继续 / 调整 / 停止条件。

它回答“怎样证明有人愿意付钱”，不把点赞、Star、等待名单当成交。

## 4. 内容与获客

[`agent-driven-rpa-content-strategy.md`](agent-driven-rpa-content-strategy.md)

负责：

- 面向哪些受众；
- 内容支柱；
- 第一阶段只写哪 6 篇；
- 竞品比较的证据门槛；
- 英文与中文的不同作用；
- 统一 CTA；
- 如何从内容转到试用、Workflow qualification 和付费实施。

关键词、竞品词和候选标题池属于支持研究：

[`../../research/commercialization/agent-driven-rpa-content-keywords.md`](../../research/commercialization/agent-driven-rpa-content-keywords.md)

真正 Blog 正文只进入仓库根目录：

```text
blogs/drafts/
blogs/published/   # 确实发布后再创建
```

不要创建 `docs/blogs/`。

## 文档职责边界

```text
docs/research/commercialization/
= 市场事实、竞品证据、关键词、评分、候选和未知项

docs/plans/commercialization/
= 已选择的方向、验证路线、商业行动与内容执行计划

docs/project/
= 当前仍然有效的高层项目共识

blogs/
= 面向外部读者的传播内容
```

当 Research 结论变化时，先更新 Research，再判断是否需要修改 Plan；不能因为某篇 Blog 写了一个观点，就反向修改工程事实。
