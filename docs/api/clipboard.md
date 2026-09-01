---
title: Clipboard API
description: OpenDesk JavaScript Runtime 的系统剪贴板对象与文本读写方法。
order: 8
---

# Clipboard API

`clipboard` 是 Runtime 注入的系统剪贴板对象，是一个独立的 API 对象；它不是可由脚本
通过 `new Clipboard()` 创建的构造器。它直接提供文本读写能力，不需要 `import`。

**状态：Stable / Native**

## clipboard：方法总表

| 方法 | 返回值 | 用途 |
| --- | --- | --- |
| `clipboard.copy(text)` | `void` | 写入剪贴板文本 |
| `clipboard.paste()` | `string` | 读取当前剪贴板文本 |
| `clipboard.clear()` | `void` | 将剪贴板写成一个空格 |

这些方法是同步调用；失败时会同步抛出错误。调用前不需要使用 `await`，但在异步函数
中使用 `await clipboard.paste()` 也只会等待它已经得到的字符串值。

## clipboard.copy(text)：写入文本

```js
clipboard.copy('hello');
```

Runtime 会对写入结果做读取校验，并在失败时重试或使用平台 fallback。空字符串会被
替换成单个空格，因此 `clipboard.copy('')` 不会留下严格的空内容。

## clipboard.paste()：读取文本

```js
const text = clipboard.paste();
console.log(text);
```

返回当前剪贴板的文本内容。平台读取失败且重试/fallback 都不能完成时会抛出错误。

## clipboard.clear()：清空剪贴板

```js
clipboard.clear();
```

当前实现通过 `clipboard.copy(' ')` 清理内容，实际结果是一个空格，而不是空字符串：

```js
clipboard.clear();
console.log(JSON.stringify(clipboard.paste())); // " "
```

## 全局快捷函数

只需要读写文本时，可使用全局 `copyToClipboard(text)` 和 `getClipboard()`。它们的
完整调用契约见 [Global APIs](global-apis.md)；这两个函数是快捷入口，不是第二套
剪贴板实现。
