

// 使用全局 notify
await notify({
    title: "Test Started",
    message: "Starting automation...",
    sound: true
});

// console.log("Starting test...");

// await page.mouse.click(500, 500);

await keyboard.type("Hello World");
await page.waitFor(2000);
await keyboard.press("Enter");
await keyboard.type("test monkey");
// await page.waitFor(2000);

console.info("Keyboard actions completed");


// 不指定 path，自动返回 base64
const base64Image = await page.screenshot();
console.log("Screenshot (base64):", base64Image);

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