---
title: ImageColor API
description: 同尺寸图像差异、模板匹配、颜色判断、裁剪、缩放与图像辅助分析。
order: 10
---

# ImageColor

`ImageColor` 是 OpenDesk 的辅助视觉对象。

**状态：Secondary / Native**

推荐定位：

- `Vision`：优先处理 OCR、文本定位、结构化 UI 候选
- `ImageColor`：处理同尺寸图像差异、模板匹配、颜色、简单图像变换等像素级辅助任务

它适合作为 Vision 不够用时的补充，不建议单独承担复杂 GUI 语义识别。

## ImageColor：主要方法

| 方法 | 用途 |
| --- | --- |
| `ImageColor.findImage(source, template, options?)` | 找到单个最高置信度模板目标 |
| `ImageColor.findImages(source, template, options?)` | 找到多个去重后的同模板目标 |
| `ImageColor.findPos(source, template, threshold?)` | 兼容的旧单目标模板匹配入口 |
| `ImageColor.diff(actual, expected, options?)` | 确定性比较两张同尺寸图像 |
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

选择入口时先区分目标：

| 目标 | 方法 |
| --- | --- |
| 在一张大图中寻找最佳单个模板 | `findImage` |
| 在一张大图中寻找多个相同模板 | `findImages` |
| 保持旧脚本不变地寻找单个模板 | `findPos` |
| 比较两张同尺寸图像的原始像素差异 | `diff` |
| 比较两个颜色值 | `isColorSimilar` |
| 分析一张图像的区域和分隔线 | `analyzeLayout` |

## ImageColor.findImage(source, template, options?)

在静态 source 图片中寻找一个最可信的 template。两者都支持：

- 本地绝对路径或相对当前工作目录的文件路径
- `data:image/...;base64,...` data URL
- 不带 data URL 前缀的 raw base64 PNG/JPEG

路径会先被尝试打开，之后才会尝试 raw base64；不再用字符串长度猜测输入类型，所以超过 100 字符的合法路径不会被误判成 base64。

```js
const result = ImageColor.findImage(
  './.runtime/examples/screen.png',
  './templates/send-button.png',
  {
    threshold: 0.88,
    region: { x: 500, y: 300, width: 700, height: 500 },
    scales: [0.9, 1, 1.1]
  }
);
```

### Options

| 参数 | 类型与默认值 | 解决的需求 |
| --- | --- | --- |
| `threshold` | `0..1`，默认 `0.85` | 最低可信度。生产 matcher 的 `confidence` 固定为 `1 - RGB 三通道平均绝对误差 / 255`，取 template 中确定性分层选择的最多 64 个像素；`1` 为所有采样 RGB 像素完全相同。阈值比较包含边界。 |
| `region` | 可选 `{x,y,width,height}` | 真正缩小参与模板匹配的 ROI，减少计算量和其他位置的误匹配。四个字段必填、整数、宽高大于 0，且必须完全位于 source 内。 |
| `scales` | 可选 `number[]`，默认 `[1]` | 依次缩放 template 后匹配，用于 Retina、DPI 和 UI scale 差异。每项必须大于 0；不会默认扫描宽范围比例。 |

内部只计算 `region` 内的候选位置，但返回的 `x` / `y` 始终相对于完整 source，不是 ROI 局部坐标。缩放后的 `width` / `height` 和实际命中的 `scale` 一起回显。

### 返回值

```js
{
  found: true,
  x: 1124,
  y: 738,
  width: 82,
  height: 34,
  centerX: 1165,
  centerY: 755,
  confidence: 0.94,
  scale: 1
}
```

找不到阈值内的结果时，仍返回最佳候选的 `confidence`、`width`、`height`、`scale`，但 `found: false`，并且 `x`、`y`、`centerX`、`centerY` 都是 `-1`。

## ImageColor.findImages(source, template, options?)

参数继承 `findImage`，并增加 `maxResults`：

| 参数 | 类型与默认值 | 作用 |
| --- | --- | --- |
| `maxResults` | 大于 0 的整数，默认 `20` | 限制最多返回的已去重目标数量。 |

```js
const matches = ImageColor.findImages(source, './templates/delete.png', {
  threshold: 0.88,
  region: { x: 300, y: 100, width: 1000, height: 800 },
  scales: [0.9, 1, 1.1],
  maxResults: 20
});
```

返回 `OpenDeskFindImageResult[]`。内部顺序固定为：`confidence` 从高到低；同分时 `y` 从小到大、再 `x` 从小到大、最后 `scale` 从小到大。阈值候选会经过内部空间重叠去重（NMS）；该算法细节不是 V1 参数，因而同一真实控件附近不会暴露一组重叠候选。

## 静态图片边界与 activeWindow 组合

`findImage` / `findImages` 不接收 `window`、`windowTitle`、`windowId`、`pid` 或截图权限参数。ImageColor 只负责已有图片的像素分析，避免把窗口发现、窗口身份、截图、遮挡语义和跨显示器坐标耦合进模板匹配。

要在活动窗口内容中找图，先由 `Screen` 产生静态截图，再交给 ImageColor：

```js
const screenshot = await Screen.screenshot({
  target: 'activeWindow',
  returnType: 'base64'
});

const match = ImageColor.findImage(screenshot, './templates/send-button.png', {
  threshold: 0.88,
  region: { x: 500, y: 300, width: 700, height: 500 }
});
```

这只表示“捕获当前可见 activeWindow 后在该图片中匹配”；它不声明按 native window id 捕获被遮挡或最小化窗口内容。未来窗口能力仍应保持 `Window → Screen capture → ImageColor` 的分层。

## Matcher backend contract

Pure Go 是当前唯一生产 matcher，适用于正常构建和带 `opencv` build tag 的构建，保证上面的 confidence/threshold 语义相同。OpenCV 的历史 `TM_CCOEFF_NORMED` 实现保留为 tagged 的实验对照与 benchmark：它对亮度偏移的分数与纯 Go 不同，不能作为透明可替换 backend，也没有公开 `backend` / `opencvMethod` 参数。

可运行的确定性生产自检位于 [`examples/image-color/template-match.js`](../../examples/image-color/template-match.js)。从仓库根目录执行：

```bash
./opendesk -script examples/image-color/template-match.js
```

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

`findPos` 保留旧签名和旧返回形状。新代码使用相同的 canonical Pure Go 核心，但它不支持 `region`、`scales` 或 `maxResults`；需要这些能力时迁移到 `findImage` / `findImages`。

如果最佳匹配低于 threshold：

- `found: false`
- `x: -1`
- `y: -1`

**建议**

模板匹配对缩放、主题、字体、抗锯齿和分辨率变化敏感。重要动作应结合二次验证，不要只凭一次模板匹配直接执行高风险操作。

## ImageColor.diff(actualImage, expectedImage, options?)

对两张**同尺寸**图像逐像素比较。它是纯 Go、无 GUI、无网络、无 AI 模型依赖的确定性原语；不做缩放、裁剪、补边、对齐、几何配准、SSIM 或感知比较。

```js
const result = ImageColor.diff(
  './actual.png',
  './expected.png',
  {
    pixelThreshold: 8,
    maxDiffPixels: 20,
    maxDiffRatio: 0.001,
    includeAlpha: false,
    ignoreRegions: [
      { x: 10, y: 10, width: 120, height: 40 }
    ],
    outputPath: './.runtime/diff.png',
    includeDiffImage: false
  }
);
```

`actualImage` 和 `expectedImage` 使用与 `ImageColor.findImage` / `findImages` / `findPos` 相同的主要输入系统，支持：

- 本地绝对路径
- 相对于 OpenDesk 当前工作目录的本地路径
- `data:image/...;base64,...` data URL
- 不带 data URL 前缀的 base64 PNG/JPEG 字符串

V1 要求宽高完全相同。尺寸不同时直接报错，错误中同时包含 `actual=<width>x<height>` 和 `expected=<width>x<height>`；不会静默 resize、crop、stretch、pad 或 align。

### 最简用法

精确比较不需要传 options：

```js
const exact = ImageColor.diff(actual, expected);
if (!exact.matched) throw new Error(`changed pixels: ${exact.diffPixels}`);
```

对来自截图的输入，AI 通常只需先显式设置一个小的通道阈值，再根据业务需要决定是否增加允许差异量：

```js
const diff = ImageColor.diff(actual, expected, { pixelThreshold: 8 });
```

`pixelThreshold: 8` 是截图场景的起始建议，不是隐式默认值；默认仍是严格、可解释的 `0`。不要在没有基线数据时同时堆叠所有参数。

### Options

| 参数 | 类型与默认值 | 行为 |
| --- | --- | --- |
| `pixelThreshold` | `0..255` 整数，默认 `0` | RGB 中任一通道绝对差**大于**该值时记为差异像素；`includeAlpha: true` 时 Alpha 也参与。刚好等于阈值不计为差异。 |
| `maxDiffPixels` | 可选非负整数 | 允许的最大差异像素数。 |
| `maxDiffRatio` | 可选 `0..1` number | 允许的最大差异像素比例。 |
| `includeAlpha` | boolean，默认 `false` | 是否把 Alpha 作为第四个比较通道。 |
| `ignoreRegions` | 可选 `{x,y,width,height}[]` | 忽略的整数像素矩形。负 width/height 报错；零尺寸为空区域；部分越界会与图像求交；完全越界不影响结果。 |
| `outputPath` | 可选 string | 把差异图以 PNG 内容写入该路径；父目录不存在时自动创建。相对路径基于当前工作目录。 |
| `includeDiffImage` | boolean，默认 `false` | 为 `true` 时返回 PNG data URL。默认不返回，避免无意产生大体积 base64。 |

多个 `ignoreRegions` 先按像素取并集，因此交叠像素只计入一次 `ignoredPixels`。忽略像素不参与 `diffPixels`、`diffRatio`、`meanAbsoluteError`、`maxChannelDiff` 或 `changedBounds`。options 和矩形中的未知字段会报错，避免 AI 参数拼写错误后静默使用默认值。

### 返回结果

```js
{
  matched: false,
  width: 800,
  height: 600,
  totalPixels: 480000,
  comparedPixels: 475200,
  ignoredPixels: 4800,
  diffPixels: 37,
  diffRatio: 0.00007786195286195286,
  meanAbsoluteError: 0.013,
  maxChannelDiff: 64,
  changedBounds: { x: 210, y: 118, width: 32, height: 9 },
  pixelThreshold: 8,
  includeAlpha: false,
  diffPath: './.runtime/diff.png',
  diffImage: 'data:image/png;base64,...'
}
```

- `totalPixels = width * height`。
- `comparedPixels = totalPixels - ignoredPixels`。
- `diffRatio = diffPixels / comparedPixels`。
- `meanAbsoluteError` 是所有参与比较像素、所有参与通道的绝对差之和，除以 `comparedPixels * channelCount`；`channelCount` 为 3，或在 `includeAlpha: true` 时为 4。结果范围是 `0..255`，并且阈值内的通道差也进入该平均值。
- `maxChannelDiff` 是参与比较通道中的最大绝对差，范围 `0..255`。
- `changedBounds` 是所有差异像素的最小外接整数矩形；没有差异时为 `null`。
- `pixelThreshold` 和 `includeAlpha` 回显实际使用的关键比较设置，方便 AI 解释结果。
- 只有提供 `outputPath` 时才有 `diffPath`；只有 `includeDiffImage: true` 时才有 `diffImage`。

`matched` 的规则固定为：

- 两个 limit 都未提供：仅当 `diffPixels === 0` 才为 `true`。
- 只提供一个 limit：该条件满足时为 `true`。
- 同时提供两个 limit：`diffPixels <= maxDiffPixels` **且** `diffRatio <= maxDiffRatio` 时才为 `true`。

如果忽略区域覆盖整张图片，则 `comparedPixels=0`。此时 `diffPixels=0`、`diffRatio=0`、`meanAbsoluteError=0`、`maxChannelDiff=0`、`changedBounds=null`，且 `matched=true`。因此返回数值不会出现 `NaN` 或 `Infinity`。

### 差异图规则

差异图始终与输入同尺寸并编码为 PNG：

- 差异像素输出为不透明红色 `#ff0000`。
- 未变化像素输出为 actual 像素 RGB 三通道算术平均得到的不透明灰度。
- 忽略像素按未变化像素渲染，不会标成红色。

同一输入、options 和 Go 版本会按固定扫描与 PNG 编码规则生成相同结果；`outputPath` 与 `includeDiffImage` 同时使用时，两者来自同一份 PNG 字节。

最小可运行示例是 [`examples/image-color/diff.js`](../../examples/image-color/diff.js)。从仓库根目录执行：

```bash
./opendesk -script examples/image-color/diff.js
```

示例读取 `examples/image-color/fixtures/actual-rgb.png` 和 `expected.png` 两张小型确定性 PNG，自检精确结果，并把差异图写入 `.runtime/examples/image-color/diff.png`。所有版本化测试输入都保存在 `examples/image-color/fixtures/`；`.runtime/` 只保存本次运行产生的输出和日志。

### 操作前后比较

`diff` 可以比较动作前后的局部截图，但它本身不等待变化：

```js
const before = await page.screenshot({ clip: region });

// 执行动作

const after = await page.screenshot({ clip: region });

const diff = ImageColor.diff(before, after, {
  pixelThreshold: 8
});

if (diff.diffRatio < 0.002) {
  throw new Error('expected visual region to change');
}
```

这不是 `waitForVisualChange`：调用方负责截图时机、重试和业务结果验证。

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

这是低级像素判断；如果你真正想判断外部桌面中“按钮是否存在”，优先考虑 `UI.hasText()`、
`UI.findImage()` 或模板 + 业务状态验证。处理一张静态图片的原始文字时使用 `Vision.runOCR()`；
`Vision.detectUI()` 仅保留为 image-local 的兼容 helper。

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
| `options.separatorThresholdMode` | `adaptive` / `fixed` | 可选；默认 `adaptive`，根据当前区域候选 score 分布提高实际阈值；`fixed` 始终使用 `minSeparatorScore`，用于确定性基线或显式固定策略。 |
| `options.profile` | string | 可选；分析预设名称。 |
| `options.cellColorMode` | `mean` / `median` / `trimmed` / `dominant` | 可选；网格颜色统计方式。 |
| `options.boundarySpanWidth` | number | 可选；边界判断宽度。 |
| `options.separatorHints` | object | 可选；`vertical` / `horizontal` 各为 `{label?,from,to}[]`，用于提供分隔线提示。 |

返回 `Record<string, unknown>`；结果形状会随图像内容变化，调用方应检查字段存在性，不应把它当作稳定的 DOM 结构。

`debug.thresholds[]` 会按递归区域和方向记录 `mean`、`stdDev`、`percentile75`、`adaptiveThreshold` 与最终 `appliedThreshold`。即使选择 `fixed`，仍保留 adaptive 对照值，便于解释两种策略的差异。

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
