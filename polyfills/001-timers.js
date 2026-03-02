// automation/polyfills/001-timers.js

(function(global) {
    // 不要尝试存储原生实现，因为它们还不存在
    // 直接使用全局对象中定义的函数

    // 基础计时器功能检查和定义
    if (typeof setTimeout !== 'function') {
        throw new Error('setTimeout is not implemented in runtime');
    }

    if (typeof setInterval !== 'function') {
        throw new Error('setInterval is not implemented in runtime');
    }

    if (typeof clearTimeout !== 'function') {
        throw new Error('clearTimeout is not implemented in runtime');
    }

    if (typeof clearInterval !== 'function') {
        throw new Error('clearInterval is not implemented in runtime');
    }

    // requestAnimationFrame polyfill
    if (typeof requestAnimationFrame === 'undefined') {
        const fps = 60;
        const frameInterval = 1000 / fps;
        
        global.requestAnimationFrame = function(callback) {
            return setTimeout(function() {
                callback(Date.now());
            }, frameInterval);
        };
        
        global.cancelAnimationFrame = function(id) {
            clearTimeout(id);
        };
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);

// 验证计时器功能是否正确加载
console.log('Timer polyfills loaded successfully');