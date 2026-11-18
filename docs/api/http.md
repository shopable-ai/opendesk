---
title: HTTP and Axios
description: 使用全局 axios 或底层 http 发起 HTTP 请求，并处理参数、响应、错误与取消。
order: 500
docType: reference
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

按单次配置发起缓冲 HTTP 请求；出站请求不授予下载落盘或入站监听权限。

**签名**

```ts
http.request<T = unknown>(options: OpenDeskHttpRequestOptions): Promise<OpenDeskHttpResponse<T>>
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options` | `OpenDeskHttpRequestOptions` | 是 | 无 | 单次配置对象。 |
| `options.url` | `string` | 是 | 无 | 绝对 HTTP(S) URL；目标和数据须已获授权。 |
| `options.method` | `string` | 否 | `GET` | HTTP verb；本入口没有 `params` URL 拼装。 |
| `options.headers` | `Record<string, string>` | 否 | `{}` | 平面请求头，可覆盖自动 Content-Type / User-Agent。 |
| `options.data` | `unknown` | 否 | 无正文 | null/undefined 不发送正文；字符串直接发送，其他值按 JSON 编码。 |
| `options.timeout` | `number` | 否 | `30000` | 毫秒。非正值仅关闭请求 deadline；正值最少按 1 毫秒、最多按 24 小时，范围内的小数向下取整。execution deadline 仍生效。 |
| `options.signal` | `AbortSignal` | 否 | 无 | 取消在途请求；已 aborted 时不会发送请求。 |
| `options.responseType` | `'json' \| 'text' \| 'arraybuffer'` | 否 | JSON 或文本 | `json` 同样允许解析失败后回退文本；不是 schema 校验。 |

**返回值**

Promise resolve `{ data, status, statusText, headers }`。`status` 是 HTTP 数值，`statusText` 是完整
状态行（如 `200 OK`）；header 名按 HTTP canonical 形式，值为字符串数组。`text` 返回字符串，
`arraybuffer` 返回真实 `ArrayBuffer`；默认/`json` 先 JSON 解析，失败后返回字符串，空正文返回空字符串。
泛型 `T` 不校验响应。HTTP `4xx/5xx` 也 resolve，调用方必须验证状态及业务结果。

**行为与错误**

- 对象正文按 JSON 编码；字符串包含 `=` 且不含 `{` 时自动使用表单 Content-Type，其他字符串使用 text/plain。显式 header 优先。
- 缓冲响应上限为 10 MiB；超限整次 reject，不返回截断成功。大文件应比较 `http.download()`，不能将缓冲请求当作流式下载。
- 缺失 URL、非法 responseType/请求配置、正文编码失败会抛错或 reject；网络、读取、deadline/取消分别以明确的 HTTP 错误失败。不要只捕获 Promise rejection 而忽略同步参数错误。
- 超时错误以 `HTTP request timed out` 开头，取消以 `HTTP request canceled` 开头；错误不承诺 AxiosError 字段。资源和取消受 [Runtime 取消语义](runtime.md#异步完成与取消)约束。
- native worker I/O 不阻塞 JS EventLoop；应 await 真正完成。取消不撤销远端已经发生的写入，结果未知时不能自动重放。
- 普通脚本可调用；不需要 UI host、AX、模型 provider 或 webhook/download 授权。系统网络配置、目标访问与远端副作用仍由调用方负责。

**示例**

仅在受控 loopback fixture 已运行且端口实际为 43123 时执行；根据真实 fixture 替换 URL：

```js
const response = await http.request({ url: 'http://127.0.0.1:43123/status', timeout: 1000 });
if (response.status !== 200) throw new Error('unexpected HTTP status ' + response.status);
console.log(response.data); // 仍须按业务字段核对
```

## http.get(url, options)

发起 GET；共享返回、错误、权限、缓冲限制及取消语义见 [http.request](#httprequestoptions)。

**签名**

```ts
http.get<T = unknown>(url: string, options?: Omit<OpenDeskHttpRequestOptions, 'url' | 'method'>): Promise<OpenDeskHttpResponse<T>>
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `url` | `string` | 是 | 无 | 绝对目标 URL。 |
| `options` | `object` | 否 | `{}` | `http.request` 配置，排除 url/method。其余字段和默认值同主合同。 |

**返回值**

与 `http.request()` 相同的完整响应 Promise；非 2xx 仍 resolve，无记录/空正文由服务响应决定。

**行为与错误**

强制 GET 并覆盖 URL；当前实现会在传入的 options 对象上设置 method/url，不要共享或冻结该对象。
不做 params 拼接、自动重试或状态验证。同步配置错误与异步网络/取消错误均应处理。

**示例**

```js
const response = await http.get('http://127.0.0.1:43123/status', { timeout: 1000 });
if (response.status !== 200) throw new Error('status ' + response.status);
console.log(response.data);
```

沿用主合同的已启动 fixture 前提。

## http.post(url, data, options)

发起 POST；共享返回、错误、权限、缓冲限制及取消语义见 [http.request](#httprequestoptions)。

**签名**

```ts
http.post<T = unknown>(url: string, data?: unknown, options?: Omit<OpenDeskHttpRequestOptions, 'url' | 'method' | 'data'>): Promise<OpenDeskHttpResponse<T>>
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `url` | `string` | 是 | 无 | 已授权的绝对目标 URL。 |
| `data` | `unknown` | 否 | 无正文 | 单次正文，编码及 null 语义见主合同。 |
| `options` | `object` | 否 | `{}` | 其余 http.request 配置和默认值，排除 url/method/data。 |

**返回值**

完整响应 Promise；返回 HTTP 响应不证明远端业务成功，非 2xx 也 resolve。

**行为与错误**

当前实现会在 options 上设置 method/url/data，不要共享或冻结该对象。POST 可能产生远端持久副作用；
deadline/取消只中止等待/传输，不证明未提交。错误与主合同相同；未知结果停止，不自动重试。

**示例**

沿用主合同的 fixture 前提，并要求 fixture 支持 POST /echo：

```js
const response = await http.post('http://127.0.0.1:43123/echo', { value: 42 }, { timeout: 1000 });
if (response.status !== 200 || response.data.value !== 42) throw new Error('echo mismatch');
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
| `headers` | `{}` | 初始 GET 的自定义请求头；禁止 `Range` 与 `If-Range`（大小写不敏感，包括空值），在网络或文件副作用前以 `INVALID_ARGUMENT` 拒绝。发生获准的跨源重定向后全部丢弃且不恢复。 |
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
都是解压后的内容；未知 `Content-Encoding` 会失败。下载并发上限为每个 execution 4 个，超限以
`CONCURRENCY_LIMIT` 拒绝；下载完成或取消并清理后可复用槽位。

下载仅在受信任的本地 `-script` / `ai run` execution，或由可信 MCP 宿主以
`--allow-script-execution --script-capabilities=download` 显式授权的脚本中启用；见
[MCP Runtime 调用](../integrations/mcp/runtime-api.md)。HTTP、默认 MCP、Scheduler
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
读取 options 或 signal 的 getter 抛错时，也通过返回的 Promise 以 `INVALID_ARGUMENT` 拒绝，
`status: 0`、`committed: false`；不回显 getter 异常正文，不创建下载槽位或网络/文件副作用。
取消与超时也适用于 gzip 首部解码等待，分别报告 `CANCELED` 与 `TIMEOUT`，不会误报为编码错误；
已收到最终 `200` 响应头时，这类错误的 `status` 为 `200`，提交前的 `committed` 为 `false`。

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

## axios 公共约定

`axios` 是普通脚本中的全局 polyfill，通过 native `http.request()` 做出站网络 I/O，
不依赖 Custom UI host、桌面权限或外部 npm 包。目标 URL、请求体、header 和可能的远端写入
必须在调用方授权范围内；loopback 也不是自动授权。它不会授予 webhook 监听或下载落盘权限。
未配置目标时不要用公共互联网地址代替。等待、deadline 与取消还受
[Runtime 取消语义](runtime.md#异步完成与取消)约束；取消不保证远端业务回滚，不自动重试。

配置按 defaults → 单次 config 深合并，普通对象递归合并，数组和其他值直接替换。
请求拦截器按注册顺序 await 后才发送；响应拦截器按注册顺序 await 后才验证状态。
本实现不是完整 npm Axios：没有 `baseURL` 拼接或自动重试，也不提供标准 AxiosError 的完整字段保证。

## axios.defaults

读取或修改后续请求使用的共享默认配置对象。

**签名**

```ts
axios.defaults: OpenDeskAxiosConfig
```

**参数**

无（属性）；可修改字段见 [axios.request(config)](#axiosrequestconfig) 的参数表。

**返回值**

可变的 `OpenDeskAxiosConfig` 对象引用。初始 `timeout: 30000`、`responseType: 'json'`，
`validateStatus` 接受 `200..299`。初始 headers 的 `common` 包含
`Accept: application/json, text/plain, */*`、`Content-Type: application/json`、
`X-Requested-With: XMLHttpRequest`；`post` 的 Content-Type 为
`application/x-www-form-urlencoded`，`get/put/delete/patch` 为 `application/json`。

**行为与错误**

- 读取或修改 defaults 不发送请求，不检查配置有效性；无效值会在后续请求阶段失败。
- 修改 `axios.defaults.timeout` 等字段影响同一 Runtime 中后续请求；已经开始合并配置的请求不重新读取 defaults。注意并行脚本逻辑共享配置的影响，优先使用单次 config。
- 保留原对象并修改字段；不要用 `axios.defaults = {...}` 替换。当前请求函数捕获原对象，属性整体替换不会更新内部默认配置。
- 请求 header 合并后依次展开 `common`、当前 HTTP method 小写分组、顶层 header，同名键以后者为准。默认 POST header 不会把对象数据变成表单；对象请求体仍由 native bridge JSON 序列化，需要 JSON 时显式设置顶层 Content-Type。
- 恢复临时默认值应使用 `finally`；网络授权与副作用见 [axios 公共约定](#axios-公共约定)。

**示例**

普通脚本内只修改配置，不发请求：

```js
const previous = axios.defaults.timeout;
try {
  axios.defaults.timeout = 1000;
  console.log(axios.defaults.timeout);
} finally {
  axios.defaults.timeout = previous;
}
```

## axios.request(config)

合并默认配置，发送一次 HTTP 请求并等待响应与拦截器处理完成。

**签名**

```ts
axios.request<T = unknown>(config: OpenDeskAxiosConfig): Promise<OpenDeskAxiosResponse<T>>
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `config` | `OpenDeskAxiosConfig` | 是 | 无 | 与 defaults 合并的单次配置。 |
| `config.url` | `string` | 合并后必需 | 无 | HTTP(S) 目标 URL；无 baseURL 拼接。 |
| `config.method` | `string` | 否 | `GET` | HTTP method。 |
| `config.headers` | `Record<string, unknown>` | 否 | defaults.headers | flat headers 或 common/method 分组，展开规则见 defaults。 |
| `config.params` | `Record<string, unknown>` | 否 | 无 | 非 null/undefined 的值以 encodeURIComponent 编码追加 query；数组/对象按 JS 字符串转换，不是嵌套 query 编码。 |
| `config.data` | `unknown` | 否 | 无 | 字符串直接作为正文，非字符串由 native bridge JSON 编码；null/undefined 不发送正文。 |
| `config.timeout` | `number` | 否 | `30000` | 使用 [http.request](#httprequestoptions) 的毫秒规则，包括 1 毫秒的正值下限。 |
| `config.signal` | `AbortSignal` | 否 | 无 | 取消在途请求；不会回滚远端副作用。 |
| `config.responseType` | `'json' \| 'text' \| 'arraybuffer'` | 否 | `'json'` | json 优先解析，解析失败回退字符串；text 返回字符串；arraybuffer 返回真实 ArrayBuffer。 |
| `config.validateStatus` | `(status: number) => boolean` | 否 | `200 <= status < 300` | 响应拦截器完成后调用；须为函数，null 不表示关闭验证。 |

**返回值**

`Promise<OpenDeskAxiosResponse<T>>`，包含 `data`、数值 `status`、`statusText` 和 `headers`。
native headers 值为字符串数组，`statusText` 为含状态码的完整状态文本（如 `200 OK`）。
`T` 不执行运行时校验；响应拦截器可以改变结果。

**行为与错误**

- 遵守 [axios 公共约定](#axios-公共约定)；无 UI 平台要求，但实际网络可达性、代理与宿主 execution 限制仍适用。
- 缺少合并后的 URL、非法请求配置或不支持的 responseType 会 reject；网络/正文读取错误也 reject。默认 json 遇到非 JSON 文本不会仅因解析失败而 reject。
- 默认非 2xx 在响应拦截器之后以 `Error('Request failed with status code ...')` reject；不承诺 `error.response`。自定义 validateStatus 可接受其他状态，若其不是函数或自身抛错则 reject。
- timeout / signal 取消分别以 `HTTP request timed out` / `HTTP request canceled` 开头的错误 reject；请求/响应拦截器抛错原样传播。失败可能被 polyfill 写到 console.error，日志和凭据需受控。
- 没有自动重试。错误或未知结果发生后由业务方判断是否允许再次发送。

**示例**

在普通 OpenDesk 脚本中运行，前提是 `Execution.input.url` 为已授权的完整 HTTP(S) 目标；本例会发送 GET：

```js
const response = await axios.request({
  url: Execution.input.url,
  method: 'GET',
  params: { q: 'opendesk' },
  timeout: 1000,
});
console.log(response.status);
```

## axios.get(url, config)

以 GET 调用 [axios.request](#axiosrequestconfig)；完整配置、合并、响应、拦截器、权限与取消合同由主方法定义。

**签名**

```ts
axios.get<T = unknown>(url: string, config?: OpenDeskAxiosConfig): Promise<OpenDeskAxiosResponse<T>>
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `url` | `string` | 是 | 无 | 已授权的绝对目标 URL，覆盖 config.url。 |
| `config` | `OpenDeskAxiosConfig` | 否 | `{}` | params、headers、timeout、signal、responseType、validateStatus 等见主合同；method/url 由便捷方法覆盖。 |

**返回值**

完整 `{ data, status, statusText, headers }` 响应 Promise。默认仅 2xx resolve；由单次/默认
validateStatus 决定。泛型不校验响应内容，HTTP 成功仍须独立业务后置条件。

**行为与错误**

GET 不自动保证服务端无副作用。本对象方法依赖 `this.request`，不要直接解构后调用。
params 编码、默认配置和顺序与主合同一致；配置/网络/状态/拦截器错误向上传播，无自动重试。
取消不等于远端回滚，结果未知时停止。

**示例**

在已启动且获准的 loopback fixture 中（替换为实际端口/路由）：

```js
const response = await axios.get('http://127.0.0.1:43123/echo', { timeout: 1000 });
console.log(response.status, response.data);
```

## axios.post(url, data, config)

以 POST 调用 [axios.request](#axiosrequestconfig)；完整配置、合并、响应、拦截器、权限与取消合同由主方法定义。

**签名**

```ts
axios.post<T = unknown>(url: string, data?: unknown, config?: OpenDeskAxiosConfig): Promise<OpenDeskAxiosResponse<T>>
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `url` | `string` | 是 | 无 | 已授权的绝对目标 URL，覆盖 config.url。 |
| `data` | `unknown` | 否 | `undefined` | 单次正文；与 defaults 的合并遵守主合同。 |
| `config` | `OpenDeskAxiosConfig` | 否 | `{}` | params、headers、timeout、signal、responseType、validateStatus 等见主合同；method/url 由便捷方法覆盖。 |

**返回值**

完整 `{ data, status, statusText, headers }` 响应 Promise。默认仅 2xx resolve；由单次/默认
validateStatus 决定。泛型不校验响应内容，HTTP 成功仍须独立业务后置条件。

**行为与错误**

POST 可能修改远端资源。本对象方法依赖 `this.request`，不要直接解构后调用。
params 编码、默认配置和顺序与主合同一致；配置/网络/状态/拦截器错误向上传播，无自动重试。
取消不等于远端回滚，结果未知时停止。

**示例**

在已启动且获准的 loopback fixture 中（替换为实际端口/路由）：

```js
const response = await axios.post('http://127.0.0.1:43123/echo', { value: 42 }, { timeout: 1000 });
console.log(response.status, response.data);
```

## axios.put(url, data, config)

以 PUT 调用 [axios.request](#axiosrequestconfig)；完整配置、合并、响应、拦截器、权限与取消合同由主方法定义。

**签名**

```ts
axios.put<T = unknown>(url: string, data?: unknown, config?: OpenDeskAxiosConfig): Promise<OpenDeskAxiosResponse<T>>
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `url` | `string` | 是 | 无 | 已授权的绝对目标 URL，覆盖 config.url。 |
| `data` | `unknown` | 否 | `undefined` | 单次正文；与 defaults 的合并遵守主合同。 |
| `config` | `OpenDeskAxiosConfig` | 否 | `{}` | params、headers、timeout、signal、responseType、validateStatus 等见主合同；method/url 由便捷方法覆盖。 |

**返回值**

完整 `{ data, status, statusText, headers }` 响应 Promise。默认仅 2xx resolve；由单次/默认
validateStatus 决定。泛型不校验响应内容，HTTP 成功仍须独立业务后置条件。

**行为与错误**

PUT 可能修改远端资源。本对象方法依赖 `this.request`，不要直接解构后调用。
params 编码、默认配置和顺序与主合同一致；配置/网络/状态/拦截器错误向上传播，无自动重试。
取消不等于远端回滚，结果未知时停止。

**示例**

在已启动且获准的 loopback fixture 中（替换为实际端口/路由）：

```js
const response = await axios.put('http://127.0.0.1:43123/echo', { value: 42 }, { timeout: 1000 });
console.log(response.status, response.data);
```

## axios.patch(url, data, config)

以 PATCH 调用 [axios.request](#axiosrequestconfig)；完整配置、合并、响应、拦截器、权限与取消合同由主方法定义。

**签名**

```ts
axios.patch<T = unknown>(url: string, data?: unknown, config?: OpenDeskAxiosConfig): Promise<OpenDeskAxiosResponse<T>>
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `url` | `string` | 是 | 无 | 已授权的绝对目标 URL，覆盖 config.url。 |
| `data` | `unknown` | 否 | `undefined` | 单次正文；与 defaults 的合并遵守主合同。 |
| `config` | `OpenDeskAxiosConfig` | 否 | `{}` | params、headers、timeout、signal、responseType、validateStatus 等见主合同；method/url 由便捷方法覆盖。 |

**返回值**

完整 `{ data, status, statusText, headers }` 响应 Promise。默认仅 2xx resolve；由单次/默认
validateStatus 决定。泛型不校验响应内容，HTTP 成功仍须独立业务后置条件。

**行为与错误**

PATCH 可能修改远端资源。本对象方法依赖 `this.request`，不要直接解构后调用。
params 编码、默认配置和顺序与主合同一致；配置/网络/状态/拦截器错误向上传播，无自动重试。
取消不等于远端回滚，结果未知时停止。

**示例**

在已启动且获准的 loopback fixture 中（替换为实际端口/路由）：

```js
const response = await axios.patch('http://127.0.0.1:43123/echo', { value: 42 }, { timeout: 1000 });
console.log(response.status, response.data);
```

## axios.delete(url, config)

以 DELETE 调用 [axios.request](#axiosrequestconfig)；完整配置、合并、响应、拦截器、权限与取消合同由主方法定义。

**签名**

```ts
axios.delete<T = unknown>(url: string, config?: OpenDeskAxiosConfig): Promise<OpenDeskAxiosResponse<T>>
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `url` | `string` | 是 | 无 | 已授权的绝对目标 URL，覆盖 config.url。 |
| `config` | `OpenDeskAxiosConfig` | 否 | `{}` | params、headers、timeout、signal、responseType、validateStatus 等见主合同；method/url 由便捷方法覆盖。 |

**返回值**

完整 `{ data, status, statusText, headers }` 响应 Promise。默认仅 2xx resolve；由单次/默认
validateStatus 决定。泛型不校验响应内容，HTTP 成功仍须独立业务后置条件。

**行为与错误**

DELETE 可能修改远端资源。本对象方法依赖 `this.request`，不要直接解构后调用。
params 编码、默认配置和顺序与主合同一致；配置/网络/状态/拦截器错误向上传播，无自动重试。
取消不等于远端回滚，结果未知时停止。

**示例**

在已启动且获准的 loopback fixture 中（替换为实际端口/路由）：

```js
const response = await axios.delete('http://127.0.0.1:43123/echo', { timeout: 1000 });
console.log(response.status, response.data);
```

## axios.interceptors

注册当前 Runtime 的请求/响应拦截器；完整顺序见 [axios.request](#axiosrequestconfig)。

**签名**

```ts
axios.interceptors.request.use(fulfilled: (config: OpenDeskAxiosConfig) => OpenDeskAxiosConfig | Promise<OpenDeskAxiosConfig>): number
axios.interceptors.response.use(fulfilled: (response: OpenDeskAxiosResponse) => OpenDeskAxiosResponse | Promise<OpenDeskAxiosResponse>): number
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `fulfilled` | `function` | 是 | 无 | 返回下一阶段完整配置/响应，可以 async；不支持 rejected 第二参数。 |

**返回值**

`use()` 同步返回注册后数组长度（首个为 1）；不是可 eject 的 ID。`interceptors` 是两个 manager 对象。

**行为与错误**

注册本身不发送请求；回调在以后请求中按注册顺序 await。响应拦截器先于 validateStatus，能够改变
状态验证所见的响应；抛错/拒绝终止该次链路并向上传播。当前无 eject/clear，不注册重复 handler；
需要隔离时用新的 execution，不假设 npm Axios 的逆序或错误拦截语义。回调的副作用归调用方，仍受主合同授权和取消边界。

**示例**

```js
const count = axios.interceptors.request.use(config => {
  config.headers = { ...config.headers, 'X-Fixture': 'controlled' };
  return config;
});
console.log(count); // 新 execution 首次注册为 1；尚未发送请求
```

## http / axios：错误行为

- 网络错误：向上抛出。
- timeout：抛出以 `HTTP request timed out` 开头的错误。
- cancel / `AbortSignal`：抛出以 `HTTP request canceled` 开头的错误。
- axios 的 `validateStatus` 不通过（native http 不检查状态）：抛出 `Request failed with status code ...`。
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
