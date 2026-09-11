# Audio 示例

本目录只保留面向用户的 Sound/Audio 示例。Example Explorer 的普通列表只展示 `examples/catalog.json` 登记的 canonical user examples；smoke、fixture 生成器和监听辅助工具统一归 `tests/audio/`。

## Play Sounds

```bash
./dist/opendesk -script examples/audio/play.js -console-mode script
```

依次演示已有同步 Sound 播放方法。它会真实使用系统音频输出并播放多段声音，因此 Catalog 标记为 `manual`。

## Playback Control

```bash
./dist/opendesk -script examples/audio/playback-control.js -console-mode script
```

启动循环播放，依次演示 pause、resume、stop 和 wait，并确认结束后没有遗留 active playback。它同样会使用真实音频设备，Catalog 保持 `manual`。

## Pattern Watch

```bash
./dist/opendesk -script examples/audio/watch-known-sound.js -console-mode script
```

已知声音和多模式监听是经过审核的 manual examples：需要用户准备参考音频、播放源和真实音频设备。多模式监听使用 `tests/audio/tools/generate-market-multisentence-fixture.js` 生成测试素材；fixture、listener 和 smoke 本身不是公开 Example。

## 旧路径已退休

旧根目录 Sound 入口已删除。新命令只使用本目录的 canonical 文件；Catalog `legacyNames` 只保留历史名称/搜索上下文。

## 测试边界

`tests/audio/control-smoke.js`、`tests/audio/pattern-watch-smoke.js` 和 `tests/audio/tools/` 下的 generator/listener/fixture 文档有各自的专项用途；它们不作为 Example Explorer 普通入口，也不应批量执行。

正式 Runtime API contract 与领域回归继续归 `tests/`；公开示例只用于学习 API 和人工观察效果。
