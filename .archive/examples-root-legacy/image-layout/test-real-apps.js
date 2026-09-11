// Continuous Layout Testing on Real Applications
// Tests Chrome, VS Code, Finder, and other apps

const wait = (ms) => page.waitFor(ms);

const apps = [
    { name: 'Google Chrome', keywords: ['chrome'] },
    { name: 'Visual Studio Code', keywords: ['code', 'vscode', 'visual studio'] },
    { name: 'Finder', keywords: ['finder'] },
    { name: 'Safari', keywords: ['safari'] },
    { name: 'WeChat', keywords: ['wechat', '微信'] }
];

async function findAppWindow(app) {
    const list = await window.list();
    const found = (list || [])
        .filter((w) => {
            const exe = String(w?.exeName || '').toLowerCase();
            const title = String(w?.title || '').toLowerCase();
            return app.keywords.some(keyword =>
                exe.includes(keyword) || title.includes(keyword)
            );
        })
        .sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0))[0];

    return found;
}

async function testApplication(app) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Testing: ${app.name}`);
    console.log('='.repeat(80));

    try {
        const win = await findAppWindow(app);

        if (!win || !win.title) {
            console.log(`⚠️  ${app.name} is not running or has no visible windows`);
            return null;
        }

        console.log(`Found window: ${win.title}`);
        console.log(`Size: ${win.width}x${win.height}`);

        // Bring to front
        await window.bringToTop(win.title, win.processId || win.processID || win.pid || 0);
        await wait(500);

        // Capture screenshot
        const screenshotPath = `test_images_output/${app.name.replace(/\s+/g, '_')}_screenshot.png`;
        await page.screenshot({
            path: screenshotPath,
            target: 'screen',
            clip: { x: win.x, y: win.y, width: win.width, height: win.height },
        });

        const imageBase64 = await ImageColor.loadBase64(screenshotPath);

        // Test with median mode
        console.log('\nTesting with MEDIAN mode...');
        const medianResult = await ImageColor.analyzeLayout(imageBase64, {
            cellSize: 10,
            quantize: 16,
            tolerance: 32,
            minRegionArea: 4,
            minSeparatorScore: 0.08,
            cellColorMode: 'median',
            boundarySpanWidth: 3
        });

        // Test with mean mode
        console.log('Testing with MEAN mode...');
        const meanResult = await ImageColor.analyzeLayout(imageBase64, {
            cellSize: 10,
            quantize: 16,
            tolerance: 32,
            minRegionArea: 4,
            minSeparatorScore: 0.14,
            cellColorMode: 'mean',
            boundarySpanWidth: 1
        });

        const medianSeps = medianResult.separators;
        const meanSeps = meanResult.separators;

        const medianVertical = medianSeps.vertical || [];
        const medianHorizontal = medianSeps.horizontal || [];
        const meanVertical = meanSeps.vertical || [];
        const meanHorizontal = meanSeps.horizontal || [];

        const medianTotal = medianVertical.length + medianHorizontal.length;
        const meanTotal = meanVertical.length + meanHorizontal.length;

        const medianAvgConf = medianVertical.concat(medianHorizontal)
            .reduce((sum, s) => sum + s.confidence, 0) / (medianTotal || 1);

        const meanAvgConf = meanVertical.concat(meanHorizontal)
            .reduce((sum, s) => sum + s.confidence, 0) / (meanTotal || 1);

        console.log('\nResults:');
        console.log(`  Median: ${medianTotal} separators (${medianVertical.length}V + ${medianHorizontal.length}H), conf=${medianAvgConf.toFixed(3)}`);
        console.log(`  Mean:   ${meanTotal} separators (${meanVertical.length}V + ${meanHorizontal.length}H), conf=${meanAvgConf.toFixed(3)}`);

        const diff = medianTotal - meanTotal;
        const diffPct = ((diff / (meanTotal || 1)) * 100).toFixed(1);
        console.log(`  Diff:   ${diff > 0 ? '+' : ''}${diff} (${diffPct}%)`);

        return {
            app: app.name,
            window: win.title,
            size: `${win.width}x${win.height}`,
            median: {
                vertical: medianVertical.length,
                horizontal: medianHorizontal.length,
                total: medianTotal,
                avgConfidence: medianAvgConf
            },
            mean: {
                vertical: meanVertical.length,
                horizontal: meanHorizontal.length,
                total: meanTotal,
                avgConfidence: meanAvgConf
            }
        };

    } catch (error) {
        console.log(`⚠️  Error testing ${app.name}: ${error.message}`);
        return null;
    }
}

async function main() {
    console.log('='.repeat(80));
    console.log('Continuous Layout Testing on Real Applications');
    console.log('='.repeat(80));
    console.log(`\nTesting ${apps.length} applications...`);

    const results = [];

    for (const app of apps) {
        const result = await testApplication(app);
        if (result) {
            results.push(result);
        }

        // Small delay between tests
        await wait(1000);
    }

    console.log('\n' + '='.repeat(80));
    console.log('Summary');
    console.log('='.repeat(80));

    if (results.length === 0) {
        console.log('\n⚠️  No applications were successfully tested');
        console.log('Please make sure the applications are running and have visible windows');
        return;
    }

    console.log('\nApplication            | Median | Mean | Diff | Median Conf | Mean Conf');
    console.log('-'.repeat(80));

    for (const r of results) {
        const appName = r.app.padEnd(22);
        const medianTotal = String(r.median.total).padStart(6);
        const meanTotal = String(r.mean.total).padStart(4);
        const diff = String(r.median.total - r.mean.total).padStart(4);
        const medianConf = r.median.avgConfidence.toFixed(3);
        const meanConf = r.mean.avgConfidence.toFixed(3);

        console.log(`${appName} | ${medianTotal} | ${meanTotal} | ${diff} | ${medianConf}       | ${meanConf}`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('Key Findings');
    console.log('='.repeat(80));

    const avgMedianTotal = results.reduce((sum, r) => sum + r.median.total, 0) / results.length;
    const avgMeanTotal = results.reduce((sum, r) => sum + r.mean.total, 0) / results.length;

    console.log(`\nAverage separators:`);
    console.log(`  Median: ${avgMedianTotal.toFixed(1)}`);
    console.log(`  Mean:   ${avgMeanTotal.toFixed(1)}`);

    const betterInMedian = results.filter(r => r.median.total >= r.mean.total).length;
    const betterInMean = results.filter(r => r.mean.total > r.median.total).length;

    console.log(`\nPerformance comparison:`);
    console.log(`  Median performs better: ${betterInMedian}/${results.length} apps`);
    console.log(`  Mean performs better:   ${betterInMean}/${results.length} apps`);

    console.log('\n✅ Testing complete');
}

main().catch(console.error);
