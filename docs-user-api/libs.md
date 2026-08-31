---
title: JS Libraries
description: 运行时自动加载的 jslibs 目录第三方 JS 库。
order: 13
---

# jslibs

jslibs 目录中的 .js 文件会在 polyfills 之后自动加载到运行时。

这意味着：
- 这些库不是“参考代码”
- 而是脚本运行时真实可用的内置库

加载方式
- 运行时直接执行库文件内容
- 实际可用的全局导出取决于库本身的 UMD / 全局挂载行为

当前目录包含：
- query-string.min.js
- lodash.min.js
- moment.min.js
- cheerio.js
- beautify1.14.9.js

## 库总表

| 文件 | 常见全局名 | 用途 |
| --- | --- | --- |
| query-string.min.js | queryString | URL query 解析与拼接 |
| lodash.min.js | _ | 工具函数集合 |
| moment.min.js | moment | 日期时间处理 |
| cheerio.js | cheerio | 类 jQuery 的 HTML 解析 |
| beautify1.14.9.js | `window.js_beautify` | 格式化 JS 文本 |

## queryString

来源
- query-string.min.js

常见用途
- 解析查询字符串
- 拼接 query 参数

示例

```js
const parsed = queryString.parse('a=1&b=hello');
console.log(parsed);

const text = queryString.stringify({ q: 'test', page: 2 });
console.log(text);
```

## lodash (_)

来源
- lodash.min.js

常见用途
- map / groupBy / uniq / debounce / sortBy 等工具操作

示例

```js
const items = [
  { name: 'a', type: 'x' },
  { name: 'b', type: 'x' },
  { name: 'c', type: 'y' }
];

console.log(_.groupBy(items, 'type'));
console.log(_.sortBy(items, 'name'));
```

## moment

来源
- moment.min.js

常见用途
- 时间格式化
- 时间加减与比较

示例

```js
console.log(moment().format('YYYY-MM-DD HH:mm:ss'));
console.log(moment().add(1, 'day').format('YYYY-MM-DD'));
```

## cheerio

来源
- cheerio.js

常见用途
- 解析 HTML
- 像 jQuery 一样取文本、属性、节点

示例

```js
const $ = cheerio.load('<div><a href="/x">hello</a></div>');
console.log($('a').text());
console.log($('a').attr('href'));
```

适合场景
- 配合 axios/http 抓网页后解析 HTML

## beautify / js_beautify

来源
- beautify1.14.9.js

常见用途
- 格式化 JS 文本

示例

```js
const ugly = 'function x(){console.log(1)}';
console.log(window.js_beautify(ugly));
```

## 使用建议

**示例 1：抓网页并解析 HTML**

```js
const resp = await axios.get('https://example.com');
const $ = cheerio.load(resp.data);
console.log($('title').text());
```

**示例 2：处理时间参数**

```js
const start = moment().startOf('day').format('YYYY-MM-DD HH:mm:ss');
console.log(start);
```

**示例 3：组装查询参数**

```js
const url = 'https://example.com/search?' + queryString.stringify({
  q: 'clawdesk',
  page: 1
});
console.log(url);
```

## 注意事项

- 这些库的准确全局名取决于库文件自身导出方式
- 当前文档列的是按源码可合理确认的最常见全局入口
- 若你需要验证某库是否成功注入，可以直接在脚本里打印：

```js
console.log(typeof queryString);
console.log(typeof _);
console.log(typeof moment);
console.log(typeof cheerio);
console.log(typeof window.js_beautify);
```
