
/**
 * 获取千牛应用窗口
 * @returns {Array} 千牛窗口列表
 */
async function getQianniuWindows() {
    // 获取系统中所有窗口
    const windows = await window.list();
    
    // 筛选出千牛的窗口
    return windows.filter(win => win.exeName?.includes('AliWorkbench.exe'));
}

/**
 * 获取悬浮窗口
 * @returns {Array} 悬浮窗口列表
 */
async function getFloatingWindows() {
    const qianniuWindows = await getQianniuWindows();
    
    // 筛选出悬浮条窗口
    const floatingWindows = qianniuWindows.filter(win => 
        win.title === '悬浮条' && 
        win.isPopup && 
        win.x > 0 && win.y > 0 // 确保窗口是可见的
    );
    
    // 检查是否找到悬浮窗口
    if (floatingWindows.length === 0) {
        console.log('未找到可见的悬浮条窗口，尝试查找所有千牛窗口');
        
        // 只打印一个千牛窗口作为示例
        if (qianniuWindows.length > 0) {
            const win = qianniuWindows[0];
            console.log(`示例千牛窗口: 标题="${win.title}", 尺寸=${win.width}x${win.height}, 位置=(${win.x},${win.y}), isPopup=${win.isPopup}`);
        }
    }
    
    return floatingWindows;
}

/**
 * 点击指定窗口的相对坐标
 * @param {Object} window 窗口对象
 * @param {number} relativeX 相对X坐标 (基于100%缩放比例时的坐标)
 * @param {number} relativeY 相对Y坐标 (基于100%缩放比例时的坐标)
 */
async function clickWindowPosition(window, relativeX, relativeY) {
    // 基准窗口尺寸 (100%缩放比例时)
    const baseWidth = 370;
    const baseHeight = 127;
    
    // 计算实际缩放比例
    const scaleX = window.width / baseWidth;
    const scaleY = window.height / baseHeight;
    
    // 根据缩放比例调整点击坐标
    const scaledX = Math.round(relativeX * scaleX);
    const scaledY = Math.round(relativeY * scaleY);
    
    // 计算屏幕绝对坐标
    const x = window.x + scaledX;
    const y = window.y + scaledY;
    
    // 使用 Win+D 组合键最小化所有窗口
    await keyboard.combination("Meta", "d");
    await page.waitFor(800);
    
    // 使用 Ctrl+R 刷新
    await keyboard.combination("Meta", "r");
    await page.waitFor(1200);
    
    // 按ESC键
    await keyboard.press("Escape");
    await page.waitFor(800);
    
    // 使用页面鼠标点击
    await page.mouse.click(x, y);
    await page.waitFor(5000);
}

/**
 * 点击所有悬浮窗口的指定相对位置
 * @param {number} relativeX 相对X坐标
 * @param {number} relativeY 相对Y坐标
 */
async function clickAllFloatingWindows(relativeX, relativeY) {
    // 获取所有悬浮窗口
    const floatingWindows = await getFloatingWindows();
    const totalSeconds = floatingWindows.length * 8;
    const totalMinutes = (totalSeconds / 60).toFixed(1); // Convert to minutes with 1 decimal place

    // 逐个点击窗口
    for (let i = 0; i < floatingWindows.length; i++) {
        const window = floatingWindows[i];
        // 添加notify 显示进度 n/total，每个间隔6秒
        if (totalSeconds <60) notify(`开始第${i + 1}/${floatingWindows.length}个悬浮窗口，预计总耗时：${totalSeconds}秒`);
        else notify(`开始第${i + 1}/${floatingWindows.length}个悬浮窗口，预计总耗时：${totalMinutes}分钟`);
        
        // 点击窗口
        await clickWindowPosition(window, relativeX, relativeY);
        
        // 执行完一个窗口后等待6秒

        // 点击窗口
        await clickWindowPosition(window, relativeX, relativeY);
        
        // 执行完一个窗口后等待6秒
        if (i < floatingWindows.length - 1) {
            await page.waitFor(6000);
        }
    }
    notify('全部悬浮窗口点击完成');
}

/**
 * 自动点击千牛店铺
 * @param {Object} options 可选参数
 * @param {number} options.relativeX 相对X坐标，默认120
 * @param {number} options.relativeY 相对Y坐标，默认60
 */
async function autoClickQianniuShops(options = {}) {
    const relativeX = options.relativeX || 120;
    const relativeY = options.relativeY || 60;
    
    // 获取悬浮窗口信息
    const floatingWindows = await getFloatingWindows();
    console.log(`找到 ${floatingWindows.length} 个悬浮窗口`);
    
    // 只打印第一个窗口信息作为示例
    if (floatingWindows.length > 0) {
        const win = floatingWindows[0];
        console.log(`示例窗口: 尺寸=${win.width}x${win.height}, 位置=(${win.x},${win.y})`);
    }
    
    // 点击所有悬浮窗口的相对坐标
    await clickAllFloatingWindows(relativeX, relativeY);
    
    if (floatingWindows.length > 0) {
        console.log('自动点击完成');        
    }else {
        notify('没有找到悬浮窗口');
    }
}


await autoClickQianniuShops();
