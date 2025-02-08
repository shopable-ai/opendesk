
// 2. 测试设置和获取简单的键值对
const testKey = 'testKey-' + new Date().toLocaleString();
const testValue = '这是一个测试存储的值 - ' + Math.random();

console.log('准备存储数据:', { key: testKey, value: testValue });

// 使用 AppStorage 方法存储
AppStorage.setItem(testKey, testValue);
console.log('数据已成功存储');

// 等待1秒
await sleep(1000);

// 获取并验证存储的值
const [retrievedValue, exists] = AppStorage.getItem(testKey);
console.log('获取的存储值:', retrievedValue);

// 验证存储的内容是否正确
if (exists && retrievedValue === testValue) {
    console.log('✅ 存储操作成功：值完全匹配');
} else {
    console.warn('❌ 存储内容不匹配');
    console.warn('预期:', testValue);
    console.warn('实际:', retrievedValue);
    console.warn('是否存在:', exists);
}
