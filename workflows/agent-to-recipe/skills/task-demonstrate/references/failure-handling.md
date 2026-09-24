# task-demonstrate｜失败处理与返回

## 安全优先

保存原 request、计划版本、实际 action/receipt、最后可信 observation、已知 sideEffects、剩余预算和已经完成的真实局部成果。动作可能已发生而效果 unknown/partial 时，立即停止依赖输入，先在授权范围内核对实际状态；不盲重放、不换 backend 重复提交。

## 归因路由

| 缺口/失败 | 返回责任 | 本 Skill 应保存 |
| --- | --- | --- |
| 目标、授权、业务政策、success criterion 缺失/变化 | S1/需求责任 | 冲突、受影响 planned steps、停止点 |
| App identity、locator、read/wait/action rule 失效 | application-engineer | 原规则、实际失败、目标/环境差异 |
| actual action/read/consumer/evidence 缺失 | 本 Skill 定向补采 | 缺哪项、为何可/不可恢复、补采范围 |
| S7 错删/错合并动作 | trace-distill | 原 Dossier 不重做，指向完整事实 |
| S9 业务含义/参数/数据关系错误 | procedure-synthesize | 原事实保持不变，不用重演掩盖 |
| JS 实现错误 | recipe-build | actual 与规则证据，禁止改历史 |
| Qualification/Oracle 错误 | recipe-qualify | 冻结事实和候选边界 |
| 已有获准材料只是漏交 | 协调者 | 精确缺失 ref/正文，不重新采集 |

## 定向补采

补采是新 attempt/new evidence。只能证明新时点事实以及合同允许的持续性关系；不能冒充原 execution 当时 observation。已有有效前段事实不为补一个终点读值而重跑全部业务。

若原历史事实不可恢复，保留 unknown，并让下游限制结论；不要制造“完整 Dossier”换 pass。

## 复用

方法、输入、环境适用条件和所需事实都未发生影响性变化时可复用已冻结事实。新计划、规则、业务输入、环境或副作用状态变化时重新判断受影响范围；旧失败和旧证据不覆盖。