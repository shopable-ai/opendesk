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
- 默认 `cellColorMode=median`
- 默认 `boundarySpanWidth=3`

重要边界：当前 `buildLayoutGrid` 只有 `median` 使用独立算法；`mean` 以及已接受的 `trimmed` / `dominant` 当前都走 mean 分支。文档和测试必须把 `trimmed` / `dominant` 当作当前 alias，而不是四种成熟算法。

## Deterministic regression tests

`automation/image_layout_test.go` 覆盖：

| Test | Level | Contract |
| --- | --- | --- |
| `TestLayoutCellColorMedianResistsSparseTextNoise` | T1 | sparse foreground/text-like noise 不应在 median grid 制造假 separator signal，并与 mean 行为区分 |
| `TestLayoutCellColorMedianDiffersFromMean` | T1 | synthetic cell 上 median 与 mean 确实产生不同颜色估计 |
| `TestLayoutBoundarySpanWidthChangesContrastWithoutOutOfBounds` | T1 | span width 会影响 boundary score，超大 span 也不会产生越界 boundary |
| `TestLayoutAnalyzeOptionValidation` | T1 | invalid mode 回到 median default；span <=0 clamp 1；过大 clamp 8 |
| `TestLayoutTrimmedAndDominantCurrentlyAliasMean` | T1 | 锁定当前 alias 事实，防止文档误报为独立算法 |
| `TestAnalyzeLayoutSmallAndUniformImages` | T1 | empty/tiny fail safely；uniform single-region 返回 coarse region |
| `TestLayoutHighContrastSplitProducesStrongBoundary` | T1 | synthetic high-contrast split 产生强 boundary signal |

## What these tests do not prove

T1 synthetic tests 不证明：

- WeChat/Slack/Finder 等真实应用的 separator accuracy；
- OCR 与 layout 的联合鲁棒性；
- 多屏/DPI/theme 的真实环境表现；
- performance budget；
- T3 desktop smoke。

真实应用指标必须另建受控 fixture，并记录 source image、environment、expected separator/region、variance budget 与 replay evidence。

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
