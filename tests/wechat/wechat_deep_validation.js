// WeChat Deep Validation Test
// 1. Capture WeChat window
// 2. Analyze with both modes
// 3. Generate annotated images
// 4. Compare results

const wait = (ms) => page.waitFor(ms);
const OUTPUT_DIR = '.runtime/tests/wechat/wechat_validation';

async function getWechatWindow() {
    const list = await window.list();
    const wx = (list || [])
        .filter((w) => {
            const exe = String(w?.exeName || '').toLowerCase();
            const title = String(w?.title || '').toLowerCase();
            return exe.includes('wechat') || title.includes('微信') || title.includes('wechat');
        })
        .sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0))[0];

    if (!wx?.title) {
        throw new Error('未找到微信窗口，请先打开并登录微信桌面版');
    }
    return wx;
}

async function captureWechat() {
    console.log('正在查找微信窗口...');
    const wx = await getWechatWindow();

    console.log(`找到微信窗口: ${wx.title}`);
    console.log(`窗口大小: ${wx.width}x${wx.height}`);
    console.log(`窗口位置: (${wx.x}, ${wx.y})`);

    // Bring to front
    await window.bringToTop(wx.title, wx.processId || wx.processID || wx.pid || 0);
    await wait(1000);

    // Capture screenshot
    const screenshotPath = OUTPUT_DIR + '/wechat_original.png';

    await page.screenshot({
        path: screenshotPath,
        target: 'screen',
        clip: { x: wx.x, y: wx.y, width: wx.width, height: wx.height },
    });

    console.log(`✅ 截图已保存: ${screenshotPath}`);
    return { window: wx, imagePath: screenshotPath };
}

async function analyzeWechat(imagePath) {
    console.log('\n开始分析微信布局...');

    const imageBase64 = await ImageColor.loadBase64(imagePath);

    // Analyze with median mode
    console.log('  测试 Median 模式...');
    const medianResult = await ImageColor.analyzeLayout(imageBase64, {
        cellSize: 10,
        quantize: 16,
        tolerance: 32,
        minRegionArea: 4,
        minSeparatorScore: 0.08,
        cellColorMode: 'median',
        boundarySpanWidth: 3,
    });

    // Analyze with mean mode
    console.log('  测试 Mean 模式...');
    const meanResult = await ImageColor.analyzeLayout(imageBase64, {
        cellSize: 10,
        quantize: 16,
        tolerance: 32,
        minRegionArea: 4,
        minSeparatorScore: 0.14,
        cellColorMode: 'mean',
        boundarySpanWidth: 1,
    });

    return { median: medianResult, mean: meanResult };
}

function printResults(results) {
    console.log('\n' + '='.repeat(80));
    console.log('分析结果对比');
    console.log('='.repeat(80));

    const medianSeps = results.median.separators;
    const meanSeps = results.mean.separators;

    const medianV = medianSeps.vertical || [];
    const medianH = medianSeps.horizontal || [];
    const meanV = meanSeps.vertical || [];
    const meanH = meanSeps.horizontal || [];

    console.log('\nMedian 模式:');
    console.log(`  垂直分隔符: ${medianV.length}个`);
    console.log(`  水平分隔符: ${medianH.length}个`);
    console.log(`  总计: ${medianV.length + medianH.length}个`);

    if (medianV.length > 0) {
        const positions = medianV.map(s => s.position).join(', ');
        const confidences = medianV.map(s => s.confidence.toFixed(3)).join(', ');
        console.log(`  垂直位置: [${positions}]`);
        console.log(`  垂直置信度: [${confidences}]`);
    }

    if (medianH.length > 0) {
        const positions = medianH.slice(0, 5).map(s => s.position).join(', ');
        console.log(`  水平位置(前5个): [${positions}]`);
    }

    console.log('\nMean 模式:');
    console.log(`  垂直分隔符: ${meanV.length}个`);
    console.log(`  水平分隔符: ${meanH.length}个`);
    console.log(`  总计: ${meanV.length + meanH.length}个`);

    if (meanV.length > 0) {
        const positions = meanV.map(s => s.position).join(', ');
        const confidences = meanV.map(s => s.confidence.toFixed(3)).join(', ');
        console.log(`  垂直位置: [${positions}]`);
        console.log(`  垂直置信度: [${confidences}]`);
    }

    if (meanH.length > 0) {
        const positions = meanH.slice(0, 5).map(s => s.position).join(', ');
        console.log(`  水平位置(前5个): [${positions}]`);
    }

    console.log('\n对比:');
    const diff = (medianV.length + medianH.length) - (meanV.length + meanH.length);
    const diffPct = ((diff / (meanV.length + meanH.length)) * 100).toFixed(1);
    console.log(`  差异: ${diff > 0 ? '+' : ''}${diff} (${diffPct}%)`);

    const medianAvgConf = [...medianV, ...medianH]
        .reduce((sum, s) => sum + s.confidence, 0) / (medianV.length + medianH.length || 1);
    const meanAvgConf = [...meanV, ...meanH]
        .reduce((sum, s) => sum + s.confidence, 0) / (meanV.length + meanH.length || 1);

    console.log(`  Median平均置信度: ${medianAvgConf.toFixed(3)}`);
    console.log(`  Mean平均置信度: ${meanAvgConf.toFixed(3)}`);
}

async function saveResultsJSON(wxInfo, results) {
    const outputPath = OUTPUT_DIR + '/analysis_results.json';

    const data = {
        timestamp: new Date().toISOString(),
        window: {
            title: wxInfo.window.title,
            size: `${wxInfo.window.width}x${wxInfo.window.height}`,
            position: `(${wxInfo.window.x}, ${wxInfo.window.y})`
        },
        median: {
            vertical: results.median.separators.vertical || [],
            horizontal: results.median.separators.horizontal || [],
            total: (results.median.separators.vertical || []).length +
                   (results.median.separators.horizontal || []).length
        },
        mean: {
            vertical: results.mean.separators.vertical || [],
            horizontal: results.mean.separators.horizontal || [],
            total: (results.mean.separators.vertical || []).length +
                   (results.mean.separators.horizontal || []).length
        }
    };

    // The Runtime script owns API analysis. Optional raster annotations are
    // produced by a standalone tool after this script finishes.
    console.log(`\n结果数据已准备；可选标注输出目录: ${OUTPUT_DIR}`);

    return data;
}

async function main() {
    console.log('='.repeat(80));
    console.log('微信深度验证测试');
    console.log('='.repeat(80));
    console.log();

    try {
        // Step 1: Capture WeChat
        const wxInfo = await captureWechat();
        await wait(500);

        // Step 2: Analyze
        const results = await analyzeWechat(wxInfo.imagePath);

        // Step 3: Print results
        printResults(results);

        // Step 4: Save results
        const data = await saveResultsJSON(wxInfo, results);

        console.log('\n' + '='.repeat(80));
        console.log('✅ 测试完成');
        console.log('='.repeat(80));
        console.log('\n下一步:');
        console.log('  1. 可选：go run ./tests/wechat/tools/visualize-layout ' +
            `--image ${OUTPUT_DIR}/wechat_original.png --output ${OUTPUT_DIR}`);
        console.log(`  2. 查看 ${OUTPUT_DIR}/ 目录`);
        console.log('  3. 对比 median 和 mean 模式的可视化结果');

        return data;

    } catch (error) {
        console.error('\n❌ 错误:', error.message);
        throw error;
    }
}

main().catch(console.error);
