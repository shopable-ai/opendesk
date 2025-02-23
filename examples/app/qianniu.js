// Constants
const COLORS = {
    YELLOW_BUTTON: '#FEEBA6',
    BLUE_SIDEBAR: '#3D7FFF',
    GREEN_STATUS: '#20AE10',
    GRAY_STATUS: '#B6B9C3',
    ORDER_BLOCK: '#E6EAF5',
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


// get chat notification window
async function getChatNotification() {
    
    const activeWindow = await window.getActiveWindow();
    
    if (!activeWindow.title.endsWith('消息通知') || 
        activeWindow.exeName !== 'AliWorkbench.exe') {
        console.log('当前窗口不是消息通知:', activeWindow.title, activeWindow);
        return null;
    }

    let {x,y,width,height} = activeWindow;
    // 给窗口截图
    const screenshot = await page.screenshot({ clip: {x, y, width, height} });
    console.log('截图完成', screenshot.substring(0, 100));

    // Get colors at specific points (getColorAt should return hex values)
    const firstPointColor = await ImageColor.pixel(screenshot, 140 , 43 ); 
    const secondPointColor = await ImageColor.pixel(screenshot, 143 , 60); 

    console.log('颜色值:', {        firstPoint: firstPointColor,        secondPoint: secondPointColor    })
    // Determine status
    const status = getOrderStatus(firstPointColor, secondPointColor);
    console.log('检测到订单状态:', STATUS_NAMES[status], '颜色值:', {
        firstPoint: firstPointColor,
        secondPoint: secondPointColor
    });

    // 如果状态不是代付款，则直接跳出
    if (status !== ORDER_STATUS.PENDING_PAYMENT && status !== ORDER_STATUS.PENDING_SHIPMENT) {
        console.log('订单状态不是代付款获待发货，退出');
        return null;
    }
    
    // console.log('找到消息通知窗口:', activeWindow);
    return activeWindow;

    // const windows = await window.listWindows();
        
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
async function getContactButtonStatus(win) {
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

    return {
        blockData,
        centerCoordinates,
        isFound: true
    };
}

/**
 * Clicks the contact button based on its detected position
 * @param {Object} win - Window coordinates and dimensions
 * @returns {Promise<boolean>} Success status of the click operation
 */
async function clickContactMeButton(win) {
    const buttonStatus = await getContactButtonStatus(win);
    
    if (!buttonStatus) {
        return false;
    }

    const { centerCoordinates } = buttonStatus;
    
    console.log('找到色块 -和我联系：', buttonStatus.blockData);
    console.log('计算得到点击坐标 -和我联系：', centerCoordinates, {
        winX: win.x,
        winY: win.y,
        blockX: buttonStatus.blockData.x,
        blockY: buttonStatus.blockData.y
    });

    await mouse.click(centerCoordinates.x, centerCoordinates.y);
    await sleep(1000);
    return true;
}

// Wait for reception window
async function getChatWindow() {
    const activeWindow = await window.getActiveWindow();
    
    if (!activeWindow.title.endsWith('-接待中心') || 
        activeWindow.exeName !== 'AliWorkbench.exe') {
        console.log('当前窗口不是接待中心:', activeWindow.title);
        
        const windows = await window.listWindows();
            
        // 获取并监控千牛弹窗
        const qianniuWindows = windows.filter(win => 
            win.exeName?.includes('AliWorkbench.exe')
        );
        const chatWindow = qianniuWindows.find(win => 
            win.title.endsWith('-接待中心')
        );
        
        if (chatWindow) await window.bringToTop(chatWindow.title);
        return chatWindow;
    }
    
    console.log('找到接待中心窗口:', activeWindow);
    return activeWindow;
}

// Handle order scroll and status check
async function getOrderBlock(win) {
    const orderAreaX = win.width - 480;
    const orderAreaY = 100;

    console.log('点击订单区域, xy:', win.x + orderAreaX + 10, win.y + orderAreaY + 10 );
    // Click order area
    await mouse.click(win.x + orderAreaX + 10, win.y + orderAreaY + 10);
    await sleep(500);

    // 先按下pageup，回复到最上面状态，才能取色
    console.log('先按下pageup，回复到最上面状态，才能取色');
    await keyboard.press('PageUp');
    await sleep(500);
    
    // Get order status area screenshot
    let screenshot = await page.screenshot({
        path: 'temp/orderStatus.png',
        clip: {
            x: win.x + orderAreaX,
            y: win.y,
            width: 480,
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
        480,
        win.height - 100 - 500
    );
    console.log('hasColor检查绿色状态结果:', hasGreenStatus);

    // 寻找绿色块
    let greenBlocks = await ImageColor.findColorBlocks(
        screenshot,
        COLORS.GREEN_STATUS
    );
    // "height": 18,    "width": 40,
    let greenBlock = greenBlocks.find((block) => block.height === 18 && block.width === 40);
    
    console.log('第一次截图找到的绿色块:', greenBlocks);

    if (!hasGreenStatus && !greenBlock) {
        await Sound.playWarning();
        console.log('订单状态不是待发货');
        return false;
    }
    console.log('订单状态是待发货');

    console.log('点击订单区域,开始键盘操作，按下翻页end');
    // Press End key
    await keyboard.press('End');
    await sleep(800);

    screenshot = await page.screenshot({
        path: 'temp/orderStatusEnd.png',
        clip: {
            x: win.x + orderAreaX,
            y: win.y,
            width: 480,
            height: win.height
        }
    });
    // await sleep(100);

    console.log('开始准备在订单区域找色')
    // Look for order block first
    let orderBlock = await ImageColor.findColorBlocks(
        screenshot,
        COLORS.ORDER_BLOCK
    );
    console.log('第二次截图找到的订单色块:', orderBlock);
    // 如果是字符串，则转换
    if (typeof orderBlock === 'string') {
        orderBlock = JSON.parse(orderBlock);
    }
    console.log('找到的订单色块:', orderBlock);

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
    const initialClipboard = getClipboard();
    
    // 通过订单色块计算"点我复制"按钮位置
    const copyButtonX = orderBlockData.x + 370;  // 相对于订单色块的X偏移
    const copyButtonY = orderBlockData.y + 20 + orderBlockData.height;  // 相对于订单色块的Y偏移
    console.log('点我复制 按钮位置- 色块相对坐标:', {copyButtonX, copyButtonY});
    
    const panelX = copyButtonX + win.width - 480;
    const panelY = copyButtonY;
    console.log('点我复制 按钮位置- 窗口坐标:', {panelX, panelY});
    
    const absoluteX = win.x + panelX;
    const absoluteY = win.y + panelY;
    
    console.log('点我复制 按钮坐标:', {absoluteX, absoluteY});
    
    await mouse.move(absoluteX, absoluteY);
    await sleep(500);
    
    // 点击复制按钮
    await mouse.click(absoluteX, absoluteY);
    await sleep(500);
    
    // Get new clipboard content and check if it changed
    const newClipboard = getClipboard();
    if (newClipboard === initialClipboard) {
        console.log('剪贴板内容未变化，当前内容是：' + newClipboard);
        return { 
            success: false, 
            content: null 
        };
    }
    let title = newClipboard; 
    
    // Load configuration
    const config = await loadConfig();
    
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
    const sendButtonX = win.width - 480 - 20 - 65;
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
    const sendButtonX = win.width - 480 - 20 - 65;
    const sendButtonY = win.height - 25;
    
    // Click edit area to focus
    await mouse.click(win.x + sendButtonX, win.y + sendButtonY - 20);
    await sleep(500);
    
    // Type message
    await keyboard.type(content);
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
    if (!copyResult.success) {
        return false;
    }
    
    // If we didn't get product data, log a message
    if (!copyResult.gotData) {
        console.log('未获取到产品数据，使用默认消息');
        notify({ title: '未获取到产品数据' , message : '商品标题:' + copyResult.title });
        return false;
    }
    
    // Prepare message input
    await inputChatMsg(win, copyResult.content);
    
    // If shouldSend is false, we're done
    if (!shouldSend)  return true;
    
    // Attempt to send the message
    return await clickSendMessage(win);
}

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

    console.log('Analyzing colors:', { firstColor, secondColor });

    // First check for grey status (refund completed or order closed)
    if (firstColor === STATUS_COLORS[ORDER_STATUS.REFUND_COMPLETED].primary) {
        // If second point matches order closed secondary color, it's order closed
        if (secondColor === STATUS_COLORS[ORDER_STATUS.ORDER_CLOSED].secondary) {
            console.log('Matched order closed status (both points)');
            return ORDER_STATUS.ORDER_CLOSED;
        }
        // Otherwise it's refund completed
        console.log('Matched refund completed status');
        return ORDER_STATUS.REFUND_COMPLETED;
    }

    // Check if the color is grey
    const isGray = ImageColor.isGray(firstColor);
    console.log('Grey check result:', { isGray, firstColor });

    if (isGray) {
        console.log('Color is grey, returning unknown status');
        return ORDER_STATUS.UNKNOWN;
    }

    // For non-grey colors, first check for pending payment (close match)
    const pendingPaymentColor = STATUS_COLORS[ORDER_STATUS.PENDING_PAYMENT].primary;
    const isPendingPayment = ImageColor.isColorSimilar(firstColor, pendingPaymentColor, 0.95);
    console.log('Pending payment check:', {
        sourceColor: firstColor,
        targetColor: pendingPaymentColor,
        result: isPendingPayment
    });

    if (isPendingPayment.data) {
        console.log('Matched pending payment status');
        return ORDER_STATUS.PENDING_PAYMENT;
    }

    // Finally check for pending shipment
    const pendingShipmentColor = STATUS_COLORS[ORDER_STATUS.PENDING_SHIPMENT].primary;
    const isPendingShipment = ImageColor.isColorSimilar(firstColor, pendingShipmentColor, 0.85);
    console.log('Pending shipment check:', {
        sourceColor: firstColor,
        targetColor: pendingShipmentColor,
        result: isPendingShipment
    });

    if (isPendingShipment.data) {
        console.log('Matched pending shipment status');
        return ORDER_STATUS.PENDING_SHIPMENT;
    }

    console.log('No status match found, returning unknown');
    return ORDER_STATUS.UNKNOWN;
}



// Configuration type definition
class Config {
    constructor() {
        this.apiEndpoint = '';
        this.apiCheckEndpoint = '';
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
        console.log(`${new Date().toISOString()} API请求URL: ${queryString}`);
        const response = await axios.get(queryString);
        
        console.log(`${new Date().toISOString()} API原始响应:`, response.data);
        
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
    console.log('已找到聊天窗口');
        
    // Handle order
    const orderBlockData = await getOrderBlock(chatMsgWindow);
    if (!orderBlockData) {
        notify({ title: '订单栏，未找到订单', message: '可能订单太多，暂未处理', type: 'error'});
        return false;
    }

    console.log('订单栏，已经完成翻页', orderBlockData);    
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
            console.log(`${new Date().toISOString()} 配置加载完成:`, config);
        }
        
        if (!serviceReady) {
            // Check API health
            let statusRes = await checkAPIHealth(config.apiCheckEndpoint);
            console.log(`${new Date().toISOString()} API健康检查结果:`, statusRes);
            if (!statusRes) {
                notify({
                    title: "自动发货问题",
                    message: "服务器访问失败，请检查网络获服务器状态",
                    sound: true,
                });
                return false;
            }
            serviceReady = true;        
        }
        
        // Try to get chat notification window
        const notificationWindow = await getChatNotification();
        
        // If no notification window found, return false
        if (!notificationWindow) {
            console.log(`${new Date().toISOString()} 未找到消息通知窗口`);
            return false;
        }
        
        console.log('消息窗口已打开');

        // return true;   // 测试用
        
        // Try to click contact button
        const contactSuccess = await clickContactMeButton(notificationWindow);
        if (!contactSuccess) {
            return false;
        }
        console.log('已点击联系人按钮');
        
        // Wait for reception window
        const chatMsgWindow = await getChatWindow();
        if (!chatMsgWindow) {
            return false;
        }
        
        // Handle order
        const orderBlockData = await getOrderBlock(chatMsgWindow);
        if (!orderBlockData) {
            return false;
        }
        console.log('订单栏，已经完成翻页', orderBlockData);
        
        // Copy and send
        await handleCopyAndSend(chatMsgWindow, orderBlockData, true);
        
        return true;
    } catch (error) {
        console.error(`${new Date().toISOString()} 执行出错:`, error);
        return false;
    }
}

// Continuous running version using the single execution function
async function notifyToChatCopyAndSend() {
    try {
        while (true) {
            const success = await executeSingleAutomation();
            
            // Wait between iterations
            await sleep(success ? 1000 : 60000); // Wait 1 second on success, 1 minute on failure
        }
    } catch (mainError) {
        console.error(`${new Date().toISOString()} 主进程发生严重错误:`, mainError);
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
        console.error(`${new Date().toISOString()} 自动化流程终止:`, error);
        return false;
    }
}

// Start the automation
// await startAutomation();
await startAutomation(false);  // 执行单个

// await clickCopyAndInputProduct();
