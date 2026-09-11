console.log('开始 sleep 示例...');

console.log('等待 2 秒...');
await sleep(2000);
console.log('2 秒后继续执行');

console.log('使用 sleepSeconds 等待 1 秒...');
await sleepSeconds(1);
console.log('1 秒后继续执行');

for (let index = 1; index <= 3; index++) {
  console.log(`第 ${index} 次循环`);
  await sleep(500);
}

console.log('Sleep 示例完成');
