---
docType: reference
title: ImageColor API
description: 同尺寸图像差异、模板匹配、颜色判断、裁剪、缩放与图像辅助分析。
order: 120
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
| `ImageColor.toRGB(color)` | 六位 hex 转 RGB 字符串 |
| `ImageColor.toRGBA(color)` | 六位 hex 转 RGBA 字符串 |
| `ImageColor.toHSL(color)` | 六位 hex 转 HSL 字符串 |
| `ImageColor.toHSLA(color)` | 六位 hex 转 HSLA 字符串 |
| `ImageColor.isColorSimilar(target, gradient, tolerance?)` | 颜色相似判断 |
| `ImageColor.analyzeLayout(image, options?)` | 纯图像布局分析 |

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

`template` 也可以是非空的图片数组，用于同一控件的明确视觉状态，例如微信左侧“消息”按钮的
灰色未选中和绿色选中图。每张图分别匹配，返回全体中置信度最高的候选；置信度相同则按数组顺序
选择；后项只有置信度严格更高时才替换前项，不能因坐标更靠前或缩放比例更小而覆盖等分的前项。
单张模板内部的等分候选仍按 `y`、`x`、`scale` 从小到大选择。不要把两个状态拼进一张图片，
也不要仅为兼容状态变化而降低 `threshold`。

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
  scale: 1,
  templateIndex: 0
}
```

找不到阈值内的结果时，仍返回最佳候选的 `confidence`、`width`、`height`、`scale`，但 `found: false`，并且 `x`、`y`、`centerX`、`centerY` 都是 `-1`。
`templateIndex` 始终指向产生该最佳候选的输入模板；传单张图片时固定为 `0`。

### 视觉状态变体

为每一种**真实截图状态**各保存一张小而有辨识度的模板。模板应只包含图标及其稳定边缘，不要把
会变化的未读红点、日期、昵称或整行背景带进去。状态数组的每一项必须是**同一个控件**的另一个视觉状态：

| 控件 | `templateIndex: 0` | `templateIndex: 1` | 适用的单行 ROI（全窗口截图坐标） |
| --- | --- | --- | --- |
| 消息 | 灰色未选中 `wechat-message/unselected.png` | 绿色已选中 `wechat-message/selected.png` | `{ x: 0, y: 100, width: 60, height: 44 }` |
| 联系人 | 灰色未选中 `wechat-sidebar/contacts.png` | 绿色已选中 `wechat-contacts/selected.png` | `{ x: 0, y: 148, width: 60, height: 44 }` |

下面以“消息”按钮为例：

```js
const selectedPath = './examples/image-color/fixtures/wechat-message/selected.png';
const unselectedPath = './examples/image-color/fixtures/wechat-message/unselected.png';
// Both files must be cropped from their respective real WeChat screenshots.
const messageButtonStates = [unselectedPath, selectedPath];

const match = ImageColor.findImage(screenshot, messageButtonStates, {
  threshold: 0.95,
  region: { x: 0, y: 100, width: 60, height: 44 },
});

if (!match.found) throw new Error('消息按钮当前没有落在已知视觉状态中');
const state = match.templateIndex === 0 ? 'unselected' : 'selected';
```

业务上建议把“识别”与“动作”分开：默认先用状态数组分类，因为只查 `selected` 或只查 `unselected`
都无法区分“另一状态”“目标不存在”和“模板/环境漂移”。当操作的前置条件是未选中时，再单独查
未选中模板作为 action gate：

```js
const unselectedMatch = ImageColor.findImage(screenshot, unselectedPath, {
  threshold: 0.95,
  region: { x: 0, y: 100, width: 60, height: 44 },
});

const action = unselectedMatch.found ? 'tap-unselected' : 'do-not-tap';
```

这段单模板查找适合固定截图分析，或作为桌面点击前的安全条件；`found: false` 绝不等同于“已选中”。
实际桌面中的完整流程是先 `UI.findImage([unselected, selected])` 分类，只在未选中时
`UI.tapImage(unselected)`，并在新截图上再次分类验证已选中；不要把状态数组直接交给会改变 toggle
状态的 `UI.tapImage`。参见 [Desktop UI 的状态切换流程](desktop-ui.md)。

数组是“同一目标的状态备选”，不是多个不同按钮的泛搜索。下载截图中的灰色“消息”和绿色“联系人”
会同时出现，不能放进同一个数组；它们应分别用上表的两个状态数组和各自 ROI 调用。`findImages` 用于
查找多个相同的**单模板**目标；需要状态分类时使用 `findImage`。

固定 fixture 使用 `threshold: 1`，以验证裁剪和 matcher 的确定性。实际屏幕先用 `0.95` 起步，并在命中后
校验预期的 `templateIndex`、中心点和业务状态。对主题、DPI、缩放或抗锯齿变化，不要一味降低阈值：先缩小
`region`、显式给出已验证的 `scales`，并为每个真实环境采集同一控件的两态模板。当前消息 fixture 的灰/绿
图来自不同截图，适合状态数组契约验证；它们不能代替在你的生产微信版本/主题/DPI 中重新采集的模板。

## ImageColor.findImages(source, template, options?)

匹配选项沿用 [ImageColor.findImage](#imagecolorfindimagesource-template-options)。本方法只接受单个模板，并增加 `maxResults`。

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

示例直接读取版本化、可视化查看的
[`scene_color_blocks.png`](../../examples/image-color/fixtures/template-match/scene_color_blocks.png)
和 [`template_blue-panel.png`](../../examples/image-color/fixtures/template-match/template_blue-panel.png)，不在
`.runtime/` 中生成或依赖输入图片。它还逐项验证
[`wechat-panel.png`](../../examples/image-color/fixtures/wechat-panel.png) 中的已选中消息、联系人、收藏、视频号、
小程序、看一看、手机与设置菜单图标；每张模板均是原图裁剪，且每个不同按钮都使用自己的紧凑 ROI，
而非放入同一个状态数组。另有 `wechatStateEvidence` 用两张真实 source 分别验证“消息”和“联系人”的
有序 `[unselected, selected]` 状态数组：四个 case 均断言精确裁剪、完整图/ROI 一致、正确的
`templateIndex`（0 或 1）、相反状态在 `0.95` 下被拒绝，以及 ROI 搜索空间缩减；同时用未选中模板
单独搜索，验证它只会在未选中 case 打开 `tap-unselected` action gate，已选中 case 必须是 `no-op`。

要把微信 fixture 的 ROI 验收交给人工核对，请从仓库根目录运行真实 Custom UI：

```bash
./opendesk -ui -script examples/image-color/wechat-template-match-visual.js -console-mode script
```

窗口会重点显示“消息”按钮的两张 source、蓝色搜索 ROI、红色实际命中框、两个状态模板和
全图/ROI 匹配结果；必须同时验证未选中返回 `templateIndex: 0`、选中返回 `templateIndex: 1`，以及
未选中才开启 `tap-unselected` action gate、已选中为 `no-op`。红色框只表示目标标注，不代表失败。关闭
窗口后，任何失败判据会使脚本返回失败状态。

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

返回的 `x` / `y` 始终相对于完整输入图像，非 ROI 局部坐标；设置非零 `options.x` / `options.y`
只限制搜索区域，不会再次偏移返回坐标。ROI 截断色块时，宽高和面积只计算区域内的部分；
当前只保留匹配像素数大于 20 的连通色块。结果是数组，无命中返回 `[]`。

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

## ImageColor.findRedChannel(image, x, y, width?, height?)

在指定图像区域按列扫描，返回首个红通道大于 20 且非近灰色的像素颜色。

**签名**

```ts
ImageColor.findRedChannel(image: string, x: number, y: number, width?: number, height?: number): string;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `image` | string | 是 | 无 | 本地 PNG/JPEG 路径、PNG/JPEG data URL 或 raw base64；相对路径基于当前工作目录。 |
| `x` | number | 是 | 无 | 起始像素列；使用整数。 |
| `y` | number | 是 | 无 | 起始像素行；使用整数。 |
| `width` | number | 否 | 图像右边界减 x | 扫描宽度；使用整数。 |
| `height` | number | 否 | 图像下边界减 y | 扫描高度；使用整数。 |

**返回值**

同步返回小写 `#rrggbb` 字符串；无合格像素返回空字符串 `""`。不返回坐标或通道图像。

**行为与错误**

- 外层递增 x，内层递增 y；矩形右、下边界不包含在扫描范围内。
- 像素取 `RGBA()` 的高 8 位通道值。命中要求 `r > 20`，并且 RGB 三对通道差不全都小于 10；通道值恰为 20 不命中，差恰为 10 已不属于近灰色。该通道无需是最大通道。
- 透明图像使用预乘 Alpha 的 RGB，不单独筛选 Alpha；返回值不含 Alpha。
- 右、下越界部分停止扫描；起点位于右/下边界外、宽或高非正时返回空字符串。负起点不报参数错误，PNG/JPEG 边界外的采样不命中；建议传图像内坐标与正尺寸。极大整数没有额外溢出校验。
- 图像在扫描前解码，因此空区域也不会跳过输入错误。空输入、缺失/不可读文件、非法 base64、损坏或不支持的图像同步抛错；data URL 必须含 `;base64,` 和非空有效图像数据。不把错误转为空字符串。
- 不采集屏幕、不写文件、无网络或模型调用；本地路径会读取文件。无需桌面权限。

**示例**

从仓库根目录运行脚本，使用已有确定性 PNG fixture：

```js
const color = ImageColor.findRedChannel('examples/image-color/fixtures/expected.png', 0, 0);
console.log(color); // #rrggbb 或空字符串
```

## ImageColor.findGreenChannel(image, x, y, width?, height?)

在指定图像区域按列扫描，返回首个绿通道大于 20 且非近灰色的像素颜色。

**签名**

```ts
ImageColor.findGreenChannel(image: string, x: number, y: number, width?: number, height?: number): string;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `image` | string | 是 | 无 | 本地 PNG/JPEG 路径、PNG/JPEG data URL 或 raw base64；相对路径基于当前工作目录。 |
| `x` | number | 是 | 无 | 起始像素列；使用整数。 |
| `y` | number | 是 | 无 | 起始像素行；使用整数。 |
| `width` | number | 否 | 图像右边界减 x | 扫描宽度；使用整数。 |
| `height` | number | 否 | 图像下边界减 y | 扫描高度；使用整数。 |

**返回值**

同步返回小写 `#rrggbb` 字符串；无合格像素返回空字符串 `""`。不返回坐标或通道图像。

**行为与错误**

- 外层递增 x，内层递增 y；矩形右、下边界不包含在扫描范围内。
- 像素取 `RGBA()` 的高 8 位通道值。命中要求 `g > 20`，并且 RGB 三对通道差不全都小于 10；通道值恰为 20 不命中，差恰为 10 已不属于近灰色。该通道无需是最大通道。
- 透明图像使用预乘 Alpha 的 RGB，不单独筛选 Alpha；返回值不含 Alpha。
- 右、下越界部分停止扫描；起点位于右/下边界外、宽或高非正时返回空字符串。负起点不报参数错误，PNG/JPEG 边界外的采样不命中；建议传图像内坐标与正尺寸。极大整数没有额外溢出校验。
- 图像在扫描前解码，因此空区域也不会跳过输入错误。空输入、缺失/不可读文件、非法 base64、损坏或不支持的图像同步抛错；data URL 必须含 `;base64,` 和非空有效图像数据。不把错误转为空字符串。
- 不采集屏幕、不写文件、无网络或模型调用；本地路径会读取文件。无需桌面权限。

**示例**

从仓库根目录运行脚本，使用已有确定性 PNG fixture：

```js
const color = ImageColor.findGreenChannel('examples/image-color/fixtures/expected.png', 0, 0);
console.log(color); // #rrggbb 或空字符串
```

## ImageColor.findBlueChannel(image, x, y, width?, height?)

在指定图像区域按列扫描，返回首个蓝通道大于 20 且非近灰色的像素颜色。

**签名**

```ts
ImageColor.findBlueChannel(image: string, x: number, y: number, width?: number, height?: number): string;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `image` | string | 是 | 无 | 本地 PNG/JPEG 路径、PNG/JPEG data URL 或 raw base64；相对路径基于当前工作目录。 |
| `x` | number | 是 | 无 | 起始像素列；使用整数。 |
| `y` | number | 是 | 无 | 起始像素行；使用整数。 |
| `width` | number | 否 | 图像右边界减 x | 扫描宽度；使用整数。 |
| `height` | number | 否 | 图像下边界减 y | 扫描高度；使用整数。 |

**返回值**

同步返回小写 `#rrggbb` 字符串；无合格像素返回空字符串 `""`。不返回坐标或通道图像。

**行为与错误**

- 外层递增 x，内层递增 y；矩形右、下边界不包含在扫描范围内。
- 像素取 `RGBA()` 的高 8 位通道值。命中要求 `b > 20`，并且 RGB 三对通道差不全都小于 10；通道值恰为 20 不命中，差恰为 10 已不属于近灰色。该通道无需是最大通道。
- 透明图像使用预乘 Alpha 的 RGB，不单独筛选 Alpha；返回值不含 Alpha。
- 右、下越界部分停止扫描；起点位于右/下边界外、宽或高非正时返回空字符串。负起点不报参数错误，PNG/JPEG 边界外的采样不命中；建议传图像内坐标与正尺寸。极大整数没有额外溢出校验。
- 图像在扫描前解码，因此空区域也不会跳过输入错误。空输入、缺失/不可读文件、非法 base64、损坏或不支持的图像同步抛错；data URL 必须含 `;base64,` 和非空有效图像数据。不把错误转为空字符串。
- 不采集屏幕、不写文件、无网络或模型调用；本地路径会读取文件。无需桌面权限。

**示例**

从仓库根目录运行脚本，使用已有确定性 PNG fixture：

```js
const color = ImageColor.findBlueChannel('examples/image-color/fixtures/expected.png', 0, 0);
console.log(color); // #rrggbb 或空字符串
```

## ImageColor.toRGB(color)

将六位十六进制 RGB 颜色转换为 RGB 字符串。

**签名**

```ts
ImageColor.toRGB(color: string): string;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `color` | string | 是 | 无 | 六位 hex，允许一个前导 `#`，如 `#ff0000` 或 `FF0000`。 |

**返回值**

同步返回 `rgb(r,g,b)` 格式字符串，无空格。RGB 为 0..255 整数。

**行为与错误**

- 大小写 hex 均可；不修剪空白。不支持三位/八位 hex、颜色名称、`rgb()`、`rgba()`、`hsl()` 或 `hsla()` 输入，也不提供这些格式之间的通用互转。
- 去掉一个可选 `#` 后长度必须为 6，否则同步抛出含 `invalid hex color length` 的错误；长度为 6 但包含非 hex 字符时同步抛解析错误。失败不返回空字符串。
- 纯数据同步计算，不访问文件、屏幕、网络或模型，无桌面权限要求。

**示例**

在 OpenDesk Runtime 中运行，无外部输入前置条件：

```js
console.log(ImageColor.toRGB('#ff0000'));
// rgb(255,0,0)
```

## ImageColor.toRGBA(color)

将六位十六进制 RGB 颜色转换为 RGBA 字符串。

**签名**

```ts
ImageColor.toRGBA(color: string): string;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `color` | string | 是 | 无 | 六位 hex，允许一个前导 `#`，如 `#ff0000` 或 `FF0000`。 |

**返回值**

同步返回 `rgba(r,g,b,a)` 格式字符串，无空格。RGB 为 0..255 整数。 Alpha 固定为 `1.000000`，不读取输入 Alpha。

**行为与错误**

- 大小写 hex 均可；不修剪空白。不支持三位/八位 hex、颜色名称、`rgb()`、`rgba()`、`hsl()` 或 `hsla()` 输入，也不提供这些格式之间的通用互转。
- 去掉一个可选 `#` 后长度必须为 6，否则同步抛出含 `invalid hex color length` 的错误；长度为 6 但包含非 hex 字符时同步抛解析错误。失败不返回空字符串。
- 纯数据同步计算，不访问文件、屏幕、网络或模型，无桌面权限要求。

**示例**

在 OpenDesk Runtime 中运行，无外部输入前置条件：

```js
console.log(ImageColor.toRGBA('#ff0000'));
// rgba(255,0,0,1.000000)
```

## ImageColor.toHSL(color)

将六位十六进制 RGB 颜色转换为 HSL 字符串。

**签名**

```ts
ImageColor.toHSL(color: string): string;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `color` | string | 是 | 无 | 六位 hex，允许一个前导 `#`，如 `#ff0000` 或 `FF0000`。 |

**返回值**

同步返回 `hsl(h,s%,l%)` 格式字符串，无空格。H 为角度，通常在 0..360；S、L 为 0..100 百分数。灰色 H、S 为 0；黑色 L 为 0、白色 L 为 100。H/S/L 保留六位小数。

**行为与错误**

- 大小写 hex 均可；不修剪空白。不支持三位/八位 hex、颜色名称、`rgb()`、`rgba()`、`hsl()` 或 `hsla()` 输入，也不提供这些格式之间的通用互转。
- 去掉一个可选 `#` 后长度必须为 6，否则同步抛出含 `invalid hex color length` 的错误；长度为 6 但包含非 hex 字符时同步抛解析错误。失败不返回空字符串。
- 纯数据同步计算，不访问文件、屏幕、网络或模型，无桌面权限要求。

**示例**

在 OpenDesk Runtime 中运行，无外部输入前置条件：

```js
console.log(ImageColor.toHSL('#ff0000'));
// hsl(0.000000,100.000000%,50.000000%)
```

## ImageColor.toHSLA(color)

将六位十六进制 RGB 颜色转换为 HSLA 字符串。

**签名**

```ts
ImageColor.toHSLA(color: string): string;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `color` | string | 是 | 无 | 六位 hex，允许一个前导 `#`，如 `#ff0000` 或 `FF0000`。 |

**返回值**

同步返回 `hsla(h,s%,l%,a)` 格式字符串，无空格。H 为角度，通常在 0..360；S、L 为 0..100 百分数。灰色 H、S 为 0；黑色 L 为 0、白色 L 为 100。H/S/L 保留六位小数。 Alpha 固定为 `1.000000`，不读取输入 Alpha。

**行为与错误**

- 大小写 hex 均可；不修剪空白。不支持三位/八位 hex、颜色名称、`rgb()`、`rgba()`、`hsl()` 或 `hsla()` 输入，也不提供这些格式之间的通用互转。
- 去掉一个可选 `#` 后长度必须为 6，否则同步抛出含 `invalid hex color length` 的错误；长度为 6 但包含非 hex 字符时同步抛解析错误。失败不返回空字符串。
- 纯数据同步计算，不访问文件、屏幕、网络或模型，无桌面权限要求。

**示例**

在 OpenDesk Runtime 中运行，无外部输入前置条件：

```js
console.log(ImageColor.toHSLA('#ff0000'));
// hsla(0.000000,100.000000%,50.000000%,1.000000)
```

## ImageColor.isColorSimilar(target, gradient, tolerance)

比较两个六位 hex 颜色字符串，不接受渐变或颜色数组。

`tolerance` 省略、非正或大于 1 时使用 `0.85`；结果中的 `data` 为 `similarity >= tolerance`。无效颜色会抛错。

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
| `options.profile` | string | 可选兼容字段；当前通用布局核心忽略其值，不应用分析预设。非空（去掉首尾空白后）时在 `warnings` 中返回忽略提示。 |
| `options.cellColorMode` | `mean` / `median` / `trimmed` / `dominant` | 可选；网格颜色统计方式。 |
| `options.boundarySpanWidth` | number | 可选；边界判断宽度。 |
| `options.separatorHints` | object | 可选；`vertical` / `horizontal` 各为 `{label?,from,to}[]`，用于提供分隔线提示。 |

返回 `Record<string, unknown>`；结果形状会随图像内容变化，调用方应检查字段存在性，不应把它当作稳定的 DOM 结构。

`profile` 不改变网格、区域或分隔线结果；省略或传空白字符串时不产生该兼容 warning。
需要提供布局先验时，应显式传 `separatorHints`，不要依赖 `profile` 名称隐式加载配置。

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
