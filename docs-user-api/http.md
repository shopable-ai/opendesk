---
title: HTTP and Axios
description: http 原生请求对象与 axios 兼容层。
order: 9
---

# http / axios

当前运行时里有两套 HTTP 请求入口：

1. `http`
- 原生 Go 注入对象
- 最接近底层实现

2. `axios`
- 兼容层
- 先有 Go 原生 axios，再会被 `polyfills/004-axios.js` 覆盖为增强版 axios
- 用户实际使用时，应把全局 axios 视为 polyfill 增强后的版本

## 关系说明

源码加载顺序是：
- 先注入原生 `http`
- 先注入原生 `axios`
- 再执行 polyfills
- `polyfills/004-axios.js` 最终把 `globalThis.axios` 覆盖为增强版实现

因此：
- `http`：原生稳定入口
- `axios`：用户常用入口，最终行为以 polyfill 版本为准

## http

**方法总表**

| 方法 | 用途 |
| --- | --- |
| http.request(options) | 发任意 HTTP 请求 |
| http.get(url, options) | GET 请求 |
| http.post(url, data, options) | POST 请求 |

### http.request(options)

签名

```js
const resp = await http.request(options)
```

参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| options.method | string | 请求方法，默认 GET |
| options.url | string | 必填 |
| options.data | any | 请求体 |
| options.headers | object | 请求头 |

返回值

```js
{
  data,
  status,
  statusText,
  headers
}
```

行为规则
- 若 data 是字符串：
  - 含 `=` 且不像 JSON 时，Content-Type 可能走 `application/x-www-form-urlencoded`
  - 否则是 `text/plain`
- 若 data 是对象：序列化为 JSON
- 默认有 User-Agent
- 响应体若能 parse 为 JSON，则 `data` 是对象；否则是字符串

示例

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

### http.get(url, options)

```js
const resp = await http.get('https://httpbin.org/get');
console.log(resp.data);
```

### http.post(url, data, options)

```js
const resp = await http.post('https://httpbin.org/post', {
  hello: 'world'
});
console.log(resp.data);
```

## axios

**方法总表**

| 方法 | 用途 |
| --- | --- |
| axios.request(config) | 发任意请求 |
| axios.get(url, config) | GET |
| axios.post(url, data, config) | POST |
| axios.put(url, data, config) | PUT |
| axios.delete(url, config) | DELETE |
| axios.patch(url, data, config) | PATCH |
| axios.interceptors.request.use(fn) | 请求拦截器 |
| axios.interceptors.response.use(fn) | 响应拦截器 |
| axios.defaults | 默认配置 |

**默认配置**

增强版 polyfill 默认值包括：
- timeout: 30000
- responseType: json
- validateStatus: status >= 200 && status < 300
- 各方法的默认 headers

### axios.get(url, config)

```js
const resp = await axios.get('https://httpbin.org/get');
console.log(resp.status);
console.log(resp.data);
```

### axios.get + params

```js
const resp = await axios.get('https://httpbin.org/get', {
  params: {
    q: 'clawdesk',
    page: 1
  }
});
console.log(resp.data);
```

### axios.post(url, data, config)

```js
const resp = await axios.post('https://httpbin.org/post', {
  name: 'alice'
});
console.log(resp.data);
```

### axios.put / patch / delete

```js
await axios.put('https://httpbin.org/put', { enabled: true });
await axios.patch('https://httpbin.org/patch', { name: 'new' });
await axios.delete('https://httpbin.org/delete');
```

### axios.request(config)

```js
const resp = await axios.request({
  method: 'GET',
  url: 'https://httpbin.org/headers',
  headers: {
    'X-Clawdesk': '1'
  }
});
console.log(resp.data);
```

**请求拦截器**

```js
axios.interceptors.request.use((config) => {
  config.headers = config.headers || {};
  config.headers['X-Trace-Id'] = 'demo-trace';
  return config;
});
```

**响应拦截器**

```js
axios.interceptors.response.use((response) => {
  console.log('status =', response.status);
  return response;
});
```

## 返回结构

增强版 axios 最终仍依赖底层 `http.request(config)`，因此常见返回结构为：

```js
{
  data,
  status,
  statusText,
  headers,
  config
}
```

## 错误行为

- 网络错误：直接抛出异常
- 响应状态码不通过 `validateStatus`：抛出 `Request failed with status code ...`
- 拦截器异常：会向上抛出

## 何时用 http，何时用 axios

推荐
- 日常脚本：优先用 axios
- 你需要最小封装、最直接的请求：用 http
- 你需要 params、拦截器、默认配置：用 axios

## 与旧文档的差异

旧文档里 axios 只列出 get/post/put/delete/patch。

当前项目里用户实际可用的 axios 更强，因为：
- 已被 polyfill 增强
- 有 defaults
- 有 interceptors
- 会借助底层 http.request 统一发请求
