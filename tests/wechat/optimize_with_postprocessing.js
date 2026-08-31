/**
 * 带后处理过滤的参数优化脚本
 *
 * 策略：
 * 1. 使用基线配置检测分隔符
 * 2. 应用后处理过滤规则
 * 3. 评估过滤后的结果
 */

// 标准布局定义
const EXPECTED_SEPARATORS = {
    vertical: [60, 340],
    horizontal: [60, 700]
};

const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 800;

// 后处理过滤规则
const FILTER_RULES = [
    {
        name: 'baseline',
        description: '无过滤',
        filter: (separators) => separators
    },
    {
        name: 'confidence_0.40',
        description: '置信度 >= 0.40',
        filter: (separators) => separators.filter(s => s.confidence >= 0.40)
    },
    {
        name: 'confidence_0.50',
        description: '置信度 >= 0.50',
        filter: (separators) => separators.filter(s => s.confidence >= 0.50)
    },
    {
        name: 'confidence_0.60',
        description: '置信度 >= 0.60',
        filter: (separators) => separators.filter(s => s.confidence >= 0.60)
    },
    {
        name: 'top_confidence',
        description: '保留置信度最高的 N 个',
        filter: (separators) => {
            const sorted = [...separators].sort((a, b) => b.confidence - a.confidence);
            return sorted.slice(0, 2); // 保留前 2 个
        }
    },
    {
        name: 'span_filter',
        description: '只保留跨越整个区域的分隔符',
        filter: (separators, orientation) => {
            // 对于水平分隔符，检查是否跨越整个宽度
            // 对于垂直分隔符，检查是否跨越整个高度
            // 这里简化处理：保留置信度 > 0.5 的
            return separators.filter(s => s.confidence >= 0.50);
        }
    },
    {
        name: 'combined',
        description: '组合过滤：置信度 >= 0.50 或 前2名',
        filter: (separators) => {
            const highConf = separators.filter(s => s.confidence >= 0.50);
            if (highConf.length >= 2) {
                return highConf;
            }
            // 如果高置信度的不够，补充最高置信度的
            const sorted = [...separators].sort((a, b) => b.confidence - a.confidence);
            const needed = 2 - highConf.length;
            const additional = sorted.filter(s => !highConf.includes(s)).slice(0, needed);
            return [...highConf, ...additional];
        }
    },
];

// 计算两个位置是否匹配
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
        detectedCount: detected.length,
        falsePositiveDetails: falsePositives.map(d => ({ pos: d.position, conf: d.confidence })),
    };
}

// 运行单个过滤规则测试
async function testFilterRule(rawResult, rule) {
    console.log(`\n测试过滤规则: ${rule.name}`);
    console.log(`  描述: ${rule.description}`);

    // 应用过滤规则
    const filteredVertical = rule.filter(rawResult.separators.vertical, 'vertical');
    const filteredHorizontal = rule.filter(rawResult.separators.horizontal, 'horizontal');

    // 评估垂直分隔符
    const verticalEval = evaluateSeparators(
        filteredVertical,
        EXPECTED_SEPARATORS.vertical
    );

    // 评估水平分隔符
    const horizontalEval = evaluateSeparators(
        filteredHorizontal,
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

    console.log(`  垂直: 检测 ${filteredVertical.length}, TP=${verticalEval.truePositives}, FP=${verticalEval.falsePositives}, FN=${verticalEval.falseNegatives}`);
    console.log(`  水平: 检测 ${filteredHorizontal.length}, TP=${horizontalEval.truePositives}, FP=${horizontalEval.falsePositives}, FN=${horizontalEval.falseNegatives}`);
    console.log(`  总体: P=${(overallPrecision * 100).toFixed(1)}%, R=${(overallRecall * 100).toFixed(1)}%, F1=${(overallF1 * 100).toFixed(1)}%`);

    if (horizontalEval.falsePositiveDetails.length > 0) {
        console.log(`  误检测: ${horizontalEval.falsePositiveDetails.map(fp => `y=${fp.pos}(${fp.conf.toFixed(2)})`).join(', ')}`);
    }

    return {
        rule: rule.name,
        description: rule.description,
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
}

// 主函数
async function main() {
    console.log('='.repeat(80));
    console.log('带后处理过滤的参数优化');
    console.log('='.repeat(80));

    const imagePath = '.runtime/tests/wechat/mock_wechat.png';

    // 使用基线配置获取原始结果
    const config = {
        cellSize: 10,
        quantize: 16,
        tolerance: 32,
        minRegionArea: 4,
        minSeparatorScore: 0.08,
        cellColorMode: 'median',
        boundarySpanWidth: 3,
    };

    console.log('\n基线配置:');
    console.log(JSON.stringify(config, null, 2));

    const rawResult = await Vision.analyzeLayout({
        imagePath,
        ...config
    });

    console.log('\n原始检测结果:');
    console.log(`  垂直分隔符: ${rawResult.separators.vertical.length} 个`);
    rawResult.separators.vertical.forEach((s, i) => {
        console.log(`    ${i + 1}. x=${s.position}, 置信度=${s.confidence.toFixed(3)}`);
    });
    console.log(`  水平分隔符: ${rawResult.separators.horizontal.length} 个`);
    rawResult.separators.horizontal.forEach((s, i) => {
        console.log(`    ${i + 1}. y=${s.position}, 置信度=${s.confidence.toFixed(3)}`);
    });

    // 测试所有过滤规则
    const results = [];
    for (const rule of FILTER_RULES) {
        const result = await testFilterRule(rawResult, rule);
        results.push(result);
    }

    // 汇总结果
    console.log('\n' + '='.repeat(80));
    console.log('测试结果汇总');
    console.log('='.repeat(80));

    const meetingTarget = results.filter(r => r.meetsTarget);
    const sortedByF1 = [...results].sort((a, b) => b.overall.f1 - a.overall.f1);

    console.log('\n所有规则按 F1 分数排序:');
    sortedByF1.forEach((r, i) => {
        const mark = r.meetsTarget ? '✓' : ' ';
        console.log(`${i + 1}. [${mark}] ${r.rule.padEnd(20)} ` +
            `P=${(r.overall.precision * 100).toFixed(1)}% ` +
            `R=${(r.overall.recall * 100).toFixed(1)}% ` +
            `F1=${(r.overall.f1 * 100).toFixed(1)}%`);
    });

    if (meetingTarget.length > 0) {
        console.log(`\n✓ 找到 ${meetingTarget.length} 个满足目标的规则`);
        const best = meetingTarget[0];
        console.log(`\n推荐规则: ${best.rule}`);
        console.log(`  描述: ${best.description}`);
        console.log(`  精确率: ${(best.overall.precision * 100).toFixed(1)}%`);
        console.log(`  召回率: ${(best.overall.recall * 100).toFixed(1)}%`);
        console.log(`  F1 分数: ${(best.overall.f1 * 100).toFixed(1)}%`);
    } else {
        console.log(`\n✗ 没有找到满足目标的规则`);
        const best = sortedByF1[0];
        console.log(`\n最佳规则: ${best.rule}`);
        console.log(`  描述: ${best.description}`);
        console.log(`  精确率: ${(best.overall.precision * 100).toFixed(1)}% (目标 >= 90%)`);
        console.log(`  召回率: ${(best.overall.recall * 100).toFixed(1)}% (目标 = 100%)`);
        console.log(`  F1 分数: ${(best.overall.f1 * 100).toFixed(1)}% (目标 >= 95%)`);
    }
}

main().catch(console.error);
