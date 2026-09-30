---
title: "应用操作建模与封装｜从业务操作到可靠 operation rules"
description: "定义怎样把已明确的业务操作需求转成可重复定位、读取、等待、动作和验证的应用操作规则。"
order: 50
---

# 应用操作建模与封装｜从业务操作到可靠 operation rules

本文只回答一个问题：

> **怎样把业务上已经明确的操作需求，变成可靠的 Target、定位、读取、等待、动作和验证规则？**

本文拥有应用操作工程模型，不负责重新解释业务过程，不拥有 Structured Collection / VLM / traversal 的专项算法，也不记录某次桌面测试状态。

- S2 / S10 的完整阶段职责见 [task-decomposition](task-decomposition.md)。
- 可选择的方法总地图见 [自动化求解策略空间](../../../docs/frameworks/automation-problem-solving-framework.md#strategy-space)。
- 能力发现和契约读取见 [capability-discovery](capability-discovery.md)。
- application-engineer 怎样独立执行见 [SKILL.md](../skills/application-engineer/SKILL.md)。

## 30 秒总览

~~~text
业务操作需求
  ↓
最小应用认识
  ↓
Target identity
  ↓
选择有条件、有来源的操作策略
  ↓
Locator / Read / Wait / Action / Verifier
  ↓
局部真实验证
  ↓
operation rules / helper
  ↓
交给 recipe-build
~~~

核心原则：

1. **Target identity 与一次坐标分开。**
2. **认识界面、找到对象、成功调用、业务成功是不同证明层。**
3. **只解决当前业务步骤需要的应用问题，不从零研究整个软件。**
4. **Actual 必须来自真实 observation，不能由 Expected 补写。**
5. **副作用可能已经发生时先对账，不盲重放。**

## 1. 三种进入方式

| 模式 | 当前问题 | 正常输出 | 不负责 |
| --- | --- | --- | --- |
| **discover / S2** | 下一步需要知道哪个应用、页面、目标和读取依据 | 最小 AppProfile、evidence、limits | 不提前完成完整 Procedure 或最终工程化 |
| **harden / S10** | Procedure 已明确，怎样把必要操作变可靠 | operation rules / helper / local validation | 不重写业务语义或数据关系 |
| **repair** | 某条应用规则在具体场景失效 | 局部修订、reason、revalidation scope | 不把所有失败都归因于定位 |

三种模式不要求机械串行。已有规则足够时可以精确复用，不为了“完整”重做。

## 2. 先固定业务操作需求

进入应用工程前，先从 TaskContract / SemanticProcedure 得到：

- 业务对象；
- 操作目的；
- 输入及来源；
- 预期变化；
- 实际输出应该从哪里观察；
- 成功 / 失败条件；
- 禁止替代方式；
- 授权和副作用边界；
- 支持范围。

如果这些问题本身还在变化，返回 S1 / S8—S9，而不是让应用工程猜业务需求。

## 3. 最小应用认识

默认顺序：

~~~text
先确认当前应用 / window / page / business object
→ 再确认当前步骤真正需要的 target / result region / state
→ 只补会阻塞当前操作的未知
~~~

至少要能回答：

- 当前是哪一个应用、窗口、页面或模式；
- 本次要操作或读取哪个业务对象；
- 哪些 parent region / anchor 会影响唯一性；
- 当前有无 loading、modal、disabled、focus 等状态；
- 依据来自 native tree、OCR、image、历史 Profile 还是人工说明；
- 哪些是 observed，哪些只是 inferred / unknown；
- 当前证据只够认识、定位，还是已经足够操作。

一张截图可以足够理解页面，但如果没有可靠坐标映射或语义定位依据，就不能据此宣称可以安全点击。

## 4. Target、Locator、Geometry、Coordinate 必须分层

~~~text
Target
  业务上真正要操作谁

Locator
  当前凭什么在界面 / native tree 中找到它

Geometry
  当前空间关系怎样解释

Coordinate
  本次执行时的临时位置
~~~

错误例子：

- 把“第二行”永久写成订单身份；
- 把旧坐标保存成长期 Target；
- 在整个窗口里永远取第一个“查看”；
- 只因为文字相同就忽略 parent scope。

正确例子：

~~~text
当前订单表格
→ 按实际 orderId 找唯一记录
→ 在该记录作用域内找“查看”
→ 点击
→ 进入详情页后重新验证 orderId
~~~

## 5. 一条 operation rule 最少要说明什么

每个必要操作至少能回答：

| 字段 | 问题 |
| --- | --- |
| purpose | 为什么需要这条操作 |
| input | 输入从哪里来 |
| target | 真正的业务对象是谁 |
| precondition | 动作前必须成立什么 |
| locator | 当前怎样唯一找到 Target |
| read | 需要从哪里读取 Actual |
| wait | 等什么状态、多久、何时停止 |
| action | 实际执行什么 |
| actualOutput | 动作后真实得到什么 |
| postcondition | 正确后置是什么 |
| verifier | 怎样独立判断是否做对 |
| failure | 歧义、not-found、partial、unknown 怎样处理 |
| scope | 哪些 app / mode / environment 已被证明 |
| source | 规则依据和 evidence 在哪里 |

不是所有操作都需要所有子字段，但缺失的关键边界必须显式说明。

## 6. 先发现已有能力，再决定怎样实现

在自己设计低层 Accessibility traversal、鼠标坐标或自定义 resolver 之前，先按 [capability-discovery](capability-discovery.md) 检查当前业务步骤已有的 OpenDesk 能力。

正确顺序：

~~~text
业务操作需求
→ 候选能力
→ Method Selection
→ Contract Reading
→ 当前环境 Runtime Validation
→ application rule
~~~

文档中存在 API 不等于当前应用已经验证；高层 API 也不是默认正确答案。

如果现成能力无法表达 Target identity、parent scope、失败停止或必要 verifier，才有理由加入额外应用规则或下沉。

<a id="operation-strategy"></a>

### 6.1 操作策略：把一种做法表达完整，不增加平行产物

**操作策略（Operation Strategy）是某个应用操作在限定条件下怎样实现、验证和停止的完整做法。** 它不是新阶段，也不是必须加载的策略引擎。沿用 `AppProfile.operations`、`targets`、`geometryRules`、`verifiers`、`limitations`、`changeLog` 和普通 helper；现有模板中的 `actionStrategy` 是操作执行部分，不另建 Strategy Registry 或 `strategies.json`。正式字段仍由[共享合同](../../../docs/frameworks/agent-to-recipe-skill-contract.md)拥有，本节不宣布 schema 升级或 Guard 已自动支持新增检查。

| 必须说清什么 | 可审阅的实际内容 |
| --- | --- |
| 操作合同 | 目的、业务对象、输入来源、输出、前后条件及禁止改变的语义 |
| 选择理由 | 少量候选、选中与未选理由；先排除硬约束不满足者，再比较复用、维护成本与环境敏感性 |
| 实现组合 | 实际 API/契约、观察来源、目标绑定分别列出；Locator 不是固定处于高层 UI 与 Accessibility 之间的一层 |
| 适用条件 | app/OS/version、locale/theme、page/mode、layout/window/DPI、权限及必要依赖；未知明确保留 |
| 运行规则 | 当前定位、实际读取、有界等待、执行顺序、原始回执、独立验证与停止条件 |
| 切换边界 | 是否确有已验证替代路径，何种动作状态下才可切换；没有则明确停止/人工接续 |
| 证据与维修 | 每条路径自己的验证范围和固定证据、失效条件、受影响操作与消费者 |

S2 可以形成待验证候选并在授权内探索，不要求先交完整工程规则。S10 对声明可执行的路径补足必要局部验证，不能把 not-run 提升为已验证备用。一次 Actual 值进入对应运行证据，不成为规则下次运行的默认答案。

只有一条合适路径时就保留一条。真正存在且已验证的替代路径才进入可执行备用集合；未来想法留在候选/缺口中。不得用大量注释代码维护长期备用实现。模板见[规则与维修模板](../skills/application-engineer/templates/operation-rules.md)；教学用完整样本见[Calculator 应用工程示例](../skills/application-engineer/examples/calculator.md)。独立 Producer 仍遵守答案隔离，不把教学样本当本次输入或证据。

### 6.2 与能力决定、Runtime 和上游的衔接

Runtime 已拥有的 Accessibility/OCR 协调由当前 [Desktop UI API](../../../docs/api/desktop-ui.md) 合同负责；应用策略负责业务对象、应用状态、操作约束与结果验证，不在 Recipe 中重新调度底层 provider。换观察来源不等于获得新的输入权限，也不等于动作可以重做。

S10 的实际新选择先保留在原工作包。它若改变 S9 已冻结的 `capabilityDecisions` 或 Procedure 支持范围，发布固定来源与影响，由原责任定向更新，再让 S11 消费一致版本；不静默改业务输入、成功标准或维护第二份互相矛盾的选型。只是固定资料漏交时由协调者补交，不重新选型。源规则与 helper 先冻结，验证记录再引用，避免 hash 环。

## 7. Read：运行时值只能来自真实 observation

读取规则必须说明：

- 从哪个正确对象读取；
- 读取的是 raw value 还是派生解释；
- 原始字符串、单位、精度和格式如何保留；
- 什么时候读值过期；
- 读取失败怎样停止；
- 哪些 consumer 会使用这个值。

禁止：

- 读取失败后返回默认答案；
- 把 Expected 当读取结果；
- 从最终结果倒推中间值；
- 用历史窗口里的旧值补当前运行。

Calculator 中 firstResult 的正确关系是：

~~~text
当前结果区
→ actual read
→ firstResult
→ 保存到任务运行数据
→ 清空 Calculator UI
→ firstResult 仍在任务数据
→ 第二次输入真实消费 firstResult 全部字符
~~~

## 8. Wait：等待必须有条件、有上限、有失败语义

等待规则至少说明：

- condition；
- timeout / budget；
- observation source；
- 成功后下一动作；
- timeout / cancel / partial 时怎样停止或恢复。

fixed sleep 可以作为节流手段，但不能单独证明业务状态已经成立。

## 9. Action：副作用前后都要有边界

副作用前确认：

- 当前 Target identity；
- 当前授权；
- 必要前置；
- 输入来源；
- 重复执行风险。

副作用后区分：

~~~text
调用返回成功
≠
目标真的被操作
≠
UI 已变化
≠
业务结果已经成立
~~~

动作结果 Unknown 时：

~~~text
停止依赖动作
→ 重新观察当前状态
→ 对账
→ 只有确认安全且仍获准时再恢复
~~~

不能默认异常等于“没有发生”。

<a id="strategy-switching"></a>

### 9.1 选择方法与失败后切换，不是同一个决定

以下是既有动作/失败语义的判断表，不新增 Runtime 状态枚举。必须依据原始回执、动作时间顺序与业务观察判断，不能只凭错误名称选择备用。

| 当前事实 | 允许的下一步 | 必须禁止 |
| --- | --- | --- |
| 只读观察失败，尚未输入 | 在原权限、范围和预算内补观察或使用适用的获准观察方法 | 将权限/backend/不完整搜索当作零匹配；自动扩大到整屏或云端 |
| 有证据证明动作未发出 | 重新核对对象、前置、授权后，使用已验证的适用替代路径 | 跳过门禁；把 not-run 候选自动投入业务执行 |
| 动作已发出，效果 unknown / possibly submitted | 停止依赖副作用，核对是否已发生、是否仍在进行 | 换后端、快捷键、图像或坐标再提交一次 |
| 操作序列只完成一部分 | 保存已完成前缀及其效果，确认安全接续点和剩余动作 | 从头重放；将异常解释成整段未执行 |
| 业务成功已被独立确认 | 返回对应范围成功，另记回执或诊断异常 | 因日志格式异常重做成功业务 |
| 有证据证明未产生效果且原动作已终止 | 在任务许可、重复风险与重新预检均满足时，按明确恢复规则接续 | 把暂未看到结果当未执行；忽略仍在进行的提交 |
| 取消、权限不足或无可靠备用 | 停止并保留原因，必要时人工接续 | 以人工选择策略、auto 或 fallback 绕过取消/授权/身份限制 |

搜索、打开会话、滚动、切页会改变应用状态，不全部归为只读 fallback。人工选择只选择获准方法，不取消动作门禁。若上游批准 `strategy` 配置，`auto` 也只能在已验证、当前适用、切换条件满足的集合内选择；不是任意失败后遍历全部方法。这里的名称是应用配置设计示意，不是 OpenDesk 公共 API 新参数。

## 10. Verifier：验证当前业务对象，而不是验证工具自己

Verifier 要尽量从动作自身之外的业务 observation 得到答案。

例如：

- 点击某订单后，验证详情页的 orderId；
- 设置输入值后，重新读取实际字段值；
- 发送动作后，区分 submitted、confirmed、delivered，而不是把输入框清空当作已送达；
- Calculator read 后，保留 actual value，并在后续消费处验证数据链。

## 11. 局部验证与交接

应用工程验证按强度逐层增加：

~~~text
应用 / 页面身份
→ Target 唯一性
→ Locator / Read
→ 单个 Wait / Action
→ 顺序组合
→ runtime data handoff
→ 当前业务子目标
~~~

局部验证只能证明对应 operation rules；最终 Candidate Qualification 仍属于 S12。

交给 recipe-build 时，至少需要：

- 可消费的 AppProfile / operation rules / helper；
- actual API / contract refs；
- supported scope；
- failure / stop semantics；
- local evidence；
- 未验证范围；
- 失效条件。

每条实际启用的策略及允许的切换都要有对应验证；只测主路径不能证明备用。检查正常、变化、歧义、错误读取来源、部分执行和 unknown 的具体要求见[策略验证矩阵](validation-plan.md#strategy-validation)。运行时可读入口仍为任务根 `stage-review.md`：链接本阶段实际输入、所选理由、规则输出、证据、独立评分、Hard Fail、Unknown、failure owner 与下一安全动作；视图不成为第二份规则或资格来源。

## 12. 缓存与 repair

可以复用：

- application identity rule；
- parent / target rule；
- operation contract；
- verifier；
- 已验证 helper；
- 明确支持范围。

不能直接复用：

- 旧 windowId；
- 旧 coordinate；
- 旧 viewport items；
- 示范 runtime value。

出现 app/build、page/mode、layout、locale、DPI/display、target ambiguity 或规则真实失败时，定向 repair。只修失效规则和真实依赖它的下游，不把整个应用重新建模。

<a id="compatibility"></a>

### 12.1 兼容的是有条件的规则，不是永久坐标

| 变化维度 | 需要重新核对 | 不能假定 |
| --- | --- | --- |
| app/OS/version、UI hierarchy、identifier | 对象身份、页面结构、动作语义、读取与验证规则 | 小版本一定无影响；原生属性永远稳定 |
| locale、button text、结果格式 | name/文字匹配、解析规则、单位和原始值 | 标签或位置看似一致就仍是同一对象 |
| theme、icon、color | 图像模板、颜色/布局线索及相关规则 | 坐标天然比图标稳定；主题不会影响布局 |
| window size、DPI、display、layout | 最新 bounds、图像到屏幕映射、相对区域与安全边界 | 旧比例或绝对位置可以永久复用 |
| 列表内容、排序、滚动、页面变化 | 当前业务 identity、可见范围和目标重新定位 | 原来第三行仍是原对象；当前视口等于全集 |
| Runtime/API、helper 或模块依赖 | 固定契约、代码与依赖版本、验证适用性 | 名字没变就可继承旧 Qualification |

稳定身份规则、当前观察线索、运行时 Geometry、临时 Coordinate 分开保留。相对位置只缩小搜索范围，不独立证明身份；采用几何时从当前窗口/区域和获准观察重新计算执行坐标。固定几何若有证据，在明确限定范围内可用，不因此宣称兼容未来版本。

主策略和备用各记录自己的环境范围、证据与 `revalidateWhen`。范围内正常成功与范围外安全拒绝分别报告；全部拒绝不是兼容通过。requested 场景失败不能移到 excluded 取得 PASS；未测环境保持 not-run/unknown，范围外声明仍遵守共享合同。

<a id="operation-packaging"></a>

### 12.2 应用操作、适配层和 Recipe 的封装边界

| 对象 | 唯一责任 |
| --- | --- |
| 通用 Runtime | 窗口、输入、原生观察、OCR、几何与执行生命周期等通用能力 |
| AppProfile | 应用身份、状态、目标、关系、操作规则、范围和来源 |
| 应用操作 | 一个有明确输入输出、前后条件、验证和失败边界的应用动作 |
| App Adapter / helper | 复用应用语义映射、专属定位/操作/保护/验证；不再实现一套 Runtime |
| Business Step | 为什么执行、业务数据来自哪里、输出交给谁 |
| Recipe | 组织本任务的顺序、分支、循环、参数和安全停止 |

沿用[应用适配层合同](../../../docs/architecture/desktop-automation/app-adapter-contract.md)。一次操作的多个策略是该操作的实现选择，不是新业务步骤；跨视口业务终止条件与整个流程决策仍归 Recipe。没有复用收益时，内联或少量 helper 足够；不要求每个按钮一个文件、每个操作多个策略或每个应用一个类。

存在真实共享需求时可交付普通应用 helper/模块，并固定其合同、实际字节、依赖与验证范围。当前 `.mjs` 文件入口和静态相对 import 以 [Runtime](../../../docs/api/runtime.md) 为准；普通 `.js` 不因此改为 ESM，内联入口不能自动继承文件模块支持，CommonJS 兼容全局不作公开契约。模块形式不改变 S10 只交付应用规则/helper、S11 生成最终 Candidate、S12 授予资格的边界。

## 13. 特殊场景只保留工作流入口

### Structured Collection

本文只负责：

- collection region / page / state；
- visible item identity / boundary；
- 与当前业务操作相关的 anchor；
- operation rule 需要的结构约束。

current viewport 不等于 whole collection；item recognition 不等于 traversal。continuity、merge、mutation、scroll、pagination 和 end detection 的算法见 [Structured UI Collection Reading](../../../docs/architecture/desktop-automation/structured-ui-collection-reading.md)。

### VLM / OCR / native tree

它们是 observation 来源，不是三套互相竞争的业务真相。

- 来源和冲突必须保留；
- VLM 可以提出 authoring proposal；
- 模型自报置信度不等于 operation 已验证；
- 运行期 VLM 只有在业务明确需要且 Runtime / 预算 / 隐私边界成立时进入。

### 聊天、订单等具体业务

聊天、订单、Calculator 等只应作为案例说明 Target、dataflow 或 verifier，不在本文复制完整业务流程。业务步骤归 S8—S9，本文只拥有应用操作规则。

## 14. 不负责什么

本文不负责：

- S1 目标、授权和成功标准；
- S3—S6 的真实任务事实；
- S7 的 retain / merge / omit / recovery；
- S8—S9 的 Business Steps、参数和 runtime data policy；
- S11 的最终普通 JavaScript；
- S12 的 Candidate Qualification；
- Structured Collection、VLM、Recorder、Traversal 的专项算法。

发现这些问题时返回对应 owner，不能靠 application-engineer 顺手改写上游真相。

## 15. 读完本文应该能判断什么

一个第一次接触的人应能直接回答：

1. 业务操作需求怎样变成 operation rule；
2. Target 与 Locator / Coordinate 为什么不是同一件事；
3. 什么时候证据只够“认识”，什么时候已经够“操作”；
4. Actual read 为什么不能由 Expected fallback；
5. 副作用 Unknown 为什么不能直接重放；
6. operation rule 最少包含哪些可检查边界；
7. Structured Collection、VLM 和聊天案例为什么不应该抢占应用工程主线；
8. 多个候选怎样选择、何时不能切换、变化影响哪条规则；
9. 应用操作怎样进入 helper/Adapter，而不接管整个 Recipe。
