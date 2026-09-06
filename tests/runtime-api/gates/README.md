# Runtime API gates

正式入口仍为仓库根目录的：

```bash
./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
```

`catalog-runner.js` 只负责加载和分派；`registry.js` 是唯一模式/模块映射；
`runtime-context.js` 维护构建来源、证据、watchdog 和通用清理检查；`suites/` 按领域维护编排。
这些 factory 模块不是独立命令，不要用 Node 或直接 `-script` 执行它们。

接口用例仍复用 `../unit/` 和现有专用 JS 文件；需要只跑几个接口时使用
`../unit-selected.js`，不要复制断言或把完整 unit 成功率用于局部结果。

结构、全部模式、示例命令和验证边界见
[Runtime API 测试模块与按接口运行](../../../docs/quality/runtime-api-test-modules.md)。

单个接口组的直接脚本在 `../single/`，例如从仓库根目录运行
`./dist/opendesk -script tests/runtime-api/single/file.js -console-mode script`。
它复用 shared selected runner，不经过本目录的完整构建/fixture 编排。
入口、断言源和命令表见 [单项测试脚本](../../../docs/api/examples/single-tests.md)。
