# Vision 示例

本目录保存 OCR、截图字节和基础视觉处理的 canonical user examples。已有独立 README/fixtures 的 `examples/image-color/` 专题套件保留原目录；Example Explorer 通过 Catalog 的 `Vision` 分类统一呈现已审核入口。

## ImageColor Basics

```bash
./dist/opendesk -script examples/vision/image-color-basic.js -console-mode script
```

示例截取当前可见桌面，然后演示颜色相似度、图片尺寸、单点颜色和限定区域颜色查找。它不会发送输入，但截图本身可能包含敏感内容，因此 Catalog 保持 `manual`。

更完整的模板匹配、diff、fixtures 和可视化案例见 [`../image-color/`](../image-color/README.md)。

## Vision Bytes Roundtrip

```bash
VISION_OCR_PROVIDER=paddle PADDLE_OCR_ENDPOINT=http://127.0.0.1:8868/predict/ocr_system ./dist/opendesk -script examples/vision/bytes-roundtrip.js -console-mode script
```

捕获活动窗口 bytes，写入 `.runtime/examples/vision/bytes-roundtrip/active-window.png`，并把同一份 bytes 提交给 OCR。需要用户自己准备 OCR provider，且会捕获真实窗口像素，因此是 `manual`。

## OCR and Text Target

```bash
VISION_OCR_PROVIDER=paddle PADDLE_OCR_ENDPOINT=http://127.0.0.1:8868/predict/ocr_system ./dist/opendesk -script examples/vision/ocr.js -console-mode script
```

该示例运行 OCR，并通过 `UI.findText()` 解析文本目标；找到目标后会真实点击，因此必须先检查目标应用和桌面状态。Catalog 标记为 `manual`，Example Explorer 不提供一键 Run。

## 旧路径已退休

过去的 `examples/vision.ocr.js`、`examples/vision_bytes_roundtrip.js` 和根目录 `imageColor.js` 已删除。只使用本目录和 `examples/image-color/` 的 canonical 路径。Catalog `aliases` 仅保存历史名称/搜索上下文。

## 边界

- Screenshot / OCR 输入可能包含敏感可见内容，分享日志和 artifacts 前必须审阅。
- 外部 OCR endpoint 的部署、网络和数据处理策略由使用者负责。
- 示例成功只证明本次示例执行；正式接口 contract 仍由 `tests/runtime-api/` 和对应领域测试负责。
- 不要批量运行本目录或 `examples/image-color/`。
