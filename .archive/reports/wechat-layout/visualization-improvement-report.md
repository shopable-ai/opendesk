# 可视化改进报告

## 问题描述

用户反馈原始可视化存在以下问题：

1. **分隔线绘制错误**：画的是完整的从左到右/从上到下的线条，但实际识别的分隔符应该有具体的起始和结束位置
2. **区域显示不准确**：使用填充整个区域的大块颜色，但实际识别的区域应该只显示边框
3. **缺少边界框可视化**：应该用不同颜色的矩形框来显示每个识别出的区域
4. **重叠处理**：当多个矩形边缘重叠时，需要增加偏移或宽度来区分

## 改进方案

### 1. 创建新的可视化工具 (`visualize_improved.go`)

**主要改进：**

- **区域边框绘制** (`drawRegionBorders`)
  - 只画边框，不填充整个区域
  - 每个区域使用不同的颜色（8种鲜明颜色）
  - 处理重叠：为每个区域添加 0/2/4 像素的偏移
  - 边框厚度：3像素

- **分隔符绘制** (`drawSeparatorsWithBounds`)
  - 使用实际的 `start` 和 `end` 位置
  - 如果没有指定，则使用整个宽度/高度作为默认值
  - 绿色 = 正确检测，红色 = 误检测
  - 线条厚度：3像素

- **区域标签** (`drawRegionLabelsImproved`)
  - 标签背景使用与边框相同的颜色（半透明）
  - 标签边框使用与区域边框相同的颜色
  - 文字使用黑色，确保可读性

### 2. 数据结构改进

```go
type SeparatorData struct {
    Position   float64 `json:"position"`
    Start      float64 `json:"start"`      // 新增：起始位置
    End        float64 `json:"end"`        // 新增：结束位置
    Confidence float64 `json:"confidence"`
    IsCorrect  bool    `json:"isCorrect"`
}

type RegionData struct {
    X       int    `json:"x"`
    Y       int    `json:"y"`
    Width   int    `json:"width"`
    Height  int    `json:"height"`
    Label   string `json:"label"`
    Matched bool   `json:"matched"`
}
```

### 3. 颜色方案

**区域颜色（边框）：**
- 红色 (255, 100, 100)
- 绿色 (100, 255, 100)
- 蓝色 (100, 100, 255)
- 黄色 (255, 255, 100)
- 洋红 (255, 100, 255)
- 青色 (100, 255, 255)
- 橙色 (255, 150, 100)
- 紫色 (150, 100, 255)

**分隔符颜色：**
- 绿色 (0, 255, 0) - 正确检测
- 红色 (255, 0, 0) - 误检测

## 测试结果

### Median 模式

**性能指标：**
- 精确率: 33.3%
- 召回率: 25.0%
- F1 分数: 28.6%

**检测结果：**
- 垂直分隔符: 1个（1个正确）
- 水平分隔符: 2个（0个正确）

**可视化文件：** `output/mock_median_improved.png`

### Mean 模式

**性能指标：**
- 精确率: 42.9%
- 召回率: 75.0%
- F1 分数: 54.5%

**检测结果：**
- 垂直分隔符: 2个（1个正确，1个误检）
- 水平分隔符: 5个（2个正确，3个误检）

**识别区域：**
1. ✓ 侧边栏: [0, 0, 60x800]
2. ✗ 聊天列表: [60, 0, 310x800]
3. ✗ 聊天头部: [370, 0, 830x50]
4. ✗ 消息区域: [370, 50, 830x60]
5. ✗ 输入区域: [370, 110, 830x690]

**可视化文件：** `output/mock_mean_improved.png`

## 对比

### 旧版可视化
- 文件大小: ~12KB
- 区域显示: 填充整个区域（半透明覆盖层）
- 分隔符: 完整的线条（从头到尾）
- 重叠处理: 无

### 新版可视化
- 文件大小: ~11KB
- 区域显示: 只画边框（3像素厚）
- 分隔符: 使用实际的起始和结束位置
- 重叠处理: 通过偏移区分重叠的边框
- 颜色方案: 每个区域使用不同的鲜明颜色

## 使用方法

### 1. 生成测试数据

```bash
./testMonkey-go -script tests/wechat/test_with_visualization.js
```

### 2. 生成可视化图片

```bash
cd tests/wechat
go run visualize_improved.go output/mock_wechat.png output/result_median.json
go run visualize_improved.go output/mock_wechat.png output/result_mean.json
```

### 3. 查看结果

```bash
open output/mock_median_improved.png
open output/mock_mean_improved.png
```

## 文件清单

**新增文件：**
- `tests/wechat/visualize_improved.go` - 改进的可视化工具
- `tests/wechat/test_with_visualization.js` - 生成完整测试数据的脚本
- `.runtime/tests/wechat/result_median.json` - Median模式测试结果
- `.runtime/tests/wechat/result_mean.json` - Mean模式测试结果
- `.runtime/tests/wechat/mock_median_improved.png` - Median模式改进可视化
- `.runtime/tests/wechat/mock_mean_improved.png` - Mean模式改进可视化
- `tests/wechat/compare_visualizations.sh` - 对比脚本

**保留文件：**
- `tests/wechat/visualize_test_result.go` - 原始可视化工具（用于对比）
- `.runtime/tests/wechat/mock_median_visualization.png` - 原始可视化（用于对比）
- `.runtime/tests/wechat/mock_mean_visualization.png` - 原始可视化（用于对比）

## 下一步优化建议

1. **提高分隔符检测精度**
   - 增加 `minSeparatorScore` 阈值（从 0.08 提高到 0.15-0.20）
   - 添加长度过滤（只保留跨越整个区域的分隔线）
   - 置信度后处理（过滤低置信度的分隔符）

2. **改进区域识别**
   - 使用更智能的区域识别算法
   - 考虑区域的语义信息（工具栏、侧边栏、内容区等）
   - 添加区域合并和分割逻辑

3. **增强可视化**
   - 添加分隔符置信度的可视化（线条粗细或颜色深浅）
   - 显示区域匹配度（边框样式：实线/虚线）
   - 添加交互式查看功能

## 总结

改进后的可视化工具解决了用户提出的所有问题：

✅ 区域使用不同颜色的边框，而不是填充
✅ 分隔符使用实际的起始和结束位置
✅ 重叠区域通过偏移处理
✅ 标签使用与边框相同的颜色

可视化效果更加清晰，能够准确反映算法的实际识别结果。
