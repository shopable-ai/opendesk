# Recorder Measurement Go 测试增量分类

本文件补充 `go-test-file-classification-measurement.md`，登记其后并行加入的 Recorder Measurement contract 测试。由 `scripts/audit_test_architecture.js` 与主清单一并解析。

| 文件 | 主处置 | 私有依赖 | 主要职责 | 外部依赖 | 断言价值 | 结论与证据 |
| --- | --- | --- | --- | --- | --- | --- |
| `internal/recorderbundle/measurement_contract_test.go` | `KEEP_PACKAGE` | 是：`internal/recorderbundle` 发布资产边界、package-relative Recorder controller 资源与产品 bundle contract seam | Recorder 测量按钮必须先 pause、不得退出后自动 resume，并保持 ruler 图标与共享 Measurement shortcut hint | 只读仓库内 `apps/opendesk/recorder/controller-core.js` 与 `controller.js`；不启动 Recorder 或真实桌面 | 防止 Measurement 补强破坏录制边界、意外自动恢复真人输入采集，或发布 bundle 中图标/快捷键提示与产品单一来源漂移 | 这是第一方 Recorder 发布资源的 internal contract 白盒；真实 Recorder 按钮 → Measurement Session → artifact 闭环仍由本地 Codex 实窗验收。 |
