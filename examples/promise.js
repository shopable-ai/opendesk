// 首先测试 Promise 功能
console.log('测试 Promise 功能...');

async function testPromise() {
    // 测试基本的 Promise 功能
    const p1 = new Promise(resolve => setTimeout(() => resolve('success'), 100));
    const result1 = await p1;
    console.log('Promise.resolve 测试:', result1 === 'success' ? '通过' : '失败');

    // 测试 Promise.all
    const promises = [
        Promise.resolve(1),
        new Promise(resolve => setTimeout(() => resolve(2), 50)),
        Promise.resolve(3)
    ];
    const results = await Promise.all(promises);
    console.log('Promise.all 测试:', 
        results.length === 3 && 
        results[0] === 1 && 
        results[1] === 2 && 
        results[2] === 3 ? '通过' : '失败'
    );

    // 测试 Promise rejection
    try {
        await new Promise((resolve, reject) => reject(new Error('test error')));
        console.log('Promise rejection 测试: 失败');
    } catch (e) {
        console.log('Promise rejection 测试: 通过');
    }

    // 测试 Promise.race
    const winner = await Promise.race([
        new Promise(resolve => setTimeout(() => resolve('slow'), 100)),
        new Promise(resolve => setTimeout(() => resolve('fast'), 50))
    ]);
    console.log('Promise.race 测试:', winner === 'fast' ? '通过' : '失败');
}

// 运行 Promise 测试
await testPromise();
console.log('Promise 测试完成\n');

// 继续运行其他 HTTP 测试...
// ... 原有的 HTTP 测试代码 ...