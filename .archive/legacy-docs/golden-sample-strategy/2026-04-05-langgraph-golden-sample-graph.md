# LANGGRAPH_GOLDEN_SAMPLE_GRAPH_20260405

## 1. Graph 概览

```text
CollectInputs
-> BuildGoldenSampleContext
-> GenerateStructureJSON
-> GenerateLayoutHTML
-> GenerateSemanticHTML
-> RunDOMValidation
-> RunCompareValidation
-> ScoreAndJudge
-> Diagnose
-> Repair
-> ReRun
-> BuildExecutionArtifacts
-> RunWechatExecution
-> VerifyPostSend
-> ReadReply
-> RecordReplayAndMemory
-> HumanGate
```

## 2. 节点表

| Node | 输入工件 | 输出工件 | Gate | 失败后 repair | 自动重试 | 是否必须人工 gate |
|---|---|---|---|---|---|---|
| CollectInputs | external source paths, target requirements | `requirement.json`, `source_index.json` | 来源完整、路径存在 | 补齐路径/重新抓取 | 否 | 否 |
| BuildGoldenSampleContext | external html/runtime dom/screenshot/repo refs | `artifacts/fixtures/golden-samples/.../context.json` | external immutable refs frozen | 调整 external ref | 否 | 否 |
| GenerateStructureJSON | `capture/source.png` | `detect/regions.json`, `detect/layout_model.json`, `infer/app_classification.json`, `infer/zones.json`, `infer/action_targets.json`, `infer/chat_candidates.json`, `infer/semantic_model.json` | pageType 可信、required zones 齐全 | 回到 detect/infer 参数修复 | 是（仅 detect） | 否 |
| GenerateLayoutHTML | detect/infer JSON | `mirror/layout.html` | HTML 来自 JSON contract | 修 mirror generator | 是 | 否 |
| GenerateSemanticHTML | detect/infer JSON + semantic model | `mirror/semantic.html` | semantic blocks/targets/candidates 完整 | 修 semantic model / html generator | 是 | 否 |
| RunDOMValidation | layout/semantic html + semantic model | `mirror/dom_validation_report.json` | required zones/selected uniqueness/target intents 通过 | 修 infer / semantic model | 是 | 否 |
| RunCompareValidation | `capture/source.png`, `mirror/mirror.png` | `compare/report.json`, `compare/diff.png` | 生成成功，major deviations 可定位 | Diagnose -> Repair | 是（render/compare） | 否 |
| ScoreAndJudge | dom report + compare + actionability + taxonomy | `scorecard.json`, `decision.json` | >= threshold 才继续 | 进入 Diagnose | 否 | 否 |
| Diagnose | 所有前序工件 | `diagnose/root_cause.json` | root cause 必须指向 artifact | 若无法定位则 escalte | 否 | 视情况 |
| Repair | diagnose result | code/doc/prompt/schema patch, `repair_plan.json` | 变更范围受控 | 回滚/换 repair recipe | 是 | 否 |
| ReRun | repaired code + source | 新 run bundle / delta report | 关键指标不恶化 | 再诊断 | 是 | 否 |
| BuildExecutionArtifacts | action targets + probes + checkpoints plan | `verify/*`, `checkpoints/*`, `replay/*` | send 仍 blocked by default | 补 probes/fallbacks | 是（非 send） | 否 |
| RunWechatExecution | reviewed action plan | action before/after evidence | only if send safety pass | stop/recovery | 否（send 不自动） | **是** |
| VerifyPostSend | post-send probes | `verify/post_send_verifier_result.json` | draft clear / new message evidence | retry read-only probes | 是 | 若不确定则是 |
| ReadReply | readback probes | reply readback evidence | reply OCR/anchor 可用 | retry OCR / recapture | 是 | 否 |
| RecordReplayAndMemory | audit + checkpoints + decisions | `replay/replay_result.json`, `replay/state_transition_log.json`, memory note | replay 可恢复 | 修 checkpoint logging | 是 | 否 |
| HumanGate | 全部工件 | review decision / promotion | 误发风险为零或可接受 | hold / reject / supersede | 否 | **是** |

## 3. Gate 细化

### G0 Runtime & source readiness
- external source frozen
- capture/source.png 可读
- runtime preflight != fail

### G1 Structure correctness
- `layout_model.json` 存在
- `app_classification.json` 可信
- `zones.json` 包含 `conversation_list/chat_header/message_list/input_area`

### G2 Actionability readiness
- `action_targets.json` 包含 `open_chat/focus_input/read_reply/send_message`
- `verify/actionability_report.json` 可解释 why allowed / why blocked

### G3 Dual-HTML validity
- `mirror/layout.html` 存在且 JSON 驱动
- `mirror/semantic.html` 存在且 JSON 驱动
- `infer/semantic_model.json` 与 `mirror/semantic_model.json` 一致
- `dom_validation_report.json` 通过 required checks

### G4 Compare diagnostic completeness
- `compare/report.json` 与 `diff.png` 存在
- 即使 fail，也必须可用于 Diagnose

### G5 Fresh evidence for live action
- send 前所有证据必须来自同一 fresh run
- pageType 未变化
- 无 blocking overlay/modal

### G6 Replay stability
- checkpoint 可恢复
- state transition log 完整
- 重跑漂移受控

### G7 Human promotion gate
- golden sample promotion 需 review decision
- send 执行需额外人工门禁

## 4. 自动重试与人工门禁原则

### 可自动重试
- detect
- infer
- mirror render
- compare
- OCR probes
- read-only verification

### 不可自动重试
- send_message
- 会改变当前会话上下文的高风险点击
- 任何 identity 不明的 open_chat 行为

### 必须人工 gate
- `RunWechatExecution`（当动作包含 send）
- golden sample promotion
- 多方案最终选择

## 5. 失败后的 repair 优先级
1. detect/layout/zones
2. app/page inference
3. action target completeness
4. OCR probe placement
5. semantic model
6. mirror html
7. compare threshold tuning

## 6. 与 LangGraph / Temporal 思想的映射
- LangGraph：`thread_id -> run-id`, `checkpoint -> checkpoints/current_state.json`, `history -> replay/state_transition_log.json`
- Temporal：`workflow execution -> one run bundle`, `event history -> audit.ndjson + state_transition_log`, `deterministic replay -> ReRun from same source + same contract`
