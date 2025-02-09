// 连续获取3次窗口信息
for (let i = 1; i <= 3; i++) {
    console.log(`\n第 ${i} 次获取窗口信息：`);
    
    // 获取当前活动窗口信息
    const activeWindow = await window.getActiveWindow();
    console.log('活动窗口信息:', JSON.stringify(activeWindow, null, 2));
        
    // 获取窗口标题
    const title = await window.title();
    console.log('当前窗口标题:', title);
    
    // 获取窗口内容
    const content = await window.content();
    console.log('当前窗口内容:', content);
        
    // 等待2秒
    console.log('等待 2 秒...');
    await sleep(2000);
}

const windows = await window.listWindows();
console.log('所有窗口信息:', windows);

// 获取并监控千牛弹窗
const qianniuWindows = windows.filter(win => 
    win.exeName?.includes('AliWorkbench.exe')
);
console.log('千牛弹窗:', qianniuWindows);

// 找到接待中心和消息通知窗口
const receptionWindow = qianniuWindows.find(win => win.title.includes('接待中心'));
const messageWindow = qianniuWindows.find(win => win.title.includes('消息通知'));

const focusWindow = await window.getFocusWindow();
console.log('当前焦点窗口信息:', focusWindow);

// 测试置顶功能
console.log('\n开始测试置顶功能...');

// 一次性置顶接待中心
if (receptionWindow) {
    console.log('\n1. 测试一次性置顶接待中心');
    try {
        await window.bringToTop(receptionWindow.title);
        console.log('成功将接待中心置顶，窗口标题:', receptionWindow.title);
        
        // 等待2秒观察效果
        console.log('等待 2 秒观察效果...');
        await sleep(2000);
        
        // 获取当前窗口信息验证
        const activeWindow = await window.getActiveWindow();
        console.log('置顶后的活动窗口信息:', JSON.stringify(activeWindow, null, 2));
    } catch (error) {
        console.error('置顶接待中心失败:', error);
    }
} else {
    console.log('未找到接待中心窗口');
}

// 测试始终置顶消息通知
if (messageWindow) {
    console.log('\n2. 测试始终置顶消息通知');
    try {
        await window.setAlwaysOnTop(messageWindow.title, true);
        console.log('成功设置消息通知始终置顶，窗口标题:', messageWindow.title);
        
        // 等待2秒观察效果
        console.log('等待 2 秒观察效果...');
        await sleep(2000);
        
        // 获取当前窗口信息验证
        const activeWindow = await window.getActiveWindow();
        console.log('设置始终置顶后的活动窗口信息:', JSON.stringify(activeWindow, null, 2));
    } catch (error) {
        console.error('设置消息通知始终置顶失败:', error);
    }
} else {
    console.log('未找到消息通知窗口');
}

// 取消消息通知的置顶
if (messageWindow) {
    console.log('\n3. 测试取消消息通知的置顶');
    try {
        await window.unsetTopMost(messageWindow.title);
        console.log('成功取消消息通知的置顶，窗口标题:', messageWindow.title);
        
        // 等待2秒观察效果
        console.log('等待 2 秒观察最终效果...');
        await sleep(2000);
        
        // 获取当前窗口信息验证
        const activeWindow = await window.getActiveWindow();
        console.log('取消置顶后的活动窗口信息:', JSON.stringify(activeWindow, null, 2));
    } catch (error) {
        console.error('取消消息通知置顶失败:', error);
    }
} else {
    console.log('未找到消息通知窗口');
}

console.log('\n置顶功能测试完成');
