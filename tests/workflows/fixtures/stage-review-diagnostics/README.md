# 阶段诊断维护 fixture

本目录只有版本化的合成维护输入和字符串回归快照，不是原始 Execution、真实 Candidate 运行或 Qualification。

`cases.json` 固定三种反例及业务要求；继续使用原有 stage-review-fixture 和唯一 check-workflow-stage.js。新的业务断言绑定原 requiredTests，不另建评分表。三种反例故意保留 score100 / Gate pass，以测试业务矛盾仍然阻断。

`golden/*.md.snap` 是逐字比较的输出快照，不是独立导航报告。要查看具有有效相对链接及固定证据的完整实际报告：

```bash
node tests/workflows/tools/render-stage-diagnostic-fixtures.js <new-output-directory>
```

只读 `<case>/stage-review.md` 与它指向的一个失败阶段。生成器不执行 Candidate、Runtime、模型或桌面。
