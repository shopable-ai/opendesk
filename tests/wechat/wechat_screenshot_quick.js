/**
 * WeChat Quick Screenshot Test
 *
 * Quick test to verify WeChat window detection and screenshot capture
 */

const wait = (ms) => page.waitFor(ms);

async function quickTest() {
    console.log('='.repeat(60));
    console.log('微信快速截图测试');
    console.log('='.repeat(60));
    console.log();

    try {
        // Find WeChat window
        console.log('🔍 查找微信窗口...');
        const list = await window.list();
        const wx = (list || [])
            .filter((w) => {
                const exe = String(w?.exeName || '').toLowerCase();
                const title = String(w?.title || '').toLowerCase();
                return exe.includes('wechat') || title.includes('微信') || title.includes('wechat');
            })
            .sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0))[0];

        if (!wx) {
            console.log('❌ 未找到微信窗口');
            console.log('   请先打开微信桌面版');
            return false;
        }

        console.log(`✅ 找到微信: ${wx.title}`);
        console.log(`   大小: ${wx.width}x${wx.height}`);
        console.log(`   位置: (${wx.x}, ${wx.y})`);

        // Bring to front
        console.log('\n📌 置顶微信窗口...');
        await window.bringToTop(wx.title, wx.processId || wx.processID || wx.pid || 0);
        await wait(1000);

        // Take screenshot
        console.log('\n📸 截取屏幕...');
        const outputPath = '.runtime/smoke/wechat/quick-screenshot.png';

        await page.screenshot({
            path: outputPath,
            target: 'screen',
            clip: { x: wx.x, y: wx.y, width: wx.width, height: wx.height },
        });

        console.log(`✅ 截图已保存: ${outputPath}`);

        // Quick analysis
        console.log('\n🔬 快速分析...');
        const imageBase64 = await ImageColor.loadBase64(outputPath);

        const result = await ImageColor.analyzeLayout(imageBase64, {
            cellSize: 10,
            quantize: 16,
            tolerance: 32,
            minRegionArea: 4,
            minSeparatorScore: 0.08,
            cellColorMode: 'median',
            boundarySpanWidth: 3,
        });

        const vCount = (result.separators?.vertical || []).length;
        const hCount = (result.separators?.horizontal || []).length;

        console.log(`   检测到 ${vCount} 个垂直分隔符`);
        console.log(`   检测到 ${hCount} 个水平分隔符`);
        console.log(`   总计 ${vCount + hCount} 个分隔符`);

        console.log('\n' + '='.repeat(60));
        console.log('✅ 测试完成');
        console.log('='.repeat(60));

        return true;

    } catch (error) {
        console.error('\n❌ 错误:', error.message);
        return false;
    }
}

quickTest();
