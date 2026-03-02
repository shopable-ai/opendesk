let position = await page.mouse.getPos();
console.log("mouse position: ", position);

console.log('click xy 1715, 185');
await page.mouse.click(550, 185);
// await page.mouse.click(1715, 185);
await page.waitFor(1000);

console.log('move xy 550, 300');
// 移动到新位置 (1715-300 = 1415)
await page.mouse.move(550, 300);
await page.waitFor(1000);

console.log('scroll down');
// 执行3次向下滚动，每次滚动后等待以确保页面响应
await page.mouse.wheel({ deltaY: 300 });  // 第一次滚动
await page.waitFor(1000);

await page.mouse.wheel({ deltaY: 300 });
await page.waitFor(1000);

await page.mouse.wheel({ deltaY: 300 });  // 第三次滚动
await page.waitFor(1000);

console.log('scroll up');
// 执行一次向上滚动 (注意 deltaY 为负值表示向上滚动)
await page.mouse.wheel({ deltaY: -300 });
await page.waitFor(1000);


// 平滑滚动
await page.mouse.wheel({ 
    deltaY: 300,
    steps: 10,
    delay: 30
});

console.log('right click');
await page.mouse.click(650, 300, { button: "right" });

// await mouse.click(500, 500);
// await touchscreen.tap(500, 500);

