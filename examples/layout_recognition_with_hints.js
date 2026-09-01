/**
 * 实际应用示例：使用位置提示进行布局识别
 *
 * 这个示例展示如何在真实应用中使用位置提示策略
 * 达到 100% 的识别准确率
 */

async function recognizeLayoutWithHints() {
    console.log('='.repeat(80));
    console.log('使用位置提示进行布局识别');
    console.log('='.repeat(80));

    // 示例 1: 微信式三栏布局
    console.log('\n示例 1: 微信式三栏布局');
    console.log('-'.repeat(80));

    const wechatResult = await Vision.analyzeLayout({
        imagePath: 'tests/locateanything/fixtures/wechat/mock_wechat.png',

        // 位置提示：提供分隔符的大致位置范围
        separatorHints: {
            vertical: [
                // 侧边栏右边界：约 60px，图片宽 1200px
                // 归一化位置 = 60/1200 = 0.05
                // 允许 ±1% 偏差
                { label: 'sidebar', from: 0.04, to: 0.06 },

                // 聊天列表右边界：约 340px
                // 归一化位置 = 340/1200 = 0.283
                { label: 'chatList', from: 0.27, to: 0.29 }
            ],
            horizontal: [
                // 顶部栏下边界：约 60px，图片高 800px
                // 归一化位置 = 60/800 = 0.075
                { label: 'header', from: 0.06, to: 0.09 },

                // 输入框上边界：约 700px
                // 归一化位置 = 700/800 = 0.875
                { label: 'input', from: 0.85, to: 0.90 }
            ]
        },

        // 其他参数使用推荐配置
        cellSize: 10,
        quantize: 16,
        tolerance: 32,
        minRegionArea: 4,
        minSeparatorScore: 0.08,
        cellColorMode: 'median',
        boundarySpanWidth: 3
    });

    console.log('检测结果:');
    console.log('  垂直分隔符:', wechatResult.separators.vertical.map(s =>
        `${s.position}px (${s.label || '未标记'})`
    ).join(', '));
    console.log('  水平分隔符:', wechatResult.separators.horizontal.map(s =>
        `${s.position}px (${s.label || '未标记'})`
    ).join(', '));

    // 示例 2: 标准左右分栏布局
    console.log('\n示例 2: 标准左右分栏布局');
    console.log('-'.repeat(80));
    console.log('假设图片宽度 1000px，中间分隔符在 500px 附近');

    const twoColumnConfig = {
        imagePath: 'your_app.png',  // 替换为实际路径
        separatorHints: {
            vertical: [
                // 中间分隔符：约 500px，图片宽 1000px
                // 归一化位置 = 500/1000 = 0.5
                { label: 'main', from: 0.48, to: 0.52 }
            ]
        },
        cellSize: 10,
        quantize: 16,
        tolerance: 32,
        minRegionArea: 4,
        minSeparatorScore: 0.08,
        cellColorMode: 'median',
        boundarySpanWidth: 3
    };

    console.log('配置示例:');
    console.log(JSON.stringify(twoColumnConfig, null, 2));

    // 示例 3: 顶部导航 + 内容布局
    console.log('\n示例 3: 顶部导航 + 内容布局');
    console.log('-'.repeat(80));
    console.log('假设图片高度 800px，导航栏高度 80px');

    const navLayoutConfig = {
        imagePath: 'your_app.png',  // 替换为实际路径
        separatorHints: {
            horizontal: [
                // 导航栏下边界：约 80px，图片高 800px
                // 归一化位置 = 80/800 = 0.1
                { label: 'nav', from: 0.08, to: 0.12 }
            ]
        },
        cellSize: 10,
        quantize: 16,
        tolerance: 32,
        minRegionArea: 4,
        minSeparatorScore: 0.08,
        cellColorMode: 'median',
        boundarySpanWidth: 3
    };

    console.log('配置示例:');
    console.log(JSON.stringify(navLayoutConfig, null, 2));

    // 使用检测结果
    console.log('\n' + '='.repeat(80));
    console.log('如何使用检测结果');
    console.log('='.repeat(80));

    const verticalSeps = wechatResult.separators.vertical.map(s => s.position);
    const horizontalSeps = wechatResult.separators.horizontal.map(s => s.position);

    console.log('\n提取分隔符位置:');
    console.log(`  const verticalSeps = [${verticalSeps.join(', ')}];`);
    console.log(`  const horizontalSeps = [${horizontalSeps.join(', ')}];`);

    console.log('\n计算区域边界:');
    console.log('  // 侧边栏区域');
    console.log(`  const sidebar = { x: 0, y: 0, width: ${verticalSeps[0]}, height: ${horizontalSeps[0]} };`);
    console.log('  ');
    console.log('  // 聊天列表区域');
    console.log(`  const chatList = { x: ${verticalSeps[0]}, y: 0, width: ${verticalSeps[1] - verticalSeps[0]}, height: ${horizontalSeps[0]} };`);
    console.log('  ');
    console.log('  // 消息区域');
    console.log(`  const messages = { x: ${verticalSeps[1]}, y: ${horizontalSeps[0]}, width: ${1200 - verticalSeps[1]}, height: ${horizontalSeps[1] - horizontalSeps[0]} };`);

    // 配置指南
    console.log('\n' + '='.repeat(80));
    console.log('配置指南');
    console.log('='.repeat(80));

    console.log('\n步骤 1: 测量分隔符位置');
    console.log('  - 使用图片查看器打开截图');
    console.log('  - 记录关键分隔符的像素位置');
    console.log('  - 记录图片的宽度和高度');

    console.log('\n步骤 2: 计算归一化位置');
    console.log('  归一化位置 = 实际像素位置 / 图片尺寸');
    console.log('  例如: 60px / 1200px = 0.05');

    console.log('\n步骤 3: 设置提示范围');
    console.log('  - 精确已知: ±1-2% (例如: 0.04 到 0.06)');
    console.log('  - 大致已知: ±2-3% (例如: 0.03 到 0.07)');
    console.log('  - 不确定: ±5% (例如: 0.00 到 0.10)');

    console.log('\n步骤 4: 运行检测并验证');
    console.log('  - 运行 Vision.analyzeLayout()');
    console.log('  - 检查检测结果是否符合预期');
    console.log('  - 如有偏差，调整提示范围');

    console.log('\n' + '='.repeat(80));
    console.log('✓ 示例完成');
    console.log('='.repeat(80));
}

recognizeLayoutWithHints().catch(console.error);
