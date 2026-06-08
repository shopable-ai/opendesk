---
title: Clipboard and Console
description: clipboard、全局剪贴板 polyfill 与 console 输出能力。
order: 8
---

# clipboard / console

## clipboard

clipboard 是系统剪贴板对象。

**方法总表**

| 方法 | 用途 |
| --- | --- |
| clipboard.copy(text) | 写入剪贴板 |
| clipboard.paste() | 读取剪贴板 |
| clipboard.clear() | 清空剪贴板（内部写入空格） |

## clipboard.copy(text)

签名

```js
await clipboard.copy(text)
```

**说明**
- 带重试机制
- 会在失败时尝试平台 fallback
- 空字符串会被替换成单个空格

**示例**

```js
await clipboard.copy('hello');
```

## clipboard.paste()

签名

```js
const text = await clipboard.paste()
```

**示例**

```js
const text = await clipboard.paste();
console.log(text);
```

## clipboard.clear()

```js
await clipboard.clear();
```

**注意**
- 当前实现不是严格“空内容”，而是写入一个空格

## 全局剪贴板 polyfill

polyfills/000-global.js 额外提供了两个全局函数：

| 全局函数 | 说明 |
| --- | --- |
| copyToClipboard(text) | 调用 clipboard.copy(text) |
| getClipboard() | 调用 clipboard.paste() |

**示例**

```js
copyToClipboard('from polyfill');
console.log(getClipboard());
```

## console

console 在运行时会被 polyfill 替换为统一接口，底层由 Go Console 对象处理。

**方法总表**

| 方法 | 用途 |
| --- | --- |
| console.log(...args) | 普通日志 |
| console.info(...args) | 信息日志 |
| console.warn(...args) | 警告日志 |
| console.error(...args) | 错误日志 |
| console.debug(...args) | 调试日志 |
| console.table(data) | 打印 JSON 风格表格 |
| console.group(label) | 分组开始 |
| console.groupEnd(label) | 分组结束 |
| console.time(label) | 计时开始标记 |
| console.timeEnd(label) | 计时结束标记 |
| console.clear() | 清屏 |

**示例**

```js
console.log('hello', { ok: true });
console.info('starting');
console.warn('be careful');
console.error('something failed');
console.debug('debug info');
```

## console.table(data)

```js
console.table([
  { name: 'A', score: 90 },
  { name: 'B', score: 95 }
]);
```

## console.group / groupEnd

```js
console.group('OCR Run');
console.log('step 1');
console.log('step 2');
console.groupEnd('OCR Run');
```

## console.time / timeEnd

```js
console.time('capture');
await page.waitForTimeout(500);
console.timeEnd('capture');
```

## 说明

- console polyfill 会把 `null`、`undefined` 做显式转换
- 复杂对象会在 Go 层被 JSON 美化输出
- 在 HTTP / agent 模式下，console 事件也可能被结构化写入执行事件流
