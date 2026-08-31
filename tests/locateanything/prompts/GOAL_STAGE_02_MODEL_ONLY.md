执行：

```bash
cd /Users/mac/Documents/workspace/clawdesk
./dist/clawdesk -script tests/locateanything/scripts/run_stage_02_model_only.js -timeout 5
```

本阶段以 `tests/locateanything/manifests/stage_02_model_cases.json` 为准，不再手写散 case。

必须覆盖：

- 大区域：`conversation list`
- 明确点：`send button`
- 小目标：`tiny unread badge`
- 多实例：`ground_multi`
- 文本区域：`search`

输出：

- `.runtime/tests/locateanything/stage_02_model_only/**/response.json`
- `.runtime/tests/locateanything/stage_02_model_only/**/annotated.png`
- `.runtime/tests/locateanything/stage_02_model_only/summary.json`
- `.runtime/tests/locateanything/reports/STAGE_02_MODEL_ONLY_REPORT.md`

报告里要明确：

- `daily/quality/verify` 的实际 attempt chain
- `8bit` 是否够做首跳
- 哪些 case 已经升级到 `quality`
- 当前结果是真模型还是 mock
