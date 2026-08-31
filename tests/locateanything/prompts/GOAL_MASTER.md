你现在在控制机 `min-Mac4g.local` 上工作，项目目录是：

```bash
cd /Users/mac/Documents/workspace/opendesk
```

本任务不是只跑一个 `demo`，而是把 `tests/locateanything/` 这套分阶段测试真正跑起来并持续补齐。

## 固定拓扑

- 当前机器：运行 `opendesk`、微信自动化脚本、stage runner
- 局域网另一台机器：运行 `LocateAnything` bridge + 真模型
- 如果远端模型机不可达，当前机器允许退回本地 `mock` bridge

## 现有实现入口

- `tests/locateanything/config/default.config.json`
- `tests/locateanything/manifests/`
- `tests/locateanything/scripts/run_stage_01_env.py`
- `tests/locateanything/scripts/run_stage_02_model_only.js`
- `tests/locateanything/scripts/run_stage_03_script_assisted.js`
- `tests/locateanything/scripts/run_stage_04_boundary_stress.js`
- `tests/locateanything/scripts/run_stage_05_report.py`

## Lane 规则

- `L10`：最多 1 次 LocateAnything 解析，只做 fallback
- `L30`：最多 2 次，主要打 `search_area` 和 `input_area|send_action_zone`
- `L50`：最多 3 次，加入 `conversation_list/search_result_row`
- `L70`：最多 5 次，五个 GUI surface 都可模型主导
- `L90`：最多 7 次，只用于边界和 retry stress

## 目标

1. 先执行 Stage 01，确认当前控制机现实约束和 `serviceUrl`/mock 链路。
2. 再执行 Stage 02、Stage 04 静态 case，形成 profile / prompt / lane 结论。
3. 视当前微信环境执行 Stage 03：
   - baseline
   - assisted
   - send_guarded
4. 最后执行 Stage 05，输出 `FINAL_REPORT.md`。

## 真实发送规则

- 允许给当前微信账号自己可控的“哔哩会员”会话发消息
- 但不得把目标会话写死进源码
- 必须通过 config 提供 `targetChatName`
- 必须保留 send guard、去重、发送后校验

## 输出要求

始终把产物落到：

- `.runtime/tests/locateanything/`
- `.runtime/tests/locateanything/reports/`

如果有阶段跑不了，要把阻塞点写进对应报告和 `FINAL_REPORT.md`，不要编造结果。
