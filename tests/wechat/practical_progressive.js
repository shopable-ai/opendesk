/**
 * 实用的渐进式识别方案
 *
 * 核心思想：
 * 1. 第一次识别：使用位置提示获取主要区域
 * 2. Agent 判断：检查哪些区域过大，需要继续细分
 * 3. 第二次识别：调整参数，对整个图片重新识别（使用更严格的参数）
 * 4. 智能合并：保留小区域，细分大区域
 */

async function practicalProgressiveRecognition() {
    console.log('='.repeat(80));
    console.log('实用渐进式识别方案');
    console.log('='.repeat(80));

    const imagePath = '.runtime/tests/wechat/mock_wechat.png';
    const imageWidth = 1200;
    const imageHeight = 800;

    // ========================================
    // 阶段 1: 使用位置提示进行粗分割
    // ========================================
    console.log('\n阶段 1: 粗分割（位置提示）');
    console.log('-'.repeat(80));

    const coarseResult = await Vision.analyzeLayout({
        imagePath,
        separatorHints: {
            vertical: [
                { label: 'sidebar', from: 0.04, to: 0.06 }  // 只提示侧边栏
            ]
        },
        cellSize: 10,
        quantize: 16,
        tolerance: 32,
        minRegionArea: 4,
        minSeparatorScore: 0.08,
        cellColorMode: 'median',
        boundarySpanWidth: 3
    });

    console.log(`  识别到 ${coarseResult.regions.length} 个区域`);
    coarseResult.regions.forEach((r, i) => {
        const area = r.bbox.width * r.bbox.height;
        const areaRatio = (area / (imageWidth * imageHeight) * 100).toFixed(1);
        console.log(`    ${i + 1}. ${r.id}: (${r.bbox.x}, ${r.bbox.y}, ${r.bbox.width}, ${r.bbox.height}) - 面积占比: ${areaRatio}%`);
    });

    // ========================================
    // 阶段 2: 分析哪些区域需要细分
    // ========================================
    console.log('\n阶段 2: 分析区域');
    console.log('-'.repeat(80));

    const totalArea = imageWidth * imageHeight;
    const analyzed = coarseResult.regions.map(r => {
        const area = r.bbox.width * r.bbox.height;
        const areaRatio = area / totalArea;

        return {
            region: r,
            area,
            areaRatio,
            needsSubdivision: areaRatio > 0.3  // 超过 30% 需要细分
        };
    });

    const needSubdivision = analyzed.filter(a => a.needsSubdivision);
    const confirmed = analyzed.filter(a => !a.needsSubdivision);

    console.log(`  确认的小区域: ${confirmed.length} 个`);
    confirmed.forEach(a => {
        console.log(`    ✓ ${a.region.id}: 面积占比 ${(a.areaRatio * 100).toFixed(1)}%`);
    });

    console.log(`  需要细分的大区域: ${needSubdivision.length} 个`);
    needSubdivision.forEach(a => {
        console.log(`    ⚠ ${a.region.id}: 面积占比 ${(a.areaRatio * 100).toFixed(1)}% - 需要继续分割`);
    });

    // ========================================
    // 阶段 3: 对大区域进行细分
    // ========================================
    console.log('\n阶段 3: 细分大区域');
    console.log('-'.repeat(80));

    if (needSubdivision.length > 0) {
        console.log('  策略: 使用更多位置提示进行细分');

        const fineResult = await Vision.analyzeLayout({
            imagePath,
            separatorHints: {
                vertical: [
                    { label: 'sidebar', from: 0.04, to: 0.06 },
                    { label: 'chatList', from: 0.27, to: 0.29 }  // 添加更多提示
                ],
                horizontal: [
                    { label: 'header', from: 0.06, to: 0.09 },
                    { label: 'input', from: 0.85, to: 0.90 }
                ]
            },
            cellSize: 10,
            quantize: 16,
            tolerance: 32,
            minRegionArea: 4,
            minSeparatorScore: 0.08,
            cellColorMode: 'median',
            boundarySpanWidth: 3
        });

        console.log(`  细分后识别到 ${fineResult.regions.length} 个区域`);
        fineResult.regions.forEach((r, i) => {
            const area = r.bbox.width * r.bbox.height;
            const areaRatio = (area / totalArea * 100).toFixed(1);
            console.log(`    ${i + 1}. ${r.id}: (${r.bbox.x}, ${r.bbox.y}, ${r.bbox.width}, ${r.bbox.height}) - 面积占比: ${areaRatio}%`);
        });

        // ========================================
        // 阶段 4: 生成可视化对比
        // ========================================
        console.log('\n阶段 4: 生成可视化对比');
        console.log('-'.repeat(80));

        // 粗分割可视化
        await Vision.annotateRegions({
            imagePath,
            regions: coarseResult.regions,
            separators: coarseResult.separators,
            outputPath: '.runtime/tests/wechat/progressive_coarse.png',
            title: 'Stage 1: Coarse (2 regions)'
        });
        console.log('  ✓ 粗分割: .runtime/tests/wechat/progressive_coarse.png');

        // 细分割可视化
        await Vision.annotateRegions({
            imagePath,
            regions: fineResult.regions,
            separators: fineResult.separators,
            outputPath: '.runtime/tests/wechat/progressive_fine.png',
            title: 'Stage 2: Fine (7 regions)'
        });
        console.log('  ✓ 细分割: .runtime/tests/wechat/progressive_fine.png');

        console.log('\n' + '='.repeat(80));
        console.log('结果对比');
        console.log('='.repeat(80));
        console.log(`  阶段 1（粗分割）: ${coarseResult.regions.length} 个区域`);
        console.log(`  阶段 2（细分割）: ${fineResult.regions.length} 个区域`);
        console.log('\n查看可视化:');
        console.log('  open .runtime/tests/wechat/progressive_coarse.png');
        console.log('  open .runtime/tests/wechat/progressive_fine.png');

        return {
            coarse: coarseResult,
            fine: fineResult
        };
    }

    return {
        coarse: coarseResult,
        fine: null
    };
}

// ========================================
// 方案 2: 使用不同参数进行多次识别
// ========================================
async function multiPassRecognition() {
    console.log('\n\n' + '='.repeat(80));
    console.log('方案 2: 多次识别 + 智能合并');
    console.log('='.repeat(80));

    const imagePath = '.runtime/tests/wechat/mock_wechat.png';

    // 第一次：保守识别（高阈值，识别主要分隔符）
    console.log('\n第一次识别: 保守策略（主要分隔符）');
    console.log('-'.repeat(80));

    const pass1 = await Vision.analyzeLayout({
        imagePath,
        cellSize: 10,
        quantize: 16,
        tolerance: 32,
        minRegionArea: 10,  // 更大的最小区域
        minSeparatorScore: 0.15,  // 更高的阈值
        cellColorMode: 'median',
        boundarySpanWidth: 3
    });

    console.log(`  识别到 ${pass1.regions.length} 个区域`);
    console.log(`  分隔符: 垂直 ${pass1.separators.vertical.length} 条, 水平 ${pass1.separators.horizontal.length} 条`);

    // 第二次：激进识别（低阈值，识别更多细节）
    console.log('\n第二次识别: 激进策略（更多细节）');
    console.log('-'.repeat(80));

    const pass2 = await Vision.analyzeLayout({
        imagePath,
        cellSize: 5,  // 更小的网格
        quantize: 8,  // 更细的量化
        tolerance: 20,  // 更小的容差
        minRegionArea: 2,
        minSeparatorScore: 0.03,  // 更低的阈值
        cellColorMode: 'median',
        boundarySpanWidth: 3
    });

    console.log(`  识别到 ${pass2.regions.length} 个区域`);
    console.log(`  分隔符: 垂直 ${pass2.separators.vertical.length} 条, 水平 ${pass2.separators.horizontal.length} 条`);

    // 生成可视化
    await Vision.annotateRegions({
        imagePath,
        regions: pass1.regions,
        separators: pass1.separators,
        outputPath: '.runtime/tests/wechat/multipass_conservative.png',
        title: 'Pass 1: Conservative'
    });

    await Vision.annotateRegions({
        imagePath,
        regions: pass2.regions,
        separators: pass2.separators,
        outputPath: '.runtime/tests/wechat/multipass_aggressive.png',
        title: 'Pass 2: Aggressive'
    });

    console.log('\n查看结果:');
    console.log('  open .runtime/tests/wechat/multipass_conservative.png');
    console.log('  open .runtime/tests/wechat/multipass_aggressive.png');
}

// 运行测试
async function runTests() {
    await practicalProgressiveRecognition();
    await multiPassRecognition();
}

runTests().catch(console.error);
