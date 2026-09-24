# SemanticProcedure 模板

> 用于任意应用的 S8-S9 业务过程提炼。正式 JSON 字段沿用共享合同。

## 固定输入

TaskContract / WorkPlan：<refs>
DistilledSteps：<ref/hash>
AppProfile / relations：<refs>
Policies / capability selections：<refs>
Scope：<supported / excluded>

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

| business need | selected capability | source/canonical | runtime validation | consumer | revalidate when |
| --- | --- | --- | --- | --- | --- |
| <need> | <capability> | <refs> | selected/not-run/partial/pass | <Bxx/S11> | <条件> |

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
- S11 不需要从 Raw Trace 猜业务数据流。