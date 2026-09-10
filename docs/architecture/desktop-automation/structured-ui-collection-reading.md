---
title: "Structured UI Collection Reading｜结构化界面集合读取"
description: "定义桌面重复数据的 Observation、Collection、VLM、当前视口读取、滚动遍历与业务映射边界。"
---

# Structured UI Collection Reading｜结构化界面集合读取

状态：Target architecture v0.2，2026-09-10。本文冻结跨应用“重复 UI 记录 → 通用结构化集合”的职责边界与实施顺序。本文中的 `UI.readCollection()`、`UI.collectCollection()`、`CollectionProfile`、`SemanticVisionProvider` 均为工作名称／目标合同；除非当前 API、类型、实现和测试已经同时出现，不得据本文宣称为已发布 Runtime API。

关联：[Native Accessibility](native-accessibility.md)、[App Adapter Contract](app-adapter-contract.md)、[Desktop UI API](../../api/desktop-ui.md)、[Accessibility API](../../api/accessibility.md)、[Vision API](../../api/vision.md)、[AI CLI](../../api/ai-cli.md)、[多应用自动化高频框架能力](../../frameworks/multi-application-automation-primitives.md)。Agent-to-Recipe 的应用认识与模型提取仍由 `workflows/agent-to-recipe/skills/application-engineer/` 负责；本文不创建第二个 Skill。

## 一、问题与架构决策

### 1.1 真正的问题

公共能力要解决的不是“提取微信联系人”或“把订单表变成用户指定 JSON”，而是：

```text
Desktop UI
  ↓
Observation[]
  ↓
Collection
  ↓
CollectionItem[]
```

随后才由应用或业务层完成：

```text
CollectionItem[]
  ↓
App Adapter / Recipe / 普通 JavaScript parser
  ↓
Conversation[] / Message[] / Order[] / File[] / ...
```

因此 Runtime 负责可验证的 UI 集合读取，业务字段解释留在 Adapter／Recipe。`sender`、`customerName`、`orderPrice`、`conversationTitle` 等字段不是通用 Runtime contract。

### 1.2 不采用万能 `UI.extractList()`

不把以下职责合并到一个接口：区域发现、AX/UIA、OCR、VLM、布局理解、item 分段、业务字段解释、滚动、分页、去重、结束判断和业务 Schema 转换。一个同时承担这些职责的 API 难以定义完整性、失败语义和可重复测试，也会让未来模型或平台变化直接侵入业务代码。

冻结为两层工作形状：

```text
UI.readCollection()      当前 viewport 的观察与分段；不滚动
UI.collectCollection()   有副作用的 traversal 包装；重复调用 readCollection()
```

`readCollection()` 是基础 primitive；`collectCollection()` 不复制第二套识别算法。

## 二、核心链路

### 2.1 当前视口读取

```text
resolve window / region
  ↓
load CollectionProfile
  ↓
collect available evidence
  ├─ Accessibility / AX / UIA
  ├─ screenshot
  ├─ OCR
  └─ layout / image observations
  ↓
normalize → Observation[]
  ↓
deterministic CollectionSegmenter
  ↓
CollectionValidator
  ├─ accepted ───────────────────────────────┐
  └─ uncertain + explicit assist allowed     │
               ↓                             │
        Semantic Vision / VLM proposal       │
               ↓                             │
        merge as evidence, not truth         │
               ↓                             │
        CollectionValidator again ───────────┘
  ↓
CollectionPage { items, coverage, evidence, warnings }
```

### 2.2 跨视口滚动读取

```text
UI.readCollection(viewport A)
  ↓
controlled scroll
  ↓
wait for observable viewport change
  ↓
UI.readCollection(viewport B)
  ↓
continuity match A.suffix ↔ B.prefix
  ↓
merge without collapsing legitimate duplicates
  ↓
repeat until proved end / limit / failure
```

滚动遍历与“当前视口是否读对”是两个不同问题。后者失败时前者不得继续累积更多不可信数据。

## 三、通用数据模型

### 3.1 Observation

`Observation` 是不同感知来源的统一事实容器。它至少需要能表达来源、几何范围、可见文字／role／状态、confidence（如果来源实际提供）和证据引用。具体 schema 留待实现批次冻结。

来源可包括：

```text
Accessibility / AX / UIA
OCR
Layout / Image
Semantic Vision / VLM
```

不要实现四套彼此不兼容的 `AXListReader`、`OCRListReader`、`VLMListReader`。底层先规范化为 `Observation[]`，集合层再消费。

VLM 产生的是解释性 observation／proposal；必须保留 `source: semantic-vision` 或等价来源，不能冒充 native 属性或 OCR 结果。

### 3.2 CollectionProfile

`CollectionProfile` 只回答：**在一个已知区域和 viewport 内，怎样识别“一条 item”**。

可包含：

- collection kind：list、table、grid、timeline、cards、tree、virtual collection；
- axis 与视觉流方向；
- native container/item role 候选；
- item 尺寸、间距、重复布局、separator、anchor；
- 已验证的视觉特征；
- item 分段及结构验证约束；
- 适用页面、布局、语言、缩放、主题或版本条件。

不得把业务字段映射写入 CollectionProfile。`title/time/preview` 属于应用 parser；`sender/price/orderId` 属于业务对象解释。

### 3.3 CollectionItem

工作形状：

```js
{
  index: 3,
  bounds: { /* screen logical or explicitly tagged space */ },
  elements: [
    {
      kind: "text",
      text: "...",
      bounds: { /* ... */ },
      source: "ocr"
    }
  ],
  native: {
    role: "listItem"
  },
  states: {},
  evidence: {}
}
```

`index` 只表示本次读取顺序，不是跨 viewport、跨 execution 的稳定 identity。没有真实 stable id 时不得编造一个。

### 3.4 CollectionPage 与 coverage

必须区分两个问题：

1. 当前 viewport 中可见集合是否被可靠读取；
2. 整个逻辑 collection 是否已经遍历完成。

因此不要让单一 `complete: true` 同时承担两种含义。目标合同应显式描述类似：

```text
coverage.scope  = current-viewport | traversed-range | whole-collection
coverage.status = complete | partial | uncertain
```

字段名可以在 API 评审时调整，但语义必须分离。

## 四、AX/UIA、OCR、Layout 与 VLM 的关系

不存在一个永久正确的全局优先级。不同来源回答不同问题：

| 问题 | 优先证据 |
| --- | --- |
| 原生 role、value、action、enabled 等语义 | AX/UIA；以当前 backend 实际暴露为准 |
| 精确可见文字 | native value 与 OCR 按适用情况交叉验证 |
| OCR bbox、可见文本块 | OCR |
| 分隔线、区域和重复视觉结构 | Layout / Image |
| 图标含义、复杂视觉 grouping、区域／item 语义 | VLM 更有价值，但仍是 proposal |
| 是否完整、是否业务成功 | 多源结构验证与独立后置条件，不能由单一来源自报 |

AX/UIA 不完整时可以继续使用视觉路线；但“UI tree 只返回当前 8 个 item”不等于完整列表只有 8 条。OCR 或 VLM 看到了内容也不证明原生 action 能执行。

### 4.1 多源冲突

例如 native 显示 8 个 `listItem`，视觉分段只有 6 条时，不允许选择一个更方便的数字并返回成功。应保留冲突并使结果进入 `partial/uncertain`；strict 读取应失败关闭。

silent wrong result 比显式错误更危险。真实 10 条却返回 8 条并标记“完整”属于阻断性缺陷。

## 五、大模型 / VLM 缺口与正式接入方式

### 5.1 OCR Provider 与 Semantic Vision Provider 分离

当前 `Vision.runOCR()` 的 provider 语义是 OCR。不要通过把 `openai`、`google` 等名称塞进 OCR provider，就逐步让 `runOCR()` 承担完整 GUI 语义理解。

目标架构应区分两个 Provider family：

```text
OCRProvider
  ├─ Apple Vision OCR
  ├─ PaddleOCR
  └─ Tesseract

SemanticVisionProvider
  ├─ Remote HTTP VLM
  ├─ Local VLM
  └─ future provider
```

`SemanticVisionProvider` 是本文工作名称，不代表已经存在公共 Runtime 对象。

### 5.2 Authoring-time VLM 是默认推荐模式

模型快速发展时，优先让模型参与“认识一次、固化规则”，而不是每次生产运行都重新解释完整页面：

```text
最小 ROI screenshot
+ AX/UIA observations（若可用）
+ OCR lines + bbox
+ layout observations
+ 当前 AppProfile / CollectionProfile 候选
  ↓
VLM 提出 collection/item grouping 与 profile proposal
  ↓
结构校验 + overlay review + 必要人工纠正
  ↓
保存 CollectionProfile
  ↓
普通 JavaScript 多次确定性执行
```

这与 application-engineer 已有“模型主导认识、程序校验和绘图、人工必要审阅”的职责保持一致。

### 5.3 Runtime VLM assist 是显式 fallback

目标形状可类似：

```js
await UI.readCollection({
  within: win,
  region,
  profile,
  assist: { mode: "on-uncertain" }
});
```

默认应关闭或保持明确 opt-in。只有 deterministic segmentation 无法通过验证、且任务允许模型调用时才进入 VLM。模型响应再次经过 `CollectionValidator`，不能直接成为最终 Item[]。

模型失败、timeout、schema invalid、拒绝、空返回或证据冲突是正常失败状态；不得无限自动重试。

### 5.4 给 VLM 的输入

不要默认只给一张全屏截图和一句“理解这个界面”。推荐限定为：

```text
minimal ROI screenshot
+ normalized AX/UIA observations
+ OCR text/bbox
+ layout regions/separators
+ CollectionProfile / task constraints
+ constrained output schema
```

任务应尽量窄，例如“提出当前 viewport 的 item boundary/grouping proposal，并关联 observation id”，而不是“理解整个微信并生成所有业务数据”。不得上传无关桌面区域或未经授权的敏感内容。

### 5.5 HTTP 与 `opendesk ai` 的边界

远端 VLM 的第一版原型可以通过 HTTP provider 实现，但 `UI.readCollection()` 不应绑定厂商、模型名、URL 或 API key。模型替换只影响 provider，实现不反向改变 Collection API。

`opendesk ai` 当前是给 Codex、Claude Code 等 Coding Agent 使用的 Desktop Runtime 薄 CLI，适合 authoring：发现能力、找窗口、截 ROI、OCR、执行和验证 Recipe。生产 `UI.readCollection()` 内部不要启动 `opendesk ai` 子进程再等待 Agent；这会额外引入 nested execution、process ownership、取消、timeout 和 stdout 协议问题。Runtime VLM 应由明确 provider owner 调用。

## 六、两个公共 API 的目标职责

### 6.1 `UI.readCollection()`：当前 viewport primitive

目标职责：

- 调用方给出明确 window / region；
- 使用 CollectionProfile；
- 取得必要 AX/UIA、截图、OCR、layout 证据；
- 规范化 Observation[]；
- 在当前 viewport 分段为 CollectionItem[]；
- 做结构验证；
- 可选 VLM assist；
- 返回 items、coverage、evidence、warnings。

明确不负责：

- 自动滚动；
- 点击“下一页”；
- 无限 load-more；
- 跨 viewport 去重；
- 任意业务 Schema；
- 在线 Agent 规划；
- 保存数据库；
- 业务动作和业务成功判断。

从行为上它应尽量保持观察型；实际 screenshot / native observation 的权限和前台约束仍服从现有 API。

### 6.2 `UI.collectCollection()`：有副作用的 traversal orchestrator

目标职责是包装 `readCollection()`，而不是实现另一套识别器：

```text
readCollection
→ advance viewport
→ wait for real change
→ readCollection
→ prove continuity
→ merge
→ repeat
```

它改变滚动位置，因此不能伪装成纯读取。首批只建议实现经过验证的 `scroll` traversal；分页、Load More 和应用专属“下一页”先作为同一 Traversal 架构下的未来 strategy。

工作形状：

```js
await UI.collectCollection({
  within: win,
  region,
  profile,
  traversal: {
    type: "scroll",
    direction: "up",
    maxSteps: 50,
    maxItems: 1000,
    timeout: 60000
  }
});
```

字段和默认值尚未冻结为 API；示例只表达职责边界。

## 七、滚动、连续性、合并和去重

### 7.1 Overlap 是连续性证据，不是固定百分比合同

滚动不宜每次刚好整屏跳转，否则前后 viewport 很难证明相接。实现通常应保留一定重叠区域，例如 20%～40% 作为候选，但这个数字必须通过具体列表和平台测试决定，不能写成全局正确常量。

### 7.2 去重不是 `Set(text)`

以下规则都不能作为通用 dedupe：

```text
item.text
item.index
```

聊天记录可能合法出现多条完全相同的“好的”。正确问题不是“找到相同文本”，而是：**证明 viewport A 的 suffix 与 viewport B 的 prefix 是同一连续区域**。

continuity matching 可以综合真实 stable id（如果存在）、text observations、role/type、相对结构、图像/icon signature、几何关系及序列上下文。无法证明 overlap 时 strict collector 停止并报告 `continuity failure`；不能猜着拼接。

### 7.3 Virtualized collection

AX/UIA 只物化当前可视 item 的情况必须被视为正常平台／应用行为。`readCollection()` 只证明 viewport coverage；`collectCollection()` 才尝试获得更大的 traversed range。不能从一次 snapshot 节点数推断 whole collection size。

### 7.4 Dynamic mutation

微信、Slack、日志和任务列表可能在遍历期间新增、删除或重排 item。若 anchor 突然消失、序列重排或 overlap 无法解释，应停止或返回类似 `COLLECTION_MUTATED` 的结构状态；不得把两个不同时间状态无声拼接成一份“完整历史”。

### 7.5 End detection

结束判断应组合可用证据，而不是依赖单一 OCR 文本：

- native scroll range / end state（只有真实 backend 提供时才使用）；
- 滚动后 viewport 实际没有继续位移；
- screenshot / observation anchors 没有变化；
- 已证明 continuity 后连续没有新 item；
- maxSteps / maxItems / timeout。

达到限制属于部分结果或显式停止，不等于已经证明 whole collection end。

### 7.6 滚动位置恢复

`collectCollection()` 有 UI 副作用。未来可以评估 `restorePosition: none | best-effort | required` 或等价合同，但没有跨平台可靠实现前不得承诺 required restore。

## 八、分页、Load More 与自定义 advance

统一概念是 `Collection Traversal`：

```text
Traversal
  ├─ scroll
  ├─ paged
  ├─ load-more
  └─ application-defined advance
```

首批公共实现只做 scroll。分页／Load More 当前先由 Recipe / App Adapter 组合：读取当前页 → 执行应用已有的“下一页/加载更多”动作 → 等待页面 identity 或内容变化 → 再读取。只有多个应用证明其前置、变化检测、终止和错误语义稳定一致后，再提升为 built-in traversal strategy。

这样既为翻页预留架构位置，也避免第一版 `collectCollection()` 成为通吃所有导航方式的巨型方法。

## 九、业务映射边界

Runtime 输出通用 Item[] 后，外部再转换：

```js
const page = await UI.readCollection(/* target contract */);
const conversations = page.items.map(parseConversation);
```

或：

```js
const history = await UI.collectCollection(/* target contract */);
const messages = history.items.map(parseChatEvent);
```

`parseConversation()` / `parseChatEvent()` 可以由 Agent 在 authoring 阶段辅助生成并验证，但当字段规则已经稳定时，生产运行应优先普通 JavaScript，不因模型可用就强制每次重新解释业务 Schema。

业务 parser 错误不能归因于 `readCollection()`；反过来，Runtime 漏 item 也不能由 parser“猜出缺失业务数据”来掩盖。

## 十、失败与安全语义

至少需要覆盖以下结构状态；具体 error code 在实现评审时统一：

- `SOURCE_UNAVAILABLE`：需要的 native/OCR/VLM source 不可用；
- `EVIDENCE_CONFLICT`：来源对 item 数量、边界或身份有关键冲突；
- `SEGMENTATION_UNCERTAIN`：当前 viewport 无法可靠切分；
- `COVERAGE_PARTIAL`：当前或遍历范围存在明确缺口；
- `CONTINUITY_UNPROVEN`：相邻 viewport 无法证明连续；
- `COLLECTION_MUTATED`：遍历期间结构发生不可安全合并的变化；
- `TRAVERSAL_LIMIT_REACHED`：达到 maxSteps / maxItems / timeout；
- `SEMANTIC_PROVIDER_FAILED`：VLM provider 失败、拒绝、schema invalid 或 timeout。

动作可能已经发生时仍遵守 OpenDesk 既有“不要盲目重放”的原则；collector 的 scroll 已发生但后续读取失败时应保留实际位置和完成范围，而不是假装原状态未改变。

## 十一、隐私、成本与模型演进

- runtime VLM 默认不成为每次 collection read 的隐式依赖；
- 优先最小 ROI，不默认上传整个桌面；
- 上传内容、保留时间、Secret 和账号数据服从任务授权；
- provider 有 timeout、输入尺寸和调用次数预算；
- 模型输出不 `eval` 成代码；
- provider 名称、模型版本、endpoint 与业务 Recipe 解耦；
- 新模型变强时替换 provider 或 authoring 方法，不要求修改稳定的 Collection/Item contract。

## 十二、与 Agent-to-Recipe 的关系

application-engineer 在需要“认识一个 collection”时负责：

```text
明确必要区域与 collection 问题
→ 复用已有 AppProfile / CollectionProfile
→ 取得最小截图和可用 native/OCR/layout evidence
→ 必要时真实多模态模型提取
→ 形成或修订 CollectionProfile proposal
→ 程序结构校验与 overlay review
→ 人工按需要纠正
→ 发布限定 profile 与未知项
```

Recipe 生成阶段消费已验证 profile；业务运行根据任务选择 `readCollection` primitive、未来 collector，或当前普通 JS 组合。Profile 漂移、多源冲突、continuity 失败或未知新页面时定向返回 application-engineer repair，不从零重做全部应用认识。

本文不增加 S13，不增加独立 `collection` Skill，也不建立新 IR / Compiler / Replay Runtime。

## 十三、实施顺序

为避免过早冻结错误 API，后续实施固定为七个 Phase；Phase 是实现批次，不是新增 S1—S12 工作流阶段：

1. **Phase 1｜Observation schema + fixtures + CollectionProfile schema**：冻结跨 AX/UIA、OCR、Layout/Image、Semantic Vision 的最低 Observation 形状、provenance、坐标空间、unknown/conflict 表达；同时冻结仅描述 current-viewport item 识别的 CollectionProfile schema，并建立 list、table、variable-height timeline、重复文本、virtualized/no-tree fixtures。
2. **Phase 2｜Current-viewport deterministic core**：实现并独立测试 `CollectionSegmenter` 与 `CollectionValidator`，完成 `Observation[] → CollectionItem[]` 与 viewport coverage；不依赖在线 VLM，不滚动、不做业务 Mapping。
3. **Phase 3｜`UI.readCollection()` Experimental**：仅在 Phase 1/2 的 Runtime/type/docs/tests 闭环成立后发布 current-viewport Experimental contract；仍不滚动、不分页、不映射业务字段。
4. **Phase 4｜SemanticVisionProvider prototype**：先验证 authoring-time 使用，再验证显式 `on-uncertain` runtime assist；provider 可由远端 HTTP、本地模型或未来实现替换，输出只作为 proposal 并重新经过 validator。
5. **Phase 5｜Scroll continuity + merge collector core**：独立实现/测试 overlap、suffix↔prefix continuity、合法重复保留、virtualization、dynamic mutation、end detection、maxSteps/maxItems/timeout partial stop；只复用同一个 current-viewport segmenter/validator。
6. **Phase 6｜`UI.collectCollection()` Experimental**：把已验证 scroll traversal 包装成有 UI 副作用的高层 orchestrator；明确 partial/evidence/stop reason，不承诺未证明的 restore-position；pagination/load-more 仍不进入 built-in strategy。
7. **Phase 7｜真实应用资格**：至少验证一个普通 list、一个 variable-height timeline、一个 no-usable-UI-tree 场景；macOS 与 Windows 分别报告实际 backend/权限/结果，未真机的平台不外推，再依据跨应用证据决定 pagination/load-more 是否值得晋级。

`Accessibility.queryAll()` 或等价“一个 scope 下返回多个普通可序列化节点”的能力可以单独评审，以填补 `find()` 强调唯一目标与 `snapshot()` 偏完整树之间的集合消费缺口；不要为了 `readCollection()` 一次创建大量长期 ElementRef。它不是 Phase 1—7 的前置承诺。

## 十四、验证矩阵

进入 Public API 前至少覆盖：

- AX/UIA 完整 list；
- AX/UIA 不完整但 OCR 正常；
- 没有 usable UI tree 的纯视觉列表；
- OCR 文本正常但 item grouping 困难；
- VLM proposal 正确并能通过 validator；
- VLM 与 native/OCR 冲突；
- 连续多个完全相同文本 item；
- item 高度不同、含时间分隔符的聊天 timeline；
- 滚动后有稳定 overlap；
- 滚动后无法证明 continuity；
- virtualized list；
- 读取过程中新增／删除／重排 item；
- 到达真实末尾；
- maxSteps、maxItems、timeout 部分停止；
- remote VLM timeout、拒绝、schema invalid；
- window move / resize / DPI 变化；
- business parser 错误与 collection reader 错误能明确区分。

## 十五、当前未实现与下一步

截至本文建立时，仓库已经有 Accessibility、OCR、布局分析、截图和 Agent 多模态认识方法；本文没有证据证明 `CollectionSegmenter`、`CollectionValidator`、`SemanticVisionProvider`、`UI.readCollection()` 或 `UI.collectCollection()` 已实现。因此这些能力保持 Target 状态，不写入 Stable API Reference，也不让 Recipe 直接调用工作名称。

下一步只进入 Phase 1，然后 Phase 2：先做离线 Observation/Profile schema、fixtures、deterministic Segmenter/Validator；不要先把万能 `UI.extractList()`、`UI.readCollection()` 或滚动 collector 暴露给用户。只有 current-viewport deterministic core 通过后，才进入 Phase 3 及后续 VLM/scroll phases。

## 十六、v0.2 一致性修订

2026-09-10：将原先分成 8 个编号步骤的实施说明收敛为与 requirements、validation-plan 和本轮批准方案一致的 Phase 1—7。没有改变功能边界：CollectionProfile schema 与 fixtures 合入 Phase 1，current-viewport Segmenter/Validator 合入 Phase 2；`readCollection`、SemanticVisionProvider、scroll core、`collectCollection` 和真实应用资格依次为 Phase 3—7。该修订不代表任何 Phase 已实施。