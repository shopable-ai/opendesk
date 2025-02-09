await page.waitFor(1000);

// Test right click
await page.mouse.click(250, 135, { button: "right" });
await page.waitFor(1000);


// Test double click
await page.mouse.click(40, 135, { clickCount: 2 });
await page.waitFor(1000);

await page.mouse.click(500, 500);
// await mouse.click(500, 500);
// await touchscreen.tap(500, 500);

// await keyboard.type("Hello World");
// await page.waitFor(2000);
// await keyboard.press("Enter");
// await keyboard.type("test monkey");
// await page.waitFor(2000);

// console.info("Keyboard actions completed");

// 不指定 path，自动返回 base64，截图
const base64Image = await page.screenshot();
console.log("Screenshot (base64):", base64Image.substring(0, 100));

  
// 指定 path 保存文件
await page.screenshot({
    path: "test.png"
});

await page.screenshot({
    path: 'screenshot_cut.png',
    clip: {
      x: 100,       // 截图区域的x坐标
      y: 100,       // 截图区域的y坐标  
      width: 500, // 截图区域的宽度
      height: 300 // 截图区域的高度
    }
});

// 需要使用区域截图的demo，
