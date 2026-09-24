# procedure-synthesize｜失败处理与返回

## 先保留原输入和局部成果

失败时保存固定 TaskContract/WorkPlan/DistilledSteps、已完成 Business Step 映射、runtime data relations、缺口、检查结果和预算。不要为了得到完整 Procedure 而删掉 unresolved 或补造来源。

## 责任路由

| 问题 | 返回责任 |
| --- | --- |
| TaskContract/业务政策/允许变换缺失 | S1/需求责任 |
| 历史 actual/observation/consumer 事实缺失 | task-demonstrate |
| retain/merge/omit/recovery 或 S7 runtime 投影错误 | trace-distill |
| App identity/target relation/locator/read/wait/action rule 缺失 | application-engineer |
| Business Step 分组、参数分类、producer/consumer/transform 映射错误 | 本 Skill |
| 最终 JS/调用/控制流错误 | recipe-build |
| Qualification/oracle/evidence scope 错误 | recipe-qualify |
| 已存在的获准材料只是漏交 | 协调者 |

## 复用与定向修复

若 S7 字节、方法/规格和合同未变，仅补交 S9 所需政策/关系/选择记录或修正本 Skill 映射，则重检并复用同一 S7，不重跑示范和 S7。

若 DistilledSteps 或共享合同发生影响性变化，重新判断受影响 Business Steps 和 data dependencies；不要沿用旧 producer/consumer 关系。

unknown 的副作用或业务语义保持显式；不能交给 S11 猜。