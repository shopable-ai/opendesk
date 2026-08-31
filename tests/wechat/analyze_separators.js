/**
 * 分析分隔符检测结果，找出问题根源
 */

async function analyzeSeparators() {
    console.log('='.repeat(80));
    console.log('分隔符检测详细分析');
    console.log('='.repeat(80));

    const imagePath = '.runtime/tests/wechat/mock_wechat.png';

    // 使用基线配置
    const config = {
        cellSize: 10,
        quantize: 16,
        tolerance: 32,
        minRegionArea: 4,
        minSeparatorScore: 0.08,
        cellColorMode: 'median',
        boundarySpanWidth: 3,
    };

    console.log('\n配置参数:');
    console.log(JSON.stringify(config, null, 2));

    const result = await Vision.analyzeLayout({
        imagePath,
        ...config
    });

    console.log('\n检测到的垂直分隔符:');
    result.separators.vertical.forEach((sep, i) => {
        console.log(`  ${i + 1}. x=${sep.position}, 置信度=${sep.confidence.toFixed(3)}, 厚度=${sep.thickness}`);
    });

    console.log('\n检测到的水平分隔符:');
    result.separators.horizontal.forEach((sep, i) => {
        console.log(`  ${i + 1}. y=${sep.position}, 置信度=${sep.confidence.toFixed(3)}, 厚度=${sep.thickness}`);
    });

    console.log('\n检测到的区域:');
    result.regions.forEach((region, i) => {
        console.log(`  ${i + 1}. (${region.x}, ${region.y}, ${region.width}x${region.height})`);
    });

    console.log('\n期望的分隔符:');
    console.log('  垂直: x=60, x=340');
    console.log('  水平: y=60, y=700');

    console.log('\n问题分析:');

    // 分析垂直分隔符
    const expectedVertical = [60, 340];
    const detectedVertical = result.separators.vertical.map(s => s.position);
    console.log('\n垂直分隔符:');
    expectedVertical.forEach(expected => {
        const found = detectedVertical.find(d => Math.abs(d - expected) <= 5);
        if (found) {
            console.log(`  ✓ x=${expected} 已检测到 (实际 x=${found})`);
        } else {
            console.log(`  ✗ x=${expected} 未检测到`);
        }
    });
    detectedVertical.forEach(detected => {
        const isExpected = expectedVertical.some(e => Math.abs(e - detected) <= 5);
        if (!isExpected) {
            const sep = result.separators.vertical.find(s => s.position === detected);
            console.log(`  ✗ x=${detected} 误检测 (置信度 ${sep.confidence.toFixed(3)})`);
        }
    });

    // 分析水平分隔符
    const expectedHorizontal = [60, 700];
    const detectedHorizontal = result.separators.horizontal.map(s => s.position);
    console.log('\n水平分隔符:');
    expectedHorizontal.forEach(expected => {
        const found = detectedHorizontal.find(d => Math.abs(d - expected) <= 5);
        if (found) {
            console.log(`  ✓ y=${expected} 已检测到 (实际 y=${found})`);
        } else {
            console.log(`  ✗ y=${expected} 未检测到`);
        }
    });
    detectedHorizontal.forEach(detected => {
        const isExpected = expectedHorizontal.some(e => Math.abs(e - detected) <= 5);
        if (!isExpected) {
            const sep = result.separators.horizontal.find(s => s.position === detected);
            console.log(`  ✗ y=${detected} 误检测 (置信度 ${sep.confidence.toFixed(3)})`);
        }
    });

    console.log('\n结论:');
    console.log('  1. 垂直分隔符检测情况');
    console.log('  2. 水平分隔符检测情况');
    console.log('  3. 需要调整的参数');
}

analyzeSeparators().catch(console.error);
