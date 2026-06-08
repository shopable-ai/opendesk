# RUNBOOK

- 更新时间：2026-04-03
- 适用阶段：Round 1 / Minimal Loop Bootstrap

## 1. 目标

本 runbook 只服务于第一阶段最小闭环：

```text
capture -> detect -> structured JSON -> html mirror -> visual compare -> diff report
```

注意：
- 当前仓库已有截图/OCR/布局分析基础；
- 但完整 `mirror + compare` 仍处于规划与 contract 建设阶段；
- 因此本 runbook 先保证 **preflight + detect 基线 + evidence 留存**。

## 2. 目录约定

本轮新增并启用以下目录：

- `artifacts/`：所有运行证据
- `prompts/`：结构化生成提示词
- `replays/`：可回放 case
- `schemas/`：工件 schema
- `tests/`：最小测试与回归说明

## 3. Phase 0：Preflight

### 命令

```bash
python3 scripts/vision_pipeline_preflight.py --output .runtime/preflight/current/latest.json
```

### 通过条件

- repo 关键路径存在
- `go` 与 `python3` 可执行
- `automation/page.go`、`automation/vision.go`、`automation/image_layout.go` 存在
- `examples/mac/wechat_agent_region_probe.js` 存在
- `scripts/paddle_ocr_server.py` 存在

### Warn 允许但需记录

- `PADDLE_OCR_ENDPOINT` 未配置
- `.venv-paddle-ocr` 未就绪
- 真实微信窗口与权限尚未人工确认

### Fail 立即停止

- 关键源码路径缺失
- `go` 或 `python3` 缺失
- preflight schema 与输出目录损坏

## 4. Phase 1：基线测试

### 推荐命令

```bash
go test ./automation -run 'Test(ParseScreenshotOptions|BuildScreenshotResponse|ImageColorAnalyzeLayoutReturnsCoarseGenericSegmentation|LayoutWithTextNoise|VisionAnalyzeLayoutWithGenericHints)'
```

### 目的

- 验证截图 option parser 未退化
- 验证布局分割与区域标注基础未退化
- 为后续微信检测提供基础信心

### 产物

- `artifacts/bootstrap-round-01/verification.json`
- `artifacts/bootstrap-round-01/go-test.log`

## 5. Phase 2：可选 OCR 服务启动

在进入真实 detect 之前，建议先初始化本次 run 的证据目录：

```bash
go run ./cmd/visionrun --run-id <run-id> --goal 'capture -> detect -> mirror -> compare'
```

最少会生成：

```text
artifacts/runs/<run-id>/
  requirement.json
  preflight.json
  capture/
  detect/
  mirror/
  compare/
  audit.ndjson
  decision.json
```

说明：
- 若 `preflight.json.status in {pass,warn}`，`decision.json.canProceed=true`
- 若 `preflight.json.status=fail`，bundle 仍会落盘，但 `decision.json.status=blocked`

如果需要真实 OCR，而不是仅跑布局/contract：

```bash
source .venv-paddle-ocr/bin/activate
uvicorn scripts.paddle_ocr_server:app --host 127.0.0.1 --port 8868
```

推荐同时设置：

```bash
export PADDLE_OCR_ENDPOINT=http://127.0.0.1:8868/predict/ocr_system
```

## 6. Phase 3：微信截图采集（现有能力）

### 推荐命令（稳定身份）

```bash
./scripts/run_macos_stable.sh -script examples/mac/wechat_agent_region_probe.js -timeout 4
```

### 当前可复用产物

- 全窗口截图
- 若干粗区域截图
- OCR 文本预览
- 区域探测 JSON

### 当前限制

- 还没有统一 run-id 目录
- 还没有稳定的 `regions.json` schema 输出
- mirror / compare 尚未接入

## 7. Phase 4：最小 detect contract（下一轮实现）

建议输出：

```json
{
  "runId": "...",
  "sourceImage": "artifacts/runs/<run-id>/capture/source.png",
  "window": {"x": 0, "y": 0, "width": 0, "height": 0},
  "regions": [
    {
      "id": "chat_list",
      "role": "list",
      "bbox": {"x": 0, "y": 0, "width": 0, "height": 0},
      "avgColor": "#f0f0f0",
      "ocrText": "...",
      "confidence": 0.0
    }
  ]
}
```

## 8. Phase 5：最小 mirror contract（下一轮实现）

建议输出：

- `mirror/index.html`
- `mirror/styles.css`
- `mirror/meta.json`
- `mirror/mirror.png`（浏览器截图）

恢复原则：

1. 先恢复布局和块级结构
2. 再恢复主颜色和文本
3. 第一轮不追求图标 1:1
4. 所有 mirror 输出都必须可再次截图进入 compare

## 9. Phase 6：最小 compare contract（下一轮实现）

建议输出：

```json
{
  "runId": "...",
  "pixelDiffRatio": 0.0,
  "regionIoU": [],
  "textSimilarity": [],
  "status": "pass|warn|fail",
  "summary": "...",
  "recommendations": []
}
```

## 10. Hard Gate / Soft Gate

### Hard Gate（必须通过）

- preflight 非 `fail`
- 截图可稳定生成
- 至少输出一个结构化 region JSON
- 所有关键工件落盘

### Soft Gate（逐步达到）

- 区域角色识别正确率达到可用阈值
- mirror 与原图主要块级布局接近
- diff 报告能指出主要偏差原因

## 11. Stop Conditions

满足任一条件立即停止自动扩展：

1. preflight = `fail`
2. 同一问题连续 2 轮无新增证据
3. 没有 run artifact，仅有对话分析
4. 真实微信截图无法稳定采集
5. OCR provider 完全不可用且无替代路径

## 12. Escalation Conditions

满足任一条件，需要人工判断：

1. TCC 权限问题无法通过标准脚本恢复
2. 微信 UI 改版导致 coarse layout 失效
3. diff 误报主要由字体/缩放差异造成，无法自动归一
4. Accessibility tree 在目标环境上突然稳定可用，需重评方案 C 权重
