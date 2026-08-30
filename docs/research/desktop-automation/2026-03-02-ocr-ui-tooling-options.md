# OCR + UI 元素定位接入方案（开源优先，预留付费接口）

更新时间：2026-03-02
适用范围：在现有 testMonkey-go 框架上增量接入基础视觉能力

---

## 1. 先回答问题

### 1.1 能否直接在当前框架先加基础 OCR + UI 元素定位？
可以，而且建议马上做。

当前仓库已按该方向完成首版接入：
- 新增 `Vision` 模块，默认 OCR Provider 为 `paddle`。
- 新增 HTTP 接口：
  - `POST /v1/vision/ocr`
  - `POST /v1/vision/detect-ui`
- 新增 CLI 接口：
  - `-vision-ocr-image`
  - `-vision-detect-ui-image`
  - `-vision-target-text`
- 支持 Provider 预留：`openai/azure/google/aws`（当前为占位，后续可实现）。
- 已提供本地 PaddleOCR 服务脚本：
  - `scripts/paddle_ocr_server.py`
  - `scripts/requirements-paddle-ocr.txt`

原因：
1. 当前系统已有截图能力（`Screen/Page screenshot`）和窗口能力（`window.*`），可以直接作为视觉输入。
2. 仓库依赖里已出现 `gosseract`（Go -> Tesseract）与 `gocv` 线索，具备接入基础 OCR 与模板匹配的技术基础。
3. 可以先做“可用版本”（OCR 文本框 + 按钮定位），再逐步升级为强语义 UI 解析。

### 1.2 能否预留付费接口？
可以，建议从第一版就做 Provider 抽象：
- 本地开源 Provider（默认）
- 云端付费 Provider（可选）

这样可同时满足：
- 本地离线、低成本
- 云端高精度、快速验证
- 后续按场景自动路由（成本/时延/准确率）

## 2. 开源工具选型建议（按优先级）

## 2.1 第一梯队（建议直接用）

### A. Tesseract + gosseract（MVP 首选）
- 适合：基础 OCR 快速上线。
- 优点：
  - 成熟稳定、开源、成本低。
  - Go 侧有 `gosseract` 包，接入成本低。
- 风险：复杂 UI 场景准确率一般，需图像预处理。
- 结论：作为 v1 默认 OCR 引擎。

### B. OpenCV `matchTemplate`（基础 UI 定位）
- 适合：按钮图标相对稳定的场景。
- 优点：
  - 已有业界成熟方法，易理解、可调阈值。
  - 与截图能力天然兼容。
- 风险：UI 主题变化、缩放变化下容易漂移。
- 结论：和 OCR 联合使用，不单独依赖。

## 2.2 第二梯队（增强能力）

### C. PaddleOCR（多语言/复杂文档更强）
- 适合：复杂排版、语言混杂、识别准确率要求更高。
- 优点：
  - 社区活跃，文档能力强（OCR + 结构化解析）。
- 风险：Go 直接接入复杂，建议独立服务化调用。
- 结论：作为增强 OCR Provider（服务化）。

### D. Microsoft OmniParser（GUI Agent 场景强）
- 适合：将“截图”转成结构化 UI 元素（可交互区域）。
- 优点：
  - 专为 GUI agent 场景设计，适配按钮/图标等控件语义。
- 风险：模型较重，部署成本高于基础 OCR。
- 结论：作为高级 UI 检测 Provider（可选）。

## 2.3 可参考（非首批）
- SikuliX：视觉自动化老牌方案，适合参考其“所见即所控”思路；但 Java 生态与当前 Go 主体不完全一致，不建议首批主栈引入。

## 3. 付费 Provider（预留接口）

建议预留以下 Provider 适配层：
1. Azure Vision Read OCR
2. Google Cloud Vision OCR
3. AWS Textract OCR
4. OpenAI Vision（语义理解/复杂界面兜底）

### 3.1 何时调用付费接口
- 本地 OCR 置信度低于阈值（如 < 0.75）。
- 任务是高价值场景（客服自动回复、关键表单处理）。
- 需要更强语义理解（不是简单读字，而是理解界面结构）。

### 3.2 成本控制策略
- 默认本地 -> 失败再云端。
- 只上传必要裁剪区域，不传整屏。
- 对重复界面做缓存（短期 hash）。

## 4. 在当前系统内的最小实现方案

## 4.1 先新增 2 个 API（最小可用）
1. `POST /v1/vision/ocr`
- 输入：base64 image 或文件路径 + ROI。
- 输出：`text`, `lines`, `words`, `bbox`, `confidence`。

2. `POST /v1/vision/detect-ui`
- 输入：image + 可选 `target_text`, `template_id`。
- 输出：`elements[]`（`role`, `text`, `bbox`, `score`, `click_point`）。

## 4.2 Provider 接口（建议）

```go
type OCRProvider interface {
    Name() string
    OCR(ctx context.Context, img []byte, opts OCROptions) (OCRResult, error)
}

type UIDetector interface {
    Name() string
    Detect(ctx context.Context, img []byte, opts DetectOptions) ([]UIElement, error)
}
```

## 4.3 路由策略（建议）
1. 先走 `LocalOCRProvider`（Tesseract）。
2. 低置信度时走 `CloudOCRProvider`（Azure/GCP/AWS/OpenAI）。
3. UI 定位先用“文本框 + 模板匹配”融合。
4. 高复杂界面再走 `OmniParserProvider`。

## 5. 聊天软件场景（从简单到复杂）

### 5.1 简单版（先做）
1. 找到聊天窗口并聚焦。
2. OCR 读取会话列表与最近消息。
3. 按文本定位“发送/切换会话”按钮。
4. 输入回复后做一次回读校验。

### 5.2 进阶版
1. 多对话切换（未读优先）。
2. 增加实时事件流（SSE/WS）供 Agent 边执行边判断。
3. 接入经验资产库（Recipe）减少每次生成代码。

## 6. 风险与规避
1. 主题/DPI 变化导致按钮定位漂移。
- 规避：坐标映射引擎 + 文本/模板双通道定位。

2. OCR 误识别导致误操作。
- 规避：置信度阈值 + 关键动作二次确认。

3. 云端 OCR 隐私风险。
- 规避：敏感区域脱敏、可配置仅本地模式。

## 7. 推荐执行顺序（2 周）

### Week 1
1. 接入 Tesseract Provider（本地 OCR）。
2. 增加 `/v1/vision/ocr`。
3. 实现基础 `detect-ui`（OCR 文本框 + OpenCV 模板匹配）。

### Week 2
1. 增加 Provider 抽象和路由。
2. 预留 1 个云端 OCR Provider（建议先 Azure 或 Google）。
3. 落地聊天软件单场景演示（识别消息 + 回复发送）。

## 8. 结论建议
- 现在就可以做，而且应该先做“基础可用版”。
- 技术栈建议：
  - 本地默认：`Tesseract(gosseract) + OpenCV模板匹配`
  - 增强可选：`PaddleOCR`、`OmniParser`
  - 付费兜底：`Azure/GCP/AWS/OpenAI Vision`
- 架构关键不是选某个模型，而是先把 Provider 抽象和回退链路搭好。

## 9. 参考链接（官方）
- Tesseract User Manual: https://tesseract-ocr.github.io/tessdoc/
- Tesseract GitHub: https://github.com/tesseract-ocr/tesseract
- gosseract GitHub: https://github.com/otiai10/gosseract
- OpenCV Template Matching: https://docs.opencv.org/4.x/de/da9/tutorial_template_matching.html
- PaddleOCR GitHub: https://github.com/PaddlePaddle/PaddleOCR
- Microsoft OmniParser: https://github.com/microsoft/OmniParser
- Microsoft UFO (UIA + Visual Detection 实践): https://github.com/microsoft/UFO
- Windows UI Automation Overview: https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-uiautomationoverview
- Google Cloud Vision OCR: https://docs.cloud.google.com/vision/docs/ocr
- Azure Vision OCR Quickstart: https://learn.microsoft.com/en-us/azure/ai-services/computer-vision/quickstarts-sdk/client-library
- AWS Textract DetectDocumentText: https://docs.aws.amazon.com/textract/latest/dg/API_DetectDocumentText.html
- AWS Textract Pricing: https://aws.amazon.com/textract/pricing/
- OpenAI Images & Vision API guide: https://platform.openai.com/docs/guides/images-vision
