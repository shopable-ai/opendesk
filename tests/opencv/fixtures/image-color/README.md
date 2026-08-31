# OpenCV ImageColor 固定夹具

本目录用于验证 Clawdesk JavaScript `ImageColor` 接口在 `opencv` 构建标签下的模板匹配行为。

## 文件关系

- `scene_color_blocks.png`：320×240 的来源图，包含红、绿、蓝三个带独特内部图案的颜色块。
- `template_red-panel.png`、`template_green-panel.png`、`template_blue-panel.png`：从来源图精确裁剪的正模板。
- `template_absent.png`：来源图中不存在的负模板，用于防止“总是命中”的假阳性。
- `pairs.json`：机器可读的配对清单，记录颜色采样点、模板路径、阈值以及预期坐标、尺寸和最低置信度。

模板刻意包含多种颜色和内部结构，而不是使用纯色块。`TM_CCOEFF_NORMED` 对零方差的纯色模板不适合作为稳定回归夹具。

## 重新生成

```bash
go run ./cmd/generate-opencv-fixtures
```

生成器默认将结果写入 `.runtime/generated/opencv/image-color`。确认结果无误后，使用显式 `--output tests/opencv/fixtures/image-color` 更新版本化测试夹具。
生成器是确定性的；重新生成后图片与 `pairs.json` 应保持一致。

## 执行 JavaScript 验收

```bash
go run -tags opencv ./cmd/clawdesk \
  -script tests/opencv/image_color_opencv_test.js \
  -timeout 1 \
  -console-mode script \
  -log-dir /tmp/clawdesk-opencv-js-test
```

也可以运行总入口：

```bash
./scripts/check_opencv.sh
```
