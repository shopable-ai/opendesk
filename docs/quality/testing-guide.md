# Layout Improvement Testing Guide

本文档说明如何测试和验证 layout separator 精度改进。

## 改进概述

我们对桌面窗口 layout 识别算法进行了两项核心改进：

1. **Cell 颜色计算改用 Median 模式**：使用中位数而不是算术平均值，降低文字像素对 cell 颜色的影响
2. **Boundary Score 使用 Multi-span 对比**：考虑两侧区域的平均颜色对比，而不只是相邻 cell 的差异

## 新增参数

### cellColorMode

- **类型**: `string`
- **可选值**: `"mean"` | `"median"` | `"trimmed"` | `"dominant"`
- **默认值**: `"median"`
- **说明**:
  - `mean`: 算术平均（原有方法，更快但对文字噪声敏感）
  - `median`: 中位数（默认，对文字/前景噪声更鲁棒）

### boundarySpanWidth

- **类型**: `int`
- **范围**: 1-8
- **默认值**: 3
- **说明**: 定义在计算区域级颜色对比时，两侧各考虑多少个 cell

## 测试脚本

### 1. 快速微信测试 (推荐首先运行)

```bash
node examples/wechat_quick_test.js
```

**功能**:
- 对比 median 和 mean 模式的效果
- 生成对比图像和详细报告
- 快速验证改进是否有效

**输出**:
- `temp/wechat_quick_test_source.png` - 原始截图
- `temp/wechat_quick_test_median.png` - median 模式标注图
- `temp/wechat_quick_test_mean.png` - mean 模式标注图
- `temp/wechat_quick_test_report.json` - 详细对比报告

### 2. 单应用测试

```bash
# 测试微信
node examples/test_layout_improvement.js wechat

# 测试 VS Code
node examples/test_layout_improvement.js vscode

# 测试 Chrome
node examples/test_layout_improvement.js chrome

# 测试 Safari
node examples/test_layout_improvement.js safari

# 测试 Finder
node examples/test_layout_improvement.js finder

# 测试所有应用
node examples/test_layout_improvement.js all
```

**功能**:
- 测试指定应用的 layout 识别
- 生成标注图像和统计报告
- 分析 separator 质量（confidence 分布）

**输出**:
- `temp/layout_test/{app}_source.png` - 原始截图
- `temp/layout_test/{app}_annotated.png` - 标注图
- `temp/layout_test/{app}_report.json` - 详细报告
- `temp/layout_test/summary.json` - 汇总报告

### 3. 持续测试（长时间运行）

```bash
node examples/continuous_layout_test.js
```

**功能**:
- 持续测试多个应用
- 对比 median 和 mean 模式
- 记录每次迭代的改进效果
- 生成累积统计报告

**配置**:
```javascript
const CONFIG = {
  testInterval: 60000,    // 测试间隔（毫秒）
  maxIterations: 100,     // 最大迭代次数（0 = 无限）
  apps: ['wechat', 'vscode', 'chrome', 'safari', 'finder'],
};
```

**输出**:
- `temp/continuous_test/iteration_XXXX.json` - 每次迭代的结果
- `temp/continuous_test/summary.json` - 累积统计
- `temp/continuous_test/{app}_{mode}_{timestamp}.png` - 每次测试的截图

## 使用示例

### 在 JS 代码中使用新参数

```javascript
const layout = await ImageColor.analyzeLayout(imageBase64, {
  cellSize: 10,
  quantize: 16,
  tolerance: 32,
  minRegionArea: 6,
  cellColorMode: 'median',      // 使用 median 模式
  boundarySpanWidth: 3,         // 使用 3-cell span
});
```

### 对比不同模式

```javascript
// 测试 median 模式
const medianLayout = await ImageColor.analyzeLayout(imageBase64, {
  cellColorMode: 'median',
  boundarySpanWidth: 3,
});

// 测试 mean 模式（原有方法）
const meanLayout = await ImageColor.analyzeLayout(imageBase64, {
  cellColorMode: 'mean',
  boundarySpanWidth: 1,
});

// 对比 confidence
const medianAvgConf = medianLayout.separators.vertical
  .reduce((sum, sep) => sum + sep.confidence, 0) / medianLayout.separators.vertical.length;
const meanAvgConf = meanLayout.separators.vertical
  .reduce((sum, sep) => sum + sep.confidence, 0) / meanLayout.separators.vertical.length;

console.log(`Improvement: ${((medianAvgConf - meanAvgConf) * 100).toFixed(1)}%`);
```

## 验收标准

### Hard Gate (必须通过)

- [x] `go test ./automation` 全部通过
- [x] `go build` 无错误
- [x] `TestLayoutWithTextNoise` 测试通过
- [ ] 真实微信窗口 4 条主 separator 至少 3 条准确
- [x] 代码无 app-specific 硬编码

### Soft Gate (应该达到)

- [ ] 主要 separator 的 confidence > 0.55
- [ ] Separator 位置误差 < 15px
- [ ] 处理时间增加 < 30%

## 预期改进效果

根据设计目标，median 模式相比 mean 模式应该有以下改进：

1. **Confidence 提升**: 平均 confidence 提升 10-20%
2. **高置信度 separator 增加**: confidence ≥ 0.55 的 separator 数量增加
3. **位置更准确**: separator 更贴近色块边界而不是文字边缘
4. **稳定性提升**: 在文字密集区域表现更稳定

## 故障排查

### 测试脚本找不到应用窗口

确保应用已经打开并且窗口可见。脚本会搜索包含特定关键词的窗口：
- WeChat: `wechat`, `微信`
- VS Code: `code`, `visual studio code`, `vscode`
- Chrome: `chrome`, `google chrome`
- Safari: `safari`
- Finder: `finder`

### Confidence 没有提升

可能的原因：
1. 应用窗口背景色块不明显
2. 文字密度不高，mean 模式已经足够好
3. 参数需要调整（尝试不同的 `boundarySpanWidth`）

### 性能问题

median 计算比 mean 慢约 20-30%。如果性能是瓶颈：
1. 减小 `cellSize`（但会降低精度）
2. 使用 `mean` 模式作为 fallback
3. 只在关键场景使用 `median` 模式

## 相关文档

- `docs/layout_improvement_analysis.md` - 问题分析和方案评分
- `docs/layout_improvement_prompt.md` - 详细实施指南
- `docs/layout_improvement_implementation.md` - 实施记录
- `types/ImageColor.d.ts` - TypeScript 类型定义

## 反馈和改进

如果发现问题或有改进建议，请记录在 `docs/layout_improvement_results.md` 中。
