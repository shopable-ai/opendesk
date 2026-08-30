# Gate Design

## 1. Philosophy
- hard gates first
- scores help prioritize repair
- pixel diff is auxiliary only
- any send-risk ambiguity fails closed

## 2. Gate ladder
### G0 Runtime Preflight
- screenshot available
- OCR available
- keyboard/mouse available
- window activation available
- TCC/accessibility state acceptable

### G1 App/Page Identity
Pass if:
- appClass is recognized
- pageType confidence is above threshold
- counterSignals are present
- no blocking page / overlay contradiction exists

### G2 Zone Completeness
Required zones:
- conversation_list
- chat_header
- message_list
- input_area
- send_action_zone

### G3 Semantic Model Integrity
Pass if:
- infer/semantic_model.json exists
- selected row uniqueness proven
- required probes declared
- required action anchors declared
- semantic nodes trace back to source fields

### G4 Dual-HTML Integrity
Pass if:
- mirror/layout.html exists
- mirror/semantic.html exists
- mirror/dom_validation_report.json exists
- all three are JSON-driven

### G5 Compare Validation
Required sub-scores:
- DOM / structure
- region / bbox coverage
- text alignment
- color / layout skeleton
- pixel assist

### G6 Actionability
Critical actions:
- open_chat
- focus_input
- type_text
- send_message
- read_reply

### G7 Replay/Recovery
Required:
- current_state checkpoint
- replay_result
- state_transition_log
- node-level retry policy

### G8 Send Safety
Only Phase 2/3 and only if:
- page identity verified
- target identity verified
- draft verified
- runtime can send
- actionability can send
- post-send plan exists

### G9 Human Gate
Required when:
- freezing a golden sample
- allowing first real send
- escalating ambiguous high-risk failures

## 3. Compare/report v2 target
```json
{
  "domValidation": {"score": 0, "missing": [], "extra": []},
  "regionCoverage": {"score": 0, "missingZones": [], "bboxDelta": []},
  "textAlignment": {"score": 0, "header": [], "chatRows": [], "draft": [], "replyProbes": []},
  "layoutColor": {"score": 0, "columnRatios": [], "rowHeightPattern": [], "selectedBg": []},
  "pixelAssist": {"score": 0, "diffRatio": 0, "majorDeviationRegions": []},
  "weightedScore": 0,
  "repairHints": []
}
```

## 4. Pass / Warn / Fail
- pass: may proceed
- warn: may probe, may not send
- fail: stop or repair
