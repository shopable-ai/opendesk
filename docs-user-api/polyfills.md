---
title: Polyfills
description: 运行时 polyfills 提供的增强层、兼容层与全局能力。
order: 12
---

# polyfills

polyfills 目录中的脚本会在原生对象注入后、用户脚本执行前加载。

作用
- 包装原生 API
- 补全 Promise / timer / console / clipboard 等基础能力
- 提供 page 兼容 API
- 提供升级 facade 与 Playwright 风格兼容层

加载顺序以文件名排序为主，当前重点文件如下。

## 000-console.js

作用
- 替换全局 console
- 把 JS 侧 `console.*` 调到 Go Console 对象上

用户可见效果
- `console.log/info/warn/error/debug/table/group/...` 可用

## 000-global.js

作用
- 提供全局剪贴板辅助函数

新增全局函数
- `copyToClipboard(text)`
- `getClipboard()`

## 000-page.js

这是最重要的 page polyfill。

作用
- 从 `page____Inject` 复制原生 page 能力
- 把 `mouse / keyboard / touchscreen` 挂到 page 上
- 新增权限 facade
- 新增等待方法
- 最终把 `globalThis.page` 指向增强后的 wrapper

重要新增方法

| 方法 | 类型 | 说明 |
| --- | --- | --- |
| page.checkPermissions() | polyfill | 跨平台权限快照 |
| page.requestPermissions() | polyfill | 跨平台权限请求 |
| page.ensurePermissions() | polyfill | 严格权限守卫 |
| page.ensureMacPermissions() | polyfill alias | 旧入口兼容别名 |
| page.waitFor() | polyfill | 兼容式等待 |
| page.waitForTimeout() | polyfill | Promise 延时 |
| page.waitForNavigation() | polyfill | 基于 page.url() 的导航等待 |
| page.waitForFunction() | polyfill | 轮询函数直到 truthy |
| page.waitForAll() | polyfill | Promise.all + timeout |

注意
- 这些都属于“用户可用 API”
- 但它们不是 Go 原生 page 方法

## 000-systemBase.js

作用
- 提供系统相关的基础 JS 层能力
- 具体是否作为正式 API 暴露，仍以最终全局对象为准

## 001-promise.js

作用
- 提供 Promise polyfill
- 让运行时支持 Promise 风格 API

## 001-timers.js / 002-sleep.js

作用
- 补全 timer 与 sleep 相关能力
- 与原生 timer 注入一起构成可用的异步等待环境

## 003-window.js

作用
- 包装 `window.getActiveWindow()` 与 `window.getWindowByTitle()`
- 把返回对象字段名统一为 lowerCamelCase

用户影响
- 读取窗口对象时优先用 `title`、`pid`、`x`、`y`、`width`、`height`

## 004-axios.js

作用
- 覆盖全局 axios
- 在原生 http.request 之上提供更完整的 axios 风格接口

新增/增强内容
- `axios.defaults`
- `axios.interceptors.request.use()`
- `axios.interceptors.response.use()`
- `axios.request()`
- 统一 params 处理与 validateStatus

结论
- 用户最终应把全局 axios 视为增强版 axios

## 010-browser-automation-upgraded.js

作用
- 提供新的浏览器自动化兼容层
- 暴露：
  - `pageUpgraded`
  - `contextUpgraded`
  - `browserUpgraded`
  - `Automation.getLegacy()`
  - `Automation.getUpgraded()`
  - `Automation.getPlaywrightFacade()`

核心价值
- 在不破坏 legacy 的前提下，引入 upgraded / playwright 风格 facade

升级 facade 的典型能力
- `pageUpgraded.open()`
- `pageUpgraded.locator()`
- `pageUpgraded.query()`
- `pageUpgraded.cookies()`
- `pageUpgraded.storage()`
- `pageUpgraded.session()`
- `contextUpgraded.newPage()`
- `browserUpgraded.newContext()`
- `playwright.chromium.launch()` 风格兼容入口

注意
- 这些是兼容层，不是底层真正浏览器引擎
- 更适合做 API 迁移与脚本适配

## stack 模式与 polyfill 的关系

运行时支持：
- legacy
- upgraded
- playwright

含义
- legacy：保留原 page
- upgraded：把全局 page 指向 `pageUpgraded`
- playwright：把 page / browser / context 指向 upgraded facade

## 文档使用建议

正式用户 API 文档中：
- 原生能力与 polyfill 能力应明确区分
- 但对于脚本作者，只要最终可用，就应该写进文档
- 本套 docs 中已把这些能力标注为“原生”或“polyfill”
