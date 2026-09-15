# Desktop Measurement Prototype

本目录保存 OpenDesk「桌面测量」已经确认的长期交互样机。它属于 `apps/opendesk` 的产品设计资产，但**不是生产运行入口，也不会替代 `pkg/measurement` 的原生实现**。

## 资产定位

- [`index.html`](index.html)：可直接在浏览器打开的单文件交互基准（UI / Interaction Oracle）。
- [`template.html`](template.html)：原交付模板。
- [`model.js`](model.js)：仅用于样机与合同验证的模型层，不得复制为第二套 Runtime Geometry。
- [唯一产品设计](../../../../docs/architecture/desktop-automation/desktop-measurement.md)：正式产品行为与验收合同。
- [历史验证记录](../../../../docs/quality/desktop-measurement-prototype.md)：样机历史测试边界与来源。
- [验证代码](../../../../tests/desktop-measurement/README.md)：Node / Playwright 测试、fixtures 与导入记录。

## 维护规则

1. 本样机是桌面测量原生实现的长期交互参照；实现和测试应消费它，而不是由 `tests/` 目录拥有它。
2. `index.html`、`template.html`、`model.js` 本次迁移保持原内容不变。后续只有在明确修改产品设计时才同步调整，不能为了让当前实现“通过”而反向降低样机合同。
3. 正式产品只复用样机表达的交互和信息层级，不照搬样机中的模拟桌面、fixture 控制器、合成窗口或测试替身。
4. 运行截图、日志、下载结果与临时证据统一写入 `.runtime/`，不进入本目录。
5. 正式实现位于 `pkg/measurement` 及对应平台宿主；不要从本目录启动第二个应用或创建第二套 Measurement Runtime。
