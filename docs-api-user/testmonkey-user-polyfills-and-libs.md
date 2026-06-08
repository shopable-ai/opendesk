---
title: TestMonkey Polyfills 与内置库
description: 说明运行时的 polyfills 和 jslibs，对用户理解最终 API 形态有帮助。
order: 60
---

# TestMonkey Polyfills 与内置库

更新时间：2026-05-18

## polyfills

当前目录：
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

它们会在运行时初始化阶段自动执行。

### 对用户最重要的影响

1. `page` 被增强
- `page.waitFor()`
- `page.waitForTimeout()`
- `page.waitForFunction()`
- `page.waitForNavigation()`
- 权限 facade

2. 暴露全局便捷函数
- `copyToClipboard(text)`
- `getClipboard()`
- `notify(...)`
- `sleep(ms)`
- `sleepSeconds(seconds)`

3. `axios` 会被增强版覆盖
- 最终脚本应按增强版 `axios` 理解

4. 提供 `URLSearchParams`

## jslibs

当前目录：
- `beautify1.14.9.js`
- `cheerio.js`
- `lodash.min.js`
- `moment.min.js`
- `query-string.min.js`

### 常用全局

- `_`
- `moment`
- `queryString`
- `cheerio`
- `js_beautify`（建议先运行时确认）

### 常见用途

- lodash: 数组/对象处理
- moment: 时间解析与格式化
- query-string: URL query 解析与生成
- cheerio: HTML 解析
- beautify: JS 代码格式化
