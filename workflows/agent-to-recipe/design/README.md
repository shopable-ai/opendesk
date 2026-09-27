---
title: "Agent-to-Recipe｜设计总纲与 Canonical Map"
description: "说明 Agent-to-Recipe 各设计文档分别回答什么问题，以及推荐阅读顺序。"
order: 10
---

# Agent-to-Recipe｜设计总纲与 Canonical Map

本文只回答一个问题：

> **Agent-to-Recipe 的设计信息应该去哪里找，哪个文件拥有哪类事实？**

如果你第一次进入本目录，先用本页建立地图，再按当前问题进入对应 canonical 文件。不要从历史版本、质量报告或专项架构反推当前工作流。

## 30 秒总览

```text
为什么做、必须满足什么？
  → requirements.md

完整需要做什么？
  → task-decomposition.md

谁负责、生产什么、交给谁、失败回哪里？
  → chain-design.md

Agent 实际怎样进入、恢复、停止与协调？
  → ../WORKFLOW.md

人和 Agent 怎样快速检查交接？
  → acceptance-map.md

凭什么证明每一层做对？
  → validation-plan.md

怎样做应用工程？
  → application-operations.md

已有 JS 怎样独立改进？
  → code-rebuild.md
```

阶段、Skill、文件、Agent 是四个不同概念。**S1—S12 是业务开发阶段；八个 Skill 是专业职责入口；设计文件是方法与合同说明；实际执行者可以是同一个 Agent。**

## Canonical Map

| 文件 | Canonical Question | 主要类型 | 主要拥有内容 | 明确不拥有 |
| --- | --- | --- | --- | --- |
| [requirements.md](requirements.md) | 为什么需要这套工作流，以及必须满足什么？ | Canonical Method / Requirements | 来源、事实、需求、范围、约束、场景、验收需求、Unknown | 当前实现状态、专项 Runtime 算法、质量结果 |
| [task-decomposition.md](task-decomposition.md) | 从输入到合格成果，完整需要做什么？ | Canonical Method | S1—S12、输入、输出、完成条件、失败回流、主工件关系 | Skill 实现历史、质量报告、专项架构 |
| [chain-design.md](chain-design.md) | 各职责怎样连接，输入输出怎样交接？ | Contract / Architecture | producer、consumer、handoff、route、resume、failure ownership | 完整任务树、测试结果、历史迁移 |
| [../WORKFLOW.md](../WORKFLOW.md) | Agent 实际怎样进入并协调执行？ | Operational Method | 入口、当前阶段、Skill 路由、handoff、resume、stop | 专业方法正文、阶段完整分解 |
| [acceptance-map.md](acceptance-map.md) | 人和 Agent 怎样快速检查阶段交接是否正确？ | Validation / Review | 边界检查、典型反例、责任返回、快速审阅视图 | 质量报告、测试运行历史 |
| [validation-plan.md](validation-plan.md) | 凭什么证明每一层做对？ | Validation | 验证对象、测试空间、正反例、Gate、证据、评分、硬失败 | 历史测试结果、专项实现日志 |
| [application-operations.md](application-operations.md) | 怎样把业务步骤落实为可靠应用操作？ | Canonical Method | discover/harden/repair、定位、读取、等待、动作、验证边界 | Collection Runtime 算法、S7—S9 业务语义 |
| [code-rebuild.md](code-rebuild.md) | 已有普通 JS 怎样按需改进而不重造业务语义？ | Canonical Method | 代码基线、缺陷分类、最小修改、回归范围、候选冻结 | 迁移历史、Recorder 专项、资格报告 |
| [共享合同](../../../docs/frameworks/agent-to-recipe-skill-contract.md) | 工件字段、版本、正式交接怎样定义？ | Contract / Schema | TaskContract、WorkPlan、Dossier、DistilledSteps、Procedure、Candidate、Qualification | 工作流方法说明 |
| [Structured UI Collection Reading](../../../docs/architecture/desktop-automation/structured-ui-collection-reading.md) | Collection/VLM/Traversal 技术机制怎样设计？ | Architecture | Observation、CollectionProfile、segmentation、continuity、VLM、traversal | Agent-to-Recipe 主流程 |
| `docs/quality/` | 某一版本实际验证了什么？ | Validation / Evidence | 测试记录、评分、commit、局限、失败 | 当前 canonical 方法 |

## 推荐阅读顺序

### 只想理解整体

```text
README
→ requirements
→ task-decomposition
→ chain-design
→ WORKFLOW
→ acceptance-map
```

### 准备实际执行

```text
WORKFLOW
→ 当前 TaskContract / WorkPlan
→ 当前职责 Skill
→ 需要时读取对应专业设计
→ acceptance-map / validation-plan
```

### 审查某个交接错误

```text
acceptance-map
→ chain-design
→ shared contract
→ 对应 Skill 输入输出规格
→ 必要时回 task-decomposition 查失败责任
```

### 审查某项专项技术

不要从本目录重复寻找第二套算法。直接进入对应权威架构或 API 文档。

## 当前设计的稳定边界

以下是当前设计必须保持的稳定边界：

1. **S1—S12 不重新编号。**
2. **阶段 ≠ Skill ≠ 文件 ≠ Agent。**
3. **automation-plan、application-engineer、task-demonstrate、trace-distill、procedure-synthesize、recipe-build、code-rebuild、recipe-qualify 的核心职责保持。**
4. **S2 与 S10 共享 application-engineer。**
5. **code-rebuild 是可选独立质量作业，不替代 recipe-build。**
6. **Human Recorder 与 Agent 新示范保留不同来源事实。**
7. **事实 → 必要步骤 → 业务语义 → 代码 → Qualification 是不同证明层。**
8. **普通业务运行不重复执行 S1—S12。**
9. **专项 Runtime、VLM、Collection、Recorder、Compiler、IR 只在各自权威文档维护。**
10. **质量报告只证明其对应版本与范围，不反向定义当前方法。**

## 三类来源先分流

```text
Agent 新任务
  → S1 开始
  → 按 S1—S12 主链推进

已有资产 / Failure Package
  → 冻结 source / hash / scope / evidence
  → 找第一个真实缺口
  → 从对应职责继续

Human Recorder
  → 保留 Human 来源链
  → 满足共享职责输入条件后再接入
```

Existing Asset 不需要重新制造 Dossier；Human Recording 也不能改标成 Agent 示范。

## Agent 新生成主链

这张图只用于快速定位，不替代 [task-decomposition.md](task-decomposition.md)：

```text
User Goal
  ↓
S1 automation-plan
  ↓
S2 application-engineer / discover
  ↓
S3—S6 task-demonstrate
  ↓
Demonstration Dossier / Raw Trace
  ↓
S7 trace-distill
  ↓
DistilledSteps
  ↓
S8—S9 procedure-synthesize
  ↓
SemanticProcedure
  ↓
S10 application-engineer / harden|repair
  ↓
S11 recipe-build
  ↓
[optional] code-rebuild
  ↓
S12 recipe-qualify
  ↓
Delivery / explicit publish handoff
```

失败不默认回 S1。目标／授权回 S1；事实不足回 S3—S6；必要路径错误回 S7；语义和参数化错误回 S8—S9；应用规则错误回 S10；代码错误回 S11；资格设置或证据问题留 S12。

## 文件修改原则

修改本目录时先判断一段内容属于哪一类：

```text
A. Canonical Method
B. Contract / Schema
C. Architecture
D. Engineering / Implementation
E. Validation / Evidence
F. History / Migration
```

一个 canonical 文件通常只能有**一种主要类型**。其他类型只保留完成当前职责所必需的边界说明和链接。

### 应删除或降级为引用的典型内容

- 某次 commit / evaluator / PASS 数量；
- “当前宿主是否加载”的版本状态；
- R1—R13 历史讨论正文；
- v0.x 逐版本迁移日志；
- Collection/VLM/AX/UIA/Runtime 的算法细节；
- Compiler / IR / Recorder 专项设计；
- 已被共享合同拥有的字段定义；
- 已被其他 canonical 文件完整拥有的方法正文。

唯一重要事实如果尚无权威位置，应先移动到适当文件，再删除复制。

## 设计与证据怎样连接

Canonical 文档说明“**应该怎样做**”；质量记录说明“**某一版本实际上证明了什么**”。

因此：

```text
canonical method
  ≠
implementation exists
  ≠
tests pass
  ≠
host loads it
  ≠
real business qualified
```

需要当前质量状态时进入 `docs/quality/`，不要在 canonical 方法正文里维护不断变化的测试数量、commit 或成熟度声明。

## Structured Collection 的位置

Agent-to-Recipe 只需要知道职责边界：

```text
application-engineer
  → 建立 / 修订结构知识

Recipe / Adapter
  → 将 generic item 映射到业务对象并控制 traversal

recipe-qualify
  → 分层验证结构、业务 mapping、traversal 和最终业务结果
```

Collection 的 Observation、VLM proposal、segmentation、continuity、merge、mutation、end detection 等算法统一见[专项架构](../../../docs/architecture/desktop-automation/structured-ui-collection-reading.md)。

## 与 Human Recorder 的共享边界

Human 与 Agent 保留不同来源，但可以复用同一专业方法：

```text
Human recording facts ─┐
                       ├→ application-engineer
Agent Dossier facts ───┤   trace-distill
                       ├→ procedure-synthesize
                       ├→ recipe-build
                       └→ recipe-qualify
```

共享方法不等于共享来源资格。

## 什么时候查看历史

当前执行、审查和修改不需要先理解所有设计历史。

只有以下情况才查 Git history 或旧质量记录：

- 某项当前决定缺少来源；
- 需要确认一段删除内容是否仍是唯一事实；
- 排查版本行为差异；
- 需要设计考古，而不是完成当前工作。

历史不应重新进入 canonical 方法正文。

## 下一层入口

- 准备理解“为什么” → [requirements.md](requirements.md)
- 准备理解“完整做什么” → [task-decomposition.md](task-decomposition.md)
- 准备理解“谁交给谁” → [chain-design.md](chain-design.md)
- 准备实际执行 → [WORKFLOW.md](../WORKFLOW.md)
- 准备做交接验收 → [acceptance-map.md](acceptance-map.md)
- 准备设计测试 → [validation-plan.md](validation-plan.md)
