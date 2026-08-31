# LocateAnything Lanes

`LocateAnything` 在这一组测试里不是简单的“开或关”，而是按模型参与占比做分层。

| Lane | 目标占比 | 最大模型解析步数 | 默认定位面 |
| --- | --- | ---: | --- |
| `L10` | 约 10% | 1 | 只做 fallback |
| `L30` | 约 30% | 2 | `search_area` + `input_area|send_action_zone` |
| `L50` | 约 50% | 3 | `search_area` + `conversation_list/search_result` + `input_area` |
| `L70` | 约 70% | 5 | 五个定位面全部开放 |
| `L90` | 约 90% | 7 | `L70` + `text/ground_multi/verify` 强化重试 |

## Surface Rules

- `search_area`
- `conversation_list`
- `search_result_row`
- `chat_header`
- `input_area`
- `send_action_zone`

`BASELINE` lane 完全不调用 LocateAnything，只跑现有仓库路径，作为对照组。

## Profile Policy

- `daily = 8bit + fast`
  - `gui_point`
  - `gui_box`
  - 常规 GUI 定位首跳
- `quality = bf16 + hybrid`
  - `text`
  - `ground_multi`
  - 小目标、多实例、歧义描述
- `verify = bf16 + slow`
  - 只在 Stage 04 和终局 retry 启用
