# 微信测试快速开始

## 5分钟快速上手

### 第一步：准备环境

1. **打开微信桌面版**
   ```
   确保微信已经登录并显示在屏幕上
   ```

2. **构建项目**（如果还没有构建）
   ```bash
   go build -o testmonkey-go .
   ```

### 第二步：运行快速测试

```bash
./testmonkey-go -script examples/wechat_screenshot_quick.js
```

**预期输出：**
```
==========================================================
微信快速截图测试
==========================================================

🔍 查找微信窗口...
✅ 找到微信: 微信
   大小: 1200x800
   位置: (100, 100)

📌 置顶微信窗口...

📸 截取屏幕...
✅ 截图已保存: wechat_quick_test.png

🔬 快速分析...
   检测到 3 个垂直分隔符
   检测到 15 个水平分隔符
   总计 18 个分隔符

==========================================================
✅ 测试完成
==========================================================
```

### 第三步：查看结果

打开生成的截图：
```bash
open wechat_quick_test.png
```

## 进阶：生成标注图片

### 运行完整测试

```bash
./testmonkey-go -script examples/wechat_complete_test.js
```

### 查看生成的文件

```bash
ls -lh wechat_test_output/
```

你会看到：
- `wechat_original.png` - 原始截图
- `wechat_annotated_median.png` - Median模式标注
- `wechat_annotated_mean.png` - Mean模式标注
- `wechat_regions_median.png` - Median模式区域
- `wechat_regions_mean.png` - Mean模式区域

### 查看标注图片

```bash
open wechat_test_output/wechat_annotated_median.png
```

**图片说明：**
- 🔴 红色线条 = 垂直分隔符（列分隔）
- 🟢 绿色线条 = 水平分隔符（行分隔）

## 常见问题

### Q: 提示"未找到微信窗口"？

**A:** 确保：
1. 微信桌面版正在运行
2. 已经登录微信
3. 微信窗口可见（不是最小化状态）

### Q: 截图是黑色的？

**A:** 需要授予屏幕录制权限：
1. 打开"系统偏好设置"
2. 进入"安全性与隐私"
3. 选择"屏幕录制"
4. 勾选你的终端应用（Terminal 或 iTerm）
5. 重启终端

### Q: 检测到的分隔符太少？

**A:** 尝试调整参数：
- 降低 `minSeparatorScore`（更敏感）
- 减小 `cellSize`（更多细节）
- 尝试不同的 `cellColorMode`（median 或 mean）

## 下一步

1. ✅ 查看 [完整测试指南](examples/WECHAT_TESTING_GUIDE.md)
2. ✅ 了解参数调优
3. ✅ 集成到你的自动化流程

## 需要帮助？

- 查看 [WECHAT_TESTING_GUIDE.md](examples/WECHAT_TESTING_GUIDE.md) 获取详细文档
- 查看 [STATUS_REPORT.md](STATUS_REPORT.md) 了解项目状态
- 查看示例脚本了解更多用法

---

**提示**: 第一次运行建议使用快速测试，确认环境正常后再运行完整测试。
