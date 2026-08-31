// Test Layout Recognition with Mock WeChat Interface
// 使用模拟微信界面测试布局识别算法

const wait = (ms) => page.waitFor(ms);

// 预期的布局结构
const EXPECTED_LAYOUT = {
    name: 'WeChat Mock Interface',
    width: 1200,
    height: 800,
    verticalSeparators: [
        { position: 60, label: '侧边栏|聊天列表' },
        { position: 340, label: '聊天列表|聊天内容' }
    ],
    horizontalSeparators: [
        { position: 60, label: '头部|消息区' },
        { position: 700, label: '消息区|输入区' }
    ],
    regions: [
        { name: 'sidebar', label: '侧边栏', x: 0, y: 0, width: 60, height: 800 },
        { name: 'chatList', label: '聊天列表', x: 60, y: 0, width: 280, height: 800 },
        { name: 'chatContent', label: '聊天内容', x: 340, y: 0, width: 860, height: 800 }
    ]
};

async function testWithMode(imagePath, mode, config) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`测试 ${mode.toUpperCase()} 模式`);
    console.log('='.repeat(80));

    // 分析布局
    const result = await Vision.analyzeLayout({
        imagePath: imagePath,
        ...config
    });

    const vertical = result.separators?.vertical || [];
    const horizontal = result.separators?.horizontal || [];

    console.log(`\n检测结果:`);
    console.log(`  垂直分隔符: ${vertical.length}个`);
    console.log(`  水平分隔符: ${horizontal.length}个`);

    // 验证垂直分隔符
    console.log(`\n验证垂直分隔符:`);
    console.log(`  期望: ${EXPECTED_LAYOUT.verticalSeparators.length}个`);

    let verticalCorrect = 0;
    EXPECTED_LAYOUT.verticalSeparators.forEach(expected => {
        const found = vertical.find(v => Math.abs(v.position - expected.position) < 15);
        if (found) {
            const diff = Math.abs(found.position - expected.position);
            console.log(`  ✅ ${expected.label}: 期望=${expected.position}, 实际=${Math.round(found.position)}, 误差=${diff.toFixed(1)}px`);
            verticalCorrect++;
        } else {
            console.log(`  ❌ ${expected.label}: 期望=${expected.position}, 未检测到`);
        }
    });

    // 验证水平分隔符
    console.log(`\n验证水平分隔符:`);
    console.log(`  期望: ${EXPECTED_LAYOUT.horizontalSeparators.length}个`);

    let horizontalCorrect = 0;
    EXPECTED_LAYOUT.horizontalSeparators.forEach(expected => {
        const found = horizontal.find(h => Math.abs(h.position - expected.position) < 15);
        if (found) {
            const diff = Math.abs(found.position - expected.position);
            console.log(`  ✅ ${expected.label}: 期望=${expected.position}, 实际=${Math.round(found.position)}, 误差=${diff.toFixed(1)}px`);
            horizontalCorrect++;
        } else {
            console.log(`  ❌ ${expected.label}: 期望=${expected.position}, 未检测到`);
        }
    });

    // 计算准确率
    const totalExpected = EXPECTED_LAYOUT.verticalSeparators.length + EXPECTED_LAYOUT.horizontalSeparators.length;
    const totalCorrect = verticalCorrect + horizontalCorrect;
    const accuracy = (totalCorrect / totalExpected * 100).toFixed(1);

    console.log(`\n准确率: ${totalCorrect}/${totalExpected} = ${accuracy}%`);

    // 检查误检测
    const extraVertical = vertical.length - verticalCorrect;
    const extraHorizontal = horizontal.length - horizontalCorrect;

    if (extraVertical > 0 || extraHorizontal > 0) {
        console.log(`\n误检测:`);
        if (extraVertical > 0) {
            console.log(`  ⚠️  多检测了 ${extraVertical} 个垂直分隔符`);
            vertical.forEach(v => {
                const isExpected = EXPECTED_LAYOUT.verticalSeparators.some(e => Math.abs(v.position - e.position) < 15);
                if (!isExpected) {
                    console.log(`      位置: ${Math.round(v.position)}, 置信度: ${v.confidence.toFixed(3)}`);
                }
            });
        }
        if (extraHorizontal > 0) {
            console.log(`  ⚠️  多检测了 ${extraHorizontal} 个水平分隔符`);
            horizontal.forEach(h => {
                const isExpected = EXPECTED_LAYOUT.horizontalSeparators.some(e => Math.abs(h.position - e.position) < 15);
                if (!isExpected) {
                    console.log(`      位置: ${Math.round(h.position)}, 置信度: ${h.confidence.toFixed(3)}`);
                }
            });
        }
    }

    // 生成可视化
    console.log(`\n生成可视化...`);
    const outputPath = `.runtime/tests/wechat/mock_wechat_${mode}_result.png`;

    await Vision.annotateRegions({
        imagePath: imagePath,
        regions: result.regions || [],
        separators: result.separators,
        outputPath: outputPath,
        title: `Mock WeChat - ${mode.toUpperCase()} Mode`
    });

    console.log(`✅ 可视化已保存: ${outputPath}`);

    return {
        mode,
        accuracy: parseFloat(accuracy),
        verticalCorrect,
        horizontalCorrect,
        extraVertical,
        extraHorizontal,
        result
    };
}

async function main() {
    console.log('='.repeat(80));
    console.log('微信布局识别算法测试 - 使用模拟数据');
    console.log('='.repeat(80));
    console.log();

    const mockImagePath = '.runtime/tests/wechat/mock_wechat.png';

    console.log('测试图片: ' + mockImagePath);
    console.log('\n预期布局:');
    console.log(`  尺寸: ${EXPECTED_LAYOUT.width}x${EXPECTED_LAYOUT.height}`);
    console.log(`  垂直分隔符: ${EXPECTED_LAYOUT.verticalSeparators.length}个`);
    EXPECTED_LAYOUT.verticalSeparators.forEach(s => {
        console.log(`    - x=${s.position}: ${s.label}`);
    });
    console.log(`  水平分隔符: ${EXPECTED_LAYOUT.horizontalSeparators.length}个`);
    EXPECTED_LAYOUT.horizontalSeparators.forEach(s => {
        console.log(`    - y=${s.position}: ${s.label}`);
    });

    try {
        // 测试 Median 模式
        const medianResult = await testWithMode(mockImagePath, 'median', {
            cellSize: 10,
            quantize: 16,
            tolerance: 32,
            minRegionArea: 4,
            minSeparatorScore: 0.08,
            cellColorMode: 'median',
            boundarySpanWidth: 3,
        });

        // 测试 Mean 模式
        const meanResult = await testWithMode(mockImagePath, 'mean', {
            cellSize: 10,
            quantize: 16,
            tolerance: 32,
            minRegionArea: 4,
            minSeparatorScore: 0.14,
            cellColorMode: 'mean',
            boundarySpanWidth: 1,
        });

        // 对比结果
        console.log('\n' + '='.repeat(80));
        console.log('测试结果对比');
        console.log('='.repeat(80));

        console.log(`\nMedian 模式:`);
        console.log(`  准确率: ${medianResult.accuracy}%`);
        console.log(`  正确检测: ${medianResult.verticalCorrect}V + ${medianResult.horizontalCorrect}H`);
        console.log(`  误检测: ${medianResult.extraVertical}V + ${medianResult.extraHorizontal}H`);

        console.log(`\nMean 模式:`);
        console.log(`  准确率: ${meanResult.accuracy}%`);
        console.log(`  正确检测: ${meanResult.verticalCorrect}V + ${meanResult.horizontalCorrect}H`);
        console.log(`  误检测: ${meanResult.extraVertical}V + ${meanResult.extraHorizontal}H`);

        // 推荐模式
        console.log(`\n推荐模式:`);
        if (medianResult.accuracy > meanResult.accuracy) {
            console.log(`  ✅ Median 模式 (准确率更高: ${medianResult.accuracy}%)`);
        } else if (meanResult.accuracy > medianResult.accuracy) {
            console.log(`  ✅ Mean 模式 (准确率更高: ${meanResult.accuracy}%)`);
        } else {
            if (medianResult.extraVertical + medianResult.extraHorizontal < meanResult.extraVertical + meanResult.extraHorizontal) {
                console.log(`  ✅ Median 模式 (误检测更少)`);
            } else {
                console.log(`  ✅ Mean 模式 (误检测更少)`);
            }
        }

        console.log('\n' + '='.repeat(80));
        console.log('✅ 测试完成');
        console.log('='.repeat(80));

        console.log('\n输出文件:');
        console.log('  .runtime/tests/wechat/mock_wechat.png                - 模拟界面');
        console.log('  .runtime/tests/wechat/mock_wechat_median_result.png - Median 模式识别结果');
        console.log('  .runtime/tests/wechat/mock_wechat_mean_result.png   - Mean 模式识别结果');

    } catch (error) {
        console.error('\n❌ 错误:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        throw error;
    }
}

main().catch(console.error);
