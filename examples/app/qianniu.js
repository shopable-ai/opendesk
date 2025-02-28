console.log('tm.config.js loaded，可以在这里放不同项目的业务逻辑代码.')
// Constants
const COLORS = {
    YELLOW_BUTTON: '#FEEBA6',
    BLUE_SIDEBAR: '#3D7FFF',
    GREEN_STATUS: '#20AE10',
    GRAY_STATUS: '#B6B9C3',
    ORDER_BLOCK: '#E8EAF0', // '#E6EAF5',  // 灰色
    PURPLE_STATUS: '#C651A3',
    BLUE_STATUS: '#3D5EFF'
};

// Order status enum
const ORDER_STATUS = {
    PENDING_SHIPMENT: 'PENDING_SHIPMENT',
    PENDING_PAYMENT: 'PENDING_PAYMENT',
    REFUND_COMPLETED: 'REFUND_COMPLETED',
    ORDER_CLOSED: 'ORDER_CLOSED',
    UNKNOWN: 'UNKNOWN_STATUS'
};

// Status display names
const STATUS_NAMES = {
    [ORDER_STATUS.PENDING_SHIPMENT]: '待发货',
    [ORDER_STATUS.PENDING_PAYMENT]: '待付款',
    [ORDER_STATUS.REFUND_COMPLETED]: '退款完成',
    [ORDER_STATUS.ORDER_CLOSED]: '订单关闭',
    [ORDER_STATUS.UNKNOWN]: '未知状态'
};


// Order status color constants
const STATUS_COLORS = {
    [ORDER_STATUS.PENDING_SHIPMENT]: {
        primary: '#dcefff'     // 待发货 第一点
    },
    [ORDER_STATUS.PENDING_PAYMENT]: {
        primary: '#ffe5d5'     // 待付款 第一点
    },
    [ORDER_STATUS.REFUND_COMPLETED]: {
        primary: '#f6f6f6',    // 退款完成 第一点
    },
    [ORDER_STATUS.ORDER_CLOSED]: {
        primary: '#f6f6f6',    // 订单关闭 第一点
        secondary: '#999999'    // 订单关闭 第二点
    }
};


/**
 * 
 * @returns {Promise<Window>} - 返回当前活跃窗口 [窗口，是否待发货状态，状态]
 */
async function getNotifyWindow() {
    // console.log('getNotifyWindow in');
    const activeWindow = await window.getActiveWindow();
    let notifyWindow = null;    
    // console.log('getNotifyWindow  activeWindow.title: ', activeWindow.title, 'activeWindow.exeName: ', activeWindow.exeName);
    if ( activeWindow.title.endsWith('消息通知') && activeWindow.exeName === 'AliWorkbench.exe' ) notifyWindow = activeWindow;
    else {
        let windows = await window.list();
        notifyWindow = windows.find(win => win.title.endsWith('消息通知') && win.exeName === 'AliWorkbench.exe');
    }   
    //  if (!activeWindow.title.endsWith('消息通知') || activeWindow.exeName !== 'AliWorkbench.exe')    
    if (!notifyWindow) {
        console.log('当前窗口不是消息通知:', activeWindow.exeName); // , activeWindow
        if (!activeWindow.title) console.warn('当前窗口没有标题', notifyWindow);
        return [null, null, null]; 
    }
    // console.log('getNotifyWindow bringToTop start');
    console.log('getNotifyWindow 窗口:', notifyWindow.title);
    // console.log('把窗口置顶:', notifyWindow.title, notifyWindow.processId);
    try {
        // window.bringToTop(notifyWindow.title);
        window.bringToTop(notifyWindow.title,notifyWindow.processId);
        // window.bringToTopByPID(notifyWindow.processId);
    } catch (err) {
        console.error('Failed to bring window to top:', err);
        return [null, null, null];
    }
    console.log('getNotifyWindow bringToTop end');
    // console.log('当前窗口:', notifyWindow.title, notifyWindow.processId);

    let {x,y,width,height} = notifyWindow;
    // 如果 x y 远小于0 ， + witth , height 也《0 , 则不在可视区 ，则跳出
    if ( x < 0 && y < 0 && x + width < 0 && y + height < 0 ) {
        console.log('当前窗口不在可视区:', notifyWindow);
        return [notifyWindow, null, null];
    }
    console.log('getNotifyWindow 截图区域:');
    // 给窗口截图
    const screenshot = await page.screenshot({ clip: {x, y, width, height} });
    // console.log('截图完成', screenshot.substring(0, 100));

    // Get colors at specific points (getColorAt should return hex values)
    const firstPointColor = await ImageColor.pixel(screenshot, 140 , 43 ); 
    const secondPointColor = await ImageColor.pixel(screenshot, 143 , 60); 

    // console.log('颜色值:', {        firstPoint: firstPointColor,        secondPoint: secondPointColor    })
    // Determine status
    const status = getOrderStatus(firstPointColor, secondPointColor);
    console.log('检测到订单状态:', STATUS_NAMES[status], '颜色值:', JSON.stringify({firstPoint: firstPointColor,secondPoint: secondPointColor}));

    // 如果状态不是代付款，则直接跳出
    // 
    if ( status !== ORDER_STATUS.PENDING_PAYMENT && status !== ORDER_STATUS.PENDING_SHIPMENT) {
        console.log('订单状态不是待发货，退出');
        // console.log('订单状态不是代付款或待发货，退出');
        return [notifyWindow, false, status];
    }
    
    // console.log('找到消息通知窗口:', activeWindow);
    return [notifyWindow, true, status];

    // const windows = await window.list();
        
    // // 获取并监控千牛弹窗
    // const qianniuWindows = windows.filter(win => 
    //     win.exeName?.includes('AliWorkbench.exe')
    // );
    // const messageWindow = qianniuWindows.find(win => 
    //     win.title.endsWith('-消息通知')
    // );

    // if (!messageWindow) {
    //     console.log('未找到消息通知窗口', qianniuWindows);
    //     // 当前窗口是什么？
    //     console.log('当前窗口', await window.getCurrentWindow());
    //     return null;
    // }

    // return messageWindow;
}

/**
 * Gets the status information of the contact button by analyzing a screenshot
 * @param {Object} win - Window coordinates and dimensions
 * @returns {Promise<Object|null>} Button status information or null if not found
 */
async function getContactButtonPosition(win) {
    // Get screenshot of the button area
    const screenshot = await page.screenshot({
        clip: {
            x: win.x + 130,
            y: win.y + 70,
            width: win.width - 130,
            height: 40
        }
    });

    // Look for yellow color block
    let colorBlock = await ImageColor.findColorBlocks(
        screenshot,
        COLORS.YELLOW_BUTTON
    );

    // If no color block found, return null
    if (!colorBlock) {
        console.log('未找到"和我联系"按钮 色块');
        return null;
    }

    // Parse color block if it's a string
    if (typeof colorBlock === 'string') {
        colorBlock = JSON.parse(colorBlock);
    }

    // Get the first block data
    const blockData = colorBlock[0];
    
    // Calculate center coordinates relative to window
    const centerCoordinates = {
        x: win.x + 130 + blockData.x + (blockData.width / 2),
        y: win.y + 70 + blockData.y + (blockData.height / 2)
    };

    
    console.log('找到色块 -和我联系：', JSON.stringify(blockData));
    console.log('计算得到点击坐标 -和我联系：', JSON.stringify(centerCoordinates));

    return {
        blockData,
        centerCoordinates,
        isFound: true
    };
}


// Click contact button - now only handles the click operation
async function clickContactMeButton(btn) {
    await mouse.click(btn.x, btn.y);
    await sleep(1000);
    return true;
}
  
// Wait for reception window
async function getChatWindow() {
    let chatWindow = null;
    const activeWindow = await window.getActiveWindow();
    
    if (!activeWindow.title.endsWith('-接待中心') || 
        activeWindow.exeName !== 'AliWorkbench.exe') {
        console.log('当前窗口不是接待中心:', activeWindow.title);
        
        const windows = await window.list();
            
        // 获取并监控千牛弹窗
        const qianniuWindows = windows.filter(win =>win.exeName?.includes('AliWorkbench.exe'));
        const chatWindows = qianniuWindows.filter(win =>win.title.endsWith('-接待中心'));
        // console.log('千牛接待中心窗口列表:', chatWindows);

        // const chatWindow = qianniuWindows.find(win =>win.title.endsWith('-接待中心'));
        // chatWindow 从， chatWindows 中获取，index 数值最大的窗口
        chatWindow = chatWindows.reduce((prev, current) => { return prev?.index > current?.index ? prev : current;}, null);
        
        if (chatWindow) {
            console.log('置顶接待中心窗口');
            await window.bringToTop(chatWindow.title);
            await sleep(500);
        }
    }else {
        chatWindow = activeWindow;
    }
    
    console.log('找到接待中心窗口:', chatWindow?.title);
    if (chatWindow?.title) {
        window.setHeight(chatWindow.title, 900);
        console.log('设置接待中心窗口高度 900');
        chatWindow = await window.getActiveWindow();
        await sleep(500);
    }
    return chatWindow;
}

async function clickWaitShipTab(win,orderBlockData) {  
    // 订单中坐标 80， 630
    //   大分辨率 80， 595
    // 色块 +60 ，  -25
    // let btnX = orderBlockData.x + 70;
    // let btnY = orderBlockData.y - 22;
    let btnX = 80;
    let btnY = 630;
  
    const panelX = btnX + win.width - WINDOW_ORDER_WIDTH;
    const panelY = btnY;

    const absoluteX = win.x + panelX;
    const absoluteY = win.y + panelY;     

    console.log('点击待发货选项卡按钮, xy:', btnX, btnY, absoluteX, absoluteY);
    await mouse.click(absoluteX, absoluteY);
    await sleep(500);
}

async function clickShipOrder(win,orderBlockData) {    
    // 色块 + 210, 70 , 通过色块，点击发货按钮，
    let btnX = orderBlockData.x + 210;
    let btnY = orderBlockData.y + 70;

    const panelX = btnX + win.width - WINDOW_ORDER_WIDTH;
    const panelY = btnY;

    const absoluteX = win.x + panelX;
    const absoluteY = win.y + panelY;    

    console.log('点击发货:', btnX, btnY, absoluteX, absoluteY);
    await mouse.click(absoluteX, absoluteY);
    await sleep(600);

    // 确定发货 窗口右下角 -60， -30
    let submitBtnX = win.x + win.width - 60;
    let submitBtnY = win.y + win.height - 30;
    console.log('点击确定发货:', submitBtnX, submitBtnY);
    await mouse.click(submitBtnX, submitBtnY);
    await sleep(500);
}

let WINDOW_ORDER_WIDTH = 480;
let WINDOW_ORDER_HEADER_HEIGHT = 100;
// 高分辨率下窗口高度信息不同.
// let WINDOW_ORDER_WIDTH = 600;
// let WINDOW_ORDER_HEADER_HEIGHT = 120;

// Handle order scroll and status check
async function getOrderBlock(win) {
    const orderAreaX = win.width - WINDOW_ORDER_WIDTH;
    const orderAreaY = WINDOW_ORDER_HEADER_HEIGHT;
    let orderBlocks, orderBlock;
    let screenshot;

    console.log('点击订单区域, xy:', win.x + orderAreaX + 10, win.y + orderAreaY + 50 );
    // Click order area
    await mouse.click(win.x + orderAreaX + 10, win.y + orderAreaY + 50);
    await sleep(500);

    // 先按下pageup，回复到最上面状态，才能取色
    console.log('先按下pageup，回复到最上面状态，才能取色');
    await keyboard.press('PageUp');
    await sleep(100);
    await keyboard.press('PageUp');
    await sleep(500);

    screenshot = await page.screenshot({
        path: 'temp/orderStatusEnd.png',
        clip: {x: win.x + orderAreaX,y: win.y,width: WINDOW_ORDER_WIDTH,height: win.height}
    });    
    // 通过色块的相对坐标，找到待发货选项卡，坐标位置不固定，
    orderBlocks = await ImageColor.findColorBlocks(screenshot,COLORS.ORDER_BLOCK);
    // for-each orderBlocks , 区域截图保持，方便调试
    orderBlocks.forEach(block => {
        page.screenshot({
            path: 'temp/orderStatus_' + block.x + '_' + block.y + '_' + block.width + '_' + block.height + '.png',
            clip: {x: win.x + orderAreaX + block.x,y: win.y + orderAreaY + block.y,width: 20,height: 20}
        });
    })
    // 寻找 400 - 20 ~ 400 + 60 ， 190 - 20 ~ 190 + 60 之间 的色块
    orderBlocks = orderBlocks.filter(block => block.x >= 400 - 20 && block.x <= 400 + 200 && block.y >= 190 - 100 && block.y <= 190 + 60);
    orderBlock = orderBlocks[0];
    if (!orderBlock) orderBlock = { x:30, y:730, width: 430, height: 180 };
    // 截图保持区域orderBlock，方便调试
    // screenshot = await page.screenshot({
    //     path: 'temp/orderBlock.png',
    //     clip: {
    //         x: win.x + orderAreaX + orderBlock.x,
    //         y: win.y + orderAreaY + orderBlock.y,
    //         width: orderBlock.width,
    //         height: orderBlock.height
    //     }
    // })    
    // console.log('找到待发货选项卡，坐标位置不固定，',orderBlock);
    await clickWaitShipTab(win,orderBlock);
    
    // 订单区域，右侧整个部分，包括header
    screenshot = await page.screenshot({
        path: 'temp/orderStatus.png',
        clip: {
            x: win.x + orderAreaX,
            y: win.y,
            width: WINDOW_ORDER_WIDTH,
            height: win.height
        }
    });

    console.log('开始检查订单状态');

    // Check for green "待发货" status
    const hasGreenStatus = ImageColor.hasColor(
        screenshot,
        COLORS.GREEN_STATUS,
        0,
        500,
        WINDOW_ORDER_WIDTH,
        win.height - WINDOW_ORDER_HEADER_HEIGHT - 500
    );
    console.log('hasColor检查绿色状态结果:', hasGreenStatus);

    // 寻找绿色块
    let greenBlocks = await ImageColor.findColorBlocks(
        screenshot,
        COLORS.GREEN_STATUS
    );
    // "height": 18 ~ 30,    "width": 40 ~ 60,
    // let greenBlock = greenBlocks.find((block) => block.height === 18 && block.width === 40);
    let greenBlock = greenBlocks.find((block) => block.height > 18 && block.height < 30 && block.width > 40 && block.width < 60);
    
    // console.log('第一次截图找到的绿色块:', greenBlocks);

    if (!hasGreenStatus && !greenBlock) {
        await Sound.playWarning();
        console.log('订单状态不是待发货，没有绿色快', greenBlocks.length , JSON.stringify(greenBlocks));
        return false;
    }

    console.log('订单状态是待发货，点击订单区域,开始键盘操作，按下翻页end');
    // Press End key
    await keyboard.press('End');
    await sleep(100);
    await keyboard.press('End');
    await sleep(100);
    await keyboard.press('End');
    await sleep(500);

    screenshot = await page.screenshot({
        path: 'temp/orderStatusEnd.png',
        clip: {x: win.x + orderAreaX,y: win.y,width: WINDOW_ORDER_WIDTH,height: win.height}
    });
    // await sleep(100);
    // console.log('开始准备在订单区域找色')    
    orderBlock = await ImageColor.findColorBlocks(screenshot,COLORS.ORDER_BLOCK);
    // console.log('第二次截图找到的订单色块:', orderBlock);
    // console.log('找到的订单色块:', orderBlock);

    if (!orderBlock) {
        console.log('未找到订单区域');
        return false;
    }
    // 从数组中提取第一个元素，
    orderBlock = orderBlock[0];
    return orderBlock;
}

/**
 * Copy order information to clipboard
 * @param {Object} win - Window object
 * @param {Object} orderBlockData - Data about the order block
 * @returns {Object} Object containing clipboard content and success status
 */
async function clickCopyGetProduct(win, orderBlockData) {
    // Store initial clipboard content
    let newClipboard, initialClipboard = '' ;
    try{
        copyToClipboard(" ");
        initialClipboard = getClipboard();
    }catch(e){
        console.log('获取剪切板内容失败',e)
    }
    
    
    // 通过订单色块计算"点我复制"按钮位置
    const copyButtonX = orderBlockData.x + 370;  // 相对于订单色块的X偏移
    const copyButtonY = orderBlockData.y + 20 + orderBlockData.height;  // 相对于订单色块的Y偏移
    console.log('点我复制 按钮位置- 色块相对坐标:', JSON.stringify({copyButtonX, copyButtonY}));
    
    const panelX = copyButtonX + win.width - WINDOW_ORDER_WIDTH;
    const panelY = copyButtonY;
    console.log('点我复制 按钮位置- 窗口坐标:', JSON.stringify({panelX, panelY}));
    
    const absoluteX = win.x + panelX;
    const absoluteY = win.y + panelY;
    
    console.log('点我复制 按钮坐标:', JSON.stringify({absoluteX, absoluteY}));
    
    await mouse.move(absoluteX, absoluteY);
    await sleep(500);
    
    // 点击复制按钮
    await mouse.click(absoluteX, absoluteY);
    await sleep(900);

    // Get new clipboard content and check if it changed
    try{
        newClipboard = getClipboard();
    }catch(e){
        console.log('获取剪切板内容失败',e)
    }
    let title = newClipboard; 
    if (!newClipboard || newClipboard == initialClipboard) {
        console.log('剪贴板内容未变化，当前内容是：' + newClipboard);
        return {  success: false, title,  content: '' };
    }
    
    // Load configuration
    // const config = await loadConfig();
    
    let content = '';
    let gotData = false;
    
    // Query product information
    try {
        const apiResponse = await queryProductInfo(config.apiEndpoint, title);
        if (apiResponse.code === 1000 && apiResponse.data) {
            // Prepare product info content
            content = `${apiResponse.data.title}\n${apiResponse.data.content}`;
            gotData = true;
        } else {
            content = '错误信息: ' +  apiResponse.message;
            console.error('获取产品信息失败:', apiResponse.message ,'标题:', title);
        }
    } catch (error) {
        content = '错误信息: ' +  error.message;
        console.error('获取产品信息失败:', error ,'标题:', title);
    }
    
    return { 
        success: true, 
        title,
        content: content || '老板需要购买什么？',
        gotData: gotData
    };
}

/**
 * Send message in the reception window
 * @param {Object} win - Window object
 * @param {string} content - Message content to send
 * @returns {boolean} Success status of sending message
 */
async function clickSendMessage(win) {
    // Calculate send button position
    const sendButtonX = win.width - WINDOW_ORDER_WIDTH - 20 - 65;
    const sendButtonY = win.height - 25;
       
    // Click send button
    await mouse.click(win.x + sendButtonX, win.y + sendButtonY);
    await sleep(500);
    
    return true;
}

/**
 * Internal method to prepare message input
 * @param {Object} win - Window object
 * @param {string} content - Message content to input
 * @returns {Promise<boolean>} Success status of preparing input
 */
async function inputChatMsg(win, content) {
    // Calculate send button position (used as reference)
    const sendButtonX = win.width - WINDOW_ORDER_WIDTH - 20 - 65;
    const sendButtonY = win.height - 25;
    
    await copyToClipboard(content); // 重置剪切板
    // Click edit area to focus
    await mouse.click(win.x + sendButtonX, win.y + sendButtonY - 20);
    await sleep(500);
    
    // Type message
    // await keyboard.type(content);
    // keyboard 组合键 ctrl + v
    await keyboard.combination('ctrl', 'v');
    await sleep(500);
    
    return true;
}

/**
 * Combined method that copies order and optionally sends message
 * @param {Object} win - Window object
 * @param {Object} orderBlockData - Data about the order block
 * @param {boolean} [shouldSend=true] - Whether to send the message
 * @returns {Promise<boolean>} Success status of the entire process
 */
async function handleCopyAndSend(win, orderBlockData, shouldSend = true) {
    // First, attempt to copy order information
    const copyResult = await clickCopyGetProduct(win, orderBlockData);
    
    // If copy was not successful, return false
    if (!copyResult.success)  return false;
        
    // If we didn't get product data, log a message
    if (!copyResult.gotData) {
        console.log('未获取到产品数据，使用默认消息');
        notify({ title: '未获取到产品数据' , message : '商品标题:' + copyResult.title });
        return false;
    }
    let content = '商品标题: ' + copyResult.title + '\n\n发货内容: ' +  copyResult.content + '\n\n' + config.contentPostfix; 
    // Prepare message input
    await inputChatMsg(win, content );
    
    // If shouldSend is false, we're done
    if (!shouldSend)  return true;
    
    console.log('点击发送消息')
    // Attempt to send the message
    await clickSendMessage(win);

    await sleep(500);    

    await clickShipOrder(win, orderBlockData);
    return true;
}

// Cache variables for last known values
let firstPointColorLast = '';
let secondPointColorLast = ''; 
let orderStatusLast = '';

/**
 * Determines order status based on color points in the notification window
 * @param {string} firstPointColor - Hex color value at coordinates (140,43)
 * @param {string} secondPointColor - Hex color value at coordinates (143,60), only used for order closed status
 * @returns {string} The detected order status from ORDER_STATUS enum
 */
function getOrderStatus(firstPointColor, secondPointColor) {
    // Normalize hex colors to lowercase and ensure # prefix
    const normalizeColor = (color) => {
        if (!color) return '';
        color = color.toLowerCase();
        return color.startsWith('#') ? color : `#${color}`;
    };

    const firstColor = normalizeColor(firstPointColor);
    const secondColor = normalizeColor(secondPointColor);

    // Check cache - if colors haven't changed, return cached status
    if (firstColor === firstPointColorLast && 
        secondColor === secondPointColorLast && 
        orderStatusLast) {
        console.log('Using cached status:', orderStatusLast);
        return orderStatusLast;
    }

    // console.log('Cache miss - analyzing colors:', { firstColor, secondColor });

    // First check for grey status (refund completed or order closed)
    if (firstColor === STATUS_COLORS[ORDER_STATUS.REFUND_COMPLETED].primary) {
        // If second point matches order closed secondary color, it's order closed
        if (secondColor === STATUS_COLORS[ORDER_STATUS.ORDER_CLOSED].secondary) {
            console.log('Matched order closed status (both points)');
            // Update cache
            updateCache(firstColor, secondColor, ORDER_STATUS.ORDER_CLOSED);
            return ORDER_STATUS.ORDER_CLOSED;
        }
        // Otherwise it's refund completed
        console.log('Matched refund completed status');
        // Update cache
        updateCache(firstColor, secondColor, ORDER_STATUS.REFUND_COMPLETED);
        return ORDER_STATUS.REFUND_COMPLETED;
    }

    // Check if the color is grey
    const isGray = ImageColor.isGray(firstColor);
    // console.log('Grey check result:', { isGray, firstColor });

    if (isGray) {
        // console.log('Color is grey, returning unknown status');
        // Update cache
        updateCache(firstColor, secondColor, ORDER_STATUS.UNKNOWN);
        return ORDER_STATUS.UNKNOWN;
    }

    // For non-grey colors, first check for pending payment (close match)
    const pendingPaymentColor = STATUS_COLORS[ORDER_STATUS.PENDING_PAYMENT].primary;
    const isPendingPayment = ImageColor.isColorSimilar(firstColor, pendingPaymentColor, 0.95);
    // console.log('Pending payment check:', {
    //     sourceColor: firstColor,
    //     targetColor: pendingPaymentColor,
    //     result: isPendingPayment
    // });

    if (isPendingPayment.data) {
        // console.log('Matched pending payment status');
        // Update cache
        updateCache(firstColor, secondColor, ORDER_STATUS.PENDING_PAYMENT);
        return ORDER_STATUS.PENDING_PAYMENT;
    }

    // Finally check for pending shipment
    const pendingShipmentColor = STATUS_COLORS[ORDER_STATUS.PENDING_SHIPMENT].primary;
    const isPendingShipment = ImageColor.isColorSimilar(firstColor, pendingShipmentColor, 0.85);
    // console.log('Pending shipment check:', {
    //     sourceColor: firstColor,
    //     targetColor: pendingShipmentColor,
    //     result: isPendingShipment
    // });

    if (isPendingShipment.data) {
        // console.log('Matched pending shipment status');
        // Update cache
        updateCache(firstColor, secondColor, ORDER_STATUS.PENDING_SHIPMENT);
        return ORDER_STATUS.PENDING_SHIPMENT;
    }

    // console.log('No status match found, returning unknown');
    // Update cache
    updateCache(firstColor, secondColor, ORDER_STATUS.UNKNOWN);
    return ORDER_STATUS.UNKNOWN;
}

/**
 * Updates the cache with new color values and status
 * @param {string} firstColor - Normalized first point color
 * @param {string} secondColor - Normalized second point color
 * @param {string} status - Detected order status
 */
function updateCache(firstColor, secondColor, status) {
    firstPointColorLast = firstColor;
    secondPointColorLast = secondColor;
    orderStatusLast = status;
    // console.log('Cache updated:', { firstColor, secondColor, status });
}



// Configuration type definition
class Config {
    constructor() {
        this.apiEndpoint = '';
        this.apiCheckEndpoint = '';
        this.contentPostfix = '';
    }
}

// API Response type definition
class APIResponse {
    constructor() {
        this.code = 0;
        this.message = '';
        this.data = {
            title: '',
            content: ''
        };
    }
}

// Load configuration from ini file
async function loadConfig() {
    try {
        // Check if config file exists
        if (!File.exists('config.ini')) {
            console.error('配置文件 config.ini 不存在');
            throw new Error('Configuration file config.ini does not exist');
        }
        
        const configContent = File.read('config.ini');
        const config = new Config();
        
        // Parse INI content
        const lines = configContent.split('\n');
        for (const line of lines) {
            const [key, value] = line.split('=').map(s => s.trim());
            if (key === 'api_endpoint') {
                config.apiEndpoint = value;
            } else if (key === 'api_check') {
                config.apiCheckEndpoint = value;
            }else if (key === 'content_postfix') {
                config.contentPostfix = value;
            }
        }
        
        return config;
    } catch (error) {
        throw new Error(`Failed to load config: ${error.message}`);
    }
}


// Check API health ,  返回true or false
async function checkAPIHealth(checkEndpoint) {
    try {
        const response = await axios.get(checkEndpoint);
        // response.data = {  "code": 1000,  "data": "测试成功",  "message": "success"} 
        if (response.status !== 200) return false;
        if (response.data.code !== 1000)  return false;
        
        return true;
    } catch (error) {
        // throw new Error(`API health check failed: ${error.message}`);
        return false;
    }
}

// Query product information
async function queryProductInfo(apiEndpoint, title) {
    try {
        const queryString = `${apiEndpoint}?title=${encodeURIComponent(title)}`;
        console.log(`API请求URL: ${queryString}`);
        const response = await axios.get(queryString);
        
        console.log(`API原始响应:`, response.data);
        
        if (response.status !== 200) {
            throw new Error(`HTTP request failed: ${response.status}`);
        }
        
        return response.data;
    } catch (error) {
        throw new Error(`Failed to query product info: ${error.message}`);
    }
}

async function clickCopyAndInputProduct() {
    // Wait for reception window
    const chatMsgWindow = await getChatWindow();
    if (!chatMsgWindow)  return false;
    // console.log('已找到聊天窗口');
        
    // Handle order
    const orderBlockData = await getOrderBlock(chatMsgWindow);
    if (!orderBlockData) {
        notify({ title: '订单栏，未找到订单', message: '可能订单太多，暂未处理', type: 'error'});
        return false;
    }

    // return await clickShipOrder(chatMsgWindow, orderBlockData);  // 测试用，直接进行点击发货，不用获取虚拟商品内容和输入

    console.log('订单栏，已经完成翻页');    // , orderBlockData
    // Copy and send
    await handleCopyAndSend(chatMsgWindow, orderBlockData,false);            
}
let config;
let serviceReady = false;


// Single execution of the automation sequence
async function executeSingleAutomation() {
    try {
      // Load configuration if not already loaded
      if (!config) {
        config = config || await loadConfig();
        console.log(`配置加载完成:`, config);
      }
  
      if (!serviceReady) {
        // Check API health
        let statusRes = await checkAPIHealth(config.apiCheckEndpoint);
        console.log(`API健康检查结果:`, statusRes);
        if (!statusRes) {
          notify({
            title: "自动发货问题",
            message: "服务器访问失败，请检查网络获服务器状态",
            sound: true,
          });
          return false;
        } else {
          notify({
            title: "自动发货检查",
            message: "服务器正常",
            sound: true,
            timeout: 3000
          })
          serviceReady = true;
        }
      }
      
    //   console.log('开始获取消息窗口')
      // Try to get chat notification window
      const notifyWindowInfo = await getNotifyWindow();    
      let [notifyWindow, isShip, status] = notifyWindowInfo;

      if ( status == ORDER_STATUS.PENDING_PAYMENT ) {
        console.log('代付款状态,等待5秒。');
        notify({
          title: "代付款状态,等待5秒。",
          message: "有的小额免密支付很快",
          sound: true,
          timeout: 3000
        })
        await sleep(5000); 
      }
    //   console.log(`消息窗口状态:`, status);
      // If no notification window found, return false
      if (!notifyWindow || !isShip) {
        // console.log(`未找到消息通知窗口`);
        if (notifyWindow) {
            console.log(`消息窗口已打开，不是发货状态，退出。status:`, status);     
            console.info(`关闭消息窗口，title:`, notifyWindow.title);           
            window.closeWindow(notifyWindow.title);
            console.info('窗口关闭成功，js');
        }
        return false;
      }
  
      console.log('消息窗口已打开，status:');
  

      // Get contact button status
      const buttonStatus = await getContactButtonPosition(notifyWindow);
      if (!buttonStatus) {
        console.log('未找到联系按钮');
        console.info(`未找到联系按钮，关闭消息窗口，title:`, notifyWindow.title);
        window.closeWindow(notifyWindow.title);
        // 不是待发货状态，自动关闭窗口
        notify({
          title: "自动发货提示",
          message: "未找到联系按钮，自动关闭窗口，否则新订单不会提醒",
          sound: true,            
          timeout: 3000
        })
        return false;
      }
      
    //   return true;  // 测试用，实际使用时需要删除
      
      console.log(`联系按钮位置:`, JSON.stringify(buttonStatus.centerCoordinates));
      // Click the button using the coordinates from buttonStatus
      const contactSuccess = await clickContactMeButton(buttonStatus.centerCoordinates);
      if (!contactSuccess) {
        console.info(`不是待发货消息提示，关闭消息窗口，title:`, notifyWindow.title);
        notify({
          title: "自动发货提示",
          message: "不是待发货消息提示，自动关闭窗口，否则新订单不会提醒",
          sound: true,
          timeout: 3000          
        })
        window.closeWindow(notifyWindow.title);
        // window.kill(notifyWindow.processId); // 一个进程多个窗口，会导致整个程序悲观，
        return false;
      }
      console.log('已点击联系人按钮');
  
      await sleep(800);

      // Wait for reception window
      const chatMsgWindow = await getChatWindow();
      if (!chatMsgWindow) {
        return false;
      }
            
      console.info(`正常打开聊天窗口，关闭消息窗口，title:`, notifyWindow.title);
      window.closeWindow(notifyWindow.title);

      // Handle order
      const orderBlockData = await getOrderBlock(chatMsgWindow);
      if (!orderBlockData) {
        return false;
      }
      console.log('订单栏，已经完成翻页'); // , orderBlockData
  
      // Copy and send
      await handleCopyAndSend(chatMsgWindow, orderBlockData, true);
  
      return true;
    } catch (error) {
      console.error(`执行出错:`, error);
      return false;
    }
}

// Continuous running version using the single execution function
async function notifyToChatCopyAndSend() {
    try {
        while (true) {
            const success = await executeSingleAutomation();
            
            await sleep(success ? 1000 : 2000);
            // await sleep(success ? 1000 : 60000); // Wait 1 second on success, 1 minute on failure
        }
    } catch (mainError) {
        console.error(`主进程发生严重错误:`, mainError);
        notify({
            title: "自动发货系统崩溃",
            message: "主进程发生严重错误，需要手动重启",
            sound: true,
        });
        throw mainError;
    }
}

// Start automation with error handling
async function startAutomation(continuous = true) {
    try {
        if (continuous) {
            await notifyToChatCopyAndSend();
        } else {
            return await executeSingleAutomation();
        }
    } catch (error) {
        console.error(`自动化流程终止:`, error);
        return false;
    }
}

// Start the automation
// await startAutomation();
// await startAutomation(false);  // 执行单个

await clickCopyAndInputProduct();
