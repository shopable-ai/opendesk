---
title: TestMonkey 网络与视觉 API
description: 面向用户的 http、axios、OCR、Vision、notify API 文档。
order: 40
---

# TestMonkey 网络与视觉 API

更新时间：2026-05-18

本文覆盖：
- `http`
- `axios`
- `OCR`
- `Vision`
- `notify`

## 1. http

这是运行时内置的简洁 HTTP 客户端。

### 方法总表

| 方法 | 说明 |
| --- | --- |
| `await http.request(options)` | 通用请求 |
| `await http.get(url, options?)` | GET |
| `await http.post(url, data, options?)` | POST |

### http.request(options)

```js
{
  method: 'GET',
  url: 'https://example.com/api',
  headers: {
    Authorization: 'Bearer token'
  },
  data: {
    hello: 'world'
  }
}
```

#### 参数说明

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `method` | `string` | 否 | 默认 `GET` |
| `url` | `string` | 是 | 请求地址 |
| `headers` | `object` | 否 | 请求头 |
| `data` | `string \| object` | 否 | 请求体 |

#### 请求体编码规则

- 字符串且像 `a=1&b=2`：按 `application/x-www-form-urlencoded`
- 其他字符串：按 `text/plain`
- 对象：按 JSON 序列化

#### 返回结构

```js
{
  data: any,
  status: 200,
  statusText: '200 OK',
  headers: { ... }
}
```

---

## 2. axios

当前项目最终应以增强版 `axios` 理解。

### 方法总表

| 方法 | 说明 |
| --- | --- |
| `await axios.request(config)` | 通用请求 |
| `await axios.get(url, config?)` | GET |
| `await axios.post(url, data?, config?)` | POST |
| `await axios.put(url, data?, config?)` | PUT |
| `await axios.delete(url, config?)` | DELETE |
| `await axios.patch(url, data?, config?)` | PATCH |

### 支持能力

- 默认 headers
- `params` 自动拼 query string
- request/response interceptors
- `validateStatus(status)`

### 示例

```js
const resp = await axios.get('https://httpbin.org/get', {
  params: { q: 'demo' },
  headers: { 'X-Test': '1' }
})
console.log(resp.data)
```

---

## 3. OCR

本地 OCR 能力，主要通过 `tesseract` CLI 实现。

### 方法

| 方法 | 说明 |
| --- | --- |
| `await OCR.extractText(image, lang?)` | 从图片中提取文本 |

### 参数

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `image` | `string` |  | 图片路径或 data URI，不能为空 |
| `lang` | `string` | `chi_sim+eng` | OCR 语言 |

### `image` 支持

- 绝对路径
- 相对路径
- `data:image/...;base64,...`

### 返回
- `string`

### 示例

```js
const text = await OCR.extractText('temp/shot.png')
```

---

## 4. Vision

比 `OCR` 更高层的统一视觉接口。

### 方法总表

| 方法 | 说明 |
| --- | --- |
| `await Vision.runOCR(options)` | 统一 OCR 调用 |
| `await Vision.detectUI(options)` | 基于 OCR 结果定位文本和点击点 |
| `await Vision.getCapabilities(options?)` | 查询 provider 能力 |

### Vision.runOCR(options)

```js
{
  image: imageBytesOrBase64OrPath,
  provider: 'paddle',
  lang: 'ch',
  includeRaw: false,
  timeoutMs: 30000,
  detectOrientation: true,
  recognizeDirection: true
}
```

#### 返回示例

```js
{
  provider: 'paddle',
  lang: 'ch',
  text: '识别出的完整文本',
  lines: [
    {
      text: '按钮',
      confidence: 0.98,
      bbox: { x: 10, y: 20, width: 80, height: 24 }
    }
  ],
  lineCount: 1
}
```

### Vision.detectUI(options)

```js
{
  image: imageBytesOrBase64OrPath,
  targetText: '登录',
  matchMode: 'contains',
  minConfidence: 0.5,
  defaultRole: 'text',
  provider: 'paddle',
  lang: 'ch'
}
```

#### 返回示例

```js
{
  provider: 'paddle',
  lang: 'ch',
  text: '整张图识别文本',
  count: 1,
  elements: [
    {
      role: 'button',
      text: '登录',
      bbox: { x: 100, y: 200, width: 88, height: 30 },
      score: 0.99,
      clickPoint: { x: 144, y: 215 }
    }
  ]
}
```

### Vision.getCapabilities(options?)

```js
const caps = await Vision.getCapabilities()
```

#### 返回示例

```js
{
  defaultProvider: 'paddle',
  defaultLang: 'ch',
  providers: [
    {
      provider: 'paddle',
      alias: 'paddle',
      aliases: ['paddle'],
      isDefault: true,
      implemented: true,
      defaultLang: 'ch',
      supportedLangs: ['ch', 'en'],
      switchReady: true
    }
  ],
  providerCount: 1
}
```

---

## 5. notify

脚本层建议直接使用：
- `notify(options)`
- `notify('标题')`

### 字符串调用

```js
notify('任务完成')
```

等价于：

```js
notify({
  title: '任务完成',
  message: '',
  sound: true,
  timeout: 5000
})
```

### 对象调用

```js
notify({
  title: '提示标题',
  message: '提示内容',
  sound: true,
  timeout: 5000
})
```

### 参数

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `title` | `string` | 必填 | 标题 |
| `message` | `string` | `''` | 正文 |
| `sound` | `boolean` | `true` | 是否提示音 |
| `timeout` | `number` | `5000` | 持续时间，毫秒 |
