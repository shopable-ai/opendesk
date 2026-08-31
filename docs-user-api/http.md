---
title: HTTP and Axios
description: OpenDesk 原生 http 对象与构建在其上的 axios polyfill。
order: 9
---

# http / axios

当前脚本层有两个 HTTP 入口：

1. `http`
   - Go 原生对象
   - 最接近底层请求实现
2. `axios`
   - 用户常用 polyfill
   - 由 `polyfills/004-axios.js` 构造
   - 最终调用 `http.request(config)`

因此新脚本通常优先使用 `axios`；需要最小封装或排查底层行为时使用 `http`。

## http

**方法总表**

| 方法 | 用途 |
| --- | --- |
| `http.request(options)` | 任意 HTTP 请求 |
| `http.get(url, options?)` | GET |
| `http.post(url, data, options?)` | POST |

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

## axios

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

## axios.get + params

```js
const resp = await axios.get('https://httpbin.org/get', {
  params: {
    q: 'opendesk',
    page: 1
  }
});

console.log(resp.data);
```

## axios.post

```js
const resp = await axios.post('https://httpbin.org/post', {
  name: 'alice'
});

console.log(resp.status);
```

## axios.put / patch / delete

```js
await axios.put('https://httpbin.org/put', { enabled: true });
await axios.patch('https://httpbin.org/patch', { name: 'new' });
await axios.delete('https://httpbin.org/delete');
```

## 拦截器

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

## 错误行为

- 网络错误：向上抛出。
- timeout：抛出以 `HTTP request timed out` 开头的错误。
- cancel / `AbortSignal`：抛出以 `HTTP request canceled` 开头的错误。
- `validateStatus` 不通过：抛出 `Request failed with status code ...`。
- interceptor 抛错：继续向上抛出。

## 何时选哪个

- 日常脚本：`axios`
- 最小底层依赖：`http`
- params / interceptors / defaults：`axios`
- 排查 HTTP bridge：先看 `http.request()`

## 关于 automation/axios.go

Go 侧旧 Axios bridge 已移除。所有 stack 都使用这里描述的 axios polyfill，
它通过 `http.request()` 返回 Promise；网络 I/O 完成后才由 Runtime event loop 回调
resolve/reject。脚本应继续以 `await axios...` 处理结果与错误。

## 取消慢请求

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
取消所需的 `signal`、`abort()`、`addEventListener()` 和 `removeEventListener()`。
