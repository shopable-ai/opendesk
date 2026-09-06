# 剪贴板示例

所有命令从仓库根目录运行。文本示例会覆盖当前系统剪贴板的全部格式，不自动粘贴，
也不宣称恢复原来的文本、HTML、图片或私有格式。请先使用可丢弃的剪贴板内容。

```bash
OPENDESK_EXAMPLE_ALLOW_CLIPBOARD_WRITE=1 ./opendesk -script examples/clipboard/text.js -console-mode script
```

[text.js](text.js) 只写固定示例文本并读回核对，不匹配即抛错；不会打印意外读到的剪贴板正文。
成功后示例文本留在剪贴板，不像旧根目录示例那样无条件清空。未显式启用时，在首次读写前失败。
旧 `examples/clipboard.js` 是该文件的薄兼容入口，相同的显式授权也适用。

已有 [rich-smoke.js](rich-smoke.js) 和 [rich-paste-fixture.js](rich-paste-fixture.js) 不在这轮改写范围。
它们的富格式行为和平台限制继续按 [Clipboard API](../../docs/api/clipboard.md)；不能把纯文本
复制视为富格式恢复，也不能把所有剪贴板示例批量运行。

## 压力测试不是示例

原来的 `examples/clipboard.test.js` 已转发到独立真实设备测试，避免在示例目录维护测试矩阵。
从仓库根目录运行：

```bash
OPENDESK_LIVE_CLIPBOARD_STRESS=1 ./dist/opendesk -script tests/runtime-api/clipboard-stress.js -console-mode script
```

默认 100 次；`OPENDESK_CLIPBOARD_STRESS_ITERATIONS` 可以从固定边界样本数至 1000，
`OPENDESK_CLIPBOARD_STRESS_SEED` 为 0 至 4294967295 的整数。保留空白、Unicode、长文本等
边界，随机样本可复现。该脚本连续覆盖系统剪贴板，不恢复、不清空、不自动粘贴；运行中不要
进行其他剪贴板操作。外部程序同时改剪贴板可能导致测试失败，而不是自动重试掩盖结果。

证据为 `Execution.artifactDir/clipboard-stress/result.json`，记录运行状态、seed、次数和错误序号，
不保存实际正文或原生错误消息。先写 running，完成后才写 passed/failed；任一读写或匹配失败
均导致非零失败。中断后证据可能保持 running，不能算通过。结果不计入全量 API coverage，
也不默认加入 unit/smoke；短小参数契约仍由 [单项 clipboard 测试](../../tests/runtime-api/single/clipboard.js) 负责。
