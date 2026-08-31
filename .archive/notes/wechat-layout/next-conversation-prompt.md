# 微信布局识别算法优化 - 新对话提示词

## 背景

我正在开发一个应用程序布局识别系统，用于自动化测试。目标是识别应用程序界面的各个功能区域（工具栏、侧边栏、内容区等），以便后续进行精准的自动化操作。

## 当前问题

已经完成了初步测试，使用模拟微信界面验证算法：

### 测试结果
- **Median 模式**: 精确率 66.7%，召回率 100%，F1 分数 80%
- **Mean 模式**: 精确率 30.8%，召回率 100%，F1 分数 47.1%

### 主要问题
1. **精确率太低** - 误检测了很多不应该识别的分隔符
2. **误检测原因** - 聊天列表中的聊天项分隔线被识别为主要分隔符
3. **需要优化** - 提高精确率到 90% 以上

## 项目结构

```
tests/wechat/
├── output/
│   ├── mock_wechat.png                    # 模拟微信界面
│   ├── mock_layout.json                   # 标准布局定义
│   ├── mock_median_visualization.png      # Median 测试结果（绿色=正确，红色=误检）
│   └── mock_mean_visualization.png        # Mean 测试结果
├── generate_mock_image.go                 # 生成模拟界面
├── test_complete_recognition.js           # 完整测试脚本
└── visualize_test_result.go               # 生成可视化图片
```

## 标准布局定义

模拟微信界面包含 5 个功能区域：
1. **侧边栏** (0, 0, 60x800) - 深灰色 #2E2E2E
2. **聊天列表** (60, 0, 280x800) - 浅灰色 #F5F5F5
3. **聊天头部** (340, 0, 860x60) - 浅灰色 #F5F5F5
4. **消息区域** (340, 60, 860x640) - 浅灰色 #F9F9F9
5. **输入区域** (340, 700, 860x100) - 浅灰色 #F5F5F5

### 期望的分隔符
- 垂直分隔符: x=60 (侧边栏|聊天列表), x=340 (聊天列表|聊天内容)
- 水平分隔符: y=60 (聊天头部|消息区域), y=700 (消息区域|输入区域)

## 当前算法配置

### Median 模式（当前最佳）
```javascript
{
    cellSize: 10,
    quantize: 16,
    tolerance: 32,
    minRegionArea: 4,
    minSeparatorScore: 0.08,
    cellColorMode: 'median',
    boundarySpanWidth: 3,
}
```

### 误检测情况
- 正确检测: 2个垂直 + 2个水平 = 4个
- 误检测: 0个垂直 + 2个水平 = 2个
  - y=130 (置信度 0.523) - 聊天项分隔线
  - y=190 (置信度 0.395) - 聊天项分隔线

## 优化目标

1. **提高精确率到 90% 以上**
   - 减少误检测
   - 保持 100% 召回率

2. **优化方向**
   - 提高 `minSeparatorScore` 阈值
   - 添加分隔符长度过滤（只保留跨越整个区域的分隔线）
   - 添加后处理逻辑（过滤低置信度、合并相邻分隔符）

3. **测试方法**
   - 使用 JavaScript 脚本测试（优先）
   - 对比期望结果与实际结果
   - 计算精确率、召回率、F1 分数
   - 生成可视化图片验证

## 需要你帮我做的

1. **分析当前误检测原因**
   - 查看 `.runtime/tests/wechat/mock_median_visualization.png`
   - 分析为什么聊天项分隔线被识别为主要分隔符

2. **优化算法参数**
   - 测试不同的 `minSeparatorScore` 值（0.10, 0.12, 0.15, 0.20）
   - 添加分隔符长度过滤逻辑
   - 添加置信度后处理

3. **创建优化测试脚本**
   - 纯 JavaScript 实现
   - 测试多组参数
   - 自动选择最佳配置
   - 生成对比报告

4. **验证优化效果**
   - 精确率 > 90%
   - 召回率 = 100%
   - F1 分数 > 95%

## 运行测试的命令

```bash
# 1. 生成模拟界面
go run tests/wechat/generate_mock_image.go

# 2. 运行测试
./testMonkey-go -script tests/wechat/test_complete_recognition.js

# 3. 生成可视化
go run tests/wechat/visualize_test_result.go median
go run tests/wechat/visualize_test_result.go mean
```

## 可用的 API

### Vision.analyzeLayout
```javascript
const result = await Vision.analyzeLayout({
    imagePath: 'path/to/image.png',
    cellSize: 10,
    quantize: 16,
    tolerance: 32,
    minRegionArea: 4,
    minSeparatorScore: 0.08,
    cellColorMode: 'median',  // 或 'mean'
    boundarySpanWidth: 3,
});

// 返回结果
result.separators.vertical   // 垂直分隔符数组
result.separators.horizontal // 水平分隔符数组
result.regions               // 识别的区域数组
```

### 分隔符数据结构
```javascript
{
    position: 60,        // 位置
    confidence: 0.571,   // 置信度
    thickness: 2,        // 厚度
    orientation: 'vertical'
}
```

## 期望输出

1. **优化后的配置参数**
2. **测试报告** - 包含精确率、召回率、F1 分数
3. **可视化图片** - 绿色=正确，红色=误检，橙色=漏检
4. **优化建议** - 如果还有改进空间

## 重要提示

- **优先使用 JavaScript** - 所有测试代码用 JS 编写
- **测试文件放在 tests/wechat/** - 不要与源代码混合
- **输出文件放在 .runtime/tests/wechat/** - 统一输出目录
- **每次修改后都要验证** - 生成可视化图片确认效果
- **目标是实用性** - 算法要能用于真实的自动化测试

---

**项目路径**: `/Users/a0000/Documents/workspace/testMonkey-go`
**当前状态**: 初步测试完成，需要优化算法
**优先级**: 高 - 这是自动化测试的基础功能
