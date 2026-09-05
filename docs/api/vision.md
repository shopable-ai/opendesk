---
title: Vision API
description: OCR、UI 文本检测、provider capabilities 与旧 OCR 对象的关系。
order: 10
---

# Vision

Vision 提供底层 OCR、legacy text-center helper 与 provider capability。新桌面 Recipe 应优先使用
[`UI`](desktop-ui.md)：它在每次截图后处理 capture scale、scope、歧义和安全的 screen-coordinate
投影；需要原始 OCR 行时再直接使用 `Vision.runOCR`。

适用场景
- 对截图做 OCR
- 从图片中按文本查找 UI 元素
- 根据 provider 能力做运行时切换

与其他对象关系
- 常与 `page.screenshot()` 联用
- 常与 `File` 联用保存图片或结果
- 常与 `window` 联用定位当前窗口后截图

## Vision.analyzeLayout / Vision.annotateRegions：布局分析与标注

`Vision.analyzeLayout({ image, ...options })` 对 Runtime 截图或 base64 图像生成通用区域与分隔线结构；
`Vision.annotateRegions({ image, regions?, separators?, outputPath? })` 返回带标记 PNG。二者不依赖 OCR
provider，适合用于可解释的视觉结构验证。

当前实现重点
- `Vision.runOCR(options)`
- `Vision.detectUI(options)`
- `Vision.getCapabilities(options)`

同时项目里还有一个旧的 `OCR` 对象：
- `OCR.extractText(image, lang)`
- 它基于本地 tesseract CLI
- 更适合简单本地 OCR
- 新脚本优先推荐 Vision

## Vision：方法总表

| 方法 | 用途 |
| --- | --- |
| Vision.runOCR(options) | 对图片执行 OCR |
| Vision.detectUI(options) | 已弃用的基于 OCR 文本检测 UI 元素 helper |
| Vision.getCapabilities(options) | 查看 provider 能力、默认语言、是否已配置 |

## Vision：provider 现状

当前源码内 provider 注册情况：

| provider | 状态 | 说明 |
| --- | --- | --- |
| apple / applevision | macOS 已实现 | 打包的 Apple Vision，默认 `accurate`，无需网络或 tesseract；macOS 12+ |
| paddle / paddleocr | 已实现 | 需要配置 `PADDLE_OCR_ENDPOINT` |
| local / tesseract | 已实现 | 本地 OCR provider |
| openai | 预留未实现 | 会报 reserved but not implemented |
| azure | 预留未实现 | 同上 |
| google | 预留未实现 | 同上 |
| aws | 预留未实现 | 同上 |

默认值
- macOS：`VISION_OCR_PROVIDER` 环境变量，否则打包的 Apple Vision（`apple`）
- 其他平台：`VISION_OCR_PROVIDER` 环境变量，否则 paddle
- 默认 lang：`VISION_OCR_LANG` 环境变量，否则 ch

## Vision.runOCR(options)

签名

```js
const result = await Vision.runOCR(options)
```

作用
- 对图片做 OCR，返回全文与逐行结果

输入支持
- `image`：字节数组
- `imageBase64`
- `imagePath`
- 具体提取逻辑由内部 `visionExtractImage()` 完成

常用参数

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| options.provider | string | 默认 provider | apple / paddle / local / tesseract ... |
| options.lang | string | 默认 lang | 例如 ch / en |
| options.recognitionLevel | string | accurate | Apple Vision：`accurate` / `fast`；默认以准确率优先 |
| options.timeoutMs | number | 12000 | 超时 |
| options.detectOrientation | boolean | true | 是否检测方向 |
| options.recognizeDirection | boolean | true | 是否识别方向 |
| options.includeRaw | boolean | false | 是否附带 provider 原始响应 |
| options.image / imagePath / imageBase64 | - | - | 图片输入 |

返回值结构

```js
{
  provider: string,
  lang: string,
  text: string,
  lines: [
    {
      text: string,
      confidence: number,
      bbox: { x, y, width, height }
    }
  ],
  lineCount: number,
  raw?: any
}
```

示例：对截图做 OCR

```js
const imagePath = await page.screenshot({
  target: 'activeWindow',
  path: './.runtime/examples/vision-input.png',
  returnType: 'path'
});

const result = await Vision.runOCR({
  imagePath,
  provider: 'apple',
  lang: 'ch',
  recognitionLevel: 'accurate'
});

console.log(JSON.stringify(result, null, 2));
```

示例：使用 paddle

```js
const result = await Vision.runOCR({
  imagePath: './.runtime/examples/vision-input.png',
  provider: 'paddle',
  lang: 'ch',
  includeRaw: true
});

console.log(result.text);
```

## Vision.detectUI(options)

> **Deprecated：** `detectUI` 是兼容保留的旧 OCR text-center helper。它返回的 bbox/clickPoint 都是
> 输入图片的局部 image-pixel 坐标，不是可靠的业务目标解析或全局 mouse 坐标。新代码使用
> `Vision.runOCR` 获取原始 OCR，或直接使用 `UI.findText` / `UI.tapText` 完成查找与激活。

签名

```js
const result = await Vision.detectUI(options)
```

作用
- 先做 OCR
- 再按目标文本过滤候选行
- 返回匹配元素及点击点

常用参数

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| options.provider | string | 默认 provider | OCR provider |
| options.lang | string | 默认 lang | OCR 语言 |
| options.targetText | string | 空 | 目标文本，最常用 |
| options.matchMode | string | contains | contains / exact 等比较模式 |
| options.minConfidence | number | 0 | 最低置信度 |
| options.defaultRole | string | text | 当无法猜角色时使用 |
| options.image / imagePath / imageBase64 | - | - | 图片输入 |

返回值结构

```js
{
  provider: string,
  lang: string,
  text: string,
  count: number,
  elements: [
    {
      role: string,
      text: string,
      bbox: { x, y, width, height },
      score: number,
      clickPoint: { x, y }
    }
  ]
}
```

行为规则
- 每条 OCR line 都会参与匹配
- 文本为空或低于 `minConfidence` 的行会被跳过
- 点击点取 bbox 中心点
- role 会根据文本做简单猜测；猜不到则用 `defaultRole`

示例：查找“登录”按钮

```js
const shot = await page.screenshot({
  target: 'activeWindow',
  path: './.runtime/examples/login-page.png',
  returnType: 'path'
});

const result = await Vision.detectUI({
  imagePath: shot,
  provider: 'apple',
  targetText: '登录',
  matchMode: 'contains',
  minConfidence: 0.4,
  defaultRole: 'button'
});

console.log(JSON.stringify(result, null, 2));
// 这是 image-local 诊断结果。不要选择 result.elements[0] 并直接 mouse.click。
// 需要外部桌面操作时用 UI.findText/UI.tapText，它会重新截图并投影到 screen 坐标。
```

示例：查找英文按钮

```js
const result = await Vision.detectUI({
  imagePath: './.runtime/examples/dialog.png',
  provider: 'apple',
  targetText: 'Continue',
  matchMode: 'contains',
  minConfidence: 0.5,
  defaultRole: 'button'
});

console.log(result.elements);
```

## Vision.getCapabilities(options)

签名

```js
const caps = await Vision.getCapabilities(options)
```

作用
- 查看 provider 是否已实现
- 查看默认 provider / 默认 lang
- 查看某 provider 是否已配置 endpoint
- 适合脚本启动时做自检

参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| options.provider | string | 可选，只查看某个 provider |

返回值示例

```js
{
  defaultProvider: 'apple',
  defaultLang: 'zh-Hans',
  providers: [
    {
      provider: 'apple',
      alias: 'apple',
      aliases: ['apple', 'applevision', 'macos', 'macosvision'],
      isDefault: true,
      implemented: true,
      switchReady: true,
      defaultLang: 'ch',
      supportedLangs: ['ch', 'chinese_cht', 'en', 'ja', 'ko'],
      endpointRequired: false,
      endpointConfigured: true,
      available: true,
      recognitionLevelDefault: 'accurate'
    }
  ],
  providerCount: 1
}
```

示例

```js
const caps = await Vision.getCapabilities({ provider: 'apple' });
console.log(JSON.stringify(caps, null, 2));
```

## OCR：旧对象与当前可用范围

除了 Vision，当前项目还注入了 `OCR`：

## OCR.extractText(image, lang)

签名

```js
const text = await OCR.extractText(image, lang)
```

说明
- 基于本地 `tesseract` CLI
- 输入支持文件路径或 data URL
- 默认语言：`chi_sim+eng`
- 会尝试多组 PSM 与增强图像路径

示例

```js
const text = await OCR.extractText('./.runtime/examples/vision-input.png', 'chi_sim+eng');
console.log(text);
```

推荐使用策略
- 需要结构化 lines / bbox / provider 管理：用 Vision
- 只想快速本地抽纯文本：可用 OCR.extractText

## Vision / OCR：常见错误

**paddle 未配置 endpoint**

```text
PADDLE_OCR_ENDPOINT is required for paddle provider
```

**Apple Vision helper 未随程序打包**

```text
Apple Vision OCR is unavailable
```

从仓库根目录执行 `make build`（portable CLI）或
`./scripts/build_macos_app.sh`（App）后再运行；不要用未打包 helper 的临时 `go run` 作为 macOS OCR 发布方式。

**provider 未实现**

```text
ocr provider 'openai' is reserved but not implemented in current build
```

**provider 名不支持**

```text
unsupported ocr provider: xxx
```

**图片输入无效**
- imagePath 不存在
- base64 非法
- image 字段格式不对

## Vision / OCR：实战建议

**推荐流程：Geometry/UI 查找 -> 激活 -> 业务状态验证**

```js
const win = await window.getActiveWindow();
await UI.tapText('确定', {
  within: win,
  provider: 'apple',
  match: 'contains',
  minConfidence: 0.4,
});
await UI.waitText('操作成功', { within: win, timeout: 10000 });
```

**先检查能力再运行**

```js
const caps = await Vision.getCapabilities({ provider: 'apple' });
const provider = caps.providers[0];

if (!provider.implemented) {
  throw new Error('provider 未实现');
}

if (!provider.available) {
	throw new Error('Apple Vision helper 未就绪，请重新执行 macOS 构建');
}
```

## Vision / OCR：兼容说明

旧文档对视觉能力覆盖较弱。

当前项目中，Vision 是正式一等能力，且应优先纳入用户主文档，因为它直接影响：
- 基于截图找按钮
- 非 DOM 场景文本识别
- 桌面应用自动化可用性
