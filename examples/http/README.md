# HTTP download example

工作目录：仓库根目录。

普通示例直接运行：

```bash
./dist/opendesk -script examples/http/download.js -console-mode script
```

它从 `https://www.example.com/` 下载一个小型只读 HTML 文档，写到
`.runtime/tests/http-download/<runId>/example/example.com.html`。终端会打印开始步骤、最终路径、
`bytesWritten`、SHA-256、HTTP 状态和 `committed`。网络、TLS、大小限制或文件提交失败会抛错并以非零
退出；该公网结果不替代正式的确定性 loopback 验收。

示例自测同样从根目录运行：

```bash
./dist/opendesk -script examples/http/download.test.js -console-mode script
```

自测自动启动并清理仓库已有的仅 loopback fixture，不需要手工启动服务。它下载独立已知二进制向量，
实际读取最终文件并核对长度与 SHA-256；任何 fixture、下载或断言失败都会非零退出。输出与 fixture
日志都位于 `.runtime/tests/http-download/<runId>/`。

开发者可运行完整确定性 Runtime gate：

```bash
OPENDESK_RUNTIME_API_MODE=http-download ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
```

该 gate 覆盖重定向、限额、gzip、截断、取消、并发和目标文件提交语义；它不是普通用户教程入口。
