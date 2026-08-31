执行：

```bash
cd /Users/mac/Documents/workspace/opendesk
python3 tests/locateanything/scripts/run_stage_05_report.py
```

输入来源：

- `.runtime/tests/locateanything/stage_01_env/summary.json`
- `.runtime/tests/locateanything/stage_02_model_only/summary.json`
- `.runtime/tests/locateanything/stage_03_script_assisted/summary.json`
- `.runtime/tests/locateanything/stage_04_boundary_stress/summary.json`

输出：

- `.runtime/tests/locateanything/reports/FINAL_REPORT.md`

必须明确：

1. LocateAnything 在当前仓库里适合做什么层：
   - baseline 主路径
   - fallback
   - hybrid assist
   - stress/high-quality mode
2. `8bit` 默认建议是什么
3. `bf16` 的升级条件是什么
4. 当前控制机哪些结果是真实已跑，哪些只是待真模型补测
5. 远端 Apple Silicon 模型机的最短复跑命令
