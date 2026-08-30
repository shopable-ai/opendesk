# 媒体传输优化设计

更新时间：2026-03-16

## 1. 背景

当前 runtime 与 HTTP 接口里，图片相关能力大量允许或直接返回 base64：

- `page.screenshot()` / `Screen.screenshot()` 默认返回 `data:image/png;base64,...`
- `Vision.runOCR()` / `Vision.detectUI()` 支持 `imageBase64`
- `POST /v1/vision/ocr` / `POST /v1/vision/detect-ui` 支持 `imageBase64`
- `OCR.extractText(image)` 支持路径或 base64
- `ImageColor.loadBase64()` 会把文件重新编码为 base64
- `ImageColor.clip()` / `find*Channel()` 返回 data URL

这在“少量图片、一次性调用、调试脚本”场景下没问题，但在以下场景会变成明显负担：

- JS 调 Go 时跨语言边界传大字符串
- 高频截图后马上 OCR / detectUI / ImageColor
- HTTP 服务端接收中大图
- 需要做视频、音频、实时流

## 1.1 当前已落地

当前代码已经实现了这几项最小高效链路：

- `page.screenshot({ returnType: "bytes" })`
  - 直接返回二进制
  - 在 JS 侧表现为 `ArrayBuffer`
- `Vision.runOCR()` / `Vision.detectUI()`
  - 支持 `image` 直接传 `Uint8Array` / `ArrayBuffer` / `number[]`
  - 支持 `imageBytes`
- HTTP `/v1/vision/ocr` 与 `/v1/vision/detect-ui`
  - 支持 `application/json`
  - 支持 `multipart/form-data`
  - 支持 `image/*` 与 `application/octet-stream` 原始二进制请求体

这意味着现在已经可以避免“截图 -> base64 -> OCR”的默认链路，改成“截图 -> bytes -> OCR”。

## 2. 评审方法

这个结论不是单点拍脑袋，而是按 10 个视角做了 20 轮交叉收敛后的结果。10 个视角是：

1. JS->Go 绑定成本
2. Runtime 内存与 CPU 开销
3. OCR/图像链路效率
4. HTTP 传输与网关行为
5. 流媒体设计
6. 安全与日志暴露面
7. 兼容性与渐进升级
8. 可观测性与排障
9. SDK/接口一致性
10. 测试与长期维护

最终结论很明确：base64 只能保留为“小图内联兼容层”，不能继续作为图片链路默认主协议，更不能扩展到视频和音频。

## 3. 现有接口里哪些最值得优先优化

| 优先级 | 接口/字段 | 当前问题 | 优化目标 |
| --- | --- | --- | --- |
| P0 | `page.screenshot()` | 即使写盘也常返回 base64，截图后又常被下游再读/再解码 | 新增返回控制，默认主路径切到 `path/ref/object` |
| P0 | `Vision.runOCR({ imageBase64 })` | 高频 OCR 会重复做大字符串搬运和解码 | 主通道切到 `path/mediaId` |
| P0 | `Vision.detectUI({ imageBase64 })` | 与 OCR 相同，且更容易连续调用 | 主通道切到 `path/mediaId` |
| P1 | `/v1/vision/ocr` 与 `/v1/vision/detect-ui` | 大 JSON、日志污染、代理限制、超时风险 | 小图保留 JSON/base64，大图改上传或 `mediaId` |
| P1 | `ImageColor.clip()` / `find*Channel()` | 返回值继续用 data URL，链式处理会制造很多大字符串 | 支持输出 `path/ref` |
| P2 | `OCR.extractText(image)` | 单字符串接口难扩展元信息 | 增加对象形态 |
| P2 | `ImageColor.loadBase64()` | 容易诱导“路径直传”变成“先编码再解码” | 降级为兼容辅助函数 |

排序依据：

- 先处理截图出口和 Vision 入口，因为这是最常走的热路径
- 再处理 HTTP 中大文件
- 最后处理 ImageColor 和其它历史兼容辅助函数

## 4. 基本设计原则

### 4.1 小图可以内联，但必须限流

适用范围：

- 一次性调试
- 单张小图
- 很少复用
- 预计载荷不超过 `256 KB` 到 `512 KB`

建议：

- 允许 `data:image/...;base64,...`
- 不作为默认主通道
- 不作为连续链路的中间格式

### 4.2 常规图片默认用路径或引用

适用范围：

- 截图
- OCR
- UI 探测
- 模板匹配
- 颜色分析
- 同一资源多次复用

建议：

- 本地 runtime 优先 `path`
- 为后续统一抽象预留 `mediaId`
- JS 侧尽量只传短字符串，不传大块 base64

### 4.3 视频和音频绝不走 JSON base64

适用范围：

- 视频文件
- 长音频
- 实时麦克风
- 实时屏幕流

建议：

- 本地走文件、命名管道、环形缓冲区、`streamId`
- HTTP 走 `multipart`、分片上传、WebSocket 二进制帧、gRPC streaming

反模式：

- `videoBase64` 放进 JSON
- `audioBase64Chunks` 连续塞进 JSON

原因：

- 体积膨胀约 33%
- JSON 编解码额外吃 CPU
- 日志和 trace 更容易泄漏大媒体内容
- 网关、反向代理、超时、限流都更难控
- 实时场景延迟会明显恶化

## 5. 推荐统一的媒体输入模型

目标不是让每个业务接口各自定义 `imagePath`、`imageBase64`、`audioBase64`、`videoPath`，而是统一成一个媒体输入协议。

### 5.1 最常用的简单形态

```js
await Vision.runOCR(".runtime/temp/current.png", { provider: "paddle", lang: "ch" });
await Vision.runOCR("media_01HXYZ...", { provider: "paddle", lang: "ch" });
```

优点：

- JS->Go 参数映射最简单
- 对 Goja 也最友好
- 脚本可读性更高

### 5.2 完整对象形态

```js
await Vision.runOCR({
  image: {
    path: ".runtime/temp/current.png",
    // 或 mediaId: "media_01HXYZ..."
    // 或 base64: "data:image/png;base64,..."
    // 或 url: "https://..."
    mimeType: "image/png",
    name: "current.png"
  },
  provider: "paddle",
  lang: "ch"
});
```

建议优先级：

1. `mediaId`
2. `path`
3. `url`
4. `base64`

原因：

- `mediaId/path` 最适合本地 runtime 和高频链路
- `url` 适合远程素材
- `base64` 留给小图兼容层

## 6. 推荐统一的媒体输出模型

当前最该优化的是截图和图像处理结果的输出协议。

### 6.1 截图返回值

建议不要再把“是否编码成 base64”混在 `encoding` 里表达，而是显式表达“我要什么返回类型”。

```js
const shot = await page.screenshot({
  path: ".runtime/temp/current.png",
  returnType: "object" // base64 | path | ref | object | none
});
```

目标返回结构：

```js
{
  mediaId: "media_01HXYZ...",
  path: "/abs/path/.runtime/temp/current.png",
  mimeType: "image/png",
  width: 1440,
  height: 900,
  sizeBytes: 182344,
  source: "page.screenshot"
}
```

说明：

- `base64`: 兼容旧脚本或调试
- `path`: 只拿路径
- `ref`: 只拿 `mediaId`
- `object`: 最适合编排链路
- `none`: 只写盘，不回传大对象

### 6.2 ImageColor 输出

以下接口建议支持与截图一致的输出控制：

- `ImageColor.clip()`
- `ImageColor.findRedChannel()`
- `ImageColor.findGreenChannel()`
- `ImageColor.findBlueChannel()`

否则图像链路会继续被 data URL 串起来，收益有限。

## 7. 图片、视频、音频应该怎样分别处理

### 7.1 少量图片

可以继续允许：

- `imageBase64`
- `data:image/...;base64,...`

但建议只用于：

- debug
- demo
- 一次性脚本
- 小图标、小截图

### 7.2 常规图片

默认建议：

- 先写到 `.runtime/temp/*.png`
- 下游传 `path`
- 如果需要跨多个接口复用，再升格成 `mediaId`

### 7.3 视频文件

默认建议：

- 文件落盘，例如 `.runtime/temp/session.mp4`
- 后续处理接口只传 `path/mediaId`
- 如需远程处理，先上传再提交 job

推荐形态：

```js
const rec = await Media.startScreenCapture({
  outputPath: ".runtime/temp/session.mp4",
  fps: 15
});

await Media.stop(rec.streamId);

await Video.analyze({
  video: ".runtime/temp/session.mp4"
});
```

### 7.4 音频文件

默认建议：

- `wav` / `mp3` / `m4a` 落盘
- 识别接口吃 `path/mediaId`

推荐形态：

```js
const mic = await Media.startAudioCapture({
  outputPath: ".runtime/temp/session.wav",
  sampleRate: 16000,
  channels: 1
});

await Media.stop(mic.streamId);

await Audio.transcribe({
  audio: ".runtime/temp/session.wav"
});
```

### 7.5 实时流

如果业务是“实时边录边识别”，不要再沿用同步函数式 API。

推荐拆成：

1. 建流
2. 推送二进制帧
3. 返回事件流或增量结果

本地 runtime 推荐：

- `streamId`
- 环形缓冲区
- 命名管道

HTTP 推荐：

- WebSocket binary frames
- gRPC streaming

元数据建议：

- 首帧或控制帧传 JSON 元信息
- 后续媒体内容全部走二进制

## 8. 最小可落地实现

如果只做最小可用优化，不要一开始就上完整媒体平台，先做这三件事：

### 第一步

给 `page.screenshot()` 增加返回控制：

- `returnType: "base64" | "path" | "object" | "none"`

收益最大，因为它是所有图片链路的源头。

### 第二步

给 `Vision.runOCR()` 和 `Vision.detectUI()` 增加统一字段：

- `image`

兼容：

- `imagePath`
- `imageBase64`

但新逻辑内部统一转成一个解析入口。

### 第三步

给 HTTP 层补大文件通道：

- 小图继续 JSON/base64
- 大图改 `multipart/form-data`
- 更大媒体走“上传后返回 `mediaId`，任务接口只传 `mediaId`”

这三步做完，80% 的真实问题就解决了。

## 9. 中期建议

当第一阶段跑稳后，再补一个轻量 `Media` 基础层：

- `Media.putBase64(base64, options?)`
- `Media.fromFile(path)`
- `Media.info(mediaId)`
- `Media.delete(mediaId)`
- `Media.gc(options?)`

这样业务接口就不需要重复做：

- base64 解码
- 临时文件创建
- mime/type 推断
- 媒体元信息整理

## 10. 一句话结论

少量图片可以继续允许 base64，但默认主协议应该切到 `path/mediaId`。视频和音频不要走 JSON base64，而应该走文件、分片上传或真正的二进制流。
