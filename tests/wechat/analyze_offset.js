/**
 * 详细分析 y=50 vs y=60 的检测问题
 */

async function analyzeDetectionOffset() {
    console.log('='.repeat(80));
    console.log('检测偏移分析');
    console.log('='.repeat(80));

    const imagePath = '.runtime/tests/wechat/simple_wechat.png';

    // 测试不同的 cellSize 值
    const configs = [
        { name: 'cellSize=10', cellSize: 10 },
        { name: 'cellSize=5', cellSize: 5 },
        { name: 'cellSize=20', cellSize: 20 },
    ];

    for (const config of configs) {
        console.log(`\n测试配置: ${config.name}`);

        const result = await Vision.analyzeLayout({
            imagePath,
            cellSize: config.cellSize,
            quantize: 16,
            tolerance: 32,
            minRegionArea: 4,
            minSeparatorScore: 0.08,
            cellColorMode: 'median',
            boundarySpanWidth: 3,
        });

        console.log(`  垂直分隔符:`);
        result.separators.vertical.forEach(s => {
            console.log(`    x=${s.position}, 置信度=${s.confidence.toFixed(3)}`);
        });

        console.log(`  水平分隔符:`);
        result.separators.horizontal.forEach(s => {
            const expected = (Math.abs(s.position - 60) <= 10) ? ' (期望 y=60)' :
                           (Math.abs(s.position - 700) <= 10) ? ' (期望 y=700)' : '';
            console.log(`    y=${s.position}, 置信度=${s.confidence.toFixed(3)}${expected}`);
        });
    }
}

analyzeDetectionOffset().catch(console.error);
