// WeChat Layout Validation and Auto-Fix
// 1. Define expected layout structure
// 2. Validate detected separators
// 3. Auto-fix if validation fails

const wait = (ms) => page.waitFor(ms);
const OUTPUT_DIR = '.runtime/tests/wechat/wechat_validation';

// Expected WeChat layout structure
const WECHAT_EXPECTED_LAYOUT = {
    name: 'WeChat',
    minVerticalSeparators: 1,  // At least sidebar separator
    maxVerticalSeparators: 3,  // Sidebar + maybe content divisions
    minHorizontalSeparators: 0,
    maxHorizontalSeparators: 5, // Header/footer separators
    criticalSeparators: [
        {
            type: 'vertical',
            expectedRange: [60, 90],  // Sidebar separator around 70-80px
            tolerance: 20,
            required: true,
            name: 'sidebar'
        }
    ]
};

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

function validateLayout(separators, expected) {
    const vertical = separators.vertical || [];
    const horizontal = separators.horizontal || [];

    const issues = [];

    // Check separator counts
    if (vertical.length < expected.minVerticalSeparators) {
        issues.push({
            type: 'count',
            severity: 'error',
            message: `垂直分隔符太少: ${vertical.length} < ${expected.minVerticalSeparators}`,
            actual: vertical.length,
            expected: expected.minVerticalSeparators
        });
    }

    if (vertical.length > expected.maxVerticalSeparators) {
        issues.push({
            type: 'count',
            severity: 'warning',
            message: `垂直分隔符太多: ${vertical.length} > ${expected.maxVerticalSeparators}`,
            actual: vertical.length,
            expected: expected.maxVerticalSeparators
        });
    }

    if (horizontal.length > expected.maxHorizontalSeparators) {
        issues.push({
            type: 'count',
            severity: 'warning',
            message: `水平分隔符太多: ${horizontal.length} > ${expected.maxHorizontalSeparators}`,
            actual: horizontal.length,
            expected: expected.maxHorizontalSeparators
        });
    }

    // Check critical separators
    for (const critical of expected.criticalSeparators) {
        if (!critical.required) continue;

        const seps = critical.type === 'vertical' ? vertical : horizontal;
        const found = seps.find(s => {
            const pos = s.position;
            return pos >= critical.expectedRange[0] - critical.tolerance &&
                   pos <= critical.expectedRange[1] + critical.tolerance;
        });

        if (!found) {
            issues.push({
                type: 'missing_critical',
                severity: 'error',
                message: `缺少关键分隔符: ${critical.name} (${critical.type})`,
                expected: critical.expectedRange,
                name: critical.name
            });
        }
    }

    return {
        valid: issues.filter(i => i.severity === 'error').length === 0,
        issues,
        summary: {
            errors: issues.filter(i => i.severity === 'error').length,
            warnings: issues.filter(i => i.severity === 'warning').length
        }
    };
}

function suggestFix(validation, mode) {
    const fixes = [];

    for (const issue of validation.issues) {
        if (issue.type === 'count' && issue.severity === 'error') {
            // Too few separators - lower threshold
            fixes.push({
                action: 'lower_threshold',
                parameter: 'minSeparatorScore',
                currentValue: mode === 'median' ? 0.08 : 0.14,
                suggestedValue: mode === 'median' ? 0.06 : 0.10,
                reason: issue.message
            });
        }

        if (issue.type === 'count' && issue.severity === 'warning' && issue.actual > issue.expected) {
            // Too many separators - raise threshold
            fixes.push({
                action: 'raise_threshold',
                parameter: 'minSeparatorScore',
                currentValue: mode === 'median' ? 0.08 : 0.14,
                suggestedValue: mode === 'median' ? 0.12 : 0.18,
                reason: issue.message
            });
        }

        if (issue.type === 'missing_critical') {
            // Missing critical separator - try different mode or lower threshold
            fixes.push({
                action: 'try_different_mode',
                currentMode: mode,
                suggestedMode: mode === 'median' ? 'mean' : 'median',
                reason: issue.message
            });
        }
    }

    return fixes;
}

async function analyzeWithRetry(imagePath, maxAttempts = 3) {
    let attempt = 1;
    let bestResult = null;
    let bestValidation = null;

    const configs = [
        { mode: 'median', score: 0.08, spanWidth: 3 },
        { mode: 'median', score: 0.06, spanWidth: 3 },  // Lower threshold
        { mode: 'mean', score: 0.14, spanWidth: 1 },
        { mode: 'mean', score: 0.18, spanWidth: 1 },    // Higher threshold
    ];

    for (const config of configs.slice(0, maxAttempts)) {
        console.log(`\n尝试 ${attempt}/${maxAttempts}: ${config.mode.toUpperCase()} 模式, 阈值=${config.score}`);

        const imageBase64 = await ImageColor.loadBase64(imagePath);
        const result = await ImageColor.analyzeLayout(imageBase64, {
            cellSize: 10,
            quantize: 16,
            tolerance: 32,
            minRegionArea: 4,
            minSeparatorScore: config.score,
            cellColorMode: config.mode,
            boundarySpanWidth: config.spanWidth,
        });

        const validation = validateLayout(result.separators, WECHAT_EXPECTED_LAYOUT);

        console.log(`  检测到: ${(result.separators.vertical || []).length}V + ${(result.separators.horizontal || []).length}H`);
        console.log(`  验证结果: ${validation.valid ? '✅ 通过' : '❌ 失败'}`);
        console.log(`  问题: ${validation.summary.errors}个错误, ${validation.summary.warnings}个警告`);

        if (validation.issues.length > 0) {
            for (const issue of validation.issues) {
                console.log(`    ${issue.severity === 'error' ? '❌' : '⚠️'} ${issue.message}`);
            }
        }

        if (!bestResult || validation.summary.errors < bestValidation.summary.errors) {
            bestResult = { result, config, validation };
            bestValidation = validation;
        }

        if (validation.valid) {
            console.log(`\n✅ 找到有效配置!`);
            break;
        }

        attempt++;
    }

    return bestResult;
}

async function main() {
    console.log('='.repeat(80));
    console.log('微信布局验证与自动修复');
    console.log('='.repeat(80));
    console.log();

    try {
        // Capture WeChat
        console.log('正在捕获微信窗口...');
        const wxInfo = await captureWechat();
        console.log(`✅ 截图完成: ${wxInfo.imagePath}`);

        // Analyze with auto-retry
        console.log('\n开始智能分析...');
        const best = await analyzeWithRetry(wxInfo.imagePath);

        console.log('\n' + '='.repeat(80));
        console.log('最终结果');
        console.log('='.repeat(80));
        console.log(`\n使用配置: ${best.config.mode.toUpperCase()} 模式, 阈值=${best.config.score}`);
        console.log(`检测结果: ${(best.result.separators.vertical || []).length}V + ${(best.result.separators.horizontal || []).length}H`);
        console.log(`验证状态: ${best.validation.valid ? '✅ 通过' : '⚠️ 部分通过'}`);

        if (!best.validation.valid) {
            console.log('\n建议的进一步优化:');
            const fixes = suggestFix(best.validation, best.config.mode);
            for (const fix of fixes) {
                console.log(`  - ${fix.action}: ${fix.reason}`);
            }
        }

        console.log('\n✅ 分析完成');

    } catch (error) {
        console.error('\n❌ 错误:', error.message);
        throw error;
    }
}

main().catch(console.error);
