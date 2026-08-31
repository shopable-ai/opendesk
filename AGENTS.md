# 项目协作规范

## 接口测试

- 进行 Runtime API 测试时，必须先查阅 `docs-user-api/` 目录中的接口文档，并按照文档定义调用接口。
- 接口测试必须编写并运行 JavaScript（`.js`）文件，不得为了测试接口而直接编写 Go（`.go`）文件。
- 测试所用的接口路径、请求参数和返回数据格式仅以 `docs-user-api/` 中的文档为准；不得恢复或使用任何退役接口文档。
- JavaScript Runtime API 一致性测试的正式目录是 `tests/runtime-api/`，正式入口为
  `scripts/test_runtime_apis.sh`，运行证据目录是 `.runtime/tests/runtime-api/`。旧
  `scripts/test_host_apis.sh` 只能作为打印 deprecated 提示的兼容包装器；不得复制测试实现。

## 文件生命周期与工程产物

- 可维护的源码、正式文档和稳定测试资产才进入版本控制。
- 执行日志、截图、临时配置、探测结果、脚本快照和 smoke 输出统一写入 `.runtime/`；不要新建或继续使用根目录 `temp/`。
- `.runtime/` 是本地可清理目录，禁止把其中的运行产物当作源码提交。
- 项目统一使用顶层 `tests/` 组织跨包测试，禁止重新创建并行的根级 `test/`。可复用 fixture 放入所属测试域；一次性运行结果写入 `.runtime/tests/<domain>/`，正式质量报告放入 `docs/quality/`，外部参考 manifest 放入 `docs/research/external/`。
- Go 白盒测试使用同包 `_test.go` 文件；独立测试工具放入 `tests/<domain>/tools/<tool>/`，不得与测试包混放。
- `.archive/` 用于历史资料，`.staging-sync/` 仅用于短期同步中间文件；二者都不能作为日常运行输出目录。
- 删除未跟踪文件前，必须先按上述生命周期分类；禁止使用无选择的批量清理，以免删除源码、fixture 或用户当前修改。
- 新增命令、脚本或测试时，必须让生成路径默认落到 `.runtime/`，并同步更新相关文档和 `.gitignore`。
