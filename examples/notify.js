
// 使用全局 notify
await notify({
    title: "TestMonkey",
    message: "This is a test notification",
    sound: true,
    timeout: 3000
});

await sleep(3000);
notify('测试通知')
