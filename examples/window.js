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
    await sleep(8000);
}

// 测试窗口操作
const activeWindow = await window.getActiveWindow();
const windowTitle = activeWindow.title;
console.log(`\n开始对窗口 "${windowTitle}" 进行操作测试`);

// 最大化窗口
console.log('\n最大化窗口...');
await window.maximize(windowTitle);
await sleep(2000);

// 恢复窗口
console.log('\n恢复窗口到正常大小...');
await window.restore(windowTitle);
await sleep(2000);

// 最小化窗口
console.log('\n最小化窗口...');
await window.minimize(windowTitle);
await sleep(2000);

// 恢复窗口并获取最终状态
console.log('\n恢复窗口并获取最终状态...');
await window.restore(windowTitle);
await sleep(1000);

const finalWindow = await window.getActiveWindow();
console.log('最终窗口状态:', JSON.stringify(finalWindow, null, 2));
