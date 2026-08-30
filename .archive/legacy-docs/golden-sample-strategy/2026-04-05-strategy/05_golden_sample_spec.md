# Golden Sample Spec

## 1. Purpose
A golden sample is a frozen evidence package for diagnosis, compare, replay, and human review. It is not just a pretty HTML mirror.

## 2. Directory layout
```text
artifacts/golden-samples/wechat/<sample-id>/
  manifest.json
  capture/source.png
  detect/regions.json
  detect/layout_model.json
  infer/app_classification.json
  infer/zones.json
  infer/action_targets.json
  infer/chat_candidates.json
  infer/semantic_model.json
  infer/ocr_map.json
  mirror/layout.html
  mirror/semantic.html
  mirror/dom_validation_report.json
  compare/report.json
  compare/diff.png
  verify/actionability_report.json
  verify/send_safety_report.json
  checkpoints/current_state.json
  replay/replay_case.json
  replay/replay_result.json
  replay/state_transition_log.json
  failure/failure_taxonomy.json
  evidence/index.json
```

## 3. Lifecycle
- candidate
- verified
- frozen
- deprecated

## 4. Provenance
manifest.json must include:
- source kind: real_app / web_reference / synthetic
- source URL(s)
- capture date
- proxy used
- viewport or window size
- agent namespace

## 5. Immutability
Frozen samples are append-only. Replacement requires a new sample id.

## 6. Important warning
`artifacts/external/wechatweb-ref-20260405/` is a bootstrap reference, not a frozen real-app golden sample.
