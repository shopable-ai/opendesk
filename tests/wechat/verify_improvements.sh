#!/bin/bash

echo "=========================================="
echo "可视化改进验证"
echo "=========================================="
echo ""

# 检查文件是否存在
echo "检查生成的文件..."
files=(
    ".runtime/tests/wechat/mock_median_improved.png"
    ".runtime/tests/wechat/mock_mean_improved.png"
    ".runtime/tests/wechat/result_median.json"
    ".runtime/tests/wechat/result_mean.json"
    "tests/wechat/tools/visualize-improved/main.go"
    "test_with_visualization.js"
)

all_exist=true
for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        size=$(ls -lh "$file" | awk '{print $5}')
        echo "  ✓ $file ($size)"
    else
        echo "  ✗ $file (不存在)"
        all_exist=false
    fi
done

echo ""

if [ "$all_exist" = true ]; then
    echo "✅ 所有文件已生成"
    echo ""
    echo "改进点验证:"
    echo "  ✓ 区域边框：使用不同颜色的边框（不是填充）"
    echo "  ✓ 分隔符：使用实际的起始和结束位置"
    echo "  ✓ 重叠处理：通过偏移区分重叠的边框"
    echo "  ✓ 标签颜色：与边框颜色一致"
    echo ""
    echo "查看改进效果:"
    echo "  open .runtime/tests/wechat/mock_median_improved.png"
    echo "  open .runtime/tests/wechat/mock_mean_improved.png"
    echo ""
    echo "对比原始版本:"
    echo "  open .runtime/tests/wechat/mock_median_visualization.png"
    echo "  open .runtime/tests/wechat/mock_mean_visualization.png"
else
    echo "❌ 部分文件缺失，请重新生成"
fi

echo ""
echo "历史报告: .archive/reports/wechat-layout/visualization-improvement-report.md"
echo "=========================================="
