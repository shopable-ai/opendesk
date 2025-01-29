
console.log('开始测试 sleep 功能...');
    
console.log('等待 2 秒...');
await sleep(2000);
console.log('2 秒后继续执行');

console.log('使用 sleepSeconds 等待 1 秒...');
await sleepSeconds(1);
console.log('1 秒后继续执行');

// 测试在循环中使用
for (let i = 1; i <= 3; i++) {
    console.log(`第 ${i} 次循环`);
    await sleep(500);  // 每次循环等待 0.5 秒
}

console.log('Sleep 测试完成！');