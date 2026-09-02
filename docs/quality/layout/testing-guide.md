# Layout Regression Testing Guide

本文件只描述当前 layout algorithm 的确定性回归测试。历史 `examples/wechat_quick_test.js`、`examples/test_layout_improvement.js`、`examples/continuous_layout_test.js` 与 `TestLayoutWithTextNoise` 当前不在仓库中，因此不作为本轮 Evidence，也不保留历史 `[x] passed` 状态。

## Current implementation

主要实现：

- `automation/image_layout.go`
- `automation/vision_layout.go`
- `types/ImageColor.d.ts`

当前 `analyzeLayout` 参数中：

- `cellColorMode`: `mean | median | trimmed | dominant`
- `boundarySpanWidth`: 输入会 clamp 到 `1..8`
- `minSeparatorSpanRatio`: 输入会 clamp 到 `0..1`；`0` 用于关闭过滤做基线对照
- 默认 `cellColorMode=median`
- 默认 `boundarySpanWidth=3`
- 默认 `minSeparatorSpanRatio=0.30`

重要边界：当前 `buildLayoutGrid` 只有 `median` 使用独立算法；`mean` 以及已接受的 `trimmed` / `dominant` 当前都走 mean 分支。文档和测试必须把 `trimmed` / `dominant` 当作当前 alias，而不是四种成熟算法。

## Deterministic regression tests

`automation/image_layout_test.go` 覆盖：

| Test | Level | Contract |
| --- | --- | --- |
| `TestLayoutCellColorMedianResistsSparseTextNoise` | T1 | sparse foreground/text-like noise 不应在 median grid 制造假 separator signal，并与 mean 行为区分 |
| `TestLayoutCellColorMedianDiffersFromMean` | T1 | synthetic cell 上 median 与 mean 确实产生不同颜色估计 |
| `TestLayoutBoundarySpanWidthChangesContrastWithoutOutOfBounds` | T1 | span width 会影响 boundary score，超大 span 也不会产生越界 boundary |
| `TestLayoutBoundarySupportSpanTracksContinuousCoverage` | T1 | vertical candidate 的最长连续支撑率和像素区间可解释且方向正确 |
| `TestLayoutSeparatorSpanFilterRejectsLocalTextLineAndKeepsPanelBoundary` | T1 | 局部文字行候选被过滤，长面板边界保留，并输出 support span meta |
| `TestLayoutAnalyzeOptionValidation` | T1 | invalid mode 回到 median default；boundary span clamp `1..8`；separator span ratio clamp `0..1` |
| `TestLayoutTrimmedAndDominantCurrentlyAliasMean` | T1 | 锁定当前 alias 事实，防止文档误报为独立算法 |
| `TestAnalyzeLayoutSmallAndUniformImages` | T1 | empty/tiny fail safely；uniform single-region 返回 coarse region |
| `TestLayoutHighContrastSplitProducesStrongBoundary` | T1 | synthetic high-contrast split 产生强 boundary signal |

`automation/image_layout_progressive_test.go` 另覆盖 `TestLayoutSeparatorSpanFilterImprovesLocalTextBlockPrecision`：关闭过滤时为 `1/5`，默认过滤后为 `1/1`，同时保留真实面板边界。

## What these tests do not prove

T1 synthetic tests 不证明：

- WeChat/Slack/Finder 等真实应用的 separator accuracy；
- OCR 与 layout 的联合鲁棒性；
- 多屏/DPI/theme 的真实环境表现；
- performance budget；
- T3 desktop smoke。

当前 tracked screenshot 对照见 `docs/quality/layout/separator-span-support-2026-09-02.md`。其中带 ground truth 的 simple fixture 用于 precision/recall；未标注的真实应用截图只用于候选数与视觉碎片化观察，不冒充精确 ground truth。

## Recommended commands

仓库环境可用时：

```bash
go test ./automation/... -run 'TestLayout'
go test ./automation/...
go test ./pkg/...
go test ./...
```

只有实际运行并成功的命令才可以写 `passed`。如果因为桌面依赖、CGO、网络或 runner 环境无法执行，应记录为 `not run` + 原因。

## Future T2/T3 layout evidence

只有出现真实 regression 或明确应用 fixture 时，再增加：

1. 固定 source image + expected separator/region 的 T2 fixture；
2. 不同 DPI/theme/window geometry 的 variance cases；
3. 可用桌面环境下的 T3 capture → analyze → assert smoke。

不要恢复历史大型持续测试脚本，只为了复现旧文档结构。
