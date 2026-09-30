---
title: "Agent-to-Recipe｜能力发现与能力决策"
description: "定义面对当前业务步骤时，怎样发现候选能力、选择方法、读取完整契约，并在当前 Runtime 中真实验证。"
order: 45
---

# Agent-to-Recipe｜能力发现与能力决策

本文只回答一个问题：

> **面对当前业务步骤，怎样找到可用能力，并确认“这个方法在当前环境里真的可以被后续 Recipe 使用”？**

## 30 秒总览

~~~text
当前 Business Step 需要什么能力
  ↓
从 canonical API 入口定位少量候选
  ↓
Capability Discovery
  ↓
Method Selection
  ↓
Contract Reading
  ↓
Runtime Validation
  ↓
Capability Decision
  ↓
交给 S9 / S10 / S11 消费
~~~

最重要的边界是：

> **文档里存在一个 API，只能证明它值得考虑；只有在当前 Runtime、应用、入口、权限和目标范围里得到真实证据，才能写 Runtime Validation。**

## 1. 四个事实必须分开

| 层次 | 回答的问题 | 最小结果 | 不能冒充 |
| --- | --- | --- | --- |
| **Capability Discovery** | 当前业务步骤有哪些现成能力可考虑？ | 小型候选集合及发现来源 | 最终方法已经选定 |
| **Method Selection** | 当前为什么准备采用这个方法？ | selected / rejected / alternative 及理由 | 当前 Runtime 已成功 |
| **Contract Reading** | 这个方法怎样正确、安全调用？ | canonical contract 与必要公共约束 | 当前应用一定支持 |
| **Runtime Validation** | 这个方法在当前实际环境是否成立？ | pass / fail / partial / not-run + evidence | Candidate 已获得最终 Qualification |

这四层任何一层缺失，都不能由后层文字补造。

## 2. 进入时必须已经知道什么

能力发现从业务问题开始，不从 API 名称开始。

至少要有：

- 当前 Business Step 或近期动作；
- 业务对象；
- 输入从哪里来；
- 希望产生什么实际结果；
- 怎样验证结果；
- 当前授权和副作用边界；
- 已知应用 / Runtime / 平台 / 入口范围；
- 已有能力决定或 AppProfile，如有。

如果连“业务上要完成什么”都不清楚，返回 S1 / S8—S9，而不是靠 API 名称猜需求。

## 3. 第一步：先写能力需求，不先写方法名

正确写法类似：

~~~text
需要：
  在已确认 Calculator window 内
  唯一定位某个按钮
  执行一次点击
  能在歧义时拒绝
  动作后可重新读取业务结果
~~~

而不是：

~~~text
需要 UI.tapTexts
~~~

能力需求应该描述业务语义、身份、范围、错误和验证要求。这样才能比较候选，而不是被熟悉的方法名牵着走。

## 4. 第二步：从 canonical 入口发现少量候选

默认从 [docs/api/agent/README.md](../../../docs/api/agent/README.md) 进入，只打开当前业务步骤相关的一个或少数能力目录。

按问题先区分：

1. **JavaScript 标准能力**：普通数组、对象、Promise 等，不为同名问题强找 OpenDesk API。
2. **Runtime bundled library**：只有当前 Runtime 已声明提供时才使用，并核对版本与入口。
3. **OpenDesk Runtime API**：按能力目录找到候选，再读取选中方法的完整 canonical contract。

候选集合保持小而有业务理由。不要通读全部类型、全部 Reference 或全仓库实现来制造“发现完整度”。

## 5. 第三步：比较候选并做 Method Selection

选择时至少比较：

- 是否满足业务语义；
- Target identity 和作用范围是否能表达；
- 是否能保留必要的输入 / 输出和数据来源；
- 歧义、无结果、partial、unknown 怎样处理；
- 权限和副作用；
- 生命周期和状态依赖；
- 平台 / 入口限制；
- 维护成本；
- 是否已有经过验证的 Profile / helper 可复用。

高层 API 是候选，不是默认正确答案；低层组合也不是更“可靠”的天然答案。

只有现成能力无法保留关键约束时，才有依据下沉。

### 分开比较四个维度，不产生固定台阶

| 维度 | 当前选择应留下什么 |
| --- | --- |
| 执行入口 | 已有应用 helper/operation、高层 UI/Scope/Locator 或必要底层组合及其实际契约 |
| 观察来源 | 原生属性、OCR 文字、图像/模板、布局等实际来源，不把方法名当业务真相 |
| 目标绑定 | identifier、role/name、父区、锚点、关系与唯一性要求，不以旧坐标或最高分代替身份 |
| 业务封装 | 操作、helper、App Adapter 与业务步骤/Recipe 的边界，不另建通用 Runtime |

先排除硬条件不合格者，再在合格候选中优先复用最合适的已验证高层能力；没有已验证能力时形成待验证候选，按原授权做最小探查，不要求 S2 之前已有最终实现。API 成熟度、版本/系统、语言、主题、窗口/DPI/布局敏感性、验证难度和维护成本辅助比较，不能抵消身份、权限或副作用风险，也不新增选型总分。

下沉须指出具体缺口，例如无法表达必要父区、读值无法绑定结果对象、当前入口缺能力或当前实测不适用。Scope/Locator 是执行接口形式，不是固定夹在高层 UI 与 Accessibility 之间的优先级。完整契约阅读后发现原选择不满足条件，应修订选择并保留理由，不为维持先前选择而放松要求。

观察来源组合受当前 [Desktop UI API](../../../docs/api/desktop-ui.md) 的 Runtime 协调与权限边界约束；不让应用 helper 复制内部 provider 调度。应用层额外结构预检必须有身份、完整性或业务状态方面的实际需求。

## 6. 第四步：读取选中方法的完整 Contract

Method Selection 之后，必须读取选中方法真正拥有的 canonical Reference 和必要公共约束。

至少确认：

- 参数与类型；
- 返回值及无结果语义；
- error / ambiguity / partial 行为；
- await / 生命周期；
- 权限；
- 副作用；
- timeout / cancel；
- 平台和入口限制；
- 必要 Target / Locator 约束；
- 依赖和版本。

只读摘要、方法目录或类型声明不等于已经读完整契约。

如果资料冲突、被截断或公共约束在其他 owner 中，继续读取必要范围，直到当前调用所需的约束完整。

## 7. 第五步：在当前 Runtime 中真实验证

Runtime Validation 只回答：

> **选中方法在当前应用、窗口、入口、权限和支持范围里，实际是否成立？**

### 无副作用能力

可以直接在获准范围做最小真实调用，记录：

- 实际入口；
- Runtime / build；
- 应用和对象身份；
- 输入；
- actual return / observation；
- pass / fail / partial；
- evidence；
- 未覆盖范围。

### 有副作用能力

先满足授权和前置条件，再做一次有界动作和独立结果核对。

动作回执成功不等于业务成功。动作效果 Unknown 时先对账，不能通过换 backend 或重放前缀制造更多副作用。

“选择另一个待验证方法”与“自动执行备用动作”不是同一个许可。只读补证仍受权限、隐私、取消与预算控制；搜索、开会话、滚动、切页按实际状态变化处理。效果未知时须排除原动作仍在进行，部分完成须保留已完成前缀；备用路径各自有验证范围才能在获准条件下切换。具体规则只由[应用操作切换判定](application-operations.md#strategy-switching)维护。

### Runtime Validation 不能证明什么

即使方法在局部真实成功，也不能自动证明：

- 所有应用都支持；
- 所有平台都支持；
- 整个 Candidate 已正确；
- S12 Qualification 已通过。

## 8. Capability Decision 应该留下什么

最终被 Procedure / AppProfile / Candidate 消费的能力决定至少说明：

| 内容 | 要回答什么 |
| --- | --- |
| businessNeed | 当前业务步骤需要什么 |
| discoverySource | 从哪个 canonical 入口发现候选 |
| candidates | 哪些候选被比较 |
| disposition | selected / rejected / failed / not-run |
| selectedMethod | 最终准备消费哪个方法 |
| contractRef | 完整契约及必要公共约束来源 |
| runtimeValidation | 当前环境真实验证到了什么 |
| consumer | 哪个 Business Step / operation rule / Candidate 使用 |
| limits | 未验证范围和限制 |
| recheckCondition | 什么变化后必须重新检查 |

只有最终会被后续 Recipe 消费的决定需要长期进入 SemanticProcedure.capabilityDecisions；临时探索不要求永久保存。

失败候选只有在真的执行并得到失败证据时才写 failed；未尝试只能写 rejected 或 not-run。

本表是阅读含义，正式字段仍以[共享合同](../../../docs/frameworks/agent-to-recipe-skill-contract.md)为准。S2—S6/S10 先保留当前实际选择及证据，S9 收敛正式决定；S10 改变既有选型/范围时交原责任带来源更新精确引用，再由 S11 消费。不能从成功代码倒填历史选择，也不能因文档已更新就继续引用旧 Procedure 的相反选择。

## 9. 资料缓存与重新验证

可以复用的是：

- 未变化的 canonical 文档版本；
- 已确认的方法契约；
- 与当前范围仍匹配的能力决定。

不能因为文档缓存仍新鲜就复用的现场事实包括：

- window identity；
- 当前 focus；
- UI state；
- coordinate；
- permission state；
- 运行时读值。

出现下列情况时定向重查：

- 业务步骤改变；
- API / Runtime 版本改变；
- 入口或平台改变；
- 资料冲突；
- 当前真实验证失败；
- 原适用范围不再成立。

不需要每个业务调用前都重新扫描所有能力。

应用版本、UI hierarchy/identifier、语言、主题、图标、窗口、DPI/display 或列表顺序变化时，按规则的真实依赖重新确认；保存“条件化选择与失效条件”，不保存“以后永远正确”的结论。稳定身份规则可以复用，一次原生 ref、坐标、行号或示范值不能复用为当前事实。正常支持范围内成功与范围外安全拒绝分别记录，后者不计兼容成功。

## 10. Calculator 的最短例子

当前步骤要求：

~~~text
从 Calculator 当前结果显示区
真实读取 firstResult
并把它交给后续第二次按钮输入
~~~

正确能力发现只需要回答：

1. 当前有哪些读取当前窗口文本 / native value 的候选；
2. 哪个候选能绑定正确 Calculator 和结果区域；
3. 选中方法的完整 contract 是什么；
4. 它在当前 Calculator / Runtime 里真实读到了什么；
5. 这个 runtime value 怎样交给后续 consumer。

错误做法包括：

- 因为文档里有 UI.readText 就直接写 Runtime pass；
- 因为 Expected 是 110 就跳过现场读取；
- 因为最后得到 660 就倒证读取方法正确；
- 因为一个候选失败就直接声明整个 Runtime 没能力。

完整案例求解过程见 [Calculator 执行过程演练](../cases/calculator-execution-walkthrough.md)。

## 11. 不属于本文的内容

以下内容由其他 owner 维护，本文只链接：

- S1—S12 的完整执行顺序：WORKFLOW / task-decomposition；
- Target / Locator / Read / Wait / Action / Verifier 的应用工程方法：application-operations；
- 专用 CLI、ai run、-script、Execution envelope：对应 docs/api 文档；
- Candidate 代码提炼与改进：recipe-build / code-rebuild；
- 行为案例、测试 fixture、成本评测、Gate、评分：validation-plan 与 tests；
- 某一 commit 实际通过了什么：docs/quality。

本文不维护 Prompt 模板、CLI 教程、fixture 清单或某轮成本数字，因为这些内容不能帮助它更准确地回答“当前业务步骤应该采用什么能力，以及是否真的可用”。

---

## 附录｜文档边界与相关入口

本文不负责完整 S1—S12 流程、CLI 使用手册、Agent Prompt、测试 fixture、成本报告或代码重构方法。

- 工作流主线见 [WORKFLOW](../WORKFLOW.md)。
- S2 / S10 的应用工程方法见 [application-operations](application-operations.md)。
- API 短入口见 [Agent API 阅读入口](../../../docs/api/agent/README.md)。
- 验证方法见 [validation-plan](validation-plan.md)。
- “有哪些可选解法”按需看[求解策略空间](../../../docs/frameworks/automation-problem-solving-framework.md#strategy-space)；本文只落实当前业务所需能力，不维护第二份总地图。
