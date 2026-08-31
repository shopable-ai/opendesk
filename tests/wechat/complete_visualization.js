// WeChat Complete Visualization
// 1. Capture WeChat window
// 2. Analyze layout with both modes
// 3. Generate annotated images with colored regions and labels

const wait = (ms) => page.waitFor(ms);
const fs = require('fs');
const path = require('path');
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
        throw new Error('未找到微信窗口');
    }
    return wx;
}

async function captureWechat() {
    const wx = await getWechatWindow();
    await window.bringToTop(wx.title, wx.processId || wx.processID || wx.pid || 0);
    await wait(1000);

    const screenshotPath = `${OUTPUT_DIR}/wechat_original.png`;
    await page.screenshot({
        path: screenshotPath,
        target: 'screen',
        clip: { x: wx.x, y: wx.y, width: wx.width, height: wx.height },
    });

    return { window: wx, imagePath: screenshotPath };
}

async function analyzeWithMode(imagePath, mode, config) {
    console.log(`\n分析 ${mode.toUpperCase()} 模式...`);
    const imageBase64 = await ImageColor.loadBase64(imagePath);
    const result = await ImageColor.analyzeLayout(imageBase64, config);

    const vertical = result.separators?.vertical || [];
    const horizontal = result.separators?.horizontal || [];

    console.log(`  检测到: ${vertical.length}个垂直分隔符 + ${horizontal.length}个水平分隔符`);

    if (vertical.length > 0) {
        const positions = vertical.map(s => Math.round(s.position)).join(', ');
        console.log(`  垂直位置: [${positions}]`);
    }

    return result;
}

function saveAnalysisJSON(result, mode, outputDir) {
    const jsonPath = `${outputDir}/analysis_${mode}.json`;
    const data = JSON.stringify({
        separators: result.separators,
        width: result.width,
        height: result.height
    }, null, 2);

    // Note: In goja runtime, file writing is limited
    // The visualization tool will read this data
    console.log(`  准备保存: ${jsonPath}`);
    return jsonPath;
}

async function generateVisualization(mode, jsonPath, originalPath, outputPath) {
    console.log(`\n生成 ${mode.toUpperCase()} 可视化...`);
    console.log(`  运行: go run ./tests/wechat/tools/generate-visualization ${originalPath} ${jsonPath} ${outputPath}`);
    // This would be executed externally
}

async function main() {
    console.log('='.repeat(80));
    console.log('微信完整可视化 - 彩色区域标记');
    console.log('='.repeat(80));
    console.log();

    try {
        // Step 1: Capture WeChat
        console.log('【步骤 1】捕获微信窗口');
        const wxInfo = await captureWechat();
        console.log(`✅ 截图完成: ${wxInfo.imagePath}`);
        console.log(`   窗口大小: ${wxInfo.window.width}x${wxInfo.window.height}`);

        // Step 2: Analyze with median mode
        console.log('\n【步骤 2】Median 模式分析');
        const medianResult = await analyzeWithMode(wxInfo.imagePath, 'median', {
            cellSize: 10,
            quantize: 16,
            tolerance: 32,
            minRegionArea: 4,
            minSeparatorScore: 0.08,
            cellColorMode: 'median',
            boundarySpanWidth: 3,
        });

        // Step 3: Analyze with mean mode
        console.log('\n【步骤 3】Mean 模式分析');
        const meanResult = await analyzeWithMode(wxInfo.imagePath, 'mean', {
            cellSize: 10,
            quantize: 16,
            tolerance: 32,
            minRegionArea: 4,
            minSeparatorScore: 0.14,
            cellColorMode: 'mean',
            boundarySpanWidth: 1,
        });

        // Step 4: Summary
        const medianV = medianResult.separators?.vertical?.length || 0;
        const medianH = medianResult.separators?.horizontal?.length || 0;
        const meanV = meanResult.separators?.vertical?.length || 0;
        const meanH = meanResult.separators?.horizontal?.length || 0;

        console.log('\n' + '='.repeat(80));
        console.log('分析结果对比');
        console.log('='.repeat(80));
        console.log(`\nMedian 模式: ${medianV}V + ${medianH}H = ${medianV + medianH}个分隔符`);
        console.log(`Mean 模式:   ${meanV}V + ${meanH}H = ${meanV + meanH}个分隔符`);

        console.log('\n✅ 分析完成');
        console.log('\n【下一步】生成彩色可视化图片:');
        console.log('  go run ./tests/wechat/tools/generate-visualization \\');
        console.log('    .runtime/tests/wechat/wechat_validation/wechat_original.png \\');
        console.log('    .runtime/tests/wechat/wechat_validation/analysis_median.json \\');
        console.log('    .runtime/tests/wechat/wechat_validation/wechat_median_colored.png');
        console.log('');
        console.log('说明:');
        console.log('  - 不同区域使用不同颜色的半透明覆盖层');
        console.log('  - 每个区域中心显示中文标签(侧边栏、聊天列表、内容区域等)');
        console.log('  - 红色线条标记垂直分隔符');
        console.log('  - 蓝色线条标记水平分隔符');

    } catch (error) {
        console.error('\n❌ 错误:', error.message);
        throw error;
    }
}

main().catch(console.error);
