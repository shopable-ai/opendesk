# 应用操作规则与局部维修模板

> 用于任意应用 harden/repair。先取得已确认过程；本模板不是业务设计、JS 或新规则 schema。各项落入既有 AppProfile.operations/geometryRules/verifiers、changeLog 和 handoff。运行产物写当前工作包。

## 基线与工程缺口

任务/计划/过程/AppProfile/方法及四项规格：<固定 ref/内容版本>
mode / scope：<harden 或 repair，原请求范围>
授权、时间/动作/重试/模型预算：<实际限制>

| 过程步骤/目标 | 所需操作 | 已有有效规则 | 本次缺口 | 保留或修改的理由 |
| --- | --- | --- | --- | --- |
| <固定步骤> | <不重新设计业务> | <精确 ref> | <局部问题> | <来源> |

## 每个操作的交付

操作 ID、输入/输出类型、前/后条件：<明确内容>
target：<应用/窗口/页面/业务对象身份>
locator：<范围、匹配条件、唯一性、失效条件>
geometry：<来源观察/区域、坐标空间、映射/安全边界；不用则说明>
读取：<目标、原始值/类型/来源、冲突/空值处理>
等待：<可观察条件、上限、超时停止；不以时间经过证明 ready>
actionStrategy：<实际能力、顺序、回执及后置确认>
runtimeGuards：<身份/状态/权限/副作用门禁>
recoveryRule：<明确失败去向；未知效果先查证，不盲重放>
qualificationClaims：<供 S12 核验的限定主张，不是资格结论>
sourceRefs：<观察、当前 API 正文/公共约束、实际 helper/验证>
unknowns / dependsOn / revalidateWhen：<缺口、依赖与漂移条件>

## repair 专用

原失败及实际回执/观察：<固定来源，不覆盖>
已知副作用及最后可信状态：<confirmed/unknown/partial 的真实情况>
责任判断：<规则/事实/取舍/语义/实现/验收，附依据>
旧/新字段、原因、修改者：<最小差异>
保留资产及受影响消费者：<依赖传播>
安全接续点与重验范围：<没有重验则待验，不标修复通过>

## 发布

| 场景/环境 | 预定判据 | 实际结果与 evidence | 状态/限制 |
| --- | --- | --- | --- |
| <正常/必要变化/停止> | <事先固定> | <真实或未运行> | <有界结论> |

Profile/helper 新版或复用 ref：<实际产物>
同版审阅/视图/handoff：<按先冻结后引用的顺序>
nextRequest：<缺项、原责任、下一安全动作、剩余预算>
Candidate 受影响时交 S11/S12 接续，不沿用旧 Qualification。
