---
name: procedure-synthesize
description: 将固定 DistilledSteps 转成 Agent-to-Recipe S8-S9 的 SemanticProcedure。用于 Business Steps、参数分类、runtime value 的 producer/consumer/transform、支持范围和完成语义；不重新做 S7 动作取舍、不静默读取全量 Raw Trace、不生成 JS、不发布资格。
---

# procedure-synthesize｜业务过程与数据关系（S8-S9）

## 定位与责任边界

输入是 S7 已确认的必要路径，输出是可供 S10/S11 消费的业务语义过程。S7 回答“哪些历史动作属于必要路径”；S8-S9 回答“这些必要步骤在业务上意味着什么、哪些值来自哪里、哪些输入可变、哪些运行时值必须现场取得，以及下游如何消费”。

本 Skill 不拥有第二套 actionDecisions。发现 retain/merge/omit/recovery 投影错误时返回 trace-distill，而不是在 Procedure 内重读 Raw Trace 重判。

## 开始作业时读取

必读本文件及 [input-spec](references/input-spec.md)、[output-spec](references/output-spec.md)、[validation](references/validation.md)、[failure-handling](references/failure-handling.md)。使用 [semantic-procedure 模板](templates/semantic-procedure.md) 组织新应用；[Calculator 案例](examples/calculator.md) 解释 producer/consumer/transform，不定义通用规则。

正式字段、引用和状态只以 [共享合同](../../../../docs/frameworks/agent-to-recipe-skill-contract.md) 为依据。原 [io-spec](references/io-spec.md) 仅作兼容导航。

## 方法

### 1. 固定 S7 输入，不重做历史取舍

核对 TaskContract、WorkPlan、DistilledSteps、相关 AppProfile/关系、必要政策和能力选择来源的版本、hash、task/plan identity。sourceActionRefs 只做 lineage；它们不授权默认展开完整 Dossier/Raw Trace。

若 S7 已交付的 step 顺序、source coverage 或 runtime value 投影明显错误，停止并返回 S7。不要通过“语义上看起来合理”来修正历史事实。

### 2. DistilledStep → Business Step

将必要步骤映射为有序 Business Steps。每个步骤至少写清 purpose、sourceStepRefs、inputs/inputSources、preconditions、execution intent、observation、outputs、postconditions、verification、stopConditions、consumers 和 sideEffects。

可以把多个必要步骤组织成一个业务步骤，但不能因此丢失 source coverage、先后关系、数据 producer/consumer 或安全边界。当前 S7 取舍保持只读。

### 3. 分类业务输入

严格区分：

- caller parameter：调用者在未来运行前提供的可变业务输入；
- config：环境/部署配置；
- secret ref：秘密引用，不内嵌秘密值；
- invariant：业务不变量/固定规则；
- runtime value：必须在本次运行现场实际取得的值；
- expected：用于比较的预期，不是输入来源；
- unknown：无法证明的语义或边界。

一次示范观察到的值不能自动成为 parameter 默认值；runtime value 不能因为常见或可推算就改成常量。

### 4. 明确 producer / consumer / transform

每个 runtime value 都必须有三件事：

1. **producer**：哪个 Business Step 的哪个实际 read/output 产生它；
2. **consumer**：哪些后续 Business Step 真正需要它；
3. **transform**：从 producer 值到 consumer 输入之间发生什么变换。

其中 producer 来自 S7 的真实运行时值投影；consumer 来自实际消费绑定；transform 要区分“本次实际采用”与“未来允许采用”。允许变换来自政策/语义，不能由单次示范自动泛化。

例如字符串 `110` 被按字符 `1,1,0` 依次输入时，producer 是 UI read，consumer 是第二次计算，actual transform 是 character expansion。它不是重新计算，也不是硬编码 110。

### 5. 参数化而不破坏数据流

声明 caller parameter 时，必须说明业务含义、类型/边界、默认策略（若允许）、实际消费者、验证条件和与 runtime value 的互斥关系。S11 不应猜“这个参数到底给哪个步骤用”。

同一业务输入不能同时来自 runtime value 和 Expected/常量。若 consumer 需要现场 firstResult，就不能再给它一个固定 110 作为平行来源。

### 6. 能力与应用关系只保留最小消费信息

把已确认的能力选择归纳为 capabilityDecisions：业务需要、候选来源、selected/rejected/failed/not-run、canonical/公共约束、runtimeValidation、Recipe consumer、重验条件。

API 文档存在不等于已选型，selected 不等于运行已验证。S10 尚待工程补强时如实保留 not-run/partial 和影响范围；不要从最终 JS 倒推出过去已完成发现、选择或验证。

### 7. 支持范围、完成语义与恢复候选

写清支持范围、排除范围、前后条件、副作用、终点输出、stopConditions 与 unresolved。未证明的分支、循环、恢复策略只能标为候选或补证请求，不得扩大支持范围。

最终发布 SemanticProcedure；业务语义缺口留在本 Skill 修，应用规则缺口去 application-engineer，历史事实缺口去 task-demonstrate，S7 投影缺口去 trace-distill。

## 不负责什么

本 Skill 不生成 JS、不定义 CLI、不选择最终 API 调用代码、不发布 Candidate、不做 S12 资格。它也不重新执行桌面任务来“验证语义”；需要新事实时必须返回示范责任。

## 完成条件

SemanticProcedure 必须让一个没有看完整历史的 S10/S11 消费者准确回答：有哪些 Business Steps、每个输入来源是什么、哪些值是 runtime、producer/consumer/transform 如何连接、哪些输入可参数化、应用/能力关系是什么、终点如何验证、支持范围和 unknown 在哪里。