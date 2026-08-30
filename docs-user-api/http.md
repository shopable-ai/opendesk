---
title: HTTP and Axios
description: Clawdesk 原生 http 对象与构建在其上的 axios polyfill。
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
    q: 'clawdesk',
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
- `validateStatus` 不通过：抛出 `Request failed with status code ...`。
- interceptor 抛错：继续向上抛出。

## 何时选哪个

- 日常脚本：`axios`
- 最小底层依赖：`http`
- params / interceptors / defaults：`axios`
- 排查 HTTP bridge：先看 `http.request()`

## 关于 automation/axios.go

仓库仍保留 Go 侧 Axios 兼容实现，部分 legacy 初始化路径可能注册它。

但正式用户文档不应把“两层 axios”写成稳定依赖关系；用户最终应以当前全局 `axios` 的 polyfill 行为为准。

如果未来运行时移除或重构 legacy Axios，`http.md` 不需要因此改变用户主入口。
