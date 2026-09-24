# 真实示范成果模板

> 用于任意应用的 S3-S6 示范或定向补采。填入当前任务工作包；正式 JSON 沿用共享合同。

## 固定输入

task / plan revision / request：<refs>
AppProfile / rules：<refs>
业务输入：<有来源值；Secret 仅引用>
环境/入口：<实际版本>
授权和预算：<read/input/upload/external side effects>

## Planned → Actual

| planned step | expected / criterion | actual action + target/input | receipt | observation | status/deviation |
| --- | --- | --- | --- | --- | --- |
| <Pxx> | <事先判据> | <真正发生> | <实际回执> | <真正读取> | <pass/fail/...> |

## Runtime values

| value | type/raw | producer action/application/target | evidence | validity/reacquire |
| --- | --- | --- | --- | --- |
| <name> | <保留原始值> | <actual read> | <ref> | <规则> |

## Consumers

| value | consumer action/application/target | actual input | actual transform | evidence |
| --- | --- | --- | --- | --- |
| <name> | <真正消费者> | <本次输入> | <实际变换> | <ref> |

## Verification / side effects

| criterion | expected | actual observation | evidence | result |
| --- | --- | --- | --- | --- |
| <criterion> | <预定> | <实际> | <ref> | <状态> |

sideEffects：<confirmed/unknown/partial + refs>
unresolved：<不能补造的事实>
planDelta/deviation：<若有>
nextRequest：<缺哪项、返回谁、下一安全动作>

## 发布检查

- planned、actual、expected、observation、runtime value、consumer 未互换。
- action receipt 与 UI/业务后置分开。
- 所有 runtime value 有实际 producer，所有实际 consumers 完整。
- 新补采没有改写旧 execution。
- 最终代码、Expected、fixture 或历史 Qualification 未被用作本次执行证据。