# ImageColor 模板匹配固定夹具（OpenCV tagged 对照）

本目录提供稳定的 ImageColor 模板匹配输入，并保留历史 `opencv` tagged 命令的对照路径。
当前公开 API 在普通和 `opencv` build tag 构建中都使用 canonical Pure Go matcher；OpenCV
`TM_CCOEFF_NORMED` 只用于 Go 层实验性 conformance/benchmark，不是公开 API backend。

## 文件关系

- `scene_color_blocks.png`：320×240 的来源图，包含红、绿、蓝三个带独特内部图案的颜色块。
- `template_red-panel.png`、`template_green-panel.png`、`template_blue-panel.png`：从来源图精确裁剪的正模板。
- `template_absent.png`：来源图中不存在的负模板，用于防止“总是命中”的假阳性。
- `pairs.json`：机器可读的配对清单，记录颜色采样点、模板路径、阈值以及预期坐标、尺寸和最低置信度。

模板刻意包含多种颜色和内部结构，而不是使用纯色块。这既能稳定覆盖 canonical RGB 绝对误差 matcher，也可以避免历史 `TM_CCOEFF_NORMED` 对零方差纯色模板的退化情形。

## 重新生成

```bash
go run ./cmd/generate-opencv-fixtures
```

生成器默认将结果写入 `.runtime/generated/opencv/image-color`。确认结果无误后，使用显式 `--output tests/opencv/fixtures/image-color` 更新版本化测试夹具。
生成器是确定性的；重新生成后图片与 `pairs.json` 应保持一致。

## 执行 JavaScript 验收

```bash
go run -tags opencv ./cmd/opendesk \
  -script tests/opencv/image_color_opencv_test.js \
  -timeout 1 \
  -console-mode script \
  -log-dir .runtime/tests/opencv/js
```

也可以运行总入口：

```bash
./scripts/check_opencv.sh
```
