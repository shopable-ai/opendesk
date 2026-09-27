---
title: "Agent-to-Recipe｜设计总纲与 Canonical Map"
description: "说明 Agent-to-Recipe 各设计文档分别回答什么问题，以及推荐阅读顺序。"
order: 10
---

# Agent-to-Recipe｜设计总纲与 Canonical Map

本文只回答一个问题：

> **Agent-to-Recipe 的设计信息应该去哪里找，哪个文件拥有哪类事实？**

如果第一次进入本目录，先用本页建立地图，再按当前问题进入对应 canonical 文件。不要从 Git 历史、质量报告或专项架构反推当前主工作流。

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

怎样快速检查一次交接？
  → acceptance-map.md

凭什么证明每一层做对？
  → validation-plan.md

怎样把业务步骤落实成可靠应用操作？
  → application-operations.md

已有普通 JS 怎样独立改进？
  → code-rebuild.md
```

**阶段 ≠ Skill ≠ 文件 ≠ Agent。**

- S1—S12：业务开发阶段；
- 8 个 Skill：专业职责入口；
- design 文件：方法、职责或审阅说明；
- 实际执行者：可以是同一个 Agent；
- shared contract：字段、版本和正式 handoff；
- `docs/quality/`：某一版本实际上证明了什么。

## Canonical Map

| 文件 | Canonical Question | 主要拥有 | 明确不拥有 |
| --- | --- | --- | --- |
| [requirements.md](requirements.md) | 为什么需要这套工作流，必须满足什么？ | 来源、需求、范围、约束、场景、DREQ、Unknown | 当前实现状态、专项算法、质量结果 |
| [task-decomposition.md](task-decomposition.md) | 从输入到合格成果，完整需要做什么？ | S1—S12、输入、输出、完成条件、失败回流 | Skill 实现历史、质量报告、专项架构 |
| [chain-design.md](chain-design.md) | 谁生产什么、谁消费什么、怎样交接？ | producer、consumer、handoff、resume、failure ownership | 完整任务树、验证结果、历史迁移 |
| [../WORKFLOW.md](../WORKFLOW.md) | Agent 实际怎样进入并协调执行？ | 入口、恢复点、职责路由、工作包、handoff、stop | 专业方法正文、完整阶段分解 |
| [acceptance-map.md](acceptance-map.md) | 怎样快速判断相邻交接能不能信？ | 输入／输出检查、典型反例、责任返回 | 测试运行历史、第二份 schema |
| [validation-plan.md](validation-plan.md) | 凭什么证明每一层做对？ | 验证对象、测试空间、BC、L0—L5、Gate、Hard Fail、评分 | 历史测试结果、专项实现日志 |
| [application-operations.md](application-operations.md) | 怎样把业务步骤落实为可靠应用操作？ | discover/harden/repair、定位、读取、等待、动作、verifier | S7—S9 业务语义、Collection Runtime 算法 |
| [code-rebuild.md](code-rebuild.md) | 已有普通 JS 怎样按需改进而不重造业务语义？ | 代码基线、缺陷分类、最小修改、回归范围、候选冻结 | 上游事实补造、资格报告、迁移历史 |
| [共享合同](../../../docs/frameworks/agent-to-recipe-skill-contract.md) | 正式工件字段、版本和 handoff 怎样定义？ | TaskContract、WorkPlan、Dossier、DistilledSteps、Procedure、Candidate、Qualification | 方法说明 |
| [Structured UI Collection Reading](../../../docs/architecture/desktop-automation/structured-ui-collection-reading.md) | Collection / VLM / traversal 技术机制怎样设计？ | Observation、segmentation、continuity、VLM、traversal | Agent-to-Recipe 主流程 |
| `docs/quality/` | 某一版本实际验证了什么？ | 测试记录、commit、评分、限制、失败 | 当前 canonical 方法 |

## 按目的阅读，不按目录顺序全读

### 第一次理解整体

```text
README
→ requirements
→ task-decomposition
→ chain-design
→ WORKFLOW
```

### 准备实际执行

```text
WORKFLOW
→ 当前 TaskContract / WorkPlan
→ 当前职责 SKILL.md
→ 需要时读取专业设计
→ acceptance-map / validation-plan
```

### 某个交接看起来不对

```text
acceptance-map
→ chain-design
→ shared contract
→ 对应 SKILL.md
→ 必要时回 task-decomposition 查完成条件 / failure owner
```

### 某项验证结论有争议

```text
validation-plan
→ QualificationRecord / docs/quality
→ exact Candidate / inputs / evidence
```

### 某项专项技术有问题

直接进入对应 architecture / API 文档。不要从 Agent-to-Recipe 目录寻找第二套 VLM、Collection、Recorder、Compiler、Runtime 或 UI 自动化算法。

## 稳定边界

当前文档体系保持以下边界：

1. **S1—S12 不因文档组织问题重新编号。**
2. **automation-plan、application-engineer、task-demonstrate、trace-distill、procedure-synthesize、recipe-build、code-rebuild、recipe-qualify 的核心职责保持。**
3. **S2 与 S10 共享 application-engineer；code-rebuild 是可选独立质量作业。**
4. **Human 来源与 Agent 来源保持不同 lineage；可以共享后续专业方法。**
5. **事实 → 必要步骤 → 业务语义 → 应用工程 → Candidate → Qualification 是不同证明层。**
6. **普通业务运行不重复执行 S1—S12。**
7. **专项 Runtime / VLM / Collection / Recorder / Compiler / IR 由各自权威文档拥有。**
8. **质量报告只证明其对应版本与范围，不反向定义当前 canonical 方法。**

## Authority 规则：一条事实尽量只有一个正文 Owner

修改本目录前，先判断信息属于哪一类：

```text
A. Canonical Method
B. Contract / Schema
C. Architecture
D. Engineering / Implementation
E. Validation / Evidence
F. History / Migration
```

一个 canonical 文件通常只有**一种主要类型**。其他类型只保留当前职责必需的边界说明和链接。

应优先降级为引用或历史的内容：

- 某次 commit、测试数量、evaluator 得分；
- 当前宿主是否加载、某模型某轮是否成功；
- 日期型设计日志和 v0.x 迁移过程；
- R1—R13 历史讨论正文；
- Collection / VLM / AX / UIA / Runtime 专项算法；
- Compiler / IR / Recorder 专项设计；
- 已由 shared contract 定义的字段；
- 已由另一个 canonical 文件完整拥有的方法正文。

如果一段信息是唯一的重要事实，先找到合适 Owner，再删除复制；不要为了缩短文件直接丢失唯一语义。

## Canonical 与 Evidence 分开

```text
canonical method
≠
implementation exists
≠
static checks pass
≠
host loads it
≠
real application succeeds
≠
business Qualification passes
```

需要“现在这个版本实际做到什么程度”，读取 `docs/quality/`、QualificationRecord 和真实 artifacts；不要把动态状态长期写回 canonical 方法正文。

## 什么时候才需要看历史

当前执行和普通审查不需要先理解几周的设计演变。只有以下情况才查 Git history 或旧质量记录：

- 当前决定缺少来源；
- 需要确认被删除内容是否仍是唯一事实；
- 排查版本行为差异；
- 做设计考古，而不是完成当前工作。

历史不重新进入 canonical 正文。

## 下一层入口

- “为什么” → [requirements.md](requirements.md)
- “完整做什么” → [task-decomposition.md](task-decomposition.md)
- “谁交给谁” → [chain-design.md](chain-design.md)
- “现在怎么执行” → [WORKFLOW.md](../WORKFLOW.md)
- “这次交接对不对” → [acceptance-map.md](acceptance-map.md)
- “凭什么算通过” → [validation-plan.md](validation-plan.md)
- “应用操作怎么工程化” → [application-operations.md](application-operations.md)
- “已有 JS 怎么改” → [code-rebuild.md](code-rebuild.md)
