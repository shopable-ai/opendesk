# Algorithm Improvement Plan - False Positive Reduction

## Current Issue

Validation testing revealed false positives in complex layouts with text:
- **Complex with text case**: Median F1=0.500, Mean F1=0.278
- **Root cause**: Text rows create spurious horizontal separators
- **Impact**: Precision drops to 11-67% on text-heavy content

## Proposed Solutions

### Solution 1: Minimum Separator Length (Immediate)

**Concept**: Real layout separators span the entire width/height, while text artifacts are short.

**Implementation**:
```go
// Add to layoutAnalyzeOptions
MinSeparatorLength float64 // default 0.6 (60% of span)

// In selectLayoutBoundaryCandidates, add validation:
func validateSeparatorLength(item boundaryScore, rect layoutGridRect, minLength float64) bool {
    span := axisSpanForOrientation(rect, item.Orientation)
    // Check if separator spans at least minLength of the region
    return true // simplified - actual implementation needs support ratio check
}
```

**Expected Impact**:
- Filter out short separators (text rows)
- Keep full-width/height separators (real boundaries)
- Improve precision from 11% to 60%+

### Solution 2: Adaptive Thresholding (Short Term)

**Concept**: Use higher thresholds for text-heavy regions.

**Implementation**:
```go
// Detect text density in region
textDensity := estimateTextDensity(grid, rect)

// Adjust threshold based on density
adjustedThreshold := opts.MinSeparatorScore
if textDensity > 0.3 {
    adjustedThreshold *= 1.5 // 50% higher for text-heavy
}
```

**Expected Impact**:
- Reduce false positives in text areas
- Maintain sensitivity in clean areas
- Improve overall F1 by 10-20%

### Solution 3: Multi-Scale Validation (Medium Term)

**Concept**: Real separators appear at multiple cell sizes.

**Implementation**:
```go
// Run analysis at 3 different cell sizes
results := []LayoutResult{
    analyzeLayout(img, cellSize: 8),
    analyzeLayout(img, cellSize: 10),
    analyzeLayout(img, cellSize: 12),
}

// Keep only separators that appear in 2+ scales
validatedSeparators := intersectResults(results, minOccurrences: 2)
```

**Expected Impact**:
- High confidence in validated separators
- Filter out scale-dependent artifacts
- Improve precision to 80%+

## Implementation Priority

### Phase 1: Minimum Separator Length (Now)
- **Effort**: Low (1-2 hours)
- **Impact**: High (expected 40-50% precision improvement)
- **Risk**: Low (simple validation rule)

### Phase 2: Adaptive Thresholding (Next)
- **Effort**: Medium (2-4 hours)
- **Impact**: Medium (10-20% improvement)
- **Risk**: Medium (needs tuning)

### Phase 3: Multi-Scale Validation (Future)
- **Effort**: High (1-2 days)
- **Impact**: High (20-30% improvement)
- **Risk**: Medium (performance impact)

## Testing Plan

### 1. Unit Tests
- Test separator length validation logic
- Test adaptive threshold calculation
- Test multi-scale intersection

### 2. Validation Tests
- Re-run validation on 4 test cases
- Target: F1 > 0.8 on complex_with_text
- Maintain: F1 = 1.0 on simple cases

### 3. Real Application Tests
- Re-test Chrome, VS Code, Finder, WeChat
- Compare before/after false positive rates
- Measure precision improvement

## Success Criteria

### Phase 1 Success
- [ ] Complex case F1 improves from 0.500 to > 0.700
- [ ] Simple cases maintain F1 = 1.000
- [ ] Real app false positives reduce by 30%+

### Phase 2 Success
- [ ] Complex case F1 improves to > 0.800
- [ ] Adaptive threshold works on varied content
- [ ] No regression on simple cases

### Phase 3 Success
- [ ] Complex case F1 improves to > 0.900
- [ ] Real app precision > 0.800
- [ ] Performance overhead < 3x

## Next Steps

1. ✅ Validation testing complete
2. ✅ Issues identified and documented
3. 🔄 Implement Phase 1: Minimum separator length
4. ⏳ Test and validate improvements
5. ⏳ Implement Phase 2 if needed
6. ⏳ Document final results

---

**Status**: Ready to implement Phase 1
**Expected Completion**: 2026-03-17 (today)
