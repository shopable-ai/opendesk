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
