/**
 * 查看过滤前的所有候选分隔符
 */

async function inspectRawCandidates() {
    console.log('='.repeat(80));
    console.log('原始候选分隔符检查');
    console.log('='.repeat(80));

    const imagePath = '.runtime/tests/wechat/mock_wechat.png';

    const result = await Vision.analyzeLayout({
        imagePath,
        cellSize: 10,
        quantize: 16,
        tolerance: 32,
        minRegionArea: 4,
        minSeparatorScore: 0.08,
        cellColorMode: 'median',
        boundarySpanWidth: 3,
    });

    console.log('\n检测到的分隔符（过滤后）:');
    console.log(`  垂直: ${result.separators.vertical.length} 个`);
    result.separators.vertical.forEach(s => {
        console.log(`    x=${s.position}, 置信度=${s.confidence.toFixed(3)}`);
    });
    console.log(`  水平: ${result.separators.horizontal.length} 个`);
    result.separators.horizontal.forEach(s => {
        console.log(`    y=${s.position}, 置信度=${s.confidence.toFixed(3)}`);
    });

    // 检查 rootCandidates（过滤前的所有候选）
    if (result.debug && result.debug.rootCandidates) {
        console.log('\n原始候选分隔符（过滤前）:');
        const candidates = result.debug.rootCandidates;
        if (candidates.vertical) {
            console.log(`  垂直候选: ${candidates.vertical.length} 个`);
            candidates.vertical.forEach(s => {
                console.log(`    x=${s.position}, 置信度=${s.confidence.toFixed(3)}`);
            });
        }
        if (candidates.horizontal) {
            console.log(`  水平候选: ${candidates.horizontal.length} 个`);
            candidates.horizontal.forEach(s => {
                console.log(`    y=${s.position}, 置信度=${s.confidence.toFixed(3)}`);
            });
        }
    }
}

inspectRawCandidates().catch(console.error);
