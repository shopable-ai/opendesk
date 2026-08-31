/**
 * 生成带有区域标注的可视化图片
 */

async function visualizeRegions() {
    console.log('='.repeat(80));
    console.log('生成区域标注可视化');
    console.log('='.repeat(80));

    // 测试简化场景
    console.log('\n1. 简化场景（纯色矩形）');
    console.log('-'.repeat(80));

    const simpleResult = await Vision.analyzeLayout({
        imagePath: '.runtime/tests/wechat/simple_wechat.png',
        cellSize: 10,
        quantize: 16,
        tolerance: 32,
        minRegionArea: 4,
        minSeparatorScore: 0.08,
        cellColorMode: 'median',
        boundarySpanWidth: 3,
    });

    console.log(`  识别到 ${simpleResult.regions.length} 个区域`);
    simpleResult.regions.forEach((region, i) => {
        console.log(`    ${i + 1}. ${region.id}: (${region.bbox.x}, ${region.bbox.y}, ${region.bbox.width}, ${region.bbox.height}) - ${region.avgColor}`);
    });

    // 使用 Vision.annotateRegions 生成标注图片
    const simpleAnnotated = await Vision.annotateRegions({
        imagePath: '.runtime/tests/wechat/simple_wechat.png',
        regions: simpleResult.regions,
        separators: simpleResult.separators,
        outputPath: '.runtime/tests/wechat/simple_regions_annotated.png',
        title: 'Simple Scene - Regions'
    });

    console.log(`  ✓ 已生成: ${simpleAnnotated.outputPath}`);

    // 测试复杂场景
    console.log('\n2. 复杂场景（包含细节）');
    console.log('-'.repeat(80));

    const complexResult = await Vision.analyzeLayout({
        imagePath: '.runtime/tests/wechat/mock_wechat.png',
        cellSize: 10,
        quantize: 16,
        tolerance: 32,
        minRegionArea: 4,
        minSeparatorScore: 0.08,
        cellColorMode: 'median',
        boundarySpanWidth: 3,
    });

    console.log(`  识别到 ${complexResult.regions.length} 个区域`);
    complexResult.regions.slice(0, 10).forEach((region, i) => {
        console.log(`    ${i + 1}. ${region.id}: (${region.bbox.x}, ${region.bbox.y}, ${region.bbox.width}, ${region.bbox.height}) - ${region.avgColor}`);
    });

    const complexAnnotated = await Vision.annotateRegions({
        imagePath: '.runtime/tests/wechat/mock_wechat.png',
        regions: complexResult.regions,
        separators: complexResult.separators,
        outputPath: '.runtime/tests/wechat/complex_regions_annotated.png',
        title: 'Complex Scene - Regions'
    });

    console.log(`  ✓ 已生成: ${complexAnnotated.outputPath}`);

    // 测试位置提示策略
    console.log('\n3. 位置提示策略');
    console.log('-'.repeat(80));

    const hintResult = await Vision.analyzeLayout({
        imagePath: '.runtime/tests/wechat/mock_wechat.png',
        separatorHints: {
            vertical: [
                { label: 'sidebar', from: 0.04, to: 0.06 },
                { label: 'content', from: 0.27, to: 0.29 }
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
        boundarySpanWidth: 3,
    });

    console.log(`  识别到 ${hintResult.regions.length} 个区域`);
    hintResult.regions.forEach((region, i) => {
        console.log(`    ${i + 1}. ${region.id}: (${region.bbox.x}, ${region.bbox.y}, ${region.bbox.width}, ${region.bbox.height}) - ${region.avgColor}`);
    });

    const hintAnnotated = await Vision.annotateRegions({
        imagePath: '.runtime/tests/wechat/mock_wechat.png',
        regions: hintResult.regions,
        separators: hintResult.separators,
        outputPath: '.runtime/tests/wechat/hint_regions_annotated.png',
        title: 'Position Hints - Regions'
    });

    console.log(`  ✓ 已生成: ${hintAnnotated.outputPath}`);

    console.log('\n' + '='.repeat(80));
    console.log('查看生成的图片:');
    console.log('='.repeat(80));
    console.log('\n  open .runtime/tests/wechat/simple_regions_annotated.png');
    console.log('  open .runtime/tests/wechat/complex_regions_annotated.png');
    console.log('  open .runtime/tests/wechat/hint_regions_annotated.png');
}

visualizeRegions().catch(console.error);
