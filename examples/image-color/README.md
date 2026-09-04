# ImageColor 示例

本目录集中保存 `ImageColor` 的可运行示例和固定输入图片。

## ImageColor.diff

从仓库根目录运行：

```bash
./opendesk -script examples/image-color/diff.js
```

`diff.js` 读取 `fixtures/actual-rgb.png` 与 `fixtures/expected.png`，校验确定的像素差结果。测试输入永久保存在 `fixtures/`；执行产生的差异图写入 `.runtime/examples/image-color/diff.png`。

`fixtures/` 中还包含完全相同、仅 Alpha 变化、交叠忽略区域和尺寸不一致等 black-box 测试数据。精确预期值由 `tests/runtime-api/unit/image-color.test.js` 断言，避免维护第二份会漂移的 oracle。

## 重新生成图片

默认命令只生成预览到 `.runtime/`：

```bash
go run ./cmd/generate-image-diff-fixtures
```

确认结果无误后，显式更新本目录中的版本化输入图片：

```bash
go run ./cmd/generate-image-diff-fixtures \
  --output examples/image-color/fixtures
```

`.runtime/` 只保存可清理的生成预览、差异图和运行日志，不保存正式测试输入。
