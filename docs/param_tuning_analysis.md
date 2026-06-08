# WeChat Parameter Tuning Results Analysis

## 测试结果总结

### 所有 Median 配置产生相同结果

| 配置 | Separators | Avg Conf | High/Med/Low |
|------|-----------|----------|--------------|
| median_span3 | 3 (1V+2H) | 0.564 | 2/1/0 |
| median_span2 | 3 (1V+2H) | 0.561 | 2/1/0 |
| median_span1 | 3 (1V+2H) | 0.556 | 2/1/0 |
| median_span3_low | 3 (1V+2H) | 0.564 | 2/1/0 |
| median_span2_low | 3 (1V+2H) | 0.561 | 2/1/0 |
| **mean_baseline** | **19 (9V+10H)** | **0.604** | **12/5/2** |

### 关键发现

1. **参数调整无效**: 改变 `boundarySpanWidth` 和 `minSeparatorScore` 对结果几乎没有影响
2. **候选 separator 存在**: Debug 信息显示检测到了多个候选（vertical 4个，horizontal 多个）
3. **Confidence 过低**: 大部分候选的 confidence 在 0.24-0.33 之间，低于默认阈值

### 候选 Separator 分析（Median 模式）

#### Vertical 候选

| Position | Score | Confidence | Support Ratio | Contrast | 状态 |
|----------|-------|------------|---------------|----------|------|
| 70 | 0.524 | **0.571** | 0.595 | 41.4 | ✅ 被选中 |
| 300 | 0.237 | 0.287 | 0.352 | 7.2 | ❌ 被过滤 |
| 900 | 0.435 | 0.304 | 0.201 | 34.3 | ❌ 被过滤 |
| 1020 | 0.479 | 0.330 | 0.193 | 44.6 | ❌ 被过滤 |

#### Horizontal 候选

| Position | Score | Confidence | Support Ratio | Contrast | 状态 |
|----------|-------|------------|---------------|----------|------|
| 70 | 0.402 | 0.305 | 0.239 | 27.2 | ❌ 被过滤 |
| 650 | ? | 0.248 | 0.206 | 24.7 | ❌ 被过滤 |

### 问题诊断

#### 1. Confidence 计算问题

Median 模式下的 confidence 普遍偏低，可能原因：
- 新的评分公式权重不合理
- Support ratio 在 median 模式下偏低
- Region contrast 没有起到预期作用

#### 2. 评分公式对比

**Mean 模式公式**:
```
score = ratio*0.72 + clamp(avgDist/72.0)*0.28
```

**Median 模式公式**:
```
score = ratio*0.50 + clamp(avgDist/72.0)*0.20 + clamp(regionContrast/72.0)*0.30
```

**问题**:
- Support ratio 权重从 72% 降到 50%，导致分数下降
- Region contrast 权重 30% 可能不够高
- 整体评分偏低

### 根本原因

**Median 模式改变了 cell 颜色，导致**:
1. **Flood fill 结果不同**: 区域划分更均匀，边界更少
2. **Support ratio 下降**: 相邻 cell 颜色差异变小，label 变化减少
3. **评分公式不适配**: 原有公式针对 mean 模式优化，不适合 median 模式

### 解决方案

#### 方案 1: 调整评分公式权重（推荐）

```go
// 针对 median 模式优化的公式
if cellColorMode == "median" {
    score = ratio*0.40 +
            layoutClampFloat(avgDist/72.0, 0, 1)*0.25 +
            layoutClampFloat(regionContrast/72.0, 0, 1)*0.35
} else {
    score = ratio*0.72 + layoutClampFloat(avgDist/72.0, 0, 1)*0.28
}
```

**理由**:
- 降低 support ratio 权重（因为 median 模式下会偏低）
- 增加 region contrast 权重（这是 median 模式的优势）
- 增加 local contrast 权重（补偿 support ratio 的下降）

#### 方案 2: 降低 Confidence 阈值

```go
// 针对 median 模式使用更低的阈值
if cellColorMode == "median" {
    minSeparatorScore = 0.08  // 降低阈值
} else {
    minSeparatorScore = 0.14  // 保持原值
}
```

#### 方案 3: 混合模式

```go
// 使用 median 计算 cell 颜色，但保留原有评分公式
score = ratio*0.72 + layoutClampFloat(avgDist/72.0, 0, 1)*0.28
// 不使用 region contrast
```

### 推荐实施步骤

1. **立即**: 实施方案 1（调整评分公式）
2. **验证**: 重新测试微信和其他应用
3. **优化**: 根据测试结果微调权重
4. **文档**: 更新实施文档说明不同模式的评分公式

### 预期改进

实施方案 1 后，预期：
- Median 模式检测到的 separator 数量增加到 8-12 个
- 平均 confidence 提升到 0.45-0.55
- 高置信度 separator 增加到 4-6 个
- 更接近 mean 模式的数量，但质量更高

## 结论

**Median 模式的算法实现是正确的**，但评分公式需要针对性优化。当前的问题不是参数调整能解决的，需要修改代码中的评分公式。

这是一个**重要的发现**，说明不同的 cell 颜色计算模式需要配套不同的评分策略。
