# WECHAT_EXECUTION_MASTER_PROMPT

## 1. 用途

本文件是当前微信桌面 GUI agent 的**执行总纲 / 专家讨论底稿 / 提示词母本**。

它不替代：

- `docs/WECHAT_COMPLETE_SOLUTION_FRAMEWORK.md`：完整系统框架
- `docs/wechat_desktop_requirements.md`：桌面应用需求与验收
- `docs/wechat_baseline_compare_spec.md`：baseline/runtime compare 规范

它负责把下面几件事统一到一个地方：

1. 当前阶段的**唯一正确主线**
2. 黄金样本优先的**执行约束**
3. 多专家讨论后的**统一结论**
4. baseline / runtime / compare / action 的**分层方案**
5. stop / retry / escalate 的**动作门禁**
6. 每轮输出与失败输出的**固定格式**

---

## 2. 当前阶段唯一正确主线

当前第一优先级**不是**恢复真实 GUI 长链动作，**而是先把黄金样本体系梳理完整并稳定化**。

固定主线：

```text
golden sample audit
-> expert discussion / attack-defense / blindspot audit
-> baseline extraction
-> runtime snapshot normalization
-> compare
-> single-step validation
-> 2-step / 3-step composition
-> send evaluated last and separately
```

禁止回退到：

- 整体闭环盲试错
- 在真实 GUI 里一边点击一边补识别逻辑
- 把 send 当成“顺手一起放开”的一步
- 让 compare / OCR / template match 混成一个黑盒判断

---

## 3. 顶层不可违背原则

### 3.1 黄金样本优先

黄金样本不是附属产物，而是整个系统起点。

至少必须包含：

1. 黄金截图 / 参考图
2. 黄金 layout / semantic HTML
3. 黄金 zones
4. 黄金 action targets
5. 黄金 capture refs
6. 黄金 baseline JSON
7. 黄金 compare 规则

### 3.2 结构先于语义，语义先于动作

顺序必须是：

1. 先识别结构骨架
2. 再识别局部语义
3. 再确认动作目标
4. 再做真实动作

### 3.3 固定优先于动态

凡是能先固化成 contract / baseline / capture ref 的区域，优先固化，不要每次从整屏重新理解。

### 3.4 成功率优先于效率

当前阶段优先：

- 正确
- 可解释
- 可审计
- 可回放
- 可 fail-fast

不是优先：

- 快
- 少截图
- 少 OCR
- 少 JSON

### 3.5 send 默认冻结

`send_message` 默认冻结，除非满足独立 send gate；不能因为 `open_chat`、`focus_input`、`read_reply` 逐步放开，就自动推导发送也可以放开。

---

## 4. 黄金样本统一定义

### 4.1 黄金样本状态

黄金样本必须显式区分：

- `candidate`
  - 已具备核心资产
  - 可用于算法验证
  - 不能直接视为最终 action baseline
- `frozen`
  - 字段齐全
  - provenance 完整
  - variance budget 完整
  - compare / gate / failure taxonomy 完整
  - 经人工批准后可升级为正式 baseline

### 4.2 baseline 分层

当前必须显式区分三类 baseline：

#### A. `dev_reference`

来源：

- WeChatWeb / HTML mirror / demo / proxy sample / 可控网页参考样本

用途：

- 算法开发
- extractor 开发
- compare 主链开发
- schema 验证

限制：

- **只能用于 `algorithm_validation`**
- 不能直接裁决真实桌面动作

#### B. `desktop_reference`

来源：

- 真实桌面微信截图 / 真实桌面识别结果 / 真实窗口截图稳定样本

用途：

- 真实桌面结构基线
- action gate 前的桌面参照

限制：

- 可用于 `action_gate`
- 仍不等于允许 send

#### C. `desktop_action`

来源：

- 与当前动作同窗口、同尺寸、同 session、同 geometry 条件下的运行时桌面基线

用途：

- 真正进入动作阶段前的强约束基线
- 当前窗口动作放行的近场对照

限制：

- 必须绑定 `sameWindow + freshness + geometryHash + maxAgeMs`
- 只能对当前窗口/当前 session 生效

### 4.3 黄金样本来源分层

#### 第一层：HTML / Web 参考源

适合产出：

- layout.html
- semantic.html
- layout skeleton
- zone semantics 原型
- action target 原型

但它不是动作真相源。

#### 第二层：桌面截图参考源

适合产出：

- 真实区域比例
- 真实颜色 / 色块
- 真实图标 / 按钮 / 条带
- 真实窗口几何
- capture refs / template refs

#### 第三层：运行时 fresh snapshot

适合产出：

- 当前动作前的最新状态
- 当前窗口 sameWindow/freshness
- 当前 target 是否仍可执行

---

## 5. 当前推荐的黄金样本目录标准

推荐目录：

```text
artifacts/golden-samples/wechat/<sample-id>/
  manifest.json
  source/
    provenance.json
  capture/
    source.png
  detect/
    regions.json
    layout_model.json
  infer/
    app_classification.json
    zones.json
    action_targets.json
    ocr_map.json
    semantic_model.json
    chat_candidates.json                # 可选但推荐
  mirror/
    layout.html
    semantic.html
    dom_validation_report.json
  baseline/
    golden_layout_baseline.json
    golden_semantic_baseline.json
  verify/
    actionability_report.json
    send_safety_report.json             # desktop/action 样本强烈建议
  compare/
    structural_report.json
    semantic_report.json
    summary_report.json
  replay/
    replay_case.json
    replay_result.json
    recovery_result.json
  failure/
    failure_taxonomy.json
  evidence/
    index.json
    audit.from_run.ndjson
    decision.from_run.json
```

### 5.1 视为“不完整候选”的典型缺口

若出现以下任一项，应判为**候选未冻结**：

- `manifest.json` 中关键状态字段为空
- baseline 中 `captureRefs / guards / compareHints / criticalZones / topology` 为空
- runtime / capture contract 中 `sameWindow / freshness / geometryHash / maxAgeMs` 为空
- compare 只有 summary，没有 hard gate 证据
- send safety 只有文案结论，没有结构化 gate 字段

### 5.2 Frozen Promotion Checklist

只有同时满足以下条件，才允许把 candidate promote 为 frozen：

1. `manifest.status=candidate` 已被显式升级为 `frozen`
2. `phaseGate.phase1=pass`
3. `phaseGate.phase2=pass`
4. `whyBlocked=[]`
5. `baseline/golden_layout_baseline.json` 与 `baseline/golden_semantic_baseline.json` 的关键字段非空
6. `verify/actionability_report.json` 存在且结构化可审计
7. `verify/send_safety_report.json` 存在；若当前阶段不允许 send，也必须明确写出 `sendAllowed=false`
8. `compare/summary_report.json` 存在，且能解释 `algorithm_validation` 或 `action_gate`
9. `replay/replay_case.json` 与 `failure/failure_taxonomy.json` 存在
10. `captureRefs`、`geometryHash`、`sameWindow`、`maxAgeMs` 已形成可审查 contract
11. 完成一轮人工审查，显式记录 reviewer、promotionDecision、reviewedAt

若上述任一项不满足，只能继续保留为 `candidate`，不得宣传为 frozen desktop golden。

### 5.3 Frozen Desktop Golden 标准目录

一旦 promote 为 frozen，推荐目录必须固定为：

```text
artifacts/golden-samples/wechat/<sample-id>-frozen/
  manifest.json
  source/
    provenance.json
  capture/
    source.png
  detect/
    regions.json
    layout_model.json
  infer/
    app_classification.json
    zones.json
    action_targets.json
    chat_candidates.json
    ocr_map.json
    semantic_model.json
  baseline/
    golden_layout_baseline.json
    golden_semantic_baseline.json
  verify/
    actionability_report.json
    send_safety_report.json
    capture_contract.json
  compare/
    structural_report.json
    semantic_report.json
    summary_report.json
  replay/
    replay_case.json
    replay_result.json
    recovery_result.json
  failure/
    failure_taxonomy.json
  evidence/
    index.json
    human_review_summary.json
```

run-scoped 的 `artifacts/runs/.../desktop-baseline/` 不能直接视为 frozen；只有 promote 到上述独立目录后，才算正式 frozen desktop golden。

---

## 6. 什么信息来自哪里

### 6.1 来自 HTML / mirror 的信息

只适合承载：

- 布局层次
- panel topology
- zone hierarchy
- review / 人工核查入口
- compare 可视化入口

**不适合**直接承载：

- 真实桌面动作放行
- 当前窗口 freshness
- 当前按钮是否真可点

### 6.2 来自截图 / crop / template ref 的信息

适合承载：

- 背景色 / 色块
- 图标位置
- 小区域视觉锚点
- 图搜图 / template match reference
- search window / local crop evidence
- 真实窗口大小与相对位置

### 6.3 来自 infer JSON 的信息

适合承载：

- zones
- action targets
- chat candidates
- OCR map
- pageType / appClass
- selected / focused / disabled / blocking 状态
- target preconditions / postconditions / fallbacks

### 6.4 来自 runtime-only 的信息

必须由运行时 fresh 生成：

- `sameWindow`
- `geometryHash`
- `windowRect`
- `screenRect`
- `maxAgeMs`
- `capturedAt`
- `foregroundApp`
- `blockingOverlay`
- `tccReady`
- `inputMethodState`

---

## 7. 推荐 baseline schema（vNext）

### 7.1 `golden_layout_baseline.json`

最少字段：

```json
{
  "schemaVersion": "0.2.0",
  "baselineId": "",
  "sampleId": "",
  "baselineTier": "dev_reference | desktop_reference | desktop_action",
  "sourceKind": "web_reference | desktop_reference | desktop_action",
  "status": "candidate | frozen",
  "screen": { "width": 0, "height": 0 },
  "window": {
    "width": 0,
    "height": 0,
    "titleHint": "",
    "geometryHash": "",
    "scaleFactor": 2
  },
  "zones": [
    {
      "id": "conversation_list",
      "role": "chat_list",
      "bbox": { "x": 0, "y": 0, "width": 0, "height": 0 },
      "bboxRatio": { "x": 0, "y": 0, "width": 0, "height": 0 },
      "backgroundColor": "#ffffff",
      "stability": "fixed | semi_fixed | dynamic",
      "dynamicAxes": ["height"],
      "requiredForAction": ["open_chat"],
      "evidence": ["major vertical split"]
    }
  ],
  "criticalZones": ["conversation_list", "chat_header", "message_list", "input_area", "send_action_zone"],
  "topology": {
    "columns": ["left_nav", "conversation_list", "main_panel"],
    "mainPanelRows": ["chat_header", "message_list", "input_area"]
  },
  "captureRefs": [
    {
      "id": "search_capture",
      "zoneId": "search_area",
      "precision": "high",
      "bboxRatio": { "x": 0, "y": 0, "width": 0, "height": 0 },
      "referenceImagePath": "",
      "searchWindowRatio": { "x": 0, "y": 0, "width": 0, "height": 0 },
      "visualFingerprint": {
        "avgColor": "#f5f5f5",
        "iconHints": ["search-icon"]
      }
    }
  ],
  "compareHints": {
    "decorativeZones": ["avatar_strip"],
    "actionCriticalZones": ["search_area", "chat_header", "input_area"]
  }
}
```

### 7.2 `golden_semantic_baseline.json`

最少字段：

```json
{
  "schemaVersion": "0.2.0",
  "baselineId": "",
  "sampleId": "",
  "baselineTier": "desktop_reference",
  "sourceKind": "desktop_reference",
  "status": "candidate | frozen",
  "pageType": "chat_page",
  "appClass": "wechat_desktop",
  "stateFlags": {
    "selectedConversationVisible": true,
    "headerVisible": true,
    "inputVisible": true,
    "sendVisible": true,
    "blockingOverlay": false
  },
  "actionTargets": [
    {
      "id": "target_open_chat_primary",
      "intent": "open_chat",
      "zoneId": "conversation_list",
      "targetType": "row_candidate_set",
      "bboxRatio": { "x": 0, "y": 0, "width": 0, "height": 0 },
      "pointRatio": { "x": 0, "y": 0 },
      "selectorLogic": {
        "kind": "hybrid",
        "signals": ["zone", "row-cluster", "local-ocr", "template-match"]
      },
      "fallbacks": [
        { "kind": "search-flow" },
        { "kind": "template-relocate" }
      ],
      "preconditions": ["conversation_list present", "target unique"],
      "postconditions": ["chat_header switched", "message_list refreshed"],
      "riskLevel": "medium"
    }
  ],
  "guards": {
    "headerMustMatchBeforeInput": true,
    "focusMustBeVerifiedBeforeDraft": true,
    "sendDisabledByDefault": true,
    "sendNeedsDedicatedGate": true
  },
  "captureRefs": ["search_capture", "conversation_capture", "header_capture", "input_capture", "send_capture"],
  "compareHints": {
    "textPolicies": {
      "chat_header": "fuzzy-normalized",
      "reply_readback": "zone-local-only"
    }
  }
}
```

### 7.3 不允许继续为空的关键字段

以下字段若为空，必须视为未冻结：

- `baselineTier`
- `sourceKind`
- `status`
- `criticalZones`
- `captureRefs`
- `guards`
- `topology`
- `compareHints`
- `pageType`
- `appClass`
- `stateFlags`

### 7.4 Frozen Desktop Golden 最小非空字段表

#### `manifest.json`

必须非空：

- `sampleId`
- `status=frozen`
- `sourceKind`
- `baselineTier`
- `phaseGate.phase1`
- `phaseGate.phase2`
- `reviewer`
- `promotionDecision`
- `reviewedAt`

#### `golden_layout_baseline.json`

必须非空：

- `schemaVersion`
- `baselineId`
- `baselineTier`
- `sourceKind`
- `status`
- `screen`
- `window.geometryHash`
- `zones`
- `criticalZones`
- `topology`
- `captureRefs`
- `compareHints`

#### `golden_semantic_baseline.json`

必须非空：

- `schemaVersion`
- `baselineId`
- `baselineTier`
- `sourceKind`
- `status`
- `pageType`
- `appClass`
- `stateFlags`
- `actionTargets`
- `guards`
- `captureRefs`

#### `verify/capture_contract.json`

必须非空：

- `runId`
- `schemaVersion`
- `capturedAt`
- `sameWindow`
- `geometryHash`
- `maxAgeMs`
- `captures`

#### `compare/summary_report.json`

必须非空：

- `comparePurpose`
- `decisionKind`
- `status`
- `allowedActionStage`
- `gateStatus`
- `scoreBreakdown`
- `hardGates`
- `blockingReasons`
- `repairHints`

---

## 8. 推荐 runtime snapshot schema（vNext）

### 8.1 `runtime_layout_snapshot.json`

必须至少包含：

- `runId`
- `snapshotTier=desktop_runtime`
- `capturedAt`
- `screen`
- `window`
- `sameWindow`
- `geometryHash`
- `maxAgeMs`
- `zones`
- `captureRefs`
- `runtimeGuards`

### 8.2 `runtime_semantic_snapshot.json`

必须至少包含：

- `runId`
- `snapshotTier=desktop_runtime`
- `capturedAt`
- `pageType`
- `appClass`
- `stateFlags`
- `actionTargets`
- `criticalGuards`
- `runtimeGuards`
- `targetIdentity`
- `selectedConversation`
- `blockingOverlay`

### 8.3 运行时必须新鲜的字段

以下字段必须**fresh screenshot 同轮生成**，不能从旧 JSON 借用：

- `sameWindow`
- `capturedAt`
- `geometryHash`
- `windowRect`
- `blockingOverlay`
- `headerIdentityProbe`
- `inputFocusProbe`

---

## 9. 固定区域 vs 动态区域

### 9.1 固定优先区域（优先存成 contract）

这些区域应优先固化为 JSON / capture contract / template refs：

1. `search_area`
2. `conversation_list`
3. `chat_header`
4. `input_area`
5. `send_action_zone`

### 9.2 半固定区域（相对坐标 + 局部校正）

这些区域应保存为**相对坐标 + 局部校正策略**：

1. conversation row 候选区
2. header 中标题文字带
3. input area 中文本热区
4. send button 邻域

### 9.3 动态区域（只能运行时判断）

这些区域不能冻结成真相：

1. 搜索结果行内容
2. 最新消息气泡位置
3. 候选输入法遮挡区
4. 弹窗/系统通知遮挡区
5. selected row / focus ring / disabled state

### 9.4 相对坐标与窗口变量化

必须把以下量写成变量：

- `windowWidth`
- `windowHeight`
- `scaleFactor`
- `mainPanelX`
- `mainPanelWidth`
- `conversationListWidthRatio`
- `headerHeightRatio`
- `inputHeightRatio`

若窗口拖拽只改变某些区域，则必须在 baseline 里显式记录：

- 哪些轴稳定：`fixed_x / fixed_y / fixed_width / fixed_height`
- 哪些轴随窗口变化：`dynamic_width / dynamic_height`
- 哪些区域仅允许按比例迁移，不允许整屏重搜

---

## 10. 允许采用的方法，以及它们分别用于哪个阶段

### 10.1 颜色 / 色块识别

用于：

- layout baseline
- zone 边界粗识别
- search/header/input/send 背景稳定性校验

不用于：

- 单独决定目标联系人

### 10.2 图标识别

用于：

- 搜索框图标
- 工具栏图标
- 发送按钮图标 / 邻域
- 输入区表情/加号/附件等工具带定位

不用于：

- 单独决定语义正确性

### 10.3 图搜图 / template match

用于：

- 固定 capture ref 重新定位
- 搜索框 / header / input / send 区域小范围重定位
- conversation row 候选模板重定位

必须要求：

- 有 `referenceImagePath`
- 有 `searchWindow`
- 有 `minScore`
- 有 `softMinScore`
- 有 `escape check`

### 10.4 相对位置识别

用于：

- zone 基于窗口比例迁移
- row 候选从参考 conversation_list 映射到当前窗口
- header/input/send 的相对定位

### 10.5 小区域截图

用于：

- template match
- 局部 OCR
- focused / selected / disabled 局部验证

### 10.6 局部 OCR

用于：

- 搜索结果候选区
- chat header
- input draft
- message list latest reply

禁止：

- 用 whole-window OCR 决定 `open_chat` 或 `read_reply`

### 10.7 baseline JSON compare

用于：

- baseline 与 runtime 的结构/语义差异暴露
- 动作前 gate
- 修复建议入口

### 10.8 证据强弱矩阵

必须明确区分证据强弱，不允许把弱证据包装成主裁决：

#### 强证据

- `sameWindow`
- `geometryHash`
- `capturedAt/maxAgeMs`
- required zone presence
- post-click header verification
- input focus verification

用途：

- Hard Gate
- stop / fail-close

#### 中证据

- capture refs completeness
- template match within search window
- escape check pass
- bboxRatio / topology consistency

用途：

- action_gate 子评分
- 重定位可信度判断

#### 弱证据

- local OCR probe
- icon hints
- color family proximity
- row clustering score

用途：

- 候选排序
- 局部 probe
- repair hint

限制：

- 不得单独决定 `open_chat` 成功
- 不得单独决定 `send_message` 放开

#### 装饰性证据

- avatar 是否完整
- 远程资源是否完全加载
- 非关键装饰图案

用途：

- 只用于 review / provenance / variance budget

限制：

- 不得进入动作 hard gate

---

## 11. compare 层级拆分

compare 必须至少拆成五层：

### L1. Structure compare

比较：

- required zones completeness
- bbox ratio delta
- zone role consistency
- background / color family proximity
- panel topology

### L2. Semantic compare

比较：

- action target completeness
- target-zone binding correctness
- pageType / appClass
- stateFlags
- required guards presence

### L3. Capture compare

比较：

- capture refs completeness
- capture bbox ratio delta
- capture precision level
- template search window 可迁移性

### L4. Guard compare

比较：

- sameWindow
- geometryHash
- maxAgeMs
- blockingOverlay
- header identity probe
- focus probe

### L5. Live probe compare

比较：

- open_chat 后 header 是否切换
- focus_input 后 draft 是否落在 input_area
- read_reply 是否只来自 message_list local OCR

### 11.1 `algorithm_validation` 与 `action_gate` 的严格边界

#### `algorithm_validation`

只解决：

- extractor 是否稳定
- schema 是否稳定
- compare 是否能解释差异
- web/dev 参考样本与 runtime 的结构差异是否被正确发现

不能解决：

- 当前桌面动作是否允许执行
- 当前目标会话是否可安全点击
- 当前 send 是否可放开

#### `action_gate`

只在以下前提下有效：

- baseline 为 `desktop_reference` 或 `desktop_action`
- runtime 为 `desktop_runtime`
- `sourceKindMismatch=false`
- `sameWindow=true`（对于动作放行）
- `geometryHash` 在允许范围内
- `maxAgeMs` 未超限

只有 `action_gate` 才能决定动作放行。

### 11.2 Hard Gate 与 pass/warn/fail 的关系

#### Hard Gate

只要任一 Hard Gate 失败，最终必须 `fail`：

- HG0: runtime preflight fail
- HG1: pageType/appClass 不明或 blocking page
- HG2: required zone 缺失
- HG3: required intent 缺失
- HG4: capture refs 缺失
- HG5: header/focus/send critical guards 缺失
- HG6: sameWindow / geometryHash / freshness 失败
- HG7: send safety 未通过却尝试 send

#### `pass`

必须同时满足：

- 所有 Hard Gate 通过
- structure >= pass threshold
- semantic >= pass threshold
- capture >= pass threshold
- guard >= pass threshold

#### `warn`

只能在以下情况下成立：

- 所有 Hard Gate 通过
- 但某些 soft score 未达到 pass
- 仅允许 probe / 单步验证
- 不允许 send

#### `fail`

任一成立即 fail：

- Hard Gate 失败
- required zone / intent 缺失
- source kind mismatch 且被错误地当作 action gate
- compare 证据不足却宣称 allowActions=true

### 11.3 当前推荐阈值

#### structure

- `>= 0.85`：pass
- `>= 0.70`：warn
- `< 0.70`：fail

#### semantic

- `>= 0.80`：pass
- `>= 0.65`：warn
- `< 0.65`：fail

#### capture

- required high-precision capture 全部存在且无 escape：pass
- 缺 1 个关键 capture：warn/fail 取决于 intent
- search/header/input/send 任一缺失：fail

#### guard

- `sameWindow=true` + `geometryHash ok` + `maxAgeMs ok`：pass
- 任何一项失败：fail

---

## 12. 推荐 stop / retry / escalate 规则

### 12.1 必须 stop

以下失败必须立即 stop：

1. 前台窗口不是微信
2. `sameWindow=false`
3. 截图尺寸 / 几何异常
4. `geometryHash` 漂移超预算
5. template match escape search window
6. blocking page / blocking overlay
7. header 未切换却认为 open_chat 成功
8. focus 未验证却继续输入
9. send safety 未通过却准备 send

### 12.2 可以 retry

仅以下低风险步骤允许有限 retry：

1. `locate_search_area`
2. `locate_conversation_list`
3. `capture ref relocate`
4. 局部 OCR probe
5. `open_chat` 的**目标重选前**局部扫描

限制：

- 必须 fresh screenshot
- 必须落盘 before/after evidence
- 重试次数必须有限
- 不得自动升级成 send

### 12.3 必须 escalate

以下情况必须升级人工审查：

1. 同名联系人无法唯一消歧
2. pageType / appClass 与人工判断长期冲突
3. send path 不唯一（按钮 / Enter / shortcut 分歧）
4. prompt injection / 欺骗性界面文案
5. 新 UI 版本导致大面积 zone drift
6. compare 与实际点击结果持续冲突

---

## 13. 多专家讨论后的统一结论（20 专家 / 40 回合收敛版）

以下结论是当前执行 agent 必须遵守的统一结论：

### 13.1 黄金样本必须以 JSON contract 为中心

结论：

- HTML 保留，但只是 review artifact
- 真正的主 contract 是 baseline JSON + runtime snapshot JSON + compare report + capture contract

评分：`96/100`

反方攻击：

- 如果 JSON 只是字段堆砌、没有 hard gate，仍然不能指导动作

自我否决：

- 所以必须补 `criticalZones / captureRefs / guards / geometryHash / maxAgeMs`

### 13.2 compare 必须双轨，不允许混用

结论：

- `algorithm_validation` 用于开发和结构验证
- `action_gate` 用于真实动作放行
- source mismatch 时只能走 `algorithm_validation`

评分：`97/100`

反方攻击：

- 若只看总分，不看 purpose，后面仍会混用

自我否决：

- 所以 `comparePurpose` 必须进入 summary_report 一级字段

### 13.3 图找图 / 图标锚点必须正式入方案

结论：

- 搜索框、header、input、send、row candidate 都应允许通过小区域 template match 重定位
- 图标、色块、相对位置是 OCR 之外的第一层锚点

评分：`94/100`

反方攻击：

- 模板容易 stale，图标也可能换主题

自我否决：

- 所以模板不能单独裁决，必须和 zone / color / relative position 联合

### 13.4 相对坐标必须变量化

结论：

- 真实桌面不能只靠绝对像素
- 必须保存 `bboxRatio + window variables + geometryHash`

评分：`95/100`

反方攻击：

- 单靠比例会在窗口结构变化时失真

自我否决：

- 所以必须加 `sameWindow + layout topology + capture refs`

### 13.5 open_chat 的最稳妥方案

结论：

1. 先 fresh screenshot
2. 先验证 `search_area` / `conversation_list`
3. 必要时使用 search flow
4. 在 conversation_list 局部 OCR + 行聚类选候选
5. 若有 capture ref / row template，则先 template relocate
6. 点击后必须 `verify_chat_header`
7. header 不匹配立即 stop

评分：`96/100`

### 13.6 send_message 的唯一放开条件

结论：

**只有同时满足以下条件，send 才能考虑放开：**

1. `action_gate=pass`
2. `sameWindow=true`
3. `geometryHash` 未漂移
4. target chat 唯一且点击后 header 已验证
5. input focus 已验证
6. draft 已在 input_area 局部验证
7. send path 唯一且已知（按钮或 Enter，不允许歧义）
8. send safety report = pass
9. 已准备 post-send readback gate
10. 经独立人工 gate 或明确授权

评分：`99/100`

---

## 13.7 外部官方资料对当前方案的约束

本轮方案需持续对齐以下一手资料。它们不是直接实现指南，而是约束我们不要走偏：

1. Apple Vision `VNRecognizeTextRequest`
   - 结论：OCR 应按任务做局部、分区、可配置识别，不应退回 whole-window 主裁决。
   - 链接：<https://developer.apple.com/documentation/vision/vnrecognizetextrequest>
2. Apple ScreenCaptureKit
   - 结论：截图应以窗口/显示捕获能力为前置层，这支持 `sameWindow + geometryHash + fresh screenshot` 进入 hard gate。
   - 链接：<https://developer.apple.com/documentation/screencapturekit>
3. Apple Accessibility / AXUIElement / NSAccessibility
   - 结论：桌面动作能力与可交互性检查应被视为独立证据源，但当前不能假设一定可用。
   - 链接：<https://developer.apple.com/documentation/applicationservices/axuielement>
   - 链接：<https://developer.apple.com/documentation/appkit/nsaccessibilityprotocol>
4. OpenCV Template Matching
   - 结论：template match 应在局部 search window 内执行，并强制 threshold 与 escape check。
   - 链接：<https://docs.opencv.org/4.x/d4/dc6/tutorial_py_template_matching.html>
5. Tesseract ImproveQuality
   - 结论：OCR 对裁剪质量、对比度、噪声与分辨率高度敏感，因此只能作为局部辅助证据。
   - 链接：<https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html>

这些资料共同支持当前主线：

- 先固定区域
- 再局部图找图 / 局部 OCR
- 再 compare hard gate
- 最后才做小步动作

---

## 14. 推荐动作恢复梯度

不允许跳级。

### Stage 0：只做离线 / 算法验证

允许：

- baseline extractor
- runtime snapshot extractor
- compare
- capture contract
- template ref 制作

### Stage 1：只放开定位

允许：

1. `locate_search_area`
2. `locate_conversation_list`

### Stage 2：只放开打开会话

允许：

3. `open_chat`
4. `open_chat + verify_chat_header`

### Stage 3：只放开输入聚焦

允许：

5. `open_chat + verify_chat_header + focus_input`

### Stage 4：只放开读取

允许：

6. `read_reply`

### Stage 5：send 继续冻结

- `send_message` 默认不进入自动放开链
- 只能独立评估

---

## 15. 推荐解决方案分级（先成功，再优化）

### Level A：高成功率保守方案

特点：

- 固定区域 + capture contract
- 小区域截图
- template match
- 局部 OCR
- 强 fail-fast
- 高频落盘

适合当前阶段。

### Level B：平衡方案

特点：

- 继续保留 Level A 的强约束
- 减少 OCR 次数
- 增加局部缓存
- 用几何变量代替部分整图重算

### Level C：高效率方案

只有在 Level A/B 已稳定后，才允许进入：

- 更多复用缓存
- 更少截图
- 更少 compare
- 更多快速路径

当前阶段默认**不优先做 Level C**。

---

## 16. 执行 agent 的固定工作顺序

每轮必须按顺序做：

1. 核查黄金样本资产
2. 判断哪些是 baseline、哪些只是 candidate
3. 核查 baseline / runtime schema 缺口
4. 做 compare 并区分 purpose
5. 只在 compare 通过后做单步验证
6. 单步稳定后再做两步/三步组合
7. send 单独冻结评估

---

## 17. 每轮输出必须包含这 11 项

1. 当前主目标
2. 当前正在完善的核心逻辑
3. 当前使用/修改了哪些关键文件
4. 当前新增或修复了什么关键能力
5. 当前黄金样本阶段状态
6. 当前真实软件截图验证阶段状态
7. 当前是否允许进入动作阶段
8. 如果不允许，阻塞原因是什么
9. 当前最大的风险是什么
10. 下一步最应该继续补的一个环节
11. 当前推荐继续使用的唯一主命令

---

## 18. 失败时必须输出这 5 项

1. 当前失败阶段
2. 根因
3. 分类：`structure / recognition / validation / action / runtime`
4. 下一步修什么
5. `stop / retry / escalate`

---

## 19. 可直接复用给执行 agent 的主提示词

你现在负责微信桌面应用 GUI agent 的执行与迭代。

你的核心目标不是直接闭环发送，而是先建立稳定的：

`golden sample -> baseline -> runtime snapshot -> compare -> 单步验证 -> 渐进动作`

执行要求：

1. 必须优先核查黄金样本，而不是先恢复真实 GUI 动作
2. 必须先区分 `dev_reference / desktop_reference / desktop_action`
3. 必须先区分 `algorithm_validation / action_gate`
4. 必须先识别结构，再识别语义，再执行动作
5. 搜索框、会话列表、header、input、send 优先固定为 capture contract / baseline
6. 执行阶段优先在固定区域内做：局部截图、template match、图标识别、色块识别、局部 OCR
7. 不要每轮都从整屏重新理解整个界面
8. 任何真实 GUI 步骤都必须 `fresh screenshot + sameWindow + fail-fast`
9. 一旦发现窗口变化、geometry 异常、template escape、header 不匹配、focus 不明确，立即停止
10. `send_message` 默认冻结，只有满足独立 send gate 才能单独评估

你的工作顺序：

1. 审核黄金样本是否齐全
2. 若 baseline 字段缺失，优先补 baseline schema 与 extractor
3. 若 runtime snapshot 字段缺失，优先补 runtime schema
4. 若 compare purpose 或 hard gate 不清，优先补 compare 规则
5. compare 通过后，只恢复：
   - `locate_search_area`
   - `locate_conversation_list`
   - `open_chat`
   - `open_chat + verify_chat_header`
   - `open_chat + verify_chat_header + focus_input`
   - `read_reply`
6. 不要直接放开 send

---

## 20. 本文件与其他文档的分工

### `docs/WECHAT_COMPLETE_SOLUTION_FRAMEWORK.md`

保存：

- 完整系统框架
- 历史经验
- 主链全景

### `docs/wechat_desktop_requirements.md`

保存：

- 需求范围
- 验收标准
- 非目标

### `docs/wechat_baseline_compare_spec.md`

保存：

- compare schema
- compare threshold
- compare output
- algorithm_validation / action_gate 的正式规范

### `docs/WECHAT_EXECUTION_MASTER_PROMPT.md`

保存：

- 执行提示词
- 顶层约束
- 专家讨论统一结论
- 当前阶段最应该做什么

---

## 21. 一句话总结

当前最合理的执行方式不是继续在真实微信里零散试错，而是：

**先把黄金样本、baseline schema、runtime snapshot、compare gate、capture contract 和动作恢复梯度完全定清楚，再在固定区域内用图标/图搜图/颜色/相对坐标/局部 OCR 做小步验证，最后才单独评估 send。**
