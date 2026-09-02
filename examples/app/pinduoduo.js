// 微信窗口必须要在桌面可视区域里，现在置顶微信窗口还有问题。微信消息提醒小窗口会被错误置顶。

// Function to get Pinduoduo window
async function getPinduoduoWindow() {
    let windows = await window.list();
    return windows?.find(win => 
        win.exeName === 'WeChatAppEx.exe' && 
        win.title === '拼多多'
    );
}

// Define slide function with relative coordinates
async function slidePinduoduoVideo(windowPinduoduo = null) {
    // Get window if not provided
    if (!windowPinduoduo) {
        windowPinduoduo = await getPinduoduoWindow();
    }

    if (!windowPinduoduo) {
        console.log('Pinduoduo window not found');
        return;
    }

    // Calculate relative positions based on window coordinates
    const offsetX = windowPinduoduo.x;
    const offsetY = windowPinduoduo.y;

    // Define relative slide coordinates
    const startX = offsetX + 220;  // Keep same X offset from window
    const endX = offsetX + 225;    // Keep same X offset from window
    const startY = offsetY + 600;  // Start Y relative to window top
    const endY = offsetY + 150;    // End Y relative to window top
    
    // Execute slide movement
    await page.mouse.move(startX, startY);
    await page.waitFor(100);
    
    await page.mouse.down();
    await page.waitFor(2);
    
    await page.mouse.move(endX, endY);
    await page.waitFor(150);
    
    await page.mouse.up();
    await page.waitFor(100);
}

// Updated automation loop with window-aware sliding
let isRunning = true;
async function automationWithStop() {
    while (isRunning) {
        let windowPinduoduo = await getPinduoduoWindow();
        
        if (windowPinduoduo) {
            await page.waitFor(1500);
            await slidePinduoduoVideo(windowPinduoduo);
        } else {
            console.log('Pinduoduo window not found, waiting...');
            await page.waitFor(2000);
        }
    }
}

// Usage example:
// await automationWithStop();
// To stop: isRunning = false;


// await page.waitFor(1500);
// await slide();

let windows = await window.list();
// console.log('所有窗口信息:', windows);
console.log('窗口数量:', windows.length);

// let windowPinduoduo = window.getWindowByTitle('拼多多');
let windowPinduoduo = windows?.find(win => win.exeName == 'WeChatAppEx.exe' && win.title== '拼多多');

async function openPinduoduoVideo(windows = null) {
    windows = windows || await window.list();
    const windowPinduoduo = windows?.find(win => 
        win.exeName === 'WeChatAppEx.exe' && 
        win.title === '拼多多'
    );

    if (!windowPinduoduo) {
        console.log('Pinduoduo window not found');
        return null;
    }

    console.log('windowPinduoduo:', windowPinduoduo, windowPinduoduo?.title);
    
    // Bring window to front
    await window.bringToTop(windowPinduoduo?.title);
    await page.waitFor(600);

    // Calculate video button position
    const videoX = windowPinduoduo.x + 125;
    const videoY = windowPinduoduo.y + windowPinduoduo.height - 30;
    
    // Click video button
    await page.mouse.click(videoX, videoY);
    console.log('click video', videoX, videoY);
    await page.waitFor(2000);

    return windowPinduoduo;
}

async function closePinduoduoWindow(windowPinduoduo = null) {
    if (!windowPinduoduo) {
        let windows = await window.list();
        windowPinduoduo = windows?.find(win => 
            win.exeName === 'WeChatAppEx.exe' && 
            win.title === '拼多多'
        );
    }

    // Calculate close button position
    const closeX = windowPinduoduo.x + windowPinduoduo.width - 30;
    const closeY = windowPinduoduo.y + 45;
    
    // Click close button
    await page.mouse.click(closeX, closeY);
    console.log('close pinduoduo', closeX, closeY);
    await page.waitFor(600);
}

// Usage example:
async function handlePinduoduoVideo(windows) {
    windows = windows || await window.list();
    const window = await openPinduoduoVideo(windows);
    if (window) {
        await closePinduoduoWindow(window);
    }
}

// get wechat window
async function getWechatWindow() {
    let windows = await window.list();
    let wechats , wechatWindow;
    wechats = windows.filter(win => win.exeName == 'WeChat.exe' && win.title== '微信');
    // 如果wechats 里面有多个窗口，则取 width height 最大的一个
    if ( wechats.length > 1 ) {
        wechatWindow = wechats.reduce((a, b) => a.width * a.height > b.width * b.height ? a : b);
    }else {
        wechatWindow = wechats[0];
    }
    return wechatWindow;
}

async function topWechatWindows() {
    let windows = await window.list();
    let wechats , wechatWindow;
    wechats = windows.filter(win => win.exeName == 'WeChat.exe' && win.title== '微信');
    console.log('topWechatWindows wechats', wechats);
    // 有的是系统托盘消息窗口
    for (let i = 0; i < wechats.length; i++) {
        let win = wechats[i];
        // 如果 宽，高 小于100 ,则跳出
        if ( win.height < 200 ) {
            console.log('跳过消息窗口 win width height', win.width, win.height);
            // window.kill(win.processId);
            continue;
        }
        // await window.restoreByPID(win?.processId);
        // await page.waitFor(600);    
        // await window.bringToTopByPID(win.processId);
        // await page.waitFor(500);
        await window.bringToTop(win?.title);
        await page.waitFor(800);    
    }
    wechats = windows.filter(win => win.exeName == 'WeChat.exe' && win.title== '微信');
    console.log('topWechatWindows wechats length:', wechats.length);
}

async function openMiniAppWindow() {
    let windows = await window.list();
    // let wechatWindow = windows.find(win => win.exeName == 'WeChat.exe' && win.title== '微信'); 
    let wechatWindow = await getWechatWindow();
    let wechats = windows.filter(win => win.exeName == 'WeChat.exe' && win.title== '微信');    
    await topWechatWindows();

    console.log('wechats Window:', wechats);
    if ( wechatWindow ) {
        wechatWindow = await getWechatWindow();
        console.log('wechatWindow start click:', wechatWindow, wechatWindow?.title);
        // await window.bringToTopByPID(wechatWindow?.processId);
        // await page.waitFor(1000);
        // =25 ， -110
        let miniAppX = wechatWindow.x + 25;
        let miniAppY = wechatWindow.y + wechatWindow.height - 110;
        await page.mouse.click(miniAppX, miniAppY);
        console.log('click miniApp', miniAppX, miniAppY);
        await page.waitFor(600);        
    }else{
        notify({
            title: "请先打开微信",
            message: "打开微信电脑版后重新重新启动脚本",
            sound: true,
            timeout: 3000
        })
    }
}

await page.waitFor(500);

console.log("开始寻找微信小程序窗口")

// 获取并监控千牛弹窗
let miniAppWindows = windows?.find(win => win.exeName == 'WeChatAppEx.exe' && win.title== '微信');

// 是否找到微信小程序窗口
console.log('miniAppWindows', !!miniAppWindows );

console.log('miniAppWindows', miniAppWindows? miniAppWindows : '未找到微信小程序窗口');
// console.log('wechatWindow', miniAppWindows); // 报错，

if ( !miniAppWindows) {
    console.log("未找到微信小程序窗口，尝试打开");
    await openMiniAppWindow();
    windows = await window.list();
    miniAppWindows = windows.find(win => win.exeName == 'WeChatAppEx.exe' && win.title== '微信');
}

if ( miniAppWindows ) {
    // await window.bringToTop(miniAppWindows.title);
    await window.bringToTop(
        miniAppWindows?.title || '',
        miniAppWindows?.processId || miniAppWindows?.processID || miniAppWindows?.pid || 0
    );
    await page.waitFor(600);
        
    await window.maximizeByPID(miniAppWindows?.processId);
    await page.waitFor(600);

    let sceenshot = await page.screenshot();
        
    const containerBlocks = await ImageColor.findColorBlocks(sceenshot, "#FFFFFF");
    let container = containerBlocks.find(block => block.width > 400 );
    // 55 , 174 
    let miniAppX = container.x + 55;
    let miniAppY = 174;

    // +185 ,  185
    // let miniAppX = miniAppWindows.x + 185;
    // let miniAppY = miniAppWindows.y + 185;
    
    await page.mouse.click(miniAppX, miniAppY);
    console.log('click miniApp', miniAppX, miniAppY);

    await page.waitFor(600);
    await openPinduoduoVideo();
    await page.waitFor(600);
    slidePinduoduoVideo();
}


// window.kill(8704);   // 同时关闭了2个窗口，不适用。


