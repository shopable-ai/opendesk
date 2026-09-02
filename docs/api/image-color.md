---
title: ImageColor API
description: 模板匹配、颜色判断、裁剪、缩放与图像辅助分析。
order: 10
---

# ImageColor

`ImageColor` 是 OpenDesk 的辅助视觉对象。

**状态：Secondary / Native**

推荐定位：

- `Vision`：优先处理 OCR、文本定位、结构化 UI 候选
- `ImageColor`：处理模板匹配、颜色、简单图像变换等像素级辅助任务

它适合作为 Vision 不够用时的补充，不建议单独承担复杂 GUI 语义识别。

## ImageColor：主要方法

| 方法 | 用途 |
| --- | --- |
| `ImageColor.findPos(source, template, threshold?)` | 模板匹配 |
| `ImageColor.loadBase64(path)` | 图片文件转 PNG data URL |
| `ImageColor.resize(image, width, height)` | 缩放图片 |
| `ImageColor.clip(image, options?)` | 裁剪图片 |
| `ImageColor.pixel(image, x, y)` | 读取图像像素 |
| `ImageColor.findColor(image, color, options)` | 查找颜色 |
| `ImageColor.findColorBlocks(image, color, options)` | 查找同色块 |
| `ImageColor.hasColor(...)` | 区域是否包含颜色 |
| `ImageColor.isGray(...)` | 颜色/区域是否接近灰色 |
| `ImageColor.getSize(image)` | 获取宽高 |
| `ImageColor.save(image, path, format, quality)` | 保存图片 |
| `ImageColor.findRedChannel(image, x, y, width?, height?)` | 红色通道筛选 |
| `ImageColor.findGreenChannel(image, x, y, width?, height?)` | 绿色通道筛选 |
| `ImageColor.findBlueChannel(image, x, y, width?, height?)` | 蓝色通道筛选 |
| `ImageColor.toRGB / toRGBA / toHSL / toHSLA` | 颜色格式转换 |
| `ImageColor.isColorSimilar(target, gradient, tolerance?)` | 颜色相似判断 |

方法名是 Go 导出名映射到 JS 后的 lowerCamelCase 形式。

## ImageColor.findPos(source, template, threshold)

最常用的模板匹配入口。

```js
const result = ImageColor.findPos(
  './.runtime/examples/screen.png',
  './templates/send-button.png',
  0.85
);

console.log(result);
```

返回结构：

```js
{
  confidence: 0.93,
  width: 80,
  height: 32,
  x: 1200,
  y: 740,
  found: true
}
```

默认 threshold：`0.8`。

如果最佳匹配低于 threshold：

- `found: false`
- `x: -1`
- `y: -1`

**建议**

模板匹配对缩放、主题、字体、抗锯齿和分辨率变化敏感。重要动作应结合二次验证，不要只凭一次模板匹配直接执行高风险操作。

## ImageColor.loadBase64(path)

```js
const dataUrl = ImageColor.loadBase64('./.runtime/examples/screen.png');
```

返回 PNG data URL：

```text
data:image/png;base64,...
```

## ImageColor.resize(image, width, height)

```js
const resized = ImageColor.resize(image, 800, 600);
```

返回 PNG data URL。

`width`、`height` 必须 > 0。

## ImageColor.clip(image, options)

用于从 base64/data URL 图像中裁出区域。

```js
const clipped = ImageColor.clip(image, {
  x: 100,
  y: 100,
  width: 400,
  height: 300
});
```

`options` 可省略；省略时默认取整张图。当前实现会把越界尺寸收敛到图像范围内，但起点完全越界或最终宽高无效会报错。

## ImageColor.pixel(image, x, y)

```js
const color = ImageColor.pixel(base64Image, 20, 30);
console.log(color); // #rrggbb
```

坐标越界会报错。

## ImageColor.findColor(image, color, options)

```js
const raw = ImageColor.findColor(base64Image, '#ff0000', {
  x: 0,
  y: 0,
  width: 800,
  height: 600,
  threshold: 10
});

const result = JSON.parse(raw);
```

**重要：当前实现返回 JSON 字符串，而不是对象。**

这属于当前 API 的历史形态，调用时需要显式 `JSON.parse()`。

## ImageColor.findColorBlocks(image, color, options)

```js
const blocks = ImageColor.findColorBlocks(base64Image, '#ffffff', {
  x: 0,
  y: 0,
  width: 800,
  height: 600,
  threshold: 10
});
```

典型结果：

```js
[
  {
    x: 10,
    y: 20,
    width: 120,
    height: 32,
    area: 3840,
    shape: 'rectangle',
    match: 0.96
  }
]
```

## ImageColor.hasColor(...)

用于快速判断某区域是否包含目标颜色。

这是低级像素判断；如果你真正想判断“按钮是否存在”，优先考虑 `Vision.detectUI()` 或模板 + 验证组合。

## ImageColor.isGray(...)

可用于：

- 判断单个 `#RRGGBB` 是否近似灰色
- 判断图像区域是否主要为灰度颜色

threshold 控制 RGB 通道允许差异。

## ImageColor.getSize(image)

```js
const [width, height] = ImageColor.getSize('./.runtime/examples/screen.png');
```

读取失败时当前实现可能返回 `null`/空值，应做防御判断。

## ImageColor.save(image, path, format, quality)

支持当前实现里的 PNG / JPEG 保存。

```js
ImageColor.save(image, './.runtime/examples/out.jpg', 'jpg', 90);
```

## ImageColor：颜色通道与格式转换

`findRedChannel` / `findGreenChannel` / `findBlueChannel` 会在给定区域中寻找第一个明显的非灰度对应通道像素，适合做简单颜色信号判断。

颜色格式转换方法用于 RGB / RGBA / HSL / HSLA 之间转换；具体参数形态以当前源码和 `types/ImageColor.d.ts` 为辅助参考。

## ImageColor.isColorSimilar(target, gradient, tolerance)

用于比较目标色是否与给定渐变/颜色集合相似。

默认 tolerance 在未正确传值时会采用当前实现的默认值。

## ImageColor.analyzeLayout(image, options?)

对本地图像或 base64 图像做纯图像布局分析，返回区域、分隔线和层级信息。它不调用 OCR，也不操作桌面；需要文本语义时与 `Vision.runOCR()` 或 `Vision.detectUI()` 组合。

```js
const layout = ImageColor.analyzeLayout('./.runtime/examples/screen.png', {
  cellSize: 16,
  minRegionArea: 400,
  maxRegions: 24,
  cellColorMode: 'median',
});
console.log(layout);
```

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `image` | string | 必填；本地图像路径或支持的图像字符串。 |
| `options.cellSize` | number | 可选；用于初步量化的网格边长。 |
| `options.quantize` / `tolerance` | number | 可选；颜色量化和相似度阈值。 |
| `options.minRegionArea` / `maxRegions` | number | 可选；最小区域面积与最多返回区域数。 |
| `options.maxDepth` / `minSplitSpan` | number | 可选；区域递归深度与最小切分跨度。 |
| `options.minSeparatorScore` / `maxSeparatorCandidates` | number | 可选；分隔线筛选阈值与候选数。 |
| `options.minSeparatorSpanRatio` | number | 可选；候选在目标轴上的最小连续支撑覆盖率，范围 `0..1`，默认 `0.30`；设为 `0` 可关闭此过滤用于基线对照。 |
| `options.profile` | string | 可选；分析预设名称。 |
| `options.cellColorMode` | `mean` / `median` / `trimmed` / `dominant` | 可选；网格颜色统计方式。 |
| `options.boundarySpanWidth` | number | 可选；边界判断宽度。 |
| `options.separatorHints` | object | 可选；`vertical` / `horizontal` 各为 `{label?,from,to}[]`，用于提供分隔线提示。 |

返回 `Record<string, unknown>`；结果形状会随图像内容变化，调用方应检查字段存在性，不应把它当作稳定的 DOM 结构。

## ImageColor / Vision：推荐组合

```text
截图
→ Vision.detectUI / runOCR
→ 如果语义定位不足
→ ImageColor 模板/颜色辅助
→ mouse 执行动作
→ 再截图 / OCR 验证结果
```

这比“只按固定坐标点击”更适合可验证的桌面自动化。
