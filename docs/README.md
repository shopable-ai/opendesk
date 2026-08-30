# Clawdesk 项目文档

本目录是 Clawdesk 的**项目与工程文档根目录**。

本文件定义 `docs/` 的文档角色、权威关系、目标结构和新增文档规则。整理迁移期间，旧文件可能仍暂时位于 `docs/` 根目录；其目标位置以 `maintenance/docs-migration-map.md` 为准。

## 文档权威边界

Clawdesk 当前只保留两类正式文档根：

- `docs/`：项目、架构、实现、质量、集成、场景、研究、计划和仓库治理文档。
- `docs-user-api/`：**唯一用户 API 文档根目录**，包括用户可见的脚本/runtime API、HTTP API、示例和机器可读 API 索引。

以下历史 API 文档树已经退役，不得重新作为并行 Source of Truth：

- `docs-api/`
- `docs-api-user/`
- `docs/api/`

API 事实优先级：

1. 当前源代码 / runtime 行为
2. `docs-user-api/runtime-api.ai.json`
3. `docs-user-api/*.md`
4. Git 历史

项目工程文档事实优先级：

1. 当前维护的 `docs/` 正式文档
2. 当前源代码、测试和运行证据
3. `docs/research/`、`docs/plans/` 等过程输入
4. `.archive/` 和 Git 历史

## 文档类型

`docs/` 内长期只保留以下文档类型。

### 1. Canonical / Source of Truth

当前仍有效、未来开发需要维护的正式文档，例如：

- 项目概览
- 当前架构
- 当前实现说明
- 当前运行手册
- 当前质量门禁和测试规范

同一主题只允许一个当前有效的正式文档。

### 2. Decision

已经做出的关键技术决策，优先进入：

```text
docs/architecture/decisions/
```

长期建议使用 ADR 命名，例如：

```text
ADR-001-desktop-automation-stack.md
```

### 3. Research

调研、竞品、候选方案、探索性分析进入：

```text
docs/research/
```

Research 是决策输入，不应与正式架构文档竞争权威。

### 4. Plan / Quality

仍在执行的计划进入 `docs/plans/`；稳定测试标准、Gate、Failure Taxonomy、Review Rubric 等进入 `docs/quality/`。

### 5. Historical

阶段总结、旧版本、一次性分析、已失效方案等，不应继续留在正式文档面：

- 有长期追溯价值：`.archive/`
- 只是 Git 已保存的低价值中间产物：合并有效信息后删除

## 目标目录结构

文档整理后的目标结构：

```text
docs/
├── README.md
├── project/
│   ├── overview.md
│   └── current-context.md
├── architecture/
│   ├── README.md
│   ├── execution/
│   ├── desktop-automation/
│   ├── browser-automation/
│   └── decisions/
├── implementation/
│   ├── README.md
│   ├── macos/
│   ├── layout/
│   ├── ocr/
│   └── runtime/
├── quality/
│   ├── gates-and-evidence.md
│   ├── testing-guide.md
│   ├── failure-taxonomy.md
│   └── review/
├── integrations/
│   └── mcp/
├── scenarios/
│   ├── wechat/
│   └── discuz/
├── research/
├── plans/
└── maintenance/
```

说明：目录只在有实际正式文件时创建，不为了“看起来完整”制造空目录。

## 非 `docs/` 内容

以下内容默认不进入 `docs/`：

| 内容 | 目标位置 |
|---|---|
| 用户 API 文档 | `docs-user-api/` |
| 可复用 golden sample / fixture | `artifacts/fixtures/` |
| 需要长期保存的测试/评审报告 | `artifacts/reports/` |
| 运行日志、截图、probe、smoke 输出 | `.runtime/` |
| 本机环境和工具状态 | `.dev/` |
| 历史报告、旧文档 | `.archive/` |
| 可复用 AI Prompt | `prompts/`（若项目确认继续维护） |

Prompt 不应因为曾用于开发某个功能就永久留在 `docs/`。

## 根目录规则

迁移完成后，`docs/` 根目录原则上只保留：

```text
README.md
```

以及分类目录。

新增专题文档不得继续直接平铺到 `docs/` 根目录。

迁移期间的 61 个现有根目录文件，统一按照：

```text
docs/maintenance/docs-migration-map.md
```

处理。

## 命名规则

正式文档优先使用：

```text
lower-kebab-case.md
```

例如：

```text
action-target-model.md
failure-taxonomy.md
testing-guide.md
```

禁止通过文件名维护版本历史：

```text
xxx_V2.md
xxx_V3.md
xxx_FINAL.md
xxx_FINAL_FINAL.md
```

正式文档直接更新当前文件，历史由 Git 保存。

时间型材料可使用日期：

```text
research/YYYY-MM-DD-topic.md
plans/YYYY-MM-DD-topic.md
artifacts/reports/YYYY-MM-DD-topic-report.md
```

## 新建文档前检查

新建任何文件前必须回答：

1. 这是什么文档类型？
2. 当前是否已经有同主题 Source of Truth？
3. 它属于 `docs/`、`docs-user-api/`、`artifacts/`、`.runtime/`、`.archive/` 还是 `prompts/`？
4. 它是长期正式知识，还是研究/计划/一次性过程产物？
5. 如果任务结束，这个文件是否还应该继续存在？

如果无法回答，默认不要把新文件直接写入 `docs/` 根目录。

## 当前迁移状态

当前处于文档治理 P0：

- 已确定文档权威边界。
- 已确认 `docs-user-api/` 是唯一用户 API 文档根。
- 已建立 `docs/` 目标信息架构。
- 已建立 61 个根目录文件的迁移矩阵。
- P0 不进行高风险批量移动；P1 开始按专题迁移并修复链接；P2 再做内容合并、删除和归档。

相关治理文档：

- `maintenance/repository-documentation-map.md`
- `maintenance/repo-file-lifecycle-policy.md`
- `maintenance/docs-migration-map.md`
- `maintenance/repo-layout-refactor-plan.md`
- `maintenance/repo-migration-map-and-p0-batch.md`
