# GATES_AND_EVIDENCE_V2

## 1. 核心改动
旧主 gate：`capture -> detect -> mirror -> compare`

新主 gate：
1. `layout_model.json` 正确
2. `app_classification.json` 可信
3. `zones.json` 完整
4. `action_targets.json` 可执行
5. replay 稳定
6. failure taxonomy 可复现
7. evidence 完整

mirror / compare 退居二线。

## 2. 目录约定
```text
artifacts/runs/<run-id>/
  requirement.json
  preflight.json
  preflight_runtime.json
  capture/source.png
  detect/regions.json
  detect/annotated.png
  detect/layout_model.json
  infer/app_classification.json
  infer/zones.json
  infer/action_targets.json
  infer/ocr_map.json
  verify/actionability_report.json
  evidence/actions/
  evidence/anchors/
  evidence/ocr/
  checkpoints/
  replay/replay_result.json
  replay/state_transition_log.json
  audit.ndjson
  decision.json
```

## 3. Gate 定义
### G0 Runtime preflight
通过条件：微信窗口、截图、OCR、键鼠、权限均可用。

### G1 Layout model
通过条件：
- `layout_model.json` 存在
- column topology 合理
- major zones 覆盖主工作区

### G2 App / page inference
通过条件：
- `appClass/pageType` 置信度达阈值
- 有 signals + counterSignals
- 无 blocking page

### G3 Zones completeness
通过条件：
- `conversation_list/chat_header/message_list/input_area` 齐全
- zone 之间无明显重叠/缺失

### G4 Action target executability
通过条件：
- open_chat/focus_input/send/read_reply 至少各有一个可执行 target
- 每个关键 target 有 fallback
- preconditions/postconditions 完整

### G5 OCR assist quality
通过条件：
- header / row / draft / readback 至少局部证据成立
- 不依赖 whole-window OCR 单点裁决

### G6 Replay stability
通过条件：
- 重复运行时 zone/target 漂移受控
- 能从 checkpoint 恢复

### G7 Evidence completeness
通过条件：
- 动作级 before/after
- target candidate trace
- OCR raw + normalized
- gate result
- failure taxonomy id

## 4. decision.json 语义更新
- `canProceed` 只由 G0-G7 决定
- compare fail 不再自动阻止业务主链路
- 若 `pageType` 不明，则 `canProceed=false`

## 5. audit.ndjson 粒度要求
除了阶段事件，还必须新增动作事件：
- `open_chat.attempt`
- `open_chat.verify`
- `focus_input.attempt`
- `draft.verify`
- `send.attempt`
- `send.verify`
- `reply.readback`
- `recovery.attempt`

## 6. Pass / Warn / Fail
- `pass`：允许进入下一阶段
- `warn`：只允许 probe，不允许 send
- `fail`：必须 stop 或 recovery

## 7. 与现仓库的关系
- 保留现有 `docs/GATES_AND_EVIDENCE.md` 作为 bootstrap 历史
- 以后以本文件为主 gate 政策

