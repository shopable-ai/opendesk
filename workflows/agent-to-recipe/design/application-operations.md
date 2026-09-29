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
7. Structured Collection、VLM 和聊天案例为什么不应该抢占应用工程主线。
