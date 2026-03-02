// 1. console.log() - 基础信息输出
console.log('Hello World');  // 普通字符串
console.log('数字:', 42);    // 多个参数
console.log('%c带样式的文字', 'color: blue; font-size: 20px'); // 带CSS样式

// 2. console.info() - 信息性消息
console.info('这是一条信息');

// 3. console.warn() - 警告消息
console.warn('这是一条警告消息');

// 4. console.error() - 错误消息
console.error('这是一条错误消息');

// 5. console.debug() - 调试信息
console.debug('这是一条调试信息');

// 6. 打印对象和数组
const user = {
    name: '张三',
    age: 25,
    hobbies: ['读书', '运动']
};
console.log('完整对象:', user);
console.log('格式化对象:', JSON.stringify(user, null, 2));

// 7. console.group() - 分组输出
console.group('用户信息分组');
console.log('姓名:', user.name);
console.log('年龄:', user.age);
console.log('爱好:', user.hobbies);
console.groupEnd();

// 8. console.time() - 计时功能
console.time('循环计时');
for(let i = 0; i < 1000000; i++) {
    // 执行一些操作
}
console.timeEnd('循环计时');

console.error('参数是null', null);
console.error('参数是undefined', undefined);

// 14. 自定义计数器 , 接口不存在
// for(let i = 0; i < 3; i++) {
//     console.count('循环计数');
// }
// console.countReset('循环计数'); // 重置计数器

