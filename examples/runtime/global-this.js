console.log('=== globalThis 示例 ===');

console.log('globalThis 类型:', typeof globalThis);
console.log('globalThis 对象标签:', Object.prototype.toString.call(globalThis));

globalThis.exampleValue = {name: 'OpenDesk', value: 123};
console.log('读取自定义全局值:', globalThis.exampleValue);

globalThis.exampleFunction = value => value * 2;
console.log('调用自定义全局函数:', globalThis.exampleFunction(21));

delete globalThis.exampleValue;
delete globalThis.exampleFunction;
console.log('示例创建的全局属性已清理');
