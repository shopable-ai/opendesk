# ACTION_TARGET_MODEL

## 1. 目标
动作目标不是“一个裸坐标”，而是“带证据、带回退、带验证的可执行目标”。

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
每个关键目标必须至少提供一个 fallback：
- open_chat：精确 row -> 近邻 row + header 校验 -> search flow
- focus_input：主输入框 -> 输入区热点 -> tab/快捷键补救
- send_message：发送按钮 -> Enter（仅在配置确认时）

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
- 误发风险不高

## 9. postconditions
### `open_chat`
- header 切换到目标身份
- message_list 刷新
- input_area 仍存在

### `focus_input`
- 输入区聚焦证据成立

### `send_message`
- draft 消失或输入框清空
- 消息区新增己方消息 bubble 或等效证据

## 10. 明确禁止
- 单个 OCR 文本中心点直接作为最终 target
- 无 postcondition 的 send
- 无 fallback 的高风险点击

