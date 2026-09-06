# 单个 Runtime 接口组的直接入口

从仓库根目录运行，例如：

```bash
./dist/opendesk -script tests/runtime-api/single/file.js -console-mode script
```

每个 `.js` 只把固定 ID 交给 `../support/run-selected.js`；不复制 `unit/` 的断言，不设置
`Execution.env`，也不启动新 Execution。完整脚本列表、前置条件与结果边界只维护在
[单项测试脚本索引](../../../docs/api/examples/single-tests.md)。

固定入口不能同时设置 `OPENDESK_RUNTIME_API_UNIT_FILTER`。多组选用 `../unit-selected.js`；
需要退出后资源/二进制证据时仍走 `scripts/test_runtime_apis.js` 的 `unit-selected` 或专用 mode。
