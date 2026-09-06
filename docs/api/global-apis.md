---
title: Global APIs
description: OpenDesk JavaScript Runtime 中无需 import 即可直接使用的全局接口。
order: 12
---

# 全局接口（Global APIs）

本页说明 OpenDesk JavaScript Runtime 直接提供的全局函数、全局对象、构造器和异步基础能力。
脚本无需 `import`，即可直接调用：

```js
async function main() {
  await delay(100);
  const params = new URLSearchParams({ task: 'daily-report' });
  console.log(params.toString());
}

main();
```

## 全局接口一览

| 接口 | 主要用途 | 状态 | 备注 |
| --- | --- | --- | --- |
| `setTimeout` / `clearTimeout` | 延迟执行与取消一次性任务 | Stable | 返回数字 ID |
| `setInterval` / `clearInterval` | 周期执行与取消 | Stable | 回调必须主动清理 |
| `requestAnimationFrame` / `cancelAnimationFrame` | 约 60 FPS 的延迟回调 | Stable / Compatibility | 基于 timer，不是浏览器绘制循环 |
| `delay` | Promise 风格等待 | Stable | `await delay(3000)`；不阻塞 Runtime 事件循环 |
| `sleep` / `sleepSeconds` | Promise 风格等待 | Stable | 不阻塞 Runtime 事件循环 |
| `console` | 日志与执行事件输出 | Stable | 全局日志对象；方法同步返回 |
| `copyToClipboard` / `getClipboard` | 剪贴板快捷读写 | Stable | `clipboard` 对象的全局快捷入口 |
| `notify` | 系统通知 | Secondary | 成功提交不代表用户已看到 |
| `alert` / `confirm` / `prompt` | 异步原生模态提示与短文本输入 | Conditional | 返回 Promise，不是浏览器同步 dialog |
| `AbortController` / `AbortSignal` | 取消在途异步操作 | Stable / Compatibility | 与 `http`、`axios`、`SQLite` 的 `signal` 配合 |
| `SQLite` | 本地异步 SQLite 数据库句柄 | Stable / Local only | `SQLite.open()` 返回 `query` / `exec` / `batch` / `close` 句柄；HTTP、MCP、Scheduler 不注入 |
| `Accessibility` | 外部桌面的原生语义元素 | Experimental / Local only | capability 摘要可读；观察/动作只在宿主授权的可信本地 execution 启用 |
| `URLSearchParams` | 生成查询参数或表单参数 | Stable / Compatibility | 当前为轻量兼容实现 |
| `URL` | 解析和拼接 HTTP(S) / file URL | Stable / Compatibility | 支持相对 URL、`searchParams` 和常用字段 |
| `Promise` | 异步结果与组合 | Stable | `async` / `await` 属于语言语法；见 [JavaScript Runtime](runtime.md#javascript-语言基线) |

## `setTimeout` / `setInterval` / `requestAnimationFrame` / `delay` / `sleep`：计时器与等待

### `setTimeout` / `clearTimeout`：一次性计时器

```js
const timeoutID = setTimeout(() => {
  console.log('稍后执行');
}, 500);

clearTimeout(timeoutID); // 不再需要时取消
```

| 接口 | 签名 | 返回值 |
| --- | --- | --- |
| `setTimeout` | `setTimeout(callback, delay?)` | `number` |
| `clearTimeout` | `clearTimeout(id)` | `void` |

`delay` 使用毫秒；省略时由 Runtime 使用默认延迟。取消后回调不会执行。

### `setInterval` / `clearInterval`：周期计时器

```js
let count = 0;
const intervalID = setInterval(() => {
  count += 1;
  console.log('第', count, '次');

  if (count >= 3) clearInterval(intervalID);
}, 1000);
```

| 接口 | 签名 | 返回值 |
| --- | --- | --- |
| `setInterval` | `setInterval(callback, delay?)` | `number` |
| `clearInterval` | `clearInterval(id)` | `void` |

周期任务必须在完成条件满足后调用 `clearInterval()`。不要用无限周期任务维持脚本生命周期；
需要等待窗口关闭或 UI 事件时，请使用对应的页面或 Custom UI 生命周期接口。

### `requestAnimationFrame` / `cancelAnimationFrame`：帧回调

```js
const frameID = requestAnimationFrame((timestamp) => {
  console.log('回调时间：', timestamp);
});

// 如不再需要：cancelAnimationFrame(frameID);
```

`requestAnimationFrame()` 当前由约 60 FPS 的 timer 兼容实现提供，回调会收到毫秒时间戳。
它不会等待浏览器 DOM 绘制，也不代表屏幕像素已经刷新；桌面自动化中的 UI 状态应优先使用
`page.waitForFunction()` 或其他可验证条件等待。

### `delay` / `sleep` / `sleepSeconds`：固定等待

```js
await delay(3000);         // 推荐的通用等待写法
await sleep(250);        // 250 毫秒
await sleepSeconds(0.5); // 0.5 秒
```

三者都返回 `Promise<void>`，等待期间不会阻塞 Runtime 事件循环。`delay()` 是推荐的通用名称，
`sleep()` 和 `sleepSeconds()` 保留用于兼容已有脚本。它们适合固定的短暂间隔；
等待窗口、文本、权限或网络状态时，应优先使用带条件的接口：

```js
await page.waitForFunction(() => window.title() === '完成', {
  timeout: 5000,
  polling: 100,
});
```

更多页面状态等待方式见 [Page API](page.md)。

`delay()` 和 `System.delay()` 都是脚本等待；`System.sleep()` 则会尝试让整台电脑进入睡眠，
三者不要混用。

## `copyToClipboard` / `getClipboard`：剪贴板快捷函数

当脚本只需要读写文本时，可以直接使用全局函数：

```js
copyToClipboard('OpenDesk');
const text = getClipboard();
console.log(text);
```

| 接口 | 签名 | 返回值 | 说明 |
| --- | --- | --- | --- |
| `copyToClipboard` | `copyToClipboard(text: string)` | `void` | `text` 必须是字符串 |
| `getClipboard` | `getClipboard()` | `string` | 读取当前剪贴板文本 |

需要清空剪贴板、处理平台重试或使用完整对象接口时，请阅读
[Clipboard API](clipboard.md)。

## `console`：日志与执行事件输出

`console` 是 Runtime 提供的全局日志对象。它不需要导入或实例化；所有方法都是同步
调用并返回 `undefined`。

**方法总表**

| 方法 | 用途 |
| --- | --- |
| `console.log(...args)` | 普通日志 |
| `console.info(...args)` | 信息日志 |
| `console.warn(...args)` | 警告日志 |
| `console.error(...args)` | 错误日志 |
| `console.debug(...args)` | 调试日志 |
| `console.table(data)` | 打印 JSON 风格表格 |
| `console.group(label)` | 分组开始标记 |
| `console.groupEnd(label)` | 分组结束标记 |
| `console.time(label)` | 计时开始标记 |
| `console.timeEnd(label)` | 计时结束标记 |
| `console.clear()` | 清理终端显示 |

```js
console.log('hello', { ok: true });
console.info('starting');
console.warn('be careful');
console.error('something failed');
console.debug('debug info');
```

结构化执行入口可以把日志作为执行事件流输出；直接终端运行时，日志会写入终端。
`null` 和 `undefined` 会被显式标记，复杂对象会被转换为 JSON 风格文本。交互终端会按
framework、script、meta、summary、warn 和 error 语义给文字前缀着色；正文及文字标签保持不变。
颜色由 `-color auto|always|never` 控制，完整规则见[环境配置](environment.md#终端颜色)。运行 artifact
和 JSON 输出不会写入 OpenDesk 生成的颜色控制码。

用户方法会保留可搜索的终端身份：`console.log` 为 `[SCRIPT] [LOG]`、`console.info` 为
`[SCRIPT] [INFO]`、`console.debug` 为 `[SCRIPT] [DEBUG]`、`console.warn` 为
`[SCRIPT] [WARN]`，`console.error` 为 `[SCRIPT] [ERROR]`。Runtime 初始化期间临时 console 的
普通输出会被重新归属为 `[FRAMEWORK] [DEBUG]`，不会混入业务 `scriptLogs`；结构化事件同时保留
`category`、`level`、`source` 和 `fields.consoleMethod`。

`console.clear()` 只会对真实交互终端发送清屏控制序列；输出被管道或重定向时它是 no-op，避免污染
纯文本和机器协议。

### `console.table(data)`

```js
console.table([
  { name: 'A', score: 90 },
  { name: 'B', score: 95 },
]);
```

### `console.group(label)` / `console.groupEnd(label)`

```js
console.group('OCR Run');
console.log('step 1');
console.log('step 2');
console.groupEnd('OCR Run');
```

### `console.time(label)` / `console.timeEnd(label)`

```js
console.time('capture');
await page.waitForTimeout(500);
console.timeEnd('capture');
```

## `notify`：系统通知

`notify()` 是全局系统通知函数：

```js
notify('任务完成');

notify({
  title: 'OpenDesk',
  message: '自动化已经完成',
  sound: false,
});
```

它的完整参数、同步返回、平台后端、权限和可见性边界见
[notify](notify.md)。通知显示不是业务成功或执行证据的替代品。

## `alert` / `confirm` / `prompt`：异步原生 Dialog

OpenDesk 的同名全局函数是 [Dialog API](dialog.md) 的 Promise alias，和浏览器的同步 API
不同：它们不会阻塞 Runtime EventLoop，也没有 options callback。使用 `await` 或
`.then()` / `.catch()` / `.finally()` 管理结果。

```js
async function main() {
  await alert('任务已完成');
  const shouldPublish = await confirm({ message: '发布结果？', defaultAction: 'cancel' });
  if (!shouldPublish) return;
  const label = await prompt({ message: '输入发布标签', placeholder: 'v1.0.0' });
  if (label !== null) console.log('准备发布');
}

try {
  await main();
} catch (error) {
  console.error(error.code, error.message);
}
```

`alert` resolve `undefined`；`confirm` resolve `boolean`；`prompt` resolve `string | null`。
用户取消不是 reject；execution 取消、deadline 和 native host failure 才 reject。完整 capability、
参数、隐私、exactly-once settlement 与 teardown 契约见 [Dialog API](dialog.md)。

## `AbortController` / `AbortSignal`：取消 HTTP 请求

`AbortController` 与 `AbortSignal` 是运行时提供的轻量兼容接口，主要用于取消在途的
`http.request()` 或 `axios` 请求：

```js
const controller = new AbortController();

setTimeout(() => controller.abort('operator cancelled'), 500);

try {
  await axios.get('https://example.com/slow', {
    signal: controller.signal,
  });
} catch (error) {
  console.log(String(error.message || error));
}
```

| 接口 | 签名 | 说明 |
| --- | --- | --- |
| `new AbortController()` | `AbortController` | 创建一次取消控制器 |
| `controller.signal` | `AbortSignal` | 传给 `http` / `axios` 的请求配置 |
| `controller.abort(reason?)` | `void` | 发出一次 `abort` 事件 |
| `signal.aborted` | `boolean` | 是否已经取消 |
| `signal.reason` | `unknown` | 调用 `abort()` 时传入的原因 |
| `signal.addEventListener('abort', fn)` | `void` | 注册取消监听 |
| `signal.removeEventListener('abort', fn)` | `void` | 移除取消监听 |

取消只影响显式接收该 `signal` 的 HTTP 请求、`http.download()` 或 SQLite 操作，不会自动终止任意
JavaScript 函数。首次 `abort(reason)` 保留 reason，后续调用幂等。某个同步 `onabort` 或 listener
抛错不会阻断剩余 listener 和 native 取消；listener 返回的 Promise 不会自动 await，失败通过 Runtime
的 console error 通道报告而不复制任意 listener 错误正文。
HTTP 错误和 deadline 语义见 [HTTP and Axios](http.md)；SQLite 的超时、写入状态和清理语义见
[SQLite API](sqlite.md)。

## `URLSearchParams`：查询参数

使用 `URLSearchParams` 生成查询字符串：

```js
const params = new URLSearchParams({
  q: 'OpenDesk',
  page: 1,
});

params.append('tag', 'runtime');
console.log(params.toString());
// q=OpenDesk&page=1&tag=runtime
```

支持的接口：

| 接口 | 返回值 | 说明 |
| --- | --- | --- |
| `append(name, value)` | `void` | 追加同名参数 |
| `delete(name)` | `void` | 删除参数 |
| `get(name)` | `string \| null` | 读取第一个值 |
| `getAll(name)` | `string[]` | 读取全部值 |
| `has(name)` | `boolean` | 判断参数是否存在 |
| `set(name, value)` | `void` | 覆盖为单个值 |
| `toString()` | `string` | 序列化为查询字符串 |
| `entries()` | `Array<[string, string]>` | 返回键值数组 |
| `keys()` | `string[]` | 返回键名数组 |
| `values()` | `string[]` | 返回值数组 |

当前实现覆盖 OpenDesk 脚本常用的查询参数场景；它不是完整浏览器 URL 或 DOM API，
`entries()`、`keys()`、`values()` 返回数组而不是浏览器中的迭代器。

## `URL`：解析和拼接 URL

```js
const url = new URL('/search?q=OpenDesk', 'https://example.com/base/index.html');
console.log(url.origin);                 // https://example.com
console.log(url.pathname);               // /search
console.log(url.searchParams.get('q'));  // OpenDesk

url.searchParams.set('page', 2);
url.hash = 'results';
console.log(url.href);
```

常用字段包括 `href`、`origin`、`protocol`、`host`、`hostname`、`port`、`pathname`、
`search`、`hash` 和 `searchParams`。当前实现覆盖 HTTP(S)、file URL 和常见相对 URL 解析，
不承诺完整浏览器 WHATWG URL/DOM 行为。

## `Promise` 与 `async` / `await`：异步脚本

Runtime 会确保脚本可以使用 `Promise` 以及 `async` / `await`：

```js
async function runTask() {
  const result = await Promise.resolve({ ok: true });
  console.log(result.ok);
}

runTask();
```

异步回调、timer、sleep 和 HTTP 请求都由 Runtime 事件循环驱动。脚本应使用 `await`、
`Promise.all()` 或显式错误处理来管理结果，不要通过阻塞式循环等待。
语法版本、脚本级顶层 `await` 与模块边界见
[JavaScript 语言基线](runtime.md#javascript-语言基线)。

## 相关接口文档

“全局接口”是用户导航用语，不意味着所有全局对象都集中在本页。按用途继续阅读：

- `clipboard` 对象：见 [Clipboard API](clipboard.md)。
- `axios` 和 `AbortController` 的 HTTP 用法：见 [HTTP and Axios](http.md)。
- `page` 的等待、截图和权限：见 [Page API](page.md)。
- `notify()` 的详细通知契约：见 [notify](notify.md)。
- `alert()`、`confirm()`、`prompt()`：见 [Dialog API](dialog.md)。
- 本地命令行执行对象 `Command`：见 [Command API](command.md)。
- 第一方、本地 execution-owned 的 `SQLite`：见 [SQLite API](sqlite.md)。
- 第一方、execution-owned 的 `Accessibility`：见 [Accessibility API](accessibility.md)；大写 `UI` 的原生菜单组合见 [Desktop UI Menu API](desktop-ui-menu.md)。
- `Sound`：见 [Sound API](sound.md)；`FloatingWindow` 与 `ui`：见 [Custom UI](custom-ui.md)。

## 全局接口的实现来源与维护边界

本页描述的是最终用户可调用的接口，不要求用户了解内部文件名。维护者仍需区分：

- **Native**：由 Runtime 直接注入的能力。
- **Polyfill**：补齐或包装 JavaScript 行为的内置脚本。
- **Compatibility**：为迁移保留的兼容形状，不代表完整第三方运行时。

新增、删除或改名全局接口时，应同步检查本页、`runtime-api.ai.json`、对应的 `types/*.d.ts`
和 `tests/runtime-api/` 中的 JavaScript 契约。Runtime 的加载顺序与资源目录说明见
[JavaScript Runtime](runtime.md)；不要把 `polyfills/*.js` 中的内部 bridge 或历史兼容 facade 当作用户 API。

## 全局接口与 Polyfill 的关系

- **全局接口（Global APIs）**：用户视角的称呼，强调“脚本可以直接使用什么”。
- **Polyfill**：运行时内部的实现方式，用于补齐、包装或统一 JavaScript 能力。

用户通常不需要关心接口由哪个 `polyfills/*.js` 文件加载；排查 Runtime 资源或维护源码时，
才需要查看实现来源。一个接口可以同时具有 Native 与 Polyfill 两种来源，但用户只应依赖
这里及各专题页列出的最终调用方式。

本页收录直接挂在 JavaScript 全局作用域上的辅助能力，包括 `console`。`page`、`window`、
`clipboard`、`axios` 等虽然也可以直接访问，但有独立的专题文档：

- [Page API](page.md)：页面入口、截图、打开 URL / App、等待和权限。
- [Window API](window.md)：窗口读取与控制。
- [Clipboard API](clipboard.md)：完整的 `clipboard` 对象方法。
- [HTTP and Axios](http.md)：`http` 与全局 `axios`。
- [Command API](command.md)：本地 CLI 默认提供、execution-owned 的命令行执行；HTTP、MCP 与 Scheduler 关闭。
- [SQLite API](sqlite.md)：本地可信 execution 的第一方异步数据库句柄；HTTP、MCP 与 Scheduler 不注入。
- [Accessibility API](accessibility.md)：本地可信 execution 的第一方 AX/UIA 元素；禁用入口只能读取 capability 摘要。
- [Desktop UI Menu API](desktop-ui-menu.md)：现有大写 `UI` 上、与 Accessibility 共享 owner 的原生菜单组合。
- [System API](system.md)：包含 `System.getEnv()` / `System.hasEnv()` 等按键环境读取和系统信息能力。
- [Execution Context](execution.md)：本次运行的 ID、输入、只读环境快照、工作目录和 artifact 路径。
- [JavaScript Runtime](runtime.md)：异步完成、取消、输出和历史兼容边界。
