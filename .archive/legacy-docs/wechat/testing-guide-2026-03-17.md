# WeChat Testing Guide

## Overview

The main WeChat test scripts live in `tests/wechat/`, covering window detection, screenshot capture, and layout analysis.

## Prerequisites

1. **WeChat Desktop App**: Install and login to WeChat desktop application
2. **TestMonkey-go**: Build the project first
   ```bash
   go build -o testmonkey-go .
   ```

## Quick Start

### 1. Quick Screenshot Test (Recommended for first-time users)

Test basic WeChat window detection and screenshot capture:

```bash
./testmonkey-go -script tests/wechat/wechat_screenshot_quick.js
```

**What it does:**
- Finds WeChat window
- Brings it to front
- Takes a screenshot
- Performs quick layout analysis
- Saves to `.runtime/smoke/wechat/quick-screenshot.png`

**Expected output:**
```
🔍 查找微信窗口...
✅ 找到微信: 微信
   大小: 1200x800
   位置: (100, 100)

📸 截取屏幕...
✅ 截图已保存: .runtime/smoke/wechat/quick-screenshot.png

🔬 快速分析...
   检测到 3 个垂直分隔符
   检测到 15 个水平分隔符
   总计 18 个分隔符

✅ 测试完成
```

### 2. Complete Test with Image Generation

Run comprehensive test with annotated images:

```bash
./testmonkey-go -script tests/wechat/wechat_complete_test.js
```

**What it does:**
- Captures WeChat screenshot
- Analyzes layout with both Median and Mean modes
- Generates annotated images showing detected separators
- Generates region visualization images
- Saves comparison results

**Generated files** (in `.runtime/tests/wechat/wechat_test_output/`):
1. `wechat_original.png` - Original screenshot
2. `wechat_annotated_median.png` - Annotated with Median mode separators
3. `wechat_annotated_mean.png` - Annotated with Mean mode separators
4. `wechat_regions_median.png` - Region visualization (Median mode)
5. `wechat_regions_mean.png` - Region visualization (Mean mode)
6. `results_summary.json` - Analysis results summary

**Color coding:**
- 🔴 Red lines = Vertical separators
- 🟢 Green lines = Horizontal separators

### 3. Deep Validation Test

Run detailed validation with parameter comparison:

```bash
./testmonkey-go -script tests/wechat/wechat_deep_validation.js
```

**What it does:**
- Captures WeChat window
- Analyzes with different parameter sets
- Compares Median vs Mean mode results
- Provides detailed statistics

## Test Scripts

### Available Scripts

| Script | Purpose | Output | Use Case |
|--------|---------|--------|----------|
| `tests/wechat/wechat_screenshot_quick.js` | Quick test | Single screenshot | First-time testing |
| `tests/wechat/wechat_complete_test.js` | Full analysis | 5 annotated images | Production use |
| `tests/wechat/wechat_deep_validation.js` | Parameter tuning | Comparison data | Algorithm optimization |
| `examples/check_wechat.js` | Window detection | Console output | Debugging |

### Script Comparison

**Quick Test** (`tests/wechat/wechat_screenshot_quick.js`)
- ⏱️ Fast (~2 seconds)
- 📁 1 file output
- 🎯 Basic validation
- ✅ Good for: Quick checks

**Complete Test** (`tests/wechat/wechat_complete_test.js`)
- ⏱️ Medium (~10 seconds)
- 📁 5 files output
- 🎯 Full analysis with visualizations
- ✅ Good for: Production use, presentations

**Deep Validation** (`tests/wechat/wechat_deep_validation.js`)
- ⏱️ Slow (~15 seconds)
- 📁 Multiple analysis results
- 🎯 Parameter comparison
- ✅ Good for: Algorithm tuning

## Understanding the Results

### Separator Detection

**Vertical Separators** (Red lines):
- Divide the interface into columns
- Example: Sidebar | Chat list | Message area

**Horizontal Separators** (Green lines):
- Divide the interface into rows
- Example: Title bar, message items, input area

### Confidence Scores

Each separator has a confidence score (0.0 - 1.0):
- **> 0.8**: High confidence (strong separator)
- **0.5 - 0.8**: Medium confidence (likely separator)
- **< 0.5**: Low confidence (weak separator)

### Mode Comparison

**Median Mode**:
- More robust to outliers
- Better for noisy images
- Recommended for: Complex UIs with gradients

**Mean Mode**:
- More sensitive to color changes
- Better for clean interfaces
- Recommended for: Simple UIs with solid colors

## Troubleshooting

### Issue: "未找到微信窗口"

**Solution:**
1. Make sure WeChat desktop app is running
2. Make sure you're logged in
3. Try bringing WeChat window to front manually

### Issue: Screenshot is black or empty

**Solution:**
1. Grant screen recording permission to Terminal/iTerm
2. On macOS: System Preferences → Security & Privacy → Screen Recording
3. Restart terminal after granting permission

### Issue: Low separator detection count

**Solution:**
1. Try different parameter sets
2. Adjust `minSeparatorScore` (lower = more sensitive)
3. Adjust `cellSize` (smaller = more detail)
4. Compare Median vs Mean mode results

## Advanced Usage

### Custom Parameters

Edit the script to customize analysis parameters:

```javascript
const CONFIG = {
    cellSize: 10,              // Cell size for analysis (5-20)
    quantize: 16,              // Color quantization (8-32)
    tolerance: 32,             // Color tolerance (16-64)
    minRegionArea: 4,          // Minimum region size (2-10)
    minSeparatorScore: 0.08,   // Separator threshold (0.05-0.2)
    cellColorMode: 'median',   // 'median' or 'mean'
    boundarySpanWidth: 3,      // Boundary detection width (1-5)
};
```

### HTTP Mode

Run tests via HTTP API:

```bash
# Start server
./testmonkey-go -http -port 60844

# Execute test via API
curl -X POST http://localhost:60844/SCRIPT_RUN \
  -H "Content-Type: application/json" \
  -d '{"script": "$(cat tests/wechat/wechat_complete_test.js)"}'
```

## Performance Tips

1. **Close unnecessary apps** - Reduces window list processing time
2. **Use Quick Test first** - Verify setup before running full tests
3. **Adjust window size** - Smaller windows = faster processing
4. **Use HTTP mode** - Better for repeated testing

## Next Steps

After successful testing:

1. ✅ Review generated images in `.runtime/tests/wechat/wechat_test_output/`
2. ✅ Compare Median vs Mean mode results
3. ✅ Adjust parameters if needed
4. ✅ Integrate into your automation workflow

## Support

For issues or questions:
- Check the main project README
- Review the .archive/reports/2026-03-status-report.md for project status
- See .archive/reports/implementation-summary.md for architecture details

---

**Last Updated**: 2026-03-17
**Version**: 1.0.0
**Status**: ✅ Production Ready
