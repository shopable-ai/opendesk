# Agent-to-Recipe 求解策略空间与首个 Skill 样本：文档实施审阅

日期：2026-09-30。范围：用户确认方案后的相关文件更新。

**本次交付是方法、规格、模板、教学样本及验证计划的文档实施，不是 Skill 行为评测或 Calculator 业务资格通过。** 实际修改 18 份既有 Markdown，并新增本审阅记录；不修改生产 JavaScript、Runtime、共享 schema 或检查器实现。

## 基线、来源与检查方式

- 仓库：`shopable-ai/opendesk`；目标为现有 `master`。
- 读取和修改基线：`928515d98849143973124990c12cd8b4c66547d9`。
- 被审阅成果：本文件所在提交中的下列文档；具体内容与差异由 Git 固定，不将当前提交 hash 回填进自身形成循环引用。
- 需求来源：用户在本次对话确认的“一个通用总地图、按操作选型、先完善 application-engineer、Calculator 与复杂案例分线验证”方案，以及“按照这个解决方案，更新相关文件”的实施指令。
- 实际执行者：同一 Agent 完成编辑、来源核对和静态反方视角审阅；没有六名独立专家或独立 Producer 的执行证据。
- 操作方式：GitHub connector 读取固定版本，创建完整文档 Git 对象，比较变更并准备同一次 master 交付。当前环境未取得可用本地 checkout，因此没有本地 `git status`、`git diff --check`、Node 检查器或文档构建的通过记录。

分支是否已更新及最终 SHA，应以交付后的实际 Git ref 核验为准；仅创建 blob/tree/未引用的审阅 commit 不等于 master 已更新。

## 先看哪几处成果

| 要判断的问题 | 实际阅读入口 |
| --- | --- |
| 总体有哪些方法、怎样选，不与 S1—S12 混淆 | [求解框架 §0.1—0.5](../frameworks/automation-problem-solving-framework.md#strategy-space) |
| 操作策略怎样表达、何时能切换、环境变化后检查什么 | [应用操作 §6.1—6.2、§9.1、§12.1—12.2](../../workflows/agent-to-recipe/design/application-operations.md#operation-strategy) |
| 完整成果样本而不是字段名 | [application-engineer 的 Calculator 清空策略与区分性验证设计](../../workflows/agent-to-recipe/skills/application-engineer/examples/calculator.md) |
| 已批准规则怎样变成普通 JS，何时需要 helper 或模块 | [recipe-build](../../workflows/agent-to-recipe/skills/recipe-build/SKILL.md) |
| 正常、失败、拒绝、兼容及第二条复杂案例怎样分别验证 | [策略验证矩阵](../../workflows/agent-to-recipe/design/validation-plan.md#strategy-validation)、[复杂应用第二基准线](../../workflows/agent-to-recipe/design/validation-plan.md#complex-golden-case) |

## 修改范围

| 文件 | 实际变更 |
| --- | --- |
| `docs/frameworks/automation-problem-solving-framework.md` | 增加总地图、四维选型、硬条件优先、产物衔接和证据状态；保留原六类方法正文 |
| `workflows/agent-to-recipe/design/application-operations.md` | 增加条件化操作策略、动作状态切换判定、兼容及最小封装边界 |
| `workflows/agent-to-recipe/design/capability-discovery.md` | 接入总地图，区分接口、观察、目标绑定及封装；说明 Runtime 与 S9/S10 的交接 |
| `workflows/agent-to-recipe/skills/application-engineer/SKILL.md` | 在 discover/harden/repair 中接入选型、策略、环境和证据方法 |
| `workflows/agent-to-recipe/skills/application-engineer/references/input-spec.md` | 区分发现输入与工程输入；明确备用路径证据、动作状态和变化范围 |
| `workflows/agent-to-recipe/skills/application-engineer/references/output-spec.md` | 将完整策略落在既有产物，交付同版规则、范围和下游引用 |
| `workflows/agent-to-recipe/skills/application-engineer/templates/operation-rules.md` | 展开候选选择、条件化执行、备用、停止、兼容与维修填写内容 |
| `workflows/agent-to-recipe/skills/application-engineer/references/validation.md` | 增加正常、歧义、错误读取来源、残留、unknown、partial 和变化反例 |
| `workflows/agent-to-recipe/skills/application-engineer/examples/calculator.md` | 增加清空操作完整静态样本、预设反例、未运行项及责任归因示例 |
| `workflows/agent-to-recipe/skills/recipe-build/SKILL.md` | 明确已批准策略消费、最小封装、真实参数、模块入口与候选身份 |
| `workflows/agent-to-recipe/skills/recipe-build/references/input-spec.md` | 固定策略、规则、依赖、范围与版本冲突处理 |
| `workflows/agent-to-recipe/skills/recipe-build/references/output-spec.md` | 规定实际分支到上游映射、依赖冻结和未检查范围 |
| `workflows/agent-to-recipe/skills/recipe-build/templates/candidate.md` | 增加获准路径、选择输入、停止边界及可选模块的填写位置 |
| `workflows/agent-to-recipe/skills/recipe-build/references/validation.md` | 增加策略分支、参数消费、故障停止和模块身份检查 |
| `workflows/agent-to-recipe/WORKFLOW.md` | 只补三个方法入口及 stage-review 的同版阅读责任 |
| `workflows/agent-to-recipe/design/task-decomposition.md` | 只补方法空间与现有阶段责任的映射 |
| `workflows/agent-to-recipe/cases/calculator-execution-walkthrough.md` | 增加 §0.2：参考实现使用哪些方法、没有覆盖哪些方法 |
| `workflows/agent-to-recipe/design/validation-plan.md` | 接入既有 BC、独立审查及复杂沙盒案例，不增第二套评分 |

`application-engineer` 与 `recipe-build` 的现有 `references/failure-handling.md` 已核对，保留原来的安全停止、按责任返回、材料补交和版本维修规则；没有为了文件数量修改它们。

## 实际静态审阅与修正

已通过 GitHub 比较基线与 18 文件审阅版本的路径及增删范围，并回读关键正文、新增引用目标和失败处理规则。该检查属于文档结构、来源及职责核对，不是自动化业务测试。

审阅中发现并修正：

1. 验证计划重组时，两处原表格内容被意外改写：DistilledSteps 的检查问题、S5 的验证与修复列。已恢复原文，原有评分与阶段责任不应被本次方法扩展改变。
2. 应用操作文档引用了 `validation-plan.md#strategy-validation`，但初稿尚未提供对应锚点。已补显式锚点。
3. 总地图初稿把“待验证候选与最小探索”写在契约阅读之前，可能误导执行顺序。已改为先形成候选、读取完整契约及公共约束，再开展获准现场验证。

最终提交仍应核对变更清单、分支 ref 和关键修正；未执行的检查不能根据此文档推断为已执行。

## 分对象结论与证据限制

| 对象 | 本次已完成的文档工作 | 未被本次证明的内容 |
| --- | --- | --- |
| 通用框架 | 总地图与四维选型、硬条件及能力状态分离 | 所有应用方法均完整或已可运行 |
| 能力发现 | 选择、契约、Runtime 验证及消费引用衔接 | 当前环境候选调用通过 |
| 应用操作 | 策略、切换、兼容、封装有明确规则 | 各具体操作或备用路径已实测 |
| application-engineer | 方法、输入输出、模板、检查和教学样本同步 | 独立 Skill 行为或 S2/S10 当次资格 |
| recipe-build | 已批准策略、分支、依赖与实际入口的消费约定同步 | S11 实际生成、模块 CLI 或 Candidate 运行 |
| Calculator 信息层级 | 新增小型映射，标清参考源码与现场事实的区别 | 本次新的 Calculator 示范或 Fresh Run |
| S1—S12 边界 | 方法地图不新增阶段；S2 不以前置 JS 为条件；S10 变化回原责任 | 新 Agent 实际按链正确接续 |
| 人工可读性 | 有总图、完整操作正文、证据限制与首错示例 | 真实用户阅读测试或阅读时长达标 |
| 复杂应用扩展 | 沙盒跨页记录到新文档的验证范围已定义 | 实际应用/数据已选择、复杂案例已执行 |
| 反方审计后的架构稳定性 | 同一 Agent 逐视角核对并记录修正 | 独立专家一致通过或长期稳定性 |

本次不填预设 95 分，也不把十个对象平均成综合分。正式数值评价仍按验证计划固定对象、判据、20 项与证据；S2/S10、S11/S12 各自独立，Hard Fail、必需测试与阻断 Unknown 不被分数抵消。

## 反方视角复核

| 视角 | 已落实的控制 | 仍需后续证据 |
| --- | --- | --- |
| Workflow 架构 | 使用现有总框架和 S1—S12，不增加阶段、DSL、Registry 或执行引擎 | 真实链路接续与职责边界测试 |
| 桌面自动化 | 分开接口、观察、目标绑定；不把 Locator 排成固定台阶 | 正常与歧义目标的实际执行 |
| 应用架构 | Adapter 保留应用语义/操作，Recipe 保留业务控制 | 复杂案例中的实际分层与消费 |
| 可靠性 | unknown 先对账、partial 不重放、原动作是否仍在进行需核对 | 故障注入与真实应用效果证据 |
| 代码架构 | 单文件/helper 合法；模块可选，源文件与 payload hash 分开 | 冻结生产字节和实际 OpenDesk 入口验证 |
| 人工可读性 | 总地图 → 策略正文 → 完整样本 → 验证矩阵可导航 | 未参与编辑者的阅读与定位错误测试 |

这些是同一作者的静态反方检查，不是六个独立审阅者的结论。

## 明确未运行、未修改的范围

| 项目 | 状态 |
| --- | --- |
| 本地 Markdown/link checker、站点构建、`git diff --check` | not-run；未取得可用本地 checkout |
| 既有工作流 Node 检查器与测试套件 | not-run；没有新增自动检查实现或测试通过声明 |
| 独立上下文 Skill 正反例行为评测 | not-run |
| Calculator 清空残留探针、三次独立 Fresh Run | not-run；样本中的 Expected 不能填作 Actual |
| `.mjs` / OpenDesk CLI 集成验证 | not-run；本次只引用既有公开契约 |
| 复杂沙盒案例、Windows/其他版本与语言 | not-run |
| 人类可读性实测 | not-run |
| `examples/agent-to-recipe/calculator.js`、Runtime、共享合同/schema、检查器、G/F/S 编号 | 本次未修改 |

当前任务 `stage-review.md` 的内容要求已在方法中说明，但本次没有生成真实任务的 stage-review，也没有修改其生成器来自动提取新内容。它仍须由真实权威产物和阶段审阅支持，不得复制教学样本当 Actual。

## 下一最小验证边界

先对 application-engineer 固定新方法版本与获准输入，验证一个正常交付、关键拒绝反例和一次定向维修能否被下游独立消费；复用已有有效任务包，不为验证方法重跑整条作者链。

Calculator 的局部清空探针与最终 Candidate Fresh Run 分开取证，按实际任务合同执行，不以参考脚本运行冒充新生成能力。复杂第二基准线在应用、沙盒数据和授权明确后再执行；聊天附件发送与长期运行仍是未覆盖范围。

**本次完成文档实施与有边界的静态审阅；“首个 Skill 黄金样本已经实测通过”仍没有本轮证据支持。**
