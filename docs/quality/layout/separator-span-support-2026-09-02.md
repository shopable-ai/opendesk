# Layout Separator Continuous Support Evidence

日期：2026-09-02

## Audit / Decision

`layoutAnalyzeOptions` 已有 boundary score、总 `supportRatio` 和 multi-span region contrast，但 candidate filtering 只有硬编码的 `supportRatio >= 0.18`；最终过滤器还明确保留了 `Optional span filtering (future enhancement)`。因此本项判定为 **Implement**，不是重复开发。

## Implemented contract

- 新参数：`minSeparatorSpanRatio`，范围 `0..1`，默认 `0.30`；
- `0` 关闭连续 span gate，作为旧候选行为的对照基线；
- vertical candidate 沿 Y 轴、horizontal candidate 沿 X 轴计算最长连续有效支撑；
- candidate meta 输出 `supportSpanRatio` 和像素级 `supportSpan.start/end`；
- gate 在 split-tree 选择前执行，不让被拒候选继续切分区域树；
- 没有应用名称、固定坐标或应用专用阈值。

## Deterministic results

聚焦回归覆盖连续覆盖率、candidate filtering、参数 clamp 和 debug meta。端到端 text-block synthetic 的唯一 ground-truth panel boundary 在过滤前后都被保留：

| Mode | True separators | All selected | Precision | Recall |
| --- | ---: | ---: | ---: | ---: |
| `minSeparatorSpanRatio=0` | 1 | 5 | 0.20 | 1.00 |
| default `0.30` | 1 | 1 | 1.00 | 1.00 |

既有 Level 1-7 progressive cases 均通过；Level 1/2 的两条主 vertical separator、Level 3 的稀疏文字主边界、Level 5 的 sidebar 主边界和 Level 7 的 mixed-content 主边界均保留。

## Current-source JavaScript fixture evidence

从仓库根目录执行：

```bash
go run ./cmd/opendesk -script .runtime/tests/layout/separator-span-support-20260902/probe.js
```

成功运行：`.runtime/runs/direct-20260902-163235-519000/`

| Tracked fixture | Baseline | Default span gate | Observation |
| --- | --- | --- | --- |
| `simple_wechat.png` + ground truth | precision/recall `1.0/1.0`, 5 regions | precision/recall `1.0/1.0`, 5 regions | 简单布局无召回回归 |
| `mock_wechat.png` + ground truth | precision/recall `0.5/0.5`, 5 regions | precision/recall `0.5/0.5`, 5 regions | 未改善，也未回归 |
| `wechat_original.png` | 7 root candidates, 20 regions | 2 root candidates, 14 regions | **不纳入验收**：图像中央含第三方录音界面重叠，数量只能作为诊断输出 |
| Calculator screenshot | 3 root candidates, 4 regions | 3 root candidates, 4 regions | 无结构变化 |
| legacy desktop screenshot | 4 root candidates, 24 regions | 4 root candidates, 23 regions | 仅减少一处递归碎片 |

以下对照图仅保留为 contaminated-input 诊断记录，不是视觉 Evidence：

```text
.runtime/tests/layout/separator-span-support-20260902/wechat-original-baseline.png
.runtime/tests/layout/separator-span-support-20260902/wechat-original-filtered.png
```

`wechat_original.png` 不仅没有逐 separator ground truth，还被确认含第三方录音界面重叠，因此不得据此声称 WeChat 主边界保留、碎片化改善或 real-app precision。当前可接受证据只包括 deterministic synthetic、带 ground truth 的 simple/mock fixture，以及干净 Calculator/legacy screenshot 上的无崩溃与结构差异观察；P1 的 complex/text-heavy real-app acceptance 仍待干净 fixture。

## Runtime API gate

`tests/runtime-api/unit/vision-layout.test.js` 通过 JavaScript 调用 `Vision.analyzeLayout`，并断言 `minSeparatorSpanRatio` 被当前 Runtime 解析和回传。

```text
OPENDESK_RUNTIME_API_RUN_ID=20260902T-layout-span-support-final ./scripts/test_runtime_apis.sh unit
418 passed / 0 failed
.runtime/tests/runtime-api/20260902T-layout-span-support-final/
```

## Performance comparison

```bash
go test ./automation -run '^$' -bench '^BenchmarkAnalyzeLayoutSeparatorSpanFilter$' -benchtime=20x -count=3 -benchmem
```

Intel macOS runner 上，关闭 gate 为 `12.27-12.90 ms/op`，默认 gate 为 `11.77-13.18 ms/op`；两组约 `3.487 MB/op`、`269,569-269,572 allocs/op`。当前测量噪声内没有可辨认的性能或内存回归。

## Package regression

- `go test ./automation -count=1`：passed；
- `go test ./... -count=1`：本项涉及的包和其余包通过，`pkg/visionrun` 仍为已知 4 个 fixture/real-input 基线失败：`TestRunValidateModeAutoUsesLatestRealReport`、`TestRunSendModeRecordsExecuteSendStageWhenSendAllowedWouldBeReached`、`TestRunSendSafetyRemainsBlockedWithoutDraftEvidence`、`TestGoldenEnvironmentSimilarityIsReportedWithZoneBreakdown`。这些失败分别缺少 `.runtime` real validation/capture/preflight 输入，不归因于本次 layout 变更。

## Limits

- 连续 span 是相对于当前递归区域的目标轴；局部区域内部真正连续的视觉边界仍可能保留；
- 本项不包含 P2 adaptive threshold 或 P3 multi-scale validation；
- 未标注真实截图仍需要未来独立 ground-truth 标注，才能报告严格 precision/recall。
