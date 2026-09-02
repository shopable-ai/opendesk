// WeChat Layout Visualization - Pure JavaScript Implementation
// Captures WeChat, analyzes layout, and generates annotated images with region labels

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

async function analyzeLayout(imagePath, config) {
    const imageBase64 = await ImageColor.loadBase64(imagePath);
    return await ImageColor.analyzeLayout(imageBase64, config);
}

function identifyRegions(vertical, horizontal, width, height) {
    const regions = [];

    // Sort vertical separators
    const vPositions = vertical.map(s => s.position).sort((a, b) => a - b);
    const hPositions = horizontal.map(s => s.position).sort((a, b) => a - b);

    // Identify vertical regions
    if (vPositions.length === 0) {
        regions.push({
            x: width / 2,
            y: height / 2,
            label: '主区域',
            bounds: { x: 0, y: 0, width, height }
        });
    } else if (vPositions.length === 1) {
        regions.push({
            x: vPositions[0] / 2,
            y: height / 2,
            label: '侧边栏',
            bounds: { x: 0, y: 0, width: vPositions[0], height }
        });
        regions.push({
            x: vPositions[0] + (width - vPositions[0]) / 2,
            y: height / 2,
            label: '内容区域',
            bounds: { x: vPositions[0], y: 0, width: width - vPositions[0], height }
        });
    } else if (vPositions.length >= 2) {
        regions.push({
            x: vPositions[0] / 2,
            y: height / 2,
            label: '侧边栏',
            bounds: { x: 0, y: 0, width: vPositions[0], height }
        });
        regions.push({
            x: vPositions[0] + (vPositions[1] - vPositions[0]) / 2,
            y: height / 2,
            label: '聊天列表',
            bounds: { x: vPositions[0], y: 0, width: vPositions[1] - vPositions[0], height }
        });
        regions.push({
            x: vPositions[1] + (width - vPositions[1]) / 2,
            y: height / 2,
            label: '内容区域',
            bounds: { x: vPositions[1], y: 0, width: width - vPositions[1], height }
        });
    }

    // Add toolbar region if there's a horizontal separator near the top
    if (hPositions.length > 0 && hPositions[0] < 100) {
        regions.push({
            x: width / 2,
            y: hPositions[0] / 2,
            label: '工具栏',
            bounds: { x: 0, y: 0, width, height: hPositions[0] }
        });
    }

    return regions;
}

async function generateAnnotatedImage(imagePath, result, mode, outputPath) {
    const separators = result.separators || {};
    const vertical = separators.vertical || [];
    const horizontal = separators.horizontal || [];

    console.log(`  生成 ${mode} 模式标注图片...`);
    console.log(`    垂直分隔符: ${vertical.length}个`);
    console.log(`    水平分隔符: ${horizontal.length}个`);

    // Identify regions
    const regions = identifyRegions(vertical, horizontal, result.width, result.height);
    console.log(`    识别区域: ${regions.length}个`);
    regions.forEach(r => console.log(`      - ${r.label} at (${Math.round(r.x)}, ${Math.round(r.y)})`));

    // Note: Image annotation with region labels would be done by Go code
    // This JS script focuses on analysis and region identification
    return { vertical, horizontal, regions };
}

async function main() {
    console.log('='.repeat(80));
    console.log('微信布局可视化 - JavaScript版本');
    console.log('='.repeat(80));
    console.log();

    try {
        // Step 1: Capture WeChat
        console.log('正在捕获微信窗口...');
        const wxInfo = await captureWechat();
        console.log(`✅ 截图完成: ${wxInfo.imagePath}`);
        console.log(`   窗口大小: ${wxInfo.window.width}x${wxInfo.window.height}`);

        // Step 2: Analyze with median mode
        console.log('\n分析 Median 模式...');
        const medianResult = await analyzeLayout(wxInfo.imagePath, {
            cellSize: 10,
            quantize: 16,
            tolerance: 32,
            minRegionArea: 4,
            minSeparatorScore: 0.08,
            cellColorMode: 'median',
            boundarySpanWidth: 3,
        });

        const medianAnnotation = await generateAnnotatedImage(
            wxInfo.imagePath,
            medianResult,
            'median',
            `${OUTPUT_DIR}/wechat_median.png`
        );

        // Step 3: Analyze with mean mode
        console.log('\n分析 Mean 模式...');
        const meanResult = await analyzeLayout(wxInfo.imagePath, {
            cellSize: 10,
            quantize: 16,
            tolerance: 32,
            minRegionArea: 4,
            minSeparatorScore: 0.14,
            cellColorMode: 'mean',
            boundarySpanWidth: 1,
        });

        const meanAnnotation = await generateAnnotatedImage(
            wxInfo.imagePath,
            meanResult,
            'mean',
            `${OUTPUT_DIR}/wechat_mean.png`
        );

        // Step 4: Summary
        console.log('\n' + '='.repeat(80));
        console.log('分析结果对比');
        console.log('='.repeat(80));
        console.log(`\nMedian 模式: ${medianAnnotation.vertical.length}V + ${medianAnnotation.horizontal.length}H, ${medianAnnotation.regions.length}个区域`);
        console.log(`Mean 模式:   ${meanAnnotation.vertical.length}V + ${meanAnnotation.horizontal.length}H, ${meanAnnotation.regions.length}个区域`);

        console.log('\n✅ 分析完成');
        console.log('\n可选：对当前截图运行离线像素标注工具');
        console.log('  go run ./tests/wechat/tools/visualize-layout --image ' +
            `${OUTPUT_DIR}/wechat_original.png --output ${OUTPUT_DIR}`);

    } catch (error) {
        console.error('\n❌ 错误:', error.message);
        throw error;
    }
}

main().catch(console.error);
