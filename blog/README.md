# Clawdesk Blog

`blog/` 用于保存面向外部传播的文章草稿与已发布内容，不作为 Clawdesk 当前能力、架构或实现的 Source of Truth。

正式工程事实仍以当前源码、测试、Evidence 与 `docs/` / `docs-user-api/` 对应正式文档为准。

## 推荐结构

```text
blog/
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

Clawdesk 很适合保留一类“为什么现在不做 X”的文章。

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
drafts/why-clawdesk-does-not-add-lua-yet.md
```

## 与工程文档的边界

```text
docs/research/
= 研究、证据、方案比较

docs/plans/
= 尚未实施或待验证的路线

docs/frameworks/ / architecture/ / implementation/
= 正式工程框架、架构与当前实现

blog/
= 面向人的传播表达
```

Blog 可以引用工程文档，但不要复制一整套事实导致双重维护。
