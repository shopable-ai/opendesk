
await keyboard.type("Hello World");
await page.waitFor(2000);
await keyboard.press("Enter");
await keyboard.type("test monkey");
await page.waitFor(2000);

await keyboard.combination("Meta", "d");

console.info("Keyboard actions completed");
