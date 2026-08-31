# STRUCTURE_FIRST_EXECUTION

## 1. 目标
当前主目标不是像素相似，不是整图 mirror，而是稳定提升以下动作的可执行性：
1. 找对话
2. 打开对话
3. 输入内容
4. 发送消息
5. 读取回复
6. 失败后恢复并回放

主链路固定为：

```text
structure-first
-> app/page inference
-> semantic zones
-> action targets
-> OCR assist
-> guarded send/reply
-> replay / evidence / recovery
```

## 2. 明确降级项
以下能力降级为辅助层，不得作为当前主 gate：
- pixel diff
- whole-window visual similarity
- HTML mirror fidelity

它们只用于：
- 回归观察
- 人工诊断
- 次级证据

## 3. 阶段与工件
### Phase 0: Runtime preflight
输入：运行环境
输出：`.runtime/runs/<run-id>/preflight_runtime.json`
必须验证：
- macOS 权限/TCC
- 微信窗口存在且可激活
- 截图可用
- OCR provider 可用
- 鼠标/键盘原语可用

### Phase 1: Structure-first detect
输入：`capture/source.png`
输出：
- `detect/regions.json`
- `detect/annotated.png`
- `detect/layout_model.json`
要求：先稳定结构，再谈语义。

### Phase 2: App / page inference
输出：`infer/app_classification.json`
要求：给出 `appClass`、`pageType`、正反证据、置信度与 stop 条件。

### Phase 3: Semantic zones
输出：`infer/zones.json`
至少识别：
- `conversation_list`
- `chat_header`
- `message_list`
- `input_area`
- `send_action_zone`

### Phase 4: Action targets
输出：`infer/action_targets.json`
每个 target 必须具备：
- intent
- bbox / point
- selectorLogic
- fallbacks
- preconditions
- postconditions
- confidence
- riskLevel

### Phase 5: OCR assist
输出：`infer/ocr_map.json`
原则：zone-aware OCR，不做全窗 OCR 主裁决。
OCR 只为动作做辅助证据：
- chat row 识别
- header 验证
- input draft 验证
- reply readback

### Phase 6: Guarded execution
输出：
- `evidence/actions/*.json`
- `evidence/actions/*_before.png`
- `evidence/actions/*_after.png`
- `checkpoints/*.json`
要求：每个动作都经过 actionability review。

### Phase 7: Replay / recovery
输出：
- `replay/replay_result.json`
- `replay/state_transition_log.json`
- `replay/recovery_result.json`
要求：支持 resume / retry / escalate。

## 4. 当前仓库映射
- 结构检测基线：`automation/image_layout.go`、`automation/vision_layout.go`
- OCR 基线：`automation/vision.go`、`scripts/paddle_ocr_server.py`
- detect contract：`pkg/visionrun/detect.go`
- layout model 雏形：`scripts/derive_layout_model.js`
- 微信语义原型：`examples/mac/wechat_region_map.js`
- 发送原型：`examples/mac/wechat_structured_send.js`
- evidence/gate 基线：`pkg/visionrun/bundle.go`、`docs/GATES_AND_EVIDENCE.md`

## 5. 执行顺序门禁
只有按以下顺序通过，才允许进入下一层：
1. runtime preflight
2. layout_model
3. app/page inference
4. semantic zones completeness
5. action target executability
6. input/send/reply guarded execution
7. replay stability

## 6. Stop / Retry / Escalate
### Stop
- `pageType` 不可信
- 关键 zone 缺失
- send target 不可信
- 发现遮挡/弹窗/详情页/小程序页/图片预览页

### Retry
- OCR 局部低置信
- 候选 target 多个且可额外观察
- 窗口轻微位移后可重新截图

### Escalate
- 同名会话冲突
- 多次 recovery 失败
- message readback 仍模糊
- 任何可能导致误发的情况

## 7. Definition of Done
策略层完成标准：
- mirror 不再是主门禁
- `layout_model/app_classification/zones/action_targets` 成为一级工件
- 每个动作前均可回答“为什么现在可执行”
- 每个动作后均可回答“证据是否证明状态确实变化”

