---
title: TestMonkey JS 运行时内置库
description: 说明 jslibs 目录内置第三方库及其在脚本运行时中的使用方式。
order: 70
---

# TestMonkey JS 运行时内置库

更新时间：2026-05-18

当前 `jslibs/` 目录文件：

- `beautify1.14.9.js`
- `cheerio.js`
- `lodash.min.js`
- `moment.min.js`
- `query-string.min.js`

这些文件会在运行时初始化阶段自动加载，因此脚本通常可以直接使用其全局导出。

## lodash

文件：`jslibs/lodash.min.js`

版本：
- `4.17.21`

典型全局：
- `_`

适合：
- 数组/对象处理
- deep clone
- groupBy / map / filter / debounce 等工具函数

## moment

文件：`jslibs/moment.min.js`

版本：
- `2.18.1`

典型全局：
- `moment`

适合：
- 时间解析
- 格式化
- 日期计算

## query-string

文件：`jslibs/query-string.min.js`

典型全局：
- `queryString`

可确认能力：
- `queryString.parse(...)`
- `queryString.stringify(...)`
- `queryString.parseUrl(...)`
- `queryString.stringifyUrl(...)`
- `queryString.pick(...)`
- `queryString.exclude(...)`
- `queryString.extract(...)`

适合：
- URL query 解析与生成

## cheerio

文件：`jslibs/cheerio.js`

典型全局：
- `cheerio`

常见入口：
- `cheerio.load(html)`

适合：
- HTML 解析
- 选择器查询
- 文本提取
- 属性读取

## beautify

文件：`jslibs/beautify1.14.9.js`

源码中可见关键导出：
- `js_beautify(source, options)`

适合：
- JS 源码格式化

注意：
- 该文件是 CommonJS 风格打包产物
- 在 goja 里全局导出名是否稳定，建议脚本运行前先确认

可用如下方式验证：

```js
console.log(typeof js_beautify)
```

## 使用建议

如果你要在自动化脚本中解析 HTML、处理 query、整理时间或格式化结果，可以直接优先尝试：

- `_`
- `moment`
- `queryString`
- `cheerio`
