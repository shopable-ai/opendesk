// Generate Mock WeChat Interface for Testing
// 生成模拟微信界面用于测试布局识别算法

const wait = (ms) => page.waitFor(ms);

// 微信界面的标准布局定义
const WECHAT_LAYOUT = {
    width: 1200,
    height: 800,
    regions: [
        {
            name: 'sidebar',
            label: '侧边栏',
            x: 0,
            y: 0,
            width: 60,
            height: 800,
            color: '#2E2E2E',  // 深灰色
            items: [
                { type: 'icon', y: 20, label: '聊天' },
                { type: 'icon', y: 80, label: '通讯录' },
                { type: 'icon', y: 140, label: '收藏' },
                { type: 'icon', y: 200, label: '文件' },
            ]
        },
        {
            name: 'chatList',
            label: '聊天列表',
            x: 60,
            y: 0,
            width: 280,
            height: 800,
            color: '#F5F5F5',  // 浅灰色背景
            items: [
                { type: 'search', y: 10, height: 40 },
                { type: 'chat', y: 60, selected: true, name: '张三', message: '你好，在吗？', time: '14:30' },
                { type: 'chat', y: 130, selected: false, name: '李四', message: '明天见', time: '昨天' },
                { type: 'chat', y: 200, selected: false, name: '王五', message: '收到', time: '星期一' },
                { type: 'chat', y: 270, selected: false, name: '赵六', message: '好的', time: '12/25' },
                { type: 'chat', y: 340, selected: false, name: '工作群', message: '会议通知', time: '14:00' },
            ]
        },
        {
            name: 'chatContent',
            label: '聊天内容区',
            x: 340,
            y: 0,
            width: 860,
            height: 800,
            color: '#FFFFFF',  // 白色背景
            sections: [
                { type: 'header', y: 0, height: 60, name: '张三' },
                { type: 'messages', y: 60, height: 640 },
                { type: 'input', y: 700, height: 100 },
            ]
        }
    ]
};

async function generateMockWeChatImage() {
    console.log('生成模拟微信界面...');

    const layout = WECHAT_LAYOUT;
    const canvas = {
        width: layout.width,
        height: layout.height
    };

    // 使用 Vision API 创建画布
    const mockImageData = {
        width: canvas.width,
        height: canvas.height,
        regions: []
    };

    // 1. 绘制侧边栏
    const sidebar = layout.regions[0];
    mockImageData.regions.push({
        name: sidebar.name,
        label: sidebar.label,
        x: sidebar.x,
        y: sidebar.y,
        width: sidebar.width,
        height: sidebar.height,
        color: sidebar.color,
        items: sidebar.items
    });

    // 2. 绘制聊天列表
    const chatList = layout.regions[1];
    mockImageData.regions.push({
        name: chatList.name,
        label: chatList.label,
        x: chatList.x,
        y: chatList.y,
        width: chatList.width,
        height: chatList.height,
        color: chatList.color,
        items: chatList.items
    });

    // 3. 绘制聊天内容区
    const chatContent = layout.regions[2];
    mockImageData.regions.push({
        name: chatContent.name,
        label: chatContent.label,
        x: chatContent.x,
        y: chatContent.y,
        width: chatContent.width,
        height: chatContent.height,
        color: chatContent.color,
        sections: chatContent.sections
    });

    console.log('模拟界面布局:');
    console.log(`  总尺寸: ${canvas.width}x${canvas.height}`);
    console.log(`  区域数: ${mockImageData.regions.length}`);
    mockImageData.regions.forEach(r => {
        console.log(`    - ${r.label}: (${r.x}, ${r.y}, ${r.width}x${r.height}) 颜色: ${r.color}`);
    });

    return mockImageData;
}

async function drawMockInterface(mockData, outputPath) {
    console.log('\n绘制模拟界面到图片...');

    // 创建 HTML Canvas 来绘制
    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { margin: 0; padding: 0; }
        canvas { display: block; }
    </style>
</head>
<body>
    <canvas id="canvas" width="${mockData.width}" height="${mockData.height}"></canvas>
    <script>
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');

        // 绘制背景
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, ${mockData.width}, ${mockData.height});

        // 绘制侧边栏
        ctx.fillStyle = '#2E2E2E';
        ctx.fillRect(0, 0, 60, 800);

        // 绘制侧边栏图标
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '12px Arial';
        ctx.fillText('聊天', 15, 40);
        ctx.fillText('通讯录', 10, 100);
        ctx.fillText('收藏', 15, 160);
        ctx.fillText('文件', 15, 220);

        // 绘制聊天列表背景
        ctx.fillStyle = '#F5F5F5';
        ctx.fillRect(60, 0, 280, 800);

        // 绘制搜索框
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(70, 10, 260, 40);
        ctx.strokeStyle = '#DDDDDD';
        ctx.strokeRect(70, 10, 260, 40);
        ctx.fillStyle = '#999999';
        ctx.font = '14px Arial';
        ctx.fillText('搜索', 80, 35);

        // 绘制聊天项 - 选中状态
        ctx.fillStyle = '#C7C7C7';
        ctx.fillRect(60, 60, 280, 70);

        // 绘制头像（选中）
        ctx.fillStyle = '#4A90E2';
        ctx.fillRect(70, 70, 50, 50);

        // 绘制聊天信息（选中）
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 16px Arial';
        ctx.fillText('张三', 130, 85);
        ctx.fillStyle = '#666666';
        ctx.font = '14px Arial';
        ctx.fillText('你好，在吗？', 130, 110);
        ctx.fillStyle = '#999999';
        ctx.font = '12px Arial';
        ctx.fillText('14:30', 280, 85);

        // 绘制聊天项 - 未选中
        const chats = [
            { y: 130, name: '李四', msg: '明天见', time: '昨天' },
            { y: 200, name: '王五', msg: '收到', time: '星期一' },
            { y: 270, name: '赵六', msg: '好的', time: '12/25' },
            { y: 340, name: '工作群', msg: '会议通知', time: '14:00' },
        ];

        chats.forEach(chat => {
            // 头像
            ctx.fillStyle = '#7CB342';
            ctx.fillRect(70, chat.y + 10, 50, 50);

            // 名字
            ctx.fillStyle = '#000000';
            ctx.font = 'bold 16px Arial';
            ctx.fillText(chat.name, 130, chat.y + 25);

            // 消息
            ctx.fillStyle = '#666666';
            ctx.font = '14px Arial';
            ctx.fillText(chat.msg, 130, chat.y + 50);

            // 时间
            ctx.fillStyle = '#999999';
            ctx.font = '12px Arial';
            ctx.fillText(chat.time, 280, chat.y + 25);

            // 分隔线
            ctx.strokeStyle = '#E0E0E0';
            ctx.beginPath();
            ctx.moveTo(60, chat.y + 70);
            ctx.lineTo(340, chat.y + 70);
            ctx.stroke();
        });

        // 绘制聊天内容区背景
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(340, 0, 860, 800);

        // 绘制聊天头部
        ctx.fillStyle = '#F5F5F5';
        ctx.fillRect(340, 0, 860, 60);
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 18px Arial';
        ctx.fillText('张三', 360, 35);

        // 绘制分隔线
        ctx.strokeStyle = '#E0E0E0';
        ctx.beginPath();
        ctx.moveTo(340, 60);
        ctx.lineTo(1200, 60);
        ctx.stroke();

        // 绘制聊天消息区域
        ctx.fillStyle = '#F9F9F9';
        ctx.fillRect(340, 60, 860, 640);

        // 绘制一些消息气泡
        // 对方消息
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(360, 80, 300, 60);
        ctx.strokeStyle = '#E0E0E0';
        ctx.strokeRect(360, 80, 300, 60);
        ctx.fillStyle = '#000000';
        ctx.font = '14px Arial';
        ctx.fillText('你好，在吗？', 370, 110);

        // 自己的消息
        ctx.fillStyle = '#95EC69';
        ctx.fillRect(840, 160, 300, 60);
        ctx.fillStyle = '#000000';
        ctx.font = '14px Arial';
        ctx.fillText('在的，有什么事吗？', 850, 190);

        // 对方消息
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(360, 240, 350, 80);
        ctx.strokeStyle = '#E0E0E0';
        ctx.strokeRect(360, 240, 350, 80);
        ctx.fillStyle = '#000000';
        ctx.font = '14px Arial';
        ctx.fillText('明天下午3点开会，', 370, 270);
        ctx.fillText('记得准时参加。', 370, 295);

        // 绘制输入区域
        ctx.fillStyle = '#F5F5F5';
        ctx.fillRect(340, 700, 860, 100);

        // 绘制分隔线
        ctx.strokeStyle = '#E0E0E0';
        ctx.beginPath();
        ctx.moveTo(340, 700);
        ctx.lineTo(1200, 700);
        ctx.stroke();

        // 绘制输入框
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(360, 720, 780, 60);
        ctx.strokeStyle = '#DDDDDD';
        ctx.strokeRect(360, 720, 780, 60);

        // 绘制垂直分隔线（用于测试识别）
        ctx.strokeStyle = '#E0E0E0';
        ctx.lineWidth = 1;

        // 侧边栏分隔线
        ctx.beginPath();
        ctx.moveTo(60, 0);
        ctx.lineTo(60, 800);
        ctx.stroke();

        // 聊天列表分隔线
        ctx.beginPath();
        ctx.moveTo(340, 0);
        ctx.lineTo(340, 800);
        ctx.stroke();
    </script>
</body>
</html>
    `;

    // 保存 HTML 文件
    const htmlPath = '.runtime/tests/wechat/mock_wechat.html';
    console.log(`  保存 HTML: ${htmlPath}`);

    // 注意：在 goja 环境中无法直接写文件，需要通过其他方式
    // 这里我们返回 HTML 内容，让 Go 代码处理
    return { html, htmlPath };
}

async function testLayoutRecognition(imagePath) {
    console.log('\n测试布局识别算法...');

    // 使用 Vision.analyzeLayout 分析模拟图片
    const result = await Vision.analyzeLayout({
        imagePath: imagePath,
        cellSize: 10,
        quantize: 16,
        tolerance: 32,
        minRegionArea: 4,
        minSeparatorScore: 0.08,
        cellColorMode: 'median',
        boundarySpanWidth: 3,
    });

    const vertical = result.separators?.vertical || [];
    const horizontal = result.separators?.horizontal || [];

    console.log('识别结果:');
    console.log(`  垂直分隔符: ${vertical.length}个`);
    if (vertical.length > 0) {
        const positions = vertical.map(s => Math.round(s.position)).join(', ');
        console.log(`    位置: [${positions}]`);
    }
    console.log(`  水平分隔符: ${horizontal.length}个`);

    // 验证识别结果
    console.log('\n验证识别结果:');
    const expectedVertical = [60, 340];  // 侧边栏和聊天列表的分隔线

    console.log(`  期望的垂直分隔符: [${expectedVertical.join(', ')}]`);

    let correctCount = 0;
    expectedVertical.forEach(expected => {
        const found = vertical.find(v => Math.abs(v.position - expected) < 10);
        if (found) {
            console.log(`  ✅ 找到分隔符 ${expected} (实际: ${Math.round(found.position)})`);
            correctCount++;
        } else {
            console.log(`  ❌ 未找到分隔符 ${expected}`);
        }
    });

    const accuracy = (correctCount / expectedVertical.length * 100).toFixed(1);
    console.log(`\n识别准确率: ${accuracy}%`);

    return { result, accuracy };
}

async function main() {
    console.log('='.repeat(80));
    console.log('微信布局识别测试 - 使用模拟数据');
    console.log('='.repeat(80));
    console.log();

    try {
        // 步骤 1: 生成模拟界面数据
        console.log('【步骤 1】生成模拟微信界面数据');
        const mockData = await generateMockWeChatImage();

        // 步骤 2: 绘制模拟界面
        console.log('\n【步骤 2】绘制模拟界面');
        const htmlData = await drawMockInterface(mockData, '.runtime/tests/wechat/mock_wechat.png');

        console.log('\n✅ 模拟界面已生成');
        console.log('\n说明:');
        console.log('  由于 JavaScript 环境限制，需要手动完成以下步骤:');
        console.log('  1. 打开浏览器访问生成的 HTML 文件');
        console.log('  2. 对页面进行截图');
        console.log('  3. 保存为 .runtime/tests/wechat/mock_wechat.png');
        console.log('  4. 重新运行此脚本进行识别测试');
        console.log('\n或者使用 Go 代码生成图片（推荐）');

    } catch (error) {
        console.error('\n❌ 错误:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        throw error;
    }
}

main().catch(console.error);
