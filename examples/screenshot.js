
// Test 1: 获取base64格式的截图
// console.log("\nTest 1: Base64 Screenshot");
// const base64Image = await page.screenshot();
// console.log("Base64 Screenshot preview:", base64Image.substring(0, 100) + "...");

// Test 2: 保存到指定路径
console.log("\nTest 2: Save to Path");
let testImageBase = await page.screenshot({
    path: "temp/test.png"
});
console.log("Screenshot saved to temp/test.png", testImageBase.substring(0, 100) + "...");

// Test 3: 指定区域截图
console.log("\nTest 3: Clipped Screenshot");
await page.screenshot({
    path: 'temp/screenshot_cut.png',
    clip: {
        x: 100,
        y: 100,
        width: 500,
        height: 300
    }
});
console.log("Clipped screenshot saved to temp/screenshot_cut.png");

// Test 4: 全页面截图
console.log("\nTest 4: Full Page Screenshot");
await page.screenshot({
    path: 'temp/fullpage.png',
    // fullPage: true
});
console.log("Full page screenshot saved to temp/fullpage.png");

// // Test 5: Base64 with clip
console.log("\nTest 5: Base64 with Clip");
const clippedBase64 = await page.screenshot({
    clip: {
        x: 0,
        y: 0,
        width: 800,
        height: 600
    }
});
console.log("Clipped Base64 preview:", clippedBase64.substring(0, 100) + "...");
