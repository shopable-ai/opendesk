# Layout Recognition Improvements

## Overview

This project implements improvements to the desktop window layout recognition algorithm, focusing on making separators align more closely with color block boundaries rather than text edges.

## New Features

### 1. Cell Color Computation Modes

Added `cellColorMode` parameter to control how cell colors are calculated:

- **`mean`** (default): Arithmetic mean - faster, backward compatible
- **`median`**: Median value - more robust against text/foreground noise
- **`trimmed`**: Trimmed mean - removes outliers (not yet implemented)
- **`dominant`**: Dominant color - most frequent color (not yet implemented)

### 2. Multi-Span Boundary Detection

Added `boundarySpanWidth` parameter to control region-level contrast calculation:

- **Default**: 3 cells
- **Range**: 1-8
- **Purpose**: Considers wider regions on both sides of a boundary for more stable detection

## Usage

### Basic Usage (Backward Compatible)

```javascript
// Uses default settings (mean mode)
const layout = await ImageColor.analyzeLayout(imageBase64, {
  cellSize: 10,
  quantize: 16,
  tolerance: 32,
});
```

### Using Median Mode

```javascript
// For text-heavy windows
const layout = await ImageColor.analyzeLayout(imageBase64, {
  cellSize: 10,
  quantize: 16,
  tolerance: 32,
  cellColorMode: 'median',
  boundarySpanWidth: 3,
  minSeparatorScore: 0.08,  // Lower threshold for median mode
});
```

### Comparing Modes

```javascript
// Test both modes
const medianLayout = await ImageColor.analyzeLayout(image, {
  cellColorMode: 'median',
  boundarySpanWidth: 3,
});

const meanLayout = await ImageColor.analyzeLayout(image, {
  cellColorMode: 'mean',
  boundarySpanWidth: 1,
});

// Compare results
console.log('Median:', medianLayout.separators.vertical.length, 'separators');
console.log('Mean:', meanLayout.separators.vertical.length, 'separators');
```

## Testing

### Run Unit Tests

```bash
go test ./automation -v
```

### Test Real Applications

```bash
# Quick WeChat test
./testMonkey-go -script examples/wechat_quick_test.js

# Test specific app
./testMonkey-go -script examples/test_layout_improvement.js wechat
./testMonkey-go -script examples/test_layout_improvement.js chrome
./testMonkey-go -script examples/test_layout_improvement.js vscode

# Parameter tuning
./testMonkey-go -script examples/wechat_param_tuning.js

# Continuous testing
./testMonkey-go -script examples/continuous_layout_test.js
```

## Current Status

### ✅ Completed

- Cell color computation with median mode
- Multi-span boundary detection
- Comprehensive test suite (7 progressive levels)
- Real application testing (Chrome, VS Code, Finder, WeChat)
- Documentation and testing tools
- TypeScript type definitions
- Scoring formula optimization (multiple iterations)

### ⚠️ Known Limitations

- Median mode detects fewer separators on real applications (-18% to -39%)
- Median mode has lower confidence scores on real apps (0.457 vs 0.610 average)
- Median mode performs better on synthetic tests but worse on real applications
- Root cause: Flood fill merges too many regions with median cell colors

### 📊 Test Results

**Progressive Tests (Synthetic Images)**:
- Median: 9.0 avg separators, better in 4/7 tests (57%)
- Mean: 9.7 avg separators, better in 3/7 tests (43%)

**Real Applications**:
- Median: 11.8 avg separators, better in 1/4 apps (25%)
- Mean: 14.5 avg separators, better in 3/4 apps (75%)

### 🔄 Future Work

- Adjust flood fill tolerance for median mode (0.7x multiplier)
- Implement adaptive thresholding
- Test hybrid approach (median cells + mean scoring)
- Performance benchmarking
- Application-specific parameter presets

## Recommendations

### When to Use Mean Mode (Default)

- General purpose layout detection
- When performance is critical
- When you need more separator candidates
- For backward compatibility

### When to Use Median Mode

- Text-heavy windows with dense content
- When you need higher quality separators
- When willing to trade quantity for quality
- For experimental/research purposes

### Parameter Tuning Tips

1. **cellSize**: Smaller values (6-8) for detailed layouts, larger (10-12) for coarse layouts
2. **boundarySpanWidth**: Smaller (1-2) for narrow separators, larger (3-5) for stable detection
3. **minSeparatorScore**: Lower (0.08-0.10) for median mode, higher (0.14-0.18) for mean mode
4. **tolerance**: Lower (16-24) for distinct regions, higher (32-48) for gradual transitions

## Documentation

- `docs/layout_improvement_analysis.md` - Problem analysis and solution evaluation
- `docs/layout_improvement_prompt.md` - Detailed implementation guide
- `docs/layout_improvement_implementation.md` - Implementation record
- `docs/TESTING_GUIDE.md` - Testing guide
- `docs/FINAL_SUMMARY.md` - Project summary and findings
- `docs/param_tuning_analysis.md` - Parameter tuning analysis
- `docs/PROGRESSIVE_TEST_RESULTS.md` - Synthetic test results (7 levels)
- `docs/REAL_APP_TEST_RESULTS.md` - Real application test results

## Contributing

If you find issues or have suggestions:

1. Test with different applications
2. Document your findings
3. Share parameter configurations that work well
4. Report bugs or unexpected behavior

## Future Improvements

### Short Term

- Adjust flood fill parameters for median mode
- Implement adaptive thresholding
- Add more test cases

### Medium Term

- Implement trimmed and dominant modes
- Optimize median computation performance
- Add application-specific presets

### Long Term

- Multi-scale detection
- Machine learning-based optimization
- Edge detection enhancement

## License

Same as the main project.
