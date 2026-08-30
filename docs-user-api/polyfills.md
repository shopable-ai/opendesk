---
title: Polyfills
description: Clawdesk 运行时 polyfill、全局辅助函数、axios 与兼容 facade。
order: 12
---

# polyfills

`polyfills/*.js` 在原生对象注入后、用户脚本执行前按文件名排序加载。

它们负责：

- 包装原生 API
- 补 Promise / timer / sleep 等运行时能力
- 增强 `page`
- 提供 `axios`
- 提供 `notify()` 等全局便捷函数
- 提供 upgraded / playwright 风格兼容 facade

## 000-console.js

将全局 `console` 映射到 Clawdesk 日志对象。

常用：

- `console.log`
- `console.info`
- `console.warn`
- `console.error`
- `console.debug`
- `console.table`
- `console.group` / `groupEnd`
- `console.time` / `timeEnd`

初始化结束后，运行时会再次把 `console` 切换到真正的执行事件 sink，因此脚本日志可以进入执行工件和事件流。

## 000-global.js

提供全局剪贴板便捷函数：

```js
copyToClipboard('hello');
const text = getClipboard();
```

底层仍由 `clipboard` 对象完成实际工作。

## 000-page.js

这是最重要的 page 增强层之一。

主要提供：

| 方法 | 用途 |
| --- | --- |
| `page.waitFor(number|function, options)` | 数字等待或函数条件等待 |
| `page.waitForTimeout(ms)` | Promise 风格延时 |
| `page.waitForNavigation(options)` | 兼容式导航等待 |
| `page.waitForFunction(fn, options, ...args)` | 条件轮询 |
| `page.waitForAll(...)` | Promise.all + timeout |
| `page.checkPermissions(options)` | 权限快照 |
| `page.requestPermissions(options)` | 权限请求 |
| `page.ensurePermissions(options)` | 严格权限守卫 |
| `page.ensureMacPermissions(options)` | macOS 兼容入口 |

新脚本优先使用 `page.ensurePermissions()`；`ensureMacPermissions()` 主要用于 macOS 明确场景和历史兼容。

## 000-systemBase.js：notify()

`notify()` 是用户可调用的全局通知函数。

字符串形式：

```js
notify('任务完成');
```

等价于默认：

```js
notify({
  title: '任务完成',
  message: '',
  sound: true,
  timeout: 5000
});
```

对象形式：

```js
notify({
  title: 'Clawdesk',
  message: '自动化已经完成',
  sound: true,
  timeout: 5000
});
```

底层通过 `notify____Inject` 调到 Go 通知实现。

**状态：Secondary**

它适合脚本完成提示，不应当被用作关键业务状态的唯一证据。

## 001-promise.js

提供 Promise 兼容能力，使运行时能支持 `async/await` 风格脚本。

## 001-timers.js / 002-sleep.js

补全 timer 与 sleep：

- `setTimeout`
- `setInterval`
- `clearTimeout`
- `clearInterval`
- `sleep(ms)`
- `sleepSeconds(seconds)`

等待 UI 状态时，优先使用条件等待而不是堆叠长时间 sleep。

## 003-window.js

对部分窗口返回结构做用户层规范化，例如把字段统一为 lowerCamelCase。

所以文档中的窗口对象优先使用：

- `title`
- `pid`
- `x`
- `y`
- `width`
- `height`

## 004-axios.js

正式脚本中的全局 `axios` 由这个 polyfill 构造。

它**直接建立在 `http.request()` 上**，提供：

- `axios.defaults`
- `axios.request()`
- `axios.get/post/put/delete/patch`
- request interceptors
- response interceptors
- params 处理
- `validateStatus`

默认配置包括：

- `timeout: 30000`
- `responseType: 'json'`
- 默认 2xx 为成功

完整使用方式见 `http.md`。

## url-search-params.js

提供 `URLSearchParams` 兼容实现。

## Browser automation upgraded facade

若仓库中的 browser automation polyfill/facade 被当前构建加载，会提供 upgraded / playwright 风格对象。

这类能力属于 **Compatibility**，详细边界见 `runtime.md`。

不要因为 API 形状类似 Playwright 就把它解释为完整 Playwright 引擎。

## 维护规则

- 用户文档描述“最终可调用 API”，但必须注明 Native / Polyfill / Compatibility。
- 任何 polyfill 新增、删除或改名，都应同步更新 `runtime-api.ai.json`。
- 不把只存在于历史文档、当前运行时没有加载的接口重新写回正式文档。
