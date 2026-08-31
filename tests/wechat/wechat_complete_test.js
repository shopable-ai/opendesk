/**
 * WeChat Complete Test with Image Generation
 *
 * This script:
 * 1. Detects WeChat window
 * 2. Captures screenshot
 * 3. Analyzes layout with both median and mean modes
 * 4. Generates annotated images showing detected regions
 * 5. Saves results to .runtime/tests/wechat/wechat_test_output/ directory
 */

const wait = (ms) => page.waitFor(ms);

// Configuration
const CONFIG = {
    outputDir: '.runtime/tests/wechat/wechat_test_output',
    cellSize: 10,
    quantize: 16,
    tolerance: 32,
    minRegionArea: 4,
    boundarySpanWidth: 3,

    // Median mode settings
    median: {
        minSeparatorScore: 0.08,
        cellColorMode: 'median',
    },

    // Mean mode settings
    mean: {
        minSeparatorScore: 0.14,
        cellColorMode: 'mean',
    }
};

/**
 * Find WeChat window
 */
async function findWechatWindow() {
    console.log('🔍 正在查找微信窗口...');

    const list = await window.list();
    const wechatWindows = (list || [])
        .filter((w) => {
            const exe = String(w?.exeName || '').toLowerCase();
            const title = String(w?.title || '').toLowerCase();
            return exe.includes('wechat') || title.includes('微信') || title.includes('wechat');
        })
        .sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0));

    if (wechatWindows.length === 0) {
        throw new Error('❌ 未找到微信窗口，请先打开并登录微信桌面版');
    }

    const wx = wechatWindows[0];
    console.log(`✅ 找到微信窗口: ${wx.title}`);
    console.log(`   窗口大小: ${wx.width}x${wx.height}`);
    console.log(`   窗口位置: (${wx.x}, ${wx.y})`);

    return wx;
}

/**
 * Capture WeChat screenshot
 */
async function captureWechatScreenshot(wx) {
    console.log('\n📸 正在截取微信窗口...');

    // Bring window to front
    await window.bringToTop(wx.title, wx.processId || wx.processID || wx.pid || 0);
    await wait(1000);

    // Capture screenshot
    const screenshotPath = `${CONFIG.outputDir}/wechat_original.png`;

    await page.screenshot({
        path: screenshotPath,
        target: 'screen',
        clip: { x: wx.x, y: wx.y, width: wx.width, height: wx.height },
    });

    console.log(`✅ 截图已保存: ${screenshotPath}`);
    return screenshotPath;
}

/**
 * Analyze layout with specific mode
 */
async function analyzeLayoutWithMode(imageBase64, mode, settings) {
    console.log(`\n🔬 分析布局 (${mode} 模式)...`);

    const options = {
        cellSize: CONFIG.cellSize,
        quantize: CONFIG.quantize,
        tolerance: CONFIG.tolerance,
        minRegionArea: CONFIG.minRegionArea,
        boundarySpanWidth: CONFIG.boundarySpanWidth,
        ...settings
    };

    const result = await ImageColor.analyzeLayout(imageBase64, options);

    const vCount = (result.separators?.vertical || []).length;
    const hCount = (result.separators?.horizontal || []).length;

    console.log(`   垂直分隔符: ${vCount}个`);
    console.log(`   水平分隔符: ${hCount}个`);
    console.log(`   总计: ${vCount + hCount}个`);

    return result;
}

/**
 * Generate annotated image
 */
async function generateAnnotatedImage(imagePath, result, mode) {
    console.log(`\n🎨 生成标注图片 (${mode} 模式)...`);

    const outputPath = `${CONFIG.outputDir}/wechat_annotated_${mode}.png`;

    // Load original image
    const imageBase64 = await ImageColor.loadBase64(imagePath);

    // Generate annotated image with separators
    const annotated = await ImageColor.drawSeparators(imageBase64, result.separators, {
        verticalColor: '#FF0000',    // Red for vertical
        horizontalColor: '#00FF00',  // Green for horizontal
        lineWidth: 2,
        showConfidence: true
    });

    // Save annotated image
    await ImageColor.saveBase64(annotated, outputPath);

    console.log(`✅ 标注图片已保存: ${outputPath}`);
    return outputPath;
}

/**
 * Generate region visualization
 */
async function generateRegionVisualization(imagePath, result, mode) {
    console.log(`\n🗺️  生成区域可视化 (${mode} 模式)...`);

    const outputPath = `${CONFIG.outputDir}/wechat_regions_${mode}.png`;

    // Load original image
    const imageBase64 = await ImageColor.loadBase64(imagePath);

    // Generate region visualization
    const regions = await ImageColor.visualizeRegions(imageBase64, result.separators, {
        showBoundaries: true,
        showLabels: true,
        colorScheme: 'rainbow'
    });

    // Save visualization
    await ImageColor.saveBase64(regions, outputPath);

    console.log(`✅ 区域可视化已保存: ${outputPath}`);
    return outputPath;
}

/**
 * Print comparison results
 */
function printComparison(medianResult, meanResult) {
    console.log('\n' + '='.repeat(80));
    console.log('📊 分析结果对比');
    console.log('='.repeat(80));

    const medianV = medianResult.separators?.vertical || [];
    const medianH = medianResult.separators?.horizontal || [];
    const meanV = meanResult.separators?.vertical || [];
    const meanH = meanResult.separators?.horizontal || [];

    console.log('\n【Median 模式】');
    console.log(`  垂直分隔符: ${medianV.length}个`);
    console.log(`  水平分隔符: ${medianH.length}个`);
    console.log(`  总计: ${medianV.length + medianH.length}个`);

    if (medianV.length > 0) {
        const avgConf = medianV.reduce((sum, s) => sum + s.confidence, 0) / medianV.length;
        console.log(`  平均置信度: ${avgConf.toFixed(3)}`);
        console.log(`  位置: [${medianV.map(s => s.position).join(', ')}]`);
    }

    console.log('\n【Mean 模式】');
    console.log(`  垂直分隔符: ${meanV.length}个`);
    console.log(`  水平分隔符: ${meanH.length}个`);
    console.log(`  总计: ${meanV.length + meanH.length}个`);

    if (meanV.length > 0) {
        const avgConf = meanV.reduce((sum, s) => sum + s.confidence, 0) / meanV.length;
        console.log(`  平均置信度: ${avgConf.toFixed(3)}`);
        console.log(`  位置: [${meanV.map(s => s.position).join(', ')}]`);
    }

    console.log('\n【对比分析】');
    const medianTotal = medianV.length + medianH.length;
    const meanTotal = meanV.length + meanH.length;
    const diff = medianTotal - meanTotal;
    const diffPct = meanTotal > 0 ? ((diff / meanTotal) * 100).toFixed(1) : '0.0';

    console.log(`  差异: ${diff > 0 ? '+' : ''}${diff} (${diffPct}%)`);
    console.log(`  推荐模式: ${medianTotal > meanTotal ? 'Median' : 'Mean'}`);
}

/**
 * Save results summary
 */
async function saveResultsSummary(wx, medianResult, meanResult) {
    console.log('\n💾 保存结果摘要...');

    const summary = {
        timestamp: new Date().toISOString(),
        window: {
            title: wx.title,
            size: `${wx.width}x${wx.height}`,
            position: `(${wx.x}, ${wx.y})`
        },
        config: CONFIG,
        results: {
            median: {
                vertical: medianResult.separators?.vertical || [],
                horizontal: medianResult.separators?.horizontal || [],
                total: (medianResult.separators?.vertical || []).length +
                       (medianResult.separators?.horizontal || []).length
            },
            mean: {
                vertical: meanResult.separators?.vertical || [],
                horizontal: meanResult.separators?.horizontal || [],
                total: (meanResult.separators?.vertical || []).length +
                       (meanResult.separators?.horizontal || []).length
            }
        },
        files: {
            original: `${CONFIG.outputDir}/wechat_original.png`,
            medianAnnotated: `${CONFIG.outputDir}/wechat_annotated_median.png`,
            meanAnnotated: `${CONFIG.outputDir}/wechat_annotated_mean.png`,
            medianRegions: `${CONFIG.outputDir}/wechat_regions_median.png`,
            meanRegions: `${CONFIG.outputDir}/wechat_regions_mean.png`,
            summary: `${CONFIG.outputDir}/results_summary.json`
        }
    };

    // Note: File writing will be handled by the Go runtime
    console.log('✅ 结果摘要已准备');

    return summary;
}

/**
 * Main test function
 */
async function main() {
    console.log('='.repeat(80));
    console.log('🚀 微信完整测试 - 图片生成');
    console.log('='.repeat(80));
    console.log();

    try {
        // Step 1: Find WeChat window
        const wx = await findWechatWindow();
        await wait(500);

        // Step 2: Capture screenshot
        const screenshotPath = await captureWechatScreenshot(wx);
        await wait(500);

        // Step 3: Load image
        console.log('\n📂 加载图片...');
        const imageBase64 = await ImageColor.loadBase64(screenshotPath);
        console.log('✅ 图片已加载');

        // Step 4: Analyze with both modes
        const medianResult = await analyzeLayoutWithMode(
            imageBase64,
            'Median',
            CONFIG.median
        );

        const meanResult = await analyzeLayoutWithMode(
            imageBase64,
            'Mean',
            CONFIG.mean
        );

        // Step 5: Generate annotated images
        await generateAnnotatedImage(screenshotPath, medianResult, 'median');
        await generateAnnotatedImage(screenshotPath, meanResult, 'mean');

        // Step 6: Generate region visualizations
        await generateRegionVisualization(screenshotPath, medianResult, 'median');
        await generateRegionVisualization(screenshotPath, meanResult, 'mean');

        // Step 7: Print comparison
        printComparison(medianResult, meanResult);

        // Step 8: Save summary
        const summary = await saveResultsSummary(wx, medianResult, meanResult);

        // Final output
        console.log('\n' + '='.repeat(80));
        console.log('✅ 测试完成！');
        console.log('='.repeat(80));
        console.log('\n📁 生成的文件:');
        console.log(`   1. ${summary.files.original}`);
        console.log(`   2. ${summary.files.medianAnnotated}`);
        console.log(`   3. ${summary.files.meanAnnotated}`);
        console.log(`   4. ${summary.files.medianRegions}`);
        console.log(`   5. ${summary.files.meanRegions}`);
        console.log(`   6. ${summary.files.summary}`);
        console.log('\n💡 提示:');
        console.log('   - 红色线条表示垂直分隔符');
        console.log('   - 绿色线条表示水平分隔符');
        console.log('   - 对比两种模式的结果，选择更适合的参数');

        return summary;

    } catch (error) {
        console.error('\n❌ 错误:', error.message);
        console.error(error.stack);
        throw error;
    }
}

// Run the test
main().catch(console.error);
