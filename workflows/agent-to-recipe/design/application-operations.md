---
title: "应用操作建模与封装｜从界面认识到可靠操作"
description: "定义 application-engineer 怎样从最小界面认识形成可靠的定位、读取、等待、动作与验证规则。"
order: 50
---

# 应用操作建模与封装｜从界面认识到可靠操作

本文只回答一个问题：

> **怎样把已经明确的业务子目标，落实为可重复定位、执行、读取和验证的应用操作？**

本文件是 application-engineer 的专业方法正文，不负责 S7—S9 的业务过程解释，不维护 Structured Collection / VLM / traversal 的专项算法，也不记录某次实现或桌面测试状态。

## 30 秒总览

```text
业务子目标
  ↓
discover：只认识下一步真正需要的应用、页面、目标和读取依据
  ↓
形成最小 AppProfile
  ↓
harden：把已确认 Procedure 所需的定位 / 等待 / 读取 / 动作 / verifier 工程化
  ↓
形成可靠 operation rules / helper
  ↓
repair：发生具体失败时，只修失效规则和受影响范围
  ↓
交 recipe-build / qualification
```

核心原则：

1. **Target 身份与一次坐标分开。**
2. **认识、定位、操作、业务成功是不同证明层。**
3. **只补当前任务需要的规则，不从零研究整个软件。**
4. **Expected 与 Actual 分开，工具成功不等于业务成功。**
5. **结果可能已发生时先对账，不盲重放。**

## 进入方式

| 模式 | 输入 | 目标 | 正常输出 |
| --- | --- | --- | --- |
| **discover** | TaskContract / WorkPlan、已有 Profile、获准观察 | 建立下一步足够安全的最小认识 | AppProfile / evidence / limits |
| **harden** | 已确认 SemanticProcedure、旧规则、工程缺口 | 落实定位、读取、等待、动作、verifier、recovery | operation rules / helper / local validation |
| **repair** | 具体失败、旧版本、受影响范围 | 保留有效部分，只修失效规则 | 新 Profile/helper + reason + revalidation scope |

界面认识、CollectionProfile authoring、定位规则分析是这些模式中的子作业，不新增第四种模式或第二个 Skill。

## 界面认识与审阅作业

### 接到任务后应留下什么

一个新 Agent 至少应能回答：

- 当前是什么应用／窗口／页面／业务对象？
- 本次真正需要操作、读取或验证什么？
- 哪些父区域、锚点、结果区、弹窗／遮挡会影响这些目标？
- 当前依据来自截图、native tree、OCR、历史 Profile 还是人工说明？
- 哪些是 observed fact，哪些是解释、假设或未验证规则？
- 下次重新定位时应依赖什么，而不是依赖上次坐标？
- 当前认识只足够“理解”，还是已经足够“定位／操作”？

主交付是 AppProfile 和必要 evidence；overlay、简化视图、review 页面是派生审阅材料，不成为第二份应用模型。

### 范围与分工

默认任务驱动：

```text
先全局粗识别
→ 再精查当前业务步骤真正依赖的区域和目标
```

必须覆盖：

- 当前核心 Target；
- Target 的必要父区域／锚点；
- 正确页面／对象身份；
- 结果读取区域；
- 遮挡、弹窗、加载、禁用等状态；
- 同名／相似候选的消歧依据；
- 失败会影响的 operation / verifier。

可以延后：

- 与当前任务无关的次要控件；
- 没有消费者的完整应用模型；
- 不影响当前支持范围的视觉细节。

难识别不能成为把核心目标降级出范围的理由。

### 实际作业链

```text
明确本次要回答的界面问题
→ 检查旧 AppProfile / evidence 是否仍适用
  → 足够：核当前现场后复用
  → 不足：定向补观察
→ 判断材料能支持认识、定位还是操作
→ 建立 Target / region / state / relation
→ 分开 observed / inferred / unknown
→ 程序检查几何、ID、关系、坐标空间和版本
→ 生成同版审阅视图
→ 必要时人工纠正
→ 发布最小 AppProfile
→ 若 Procedure 已明确且需要更可靠规则，进入 harden
```

同一工作包内不为每个按钮创建 handoff。

### 观察材料的充分性

不同用途需要不同充分性：

| 用途 | 最低要求 |
| --- | --- |
| **认识** | 能说明页面结构、主要对象、关系与未知 |
| **定位** | 能把业务 Target 与当前屏幕／native 对象可靠绑定 |
| **操作** | 除定位外，还需当前状态、授权、动作方式、后置验证 |
| **长期复用** | 还需支持范围、失效条件、变化样本和重新解析规则 |

例如：一张清晰截图可以足够做人类／模型认识，但如果没有屏幕坐标映射，就不能据此执行真实点击。

材料必须记录：

- 来源；
- 应用／页面身份；
- 时间或“未知时间”；
- 图像尺寸与裁剪；
- 坐标空间；
- 是否与 native/OCR 同期；
- 缩放／DPI 映射是否已知；
- 当前限制。

不从文件名推断 app 身份，不把人工说明伪装成截图观察。

### 模型提取及证据界限

模型可以帮助：

- 布局理解；
- 控件分类；
- 语义命名；
- 父子／同组关系；
- label ↔ field；
- row ↔ action；
- 候选锚点；
- unknown / conflict 发现。

但必须区分：

```text
Observation
Model Interpretation
Assumption
Human Correction
Validated Rule
```

模型自报置信度不是运行资格。

以下内容尤其不能混：

- 文本 bbox ≠ 控件 bbox；
- 控件 bbox ≠ 安全点击区域；
- “看起来像按钮” ≠ 可点击；
- 未观察状态 ≠ false；
- 一次矩形 ≠ 永久身份；
- VLM 看出的文字 ≠ OCR/native value；
- 当前 viewport item 数量 ≠ whole collection size。

### 同版审阅与纠错

审阅视图应来自同一 AppProfile / observation 版本：

- 原始证据；
- overlay；
- 简化结构；
- 属性／来源／unknown／diff；
- 必要时 collection item boundary overlay。

人工纠正时记录：

- 字段；
- 旧值；
- 新值；
- 理由；
- 适用 observation / environment；
- 修改者／来源；
- 受影响 operation / verifier / Candidate。

修订后生成新版本并重建派生视图；原证据不修改。

### 正常记录与按需诊断

正常路径始终保存：

- 当前业务对象；
- 使用的 Profile / rule 版本；
- 关键动作前后事实；
- runtime value；
- verifier 结果；
- limitations / unknown。

只有出现歧义、drift、冲突或业务要求时才展开：

- 全量 native tree；
- 多模型对比；
- 大范围截图；
- 完整候选比较；
- 跨环境分析。

减少诊断冗余不能删除业务关键证据。

### 贯穿示例：同名按钮属于哪条订单

任务：找到输入订单并打开详情。

正确规则应表达：

```text
当前表格
→ 按实际 orderId 找唯一业务记录
→ 在该记录作用域内找唯一“查看”
→ 点击
→ 在详情页重新验证 orderId / identity
```

错误规则包括：

- 永久保存“第二行”；
- 永久保存旧坐标；
- 在全窗口找第一个“查看”；
- 未观察详情页却宣称详情身份验证已完成。

这个示例说明的是 **Target / parent scope / identity / postcondition**，不是某个订单应用的已实现 API。

## Structured Collection Reading 的应用工程入口

application-engineer 在 Collection 场景只负责工作流层结构知识：

```text
确认 collection region / page / state
→ 识别 visible item boundary / repetition / anchor
→ 关联必要 native / OCR / image evidence
→ 必要时形成 CollectionProfile proposal
→ deterministic / review validation
→ 发布 Profile + limits + evidence
```

### 认识 Collection

CollectionProfile 只回答：

> **在一个明确 viewport 中，一条 generic item 怎样被识别？**

它可以描述：

- region；
- axis；
- container/item role hints；
- repeating geometry；
- separators / anchors；
- validation constraints；
- evidence references。

它不拥有 sender、price、customerName、conversationTitle 等业务字段。

### 多源 evidence 不是四套 reader

AX/UIA、OCR、Layout/Image、Semantic Vision 只是不同 observation 来源。冲突要保留，不设置“某 provider 永远是真值”的规则。

完全没有 usable UI tree 时，可以在获准范围使用 screenshot + OCR/layout + semantic proposal，但要明确 visual-only 支持范围。

### Authoring-time VLM 默认优先

如果需要 VLM，默认用于 authoring proposal：

```text
minimal ROI
+ existing observations
+ current profile constraints
→ narrow proposal
→ deterministic validation
→ review
→ versioned profile
```

运行期 VLM 是否存在、怎样接入、预算、provider contract 由专项架构和实际 Runtime 决定，本文件不复制算法。

### Collection 与 Traversal 的责任边界

application-engineer 可以记录“业务需要跨 viewport”和当前 scroll container / risk，但：

- item recognition ≠ traversal；
- current viewport ≠ whole collection；
- scroll 是真实副作用；
- continuity / merge / mutation / end detection 的算法由专项架构拥有；
- 无法证明 continuity 时应该停止或 partial，不为拿完整数组猜着拼。

详见 [Structured UI Collection Reading](../../../docs/architecture/desktop-automation/structured-ui-collection-reading.md)。

### Generic item 与业务字段

```text
CollectionProfile + observations
→ generic CollectionItem[]
→ App Adapter / Recipe parser
→ Message / Order / Conversation / ...
```

业务 mapping 错误不能通过篡改底层结构识别“修好”。

## 聊天业务的粒度与组合示例

这个例子说明业务粒度，不声明某个聊天应用已接通。

| 粒度 | 示例 | Owner |
| --- | --- | --- |
| 框架原语 | 窗口、定位、点击、输入、读取 | OpenDesk Runtime/API |
| 应用语义操作 | 搜索联系人、打开会话、读消息、填写输入 | application rules / helper |
| 组合业务能力 | 向指定联系人发送确定内容 | Recipe / ordinary JS |
| 完整业务流程 | 基于历史决定是否回复并执行 | Recipe + bounded Agent judgement |

### A. 发送已经确定的内容

输入已经给出联系人、确定内容、应用／账号范围和发送授权。

```text
搜索／消歧
→ 打开正确会话
→ 再确认对象
→ 填入确定内容
→ 发送前核授权和内容
→ 发送
→ 验证实际结果
```

不因为“流程完整”而读取无关历史或调用模型生成文案。

### B. 根据历史回复联系人

```text
确认会话
→ 读取获准实际历史
→ bounded Agent 判断：reply / no-reply / human
→ 校验输出
→ 必要人工确认
→ 发送前重新核会话和新鲜度
→ 复用 A 的发送能力
→ 验证实际结果
```

新消息使判断过期时，重新读取／判断或停止，不能发送旧决定。

### 最小操作与数据交接

| 环节 | 必要输入 | 正常输出 |
| --- | --- | --- |
| 会话确认 | 联系人线索、应用／账号范围 | 唯一目标绑定或 unresolved ambiguity |
| 历史读取 | 已确认会话、允许范围 | actual messages + provenance + freshness |
| 判断 | actual history、业务规则、预算 | validated decision / candidate content |
| 发送 | target binding、确定内容、授权 | actual send result / unknown |
| 结果核对 | request、当前对象、结果来源 | submitted / confirmed / unknown 等真实层次 |

输入框清空不等于已发送；已发送也不等于送达／已读，除非有对应证据。

## 作业任务树

### 1. 明确要实现的业务操作

从 TaskContract / Procedure 取得：

- 业务对象；
- 输入；
- 输出；
- 前置；
- 成功；
- 禁止替代方式；
- 风险／授权。

先核已有 API、Profile 和 helper，能复用就不重新造。

### 2. 认识足够完成任务的应用结构

区分：

- application / window identity；
- page / mode；
- parent region；
- target；
- result region；
- loading / modal / disabled / focus state；
- repeated structure；
- current business object。

### 3. 将 Target 身份与一次位置分离

保持四层：

```text
Target      业务上要操作谁
Locator     当前凭什么找到它
Geometry    怎样解析当前空间关系
Coordinate  本次真正执行的临时位置
```

一次 Coordinate 不能升级成 Target identity。

### 4. 选择当前场景可验证的定位方案

可能依据：

- native role / name / value；
- text；
- image；
- anchor + relation；
- region / layout；
- 有证据的矩阵；
- 组合条件。

没有可靠唯一目标时停止，不默认“第一个”“最近”“最高分”。

当前可调用事实以 [Desktop UI API](../../../docs/api/desktop-ui.md) 等正式 API 文档为准；设计名称不能直接写进 Candidate。

### 5. 仅在有依据时采用矩阵或区域拆分

例如 3×4 只是一种候选：

- 必须先确认区域边界；
- 行列和特殊键；
- 支持范围；
- safe point；
- 重排／遮挡／缩放失效条件。

不能把“像网格”当成按钮语义证明。

### 6. 把可靠动作组合成普通操作函数

普通函数只有在它增加：

- 参数转换；
- 业务语义；
- 复用；
- 前后条件；
- verifier；
- 错误处理；

时才值得存在。

不为了“面向对象”给每个应用创建对象方法层。

多位输入先展开业务 token，再映射到实际控件。例如数字 25 是 2 → 5，不是寻找“25 按钮”。

### 7. 明确读取、等待、清空和失败规则

- 读取实际结果区域，不读历史旧值。
- 等待基于状态／observation，不等待 Expected 文本后返回 Expected。
- C / AC / backspace 等语义按当前应用验证。
- 解析必须保留原始值和格式依据。
- 读取失败不返回默认答案。
- 动作可能已发生时先核对，不直接重放。
- 只有状态可确认且有授权时才从安全起点恢复。

### 8. 控制观察成本并保存可复用认识

复用的是：

- application identity rule；
- layout / target rule；
- operation contract；
- CollectionProfile；
- verifier；
- limitations。

不复用的是：

- 旧 windowId；
- 旧坐标；
- 旧 viewport items；
- 示范 read value。

缓存失效至少考虑 app/version、window、mode、layout、locale、DPI/display、theme、target ambiguity 和 profile drift。

### 9. 将确认的操作交给代码构建

交 recipe-build 前，必要操作至少能说明：

```text
purpose
input
target
precondition
action
actual output
postcondition
verifier
failure
supported scope
source / evidence
```

若缺的是业务语义，回 S8—S9；若缺的是应用规则，留 S10；若缺的是 Runtime primitive，建立独立能力缺口。

## 逐级验证与完成边界

验证顺序：

```text
页面 / 对象身份
→ Target 唯一性
→ Locator / Geometry
→ 单操作
→ 顺序组合
→ runtime data handoff
→ 完整业务子目标
→ Candidate qualification
```

Collection 场景另外分开：

```text
current viewport structure
→ business mapping
→ traversal（如需要）
→ final business result
```

discover 完成不等于 harden 完成；harden 局部验证不等于 Candidate 资格；真实应用一次成功也不等于所有布局和平台支持。

验证案例统一见 [validation-plan.md](validation-plan.md)。

<a id="迁移与设计记录"></a>\n## 相关权威文档与历史入口

本 canonical 文件不再维护逐日期迁移日志、旧 blob、某轮 Skill 是否已实现或某次 Calculator 是否通过。

需要：

- 当前实现／测试状态 → `docs/quality/`
- Structured Collection / VLM / traversal 算法 → [专项架构](../../../docs/architecture/desktop-automation/structured-ui-collection-reading.md)
- API 当前事实 → `docs/api/`
- 历史设计演变 → Git history

本文件只维护 application-engineer 当前应该怎样做。
