#!/bin/bash

# 端到端自动化测试脚本
# 功能：生成测试图片 -> 运行检测 -> 生成可视化 -> 评估结果

set -e

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"
CLAWDESK_BINARY="${CLAWDESK_BINARY:-$ROOT_DIR/dist/clawdesk}"

if [[ ! -x "$CLAWDESK_BINARY" ]]; then
    echo "构建 Clawdesk -> $CLAWDESK_BINARY"
    mkdir -p "$(dirname "$CLAWDESK_BINARY")"
    go build -o "$CLAWDESK_BINARY" ./cmd/clawdesk
fi

mkdir -p .runtime/tests/wechat

echo "================================================================================"
echo "微信布局识别算法 - 端到端自动化测试"
echo "================================================================================"

# 步骤 1: 生成测试图片
echo ""
echo "步骤 1: 生成测试图片..."
echo "  1.1 生成简化图片（纯色矩形）"
go run ./tests/wechat/tools/generate-simple-image

echo "  1.2 生成复杂图片（包含细节）"
go run ./tests/wechat/tools/generate-mock-image

# 步骤 2: 运行检测并生成可视化
echo ""
echo "步骤 2: 运行检测并生成可视化..."

# 2.1 简化图片测试
echo "  2.1 测试简化图片"
"$CLAWDESK_BINARY" -script tests/wechat/run_and_visualize.js simple

# 2.2 复杂图片测试
echo "  2.2 测试复杂图片"
"$CLAWDESK_BINARY" -script tests/wechat/run_and_visualize.js complex

# 步骤 3: 显示结果
echo ""
echo "================================================================================"
echo "测试完成！"
echo "================================================================================"
echo ""
echo "可视化结果："
echo "  简化图片: .runtime/tests/wechat/simple_visualization.png"
echo "  复杂图片: .runtime/tests/wechat/complex_visualization.png"
echo ""
echo "查看图片："
echo "  open .runtime/tests/wechat/simple_visualization.png"
echo "  open .runtime/tests/wechat/complex_visualization.png"
echo ""
echo "图例说明："
echo "  🟢 绿色线条 - 正确检测的分隔符"
echo "  🔴 红色线条 - 误检测的分隔符"
echo "  🟠 橙色线条 - 漏检测的分隔符"
echo ""
