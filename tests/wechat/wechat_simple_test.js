/**
 * WeChat Simple Test - Using Available Functions
 *
 * This script uses only the available ImageColor functions
 */

const wait = (ms) => page.waitFor(ms);
const OUTPUT_DIR = '.runtime/tests/wechat/wechat_test_output';

async function main() {
    console.log('='.repeat(80));
    console.log('🚀 微信简化测试');
    console.log('='.repeat(80));
    console.log();

    try {
        // Step 1: Find WeChat window
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
            throw new Error('❌ 未找到微信窗口');
        }

        console.log(`✅ 找到微信: ${wx.title}`);
        console.log(`   大小: ${wx.width}x${wx.height}`);
        console.log(`   位置: (${wx.x}, ${wx.y})`);

        // Step 2: Capture screenshot
        console.log('\n📸 截取微信窗口...');
        await window.bringToTop(wx.title, wx.processId || wx.processID || wx.pid || 0);
        await wait(1000);

        const screenshotPath = `${OUTPUT_DIR}/wechat_original.png`;

        await page.screenshot({
            path: screenshotPath,
            target: 'screen',
            clip: { x: wx.x, y: wx.y, width: wx.width, height: wx.height },
        });

        console.log(`✅ 截图已保存: ${screenshotPath}`);

        // Step 3: Load and analyze
        console.log('\n📂 加载图片...');
        const imageBase64 = await ImageColor.loadBase64(screenshotPath);
        console.log('✅ 图片已加载');

        // Step 4: Analyze with Median mode
        console.log('\n🔬 分析布局 (Median 模式)...');
        const medianResult = await ImageColor.analyzeLayout(imageBase64, {
            cellSize: 10,
            quantize: 16,
            tolerance: 32,
            minRegionArea: 4,
            minSeparatorScore: 0.08,
            cellColorMode: 'median',
            boundarySpanWidth: 3,
        });

        const medianV = medianResult.separators?.vertical || [];
        const medianH = medianResult.separators?.horizontal || [];

        console.log(`   垂直分隔符: ${medianV.length}个`);
        console.log(`   水平分隔符: ${medianH.length}个`);
        console.log(`   总计: ${medianV.length + medianH.length}个`);

        // Step 5: Analyze with Mean mode
        console.log('\n🔬 分析布局 (Mean 模式)...');
        const meanResult = await ImageColor.analyzeLayout(imageBase64, {
            cellSize: 10,
            quantize: 16,
            tolerance: 32,
            minRegionArea: 4,
            minSeparatorScore: 0.14,
            cellColorMode: 'mean',
            boundarySpanWidth: 1,
        });

        const meanV = meanResult.separators?.vertical || [];
        const meanH = meanResult.separators?.horizontal || [];

        console.log(`   垂直分隔符: ${meanV.length}个`);
        console.log(`   水平分隔符: ${meanH.length}个`);
        console.log(`   总计: ${meanV.length + meanH.length}个`);

        // Step 6: Print detailed results
        console.log('\n' + '='.repeat(80));
        console.log('📊 详细分析结果');
        console.log('='.repeat(80));

        console.log('\n【Median 模式 - 垂直分隔符】');
        if (medianV.length > 0) {
            medianV.forEach((sep, i) => {
                console.log(`  ${i + 1}. 位置: ${sep.position}, 置信度: ${sep.confidence.toFixed(3)}, 长度: ${sep.length}`);
            });
        } else {
            console.log('  无');
        }

        console.log('\n【Median 模式 - 水平分隔符】(前10个)');
        if (medianH.length > 0) {
            medianH.slice(0, 10).forEach((sep, i) => {
                console.log(`  ${i + 1}. 位置: ${sep.position}, 置信度: ${sep.confidence.toFixed(3)}, 长度: ${sep.length}`);
            });
            if (medianH.length > 10) {
                console.log(`  ... 还有 ${medianH.length - 10} 个`);
            }
        } else {
            console.log('  无');
        }

        console.log('\n【Mean 模式 - 垂直分隔符】');
        if (meanV.length > 0) {
            meanV.forEach((sep, i) => {
                console.log(`  ${i + 1}. 位置: ${sep.position}, 置信度: ${sep.confidence.toFixed(3)}, 长度: ${sep.length}`);
            });
        } else {
            console.log('  无');
        }

        console.log('\n【Mean 模式 - 水平分隔符】(前10个)');
        if (meanH.length > 0) {
            meanH.slice(0, 10).forEach((sep, i) => {
                console.log(`  ${i + 1}. 位置: ${sep.position}, 置信度: ${sep.confidence.toFixed(3)}, 长度: ${sep.length}`);
            });
            if (meanH.length > 10) {
                console.log(`  ... 还有 ${meanH.length - 10} 个`);
            }
        } else {
            console.log('  无');
        }

        // Step 7: Comparison
        console.log('\n' + '='.repeat(80));
        console.log('📈 模式对比');
        console.log('='.repeat(80));

        const medianTotal = medianV.length + medianH.length;
        const meanTotal = meanV.length + meanH.length;
        const diff = medianTotal - meanTotal;
        const diffPct = meanTotal > 0 ? ((diff / meanTotal) * 100).toFixed(1) : '0.0';

        console.log(`\nMedian 模式总计: ${medianTotal}个分隔符`);
        console.log(`Mean 模式总计: ${meanTotal}个分隔符`);
        console.log(`差异: ${diff > 0 ? '+' : ''}${diff} (${diffPct}%)`);

        if (medianV.length > 0) {
            const medianAvgConf = medianV.reduce((sum, s) => sum + s.confidence, 0) / medianV.length;
            console.log(`Median 垂直分隔符平均置信度: ${medianAvgConf.toFixed(3)}`);
        }

        if (meanV.length > 0) {
            const meanAvgConf = meanV.reduce((sum, s) => sum + s.confidence, 0) / meanV.length;
            console.log(`Mean 垂直分隔符平均置信度: ${meanAvgConf.toFixed(3)}`);
        }

        console.log(`\n推荐模式: ${medianTotal > meanTotal ? 'Median (检测到更多分隔符)' : 'Mean (更精确的检测)'}`);

        // Step 8: Save results summary
        console.log('\n💾 保存结果摘要...');
        const summary = {
            timestamp: new Date().toISOString(),
            window: {
                title: wx.title,
                size: `${wx.width}x${wx.height}`,
                position: `(${wx.x}, ${wx.y})`
            },
            median: {
                vertical: medianV,
                horizontal: medianH,
                total: medianTotal
            },
            mean: {
                vertical: meanV,
                horizontal: meanH,
                total: meanTotal
            }
        };

        console.log('✅ 结果摘要已准备');
        console.log(`   JSON 数据大小: ${JSON.stringify(summary).length} 字节`);

        // Final output
        console.log('\n' + '='.repeat(80));
        console.log('✅ 测试完成！');
        console.log('='.repeat(80));
        console.log('\n📁 生成的文件:');
        console.log(`   1. ${screenshotPath} (原始截图)`);
        console.log('\n💡 分析结果:');
        console.log(`   - Median 模式: ${medianV.length} 垂直 + ${medianH.length} 水平 = ${medianTotal} 个分隔符`);
        console.log(`   - Mean 模式: ${meanV.length} 垂直 + ${meanH.length} 水平 = ${meanTotal} 个分隔符`);
        console.log('\n📝 说明:');
        console.log('   - 垂直分隔符: 将界面分为左右区域（如侧边栏、聊天列表、消息区）');
        console.log('   - 水平分隔符: 将界面分为上下区域（如标题栏、消息项、输入框）');
        console.log('   - 置信度越高，分隔符越明显');

        return summary;

    } catch (error) {
        console.error('\n❌ 错误:', error.message);
        console.error(error.stack);
        throw error;
    }
}

main().catch(console.error);
