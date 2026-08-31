/**
 * 微信布局识别算法参数优化脚本
 *
 * 目标：
 * - 精确率 > 90%
 * - 召回率 = 100%
 * - F1 分数 > 95%
 */

// 标准布局定义
const EXPECTED_SEPARATORS = {
    vertical: [60, 340],
    horizontal: [60, 700]
};

// 测试参数组合
const TEST_CONFIGS = [
    // 基线配置
    {
        name: 'baseline',
        cellSize: 10,
        quantize: 16,
        tolerance: 32,
        minRegionArea: 4,
        minSeparatorScore: 0.08,
        cellColorMode: 'median',
        boundarySpanWidth: 3,
    },
    // 提高 minSeparatorScore
    {
        name: 'score_0.10',
        cellSize: 10,
        quantize: 16,
        tolerance: 32,
        minRegionArea: 4,
        minSeparatorScore: 0.10,
        cellColorMode: 'median',
        boundarySpanWidth: 3,
    },
    {
        name: 'score_0.12',
        cellSize: 10,
        quantize: 16,
        tolerance: 32,
        minRegionArea: 4,
        minSeparatorScore: 0.12,
        cellColorMode: 'median',
        boundarySpanWidth: 3,
    },
    {
        name: 'score_0.15',
        cellSize: 10,
        quantize: 16,
        tolerance: 32,
        minRegionArea: 4,
        minSeparatorScore: 0.15,
        cellColorMode: 'median',
        boundarySpanWidth: 3,
    },
    {
        name: 'score_0.20',
        cellSize: 10,
        quantize: 16,
        tolerance: 32,
        minRegionArea: 4,
        minSeparatorScore: 0.20,
        cellColorMode: 'median',
        boundarySpanWidth: 3,
    },
    {
        name: 'score_0.25',
        cellSize: 10,
        quantize: 16,
        tolerance: 32,
        minRegionArea: 4,
        minSeparatorScore: 0.25,
        cellColorMode: 'median',
        boundarySpanWidth: 3,
    },
    {
        name: 'score_0.30',
        cellSize: 10,
        quantize: 16,
        tolerance: 32,
        minRegionArea: 4,
        minSeparatorScore: 0.30,
        cellColorMode: 'median',
        boundarySpanWidth: 3,
    },
];

// 计算两个位置是否匹配（允许一定误差）
function positionsMatch(pos1, pos2, tolerance = 5) {
    return Math.abs(pos1 - pos2) <= tolerance;
}

// 评估分隔符检测结果
function evaluateSeparators(detected, expected, tolerance = 5) {
    const truePositives = detected.filter(d =>
        expected.some(e => positionsMatch(d.position, e, tolerance))
    );
    const falsePositives = detected.filter(d =>
        !expected.some(e => positionsMatch(d.position, e, tolerance))
    );
    const falseNegatives = expected.filter(e =>
        !detected.some(d => positionsMatch(d.position, e, tolerance))
    );

    const precision = truePositives.length / (truePositives.length + falsePositives.length) || 0;
    const recall = truePositives.length / (truePositives.length + falseNegatives.length) || 0;
    const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

    return {
        truePositives: truePositives.length,
        falsePositives: falsePositives.length,
        falseNegatives: falseNegatives.length,
        precision,
        recall,
        f1,
        detectedPositions: detected.map(d => ({ pos: d.position, conf: d.confidence })),
        falsePositiveDetails: falsePositives.map(d => ({ pos: d.position, conf: d.confidence })),
    };
}

// 运行单个测试
async function runTest(config) {
    console.log(`\n测试配置: ${config.name}`);
    console.log(`  minSeparatorScore: ${config.minSeparatorScore}`);

    const imagePath = '.runtime/tests/wechat/mock_wechat.png';

    try {
        const result = await Vision.analyzeLayout({
            imagePath,
            ...config
        });

        // 评估垂直分隔符
        const verticalEval = evaluateSeparators(
            result.separators.vertical,
            EXPECTED_SEPARATORS.vertical
        );

        // 评估水平分隔符
        const horizontalEval = evaluateSeparators(
            result.separators.horizontal,
            EXPECTED_SEPARATORS.horizontal
        );

        // 计算总体指标
        const totalTP = verticalEval.truePositives + horizontalEval.truePositives;
        const totalFP = verticalEval.falsePositives + horizontalEval.falsePositives;
        const totalFN = verticalEval.falseNegatives + horizontalEval.falseNegatives;

        const overallPrecision = totalTP / (totalTP + totalFP) || 0;
        const overallRecall = totalTP / (totalTP + totalFN) || 0;
        const overallF1 = overallPrecision + overallRecall > 0
            ? 2 * (overallPrecision * overallRecall) / (overallPrecision + overallRecall)
            : 0;

        console.log(`  垂直分隔符: 检测 ${result.separators.vertical.length}, 期望 ${EXPECTED_SEPARATORS.vertical.length}`);
        console.log(`    TP=${verticalEval.truePositives}, FP=${verticalEval.falsePositives}, FN=${verticalEval.falseNegatives}`);
        console.log(`    精确率=${(verticalEval.precision * 100).toFixed(1)}%, 召回率=${(verticalEval.recall * 100).toFixed(1)}%`);

        console.log(`  水平分隔符: 检测 ${result.separators.horizontal.length}, 期望 ${EXPECTED_SEPARATORS.horizontal.length}`);
        console.log(`    TP=${horizontalEval.truePositives}, FP=${horizontalEval.falsePositives}, FN=${horizontalEval.falseNegatives}`);
        console.log(`    精确率=${(horizontalEval.precision * 100).toFixed(1)}%, 召回率=${(horizontalEval.recall * 100).toFixed(1)}%`);

        console.log(`  总体指标:`);
        console.log(`    精确率=${(overallPrecision * 100).toFixed(1)}%, 召回率=${(overallRecall * 100).toFixed(1)}%, F1=${(overallF1 * 100).toFixed(1)}%`);

        if (horizontalEval.falsePositiveDetails.length > 0) {
            console.log(`  误检测的水平分隔符:`);
            horizontalEval.falsePositiveDetails.forEach(fp => {
                console.log(`    y=${fp.pos} (置信度 ${fp.conf.toFixed(3)})`);
            });
        }

        return {
            config: config.name,
            minSeparatorScore: config.minSeparatorScore,
            vertical: verticalEval,
            horizontal: horizontalEval,
            overall: {
                precision: overallPrecision,
                recall: overallRecall,
                f1: overallF1,
                truePositives: totalTP,
                falsePositives: totalFP,
                falseNegatives: totalFN,
            },
            meetsTarget: overallPrecision >= 0.90 && overallRecall === 1.0 && overallF1 >= 0.95,
        };
    } catch (error) {
        console.error(`  错误: ${error.message}`);
        return null;
    }
}

// 主函数
async function main() {
    console.log('='.repeat(80));
    console.log('微信布局识别算法参数优化');
    console.log('='.repeat(80));
    console.log(`\n期望分隔符:`);
    console.log(`  垂直: ${EXPECTED_SEPARATORS.vertical.join(', ')}`);
    console.log(`  水平: ${EXPECTED_SEPARATORS.horizontal.join(', ')}`);
    console.log(`\n优化目标:`);
    console.log(`  精确率 >= 90%`);
    console.log(`  召回率 = 100%`);
    console.log(`  F1 分数 >= 95%`);

    const results = [];

    for (const config of TEST_CONFIGS) {
        const result = await runTest(config);
        if (result) {
            results.push(result);
        }
    }

    // 找出最佳配置
    console.log('\n' + '='.repeat(80));
    console.log('测试结果汇总');
    console.log('='.repeat(80));

    const meetingTarget = results.filter(r => r.meetsTarget);
    const sortedByF1 = [...results].sort((a, b) => b.overall.f1 - a.overall.f1);

    console.log('\n所有配置按 F1 分数排序:');
    sortedByF1.forEach((r, i) => {
        const mark = r.meetsTarget ? '✓' : ' ';
        console.log(`${i + 1}. [${mark}] ${r.config.padEnd(15)} ` +
            `score=${r.minSeparatorScore.toFixed(2)} ` +
            `P=${(r.overall.precision * 100).toFixed(1)}% ` +
            `R=${(r.overall.recall * 100).toFixed(1)}% ` +
            `F1=${(r.overall.f1 * 100).toFixed(1)}%`);
    });

    if (meetingTarget.length > 0) {
        console.log(`\n✓ 找到 ${meetingTarget.length} 个满足目标的配置`);
        const best = meetingTarget[0];
        console.log(`\n推荐配置: ${best.config}`);
        console.log(`  minSeparatorScore: ${best.minSeparatorScore}`);
        console.log(`  精确率: ${(best.overall.precision * 100).toFixed(1)}%`);
        console.log(`  召回率: ${(best.overall.recall * 100).toFixed(1)}%`);
        console.log(`  F1 分数: ${(best.overall.f1 * 100).toFixed(1)}%`);
    } else {
        console.log(`\n✗ 没有找到满足目标的配置`);
        const best = sortedByF1[0];
        console.log(`\n最佳配置: ${best.config}`);
        console.log(`  minSeparatorScore: ${best.minSeparatorScore}`);
        console.log(`  精确率: ${(best.overall.precision * 100).toFixed(1)}% (目标 >= 90%)`);
        console.log(`  召回率: ${(best.overall.recall * 100).toFixed(1)}% (目标 = 100%)`);
        console.log(`  F1 分数: ${(best.overall.f1 * 100).toFixed(1)}% (目标 >= 95%)`);
    }

    // 保存结果
    const outputPath = '.runtime/tests/wechat/optimization_results.json';
    const resultData = JSON.stringify({
        timestamp: new Date().toISOString(),
        results,
        best: sortedByF1[0],
        meetingTarget: meetingTarget.length > 0 ? meetingTarget[0] : null,
    }, null, 2);

    // 使用 System.writeFile 保存结果
    try {
        System.writeFile(outputPath, resultData);
        console.log(`\n结果已保存到: ${outputPath}`);
    } catch (error) {
        console.log(`\n无法保存结果文件: ${error.message}`);
    }
}

main().catch(console.error);
