---
name: task-demonstrate
description: 按固定 TaskContract、WorkPlan 与应用认识执行 Agent-to-Recipe S3-S6 的真实任务或定向补采，同步保存 planned/actual、观察、运行时值、消费者、副作用与逐项验证，交付 DemonstrationDossier 和 Raw Trace/Evidence。用于需要证明“实际发生了什么”的示范；不把 Expected、最终代码、计划或模型描述当执行证据，不负责 S7 动作取舍、S8-S9 业务参数化、S11 代码实现或 S12 资格放行。
---

# task-demonstrate｜真实示范与留证（S3-S6）

## 定位与责任边界

把“准备怎么做”变成“实际发生了什么”的可审计事实包。核心产物是 DemonstrationDossier 与其引用的 Raw Trace/Evidence；不是最终代码，也不是必要路径或业务过程。

六类信息必须分开：

| 角色 | 含义 | 不能冒充 |
| --- | --- | --- |
| planned | 动作前计划做什么、期望检查什么 | actual |
| actual | 实际调用/输入/动作及回执 | planned 或最终 JS |
| expected | 事先判据或预期结果 | observation/runtime value |
| observation | 动作后真实读取/看到的状态 | expected |
| runtime value | 本次真实读取并可能被后续消费的值 | 常量/参数默认值 |
| consumer | 实际使用某 runtime value 的动作、目标、输入和变换 | “理论上会使用”的步骤 |

最终 JS 只能说明某个实现写了什么；即使后来运行成功，也不能倒造本次示范当时的 actual、observation、选择过程或副作用。

## 开始作业时读取

必读本文件及 [input-spec](references/input-spec.md)、[output-spec](references/output-spec.md)、[validation](references/validation.md)、[failure-handling](references/failure-handling.md)。四者分别定义进入条件、交付内容、错误发现和失败返回。

用 [示范成果模板](templates/demonstration-dossier.md) 组织新任务；[Calculator 案例](examples/calculator.md) 只解释方法，不定义通用规则。[独立审阅](references/independent-review.md) 用于只审本 Skill。原 [io-spec](references/io-spec.md) 仅保留兼容导航。

正式字段、引用和状态以 [共享合同](../../../../docs/frameworks/agent-to-recipe-skill-contract.md) 为唯一依据；模板不是新 schema。执行前固定本 Skill、四项规格、合同、TaskContract、WorkPlan、AppProfile/规则及实际业务输入的版本。

## 方法

### 1. 固定起点与证据角色

确认当前 task、plan revision、工作包、成功/失败标准、允许副作用、预算和停止条件。只复用仍适用的 AppProfile/规则；当前账号、窗口、模式、焦点、目标和前置状态按本次需要重新核对。

为每个 planned step 先写 expected 和 observation 计划，但不要预填 actual。Expected 可以是“显示区应变为某种状态”或合同允许的具体值；它只参与比较，不能成为后续输入。

若上一次动作效果 unknown/partial，先定向观察实际状态，不通过重放前缀恢复到熟悉状态。

### 2. 动作前确认

只有计划、授权、目标身份/唯一性、前提和预算都满足才执行。按需读取当前 API canonical 与公共约束；“文档存在”“候选被选中”“运行已验证”是三件不同的事实。

需要探索或计划偏离时记录原因。计划变化走 planDelta/新版本，过去已经发生的 actual 与 observation 不随计划改版重写。

### 3. 执行-观察-验证微循环

每个业务节点按以下顺序留证：

```text
planned
→ precondition / target check
→ actual action + receipt
→ observation
→ compare against expected / criterion
→ save side effect / runtime value / consumer relation
→ next step or stop
```

动作回执只证明框架报告了什么，不自动证明 UI 后置或业务成功。观察必须来自实际 UI/业务/输出渠道，并保留应用、目标、时间/顺序和来源。

失败、等待、重试、恢复也是 actual，不能从 Raw Trace 中美化删除；是否属于最终必要路径由 S7 判断。

### 4. 保存 runtime value 和实际 consumer

每个关键运行时值保存：原始值、类型、读取 action、application/target、evidence、必要单位/精度、有效期和 fresh run 是否重读。保留前导零和原始字符串，不为后续方便提前数值化。

对每个实际消费者保存：consumer action、application/target、actual input、actual transform 及对应 runtime value。允许变换来自政策；“本次实际用了哪种变换”必须来自 actual consumer。

同一个值有多个消费者时逐个记录；终点读取以 final output 作为消费者。不能只写“第二步使用 firstResult”。

### 5. 完成本次业务验证

逐 success criterion 对照 expected 与 actual observation；明确 pass/fail/not-run/blocked。中间数据来源、必要状态和终点交付都要核对，不能只凭最终数字正确放行示范。

动作成功、后置成功、业务成功、视觉/人工接受分别记录。部分完成保留剩余项，不缩小原请求后写“全部完成”。

### 6. 冻结并交 S7

冻结 Dossier、Raw Trace、Execution/Evidence refs、planned/actual 对应、runtimeValues、consumer bindings、sideEffects、unresolved 与验证索引。交付前交叉检查 action、observation、runtime value 的值/应用/目标及消费者集合一致。

S7 消费事实并做 retain/merge/omit/recovery；本 Skill 不提前替 S7 去噪。S9 需要的定向事实必须明确交付正文/固定引用，不能因为检查器能读整个 Dossier 就视为语义 Producer 已收到。

## 不负责什么

S1 负责目标、授权、政策和成功标准；application-engineer 负责应用身份、关系和操作规则；S7 负责原动作取舍；S8-S9 负责 Business Step、参数、业务含义与可复用变换；S11 负责 JS；S12 负责冻结 Candidate 的资格。

本 Skill 可以发现这些问题并定向返回，但不能静默修订下游产物。Human/Recorder/已有代码保留原来源，不能追认为本次 Agent 示范。

## 完成条件

只有声明范围内的 actual、observation、runtime value、consumer、criterion 和副作用都有可读来源，且六类角色未互换，才形成可供 S7 正常消费的示范事实包。文件存在、最终代码正确、fixture 通过、模型自述或历史 Qualification 都不能代替本次实际执行证据。
