# Layout Recognition

本文件描述 OpenDesk 当前桌面窗口布局识别实现。实现事实以 `automation/image_layout.go` 和当前测试为最终依据；正式质量报告保存在 `docs/quality/layout/`，研究过程保存在 `docs/research/layout/`。

## 当前实现

`ImageColor.analyzeLayout` 的主流程为：

```text
image
-> parse options
-> build layout grid
-> flood-fill regions
-> merge small regions
-> score boundary candidates
-> build split tree
-> deduplicate / filter separators
-> export regions + separators + debug evidence
```

核心代码：

```text
automation/image_layout.go
```

## 当前默认参数

当前源码 `parseLayoutAnalyzeOptions()` 的关键默认值：

| 参数 | 默认值 | 说明 |
|---|---:|---|
| `cellSize` | `10` | 网格 cell 大小 |
| `quantize` | `16` | 颜色量化 |
| `tolerance` | `32` | flood-fill 容差 |
| `minRegionArea` | `4` | 最小区域 |
| `maxRegions` | `24` | 最大区域数 |
| `maxDepth` | `6` | split tree 最大深度 |
| `minSplitSpan` | `4` | 最小分割跨度 |
| `minSeparatorScore` | `0.14` | separator 最低评分 |
| `minSeparatorSpanRatio` | `0.30` | separator 在目标轴上的最小连续支撑覆盖率 |
| `separatorThresholdMode` | `adaptive` | 候选阈值策略；可设为 `fixed` |
| `maxSeparatorCandidates` | `8` | 候选上限 |
| `cellColorMode` | `median` | 默认使用中位数颜色 |
| `boundarySpanWidth` | `3` | 边界两侧区域对比跨度 |

## Cell Color Mode

解析层接受：

```text
mean
median
trimmed
dominant
```

当前真正具有独立实现的是：

- `median`：调用 `computeCellColorMedian()`；
- 其他模式当前在 `buildLayoutGrid()` 中走 mean fallback。

因此，`trimmed` / `dominant` 目前只是可接受的配置值，**不能宣传为已实现的独立算法**。

### Median

Median 对文本/前景离群像素更稳健。当前实现分别计算 R/G/B 中位数，再进行颜色量化。

### Mean fallback

非 `median` 模式当前使用算术平均实现，用于兼容和对照。

## Multi-Span Boundary Detection

`boundarySpanWidth` 范围为 `1-8`，默认 `3`。

每个候选边界同时考虑：

- local support ratio；
- 相邻 cell 的 local contrast；
- 边界两侧多 cell 区域的 region contrast。

当前 vertical / horizontal boundary 的评分公式一致：

```text
score = supportRatio * 0.40
      + normalizedLocalContrast * 0.25
      + normalizedRegionContrast * 0.35
```

这比早期只依赖相邻 cell 的评分更能抑制文字边缘产生的伪 separator。

## Adaptive Separator Threshold

默认 `separatorThresholdMode=adaptive`。每个递归区域、每个方向独立从经过平滑的候选 score 分布计算：

```text
adaptiveThreshold = clamp(
  max(minSeparatorScore, mean + stdDev * 0.3, percentile75 * 0.9),
  minSeparatorScore,
  0.9
)
```

`fixed` 模式始终应用 `minSeparatorScore`，但仍计算并输出 adaptive 对照值。这样可以在相同输入上做确定性 baseline，而不是用另一套脚本复制阈值逻辑。

`debug.thresholds[]` 对每个递归区域和方向输出：

- `orientation` / `depth` / `gridRect`；
- `sampleCount` / `minScore`；
- `mean` / `stdDev` / `percentile75`；
- `adaptiveThreshold` / `appliedThreshold` / `mode`。

被导出的候选还会在 `meta.threshold` 保留同一份计算证据。

## Continuous Support Span

boundary score 除总支撑密度 `supportRatio` 外，还计算候选在目标轴上的最长连续有效支撑区间：

```text
supportSpanRatio = longestContinuousSupportedCells / targetAxisCells
```

vertical candidate 在 Y 轴上计算，horizontal candidate 在 X 轴上计算。为吸收边界一格内的量化偏移，候选平滑窗口采用邻近位置中最强的连续支撑区间；这不会把分散的多个短文字行合并成一条长边界。

默认 `minSeparatorSpanRatio=0.30`，在 split-tree candidate filtering 阶段生效，因此不满足覆盖率的候选不会继续改变区域树。设为 `0` 可以关闭这一项，用于与旧基线对照。每个导出的 candidate/separator meta 包含：

- `supportSpanRatio`：相对当前目标区域轴长的连续覆盖率；
- `supportSpan.start/end`：对应原图像素区间；
- `supportRatio`：原有总支撑密度，语义不变。

## 输出

核心输出包括：

- `width` / `height`；
- grid 参数；
- `regions`；
- `separators`；
- `floodRegions`；
- `warnings`；
- debug：separator hints、root candidates、split tree。

若没有 separator 通过阈值，当前实现会返回单一 coarse region，并写入 warning。

## 使用示例

```javascript
const layout = await ImageColor.analyzeLayout(imageBase64, {
  cellSize: 10,
  quantize: 16,
  tolerance: 32,
  cellColorMode: "median",
  boundarySpanWidth: 3,
  minSeparatorScore: 0.14,
  minSeparatorSpanRatio: 0.30,
  separatorThresholdMode: "adaptive",
});
```

如需与旧行为对照，可显式指定：

```javascript
{
  cellColorMode: "mean"
}
```

## 设计约束

- Go core 保持通用，不写死 WeChat、toolbar 等应用语义；
- 应用语义、hints 与动作映射位于更高层；
- layout 只是结构证据之一，不应单独决定高风险动作；
- 参数、算法行为和默认值必须以当前源码为准，而不是沿用历史实验文档。

## 已知限制

- `trimmed` / `dominant` 尚无独立计算实现；
- median 计算当前使用排序，存在进一步优化空间；
- 连续 span 过滤不会消除在局部递归区域内仍形成长边界的所有 false positives；
- adaptive threshold 只基于当前区域的候选 score 分布，不理解 OCR 文本或应用语义；
- layout 输出需要和语义、OCR、actionability、replay evidence 联合使用。

## 验证

基础代码验证：

```bash
go test ./automation
```

历史验证与实验结果：

```text
docs/quality/layout/algorithm-validation-report.md
docs/quality/layout/progressive-test-results.md
docs/quality/layout/real-app-test-results.md
docs/quality/layout/layout-improvement-results.md
```

历史结果是实验快照，不覆盖当前源码事实。

## 相关文档

```text
docs/research/layout/layout-improvement-analysis.md
docs/research/layout/parameter-tuning-analysis.md
docs/plans/layout/layout-improvement-plan.md
docs/quality/testing-guide.md
```
