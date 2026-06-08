# wechat_frozen_desktop_golden_template

## 1. 用途

本文件提供 frozen desktop golden 的最小可执行模板。

用途只有三个：

1. 指导 run-scoped baseline 如何 promote
2. 统一 frozen desktop golden 的目录与文件名
3. 给后续脚本/审查提供最小 JSON 样例

---

## 2. 目标目录实例

```text
artifacts/golden-samples/wechat/
  wechat-desktop-chat-main-1097x880-frozen-20260408/
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
      capture_contract.json
      actionability_report.json
      send_safety_report.json
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

---

## 3. manifest.json 最小样例

```json
{
  "schemaVersion": "0.2.0",
  "sampleId": "wechat-desktop-chat-main-1097x880-frozen-20260408",
  "status": "frozen",
  "baselineTier": "desktop_reference",
  "sourceKind": "desktop_reference",
  "createdAt": "2026-04-08T00:00:00+08:00",
  "reviewer": "codex",
  "reviewedAt": "2026-04-08T00:00:00+08:00",
  "promotionDecision": "approved",
  "phaseGate": {
    "phase1": "pass",
    "phase2": "pass",
    "phase3": "send_frozen"
  },
  "artifactsComplete": true
}
```

---

## 4. golden_layout_baseline.json 最小样例

```json
{
  "schemaVersion": "0.2.0",
  "baselineId": "wechat-desktop-chat-main-1097x880-frozen-20260408-layout",
  "baselineTier": "desktop_reference",
  "sourceKind": "desktop_reference",
  "status": "frozen",
  "screen": { "width": 1097, "height": 880 },
  "window": {
    "width": 1097,
    "height": 880,
    "geometryHash": "wechat-main-1097x880-v1",
    "scaleFactor": 2
  },
  "criticalZones": [
    "search_area",
    "conversation_list",
    "chat_header",
    "message_list",
    "input_area",
    "send_action_zone"
  ],
  "topology": {
    "columns": ["left_nav", "conversation_list", "main_panel"],
    "mainPanelRows": ["chat_header", "message_list", "input_area"]
  },
  "zones": [],
  "captureRefs": [],
  "compareHints": {
    "actionCriticalZones": ["search_area", "conversation_list", "chat_header", "input_area"]
  }
}
```

---

## 5. golden_semantic_baseline.json 最小样例

```json
{
  "schemaVersion": "0.2.0",
  "baselineId": "wechat-desktop-chat-main-1097x880-frozen-20260408-semantic",
  "baselineTier": "desktop_reference",
  "sourceKind": "desktop_reference",
  "status": "frozen",
  "pageType": "chat_page",
  "appClass": "wechat_desktop",
  "stateFlags": {
    "headerVisible": true,
    "inputVisible": true,
    "sendVisible": true,
    "blockingOverlay": false
  },
  "actionTargets": [],
  "guards": {
    "headerMustMatchBeforeInput": true,
    "focusMustBeVerifiedBeforeDraft": true,
    "sendDisabledByDefault": true,
    "sendNeedsDedicatedGate": true
  },
  "captureRefs": [
    "search_capture",
    "conversation_capture",
    "header_capture",
    "input_capture",
    "send_capture"
  ]
}
```

---

## 6. capture_contract.json 最小样例

```json
{
  "schemaVersion": "0.2.0",
  "runId": "wechat-desktop-chat-main-1097x880-frozen-20260408",
  "capturedAt": "2026-04-08T00:00:00+08:00",
  "sameWindow": true,
  "geometryHash": "wechat-main-1097x880-v1",
  "maxAgeMs": 1500,
  "captures": [
    {
      "id": "search_capture",
      "zoneId": "search_area",
      "precision": "high",
      "referenceImagePath": "verify/capture_refs/search_capture.png",
      "searchWindow": { "x": 72, "y": 0, "width": 220, "height": 60 },
      "templateMatch": {
        "minScore": 0.72,
        "softMinScore": 0.68,
        "escapeCheck": true
      }
    }
  ]
}
```

---

## 7. compare/summary_report.json 最小样例

```json
{
  "schemaVersion": "0.2.0",
  "baselineDir": "artifacts/golden-samples/wechat/wechat-desktop-chat-main-1097x880-frozen-20260408/baseline",
  "runtimeDir": "artifacts/runs/codex-audit-send8/snapshot",
  "summary": {
    "comparePurpose": "action_gate",
    "decisionKind": "pass",
    "status": "pass",
    "allowActions": true,
    "allowProbes": true,
    "allowedActionStage": "focus_input",
    "sourceKindMismatch": false,
    "gateStatus": {
      "goldenPassed": true,
      "realScreenshotValidationPassed": true,
      "actionStageAllowed": true,
      "sendAllowed": false
    },
    "scoreBreakdown": {
      "structural": 1,
      "semantic": 1,
      "capture": 1,
      "guard": 1
    },
    "hardGates": [
      {
        "id": "HG6_same_window_and_freshness",
        "status": "pass",
        "evidenceStrength": "strong",
        "reason": ""
      }
    ],
    "blockingReasons": [
      "send safety gate not passed; send remains frozen"
    ],
    "repairHints": []
  }
}
```

---

## 8. promotion 时必须拒绝的情况

任一命中即拒绝 promote：

1. baseline 关键字段为空
2. `sameWindow / geometryHash / maxAgeMs` 未落盘
3. `capture_contract.json` 缺失
4. `summary_report.json` 缺 `hardGates` 或 `repairHints`
5. `send_safety_report.json` 缺失
6. 仍停留在 `artifacts/runs/.../desktop-baseline/` 没有独立冻结目录

---

## 9. 当前最合理的使用方式

当前仓库最合理的下一步不是恢复 send，也不是增加真实 GUI 长链试错，而是：

1. 选一个已有 run-scoped `desktop_reference`
2. 按本模板补齐目录与文件
3. promote 成 frozen desktop golden
4. 再用它去约束 `open_chat -> verify_chat_header -> focus_input -> read_reply`

---

## 10. 注册表与自动校验

当前推荐同时维护：

- `artifacts/golden-samples/wechat/registry.json`
- `scripts/validate_wechat_frozen_samples.py`
- `scripts/promote_wechat_run_to_frozen.py`
- `scripts/select_wechat_golden_sample.py`

用途：

1. `registry.json` 提供样本总览
   - `sampleId`
   - `status`
   - `baselineTier`
   - `comparePurpose`
   - `decisionKind`
   - `allowedActionStage`
   - `sendAllowed`
2. `validate_wechat_frozen_samples.py` 用于自动检查 frozen 样本是否满足最小要求

推荐主命令：

```bash
python3 scripts/validate_wechat_frozen_samples.py
```

生成 frozen 样本主命令：

```bash
python3 scripts/promote_wechat_run_to_frozen.py --run-id codex-audit-send8 --tier desktop_action
python3 scripts/promote_wechat_run_to_frozen.py --run-id codex-audit-send8-real --tier desktop_reference --reference-only
```

选择样本主命令：

```bash
python3 scripts/select_wechat_golden_sample.py --tier desktop_action --min-stage focus_input
python3 scripts/select_wechat_golden_sample.py --tier desktop_reference --min-stage none
```
