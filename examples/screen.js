
// 2. 获取屏幕分辨率
const width = Screen.getWidth();
const height = Screen.getHeight();
console.log('屏幕分辨率:', { width, height });

// 3. 获取屏幕中心点的颜色
const centerX = Math.floor(width / 2);
const centerY = Math.floor(height / 2);
const centerPixelColor = Screen.pixel(centerX, centerY);
console.log('屏幕中心点颜色:', centerPixelColor);

// 4. 获取多个像素点的颜色
const points = [
    [0, 0],  // 左上角
    [width - 1, 0],  // 右上角
    [0, height - 1],  // 左下角
    [width - 1, height - 1],  // 右下角
    { x: centerX, y: centerY }  // 中心点
];
const pixelColors = Screen.pixels(points);
console.log('指定点的颜色:', pixelColors);

// 5. 截取全屏截图
console.log('正在进行全屏截图...');
// const fullScreenshot = await page.screenshot();
const fullScreenshot = await Screen.screenshot();
// const fullScreenshot = await Screen.screenshot({
//     path: './screenshots',
//     format: 'png'
// });
console.log('全屏截图信息:', fullScreenshot.substr(0, 100));

// 6. 截取部分屏幕截图
console.log('正在进行部分屏幕截图...');
