/**
 * 测试模拟微信图片并生成完整的可视化数据
 */

// 期望的分隔符定义
const EXPECTED = {
    vertical: [
        { position: 60, label: '侧边栏|聊天列表', tolerance: 10 },
        { position: 340, label: '聊天列表|聊天内容', tolerance: 10 }
    ],
    horizontal: [
        { position: 60, label: '聊天头部|消息区域', tolerance: 10 },
        { position: 700, label: '消息区域|输入区域', tolerance: 10 }
    ]
};

// 标准区域定义
const STANDARD_REGIONS = [
    { x: 0, y: 0, width: 60, height: 800, label: '侧边栏', name: 'sidebar' },
    { x: 60, y: 0, width: 280, height: 800, label: '聊天列表', name: 'chatList' },
    { x: 340, y: 0, width: 860, height: 60, label: '聊天头部', name: 'chatHeader' },
    { x: 340, y: 60, width: 860, height: 640, label: '消息区域', name: 'chatMessages' },
    { x: 340, y: 700, width: 860, height: 100, label: '输入区域', name: 'chatInput' }
];

async function testWithMode(mode, config) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`测试 ${mode.toUpperCase()} 模式`);
    console.log('='.repeat(80));

    const imagePath = '.runtime/tests/wechat/mock_wechat.png';

    console.log('\n配置参数:');
    console.log(JSON.stringify(config, null, 2));

    const result = await Vision.analyzeLayout({
        imagePath,
        ...config
    });

    console.log(`\n检测到: ${result.separators.vertical.length}个垂直分隔符, ${result.separators.horizontal.length}个水平分隔符`);

    // 评估分隔符
    const evaluation = evaluateSeparators(result.separators);

    console.log('\n垂直分隔符:');
    result.separators.vertical.forEach((sep, i) => {
        const status = sep.isCorrect ? '✓' : '✗';
        console.log(`  ${status} ${i + 1}. x=${Math.round(sep.position)}, 置信度=${sep.confidence.toFixed(3)}, 范围=[${Math.round(sep.start)}, ${Math.round(sep.end)}]`);
    });

    console.log('\n水平分隔符:');
    result.separators.horizontal.forEach((sep, i) => {
        const status = sep.isCorrect ? '✓' : '✗';
        console.log(`  ${status} ${i + 1}. y=${Math.round(sep.position)}, 置信度=${sep.confidence.toFixed(3)}, 范围=[${Math.round(sep.start)}, ${Math.round(sep.end)}]`);
    });

    console.log('\n性能指标:');
    console.log(`  精确率: ${(evaluation.precision * 100).toFixed(1)}%`);
    console.log(`  召回率: ${(evaluation.recall * 100).toFixed(1)}%`);
    console.log(`  F1 分数: ${(evaluation.f1 * 100).toFixed(1)}%`);

    // 识别区域
    const regions = identifyRegions(result.separators, result.width, result.height);

    console.log(`\n识别的区域: ${regions.length}个`);
    regions.forEach(r => {
        const status = r.matched ? '✓' : '✗';
        console.log(`  ${status} ${r.label}: [${r.x}, ${r.y}, ${r.width}x${r.height}]`);
    });

    // 生成JSON数据
    const outputData = {
        mode: mode,
        precision: evaluation.precision * 100,
        recall: evaluation.recall * 100,
        f1: evaluation.f1 * 100,
        separators: {
            vertical: result.separators.vertical.map(s => ({
                position: s.position,
                start: s.start || 0,
                end: s.end || result.height,
                confidence: s.confidence,
                isCorrect: s.isCorrect || false
            })),
            horizontal: result.separators.horizontal.map(s => ({
                position: s.position,
                start: s.start || 0,
                end: s.end || result.width,
                confidence: s.confidence,
                isCorrect: s.isCorrect || false
            }))
        },
        regions: regions
    };

    const jsonPath = `.runtime/tests/wechat/result_${mode}.json`;
    const jsonContent = JSON.stringify(outputData, null, 2);

    // 注意：在goja环境中，我们需要使用特定的方式写文件
    console.log(`\n准备保存JSON到: ${jsonPath}`);
    console.log('JSON内容预览:');
    console.log(jsonContent.substring(0, 500) + '...');

    return { result, evaluation, regions, jsonPath, jsonContent };
}

function evaluateSeparators(separators) {
    let correctV = 0, correctH = 0;
    let falseV = 0, falseH = 0;
    let missedV = 0, missedH = 0;

    const detectedVertical = separators.vertical || [];
    const detectedHorizontal = separators.horizontal || [];

    // 标记正确的检测
    EXPECTED.vertical.forEach(expected => {
        const found = detectedVertical.find(d => Math.abs(d.position - expected.position) <= expected.tolerance);
        if (found) {
            correctV++;
            found.isCorrect = true;
        } else {
            missedV++;
        }
    });

    detectedVertical.forEach(detected => {
        if (!EXPECTED.vertical.some(e => Math.abs(e.position - detected.position) <= e.tolerance)) {
            falseV++;
        }
    });

    EXPECTED.horizontal.forEach(expected => {
        const found = detectedHorizontal.find(d => Math.abs(d.position - expected.position) <= expected.tolerance);
        if (found) {
            correctH++;
            found.isCorrect = true;
        } else {
            missedH++;
        }
    });

    detectedHorizontal.forEach(detected => {
        if (!EXPECTED.horizontal.some(e => Math.abs(e.position - detected.position) <= e.tolerance)) {
            falseH++;
        }
    });

    const totalCorrect = correctV + correctH;
    const totalFalse = falseV + falseH;
    const totalExpected = EXPECTED.vertical.length + EXPECTED.horizontal.length;

    const precision = totalCorrect / (totalCorrect + totalFalse) || 0;
    const recall = totalCorrect / totalExpected || 0;
    const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

    return { precision, recall, f1, correctV, correctH, falseV, falseH, missedV, missedH };
}

function identifyRegions(separators, width, height) {
    const vertical = (separators.vertical || []).map(s => s.position).sort((a, b) => a - b);
    const horizontal = (separators.horizontal || []).map(s => s.position).sort((a, b) => a - b);

    const regions = [];

    // 根据检测到的分隔符识别区域
    if (vertical.length >= 2) {
        // 侧边栏
        regions.push({
            x: 0,
            y: 0,
            width: Math.round(vertical[0]),
            height: height,
            label: '侧边栏',
            matched: matchesStandardRegion({ x: 0, y: 0, width: Math.round(vertical[0]), height }, 'sidebar')
        });

        // 聊天列表
        regions.push({
            x: Math.round(vertical[0]),
            y: 0,
            width: Math.round(vertical[1] - vertical[0]),
            height: height,
            label: '聊天列表',
            matched: matchesStandardRegion({ x: Math.round(vertical[0]), y: 0, width: Math.round(vertical[1] - vertical[0]), height }, 'chatList')
        });

        // 右侧区域（可能进一步分割）
        if (horizontal.length >= 2) {
            // 聊天头部
            regions.push({
                x: Math.round(vertical[1]),
                y: 0,
                width: width - Math.round(vertical[1]),
                height: Math.round(horizontal[0]),
                label: '聊天头部',
                matched: matchesStandardRegion({ x: Math.round(vertical[1]), y: 0, width: width - Math.round(vertical[1]), height: Math.round(horizontal[0]) }, 'chatHeader')
            });

            // 消息区域
            regions.push({
                x: Math.round(vertical[1]),
                y: Math.round(horizontal[0]),
                width: width - Math.round(vertical[1]),
                height: Math.round(horizontal[1] - horizontal[0]),
                label: '消息区域',
                matched: matchesStandardRegion({ x: Math.round(vertical[1]), y: Math.round(horizontal[0]), width: width - Math.round(vertical[1]), height: Math.round(horizontal[1] - horizontal[0]) }, 'chatMessages')
            });

            // 输入区域
            regions.push({
                x: Math.round(vertical[1]),
                y: Math.round(horizontal[1]),
                width: width - Math.round(vertical[1]),
                height: height - Math.round(horizontal[1]),
                label: '输入区域',
                matched: matchesStandardRegion({ x: Math.round(vertical[1]), y: Math.round(horizontal[1]), width: width - Math.round(vertical[1]), height: height - Math.round(horizontal[1]) }, 'chatInput')
            });
        } else {
            // 整个右侧区域
            regions.push({
                x: Math.round(vertical[1]),
                y: 0,
                width: width - Math.round(vertical[1]),
                height: height,
                label: '内容区域',
                matched: false
            });
        }
    }

    return regions;
}

function matchesStandardRegion(detected, name) {
    const standard = STANDARD_REGIONS.find(r => r.name === name);
    if (!standard) return false;

    const tolerance = 20; // 20像素容差
    return Math.abs(detected.x - standard.x) <= tolerance &&
           Math.abs(detected.y - standard.y) <= tolerance &&
           Math.abs(detected.width - standard.width) <= tolerance &&
           Math.abs(detected.height - standard.height) <= tolerance;
}

async function main() {
    console.log('='.repeat(80));
    console.log('微信布局识别测试 - 带完整可视化数据');
    console.log('='.repeat(80));

    // 测试 Median 模式
    const medianResult = await testWithMode('median', {
        cellSize: 10,
        quantize: 16,
        tolerance: 32,
        minRegionArea: 4,
        minSeparatorScore: 0.08,
        cellColorMode: 'median',
        boundarySpanWidth: 3,
    });

    // 测试 Mean 模式
    const meanResult = await testWithMode('mean', {
        cellSize: 10,
        quantize: 16,
        tolerance: 32,
        minRegionArea: 4,
        minSeparatorScore: 0.14,
        cellColorMode: 'mean',
        boundarySpanWidth: 1,
    });

    console.log('\n' + '='.repeat(80));
    console.log('对比总结');
    console.log('='.repeat(80));
    console.log(`\nMedian 模式: F1=${medianResult.evaluation.f1.toFixed(1)}%, 精确率=${medianResult.evaluation.precision.toFixed(1)}%`);
    console.log(`Mean 模式:   F1=${meanResult.evaluation.f1.toFixed(1)}%, 精确率=${meanResult.evaluation.precision.toFixed(1)}%`);

    console.log('\n✅ 测试完成');
    console.log('\n【下一步】生成可视化图片:');
    console.log('  cd tests/wechat');
    console.log('  go run ./tests/wechat/tools/visualize-improved .runtime/tests/wechat/mock_wechat.png .runtime/tests/wechat/result_median.json');
    console.log('  go run ./tests/wechat/tools/visualize-improved .runtime/tests/wechat/mock_wechat.png .runtime/tests/wechat/result_mean.json');
    console.log('\n说明:');
    console.log('  - 每个区域使用不同颜色的边框（不是填充）');
    console.log('  - 分隔符只画实际检测到的范围（不是整个宽度/高度）');
    console.log('  - 绿色线条 = 正确检测');
    console.log('  - 红色线条 = 误检测');

    // 由于goja环境的限制，我们需要手动保存JSON
    console.log('\n⚠️  请手动保存以下JSON内容:');
    console.log('\n--- median.json ---');
    console.log(medianResult.jsonContent);
    console.log('\n--- mean.json ---');
    console.log(meanResult.jsonContent);
}

main().catch(console.error);
