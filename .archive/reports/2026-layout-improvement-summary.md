# 2026 Layout Improvement Historical Summary

> 历史项目报告。用于保留 2026-03 layout separator 改进阶段的实验结论，不是当前实现规范。当前事实以 `docs/implementation/layout/layout-recognition.md` 和 `automation/image_layout.go` 为准。

## 目标

减少桌面窗口布局识别中由文字边缘产生的伪 separator，使结构边界更接近真实色块/区域分界。

## 当时完成的主要改动

- 增加 median cell-color 计算；
- 增加 multi-span region contrast；
- 扩展 synthetic / real-app / ground-truth 验证；
- 增加参数、类型定义和调优脚本；
- 建立 progressive test、真实应用测试与 validation report。

## 历史实验结果

### Progressive synthetic tests

- Median：平均约 9.0 个 separator；
- Mean：平均约 9.7 个 separator；
- Median 在 4/7 组测试中更优，Mean 在 3/7 组测试中更优。

### Real applications

测试覆盖 Chrome、VS Code、Finder、WeChat：

- Median：平均约 11.8 个 separator；
- Mean：平均约 14.5 个 separator；
- Mean 在 3/4 应用中取得更高候选数量；
- 当时记录的平均 confidence 约为 Mean 0.610、Median 0.457。

### Ground-truth validation

- 简单布局：两种模式均可达到 F1=1.0；
- complex-with-text：Median 约 F1=0.500，Mean 约 F1=0.278；
- 主要剩余问题是 text-heavy 场景 false positive，尤其 horizontal separator。

这些数字只代表当时测试快照，不能推导当前代码仍具有完全相同的性能。

## 当时的核心认识

Median 对文字噪声更稳健，但会改变 cell color 分布和 flood-fill 合并行为；只调整 separator score 不能完全解决复杂真实界面的 false positive / recall 平衡问题。

因此后续方向包括：

- separator span / support 约束；
- adaptive threshold；
- multi-scale validation；
- 更完整的真实应用 regression matrix。

当前尚未实现的候选已整理到：

```text
docs/plans/layout/layout-improvement-plan.md
```

## 与当前实现的关系

旧阶段文档之间曾对 `cellColorMode` 默认值出现不一致描述。当前源码 `parseLayoutAnalyzeOptions()` 是最终事实源；整理时已在正式实现文档中重新校准。

相关当前文档：

```text
docs/implementation/layout/layout-recognition.md
docs/research/layout/layout-improvement-analysis.md
docs/research/layout/parameter-tuning-analysis.md
docs/plans/layout/layout-improvement-plan.md
```

相关历史证据：

```text
artifacts/reports/layout/algorithm-validation-report.md
artifacts/reports/layout/progressive-test-results.md
artifacts/reports/layout/real-app-test-results.md
artifacts/reports/layout/layout-improvement-results.md
```

## 被本报告取代的旧总结

本报告合并并取代以下重复阶段总结：

- `FINAL_STATUS_REPORT.md`
- `FINAL_SUMMARY.md`
- `PROJECT_COMPLETE_SUMMARY.md`

Git 历史仍保留它们的完整原文。
