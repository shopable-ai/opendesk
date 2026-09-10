---
title: "结构化界面集合读取｜Structured UI Collection Reading"
description: "定义重复界面数据从多源观察到通用数据项、应用业务对象与 Recipe 的职责边界。"
---

# 结构化界面集合读取｜Structured UI Collection Reading

状态：Target architecture v0.3，2026-09-10。

本文是跨应用“列表／表格／消息流／卡片等重复界面 → 通用结构化数据”的唯一技术正文。目标是把职责拆清楚，而不是提前发布一个万能 API。

本文中的 `ObservationBundle`、`CollectionProfile`、`CollectionItem`、`SemanticVisionProvider` 都是设计合同名称；除非 API、类型、实现和测试同时落地，不得据本文宣称为已发布 Runtime API。

关联：[Native Accessibility](native-accessibility.md)、[Action Target Model](action-target-model.md)、[App Adapter Contract](app-adapter-contract.md)、[Desktop UI API](../../api/desktop-ui.md)、[Accessibility API](../../api/accessibility.md)、[Vision API](../../api/vision.md)、[多应用自动化高频框架能力](../../frameworks/multi-application-automation-primitives.md)。

## 一、先用一句话说明这层到底做什么

这层只解决：

> 给定一个明确的窗口／区域，怎样把当前看得到的重复界面可靠地切成一条条通用数据项。

例如：

```text
微信左侧会话列表
→ 当前可见 8 行
→ 每一行有哪些文字、图标、状态、位置和来源证据
→ CollectionItem[]
```

它不直接决定：

```text
哪一个字段一定叫联系人名称
哪一个字段一定叫订单号
下一步是否滚动
什么时候翻页
跨屏数据怎样去重
什么时候结束
接下来执行什么业务动作
```

这些属于应用业务解释或 Recipe。

## 二、最终冻结的总链路

```text
桌面界面
   │
   ├── AX / UIA 系统控件信息
   ├── OCR 文字识别
   └── 截图 / 布局分析
           │
           ↓
      界面事实包
  ObservationBundle
           │
           ↓
      统一事实格式
           │
           ↓
      划分一条条记录
           │
           ↓
      关联记录内字段
           │
           ↓
      得到候选数据项
           │
           ↓
        可信度检查
       │          │
      可信       不确定
       │          ↓
       │       AI / VLM 辅助
       │       只提出建议
       │          ↓
       │       再次检查
       └────┬─────┘
            ↓
      通用数据项 Item[]
            │
            ↓
        App Adapter
       应用业务解释
            │
            ↓
      具体业务对象
      ├─ Conversation[]
      ├─ Message[]
      └─ Order[]
            │
            ↓
          Recipe
            │
      ┌─────┼──────────┐
      ↓     ↓          ↓
    滚动   翻页      后续业务动作
    去重   结束判断   读取/点击/输入
```

这一版边界优先于此前“把滚动 collector 继续提升为公共 UI API”的设计草案。

## 三、为什么不能做成 `UI.extractList()`

不允许一个方法同时承担：

```text
找区域
+ 获取 AX/UIA tree
+ OCR
+ VLM
+ 布局理解
+ 判断一条记录范围
+ 解释业务字段
+ 滚动
+ 翻页
+ 去重
+ 结束判断
+ 转换成用户业务 Schema
```

原因不是接口名字不好，而是这些职责的正确性边界完全不同。混在一起后，会出现以下问题：

- 无法说明到底是“看错界面”“切错一行”还是“业务字段解释错”。
- VLM 很容易从辅助判断变成事实来源。
- 滚动失败后很难知道已经产生了哪些 UI 副作用。
- 一个应用的分页、去重和结束条件会污染所有其他应用。
- 很难为每一层建立确定性测试。

因此集合读取核心只处理**当前明确观察范围**。

## 四、各个内部名称分别是什么意思

| 内部名称 | 中文理解 | 负责什么 | 明确不负责什么 |
| --- | --- | --- | --- |
| `Observation` | 一条界面事实 | 一段 OCR 文字、一个 AX/UIA 节点、一个布局块等 | 不直接代表业务对象 |
| `ObservationBundle` | 同一次界面观察得到的一整包事实 | 绑定窗口／区域、来源、坐标、时间、完整性和证据 | 不解释订单、联系人等业务含义 |
| `CollectionProfile` | 这类重复结构怎样切分的规则 | 说明列表区域、排列方向、行边界、锚点、结构约束 | 不保存业务字段映射，不负责滚动 |
| `CollectionSegmenter` | 划分记录 | 判断一条 item 从哪里开始、哪里结束 | 不解释字段业务含义 |
| `FieldAssociator` | 关联字段 | 判断某个文字、图标、按钮属于哪一条 item | 不决定“这是订单号还是联系人” |
| `CollectionValidator` | 结构检查器 | 检查漏行、重叠、冲突、歧义、证据是否足够 | 不因为 AI 给了答案就自动放行 |
| `CollectionItem` | 已通过结构检查的通用数据项 | 保存一条记录中可证明的元素、位置、状态和来源 | 不直接成为永久点击目标 |
| `App Adapter` | 应用业务解释层 | 把通用字段解释成会话、消息、订单等 | 不承担通用截图/OCR/AX 后端 |
| `Recipe` | 实际业务流程 | 决定继续滚动、翻页、去重、结束和后续动作 | 不反向篡改底层观察事实 |

普通使用者不需要先掌握这些英文名称；它们主要用于源码、类型和测试中明确边界。

## 五、`CollectionProfile` 的正确位置

`CollectionProfile` 不是“观察后自动生成的结果”，而是调用方已有或作者期建立的结构规则。

正确关系：

```text
AppProfile / Recipe 配置
        │
        ↓
 CollectionProfile ──────────┐
                             ↓
桌面观察 → ObservationBundle → 划分记录
```

例如聊天列表的 Profile 可以表达：

```text
范围：左侧会话区域
排列：从上到下
重复单位：一行会话
可能证据：AX listItem、OCR 文字、头像/分隔线、相邻几何
校验：行不得互相重叠；同名候选必须保留歧义
```

但不能直接写：

```text
field1 = 联系人
field2 = 最后一条消息
field3 = 未读数
```

因为这些已经是应用语义，应由 App Adapter 解释。

## 六、为什么使用 `ObservationBundle`，而不是只用 `Observation[]`

AX/UIA、OCR、截图和 Layout 可能不是同一种坐标，也可能不是同一时刻、同一窗口状态。

因此一包观察至少要能回答：

```text
观察的是哪个应用 / 窗口 / 区域？
是什么时间取得的？
AX/UIA snapshot 是否完整？
OCR bbox 是 image-pixel 还是 screen-logical？
截图怎样映射回桌面坐标？
是否发生窗口移动、resize 或 DPI 变化？
每条事实来自哪里？
```

目标形状示意：

```js
{
  surface: { /* 当前窗口/区域身份 */ },
  capturedAt: "...",
  observations: [
    { source: "accessibility", complete: true, data: {} },
    { source: "ocr", coordinateSpace: "image-pixel", data: {} },
    { source: "layout", coordinateSpace: "image-pixel", data: {} }
  ],
  geometry: { /* 已验证坐标映射 */ },
  evidence: []
}
```

具体字段在实现阶段再冻结；这里冻结的是语义。

## 七、当前视口的读取链路

```text
明确窗口 / 区域
    +
CollectionProfile
        │
        ↓
取得必要界面事实
AX/UIA + OCR + Screenshot/Layout
        │
        ↓
ObservationBundle
        │
        ↓
ObservationNormalizer
统一来源、坐标、unknown/conflict
        │
        ↓
CollectionSegmenter
判断一条记录的边界
        │
        ↓
FieldAssociator
把文字 / 图标 / 控件挂到正确记录
        │
        ↓
ItemCandidate[]
        │
        ↓
CollectionValidator
   │              │
 可信            不确定
   │              ↓
   │      Semantic/VLM Assist
   │        只生成 proposal
   │              ↓
   │      CandidateReconciler
   │              ↓
   └────── CollectionValidator
                  │
                  ↓
           CollectionItem[]
```

### 7.1 分段和字段关联必须分开

例如订单列表：

```text
O-101    待处理    查看
O-102    已完成    查看
```

`CollectionSegmenter` 只证明这是两行。

`FieldAssociator` 再证明第二个“查看”属于 O-102 那一行。

至于 `O-102` 是订单号、`已完成` 是订单状态，由 App Adapter 解释。

这样可以避免“看到同名按钮就选第一个”的错误。

## 八、AI / VLM 的位置

VLM 可以帮助理解：

- 图标含义；
- 复杂视觉 grouping；
- 不规则行边界；
- 没有可用 UI tree 时的视觉结构候选；
- 作者期生成 CollectionProfile proposal。

但模型输出只能是：

```text
建议的边界
建议的字段归属
建议的结构类型
confidence（如果 provider 实际提供）
证据引用
unknown / conflict
```

不允许：

```text
Validator 不确定
→ VLM 给一个答案
→ 直接变成可信 Item[]
```

必须：

```text
Validator 不确定
→ VLM proposal
→ 与 AX/UIA/OCR/Layout 证据重新对齐
→ Validator 再检查
→ 通过后才成为 CollectionItem[]
```

### 8.1 OCR 与语义视觉必须分开

当前 `Vision.runOCR()` 的职责仍是 OCR。不要把 OCR provider 不断扩展成“万能 GUI 理解模型”。

目标上区分：

```text
OCR Provider
→ 读取可见文字

Semantic Vision Provider
→ 提出复杂视觉关系 / grouping 的语义建议
```

`SemanticVisionProvider` 仍只是目标合同名称，不是当前已发布 Runtime global。

### 8.2 作者期优先，运行期按需

默认推荐：

```text
第一次认识页面
→ AI / VLM 辅助建立 Profile
→ 程序校验 + overlay 审阅
→ 固化 CollectionProfile
→ 后续普通 JavaScript 确定性运行
```

只有确定性结构无法处理、且任务明确允许模型调用时，才考虑运行期按需辅助。

## 九、集合读取与业务解释必须分层

框架输出：

```text
CollectionItem[]
```

例如：

```js
[
  {
    elements: [
      { kind: "text", text: "张三", source: "ocr" },
      { kind: "text", text: "你好", source: "ocr" },
      { kind: "text", text: "10:32", source: "ocr" }
    ],
    evidence: []
  }
]
```

App Adapter 再解释为：

```js
[
  {
    contactName: "张三",
    lastMessage: "你好",
    time: "10:32"
  }
]
```

同一套 Collection core 到订单页面时，可以由另一个 Adapter 解释为：

```js
[
  {
    orderId: "O-102",
    status: "已完成"
  }
]
```

因此：

```text
Collection core 负责“界面里可靠读到了什么”
App Adapter 负责“这些内容在这个应用里是什么”
Recipe 负责“拿到业务对象后接下来做什么”
```

## 十、滚动、翻页、去重、结束判断归 Recipe

当前架构不再把 `UI.collectCollection()` 作为计划中的公共 Runtime API。

原因：

- 滚动容器、方向和恢复要求依赖具体业务和页面；
- 分页 / Load More 往往需要应用专属动作和后置验证；
- 去重通常需要业务 identity，不能只按文字或当前位置；
- “结束”可能由业务状态、分页标识、滚动状态或服务端结果共同决定；
- 自动 traversal 会引入 UI 副作用，不能伪装成单纯读取。

推荐组合：

```text
Recipe
  ↓
读取当前可见区域
  ↓
App Adapter 转成业务对象
  ↓
Recipe 判断是否继续
  ├─ 不需要：进入后续业务
  └─ 需要：执行明确滚动 / 翻页
              ↓
          验证页面真的变化
              ↓
          再读取当前区域
              ↓
          按业务 identity / 规则合并
```

如果未来多个真实应用证明 scroll traversal 存在稳定、跨应用、可验证的公共合同，再单独评审公共 helper；不能提前成为 Collection core 的职责。

## 十一、与 Target / Locator 的关系

集合读取回答：

> 当前界面里有哪些数据项？

Target / Locator 回答：

> 已经选定某个业务对象以后，当前应该操作哪一个真实 UI 目标？

两条链共享观察事实，但不能混成同一个接口：

```text
ObservationBundle
        │
   ┌────┴─────────────┐
   ↓                  ↓
集合读取            目标定位
   │                  │
CollectionItem[]   LocatorBundle
   │                  │
   ↓                  ↓
App Adapter        TargetResolver
   │                  │
业务对象              │
   │                  │
   └────用户/Recipe选定对象──┘
                      ↓
                 动作前检查
                      ↓
                  点击 / 输入
                      ↓
                    验证
```

因此不允许：

```js
mouse.click(item.bounds.center)
```

把一次读取出来的 bbox 直接当永久目标。

正确做法是把选中的业务对象转换为当前 Target candidate，并按最新界面重新解析。

## 十二、不能保存永久 AX/UIA 引用

当前 `Accessibility` 的元素引用属于当前 execution：

```text
execution-owned
opaque
release 后失效
目标重建后可能失效
跨 execution 不能恢复 authority
```

所以长期保存的 CollectionProfile / Recipe 只能保存：

- selector facts；
- 文字和结构证据；
- 行/容器关系；
- anchor 关系；
- 相对几何规则；
- 可重新计算的 locator candidate hints；
- 证据和适用条件。

当前 execution 中的原生 ref 可以作为短生命周期实现细节，但不能成为 Recipe 的永久身份。

## 十三、失败与安全语义

至少需要区分：

- `SOURCE_UNAVAILABLE`：必要观察来源不可用；
- `EVIDENCE_CONFLICT`：AX/UIA、OCR、Layout 等关键事实冲突；
- `SEGMENTATION_UNCERTAIN`：无法可靠划分 item；
- `ASSOCIATION_UNCERTAIN`：字段无法可靠归属某条 item；
- `COVERAGE_PARTIAL`：当前观察范围存在明确缺口；
- `SEMANTIC_PROVIDER_FAILED`：VLM 调用失败、拒绝、超时或结果不合法；
- `PROFILE_MISMATCH`：CollectionProfile 已不适用于当前页面／布局。

原则：

```text
不确定 → 保留不确定 / fail closed
```

而不是：

```text
不确定 → 选第一个 / 选最像的 / 让 VLM 猜一个 → success
```

## 十四、与现有 OpenDesk API 的边界

当前可以复用的能力包括：

- `Accessibility.snapshot/find/read/perform/release`：AX/UIA 原生结构和动作；
- `Vision.runOCR()`：OCR；
- `Vision.analyzeLayout()`：布局分析；
- `UI.findText()/tapText()/tapTexts()`：高层文字定位和动作；
- `Geometry`：明确坐标空间与可重算几何；
- 页面截图能力。

`Vision.detectUI()` 已是 Deprecated，不再作为新架构中的正式来源名称。新架构统一使用更稳定的来源分类：

```text
accessibility
ocr/text
layout
image/template
manual evidence
semantic assist
```

当前没有证据证明 `CollectionSegmenter`、`FieldAssociator`、`CollectionValidator`、`SemanticVisionProvider` 或公共 `UI.readCollection()` 已实现。

## 十五、实现策略：先验证合同，再决定是否新增 Runtime API

第一阶段不直接新增 `UI.readCollection()`。

建议顺序：

1. **合同与 fixture**
   - 冻结 ObservationBundle / CollectionProfile / CollectionItem 的最低数据合同。
   - 建立普通列表、异高消息流、重复文本、无可用 UI tree 等离线 fixture。
2. **确定性 JavaScript 原型**
   - 用当前公开 Accessibility / Vision / Geometry 能力实现当前视口：normalize → segment → associate → validate。
   - 不滚动，不做业务 Mapping，不依赖在线 VLM。
3. **App Adapter 案例**
   - 至少验证聊天会话列表、消息 timeline、订单/表格中的 3 类真实业务映射。
   - 验证“结构正确”和“业务字段正确”可以独立失败。
4. **VLM 辅助**
   - 先在 application-engineer 作者期使用。
   - 只有确定性路线不足时再评估显式 runtime assist。
5. **公共 API 评审**
   - 只有至少两个独立应用反复出现同一组合，且生命周期、坐标、取消或性能确实需要统一 owner，才评审是否发布 `UI.readCollection()` 或更窄的公共 facade。

不会因为本文存在就新增 Go Runtime、第二套 Accessibility owner、新 Skill、Compiler、IR 或 Replay Runtime。

## 十六、验证矩阵

进入公共能力评审前至少覆盖：

- AX/UIA 完整 list；
- AX/UIA 不完整但 OCR 正常；
- 没有 usable UI tree 的纯视觉列表；
- OCR 正常但 item grouping 困难；
- 同一行多个同名按钮；
- 连续多个完全相同文本 item；
- variable-height 消息 timeline；
- VLM proposal 正确且 validator 接受；
- VLM 与 native/OCR 冲突；
- VLM timeout / schema invalid；
- window move / resize；
- 不同 DPI / coordinate mapping；
- CollectionProfile drift；
- App Adapter business mapping 错误不能被算成 Collection core 成功；
- Collection core 漏项不能由 Adapter 猜值掩盖。

## 十七、与 Agent-to-Recipe 的关系

application-engineer 在作者期负责：

```text
明确要读取的重复区域
→ 复用已有 AppProfile / CollectionProfile
→ 取得必要截图、AX/UIA、OCR、Layout 证据
→ 必要时让模型提出 grouping / profile 建议
→ 程序校验
→ overlay 审阅 / 人工纠错
→ 发布版本化 CollectionProfile
```

Recipe 生成阶段只消费已经验证的 Profile 和当前真实 API。

如果 Profile 漂移、多源证据冲突或出现新页面，定向返回 application-engineer 修复；不从零重做整个应用认识。

本文不增加 S13，不增加独立 Collection/VLM Skill，也不建立新 IR / Compiler / Replay Runtime。

## 十八、本次 v0.3 修订

2026-09-10 根据最新架构决策做以下收敛：

- 把 `Observation[]` 升级为带 scope、坐标、时间、完整性和来源的 `ObservationBundle`。
- 明确 `CollectionProfile` 是输入/结构知识，不是 Observation 的自动下游结果。
- 把确定性处理拆成“记录分段”和“字段归属”两个职责。
- VLM 只产生 proposal，必须重新经过 Validator。
- 通用 `CollectionItem[]` 只表达界面事实；App Adapter 负责业务对象解释。
- Recipe 负责滚动、分页、跨批去重、结束判断及后续业务流程。
- 取消此前把 `UI.collectCollection()` 作为目标公共 API 的设计方向。
- Collection 与 Target/Locator 共享 Observation，但读集合与找可执行目标保持两条独立链。
- 不使用 Deprecated `Vision.detectUI()` 作为新架构正式来源名称。

下一步优先进入“合同 + fixture + JavaScript 确定性原型”，而不是新增万能 API。