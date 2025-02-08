// cd M:\workspace_nodejs\dev_none && node .\temp\post.js

console.log('开始测试', { info: 'ai胶水: 自动测试猿' });

// const axios = require('axios');
const baseUrl = 'http://192.168.2.120:3000/test';
console.log('开始 HTTP 方法测试...\n');

// 获取当前时间戳的函数
function getCurrentTimestamp() {
    return new Date().toISOString();
}

// 测试 GET 请求
console.log(`1. 测试 GET 请求 [${getCurrentTimestamp()}]:`);
const getResponse = await axios.get(baseUrl, {
    params: {
        name: 'test',
        value: 123
    }
});
console.log('GET 响应:', getResponse.data, '类型:', typeof getResponse.data, '\n');

// 测试 POST 请求 (URLSearchParams)
console.log(`2. 测试 POST 请求 (URLSearchParams) [${getCurrentTimestamp()}]:`);
const formData = new URLSearchParams();
formData.append('id', 123);
formData.append('state', 'active');
const postFormResponse = await axios.post(baseUrl, formData);
console.log('POST Form 响应:', postFormResponse.data, '类型:', typeof postFormResponse.data, '\n');

// 测试 POST 请求 (JSON)
console.log(`3. 测试 POST 请求 (JSON) [${getCurrentTimestamp()}]:`);
const postJsonResponse = await axios.post(baseUrl, {
    id: 456,
    data: { name: 'test', value: 'json' }
});
console.log('POST JSON 响应:', postJsonResponse.data, '类型:', typeof postJsonResponse.data, '\n');

// 测试 PUT 请求
console.log(`4. 测试 PUT 请求 [${getCurrentTimestamp()}]:`);
const putResponse = await axios.put(`${baseUrl}/789`, {
    name: 'updated',
    value: 'new'
});
console.log('PUT 响应:', putResponse.data, '类型:', typeof putResponse.data, '\n');

// 测试 PATCH 请求
console.log(`5. 测试 PATCH 请求 [${getCurrentTimestamp()}]:`);
const patchResponse = await axios.patch(`${baseUrl}/789`, {
    value: 'patched'
});
console.log('PATCH 响应:', patchResponse.data, '类型:', typeof patchResponse.data, '\n');

// 测试 DELETE 请求
console.log(`6. 测试 DELETE 请求 [${getCurrentTimestamp()}]:`);
const deleteResponse = await axios.delete(`${baseUrl}/789`);
console.log('DELETE 响应:', deleteResponse.data, '类型:', typeof deleteResponse.data, '\n');

console.log('所有测试完成!');
