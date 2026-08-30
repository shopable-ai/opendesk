# wechat_baseline_compare_spec

## 1. 目标

本规范定义黄金基准和运行时识别结果之间的 compare 主链，用于在真实动作之前给出明确的 `pass / warn / fail` 判断。

compare 不是像素 diff 的替代品，而是动作前的数据级 gate。

但 compare 必须分成两种用途，不能混用：

1. `algorithm_validation`
   - 用于开发样本 / 环境样本
   - 目标是验证算法、结构提取、contract 稳定性
   - 不能直接裁决真实动作是否允许

2. `action_gate`
   - 用于真实桌面 baseline vs 真实桌面 runtime
   - 目标是裁决是否允许进入动作阶段

---

## 2. 输入

### 2.1 baseline

- `golden_layout_baseline.json`
- `golden_semantic_baseline.json`

baseline 必须声明：

- `baselineId`
- `baselineTier`
- `sourceKind`
- `screen`
- `schemaVersion`

### 2.2 runtime

- `runtime_layout_snapshot.json`
- `runtime_semantic_snapshot.json`

runtime 必须声明：

- `runId`
- `snapshotTier`
- `snapshotType`
- `screen`
- `schemaVersion`
- `canProceed`

### 2.2.1 `capture_contract.json`

若 compare 用于真实桌面动作链，必须同时输入 `verify/capture_contract.json`。

最少字段：

- `runId`
- `schemaVersion`
- `capturedAt`
- `sameWindow`
- `geometryHash`
- `maxAgeMs`
- `captures`

推荐最小模板：

```json
{
  "schemaVersion": "0.2.0",
  "runId": "",
  "capturedAt": "",
  "sameWindow": true,
  "geometryHash": "",
  "maxAgeMs": 1500,
  "window": {
    "x": 0,
    "y": 0,
    "width": 0,
    "height": 0,
    "scaleFactor": 2
  },
  "captures": [
    {
      "id": "search_capture",
      "zoneId": "search_area",
      "precision": "high",
      "bbox": { "x": 0, "y": 0, "width": 0, "height": 0 },
      "bboxRatio": { "x": 0, "y": 0, "width": 0, "height": 0 },
      "referenceImagePath": "",
      "searchWindow": { "x": 0, "y": 0, "width": 0, "height": 0 },
      "templateMatch": {
        "minScore": 0.72,
        "softMinScore": 0.68,
        "escapeCheck": true
      },
      "visualFingerprint": {
        "avgColor": "#f5f5f5",
        "iconHints": ["search-icon"]
      }
    }
  ]
}
```

### 2.3 字段来源约束

| 字段 | 主来源 | 备注 |
|---|---|---|
| zone bbox / bboxRatio | baseline/runtime JSON | compare 主事实 |
| action target / target-zone binding | baseline/runtime JSON | compare 主事实 |
| capture refs / template refs | capture contract | compare 辅助证据 |
| OCR probes | local zone OCR | 只能是局部证据 |
| HTML mirror | review artifact | 不作动作主裁决 |

### 2.4 证据强弱分层

compare 报告必须显式区分四类证据：

1. `strong`
   - `sameWindow`
   - `geometryHash`
   - required zones / intents
   - header identity verification
   - input focus verification
2. `medium`
   - capture refs completeness
   - template match within search window
   - bboxRatio / topology consistency
3. `weak`
   - local OCR probe
   - icon hint
   - color family proximity
   - row clustering score
4. `decorative`
   - avatar completeness
   - remote asset completeness
   - non-critical ornament

规则：

- `strong` 可进入 hard gate
- `medium` 可进入 action_gate 子评分
- `weak` 只能进入候选排序 / repair hint
- `decorative` 不得参与动作放行裁决

---

## 3. 输出

- `compare/structural_report.json`
- `compare/semantic_report.json`
- `compare/summary_report.json`

`summary_report.json` 必须额外声明：

- `comparePurpose`
- `decisionKind`
- `gateStatus`
- `blockingReasons`
- `sourceKindMismatch`
- `scoreBreakdown`
- `repairHints`

### 3.1 推荐 summary_report 最小模板

```json
{
  "schemaVersion": "0.2.0",
  "baselineDir": "",
  "runtimeDir": "",
  "summary": {
    "comparePurpose": "algorithm_validation | action_gate",
    "decisionKind": "algorithm_pass | algorithm_warn | algorithm_fail | pass | warn | fail",
    "status": "pass | warn | fail",
    "allowActions": false,
    "allowProbes": false,
    "allowedActionStage": "none | open_chat | verify_chat_header | focus_input | read_reply",
    "sourceKindMismatch": false,
    "gateStatus": {
      "goldenPassed": false,
      "realScreenshotValidationPassed": false,
      "actionStageAllowed": false,
      "sendAllowed": false
    },
    "scoreBreakdown": {
      "structural": 0,
      "semantic": 0,
      "capture": 0,
      "guard": 0
    },
    "hardGates": [
      {
        "id": "HG6_same_window_and_freshness",
        "status": "pass | fail",
        "evidenceStrength": "strong",
        "reason": ""
      }
    ],
    "blockingReasons": [],
    "repairHints": [
      {
        "problem": "capture ref missing",
        "repairLayer": "capture_contract",
        "nextAction": "rebuild capture refs"
      }
    ]
  }
}
```

### 3.2 structural_report / semantic_report 最小要求

#### `structural_report.json`

至少应包含：

- `status`
- `weightedScore`
- `missingRequiredZones`
- `zoneResults[]`
  - `zoneId`
  - `status`
  - `score`
  - `bboxDiff`
  - `backgroundScore`

#### `semantic_report.json`

至少应包含：

- `status`
- `weightedScore`
- `missingRequiredIntents`
- `missingCriticalGuards`
- `captureReport`
- `targetResults[]`
  - `targetId`
  - `intent`
  - `status`
  - `score`
  - `baselineZoneId`
  - `runtimeZoneId`

---

## 4. structural compare

比较项：

1. required zone completeness
2. zone bbox ratio delta
3. zone background color equality / proximity
4. role consistency
5. critical zone coverage
6. fixed-region plausibility
7. window geometry consistency

### 4.1 必须存在的关键 zone

- `conversation_list`
- `chat_header`
- `message_list`
- `input_area`
- `send_action_zone`

### 4.2 建议阈值

- bbox ratio delta <= `0.12`：pass
- bbox ratio delta <= `0.22`：warn
- bbox ratio delta > `0.22`：fail

### 4.3 fixed vs dynamic

compare 必须区分：

- **fixed**：search_area / conversation_list / chat_header / input_area / send_action_zone
- **dynamic**：selected row / target row / latest message bubble / send enabled state / overlays

fixed 区失效应优先触发 hard gate；dynamic 区失效应进入 probe 或单步验证，而不是直接整链放行。

---

## 5. semantic compare

比较项：

1. action target completeness
2. target-zone binding correctness
3. target bbox ratio delta
4. target point 是否仍在目标 bbox 内
5. capture ref completeness
6. critical guards 是否存在
7. local OCR probes 是否与 zone 一致
8. template/icon relocation evidence 是否存在

### 5.1 必须存在的关键 intent

- `open_chat`
- `focus_input`
- `read_reply`

### 5.2 OCR 规则

- OCR 只能是 `zone-aware local probe`
- whole-window OCR 不得作为 semantic compare 主裁决
- header / row / draft / reply 的文本比较必须支持 normalization + fuzzy matching

---

## 6. hard gate

任一命中，summary 必须直接为 `fail`：

1. 活动窗口不是微信
2. `sameWindow=false`
3. screenshot 过旧或尺寸异常
4. required zone 缺失
5. required intent 缺失
6. template match 逃逸 search window
7. pageType 可疑或 blocking page 命中
8. header identity 未匹配目标会话
9. input focus 无法确认落在 input area
10. send path 模糊或未配置
11. blocking overlay 存在

---

## 7. summary decision

### 7.1 pass

同时满足：

- required zones 全部存在
- required intents 全部存在
- structural weighted score >= `0.80`
- semantic weighted score >= `0.75`
- hard gate 全部通过

### 7.2 warn

同时满足：

- required zones 全部存在
- required intents 基本齐全
- structural weighted score >= `0.65`
- semantic weighted score >= `0.60`
- hard gate 全部通过
- 但不满足 pass

### 7.3 fail

任一条件成立：

- 关键 zone 缺失
- 关键 intent 缺失
- structural weighted score < `0.65`
- semantic weighted score < `0.60`
- 任一 hard gate 失败

---

## 8. compare 语义分层

### 8.1 `algorithm_validation`

适用场景：

- `dev_reference baseline`
- `web_reference baseline`
- mirror / html / proxied demo reference

输出语义：

- `algorithm_pass`
- `algorithm_warn`
- `algorithm_fail`

这类结果只能说明：

- 算法字段是否稳定
- 结构/语义提取是否正确
- baseline extractor / runtime snapshot / compare 链是否可用

这类结果不能直接说明：

- 是否允许真实动作
- 是否允许点击真实桌面应用

### 8.2 `action_gate`

适用场景：

- `desktop_action baseline`
- `desktop_reference baseline`
- `desktop_runtime snapshot`

输出语义：

- `pass`
- `warn`
- `fail`

只有这类 compare 才能决定动作放行。

---

## 9. 动作放行规则

- `fail`：禁止进入动作阶段
- `warn`：只允许 probe 和单步验证
- `pass`：允许进入渐进动作链

允许放开的最大动作级别，必须在 `summary_report.json` 中显式输出，例如：

- `allowedActionStage=none`
- `allowedActionStage=open_chat`
- `allowedActionStage=verify_chat_header`
- `allowedActionStage=focus_input`
- `allowedActionStage=read_reply`

send 不得因为 compare pass 自动放开。

---

## 10. stop / retry / escalate

### 10.1 stop

- hard gate 命中
- header mismatch
- target 不唯一仍想点击
- pageType blocking
- send safety 未通过

### 10.2 retry

只允许低风险步骤重试 1-2 次：

- fresh screenshot
- template 重定位
- 局部 OCR 重扫
- focus_input 重点一次

### 10.3 escalate

- OCR 与视觉证据冲突
- 多同名联系人无法唯一化
- send path 模糊
- overlay 是否阻挡无法自动裁决

---

## 11. 注意

当 baseline 来源是 web reference、runtime 来源是真实桌面应用时，compare 结果可能天然偏保守。这种情况下：

1. compare 仍然有价值
2. 但必须在报告中明确记录 `source kind mismatch`
3. 这类 compare 默认归入 `algorithm_validation`
4. 不能因为这类 compare fail 就误判实现完全无效

---

## 12. 一句话总结

compare 的职责是把“布局/语义/锚点/局部语义偏差”暴露在动作之前，并用 hard gate + score + repair hints 决定是否允许进入下一动作梯度，而不是继续把识别问题放到真实 GUI 点击里调。


## 13. Hard gate 与证据要求

compare 不能只有 score，必须同时输出 hard gate 结论。

### 13.1 必须显式输出的 hard gates

- `HG0_runtime_preflight`
- `HG1_source_kind_compatible`
- `HG2_required_zones_present`
- `HG3_required_intents_present`
- `HG4_required_capture_refs_present`
- `HG5_critical_guards_present`
- `HG6_same_window_and_freshness`
- `HG7_send_still_frozen_or_explicitly_allowed`

### 13.2 hard gate 规则

- 任一 hard gate 为 `fail`，`summary_report.json` 必须是 `fail`
- `warn` 不能覆盖 hard gate 失败
- 只有全部 hard gates 通过，才允许进入 `pass` 或 `warn`

### 13.3 source mismatch 规则

若 baseline 为 `web_reference/dev_reference`，runtime 为 `desktop_runtime`：

1. `HG1_source_kind_compatible=fail`
2. comparePurpose 必须是 `algorithm_validation`
3. `allowActions=false`
4. `allowProbes=false` 或仅允许离线 probe
5. 不得把该结果当成真实动作放行依据

## 14. compare 证据包

每次 compare 至少应落盘：

- `compare/structural_report.json`
- `compare/semantic_report.json`
- `compare/summary_report.json`
- baseline 路径
- runtime 路径
- missing zones/intents 列表
- hard gate 明细
- blocking reasons

若 compare 用于 `action_gate`，还必须包含：

- `sameWindow`
- `geometryHash`
- `maxAgeMs`
- `capture refs` 完整性
- `header/focus/send` critical guards

### 14.1 证据包中的字段归属

- `sameWindow / geometryHash / maxAgeMs` 来自 `capture_contract.json`
- `required zones / target bindings` 来自 baseline/runtime snapshot
- `header/focus/send` critical guards 来自 runtime semantic snapshot 与 verifier outputs
- `local OCR probe` 只能作为附加证据，不得替代上述强证据

## 15. repair map 要求

compare 报告不能只告诉你 fail，还应至少指向修复方向：

- `zone missing -> 回到 detect/infer/zones`
- `intent missing -> 回到 action_targets extractor`
- `capture ref missing -> 回到 capture contract builder`
- `source mismatch -> 降级为 algorithm_validation`
- `sameWindow/freshness fail -> fresh screenshot + preflight`

### 15.1 repair hint 必须最少回答三件事

每条 `repairHint` 至少要回答：

1. 问题发生在哪一层
   - `detect | infer | snapshot | compare | action`
2. 下一步该修什么
   - 例如 `rebuild capture refs`、`rerun local OCR probe`、`promote desktop baseline`
3. 处理方式是什么
   - `stop | retry | escalate`

### 15.2 compare 失败后的标准路由

- `required zone missing -> stop -> detect/infer`
- `required intent missing -> stop -> action_targets extractor`
- `capture ref missing -> stop -> capture contract builder`
- `source mismatch -> stop -> downgrade to algorithm_validation`
- `sameWindow=false -> stop -> fresh screenshot + runtime preflight`
- `header mismatch after open_chat -> stop -> action verification`
- `OCR weak evidence conflict -> escalate -> human review`

## 16. 一句话补充

compare 的输出必须同时回答三件事：

1. 差异是什么
2. 是否允许动作
3. 若不允许，应回退修哪一层
