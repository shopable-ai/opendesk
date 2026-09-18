---
docType: index
---

# 图像、OCR 与显示器

已有图片分析、OCR、颜色、屏幕和录屏

从 [Agent 短入口](README.md) 按任务进入本组；不顺序通读其他组。下表由唯一 Reference/类型确定性生成，不是另一份行为合同。

`node scripts/api-docs.js read <文档名> <方法名>` 返回正文及必要共享段；只读文档，不调用方法。类型中的公开声明不等于当前宿主已授权/已实现。摘要中的省略不用于执行决策。


## Vision

状态、前置权限、平台、错误/等待/取消与副作用按选中正文核对。

来源：[vision.md](../vision.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `OCR.extractText(image: string, lang?: string): string;` | 使用本地 Tesseract 抽取纯文本。 | 观察/查询；可能读取敏感数据，不等于业务完成；Secondary | [OCR.extractText](../vision.md#ocrextracttextimage-lang)；`read vision OCR.extractText` |
| `Vision.analyzeLayout(options: OpenDeskVisionOptions & { image: string \| OpenDeskByteInput \| OpenDeskVisionImageSource }): Record<string, unknown>;` | 分析图像区域与分隔线。 | 观察/查询；可能读取敏感数据，不等于业务完成；Stable | [Vision.analyzeLayout](../vision.md#visionanalyzelayoutoptions)；`read vision Vision.analyzeLayout` |
| `Vision.annotateRegions(options: OpenDeskVisionOptions & { image: string \| OpenDeskByteInput \| OpenDeskVisionImageSource; regions?: unknown[]; separators?: unknown[] }): Record<string, unknown>;` | 输出带区域/分隔线标注的 PNG。 | 依选项：采集/生成文件或资源；Stable | [Vision.annotateRegions](../vision.md#visionannotateregionsoptions)；`read vision Vision.annotateRegions` |
| `Vision.detectUI(options: OpenDeskVisionOptions): OpenDeskVisionDetectUIResult;` | 兼容的 OCR text-center helper。 | 观察/查询；可能读取敏感数据，不等于业务完成；Deprecated | [Vision.detectUI](../vision.md#visiondetectuioptions)；`read vision Vision.detectUI` |
| `Vision.getCapabilities(options?: Pick<OpenDeskVisionOptions, "provider" \| "providerName">): OpenDeskVisionCapabilities;` | 查询 provider 能力与默认值。 | 观察/查询；可能读取敏感数据，不等于业务完成；Stable | [Vision.getCapabilities](../vision.md#visiongetcapabilitiesoptions)；`read vision Vision.getCapabilities` |
| `Vision.runOCR(options: OpenDeskVisionOptions): OpenDeskVisionOCRResult;` | 对图片执行 OCR。 | 需核对正文；不能假定无副作用；Stable | [Vision.runOCR](../vision.md#visionrunocroptions)；`read vision Vision.runOCR` |


## ImageColor

状态、前置权限、平台、错误/等待/取消与副作用按选中正文核对。

来源：[image-color.md](../image-color.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `ImageColor.analyzeLayout(image: string, options?: OpenDeskLayoutAnalyzeOptions): Record<string, unknown>;` | 对本地图像或 base64 图像做纯图像布局分析，返回区域、分隔线和层级信息。它不调用 OCR，也不操作桌面；需要文本语义时与 `Vision.runOCR()` 或 `…（摘要） | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [ImageColor.analyzeLayout](../image-color.md#imagecoloranalyzelayoutimage-options)；`read image-color ImageColor.analyzeLayout` |
| `ImageColor.clip(image: string, options?: OpenDeskImageCropOptions): string;` | 裁剪图片 | 依选项：采集/生成文件或资源；继承本节限制 | [ImageColor.clip](../image-color.md#imagecolorclipimage-options)；`read image-color ImageColor.clip` |
| `ImageColor.diff(actualImage: string, expectedImage: string, options?: OpenDeskImageDiffOptions): OpenDeskImageDiffResult;` | 确定性比较两张同尺寸图像 | 需核对正文；不能假定无副作用；继承本节限制 | [ImageColor.diff](../image-color.md#imagecolordiffactualimage-expectedimage-options)；`read image-color ImageColor.diff` |
| `ImageColor.findBlueChannel(image: string, x: number, y: number, width?: number, height?: number): string;` | 蓝色通道筛选 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [ImageColor.findBlueChannel](../image-color.md)；`read image-color ImageColor.findBlueChannel` **正文缺口：禁止据类型直接生成调用** |
| `ImageColor.findColor(image: string, color: string, options?: OpenDeskFindColorOptions): string;` | 查找颜色 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [ImageColor.findColor](../image-color.md#imagecolorfindcolorimage-color-options)；`read image-color ImageColor.findColor` |
| `ImageColor.findColorBlocks(image: string, color: string, options?: OpenDeskFindColorOptions): OpenDeskColorBlock[];` | 查找同色块 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [ImageColor.findColorBlocks](../image-color.md#imagecolorfindcolorblocksimage-color-options)；`read image-color ImageColor.findColorBlocks` |
| `ImageColor.findGreenChannel(image: string, x: number, y: number, width?: number, height?: number): string;` | 绿色通道筛选 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [ImageColor.findGreenChannel](../image-color.md)；`read image-color ImageColor.findGreenChannel` **正文缺口：禁止据类型直接生成调用** |
| `ImageColor.findImage(sourceImage: string, templateImage: OpenDeskImageTemplate, options?: OpenDeskFindImageOptions): OpenDeskFindImageResult;` | 找到单个最高置信度模板目标 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [ImageColor.findImage](../image-color.md#imagecolorfindimagesource-template-options)；`read image-color ImageColor.findImage` |
| `ImageColor.findImages(sourceImage: string, templateImage: string, options?: OpenDeskFindImagesOptions): OpenDeskFindImageResult[];` | 找到多个去重后的同模板目标 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [ImageColor.findImages](../image-color.md#imagecolorfindimagessource-template-options)；`read image-color ImageColor.findImages` |
| `ImageColor.findPos(sourceImage: string, templateImage: string, threshold?: number): OpenDeskTemplateMatchResult;` | 兼容的旧单目标模板匹配入口 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [ImageColor.findPos](../image-color.md#imagecolorfindpossource-template-threshold)；`read image-color ImageColor.findPos` |
| `ImageColor.findRedChannel(image: string, x: number, y: number, width?: number, height?: number): string;` | 红色通道筛选 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [ImageColor.findRedChannel](../image-color.md)；`read image-color ImageColor.findRedChannel` **正文缺口：禁止据类型直接生成调用** |
| `ImageColor.getSize(image: string): [number, number] \| null;` | 获取宽高 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [ImageColor.getSize](../image-color.md#imagecolorgetsizeimage)；`read image-color ImageColor.getSize` |
| `ImageColor.hasColor(image: string, color: string, x: number, y: number, width?: number, height?: number, threshold?: number): boolean;` | 区域是否包含颜色 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [ImageColor.hasColor](../image-color.md#imagecolorhascolor)；`read image-color ImageColor.hasColor` |
| `ImageColor.isColorSimilar(targetColor: string, compareColor: string, tolerance?: number): OpenDeskColorSimilarityResult;` | 颜色相似判断 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [ImageColor.isColorSimilar](../image-color.md#imagecoloriscolorsimilartarget-gradient-tolerance)；`read image-color ImageColor.isColorSimilar` |
| `ImageColor.isGray(imageOrColor: string, x?: number, y?: number, width?: number, height?: number, threshold?: number): boolean;` | 颜色/区域是否接近灰色 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [ImageColor.isGray](../image-color.md#imagecolorisgray)；`read image-color ImageColor.isGray` |
| `ImageColor.loadBase64(path: string): string;` | 图片文件转 PNG data URL | 需核对正文；不能假定无副作用；继承本节限制 | [ImageColor.loadBase64](../image-color.md#imagecolorloadbase64path)；`read image-color ImageColor.loadBase64` |
| `ImageColor.pixel(image: string, x: number, y: number): string;` | 读取图像像素 | 需核对正文；不能假定无副作用；继承本节限制 | [ImageColor.pixel](../image-color.md#imagecolorpixelimage-x-y)；`read image-color ImageColor.pixel` |
| `ImageColor.resize(image: string, width: number, height: number): string;` | 缩放图片 | 依选项：采集/生成文件或资源；继承本节限制 | [ImageColor.resize](../image-color.md#imagecolorresizeimage-width-height)；`read image-color ImageColor.resize` |
| `ImageColor.save(image: string, path: string, format?: "png" \| "jpeg" \| "jpg" \| string, quality?: number): boolean;` | 保存图片 | 依选项：采集/生成文件或资源；继承本节限制 | [ImageColor.save](../image-color.md#imagecolorsaveimage-path-format-quality)；`read image-color ImageColor.save` |
| `ImageColor.toHSL(color: string): string;` | ImageColor.toHSL；所属能力：ImageColor | 需核对正文；不能假定无副作用；继承本节限制 | [ImageColor.toHSL](../image-color.md)；`read image-color ImageColor.toHSL` **正文缺口：禁止据类型直接生成调用** |
| `ImageColor.toHSLA(color: string): string;` | ImageColor.toHSLA；所属能力：ImageColor | 需核对正文；不能假定无副作用；继承本节限制 | [ImageColor.toHSLA](../image-color.md)；`read image-color ImageColor.toHSLA` **正文缺口：禁止据类型直接生成调用** |
| `ImageColor.toRGB(color: string): string;` | 颜色格式转换 | 需核对正文；不能假定无副作用；继承本节限制 | [ImageColor.toRGB](../image-color.md)；`read image-color ImageColor.toRGB` **正文缺口：禁止据类型直接生成调用** |
| `ImageColor.toRGBA(color: string): string;` | ImageColor.toRGBA；所属能力：ImageColor | 需核对正文；不能假定无副作用；继承本节限制 | [ImageColor.toRGBA](../image-color.md)；`read image-color ImageColor.toRGBA` **正文缺口：禁止据类型直接生成调用** |


## Screen

状态、前置权限、平台、错误/等待/取消与副作用按选中正文核对。

来源：[screen.md](../screen.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `Screen.getCaptureCapabilities(): OpenDeskScreenCaptureCapabilities;` | 查询 selector/recording/frameStream 能力。 | 观察/查询；可能读取敏感数据，不等于业务完成；Stable | [Screen.getCaptureCapabilities](../screen.md#screengetcapturecapabilities)；`read screen Screen.getCaptureCapabilities` |
| `Screen.getDisplay(index: number): OpenDeskDisplayInfo \| null;` | 按 1-based index 返回显示器。 | 观察/查询；可能读取敏感数据，不等于业务完成；Stable | [Screen.getDisplay](../screen.md#screengetdisplayindex)；`read screen Screen.getDisplay` |
| `Screen.getDisplayCapabilities(): OpenDeskDisplayControlCapabilities;` | 查询 display identity/mode/brightness 能力。 | 观察/查询；可能读取敏感数据，不等于业务完成；Stable | [Screen.getDisplayCapabilities](../screen.md#screengetdisplaycapabilities)；`read screen Screen.getDisplayCapabilities` |
| `Screen.getDisplayMode(displayId: string): OpenDeskDisplayMode;` | 读取当前 display mode。 | 观察/查询；可能读取敏感数据，不等于业务完成；Stable/平台限定 | [Screen.getDisplayMode](../screen.md#screengetdisplaymodedisplayid)；`read screen Screen.getDisplayMode` |
| `Screen.getDisplays(): OpenDeskDisplayInfo[];` | 列出所有显示器。 | 观察/查询；可能读取敏感数据，不等于业务完成；Stable | [Screen.getDisplays](../screen.md#screengetdisplays)；`read screen Screen.getDisplays` |
| `Screen.getHeight(): number;` | 主显示器高度。 | 观察/查询；可能读取敏感数据，不等于业务完成；Stable | [Screen.getHeight](../screen.md#screengetheight)；`read screen Screen.getHeight` |
| `Screen.getPrimaryDisplay(): OpenDeskDisplayInfo \| null;` | 返回主显示器。 | 观察/查询；可能读取敏感数据，不等于业务完成；Stable | [Screen.getPrimaryDisplay](../screen.md#screengetprimarydisplay)；`read screen Screen.getPrimaryDisplay` |
| `Screen.getVirtualBounds(): OpenDeskScreenClip;` | 返回虚拟桌面边界。 | 观察/查询；可能读取敏感数据，不等于业务完成；Stable | [Screen.getVirtualBounds](../screen.md#screengetvirtualbounds)；`read screen Screen.getVirtualBounds` |
| `Screen.getWidth(): number;` | 主显示器宽度。 | 观察/查询；可能读取敏感数据，不等于业务完成；Stable | [Screen.getWidth](../screen.md#screengetwidth)；`read screen Screen.getWidth` |
| `Screen.listDisplayModes(displayId: string): OpenDeskDisplayMode[];` | 枚举可用 display modes。 | 观察/查询；可能读取敏感数据，不等于业务完成；Stable/平台限定 | [Screen.listDisplayModes](../screen.md#screenlistdisplaymodesdisplayid)；`read screen Screen.listDisplayModes` |
| `Screen.pixel(x: number, y: number): string;` | 读取单个屏幕像素。 | 需核对正文；不能假定无副作用；Stable | [Screen.pixel](../screen.md#screenpixelx-y)；`read screen Screen.pixel` |
| `Screen.pixels(points: (OpenDeskPoint \| [number, number])[], scaled?: boolean): string[];` | 批量读取屏幕像素。 | 需核对正文；不能假定无副作用；Stable | [Screen.pixels](../screen.md#screenpixelspoints-scaled)；`read screen Screen.pixels` |
| `Screen.screenshot(options?: OpenDeskPageScreenshotOptions): Promise<string \| ArrayBuffer \| OpenDeskScreenshotResult \| null>;` | `page.screenshot()` 的 alias。 | 依选项：采集/生成文件或资源；Alias | [Screen.screenshot](../screen.md#screenscreenshotoptions)；`read screen Screen.screenshot` |
| `Screen.selectRegion(options?: OpenDeskRegionSelectorOptions): Promise<OpenDeskSelectedRegion>;` | 原生选择一个显示器内的区域。 | 需核对正文；不能假定无副作用；Experimental | [Screen.selectRegion](../screen.md#screenselectregionoptions)；`read screen Screen.selectRegion` |
| `Screen.setDisplayMode(displayId: string, modeId: string): OpenDeskDisplayModeChangeResult;` | 设置并 readback 验证 display mode。 | 需核对正文；不能假定无副作用；Experimental | [Screen.setDisplayMode](../screen.md#screensetdisplaymodedisplayid-modeid)；`read screen Screen.setDisplayMode` |
| `Screen.startRecording(options: OpenDeskScreenRecordingOptions): Promise<OpenDeskScreenRecording>;` | 录制显示器/区域到 `.mov`。 | 依选项：采集/生成文件或资源；Experimental | [Screen.startRecording](../screen.md#screenstartrecordingoptions)；`read screen Screen.startRecording` |


## 生成依据

维护命令：`node scripts/api-docs.js generate`；校验：`node scripts/api-docs.js check`。不能手工改本表；修改 canonical 正文/类型后重生成。下面是内容版本，不把旧行号当成当前定位。


- `docs/api/vision.md` SHA-256 `5a880ab71d2e5a76200562e6bec7cb6a5dc577f62bf15f6d4b60772294b3b9a7`

- `types/Vision.d.ts` SHA-256 `b218b4064c58f284a6f4dca16cd121689eda483a633380fb5e87e860dad53031`

- `docs/api/image-color.md` SHA-256 `c42c2124f44ea1b9eafb5c45308c96d7f69ac074b0926f30217e49c7f9bce632`

- `types/ImageColor.d.ts` SHA-256 `976a097d32ba73371f5e4e3fd87b36577129d574f5f62319c5c6df917d3459f1`

- `docs/api/screen.md` SHA-256 `fd86be0f53cad025c4c9c4bba250220e22f0374e185c0385445b09b255d8cbde`

- `types/Screen.d.ts` SHA-256 `1ba0f1bee4d46d723c0bd0efd501ad044900d0f909347a640c118fa3dcc945eb`
