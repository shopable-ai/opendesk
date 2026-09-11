# Audio 示例

本目录同时包含面向用户的 Sound/Audio 示例，以及历史 smoke、fixture 生成器和监听实验。Example Explorer 的普通列表只展示 `examples/catalog.json` 登记的 canonical user examples，不会把 `*smoke*`、`generate-*fixture*` 或其他未登记辅助脚本当成普通示例。

## Play Sounds

```bash
./dist/opendesk -script examples/audio/play.js -console-mode script
```

依次演示已有同步 Sound 播放方法。它会真实使用系统音频输出并播放多段声音，因此 Catalog 标记为 `manual`。

旧 `examples/sound.js` 只是兼容入口。

## Playback Control

```bash
./dist/opendesk -script examples/audio/playback-control.js -console-mode script
```

启动循环播放，依次演示 pause、resume、stop 和 wait，并确认结束后没有遗留 active playback。它同样会使用真实音频设备，Catalog 保持 `manual`。

旧 `examples/sound-playback.js` 只是兼容入口。

## 其他文件

目录中已有的 `control-smoke.js`、`pattern-watch-smoke.js`、`generate-*-fixture.js`、`*-listener.js` 等文件有各自的历史测试、fixture 或专项用途；在完成单独分类和文档审查前，不作为 Example Explorer 普通入口，也不应批量执行。

正式 Runtime API contract 与领域回归继续归 `tests/`；公开示例只用于学习 API 和人工观察效果。
