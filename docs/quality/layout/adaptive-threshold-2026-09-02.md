# Layout Adaptive Threshold Evidence

日期：2026-09-02

## Audit / Decision

源码已用 `mean + stdDev * 0.3`、`percentile75 * 0.9` 与 `minSeparatorScore` 的最大值计算候选阈值，但行为始终开启、没有正式策略参数，也没有输出计算依据。P2 因此判定为 **Extend / Integrate**：保留单一现有公式，新增 fixed baseline 和逐区域 debug contract，不重写第二套自适应算法。

## Implemented contract

- `separatorThresholdMode: "adaptive" | "fixed"`，默认 `adaptive`；
- adaptive 继续使用当前区域、当前方向的候选 score 分布；
- fixed 始终应用 `minSeparatorScore`，同时计算 adaptive 值供对照；
- `debug.thresholds[]` 在无候选时也记录方向、递归深度、grid rect 和完整统计；
- 导出候选的 `meta.threshold` 与 debug trace 使用同一计算结果；
- 没有应用名称、固定坐标、OCR 假设或应用专用常量。

## Deterministic comparison

`TestLayoutAdaptiveThresholdFiltersWeakCandidateAndExportsEvidence` 构造高 score/低 support 的背景噪声、一个弱有效候选和一个强有效候选：

| Mode | Applied rule | Selected candidates |
| --- | --- | ---: |
| `fixed` | `minSeparatorScore=0.08` | 2（weak + strong） |
| `adaptive` | candidate distribution threshold | 1（strong） |

两种模式计算出的 `adaptiveThreshold` 完全相同；差异只来自最终采用 fixed floor 还是 adaptive 值，因此对照没有混入其它变量。

## Current-source JavaScript fixture evidence

从仓库根目录执行：

```bash
go run ./cmd/opendesk -script .runtime/tests/layout/adaptive-threshold-20260902/probe.js
```

成功运行：`.runtime/runs/direct-20260902-165037-390000/`

| Tracked fixture | Root fixed -> adaptive threshold | Result |
| --- | --- | --- |
| `simple_wechat.png` | V/H `0.14 -> 0.14` | 两种模式 precision/recall 均 `1.0/1.0`，5 regions |
| `mock_wechat.png` | V/H `0.14 -> 0.14` | 两种模式 precision/recall 均 `0.5/0.5`，无改善也无回归 |
| `wechat_original.png` | V `0.14 -> 0.171`; H `0.14 -> 0.191` | **不纳入验收**：中央含第三方录音界面重叠；仅证明 debug 数值可输出 |
| Calculator screenshot | V `0.14 -> 0.196`; H `0.14 -> 0.174` | 两种模式均 3 root candidates / 4 regions |
| legacy desktop screenshot | V `0.14 -> 0.14`; H `0.14 -> 0.14003` | 两种模式均 4 root candidates / 23 regions |

以下图片仅是 contaminated-input 诊断产物，不是视觉 Evidence：

```text
.runtime/tests/layout/adaptive-threshold-20260902/wechat-original-fixed.png
.runtime/tests/layout/adaptive-threshold-20260902/wechat-original-adaptive.png
```

`wechat_original.png` 被确认含第三方录音界面重叠，不能用于判断 WeChat 布局、模式优劣或 real-app precision。当前 P2 只由 deterministic weak/strong candidate 对照、带 ground truth 的 simple/mock fixture，以及干净 Calculator screenshot 的 threshold trace 支撑；clean complex/text-heavy real-app acceptance 仍待补齐。

## Runtime API and package gates

- `OPENDESK_RUNTIME_API_RUN_ID=20260902T-layout-adaptive-retry2 ./scripts/test_runtime_apis.sh unit`：`418 passed / 0 failed`，证据在 `.runtime/tests/runtime-api/20260902T-layout-adaptive-retry2/`；
- 前两次正式 gate 各为 `417/418`，唯一失败均是 `mouse.move accepts a no-displacement move` 期间鼠标被外部并发移动；两次 Layout 测试都通过，失败运行分别保存在 `20260902T-layout-adaptive-final/` 和 `20260902T-layout-adaptive-retry/`，没有改写成成功；
- `go test ./automation -count=1`：passed；
- `BenchmarkAnalyzeLayoutSeparatorThresholdMode`（20x，3 次）：fixed `11.50-11.62 ms/op`，adaptive `11.60-11.78 ms/op`；两组约 `3.500 MB/op`、`269,677-269,678 allocs/op`，测量噪声内无可辨认回归；
- `go test ./... -count=1`：除已知 `pkg/visionrun` 4 个缺少 `.runtime` real-input/fixture 的基线失败外，本次还遇到一次 `pkg/execution` Native Extension privacy 测试超时；该测试随后用相同当前源码聚焦重跑通过，判定为瞬时超时，不归因于 Layout 变更。

## Limits

- 自适应只基于候选 score 分布，不理解 OCR 文本、控件语义或交互价值；
- 当 candidate distribution 的统计值不高于 `minSeparatorScore` 时，adaptive 与 fixed 行为相同；
- 当前缺少无第三方窗口重叠、带期望边界的 complex/text-heavy real-app fixture，因此任务状态保持 `IN_PROGRESS`；
- 本项不包含 P3 multi-scale validation。
