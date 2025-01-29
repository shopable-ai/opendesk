// 测试定时器功能
console.log('开始测试定时器功能...');

// 测试 setTimeout
console.log('测试 setTimeout...');
setTimeout(() => {
    console.log('setTimeout 回调执行了!');
}, 1000);

// 测试 setInterval
let counter = 0;
const intervalId = setInterval(() => {
    counter++;
    console.log(`setInterval 第 ${counter} 次执行`);
    if (counter >= 3) {
        clearInterval(intervalId);
        console.log('setInterval 已清除');
    }
}, 500);

// 测试 clearTimeout
const timeoutId = setTimeout(() => {
    console.log('这条消息不应该显示');
}, 2000);
clearTimeout(timeoutId);

console.log('定时器测试已启动...');