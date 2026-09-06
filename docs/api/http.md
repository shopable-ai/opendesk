---
title: HTTP and Axios
description: 使用全局 axios 或底层 http 发起 HTTP 请求，并处理参数、响应、错误与取消。
order: 9
---

# http / axios：HTTP 请求

当前脚本层有两个 HTTP 入口：

1. `axios`：适合日常请求，提供 params、defaults 和 interceptors 等便捷能力。
2. `http`：更接近底层请求，适合需要最小封装或排查请求行为的场景。

因此新脚本通常优先使用 `axios`；需要最小封装或排查底层行为时使用 `http`。

## http：原生 HTTP 请求

**方法总表**

| 方法 | 用途 |
| --- | --- |
| `http.request(options)` | 任意 HTTP 请求 |
| `http.get(url, options?)` | GET |
| `http.post(url, data, options?)` | POST |
| `http.download(url, options)` | 授权的原生流式 GET 下载到最终文件 |

## http.request(options)

```js
const resp = await http.request({
  method: 'GET',
  url: 'https://httpbin.org/get',
  headers: {
    Accept: 'application/json'
  }
});

console.log(resp.status);
console.log(resp.data);
```

常用参数：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `method` | string | 默认 GET |
| `url` | string | 必填 |
| `headers` | object | 请求头 |
| `data` | string / object | 请求体 |
| `timeout` | number | 请求级 deadline（毫秒）；`0` 仅关闭该请求的本地 deadline，执行级 deadline 仍生效 |
| `signal` | AbortSignal | 可选取消信号；`AbortController.abort()` 会取消在途请求 |
| `responseType` | `json` / `text` / `arraybuffer` | `text` 始终返回字符串，`arraybuffer` 返回真实 `ArrayBuffer`；默认与旧版相同，优先 JSON 解析、否则为字符串 |

常见返回：

```js
{
  data,
  status,
  statusText,
  headers
}
```

请求体行为：

- `data` 是对象：按 JSON 序列化。
- `data` 是字符串且类似表单：可能使用 `application/x-www-form-urlencoded`。
- 其他字符串：按普通文本处理。
- 响应体能解析成 JSON 时，`data` 为对象；否则通常为字符串。

## http.get(url, options)

```js
const resp = await http.get('https://httpbin.org/get');
console.log(resp.data);
```

## http.post(url, data, options)

```js
const resp = await http.post('https://httpbin.org/post', {
  hello: 'world'
});
console.log(resp.data);
```

## http.download(url, options)：原生流式下载

`http.download()` 是唯一的下载入口。它在 native `HTTPClient` 中把响应分块写入同目录临时文件，
按实际写入字节做限额与 SHA-256，完成后才安全发布最终文件；它不是 `axios.get()` 加
`File.writeBytes()` 的组合，也不会调用 `curl`、`wget` 或命令行下载器。

```js
const result = await http.download('https://www.example.com/', {
  path: '.runtime/downloads/example.html',
  maxBytes: 1024 * 1024,
  sha256: 'expected-64-character-hex-digest', // 可选
});

console.log(result.path, result.bytesWritten, result.sha256, result.committed);
```

参数：

| 参数 | 默认值 | 契约 |
| --- | --- | --- |
| `path` | 必填 | 最终文件名；相对路径以不可变的 `Execution.workdir` 为基准。 |
| `headers` | `{}` | 初始 GET 的自定义请求头；禁止 `Range` 与 `If-Range`。发生获准的跨源重定向后全部丢弃且不恢复。 |
| `timeout` | `30000` | 毫秒；`0` 只取消本地请求 deadline，不取消 execution deadline 或 signal 取消。 |
| `signal` | 未设置 | `AbortSignal`；取消在提交前保留旧目标，提交后才观察到取消会如实报告 `committed: true`。 |
| `maxBytes` | `64 MiB` | 实际落盘的解压后字节数，必须是 1 到 `1 GiB` 的整数。 |
| `overwrite` | `false` | `false` 时在提交点仍拒绝覆盖竞争创建的目标；`true` 使用平台已验证的安全替换，不会先删或截断旧文件。 |
| `createDirs` | `false` | 是否创建缺失父目录。 |
| `sha256` | 未设置 | 64 位十六进制预期摘要；不匹配时不提交。 |
| `allowCrossOriginRedirects` | `false` | 默认只允许同源重定向；显式开启后每次跨源都会永久丢弃调用者 headers。 |

成功只在最终 HTTP 状态为 `200`、文件关闭、摘要校验和发布都完成时返回：

```js
{
  path: '/absolute/destination/file',
  bytesWritten: 1234,
  status: 200,
  sha256: '...',
  committed: true
}
```

只接受没有内嵌凭据的绝对 HTTP(S) URL，保持 TLS 验证；不接受 `206`、`304` 或其他状态作为
完整下载。最多跟随 5 次重定向，禁止 HTTPS 降级。`Content-Length` 只用于尽早拒绝过大的未压缩
响应；实际计数始终来自写入循环。支持 identity 和 gzip，gzip 的大小、摘要和 `bytesWritten`
都是解压后的内容；未知 `Content-Encoding` 会失败。下载并发上限为每个 execution 4 个。

下载仅在受信任的本地 `-script` / `ai run` execution 中由 host 显式启用。HTTP、MCP、Scheduler
和泛用 Runtime execution 调用它会在任何网络或文件副作用前以 `DOWNLOAD_DISABLED` 拒绝；
JavaScript 参数、`Execution.env` 或 shell 环境变量不能提升该权限。普通 `http.request()` / axios
请求的既有网络权限不受影响。

临时文件始终与目标同目录并独占创建。最终目标必须是普通文件而非 symlink、目录、设备或平台特殊
路径；Windows 也拒绝设备名与 ADS。macOS/Linux 使用同目录原子提交；Windows 使用同目录
`MoveFileEx` 的原子替换或原子 hard-link 发布，均不会退化为 copy/delete。无长度且没有可信摘要的 HTTP body
干净 EOF 无法识别语义截断；已知长度截断、读写错误、取消、限额和摘要失败均不会把部分文件提交。

错误是 `HTTPDownloadError` rejection，至少包含 `code`、`operation: 'http.download'`、`status` 和
真实 `committed`。常见 code 包括 `DOWNLOAD_DISABLED`、`INVALID_ARGUMENT`、`INVALID_URL`、
`HTTP_STATUS`、`REDIRECT_DENIED`、`MAX_BYTES_EXCEEDED`、`SHA256_MISMATCH`、`TARGET_EXISTS`、
`CANCELED`、`TIMEOUT` 与 `IO_FAILED`。错误不回显完整 URL、headers 或响应正文。

公开使用示例和确定性自测见 [examples/http](../../examples/http/README.md)。

## axios：便捷 HTTP 请求

**状态：Stable / Polyfill**

`axios` 不是要求用户直接理解的 Go 原生接口。当前正式用户语义以 `polyfills/004-axios.js` 为准。

它提供：

| 方法 / 属性 | 用途 |
| --- | --- |
| `axios.request(config)` | 任意请求 |
| `axios.get(url, config?)` | GET |
| `axios.post(url, data?, config?)` | POST |
| `axios.put(url, data?, config?)` | PUT |
| `axios.delete(url, config?)` | DELETE |
| `axios.patch(url, data?, config?)` | PATCH |
| `axios.defaults` | 默认配置 |
| `axios.interceptors.request.use(fn)` | 请求拦截器 |
| `axios.interceptors.response.use(fn)` | 响应拦截器 |

默认值重点：

- timeout: `30000`
- responseType: `json`
- validateStatus: `200 <= status < 300`

## axios.get：使用 params

```js
const resp = await axios.get('https://httpbin.org/get', {
  params: {
    q: 'opendesk',
    page: 1
  }
});

console.log(resp.data);
```

## axios.post：提交数据

```js
const resp = await axios.post('https://httpbin.org/post', {
  name: 'alice'
});

console.log(resp.status);
```

## axios.put / axios.patch / axios.delete：修改与删除

```js
await axios.put('https://httpbin.org/put', { enabled: true });
await axios.patch('https://httpbin.org/patch', { name: 'new' });
await axios.delete('https://httpbin.org/delete');
```

## axios.interceptors：请求与响应拦截器

```js
axios.interceptors.request.use((config) => {
  config.headers = config.headers || {};
  config.headers['X-Trace-Id'] = 'demo-trace';
  return config;
});

axios.interceptors.response.use((response) => {
  console.log('status =', response.status);
  return response;
});
```

## http / axios：错误行为

- 网络错误：向上抛出。
- timeout：抛出以 `HTTP request timed out` 开头的错误。
- cancel / `AbortSignal`：抛出以 `HTTP request canceled` 开头的错误。
- `validateStatus` 不通过：抛出 `Request failed with status code ...`。
- interceptor 抛错：继续向上抛出。

## http / axios：选型建议

- 日常脚本：`axios`
- 最小底层依赖：`http`
- params / interceptors / defaults：`axios`
- 排查 HTTP bridge：先看 `http.request()`

## axios：实现边界

Go 侧旧 Axios bridge 已移除。所有 stack 都使用 `polyfills/004-axios.js` 构造的 axios，
它通过 `http.request()` 返回 Promise；网络 I/O 完成后才由 Runtime event loop 回调
resolve/reject。脚本应继续以 `await axios...` 处理结果与错误。

## AbortController：取消慢请求

```js
const controller = new AbortController();
setTimeout(() => controller.abort('operator cancelled'), 500);
try {
  await axios.get('https://example.com/slow', { signal: controller.signal });
} catch (error) {
  console.log(String(error.message || error));
}
```

`AbortController` 是运行时提供的最小标准兼容实现；它支持本页 HTTP/axios
取消所需的 `signal`、`abort()`、`addEventListener()` 和 `removeEventListener()`。`abort()` 保留首次
reason 且重复调用幂等；一个同步 `onabort` 或 listener 抛错不会阻止其他 listener 或 native 取消。
listener 返回的 Promise 不会被自动 await；失败经 Runtime 的明确 console error 通道报告而不回显
listener 的任意错误内容。
全局接口的完整说明见 [Global APIs](global-apis.md)。
