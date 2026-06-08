# Layout Separator 精度改进 - 子Agent实施提示词

## 任务目标

改进 `testMonkey-go` 项目的桌面窗口 layout 识别精度，让 separator 更贴近真实色块边界，而不是文字边缘。

## 背景上下文

**项目**: Go + goja JS runtime 的桌面自动化框架
**当前问题**: separator 倾向于贴着文字边缘，而不是背景色块分界
**根本原因**: Cell 颜色使用简单平均值，文字像素主导了 cell 颜色表达

**架构约束**:
- Go core 只做通用图像分割，不允许写死 app-specific 规则
- JS 层负责传 hints 和语义映射
- 必须保持 API 向后兼容

## 核心改进策略

### 1. Cell 颜色计算改进（最关键）

**当前实现** (`image_layout.go:257-291`):
```go
// 简单算术平均
for y := startY; y < endY; y++ {
    for x := startX; x < endX; x++ {
        r, g, b, _ := img.At(x, y).RGBA()
        sumR += int(r >> 8)
        sumG += int(g >> 8)
        sumB += int(b >> 8)
        count++
    }
}
grid[gy][gx] = layoutCell{
    R: uint8(sumR/count),
    G: uint8(sumG/count),
    B: uint8(sumB/count),
}
```

**改进方案**:
```go
// 新增参数
type layoutAnalyzeOptions struct {
    // ... 现有字段
    CellColorMode string  // "mean" | "median" | "trimmed" | "dominant"
}

// 新增函数
func computeCellColorRobust(pixels []color.Color, mode string, quantize int) layoutCell {
    switch mode {
    case "median":
        return computeCellColorMedian(pixels, quantize)
    case "trimmed":
        return computeCellColorTrimmed(pixels, quantize, 0.1) // 去除 10% 极值
    case "dominant":
        return computeCellColorDominant(pixels, quantize)
    default:
        return computeCellColorMean(pixels, quantize)
    }
}

func computeCellColorMedian(pixels []color.Color, quantize int) layoutCell {
    rs := make([]uint8, 0, len(pixels))
    gs := make([]uint8, 0, len(pixels))
    bs := make([]uint8, 0, len(pixels))

    for _, p := range pixels {
        r, g, b, _ := p.RGBA()
        rs = append(rs, uint8(r>>8))
        gs = append(gs, uint8(g>>8))
        bs = append(bs, uint8(b>>8))
    }

    return layoutCell{
        R: quantizeColor(medianUint8(rs), quantize),
        G: quantizeColor(medianUint8(gs), quantize),
        B: quantizeColor(medianUint8(bs), quantize),
    }
}

func medianUint8(values []uint8) uint8 {
    if len(values) == 0 {
        return 0
    }
    sorted := make([]uint8, len(values))
    copy(sorted, values)
    sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })
    return sorted[len(sorted)/2]
}
```

**修改位置**:
- `buildLayoutGrid()` 函数改为收集像素后调用 `computeCellColorRobust()`
- 默认 `CellColorMode: "median"`

### 2. Boundary Score 改进（次关键）

**当前实现** (`image_layout.go:748-776`):
```go
// 只比较相邻 cell
for y := rect.MinY; y < rect.MaxY; y++ {
    dist := layoutCellDistance(grid[y][x], grid[y][x-1])
    if labels[y][x] != labels[y][x-1] || dist >= 10 {
        changeCount++
    }
    distSum += dist
    sampleCount++
}
```

**改进方案**:
```go
// 新增参数
type layoutAnalyzeOptions struct {
    // ... 现有字段
    BoundarySpanWidth int  // 默认 3，表示两侧各看 3 个 cell
}

// 修改函数
func computeFloodVerticalBoundaryScores(labels [][]int, grid [][]layoutCell, rect layoutGridRect, spanWidth int) []boundaryScore {
    out := make([]boundaryScore, 0, layoutMaxInt(0, rect.Width()-1))

    for x := rect.MinX + 1; x < rect.MaxX; x++ {
        // 计算两侧区域的平均颜色
        leftColor := computeRegionAverageColor(grid, rect, x-spanWidth, x, "vertical")
        rightColor := computeRegionAverageColor(grid, rect, x, x+spanWidth, "vertical")

        // 计算区域级对比
        regionContrast := layoutCellDistance(leftColor, rightColor)

        // 计算支持度（多少行上有明显变化）
        changeCount := 0
        distSum := 0.0
        sampleCount := 0

        for y := rect.MinY; y < rect.MaxY; y++ {
            dist := layoutCellDistance(grid[y][x], grid[y][x-1])
            if labels[y][x] != labels[y][x-1] || dist >= 10 {
                changeCount++
            }
            distSum += dist
            sampleCount++
        }

        if sampleCount == 0 {
            continue
        }

        ratio := float64(changeCount) / float64(sampleCount)
        avgDist := distSum / float64(sampleCount)

        // 新的评分公式：增加区域对比权重
        score := ratio*0.50 +
                 layoutClampFloat(avgDist/72.0, 0, 1)*0.20 +
                 layoutClampFloat(regionContrast/72.0, 0, 1)*0.30

        out = append(out, boundaryScore{
            Pos:          x,
            Score:        score,
            SupportRatio: ratio,
            Contrast:     avgDist,
            Orientation:  "vertical",
        })
    }
    return out
}

func computeRegionAverageColor(grid [][]layoutCell, rect layoutGridRect, startX, endX int, orientation string) layoutCell {
    startX = layoutClampInt(startX, rect.MinX, rect.MaxX-1)
    endX = layoutClampInt(endX, rect.MinX+1, rect.MaxX)

    var sumR, sumG, sumB, count int
    for y := rect.MinY; y < rect.MaxY; y++ {
        for x := startX; x < endX; x++ {
            sumR += int(grid[y][x].R)
            sumG += int(grid[y][x].G)
            sumB += int(grid[y][x].B)
            count++
        }
    }

    if count == 0 {
        return layoutCell{}
    }

    return layoutCell{
        R: uint8(sumR / count),
        G: uint8(sumG / count),
        B: uint8(sumB / count),
    }
}
```

**修改位置**:
- `computeFloodVerticalBoundaryScores()` 和 `computeFloodHorizontalBoundaryScores()`
- 传入 `opts.BoundarySpanWidth` 参数
- 默认值 `BoundarySpanWidth: 3`

### 3. 测试扩展

**新增测试用例** (`image_layout_test.go`):
```go
func TestLayoutWithTextNoise(t *testing.T) {
    tmpDir := t.TempDir()
    imagePath := filepath.Join(tmpDir, "layout_with_text.png")
    makeSyntheticLayoutImageWithText(t, imagePath)

    ic := NewImageColor()
    imageBase64, err := ic.LoadBase64(imagePath)
    if err != nil {
        t.Fatalf("LoadBase64 failed: %v", err)
    }

    result, err := ic.AnalyzeLayout(imageBase64, map[string]interface{}{
        "cellSize":          8,
        "quantize":          16,
        "tolerance":         32,
        "minRegionArea":     4,
        "minSeparatorScore": 0.08,
        "cellColorMode":     "median",  // 使用新模式
        "boundarySpanWidth": 3,
    })
    if err != nil {
        t.Fatalf("AnalyzeLayout failed: %v", err)
    }

    vertical, horizontal := mustTestSeparators(t, result["separators"])

    // 验证 separator 仍然在色块边界附近，而不是文字边缘
    assertSeparatorNear(t, vertical, 80, 10)  // 允许 ±10px 误差
    assertSeparatorNear(t, vertical, 280, 10)

    // 验证 confidence 足够高
    for _, sep := range vertical {
        if sep.Position == 80 || sep.Position == 280 {
            if sep.Confidence < 0.5 {
                t.Errorf("separator at %d has low confidence: %.2f", sep.Position, sep.Confidence)
            }
        }
    }
}

func makeSyntheticLayoutImageWithText(t *testing.T, path string) {
    t.Helper()
    img := image.NewRGBA(image.Rect(0, 0, 640, 480))

    // 背景色块（和原测试一样）
    fillRect(img, image.Rect(0, 0, 80, 480), color.RGBA{52, 52, 52, 255})
    fillRect(img, image.Rect(80, 0, 280, 480), color.RGBA{237, 237, 237, 255})
    fillRect(img, image.Rect(280, 0, 640, 72), color.RGBA{249, 249, 249, 255})
    fillRect(img, image.Rect(280, 72, 640, 352), color.RGBA{255, 255, 255, 255})
    fillRect(img, image.Rect(280, 352, 640, 480), color.RGBA{246, 246, 246, 255})

    // 分隔线
    fillRect(img, image.Rect(79, 0, 81, 480), color.RGBA{205, 205, 205, 255})
    fillRect(img, image.Rect(279, 0, 281, 480), color.RGBA{214, 214, 214, 255})

    // 关键：在各区域添加文字噪声
    // 左侧区域（深色背景）- 添加浅色文字
    for y := 40; y < 440; y += 32 {
        for x := 10; x < 70; x += 8 {
            fillRect(img, image.Rect(x, y, x+6, y+12), color.RGBA{180, 180, 180, 255})
        }
    }

    // 中间区域（浅色背景）- 添加深色文字
    for y := 40; y < 440; y += 28 {
        for x := 100; x < 260; x += 10 {
            fillRect(img, image.Rect(x, y, x+8, y+14), color.RGBA{60, 60, 60, 255})
        }
    }

    // 右侧区域 - 添加文字
    for y := 100; y < 340; y += 24 {
        for x := 300; x < 600; x += 12 {
            fillRect(img, image.Rect(x, y, x+10, y+16), color.RGBA{80, 80, 80, 255})
        }
    }

    file, err := os.Create(path)
    if err != nil {
        t.Fatalf("create image failed: %v", err)
    }
    defer file.Close()
    if err := png.Encode(file, img); err != nil {
        t.Fatalf("encode image failed: %v", err)
    }
}
```

### 4. 参数默认值调整

**修改** `parseLayoutAnalyzeOptions()`:
```go
func parseLayoutAnalyzeOptions(options interface{}) layoutAnalyzeOptions {
    out := layoutAnalyzeOptions{
        CellSize:               10,
        Quantize:               16,
        Tolerance:              32,
        MinRegionArea:          4,
        MaxRegions:             24,
        MaxDepth:               6,
        MinSplitSpan:           4,
        MinSeparatorScore:      0.14,
        MaxSeparatorCandidates: 8,
        CellColorMode:          "median",  // 新增，默认 median
        BoundarySpanWidth:      3,         // 新增，默认 3
    }
    // ... 解析逻辑
    if value, ok := optMap["cellColorMode"]; ok {
        mode := strings.ToLower(strings.TrimSpace(fmt.Sprintf("%v", value)))
        if mode == "mean" || mode == "median" || mode == "trimmed" || mode == "dominant" {
            out.CellColorMode = mode
        }
    }
    if value, ok := optMap["boundarySpanWidth"]; ok {
        out.BoundarySpanWidth = layoutClampInt(jsToInt(value), 1, 8)
    }
    return out
}
```

## 实施步骤

### Step 1: 实现 Cell 颜色改进（60分钟）

1. 在 `layoutAnalyzeOptions` 中添加 `CellColorMode` 字段
2. 实现 `computeCellColorMedian()` 函数
3. 实现 `medianUint8()` 辅助函数
4. 修改 `buildLayoutGrid()` 使用新函数
5. 更新 `parseLayoutAnalyzeOptions()` 解析新参数
6. 运行 `go test ./automation -v` 确保现有测试通过

### Step 2: 实现 Boundary Score 改进（60分钟）

1. 在 `layoutAnalyzeOptions` 中添加 `BoundarySpanWidth` 字段
2. 实现 `computeRegionAverageColor()` 函数
3. 修改 `computeFloodVerticalBoundaryScores()` 使用区域对比
4. 修改 `computeFloodHorizontalBoundaryScores()` 使用区域对比
5. 调整 score 计算公式权重
6. 运行 `go test ./automation -v` 确保现有测试通过

### Step 3: 扩展测试（45分钟）

1. 添加 `TestLayoutWithTextNoise` 测试用例
2. 实现 `makeSyntheticLayoutImageWithText()` 函数
3. 运行新测试，验证改进效果
4. 如果测试失败，调整参数和权重

### Step 4: 真实场景验证（45分钟）

1. 运行 `examples/mac/wechat_region_map.js`
2. 检查生成的 `temp/mac/wechat_region_map_annotated.png`
3. 对比 separator 位置是否更贴近色块边界
4. 检查 `temp/mac/wechat_region_map_latest.json` 中的 confidence 值
5. 如果不理想，调整 `cellColorMode` 或 `boundarySpanWidth`

### Step 5: 文档和清理（30分钟）

1. 更新 `types/ImageColor.d.ts` 添加新参数类型定义
2. 创建 `docs/layout_improvement_implementation.md` 记录实施细节
3. 创建 `docs/layout_improvement_results.md` 记录验证结果
4. 提交代码前运行完整测试套件

## 验收标准

### 必须通过（Hard Gate）
- [ ] `go test ./automation` 全部通过
- [ ] `go build` 无错误无警告
- [ ] `TestLayoutWithTextNoise` 测试通过
- [ ] 真实微信窗口的 4 条主 separator 中至少 3 条准确（目视检查）
- [ ] 代码中无 app-specific 硬编码（如 "wechat", "toolbar" 等业务术语）

### 应该达到（Soft Gate）
- [ ] 主要 separator 的 confidence > 0.55
- [ ] Separator 位置误差 < 15px（相比手工标注）
- [ ] 处理时间增加 < 30%（benchmark 对比）
- [ ] 新增代码有注释说明

## 错误处理

### 如果测试失败
1. 检查 `medianUint8()` 实现是否正确
2. 检查 `computeRegionAverageColor()` 边界条件
3. 尝试调整 score 公式权重
4. 尝试不同的 `cellColorMode`（median/trimmed）

### 如果性能下降过多
1. 使用 `go test -bench` 定位瓶颈
2. 优化 median 计算（可以用 quick-select）
3. 减小 `boundarySpanWidth`
4. 考虑只在关键位置使用 robust 模式

### 如果真实场景效果不佳
1. 保存 before/after 的 annotated image 对比
2. 检查 JSON 中的 debug 信息
3. 尝试调整 `quantize` 参数
4. 考虑增加 `tolerance` 参数

## 输出产物

### 代码文件
- `automation/image_layout.go` (修改约 150 行)
- `automation/image_layout_test.go` (新增约 80 行)
- `types/ImageColor.d.ts` (新增 2 个参数定义)

### 测试产物
- `temp/mac/wechat_region_map_source.png`
- `temp/mac/wechat_region_map_annotated.png`
- `temp/mac/wechat_region_map_latest.json`

### 文档
- `docs/layout_improvement_implementation.md`
- `docs/layout_improvement_results.md`

## 注意事项

1. **保持向后兼容**: 新参数都是可选的，默认值应该让现有代码无需修改即可工作
2. **不要过度优化**: 先让基本功能工作，再考虑性能优化
3. **充分测试**: 每个步骤完成后都要运行测试
4. **记录决策**: 如果调整了参数或权重，在注释中说明原因
5. **保持通用**: 不要为了微信场景而牺牲通用性

## 时间预算

- Step 1: 60 分钟
- Step 2: 60 分钟
- Step 3: 45 分钟
- Step 4: 45 分钟
- Step 5: 30 分钟
- **总计**: 4 小时

如果超时，优先完成 Step 1-3，Step 4-5 可以后续补充。
