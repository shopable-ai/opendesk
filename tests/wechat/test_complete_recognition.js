// Complete Layout Recognition Test with Visual Comparison
// 完整的布局识别测试，带可视化对比

const wait = (ms) => page.waitFor(ms);

// 颜色定义
const COLORS = {
    correctSeparator: { r: 0, g: 255, b: 0, a: 1.0 },      // 绿色 - 正确的分隔符
    wrongSeparator: { r: 255, g: 0, b: 0, a: 1.0 },        // 红色 - 错误的分隔符
    missingSeparator: { r: 255, g: 165, b: 0, a: 1.0 },    // 橙色 - 漏检的分隔符

    // 区域颜色
    sidebar: { r: 255, g: 200, b: 200, a: 0.3 },           // 浅红色
    chatList: { r: 200, g: 255, b: 200, a: 0.3 },          // 浅绿色
    chatHeader: { r: 200, g: 200, b: 255, a: 0.3 },        // 浅蓝色
    chatMessages: { r: 255, g: 255, b: 200, a: 0.3 },      // 浅黄色
    chatInput: { r: 255, g: 200, b: 255, a: 0.3 },         // 浅洋红
};

async function loadMockLayout() {
    // 读取标准布局定义
    const layoutPath = '.runtime/tests/wechat/mock_layout.json';

    // 注意：在 goja 环境中无法直接读取文件
    // 这里我们硬编码标准布局
    return {
        width: 1200,
        height: 800,
        regions: [
            { name: 'sidebar', label: '侧边栏', x: 0, y: 0, width: 60, height: 800 },
            { name: 'chatList', label: '聊天列表', x: 60, y: 0, width: 280, height: 800 },
            { name: 'chatHeader', label: '聊天头部', x: 340, y: 0, width: 860, height: 60 },
            { name: 'chatMessages', label: '消息区域', x: 340, y: 60, width: 860, height: 640 },
            { name: 'chatInput', label: '输入区域', x: 340, y: 700, width: 860, height: 100 },
        ],
        expectedSeparators: {
            vertical: [
                { position: 60, label: '侧边栏|聊天列表' },
                { position: 340, label: '聊天列表|聊天内容' }
            ],
            horizontal: [
                { position: 60, label: '聊天头部|消息区域' },
                { position: 700, label: '消息区域|输入区域' }
            ]
        }
    };
}

function matchSeparator(detected, expected, tolerance = 15) {
    return Math.abs(detected - expected) < tolerance;
}

function validateSeparators(detected, expected, tolerance = 15) {
    const results = {
        correct: [],      // 正确检测的
        wrong: [],        // 误检测的
        missing: []       // 漏检的
    };

    // 检查每个期望的分隔符是否被检测到
    expected.forEach(exp => {
        const found = detected.find(d => matchSeparator(d.position, exp.position, tolerance));
        if (found) {
            results.correct.push({
                expected: exp,
                detected: found,
                error: Math.abs(found.position - exp.position)
            });
        } else {
            results.missing.push(exp);
        }
    });

    // 检查是否有误检测
    detected.forEach(det => {
        const isExpected = expected.some(exp => matchSeparator(det.position, exp.position, tolerance));
        if (!isExpected) {
            results.wrong.push(det);
        }
    });

    return results;
}

function assignRegionByPosition(x, y, mockLayout) {
    // 根据坐标判断属于哪个区域
    for (const region of mockLayout.regions) {
        if (x >= region.x && x < region.x + region.width &&
            y >= region.y && y < region.y + region.height) {
            return region;
        }
    }
    return null;
}

async function testWithMode(imagePath, mode, config, mockLayout) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`测试 ${mode.toUpperCase()} 模式`);
    console.log('='.repeat(80));

    // 分析布局
    const result = await Vision.analyzeLayout({
        imagePath: imagePath,
        ...config
    });

    const detectedV = result.separators?.vertical || [];
    const detectedH = result.separators?.horizontal || [];
    const detectedRegions = result.regions || [];

    console.log(`\n检测结果:`);
    console.log(`  垂直分隔符: ${detectedV.length}个`);
    console.log(`  水平分隔符: ${detectedH.length}个`);
    console.log(`  识别区域: ${detectedRegions.length}个`);

    // 验证垂直分隔符
    console.log(`\n验证垂直分隔符:`);
    const vResults = validateSeparators(detectedV, mockLayout.expectedSeparators.vertical);

    console.log(`  ✅ 正确检测: ${vResults.correct.length}个`);
    vResults.correct.forEach(r => {
        console.log(`      ${r.expected.label}: 期望=${r.expected.position}, 实际=${Math.round(r.detected.position)}, 误差=${r.error.toFixed(1)}px`);
    });

    if (vResults.missing.length > 0) {
        console.log(`  ❌ 漏检: ${vResults.missing.length}个`);
        vResults.missing.forEach(m => {
            console.log(`      ${m.label}: 期望=${m.position}`);
        });
    }

    if (vResults.wrong.length > 0) {
        console.log(`  ⚠️  误检测: ${vResults.wrong.length}个`);
        vResults.wrong.forEach(w => {
            console.log(`      位置=${Math.round(w.position)}, 置信度=${w.confidence.toFixed(3)}`);
        });
    }

    // 验证水平分隔符
    console.log(`\n验证水平分隔符:`);
    const hResults = validateSeparators(detectedH, mockLayout.expectedSeparators.horizontal);

    console.log(`  ✅ 正确检测: ${hResults.correct.length}个`);
    hResults.correct.forEach(r => {
        console.log(`      ${r.expected.label}: 期望=${r.expected.position}, 实际=${Math.round(r.detected.position)}, 误差=${r.error.toFixed(1)}px`);
    });

    if (hResults.missing.length > 0) {
        console.log(`  ❌ 漏检: ${hResults.missing.length}个`);
        hResults.missing.forEach(m => {
            console.log(`      ${m.label}: 期望=${m.position}`);
        });
    }

    if (hResults.wrong.length > 0) {
        console.log(`  ⚠️  误检测: ${hResults.wrong.length}个`);
        hResults.wrong.forEach(w => {
            console.log(`      位置=${Math.round(w.position)}, 置信度=${w.confidence.toFixed(3)}`);
        });
    }

    // 计算准确率
    const totalExpected = mockLayout.expectedSeparators.vertical.length + mockLayout.expectedSeparators.horizontal.length;
    const totalCorrect = vResults.correct.length + hResults.correct.length;
    const totalMissing = vResults.missing.length + hResults.missing.length;
    const totalWrong = vResults.wrong.length + hResults.wrong.length;

    const precision = totalCorrect / (totalCorrect + totalWrong) * 100;  // 精确率
    const recall = totalCorrect / totalExpected * 100;                    // 召回率
    const f1 = 2 * (precision * recall) / (precision + recall);           // F1分数

    console.log(`\n性能指标:`);
    console.log(`  精确率 (Precision): ${precision.toFixed(1)}% (${totalCorrect}/${totalCorrect + totalWrong})`);
    console.log(`  召回率 (Recall):    ${recall.toFixed(1)}% (${totalCorrect}/${totalExpected})`);
    console.log(`  F1 分数:            ${f1.toFixed(1)}%`);
    console.log(`  漏检数:             ${totalMissing}个`);
    console.log(`  误检数:             ${totalWrong}个`);

    // 为检测到的区域分配名称
    console.log(`\n区域识别:`);
    const labeledRegions = detectedRegions.map(region => {
        const centerX = region.bbox.x + region.bbox.width / 2;
        const centerY = region.bbox.y + region.bbox.height / 2;
        const matchedRegion = assignRegionByPosition(centerX, centerY, mockLayout);

        if (matchedRegion) {
            console.log(`  ✅ 区域 (${Math.round(region.bbox.x)}, ${Math.round(region.bbox.y)}, ${Math.round(region.bbox.width)}x${Math.round(region.bbox.height)}) -> ${matchedRegion.label}`);
            return {
                ...region,
                label: matchedRegion.label,
                name: matchedRegion.name,
                matched: true
            };
        } else {
            console.log(`  ⚠️  区域 (${Math.round(region.bbox.x)}, ${Math.round(region.bbox.y)}, ${Math.round(region.bbox.width)}x${Math.round(region.bbox.height)}) -> 未匹配`);
            return {
                ...region,
                label: '未知区域',
                name: 'unknown',
                matched: false
            };
        }
    });

    return {
        mode,
        precision: parseFloat(precision.toFixed(1)),
        recall: parseFloat(recall.toFixed(1)),
        f1: parseFloat(f1.toFixed(1)),
        vResults,
        hResults,
        labeledRegions,
        result
    };
}

async function generateComparisonVisualization(imagePath, testResult, mockLayout, outputPath) {
    console.log(`\n生成对比可视化: ${outputPath}`);

    // 准备标注数据
    const annotations = {
        correctSeparators: {
            vertical: [],
            horizontal: []
        },
        wrongSeparators: {
            vertical: [],
            horizontal: []
        },
        missingSeparators: {
            vertical: [],
            horizontal: []
        },
        regions: []
    };

    // 正确的垂直分隔符（绿色）
    testResult.vResults.correct.forEach(r => {
        annotations.correctSeparators.vertical.push({
            position: Math.round(r.detected.position),
            label: r.expected.label,
            color: 'green'
        });
    });

    // 误检测的垂直分隔符（红色）
    testResult.vResults.wrong.forEach(w => {
        annotations.wrongSeparators.vertical.push({
            position: Math.round(w.position),
            confidence: w.confidence,
            color: 'red'
        });
    });

    // 漏检的垂直分隔符（橙色）
    testResult.vResults.missing.forEach(m => {
        annotations.missingSeparators.vertical.push({
            position: m.position,
            label: m.label,
            color: 'orange'
        });
    });

    // 正确的水平分隔符（绿色）
    testResult.hResults.correct.forEach(r => {
        annotations.correctSeparators.horizontal.push({
            position: Math.round(r.detected.position),
            label: r.expected.label,
            color: 'green'
        });
    });

    // 误检测的水平分隔符（红色）
    testResult.hResults.wrong.forEach(w => {
        annotations.wrongSeparators.horizontal.push({
            position: Math.round(w.position),
            confidence: w.confidence,
            color: 'red'
        });
    });

    // 漏检的水平分隔符（橙色）
    testResult.hResults.missing.forEach(m => {
        annotations.missingSeparators.horizontal.push({
            position: m.position,
            label: m.label,
            color: 'orange'
        });
    });

    // 区域标注
    testResult.labeledRegions.forEach(region => {
        annotations.regions.push({
            bbox: region.bbox,
            label: region.label,
            name: region.name,
            matched: region.matched
        });
    });

    console.log(`  标注统计:`);
    console.log(`    绿色线条（正确）: ${annotations.correctSeparators.vertical.length}V + ${annotations.correctSeparators.horizontal.length}H`);
    console.log(`    红色线条（误检）: ${annotations.wrongSeparators.vertical.length}V + ${annotations.wrongSeparators.horizontal.length}H`);
    console.log(`    橙色线条（漏检）: ${annotations.missingSeparators.vertical.length}V + ${annotations.missingSeparators.horizontal.length}H`);
    console.log(`    区域标签: ${annotations.regions.length}个`);

    // 注意：Vision.annotateRegions 可能不支持这种复杂的标注
    // 这里我们返回标注数据，由 Go 代码处理
    return annotations;
}

async function main() {
    console.log('='.repeat(80));
    console.log('微信布局识别完整测试 - 带可视化对比');
    console.log('='.repeat(80));
    console.log();

    try {
        // 加载标准布局
        const mockLayout = await loadMockLayout();
        const imagePath = '.runtime/tests/wechat/mock_wechat.png';

        console.log('标准布局定义:');
        console.log(`  尺寸: ${mockLayout.width}x${mockLayout.height}`);
        console.log(`  区域数: ${mockLayout.regions.length}个`);
        mockLayout.regions.forEach(r => {
            console.log(`    [${r.name}] ${r.label}: (${r.x}, ${r.y}, ${r.width}x${r.height})`);
        });

        console.log(`\n期望的分隔符:`);
        console.log(`  垂直: ${mockLayout.expectedSeparators.vertical.length}个`);
        mockLayout.expectedSeparators.vertical.forEach(s => {
            console.log(`    x=${s.position}: ${s.label}`);
        });
        console.log(`  水平: ${mockLayout.expectedSeparators.horizontal.length}个`);
        mockLayout.expectedSeparators.horizontal.forEach(s => {
            console.log(`    y=${s.position}: ${s.label}`);
        });

        // 测试 Median 模式
        const medianResult = await testWithMode(imagePath, 'median', {
            cellSize: 10,
            quantize: 16,
            tolerance: 32,
            minRegionArea: 4,
            minSeparatorScore: 0.08,
            cellColorMode: 'median',
            boundarySpanWidth: 3,
        }, mockLayout);

        // 生成可视化
        const medianAnnotations = await generateComparisonVisualization(
            imagePath,
            medianResult,
            mockLayout,
            '.runtime/tests/wechat/mock_median_comparison.png'
        );

        // 测试 Mean 模式
        const meanResult = await testWithMode(imagePath, 'mean', {
            cellSize: 10,
            quantize: 16,
            tolerance: 32,
            minRegionArea: 4,
            minSeparatorScore: 0.14,
            cellColorMode: 'mean',
            boundarySpanWidth: 1,
        }, mockLayout);

        // 生成可视化
        const meanAnnotations = await generateComparisonVisualization(
            imagePath,
            meanResult,
            mockLayout,
            '.runtime/tests/wechat/mock_mean_comparison.png'
        );

        // 对比结果
        console.log('\n' + '='.repeat(80));
        console.log('测试结果对比');
        console.log('='.repeat(80));

        console.log(`\nMedian 模式:`);
        console.log(`  精确率: ${medianResult.precision}%`);
        console.log(`  召回率: ${medianResult.recall}%`);
        console.log(`  F1 分数: ${medianResult.f1}%`);
        console.log(`  正确: ${medianResult.vResults.correct.length}V + ${medianResult.hResults.correct.length}H`);
        console.log(`  漏检: ${medianResult.vResults.missing.length}V + ${medianResult.hResults.missing.length}H`);
        console.log(`  误检: ${medianResult.vResults.wrong.length}V + ${medianResult.hResults.wrong.length}H`);

        console.log(`\nMean 模式:`);
        console.log(`  精确率: ${meanResult.precision}%`);
        console.log(`  召回率: ${meanResult.recall}%`);
        console.log(`  F1 分数: ${meanResult.f1}%`);
        console.log(`  正确: ${meanResult.vResults.correct.length}V + ${meanResult.hResults.correct.length}H`);
        console.log(`  漏检: ${meanResult.vResults.missing.length}V + ${meanResult.hResults.missing.length}H`);
        console.log(`  误检: ${meanResult.vResults.wrong.length}V + ${meanResult.hResults.wrong.length}H`);

        // 推荐模式
        console.log(`\n推荐模式:`);
        if (medianResult.f1 > meanResult.f1) {
            console.log(`  ✅ Median 模式 (F1=${medianResult.f1}% > ${meanResult.f1}%)`);
        } else if (meanResult.f1 > medianResult.f1) {
            console.log(`  ✅ Mean 模式 (F1=${meanResult.f1}% > ${medianResult.f1}%)`);
        } else {
            console.log(`  ⚠️  两种模式 F1 分数相同 (${medianResult.f1}%)`);
        }

        console.log('\n' + '='.repeat(80));
        console.log('✅ 测试完成');
        console.log('='.repeat(80));

        console.log('\n说明:');
        console.log('  绿色线条 - 正确检测的分隔符');
        console.log('  红色线条 - 误检测的分隔符');
        console.log('  橙色线条 - 漏检的分隔符（期望但未检测到）');
        console.log('  不同颜色区域 - 识别的区域，带中文标签');

        console.log('\n下一步:');
        console.log('  需要使用 Go 代码生成带颜色标注的可视化图片');
        console.log('  因为 Vision API 不支持多颜色分隔符标注');

    } catch (error) {
        console.error('\n❌ 错误:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        throw error;
    }
}

main().catch(console.error);
