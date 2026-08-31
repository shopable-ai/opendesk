# Clawdesk 项目文档

`docs/` 是 Clawdesk 的**项目与工程文档根目录**。本目录已经完成 2026-08 文档结构收敛：根目录不再平铺专题、阶段报告、Prompt 或版本化草稿。

## 文档权威边界

Clawdesk 当前保留两类正式文档根：

- `docs/`：项目、核心框架、架构、实现、质量、集成、场景、研究、计划和仓库治理。
- `docs-user-api/`：**唯一用户 API 文档根目录**，包括脚本/runtime API、HTTP API、示例、编辑器类型说明和机器可读 API 索引。

以下历史 API 文档树已经退役，不得重新创建为并行 Source of Truth：

```text
docs-api/
docs-api-user/
docs/api/
```

`types/*.d.ts` 是编辑器/TypeScript 的派生契约面，不是第三套文档权威。

## 核心开发框架

桌面自动化相关开发优先阅读：

1. [`frameworks/automation-framework.md`](frameworks/automation-framework.md)：**自动化总体框架**，定义从底层驱动、感知识别、目标定位、可验证动作到 Skill、Workflow、Agent / Supervisor 的总体分层与执行闭环。
2. [`frameworks/capability-development.md`](frameworks/capability-development.md)：**能力开发与成熟度路径**，定义 Clawdesk 从底层动作、HTML Benchmark、系统应用到复杂应用和自主 Agent 的逐级开发顺序。
3. [`frameworks/app-development-framework.md`](frameworks/app-development-framework.md)：**应用自动化开发框架**，定义新增微信、千牛、计算器等具体应用时，从窗口、状态、区域、Locator 到 Skill、Workflow 和测试 Evidence 的标准方法。
4. [`frameworks/runtime-api-extension-framework.md`](frameworks/runtime-api-extension-framework.md)：**Runtime API 扩展与定制框架**，定义 JavaScript 自助扩展、HTTP/MCP 外置扩展、Native/Go Runtime 扩展与作者/维护者商业定制的边界和升级路径。

四者分别回答：

```text
自动化系统整体怎么设计？
Clawdesk 自身怎么从简单做到复杂？
一个具体应用应该怎么分析和开发？
用户和维护者应该在哪一层扩展 API？
```

`frameworks/` 保存长期稳定的核心开发方法；更细的系统结构进入 `architecture/`，具体实现进入 `implementation/`，质量与 Evidence 进入 `quality/`，单一应用场景进入 `scenarios/`。

## 当前目录

```text
docs/
├── README.md
├── project/
├── frameworks/
├── architecture/
├── implementation/
├── quality/
├── integrations/
├── scenarios/
├── research/
├── plans/
└── maintenance/
```

### `project/`

项目级入口和当前运行上下文。

主要内容：

- `overview.md`：项目能力概览。
- `current-context.md`：当前上下文。
- `runbook.md`：运行/操作入口。

### `frameworks/`

Clawdesk 长期使用的核心开发框架，是桌面自动化开发的重要入口。

当前核心文件：

- `automation-framework.md`：自动化总体框架。
- `capability-development.md`：能力开发与成熟度路径。
- `app-development-framework.md`：应用自动化开发框架。
- `runtime-api-extension-framework.md`：Runtime API 扩展、源码权限、外置集成和商业定制边界。

本目录强调稳定的开发思路、分层、顺序和边界，不保存一次性实现计划、测试报告或单一应用细节。

### `architecture/`

当前长期有效的系统结构、执行模型与契约。

主要分区：

- `desktop-automation/`
- `browser-automation/`
- `execution/`
- `decisions/`：未来 ADR 的标准位置。

Research 中的方案比较、评审或竞品材料不能替代本目录中的正式架构。

### `implementation/`

当前实现机制、平台实现说明和排障资料。

主要分区：

- `layout/`
- `macos/`
- `ocr/`
- `runtime/`

实现事实发生冲突时，以**当前源码和测试**优先，并同步修正文档。

### `quality/`

质量门禁、测试、失败分类、评审规则和可维护证据索引。

关键入口：

- `gates-and-evidence.md`
- `testing-guide.md`
- `failure-taxonomy.md`
- `failure-cases.md`
- `golden-sample-strategy.md`
- `review/`
- `browser-automation/`

### `integrations/`

外部协议、服务或工具集成。目前 MCP 文档统一位于：

```text
docs/integrations/mcp/
```

### `scenarios/`

面向具体应用/业务场景的需求、场景架构、baseline 与动作规范。

当前主要场景：

```text
docs/scenarios/wechat/
```

通用框架能力不能反向埋进单一场景目录；可复用能力应上收至 frameworks / architecture / implementation / quality。

### `research/`

调研、竞品、候选方案、评审和探索性分析。

Research 是**决策输入**，不是当前能力声明。日期型研究可使用：

```text
YYYY-MM-DD-topic.md
```

### `plans/`

尚未完成、仍值得推进的路线图和实现计划。

已完成或失效的计划应更新、关闭或归档，不能长期以“待做”状态污染当前事实。

### `maintenance/`

仓库与文档治理规则，包括：

- `repository-documentation-map.md`
- `repo-file-lifecycle-policy.md`
- `docs-migration-map.md`
- `repo-layout-refactor-plan.md`
- `repo-migration-map-and-p0-batch.md`

## Source of Truth 优先级

### 用户 API

```text
当前源码 / runtime 行为
-> docs-user-api/runtime-api.ai.json
-> docs-user-api/*.md
-> types/*.d.ts
-> Git 历史
```

### 项目 / 核心框架 / 架构 / 实现

```text
当前源码、测试和运行证据
-> docs/ 当前正式文档
-> docs/research/ 与 docs/plans/ 过程输入
-> artifacts/reports/ 历史证据
-> .archive/ 与 Git 历史
```

文档不应为了维护旧结论而覆盖已经变化的源码事实。

## 文档生命周期

| 内容类型 | 目标位置 |
|---|---|
| 当前项目/核心框架/架构/实现/质量文档 | `docs/` 对应分类 |
| 用户 API | `docs-user-api/` |
| 可复用 golden sample / fixture | `artifacts/fixtures/` |
| 长期保留的测试/评审报告 | `artifacts/reports/` |
| 运行日志、截图、probe、smoke 输出 | `.runtime/` |
| 本机环境/工具状态 | `.dev/` |
| 已失效但值得追溯的历史材料 | `.archive/` |
| 仍可复用的 AI Prompt | `prompts/` |
| 低价值中间 Prompt / raw workpad | 合并有效信息后删除，依赖 Git 历史 |

## 命名规则

正式文档优先：

```text
lower-kebab-case.md
```

禁止通过文件名保存版本历史：

```text
xxx_V2.md
xxx_V3.md
xxx_FINAL.md
xxx_COMPLETE_SUMMARY.md
```

当前正式文档直接更新；历史由 Git 保存。

Research / Report 等时间型材料可使用日期前缀。

## 新建文档前检查

新建文件前必须回答：

1. 这是 Canonical、Decision、Research、Plan、Report、Prompt 还是 Runtime Output？
2. 当前是否已经存在同主题 Source of Truth？
3. 新内容应该更新现有文件，还是确实需要创建新文件？
4. 它属于 `docs/`、`docs-user-api/`、`artifacts/`、`.runtime/`、`.archive/` 还是 `prompts/`？
5. 任务结束后它是否仍有长期维护价值？

默认规则：**不要向 `docs/` 根目录新增专题文件。**

## 2026-08 文档整理结果

整理前 `docs/` 根目录有 61 个直接文件，混合了正式文档、Research、测试报告、Prompt、FINAL/V2 草稿和一次性工作记录。

当前已完成：

- 61 个根目录旧文件全部分类、迁移、合并、归档或删除；
- `docs/` 根目录只保留 `README.md` 和分类目录；
- `docs/mcp/` 已收敛到 `docs/integrations/mcp/`；
- `docs/desktop-automation/`、`docs/discuz/`、`docs/golden_sample_strategy/`、`docs/optimization/`、`docs/strategy/` 等旧工作区已拆分或归档；
- Layout 文档已按当前源码修正默认值和评分事实；
- Gate V1/V2/Golden Gate 已收敛为单一 `docs/quality/gates-and-evidence.md`；
- 重复 FINAL/COMPLETE SUMMARY 已合并为历史报告；
- 可复用 WeChat 执行 Prompt 已移出 `docs/`，过时 Prompt/workpad 已删除；
- `docs-user-api/` 继续保持唯一用户 API 文档根。

迁移审计记录见：

```text
docs/maintenance/docs-migration-map.md
```
