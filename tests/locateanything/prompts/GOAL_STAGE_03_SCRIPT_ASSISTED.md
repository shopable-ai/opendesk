执行：

```bash
cd /Users/mac/Documents/workspace/opendesk
./dist/opendesk -script tests/locateanything/scripts/run_stage_03_script_assisted.js -timeout 8
```

本阶段是 wrapper 模式：

- 不重写 `examples/mac/wechat_steps/main.js`
- 只在外层注入 LocateAnything
- 允许的模型 surface 只有：
  - `search_area`
  - `conversation_list`
  - `search_result_row`
  - `chat_header`
  - `input_area`
  - `send_action_zone`

manifest：

- `tests/locateanything/manifests/stage_03_workflow_cases.json`

必跑三类 case：

1. `BASELINE`
2. `L50` assisted
3. `L70` send_guarded

结果必须写到：

- `.runtime/tests/locateanything/stage_03_script_assisted/summary.json`
- `.runtime/tests/locateanything/stage_03_script_assisted/<case>/report.json`
- `.runtime/tests/locateanything/reports/STAGE_03_SCRIPT_ASSISTED_REPORT.md`

如果当前微信环境不满足：

- 目标会话没配
- WeChat 不在前台
- 权限不全

也要写失败报告，不要静默跳过。
