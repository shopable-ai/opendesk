// 1. 基础字符串测试
const testKey = 'testKey-' + moment().format('YYYY-MM-DD');
const testValue = '这是一个测试存储的值 - ' + Math.random();

// 读取当前缓存
let cache = AppStorage.getItem(testKey);
console.log('当前缓存:', !!cache, {cache});

// 存储新值
console.log('准备存储数据:', { key: testKey, value: testValue });
AppStorage.setItem(testKey, testValue);
console.log('数据已成功存储');

// 等待1秒
await sleep(1000);

// 读取并验证基础字符串
const retrievedValue = AppStorage.getItem(testKey);
console.log('获取的存储值:', retrievedValue);

// 验证基础字符串的存储
if (retrievedValue === testValue) {
    console.log('✅ 基础字符串存储成功：值完全匹配');
} else {
    console.warn('❌ 基础字符串存储失败');
    console.warn('预期:', testValue);
    console.warn('实际:', retrievedValue);
}

// 2. JSON 字符串测试
const jsonKey = 'jsonTest-' + moment().format('YYYY-MM-DD');
const jsonObject = {
    name: "测试对象",
    items: [1, 2, 3],
    config: {
        enabled: true,
        options: ["a", "b", "c"]
    }
};

// 转换为 JSON 字符串并存储
const jsonString = JSON.stringify(jsonObject);
console.log('准备存储 JSON 数据:', { key: jsonKey, value: jsonString });
AppStorage.setItem(jsonKey, jsonString);
console.log('JSON 数据已存储');

// 等待1秒
await sleep(1000);

// 读取 JSON 字符串并解析
const retrievedJsonString = AppStorage.getItem(jsonKey);
let retrievedObject;
let parseSuccess = false;

try {
    retrievedObject = JSON.parse(retrievedJsonString);
    parseSuccess = true;
    console.log('解析后的 JSON 数据:', retrievedObject);
} catch (err) {
    console.error('JSON 解析失败:', err);
}

// 验证 JSON 数据的存储
if (parseSuccess && JSON.stringify(retrievedObject) === JSON.stringify(jsonObject)) {
    console.log('✅ JSON 存储成功：对象完全匹配');
} else {
    console.warn('❌ JSON 存储失败');
    console.warn('预期:', JSON.stringify(jsonObject));
    console.warn('实际:', retrievedJsonString);
}

// 3. 验证数据持久性
console.log('\n存储的所有键:');
const length = AppStorage.getLength();
for (let i = 0; i < length; i++) {
    const key = AppStorage.key(i);
    const value = AppStorage.getItem(key);
    console.log(`${key}: ${value.slice(0, 50)}${value.length > 50 ? '...' : ''}`);
}