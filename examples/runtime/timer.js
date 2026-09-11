console.log('开始定时器示例...');

setTimeout(() => {
  console.log('setTimeout 回调执行');
}, 1000);

let counter = 0;
const intervalId = setInterval(() => {
  counter += 1;
  console.log(`setInterval 第 ${counter} 次执行`);
  if (counter >= 3) {
    clearInterval(intervalId);
    console.log('setInterval 已清除');
  }
}, 500);

const canceledTimeout = setTimeout(() => {
  console.log('这条消息不应该显示');
}, 2000);
clearTimeout(canceledTimeout);

console.log('定时器已启动');
