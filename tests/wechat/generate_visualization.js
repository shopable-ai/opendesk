/**
 * 生成带标注的可视化图片
 */

async function generateVisualization() {
    console.log('='.repeat(80));
    console.log('生成可视化标注图片');
    console.log('='.repeat(80));

    const imagePath = '.runtime/tests/wechat/ground_truth_simple.png';

    // 完全自动识别
    console.log('\n运行识别...');
    const result = await Vision.analyzeLayout({
        imagePath,
        cellSize: 10,
        quantize: 16,
        tolerance: 32,
        minRegionArea: 4,
        minSeparatorScore: 0.08,
        cellColorMode: 'median',
        boundarySpanWidth: 3
    });

    console.log(`识别到 ${result.regions.length} 个区域:`);
    result.regions.forEach((r, i) => {
        console.log(`  ${i+1}. ${r.id}: (${r.bbox.x}, ${r.bbox.y}, ${r.bbox.width}, ${r.bbox.height}) - ${r.avgColor}`);
    });

    // 生成标注图片
    console.log('\n生成标注图片...');
    await Vision.annotateRegions({
        imagePath,
        regions: result.regions,
        separators: result.separators,
        outputPath: '.runtime/tests/wechat/ground_truth_annotated.png',
        title: 'Auto Recognition - 5 Regions Detected'
    });

    console.log('✓ 已生成: .runtime/tests/wechat/ground_truth_annotated.png');
    console.log('\n查看图片:');
    console.log('  open .runtime/tests/wechat/ground_truth_simple.png        # 原始图片');
    console.log('  open .runtime/tests/wechat/ground_truth_annotated.png    # 标注结果');
}

generateVisualization().catch(console.error);
