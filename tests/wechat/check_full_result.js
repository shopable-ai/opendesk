/**
 * 检查算法返回的完整结果
 * 包括 separators 和 regions
 */

async function checkFullResult() {
    console.log('='.repeat(80));
    console.log('检查算法返回的完整结果');
    console.log('='.repeat(80));

    const result = await Vision.analyzeLayout({
        imagePath: '.runtime/tests/wechat/simple_wechat.png',
        cellSize: 10,
        quantize: 16,
        tolerance: 32,
        minRegionArea: 4,
        minSeparatorScore: 0.08,
        cellColorMode: 'median',
        boundarySpanWidth: 3,
    });

    console.log('\n返回的数据结构:');
    console.log('  keys:', Object.keys(result));

    console.log('\n1. Separators (分隔线):');
    console.log('  vertical:', result.separators.vertical.length, '条');
    result.separators.vertical.forEach((sep, i) => {
        console.log(`    ${i + 1}. position=${sep.position}, confidence=${sep.confidence.toFixed(3)}`);
    });
    console.log('  horizontal:', result.separators.horizontal.length, '条');
    result.separators.horizontal.forEach((sep, i) => {
        console.log(`    ${i + 1}. position=${sep.position}, confidence=${sep.confidence.toFixed(3)}`);
    });

    console.log('\n2. Regions (色块区域):');
    if (result.regions && result.regions.length > 0) {
        console.log('  总数:', result.regions.length, '个');
        result.regions.forEach((region, i) => {
            console.log(`    ${i + 1}. id=${region.id}, bbox=${JSON.stringify(region.bbox)}, color=${region.avgColor}`);
        });
    } else {
        console.log('  ⚠️  没有返回 regions 数据！');
    }

    console.log('\n3. FloodRegions (泛洪填充区域):');
    if (result.floodRegions && result.floodRegions.length > 0) {
        console.log('  总数:', result.floodRegions.length, '个');
        result.floodRegions.slice(0, 5).forEach((region, i) => {
            console.log(`    ${i + 1}. bbox=${JSON.stringify(region.bbox)}, color=${region.avgColor}`);
        });
    } else {
        console.log('  没有 floodRegions 数据');
    }

    console.log('\n' + '='.repeat(80));
    console.log('结论');
    console.log('='.repeat(80));
    console.log('\n算法返回的是:');
    console.log('  1. separators - 分隔线的位置（x 或 y 坐标）');
    console.log('  2. regions - 分割后的色块区域（矩形）');
    console.log('  3. floodRegions - 泛洪填充识别的区域');
    console.log('\n我之前只关注了 separators，忽略了 regions！');
}

checkFullResult().catch(console.error);
