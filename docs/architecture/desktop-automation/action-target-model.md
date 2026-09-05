# ACTION_TARGET_MODEL

## 阅读与合同边界

本页属于 Target 专项设计模型，不是当前 Runtime API schema。下面的零尺寸 bbox、裸 point 和分类值是结构示意，不是可直接传给 Geometry／mouse 的有效参数。当前公开调用以 [Desktop UI API](../../api/desktop-ui.md) 和 [Geometry API](../../api/geometry.md) 为准。

业务对象、操作资格和步骤交接见[自动化任务求解方法](../../frameworks/automation-problem-solving-framework.md)；整体位置见[框架总导航](../../frameworks/README.md)。定位正确不等于业务已授权，也不等于动作结果已验证。

## 1. 目标
动作目标不是“一个裸坐标”，而是“带证据、带安全失败去向、带验证的可执行目标”。可靠回退是可选路径，不是为满足结构而必须补出的动作。

## 2. Target 基本结构
```json
{
  "id": "target_open_chat_primary",
  "intent": "open_chat",
  "zoneId": "conversation_list",
  "targetType": "row",
  "bbox": {"x": 0, "y": 0, "width": 0, "height": 0},
  "point": {"x": 0, "y": 0},
  "selectorLogic": {
    "kind": "hybrid",
    "signals": ["row_cluster", "ocr_text_match", "layout_position"]
  },
  "confidence": 0.0,
  "riskLevel": "high",
  "fallbacks": [],
  "preconditions": [],
  "postconditions": []
}
```

## 3. intent taxonomy
- `open_chat`
- `focus_input`
- `input_message`
- `send_message`
- `read_reply`
- `recover_to_chat_page`

## 4. targetType taxonomy
- `row`
- `textbox`
- `button`
- `hotspot`
- `text_anchor`
- `hybrid_candidate_set`

## 5. 选择原则
1. 先 zone，再 target
2. 先 candidate set，再 primary target
3. 能用语义选择，不直接暴露裸坐标给 planner
4. point 只是执行投影，不是真相本体

## 6. confidence 组成
建议拆分为：
- `zoneConfidence`
- `selectorConfidence`
- `ocrConfidence`
- `freshnessConfidence`
- `actionSafetyConfidence`

## 7. fallback 设计
每个关键目标必须有明确的安全失败去向；只有经过验证的替代路径才属于 fallback。没有可靠替代路径时，停止或人工接管是完整方案，`fallbacks: []` 可以合法存在。

- open_chat：可尝试已验证的搜索路径；新候选仍需独立确认身份，不能仅因位置接近就选中另一行。
- focus_input：仅在目标控件和焦点可确认、且该应用交互约定已验证时，使用替代聚焦方法；未知热点不能作为盲点兜底。
- send_message：只在尚未发出发送动作、草稿与对象已确认、应用配置明确支持时，才可以选择 Enter 等替代发送方式。发送结果不确定后不得换一种方式再发一次。

回退前先区分观察失败、定位失败、权限问题和动作结果不确定；重新观察不等于允许重复输入。窗口、布局和业务对象变化后需重新验证目标。

## 8. preconditions
### `open_chat`
- 当前 `pageType` 允许
- `conversation_list` 完整
- 目标会话已消歧

### `focus_input`
- 当前页已确认是 chat page
- `input_area` 完整

### `send_message`
- draft 已验证
- 发送路径唯一
- 目标会话、草稿内容与本次发送授权已明确，且不存在未解决的身份或结果不确定性

## 9. postconditions
### `open_chat`
- header 切换到目标身份
- message_list 刷新
- input_area 仍存在

### `focus_input`
- 输入区聚焦证据成立

### `send_message`
- draft 消失或输入框清空只能作为辅助观察，不能单独证明发送或送达。
- 在正确会话中核对本次消息内容与新增消息或等效结果，排除旧消息、错误会话和失败状态。
- 需要证明后端接受或对方送达时，必须使用能支持该结论的结果来源；仅有 UI 级证据时不得升级声称业务成功。
- 验证来源不可用或结果不确定时，停止并核对实际效果，不自动重发。

## 10. 明确禁止
- 单个 OCR 文本中心点直接作为最终 target
- 无 postcondition 的 send
- 为满足 fallback 数量而增加无证据坐标、首候选或近邻候选兜底
- 对结果不确定的发送、提交或输入自动换路重做

