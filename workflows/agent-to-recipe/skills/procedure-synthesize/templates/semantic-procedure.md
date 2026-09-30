# SemanticProcedure 模板

> 用于任意应用的 S8-S9 业务过程提炼。正式 JSON 字段沿用共享合同。

## 固定输入

TaskContract / WorkPlan：<refs>
DistilledSteps：<ref/hash>
AppProfile / relations：<refs>
Policies / capability selections：<refs>
Scope：<supported / excluded>

## 本任务裁剪与来源（S8/S9 分别审阅）

从[求解策略空间](../../../../../docs/frameworks/automation-problem-solving-framework.md#case-tailoring)按需选择，以下只是既有 scope、Business Steps 和 capabilityDecisions 的人工视图，不新增 JSON 字段或另一份事实。

| 当前需求/问题 | 需要与否及依据 | 本阶段已成立的做法 | 已有来源/尚缺什么 | 消费步骤与失败责任 |
| --- | --- | --- | --- | --- |
| <本任务实际涉及的项> | <需要/不需要/未知，不能把缺证当不适用> | <业务方法；选择与验证分开> | <固定来源或具体缺口> | <Business Step；S1/S7/S8/S9/S10 等实际 owner> |

S8 只解释必要路径及数据关系；S9 才在来源与政策支持下收敛参数、分支和复用范围。按需记录串行、分支、列表/分页、批量或跨应用，不为填表强加方法。requested 的失败/未运行项不能改为不适用；用户方法偏好与硬约束分开保留，未满足硬约束时不擅自换解法。

## Business Steps

| businessStep | purpose | sourceStepRefs | inputs + sources | execution intent | outputs/observation | verification | stop |
| --- | --- | --- | --- | --- | --- | --- | --- |
| <Bxx> | <业务目的> | <Dxx...> | <每项唯一来源> | <业务操作> | <输出> | <判据> | <停止条件> |

## Parameter classification

| name | role | type/bounds | source | consumers | validation |
| --- | --- | --- | --- | --- | --- |
| <name> | parameter/config/secret/invariant/runtime/expected | <...> | <唯一来源> | <Bxx> | <...> |

## Runtime data dependencies

| value | producer | actual transform | allowed transforms + policy | consumers | validity/reacquire |
| --- | --- | --- | --- | --- | --- |
| <value> | <Bxx/read> | <本次事实> | <未来政策> | <逐项列出> | <...> |

## Capability decisions

| business need | candidate / selection disposition + reason | source/canonical | runtime validation + evidence/scope | consumer | revalidate when |
| --- | --- | --- | --- | --- | --- |
| <need> | <候选、选择处置与理由；未选不伪造失败> | <refs> | <按正式合同记录验证状态、范围和证据；未验证明确保留> | <Bxx/S10/S11> | <条件> |

`selected` 是选择处置，不是运行验证结果。选中但尚未验证必须同时可见；文档存在不等于现场通过。不在此表发明 schema 枚举，不从最终 JS 反推选择历史。

## 业务能力与工程交接

| 业务步骤 | 操作合同/输入输出 | 可复用边界与消费者 | 现有实现或待工程化意图 | S10 要补什么 / S11 使用什么 |
| --- | --- | --- | --- | --- |
| <Bxx> | <业务目的、来源、前后条件、失败与副作用> | <哪些步骤共享同一合同；不强制抽模块> | <实际 helper 固定 ref，或明确标为意图，不能虚构 API> | <规则/范围/证据缺口；已固定决定> |

顺序、分支和循环由业务过程负责；目标、读取、等待与操作约定由应用工程负责；最终函数名、文件拆分及入口由 S11 实现。只交操作名称而不交合同，不算可消费交接。

## Scope / completion

Supported：<...>
Excluded：<...>
Final output：<producer/value/consumer>
Side effects：<...>
Recovery candidates：<未证明不冒充正式支持>
Unresolved：<...>

## 发布检查

- 没有第二套 actionDecisions。
- 每个 input 只有一个正确来源。
- runtime value 未变成 parameter/default。
- producer / consumer / actual transform / allowed transform 分开且完整。
- terminal read 连接 final output。
- 裁剪有来源；Unknown 不冒充不适用；required/requested 不因实现失败被删。
- 选择处置与 runtimeValidation 分列，能力意图不冒充已实现 API。
- 业务能力合同、工程缺口和消费者明确；S8/S9 分开退出，不以最终总分覆盖前序错误。
- S11 不需要从 Raw Trace 猜业务数据流。