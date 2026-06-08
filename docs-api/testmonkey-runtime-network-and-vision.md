---
title: TestMonkey 网络与视觉接口
description: 面向脚本作者的网络与视觉 API 文档，完整覆盖 http、axios、OCR、Vision、notify 与相关辅助对象。
order: 50
---

# TestMonkey 网络与视觉接口

更新时间：2026-05-18

本文聚焦：
- `http`
- `axios`
- `OCR`
- `Vision`
- `notify`
- `AppStorage`
- `Sound`
- `ImageColor`
- `FloatingWindow`

## http

来源：`automation/http.go`

这是运行时内置的简洁 HTTP 客户端。

### http 方法总表

| 方法 | 说明 |
| --- | --- |
| `await http.request(options)` | 通用请求 |
| `await http.get(url, options?)` | GET 请求 |
| `await http.post(url, data, options?)` | POST 请求 |

## http.request(options)

### 参数

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

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `method` | `string` | 否 | 默认 `GET` |
| `url` | `string` | 是 | 请求地址 |
| `headers` | `object` | 否 | 请求头 |
| `data` | `string \| object` | 否 | 请求体 |

### 请求体编码行为

#### 1. `data` 是字符串
- 如果类似 `a=1&b=2` 且不含 `{`，会设置 `Content-Type: application/x-www-form-urlencoded`
- 否则设置 `Content-Type: text/plain`

#### 2. `data` 是对象
- 会按 JSON 序列化
- 设置 `Content-Type: application/json`

### 默认请求头

始终会设置一个默认 User-Agent。

### 返回结构

```js
{
  data: any,
  status: 200,
  statusText: '200 OK',
  headers: { ... }
}
```

### 错误条件

- `options` 缺失
- `url` 为空
- 请求创建失败
- 请求发送失败
- 读取响应体失败

## http.get(url, options?)

### 参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `url` | `string` | 请求地址 |
| `options` | `object` | 可选配置，会补上 `method=GET` |

## http.post(url, data, options?)

### 参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `url` | `string` | 请求地址 |
| `data` | `string \| object` | 请求体 |
| `options` | `object` | 其他配置 |

---

## axios

项目里有两层 axios：

1. Go 原生注入版：`automation/axios.go`
2. JS 增强版：`polyfills/004-axios.js`

脚本实际应按增强版 `axios` 理解。

### axios 方法总表

| 方法 | 说明 |
| --- | --- |
| `await axios.request(config)` | 通用请求 |
| `await axios.get(url, config?)` | GET |
| `await axios.post(url, data?, config?)` | POST |
| `await axios.put(url, data?, config?)` | PUT |
| `await axios.delete(url, config?)` | DELETE |
| `await axios.patch(url, data?, config?)` | PATCH |

### 默认能力

- 默认 headers
- `params` 自动拼 query string
- request interceptors
- response interceptors
- `validateStatus(status)`

### `axios.defaults`

源码里可确认默认值大致包括：

```js
axios.defaults = {
  headers: {
    common: {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest'
    }
  },
  timeout: 30000,
  responseType: 'json',
  validateStatus(status) {
    return status >= 200 && status < 300
  }
}
```

### 典型 config

```js
{
  method: 'GET',
  url: 'https://example.com',
  params: { q: 'abc' },
  headers: { Authorization: 'Bearer xxx' },
  data: { hello: 'world' },
  validateStatus(status) {
    return status < 500
  }
}
```

### 拦截器

```js
axios.interceptors.request.use(fn)
axios.interceptors.response.use(fn)
```

### 返回结构

```js
{
  data: any,
  status: 200,
  statusText: '200 OK',
  headers: { ... },
  config: { ... }
}
```

---

## OCR

来源：`automation/ocr.go`

这是本地 OCR 能力，主要通过 `tesseract` CLI 实现。

### 方法

| 方法 | 说明 |
| --- | --- |
| `await OCR.extractText(image, lang?)` | 从图片中提取文本 |

## OCR.extractText(image, lang?)

### 参数

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `image` | `string` |  | 图片路径或 data URI，不能为空 |
| `lang` | `string` | `chi_sim+eng` | OCR 语言 |

### `image` 支持形式

1. 绝对路径
2. 相对路径
3. `data:image/...;base64,...`

### 行为说明

- 会尝试多组 OCR 策略
- 原图会尝试不同 `psm`
- 如果系统安装了 `magick`，会先生成增强图再 OCR
- 会对候选结果打分，返回最优文本

### 返回

- `string`

### 典型示例

```js
const text = await OCR.extractText('temp/shot.png')
const zh = await OCR.extractText('temp/shot.png', 'chi_sim+eng')
```

### 错误条件

- `image` 为空
- 图片路径不存在
- data URI 无法 base64 解码
- 系统未安装 `tesseract` 或 OCR 执行失败

---

## Vision

来源：`automation/vision.go`

`Vision` 是比 `OCR` 更高层的一组统一视觉接口，面向：
- OCR provider 抽象
- 文本定位
- UI 元素候选提取
- provider 能力查询

### Vision 方法总表

| 方法 | 说明 |
| --- | --- |
| `await Vision.runOCR(options)` | 统一 OCR 调用 |
| `await Vision.detectUI(options)` | 基于 OCR 结果做文本匹配和点击点推导 |
| `await Vision.getCapabilities(options?)` | 查询 provider 能力 |

## Vision.runOCR(options)

### 参数

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

### 重要字段

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `image` | `string \| bytes` |  | 图片内容，必需 |
| `provider` | `string` | `paddle` | OCR provider |
| `lang` | `string` | provider 默认语言 | 识别语言 |
| `language` | `string` | 空 | `lang` 的别名 |
| `includeRaw` | `boolean` | `false` | 是否返回原始 provider 响应 |
| `timeoutMs` | `number` | 默认 provider timeout | OCR 超时 |
| `detectOrientation` | `boolean` | `true` | 是否检测方向 |
| `recognizeDirection` | `boolean` | `true` | 是否识别方向 |

### 返回示例

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
  lineCount: 1,
  raw: { ... } // includeRaw=true 时才有
}
```

---

## Vision.detectUI(options)

在 OCR 结果上做文本筛选，并推导点击点。

### 参数

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

### 字段说明

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `image` | `string \| bytes` |  | 图片内容，必需 |
| `targetText` | `string` | 空 | 目标文本 |
| `matchMode` | `string` | `contains` | 匹配模式 |
| `minConfidence` | `number` | `0.0` | 最低置信度 |
| `defaultRole` | `string` | `text` | 未能推断角色时的默认角色 |
| `provider` | `string` | `paddle` | OCR provider |
| `lang` | `string` | provider 默认值 | OCR 语言 |

### 返回示例

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

### 返回字段说明

| 字段 | 说明 |
| --- | --- |
| `count` | 匹配到的元素数量 |
| `elements[].role` | 推测的角色 |
| `elements[].text` | 匹配的 OCR 文本 |
| `elements[].bbox` | 文本框位置 |
| `elements[].score` | OCR 置信度 |
| `elements[].clickPoint` | 推荐点击点 |

---

## Vision.getCapabilities(options?)

查询 provider 能力，适合脚本启动前做 provider 探测或 UI 展示。

### 输入示例

```js
await Vision.getCapabilities()
await Vision.getCapabilities({ provider: 'paddle' })
await Vision.getCapabilities({ providerName: 'openai' })
```

### 返回示例

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

### 过滤行为

如果传了不存在的 provider，会报：
- `unsupported ocr provider: xxx`

---

## notify

`notify` 是脚本层建议直接使用的通知接口。

来源：
- native bridge: `main.go` 中的 `notify____Inject`
- JS 包装：`polyfills/000-systemBase.js`

### 调用形式

#### 1. 直接传标题字符串

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

#### 2. 传对象

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

---

## 其他已注入对象

以下对象已在运行时注入，但当前页不展开全部方法。

### AppStorage
- 面向简单持久化键值存储
- 适合缓存轻量状态

### Sound
- 声音相关能力

### ImageColor
- 图像颜色相关能力

### FloatingWindow
- 依赖 Fyne 初始化
- 如果设置了 `SKIP_FYNE_INIT`，则不会注入

---

## 推荐组合用法

### 1. 截图后 OCR

```js
const image = await page.screenshot({ returnType: 'base64' })
const result = await Vision.runOCR({
  image,
  provider: 'paddle',
  lang: 'ch'
})
console.log(result.text)
```

### 2. 定位文本后点击

```js
const image = await page.screenshot({ returnType: 'base64' })
const ui = await Vision.detectUI({
  image,
  targetText: '登录',
  minConfidence: 0.5
})

if (ui.count > 0) {
  const p = ui.elements[0].clickPoint
  await mouse.click(p.x, p.y)
}
```

### 3. HTTP 请求

```js
const resp = await axios.get('https://httpbin.org/get', {
  params: { q: 'demo' },
  headers: { 'X-Test': '1' }
})
console.log(resp.data)
```
