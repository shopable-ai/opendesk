# Path 与 source context 验收

## 结论标准

`path` 必须在 macOS、Linux 与 Windows 构建中使用目标平台原生分隔符，字符串语义对照
Node.js v24.15.0 常用 `node:path` 接口。唯一刻意差异是 `resolve/relative` 的 cwd 来源固定为
`Execution.workdir`。

硬门槛：

- 8 个方法与 `sep`、`delimiter` 进入文档、类型、机器索引和 contract manifest；
- 正常行为由 `tests/runtime-api/path.js` 与 `unit/path.test.js` 覆盖；
- 正式 `path` mode 在两个不同 WorkDir 运行同一文件，并验证结果彼此隔离；
- 文件入口得到绝对 `scriptPath/scriptDir`，相同源码经 `-script-text` 运行时两者为 `null`；
- `path` 不访问磁盘、不解析 symlink、不读取环境、不修改进程 cwd，也没有 teardown 资源；
- 公开示例必须从仓库根目录原样执行。

## 正式命令

```bash
OPENDESK_RUNTIME_API_MODE=path ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
./dist/opendesk -script examples/path.js -console-mode script
```

正式 evidence 写入 `.runtime/tests/runtime-api/<run-id>/`；公开示例的 report 写入其
`Execution.artifactDir`。Linux/Windows 在当前阶段只要求对应源码的 cross-compile/package，不能把
该结果表述为目标系统 live Runtime 验证。

## 评分

| 维度 | 分值 | 验收依据 |
| --- | ---: | --- |
| 架构与兼容性 | 20 | native owner、单一 WorkDir、Node 24.15.0 字符串基线 |
| 数据与来源模型 | 20 | 独立可信字段，不解析 `source`，无路径时严格 `null` |
| 生命周期与可靠性 | 20 | 同步无资源；两 WorkDir 与 file/inline 正反例 |
| 安全与隐私 | 15 | 无磁盘探测、symlink/环境展开；文档标记路径隐私 |
| 可用性 | 10 | 全局对象、类型、公开示例与可复制命令 |
| 真实测试与文档 | 15 | manifest/unit/formal gate/机器索引/质量证据 |
| 总分 | 100 | 硬门槛全部通过后成立 |

## 2026-09-05 实际验收

本轮在 `master` 的 dirty 工作树（HEAD `9696a0c358490209b705683cd2474c6dfd6d55bb`）上先执行
`make build`，再从仓库根目录原样运行上述命令。正式 Runtime gate 使用 source build，机器记录的
CLI SHA-256 为 `d5a0138a4a8c3a4465c1418ac1ecae4a5c509f3ab81c459704dea37c8a559dac`。

| 验收项 | 结果 | 证据 |
| --- | --- | --- |
| `./scripts/test_runtime_apis.sh path` | 11/11，通过；两个 WorkDir、file/inline 与全零清理均通过 | `.runtime/tests/runtime-api/direct-20260905-204827-907000/` |
| contract | 337/337，通过；catalog 339 个成员 | `.runtime/tests/runtime-api/direct-20260905-204630-960000/` |
| unit | 507/507，通过；全零清理 | `.runtime/tests/runtime-api/direct-20260905-204646-706000/` |
| smoke | 通过；contract、unit、safe smoke、三种 async stack、失败退出与 negative quality 均通过 | `.runtime/tests/runtime-api/direct-20260905-205007-196000/` |
| File JSON 回归 | 35/35，通过；AI acceptance 与全零清理通过 | `.runtime/tests/runtime-api/direct-20260905-204718-202000/` |
| 公开 `-script` 示例 | 通过，得到绝对 `scriptPath/scriptDir` | `.runtime/runs/direct-20260905-204621-342000/path-example.json` |
| 公开 `ai run` 示例 | 通过，得到同一可信文件路径 | `.runtime/ai/ai-20260905-204621-984000/path-example.json` |
| Linux/Windows owner cross-compile | 两个平台的 `automation/path.go` archive 均生成成功 | `.runtime/tests/runtime-api/path-cross/` |

Go 聚焦验证 `go test ./pkg/execution`、`go test ./automation -run '^$'` 以及
`go test ./cmd/opendesk ./internal/aicli ./pkg/scheduler` 均通过。Linux/Windows 结果仅证明本卡
native owner 可为目标平台编译，未进行目标系统 live Runtime 验证；本卡不把它们表述为真机证据。

本卡硬门槛均通过，评分为 **100/100**。该评分仅针对 Path 与 source context 本卡，不代表整个项目。
