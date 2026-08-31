执行：

```bash
cd /Users/mac/Documents/workspace/opendesk
./dist/opendesk -script tests/locateanything/scripts/run_stage_04_boundary_stress.js -timeout 5
```

本阶段的矩阵以：

- `tests/locateanything/manifests/stage_04_boundary_cases.json`

为准。

至少覆盖：

- 小目标
- 多实例
- 歧义 prompt
- 文本区域
- 不同布局素材

输出：

- `.runtime/tests/locateanything/stage_04_boundary_stress/**/response.json`
- `.runtime/tests/locateanything/stage_04_boundary_stress/**/annotated.png`
- `.runtime/tests/locateanything/stage_04_boundary_stress/summary.json`
- `.runtime/tests/locateanything/reports/STAGE_04_BOUNDARY_STRESS_REPORT.md`

重点结论必须回答：

- 哪些 case 默认 `8bit/daily` 足够
- 哪些 case 应直接切 `bf16/quality`
- 哪些 case 只适合当 fallback
