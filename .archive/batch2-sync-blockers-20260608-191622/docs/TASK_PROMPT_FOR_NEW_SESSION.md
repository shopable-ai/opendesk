# Layout Separator 精度改进任务 - 新会话提示词

## 快速启动

```
你是 testMonkey-go 项目的开发者。需要改进桌面窗口 layout 识别精度，让 separator 更贴近真实色块边界而不是文字边缘。

项目路径: /Users/a0000/Documents/workspace/testMonkey-go

请先阅读这两个文档：
1. docs/layout_improvement_analysis.md - 问题分析和方案评分
2. docs/layout_improvement_prompt.md - 详细实施指南

然后按照 5 个步骤执行改进。
```

---

## 核心改进（2个关键点）

### 改进1: Cell 颜色计算改用 Median（最关键）

**当前问题**: `buildLayoutGrid()` 使用简单平均值，文字像素主导了 cell 颜色
```go
// automation/image_layout.go:257-291
sumR += int(r >> 8)
sumG += int(g >> 8)
sumB += int(b >> 8)
grid[gy][gx] = layoutCell{R: uint8(sumR/count), ...}
```

**改进方案**:
1. 新增 `CellColorMode string` 参数到 `layoutAnalyzeOptions`
2. 实现 `computeCellColorMedian()` 函数
3. 实现 `medianUint8()` 辅助函数
4. 修改 `buildLayoutGrid()` 收集像素后调用新函数
5. 默认值设为 `"median"`

**代码示例见**: `docs/layout_improvement_prompt.md` 第1节

### 改进2: Boundary Score 使用区域对比（次关键）

**当前问题**: `computeFloodVerticalBoundaryScores()` 只比较相邻 cell
```go
// automation/image_layout.go:748-776
dist := layoutCellDistance(grid[y][x], grid[y][x-1])
```

**改进方案**:
1. 新增 `BoundarySpanWidth int` 参数（默认3）
2. 实现 `computeRegionAverageColor()` 计算两侧区域平均色
3. 修改 score 公式增加区域对比权重
4. 同时修改 vertical 和 horizontal 两个函数

**代码示例见**: `docs/layout_improvement_prompt.md` 第2节

---

## 5步实施流程

### Step 1: Cell 颜色改进 (60分钟)
- [ ] 修改 `layoutAnalyzeOptions` 结构体
- [ ] 实现 `medianUint8()` 函数
- [ ] 实现 `computeCellColorMedian()` 函数
- [ ] 修改 `buildLayoutGrid()` 使用新函数
- [ ] 修改 `parseLayoutAnalyzeOptions()` 解析新参数
- [ ] 运行 `go test ./automation -v` 验证

### Step 2: Boundary Score 改进 (60分钟)
- [ ] 修改 `layoutAnalyzeOptions` 结构体
- [ ] 实现 `computeRegionAverageColor()` 函数
- [ ] 修改 `computeFloodVerticalBoundaryScores()`
- [ ] 修改 `computeFloodHorizontalBoundaryScores()`
- [ ] 调整 score 公式权重
- [ ] 运行 `go test ./automation -v` 验证

### Step 3: 扩展测试 (45分钟)
- [ ] 添加 `TestLayoutWithTextNoise` 测试用例
- [ ] 实现 `makeSyntheticLayoutImageWithText()` 函数
- [ ] 运行新测试验证改进效果
- [ ] 如失败则调整参数

### Step 4: 真实场景验证 (45分钟)
- [ ] 运行 `node examples/mac/wechat_region_map.js`
- [ ] 检查 `temp/mac/wechat_region_map_annotated.png`
- [ ] 检查 `temp/mac/wechat_region_map_latest.json`
- [ ] 验证 separator 是否更贴近色块边界
- [ ] 验证 confidence 值是否 > 0.55

### Step 5: 文档和清理 (30分钟)
- [ ] 更新 `types/ImageColor.d.ts` 类型定义
- [ ] 创建 `docs/layout_improvement_implementation.md`
- [ ] 创建 `docs/layout_improvement_results.md`
- [ ] 运行完整测试套件

---

## 验收标准（必须全部通过）

### Hard Gate (必须)
- [ ] `go test ./automation` 全部通过
- [ ] `go build` 无错误
- [ ] `TestLayoutWithTextNoise` 测试通过
- [ ] 真实微信窗口 4条主separator 至少3条准确
- [ ] 代码无 app-specific 硬编码

### Soft Gate (应该)
- [ ] 主要 separator 的 confidence > 0.55
- [ ] Separator 位置误差 < 15px
- [ ] 处理时间增加 < 30%

---

## 关键约束

1. **保持通用**: Go core 不允许写死 "wechat"、"toolbar" 等业务术语
2. **向后兼容**: 新参数都是可选的，有合理默认值
3. **充分测试**: 每步完成后都要运行测试
4. **记录决策**: 参数调整要在注释中说明原因

---

## 如果遇到问题

### 测试失败
1. 检查 `medianUint8()` 实现
2. 检查 `computeRegionAverageColor()` 边界条件
3. 尝试调整 score 公式权重
4. 尝试不同 `cellColorMode`

### 性能下降过多
1. 使用 `go test -bench` 定位瓶颈
2. 优化 median 计算（quick-select）
3. 减小 `boundarySpanWidth`

### 真实场景效果不佳
1. 保存 before/after annotated image 对比
2. 检查 JSON debug 信息
3. 调整 `quantize` 或 `tolerance` 参数

---

## 输出产物

### 代码
- `automation/image_layout.go` (修改约150行)
- `automation/image_layout_test.go` (新增约80行)
- `types/ImageColor.d.ts` (新增2个参数)

### 验证
- `temp/mac/wechat_region_map_annotated.png`
- `temp/mac/wechat_region_map_latest.json`

### 文档
- `docs/layout_improvement_implementation.md`
- `docs/layout_improvement_results.md`

---

## 预计时间

- Step 1-2: 2小时（核心改进）
- Step 3: 45分钟（测试）
- Step 4: 45分钟（验证）
- Step 5: 30分钟（文档）
- **总计**: 4小时

---

## 开始执行

现在开始 Step 1，实现 Cell 颜色改进。记住：
1. 先读懂现有代码
2. 小步提交，每步测试
3. 遇到问题参考详细文档
4. 保持代码通用性

Good luck! 🚀
