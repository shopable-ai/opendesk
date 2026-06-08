---
title: TestMonkey Polyfills 说明
description: 解释 polyfills 目录下各兼容层文件的用途与对运行时行为的影响。
order: 60
---

# TestMonkey Polyfills 说明

更新时间：2026-05-18

当前 `polyfills/` 目录文件：

- `000-console.js`
- `000-demo.js`
- `000-global.js`
- `000-page.js`
- `000-systemBase.js`
- `001-promise.js`
- `001-timers.js`
- `002-sleep.js`
- `003-window.js`
- `004-axios.js`
- `url-search-params.js`

这些文件会在运行时初始化阶段按文件名排序自动执行。

## 000-console.js

作用：
- 用注入的 console 方法重新封装全局 `console`

提供：
- `console.log`
- `console.info`
- `console.warn`
- `console.error`
- `console.debug`
- `console.table`
- `console.group`
- `console.groupEnd`
- `console.time`
- `console.timeEnd`
- `console.clear`

## 000-global.js

提供两个全局函数：

- `copyToClipboard(text)`
- `getClipboard()`

底层调用：

- `clipboard.copy(text)`
- `clipboard.paste()`

## 000-page.js

作用：
- 对原生 `page` 进行包装和增强

主要增强：
- `page.screenshot()` wrapper
- `page.waitFor()`
- `page.waitForTimeout()`
- `page.waitForFunction()`
- `page.waitForNavigation()`
- `page.checkPermissions()`
- `page.requestPermissions()`
- `page.ensurePermissions()`
- `page.ensureMacPermissions()`

它也是 `page` 行为与源码原生实现之间最重要的一层兼容 facade。

## 000-systemBase.js

提供全局函数：

- `notify(optionsOrTitle)`

如果传字符串，会自动转成：

```js
{
  title: "传入字符串",
  message: "",
  sound: true,
  timeout: 5000
}
```

底层调用：
- `notify____Inject(options)`

## 001-promise.js

当运行时没有 Promise 时，注入简化 Promise polyfill：

- `new Promise(executor)`
- `promise.then()`
- `promise.catch()`
- `Promise.resolve()`
- `Promise.reject()`
- `Promise.all()`
- `Promise.race()`

## 001-timers.js

校验以下函数存在：

- `setTimeout`
- `setInterval`
- `clearTimeout`
- `clearInterval`

并补充：

- `requestAnimationFrame(callback)`
- `cancelAnimationFrame(id)`

说明：
- `requestAnimationFrame` 基于 `setTimeout(..., 1000/60)` 模拟

## 002-sleep.js

提供：

- `sleep(ms)`
- `sleepSeconds(seconds)`

示例：

```js
await sleep(500)
await sleepSeconds(2)
```

## 003-window.js

对以下方法返回值做字段名标准化：

- `window.getActiveWindow()`
- `window.getWindowByTitle(title)`

行为：
- 把字段名转成 lowerCamelCase

## 004-axios.js

重新定义增强版 `axios`：

- 默认配置
- request / response interceptors
- `request/get/post/put/delete/patch`
- `validateStatus`
- `params` 自动拼 query

这层通常会覆盖 Go 注入的基础版 axios，最终应以这里的行为为准。

## url-search-params.js

注入 `URLSearchParams` polyfill，支持：

- `append(name, value)`
- `delete(name)`
- `get(name)`
- `getAll(name)`
- `has(name)`
- `set(name, value)`
- `toString()`
- `entries()`
- `keys()`
- `values()`

## 000-demo.js

当前基本是注释占位，不构成正式对外接口。

## 使用建议

如果脚本行为和 Go 原生定义不完全一致，优先检查：

1. 是否被 polyfill 包装过
2. 是否在 `polyfills/004-axios.js` 中被重定义
3. 是否存在兼容别名，例如：
   - `ensureMacPermissions()`
   - `sleep()`
   - `copyToClipboard()`
