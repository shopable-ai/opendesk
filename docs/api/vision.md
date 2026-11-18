---
docType: reference
title: Vision API
description: OCR、UI 文本检测、provider capabilities、布局分析与旧 OCR 对象。
order: 110
---

# Vision

`Vision` 提供底层 OCR、provider capability 和图像布局分析。需要直接操作桌面文本时优先使用 [`UI`](desktop-ui.md)，因为 `UI` 的 Perception Resolver 会处理 scope、歧义、候选融合与 image-pixel → screen-logical 投影。Native OCR（包括 Apple Vision）是该 Resolver 的一个只读 observation source；普通 Recipe 不需要、也不应选择 OCR provider。

同页记录 secondary `OCR.extractText()`，它是独立的本地 Tesseract 纯文本兼容入口。

本页方法均同步执行，直接返回结果；失败同步抛错，不返回 Promise。OCR 计算和 provider 请求会阻塞当前调用直到完成或报错。

## API 一览

| 方法 | 状态 | 用途 |
| --- | --- | --- |
| `Vision.runOCR(options)` | Stable | 对图片执行 OCR。 |
| `Vision.detectUI(options)` | Deprecated | 兼容的 OCR text-center helper。 |
| `Vision.getCapabilities(options?)` | Stable | 查询 provider 能力与默认值。 |
| `Vision.analyzeLayout(options)` | Stable | 分析图像区域与分隔线。 |
| `Vision.annotateRegions(options)` | Stable | 输出带区域/分隔线标注的 PNG。 |
| `OCR.extractText(image, lang?)` | Secondary | 使用本地 Tesseract 抽取纯文本。 |

## 公共约定

### 图像输入

OCR 输入可通过 `image`、`imageBase64` 或 `imagePath` 提供。路径相对当前 execution 工作目录解析；无效路径/base64/类型会明确失败。

### OCR provider

| provider | 状态 | 说明 |
| --- | --- | --- |
| `apple` / `applevision` | macOS implemented | Apple Vision，默认 `accurate`，macOS 12+。 |
| `paddle` / `paddleocr` | Implemented | 需要 `PADDLE_OCR_ENDPOINT`。 |
| `local` / `tesseract` | Implemented | 本地 OCR。 |
| `openai` | Reserved | 当前未实现。 |
| `azure` | Reserved | 当前未实现。 |
| `google` | Reserved | 当前未实现。 |
| `aws` | Reserved | 当前未实现。 |

macOS 默认 provider 为环境配置值或 `apple`；其他平台为环境配置值或 `paddle`。默认语言来自 `VISION_OCR_LANG`，否则使用 Runtime 默认值。

Apple helper 缺失、扩展发现/协议失败、无执行权限、provider timeout、崩溃、语言不支持或无效响应都是 provider/backend failure，不是“目标文字不存在”。只有 OCR 调用成功完成且返回零候选，才是该次 local observation 的 no-match。`Vision.runOCR()` 仍是需要显式图片或低层诊断时的 canonical OCR API；高层 `UI.tapText()` / `UI.tapTexts()` 不把 provider chain 暴露给 Recipe。

### OCR 坐标

`Vision.runOCR()` / `Vision.detectUI()` 返回的 bbox 是输入图片的 image-pixel 坐标，不是可直接传给 `mouse` 的 screen logical coordinate。需要点击外部桌面目标时使用 `UI.findText()` / `UI.tapText()`。

## Vision.runOCR(options)

对图片执行 OCR，并返回全文与逐行结构。

**签名**
```ts
Vision.runOCR(options: OpenDeskVisionOptions): OpenDeskVisionOCRResult;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options.image` | bytes | 条件 | 未设置 | 图片字节输入。 |
| `options.imageBase64` | `string` | 条件 | 未设置 | base64 图片输入。 |
| `options.imagePath` | `string` | 条件 | 未设置 | 图片文件路径。 |
| `options.provider` | `string` | 否 | 平台默认 | OCR provider。 |
| `options.lang` | `string` | 否 | Runtime 默认 | OCR 语言。 |
| `options.recognitionLevel` | `'accurate' \| 'fast'` | 否 | `'accurate'` | Apple Vision recognition level。 |
| `options.timeoutMs` | `number` | 否 | `12000` | 超时毫秒。 |
| `options.detectOrientation` | `boolean` | 否 | `true` | 是否检测方向。 |
| `options.recognizeDirection` | `boolean` | 否 | `true` | 是否识别方向。 |
| `options.includeRaw` | `boolean` | 否 | `false` | 是否附带 provider 原始响应。 |

**返回值**

`OpenDeskVisionOCRResult`，包含 `provider`、`lang`、`text`、`lines[]`、`lineCount`，以及可选 `raw`。每个 line 包含 `text`、`confidence` 与 image-pixel `bbox`。

**行为与错误**

必须提供一种有效图像输入。provider 未实现、未配置、不可用、图片无效或 timeout 时同步抛错；不会把 reserved provider 静默替换成其他 provider。

**示例**
```js
const imagePath = await page.screenshot({
  target: 'activeWindow',
  path: './.runtime/examples/vision-input.png',
  returnType: 'path',
});
const result = Vision.runOCR({ imagePath, provider: 'apple', lang: 'ch' });
console.log(result.text);
```

## Vision.detectUI(options)

兼容保留的 OCR 文本候选 helper。

**签名**
```ts
Vision.detectUI(options: OpenDeskVisionOptions): OpenDeskVisionDetectUIResult;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options.image` | bytes | 条件 | 未设置 | 图片输入。 |
| `options.imageBase64` | `string` | 条件 | 未设置 | base64 图片输入。 |
| `options.imagePath` | `string` | 条件 | 未设置 | 图片路径。 |
| `options.provider` | `string` | 否 | 平台默认 | OCR provider。 |
| `options.lang` | `string` | 否 | Runtime 默认 | OCR 语言。 |
| `options.targetText` | `string` | 否 | `''` | 目标文本。 |
| `options.matchMode` | `string` | 否 | `'contains'` | 文本比较模式。 |
| `options.minConfidence` | `number` | 否 | `0` | 最低置信度。 |
| `options.defaultRole` | `string` | 否 | `'text'` | 无法推断 role 时的兼容值。 |

**返回值**

包含 `provider`、`lang`、`text`、`count` 与 `elements[]`；元素 bbox/clickPoint 均为 image-local 坐标。

**行为与错误**

**Deprecated**。每条 OCR line 参与过滤；空文本和低置信度项跳过。不要把 `elements[0].clickPoint` 直接交给全局 mouse。

**示例**
```js
const result = Vision.detectUI({ imagePath, targetText: '登录', matchMode: 'contains' });
console.log(result.elements);
```

## Vision.getCapabilities(options?)

查询 OCR provider、默认语言和可用状态。

**签名**
```ts
Vision.getCapabilities(options?: Pick<OpenDeskVisionOptions, "provider" | "providerName">): OpenDeskVisionCapabilities;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options.provider` | `string` | 否 | 未设置 | 只查看指定 provider。 |
| `options.providerName` | `string` | 否 | 未设置 | `provider` 的兼容字段。 |

**返回值**

`OpenDeskVisionCapabilities`，包含 `defaultProvider`、`defaultLang`、`providers` 与 `providerCount`。

**行为与错误**

只读取 capability，不执行 OCR。provider capability 可区分 `implemented`、`available`、endpoint 配置等状态。

**示例**
```js
const caps = Vision.getCapabilities({ provider: 'apple' });
console.log(caps.providers[0]);
```

## Vision.analyzeLayout(options)

分析一张图像中的通用区域与分隔线结构。

**签名**
```ts
Vision.analyzeLayout(options: OpenDeskVisionOptions & {
  image: string | OpenDeskByteInput | OpenDeskVisionImageSource;
}): Record<string, unknown>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options.image` | `string \| OpenDeskByteInput \| OpenDeskVisionImageSource` | 是 | 无 | Runtime 支持的图像输入。 |
| `options` | `OpenDeskVisionOptions` | 是 | 无 | 布局参数见 [`ImageColor.analyzeLayout()`](image-color.md#imagecoloranalyzelayoutimage-options)；不需要 OCR provider。 |

**返回值**

`Record<string, unknown>`，包含图像宽高、`regions` 与 `separators` 等布局信息。

**行为与错误**

不依赖 OCR provider，不产生桌面输入。图像解码失败、无效尺寸或分析网格过小时同步抛错。

布局选项沿用兼容容错解析：未知字段忽略，数值字段可能先转换再取下限或夹取到范围，未识别的枚举值保留默认值；并非所有无效选项都会抛错。需要严格校验时，调用方应先校验选项，不能用本方法充当 options schema 验证器。

**示例**
```js
const layout = Vision.analyzeLayout({ image });
console.log(layout.regions, layout.separators);
```

## Vision.annotateRegions(options)

将区域/分隔线标注到图像并返回或保存 PNG。

**签名**
```ts
Vision.annotateRegions(options: OpenDeskVisionOptions & {
  image: string | OpenDeskByteInput | OpenDeskVisionImageSource;
  regions?: unknown[];
  separators?: unknown[] | { vertical?: unknown[]; horizontal?: unknown[] };
}): Record<string, unknown>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options.image` | `string \| OpenDeskByteInput \| OpenDeskVisionImageSource` | 是 | 无 | 输入图像。 |
| `options.regions` | `array` | 否 | 未设置 | 要标注的区域。 |
| `options.separators` | `array \| { vertical?: array; horizontal?: array }` | 否 | 未设置 | 要标注的分隔线；可直接使用布局结果的分组对象。 |
| `options.outputPath` | `string` | 否 | 未设置 | 可选输出路径。 |

**返回值**

`Record<string, unknown>`，包含 `width`、`height`、区域 `count` 与 PNG data URL `image`；写入文件时还包含绝对 `outputPath`。

**行为与错误**

不依赖 OCR provider。图像解码、PNG 编码、输出路径解析或文件写入失败时同步抛错；不会严格拒绝所有无效标注。

`regions` 未提供或为 `null` 时按空集合处理；非数组值同步抛错。数组内非对象项、解析后 `bbox.width` 或 `bbox.height` 不大于 0 的项会被跳过，坐标字段沿用兼容转换。分隔线解析也会忽略无法解析的形状或项，例如非对象项或位置解析后为负数的项。

当解析后的 regions 和 separators 都为空时，会自动调用布局分析再标注；显式传入空集合或所有项都被丢弃也触发此行为，不能用空集合保证不绘制自动布局。`separators` 的分组对象是当前 Runtime 兼容形式，现有 `types/Vision.d.ts` 的数组声明尚未覆盖它。

**示例**
```js
const annotated = Vision.annotateRegions({
  image,
  regions: layout.regions,
  separators: layout.separators,
});
```

**Secondary OCR API**

## OCR.extractText(image, lang?)

使用本地 Tesseract CLI 抽取纯文本。

**签名**
```ts
OCR.extractText(image: string, lang?: string): string;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `image` | `string` | 是 | 无 | 文件路径或 data URL。 |
| `lang` | `string` | 否 | `'chi_sim+eng'` | Tesseract 语言。 |

**返回值**

`string`，同步返回抽取的纯文本。

**行为与错误**

依赖本地 Tesseract；不可用、图片无效或 OCR 失败时同步抛错。需要结构化 lines/bbox/provider 管理时使用 `Vision.runOCR()`。

**示例**
```js
const text = OCR.extractText('./.runtime/examples/vision-input.png', 'chi_sim+eng');
console.log(text);
```

## 错误

常见失败包括 provider 未实现/未配置、Apple Vision 不可用、Tesseract 不可用和图片输入无效。调用方应依据结构化错误或 capability 判断，不通过 OCR 文本内容推断 backend 是否可用。

## 平台与能力

Apple Vision 仅在受支持的 macOS 构建中可用；Paddle 需要 endpoint；Tesseract 依赖本地 CLI。实际可用性始终以 `Vision.getCapabilities()` 为准。
