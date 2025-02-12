console.log("=== globalThis 完整测试套件 ===\n");

// 基础可用性测试
console.log("1. 基础可用性测试:");
console.log("globalThis 类型:", typeof globalThis);
console.log("globalThis 是否为对象:", Object.prototype.toString.call(globalThis));

// 对象操作测试
console.log("\n2. 对象操作测试:");
try {
    // 测试简单对象
    globalThis.testObj = {
        name: "测试对象",
        value: 123
    };
    console.log("简单对象测试:", globalThis.testObj);
    
    // 测试嵌套对象
    globalThis.nestedObj = {
        level1: {
            level2: {
                data: "嵌套数据"
            }
        }
    };
    console.log("嵌套对象访问:", globalThis.nestedObj.level1.level2.data);
    
    // 测试对象方法
    globalThis.objWithMethod = {
        data: 100,
        increment: function() {
            this.data += 1;
            return this.data;
        }
    };
    console.log("对象方法测试:", globalThis.objWithMethod.increment());
    
    // 测试数组
    globalThis.testArray = [1, 2, {key: "value"}, [4, 5]];
    console.log("数组测试:", globalThis.testArray);
    
} catch (e) {
    console.log("对象操作测试出错:", e.message);
}

// 函数测试
console.log("\n3. 函数测试:");
try {
    // 测试函数声明
    globalThis.testFunction = function(x) {
        return x * 2;
    };
    console.log("函数调用结果:", globalThis.testFunction(21));
    
    // 测试箭头函数
    globalThis.arrowFunc = (x) => x + 100;
    console.log("箭头函数测试:", globalThis.arrowFunc(50));
    
} catch (e) {
    console.log("函数测试出错:", e.message);
}

// 属性描述符测试
console.log("\n4. 属性描述符测试:");
try {
    Object.defineProperty(globalThis, 'readOnlyProp', {
        value: '只读属性',
        writable: false,
        configurable: true
    });
    console.log("只读属性值:", globalThis.readOnlyProp);
    
    // 测试修改只读属性
    try {
        globalThis.readOnlyProp = "尝试修改";
        console.log("修改后的值:", globalThis.readOnlyProp);
    } catch (e) {
        console.log("修改只读属性时出错:", e.message);
    }
} catch (e) {
    console.log("属性描述符测试出错:", e.message);
}

// 原型链测试
console.log("\n5. 原型链测试:");
try {
    globalThis.protoObj = Object.create({
        parentMethod: function() {
            return "父方法";
        }
    });
    globalThis.protoObj.childMethod = function() {
        return "子方法";
    };
    console.log("原型方法调用:", globalThis.protoObj.parentMethod());
    console.log("自有方法调用:", globalThis.protoObj.childMethod());
} catch (e) {
    console.log("原型链测试出错:", e.message);
}

// 清理测试数据
console.log("\n6. 清理测试数据:");
try {
    const testProps = [
        'testObj', 'nestedObj', 'objWithMethod', 'testArray',
        'testFunction', 'arrowFunc', 'readOnlyProp', 'protoObj'
    ];
    
    testProps.forEach(prop => {
        try {
            delete globalThis[prop];
            console.log(`删除 ${prop} 成功`);
        } catch (e) {
            console.log(`删除 ${prop} 失败:`, e.message);
        }
    });
} catch (e) {
    console.log("清理测试数据出错:", e.message);
}

console.log("\n=== 测试完成 ===");