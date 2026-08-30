# artifacts

本目录只保存需要长期复用或审阅的**可追溯、可回放、可审计**工件。

一次性执行输出、日志、截图、临时配置和调试文件统一写入被 Git 忽略的 `.runtime/`，不得写入本目录。

## 当前约定

- `artifacts/fixtures/golden-samples/`：可复用 golden sample / frozen baseline / registry
- `artifacts/reports/`：明确需要长期保留的报告
- `artifacts/external/`：外部参考项目快照（按 `project-ref-YYYYMMDD/` 分目录）


1. 关键结论必须落盘
2. 失败也是正式工件
3. 优先追加，不覆盖历史
4. `latest.json` 仅作为最近一次快捷入口，不替代历史记录
