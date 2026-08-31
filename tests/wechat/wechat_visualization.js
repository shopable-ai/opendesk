// WeChat Layout Visualization - Pure JavaScript
// 完整的可视化解决方案：捕获、分析、生成带彩色区域标记的图片
// 输出位置: .runtime/tests/wechat/

const wait = (ms) => page.waitFor(ms);

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
    console.log('正在查找微信窗口...');
    const wx = await getWechatWindow();

    console.log(`找到微信窗口: ${wx.title}`);
    console.log(`窗口大小: ${wx.width}x${wx.height}`);

    await window.bringToTop(wx.title, wx.processId || wx.processID || wx.pid || 0);
    await wait(1000);

    const outputDir = '.runtime/tests/wechat';
    const screenshotPath = outputDir + '/wechat_original.png';

    await page.screenshot({
        path: screenshotPath,
        target: 'screen',
        clip: { x: wx.x, y: wx.y, width: wx.width, height: wx.height },
    });

    console.log(`✅ 截图保存: ${screenshotPath}`);
    return { window: wx, imagePath: screenshotPath };
}

async function analyzeAndVisualize(imagePath, mode, config, outputPath) {
    console.log(`\n【${mode.toUpperCase()} 模式】`);
    console.log('  分析中...');

    // 使用 Vision.analyzeLayout 分析布局
    const result = await Vision.analyzeLayout({
        imagePath: imagePath,
        ...config
    });

    const vertical = result.separators?.vertical || [];
    const horizontal = result.separators?.horizontal || [];
    const regions = result.regions || [];

    console.log(`  检测到: ${vertical.length}个垂直分隔符 + ${horizontal.length}个水平分隔符`);
    console.log(`  识别区域: ${regions.length}个`);

    if (vertical.length > 0) {
        const positions = vertical.map(s => Math.round(s.position)).join(', ');
        console.log(`  垂直位置: [${positions}]`);
    }

    // 为区域添加中文标签
    const vPositions = vertical.map(s => s.position).sort((a, b) => a - b);
    const labeledRegions = assignRegionLabels(regions, vPositions, result.width, result.height);

    console.log('  区域标签:');
    labeledRegions.forEach(r => {
        console.log(`    - ${r.label} (${Math.round(r.bbox.x)}, ${Math.round(r.bbox.y)}, ${Math.round(r.bbox.width)}x${Math.round(r.bbox.height)})`);
    });

    // 使用 Vision.annotateRegions 生成标注图片
    console.log('  生成可视化...');
    const annotated = await Vision.annotateRegions({
        imagePath: imagePath,
        regions: labeledRegions,
        separators: result.separators,
        outputPath: outputPath,
        title: `WeChat Layout - ${mode.toUpperCase()} Mode`
    });

    console.log(`✅ 可视化图片保存: ${outputPath}`);

    return {
        result,
        regions: labeledRegions,
        annotated
    };
}

function assignRegionLabels(regions, vPositions, width, height) {
    // 根据垂直分隔符位置为区域分配中文标签
    const labeled = [];

    if (vPositions.length === 0) {
        // 单一区域
        regions.forEach(r => {
            labeled.push({
                ...r,
                label: '主区域'
            });
        });
    } else if (vPositions.length === 1) {
        // 两个区域: 侧边栏 | 内容区域
        regions.forEach(r => {
            const centerX = r.bbox.x + r.bbox.width / 2;
            if (centerX < vPositions[0]) {
                labeled.push({ ...r, label: '侧边栏' });
            } else {
                labeled.push({ ...r, label: '内容区域' });
            }
        });
    } else if (vPositions.length >= 2) {
        // 三个或更多区域: 侧边栏 | 聊天列表 | 内容区域
        regions.forEach(r => {
            const centerX = r.bbox.x + r.bbox.width / 2;
            const centerY = r.bbox.y + r.bbox.height / 2;

            // 顶部工具栏
            if (centerY < 80 && r.bbox.height < 100) {
                labeled.push({ ...r, label: '工具栏' });
            }
            // 左侧侧边栏
            else if (centerX < vPositions[0]) {
                labeled.push({ ...r, label: '侧边栏' });
            }
            // 中间聊天列表
            else if (centerX >= vPositions[0] && centerX < vPositions[1]) {
                labeled.push({ ...r, label: '聊天列表' });
            }
            // 右侧内容区域
            else {
                labeled.push({ ...r, label: '内容区域' });
            }
        });
    }

    return labeled;
}

async function main() {
    console.log('='.repeat(80));
    console.log('微信布局可视化 - 纯 JavaScript 实现');
    console.log('='.repeat(80));
    console.log();

    try {
        // 步骤 1: 捕获微信窗口
        console.log('【步骤 1】捕获微信窗口');
        const wxInfo = await captureWechat();
        await wait(500);

        // 步骤 2: Median 模式分析和可视化
        const medianViz = await analyzeAndVisualize(
            wxInfo.imagePath,
            'median',
            {
                cellSize: 10,
                quantize: 16,
                tolerance: 32,
                minRegionArea: 4,
                minSeparatorScore: 0.08,
                cellColorMode: 'median',
                boundarySpanWidth: 3,
            },
            '.runtime/tests/wechat/wechat_median_annotated.png'
        );

        // 步骤 3: Mean 模式分析和可视化
        const meanViz = await analyzeAndVisualize(
            wxInfo.imagePath,
            'mean',
            {
                cellSize: 10,
                quantize: 16,
                tolerance: 32,
                minRegionArea: 4,
                minSeparatorScore: 0.14,
                cellColorMode: 'mean',
                boundarySpanWidth: 1,
            },
            '.runtime/tests/wechat/wechat_mean_annotated.png'
        );

        // 步骤 4: 结果对比
        const medianV = medianViz.result.separators?.vertical?.length || 0;
        const medianH = medianViz.result.separators?.horizontal?.length || 0;
        const meanV = meanViz.result.separators?.vertical?.length || 0;
        const meanH = meanViz.result.separators?.horizontal?.length || 0;

        console.log('\n' + '='.repeat(80));
        console.log('分析结果对比');
        console.log('='.repeat(80));
        console.log(`\nMedian 模式:`);
        console.log(`  分隔符: ${medianV}V + ${medianH}H = ${medianV + medianH}个`);
        console.log(`  区域: ${medianViz.regions.length}个`);

        console.log(`\nMean 模式:`);
        console.log(`  分隔符: ${meanV}V + ${meanH}H = ${meanV + meanH}个`);
        console.log(`  区域: ${meanViz.regions.length}个`);

        console.log('\n' + '='.repeat(80));
        console.log('✅ 完成！');
        console.log('='.repeat(80));
        console.log('\n输出文件位置: .runtime/tests/wechat/');
        console.log('  wechat_original.png           - 原始截图');
        console.log('  wechat_median_annotated.png   - Median 模式 (彩色区域 + 中文标签)');
        console.log('  wechat_mean_annotated.png     - Mean 模式 (彩色区域 + 中文标签)');
        console.log('\n特性:');
        console.log('  ✅ 不同区域使用不同颜色标记');
        console.log('  ✅ 每个区域显示中文标签');
        console.log('  ✅ 红色线条标记垂直分隔符');
        console.log('  ✅ 蓝色线条标记水平分隔符');

    } catch (error) {
        console.error('\n❌ 错误:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        throw error;
    }
}

main().catch(console.error);
