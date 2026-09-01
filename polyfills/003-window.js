
// 转换函数
function toLowerCaseProps(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(toLowerCaseProps);
    }

    return Object.keys(obj).reduce((acc, key) => {
        const value = obj[key];
        const newKey = key === 'ID' ? 'id' : key.charAt(0).toLowerCase() + key.slice(1);
        acc[newKey] = typeof value === 'object' ? toLowerCaseProps(value) : value;
        return acc;
    }, {});
}

function normalizeWindowResult(result) {
    const normalized = toLowerCaseProps(result);
    if (normalized && normalized.pid === undefined && normalized.processID !== undefined) normalized.pid = normalized.processID;
    return normalized;
}

// 修改 getActiveWindow 方法的包装器
const originalGetActiveWindow = window.getActiveWindow;
window.getActiveWindow = async function() {
    const result = await originalGetActiveWindow.call(window);
    return normalizeWindowResult(result);
};

// 修改 getWindowByTitle 方法的包装器
const originalGetWindowByTitle = window.getWindowByTitle;
window.getWindowByTitle = async function(title) {
    const result = await originalGetWindowByTitle.call(window, title);
    return normalizeWindowResult(result);
};

const originalGetFocusWindow = window.getFocusWindow;
window.getFocusWindow = function() {
    return normalizeWindowResult(originalGetFocusWindow.call(window));
};
