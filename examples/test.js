

// 使用全局 notify
await notify({
    title: "Test Started",
    message: "Starting automation...",
    sound: true
});

// console.log("Starting test...");
// Show/Hide desktop
async function toggleDesktop() {
    // await keyboard.down("Meta");
    // await keyboard.press("d");
    // await keyboard.up("Meta");

    // Using the combination method (recommended)
    await keyboard.combination("Meta", "d");
}

await toggleDesktop();
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

await keyboard.type("Hello World");
await page.waitFor(2000);
await keyboard.press("Enter");
await keyboard.type("test monkey");
await page.waitFor(2000);

console.info("Keyboard actions completed");

// 不指定 path，自动返回 base64，截图
const base64Image = await page.screenshot();
console.log("Screenshot (base64):", base64Image.substring(0, 100));


const selectedApi = 'http://ip-api.com/json/?lang=zh-CN';
try {
    const response = await axios.get(selectedApi);
    console.log('IP details:', JSON.stringify(response.data, null, 2));
} catch (error) {
    console.error('Error:', error.message || error);
}
// axios.get(selectedApi)
//     .then(response => {
//         // 直接输出 JSON 格式的返回数据
//         console.log('Your IP details:', response.data);
//     })
//     .catch(error => {
//         console.error('Error fetching IP address:', error);
//     });

  
// 指定 path 保存文件
await page.screenshot({
    path: "test.png"
});

// 同时保存文件并获取 base64
// const anotherBase64 = await page.screenshot({
//     path: "test2.png",
//     encoding: "base64"
// });

await notify({
    message: "Screenshot captured!",
    sound: true
});