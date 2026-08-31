/**
 * 测试原始复杂模拟图片（包含聊天项、头像等细节）
 */

async function testComplexImage() {
    console.log('='.repeat(80));
    console.log('复杂模拟图片分隔符检测测试');
    console.log('='.repeat(80));

    const imagePath = '.runtime/tests/wechat/mock_wechat.png';

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

    console.log('\n期望的分隔符:');
    console.log('  垂直: x=60, x=340');
    console.log('  水平: y=60, y=700');

    // 评估结果（使用 10 像素容差）
    const expectedVertical = [60, 340];
    const expectedHorizontal = [60, 700];
    const detectedVertical = result.separators.vertical.map(s => s.position);
    const detectedHorizontal = result.separators.horizontal.map(s => s.position);

    let correctV = 0, correctH = 0;
    let falseV = 0, falseH = 0;
    let missedV = 0, missedH = 0;

    expectedVertical.forEach(expected => {
        const found = detectedVertical.find(d => Math.abs(d - expected) <= 10);
        if (found) {
            correctV++;
        } else {
            missedV++;
        }
    });

    detectedVertical.forEach(detected => {
        if (!expectedVertical.some(e => Math.abs(e - detected) <= 10)) {
            falseV++;
        }
    });

    expectedHorizontal.forEach(expected => {
        const found = detectedHorizontal.find(d => Math.abs(d - expected) <= 10);
        if (found) {
            correctH++;
        } else {
            missedH++;
        }
    });

    detectedHorizontal.forEach(detected => {
        if (!expectedHorizontal.some(e => Math.abs(e - detected) <= 10)) {
            falseH++;
        }
    });

    console.log('\n结果评估:');
    console.log(`  垂直分隔符: 正确=${correctV}, 误检=${falseV}, 漏检=${missedV}`);
    console.log(`  水平分隔符: 正确=${correctH}, 误检=${falseH}, 漏检=${missedH}`);

    const totalCorrect = correctV + correctH;
    const totalFalse = falseV + falseH;
    const totalMissed = missedV + missedH;
    const totalExpected = expectedVertical.length + expectedHorizontal.length;

    const precision = totalCorrect / (totalCorrect + totalFalse) || 0;
    const recall = totalCorrect / totalExpected || 0;
    const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

    console.log(`  总体: 精确率=${(precision * 100).toFixed(1)}%, 召回率=${(recall * 100).toFixed(1)}%, F1=${(f1 * 100).toFixed(1)}%`);

    if (precision >= 0.90 && recall === 1.0 && f1 >= 0.95) {
        console.log('\n✓ 达到目标！');
    } else {
        console.log('\n✗ 未达到目标');
        console.log(`  目标: 精确率 >= 90%, 召回率 = 100%, F1 >= 95%`);
    }
}

testComplexImage().catch(console.error);
