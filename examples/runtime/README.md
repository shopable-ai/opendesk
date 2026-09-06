# 基础 Runtime 示例

所有命令从仓库根目录运行，使用当前 OpenDesk 构建，不用 Node 执行示例。
本目录保留第一批 quickstart、环境、路径、JSON 示例，并接收修复后的文件、命令和 HTTP 示例。

| 示例 | 根目录直接运行命令 | 输入、输出及副作用 |
| --- | --- | --- |
| [api-quickstart.js](api-quickstart.js) | `./opendesk -script examples/runtime/api-quickstart.js -console-mode script` | 无业务输入；短暂等待后打印说明，不点击桌面。 |
| [environment.js](environment.js) | `./opendesk -script examples/runtime/environment.js -console-mode script` | 只打印白名单环境摘要，不输出完整环境或凭据。 |
| [path.js](path.js) | `./dist/opendesk -script examples/runtime/path.js -console-mode script` | 在 `Execution.artifactDir` 写入 `path-example.json`。 |
| [file-json.js](file-json.js) | `./opendesk -script examples/runtime/file-json.js -console-mode script` | 相对工作目录读取可选 `config/settings.json`，写入 `Execution.artifactDir/file-json-example/`；平台限制见下文。 |
| [file.js](file.js) | `./opendesk -script examples/runtime/file.js -console-mode script` | 只创建本次 `Execution.artifactDir/file-demo/`；核对读写、复制、移动、JSON 文本和目录结果；拒绝覆盖已有示例目录。 |
| [command.js](command.js) | `./dist/opendesk -script examples/runtime/command.js -console-mode script` | 固定 echo 程序，5000 ms 超时、4096 字节输出上限；核对退出码和输出；没有用户可插入的 shell 文本。 |
| [http.js](http.js) | `OPENDESK_EXAMPLE_HTTP_URL=http://127.0.0.1:8080/echo ./opendesk -script examples/runtime/http.js -console-mode script` | 先准备自己控制的测试服务并替换地址；默认只有 GET，不存在内置局域网地址或服务端。 |

## HTTP 输入与结果

`OPENDESK_EXAMPLE_HTTP_URL` 必填，必须是 HTTP(S)，不接受 URL 内的用户名、密码或 fragment。
GET 示例通过 params 发送固定示例参数；每次执行只发一个请求，5000 ms 超时，不输出 URL、
响应正文或完整错误对象。状态 `request-completed` 仅表示收到 2xx，不表示服务端持久化或业务成功。
测试地址的重定向和实际副作用由你控制；GET 也不等于一个不可信服务必然只读。

POST、PUT、PATCH、DELETE 需要同时设置 `OPENDESK_EXAMPLE_HTTP_METHOD` 和
`OPENDESK_EXAMPLE_ALLOW_WRITE=1`；只能使用允许修改的测试数据。例如：

```bash
OPENDESK_EXAMPLE_HTTP_URL=http://127.0.0.1:8080/echo OPENDESK_EXAMPLE_HTTP_METHOD=POST OPENDESK_EXAMPLE_ALLOW_WRITE=1 ./opendesk -script examples/runtime/http.js -console-mode script
```

POST 默认发送 JSON；再设置 `OPENDESK_EXAMPLE_HTTP_FORM=1` 演示 URLSearchParams 表单。
PUT/PATCH 发送固定 JSON；DELETE 直接使用配置的测试资源 URL。不会自动连续修改、删除资源。
配置缺失、拒绝写入、请求失败和非 2xx 都失败退出，不把“代码到结尾”当作成功。

## 平台与验证

Windows PowerShell 的当前 dist 构建可直接运行 File 和 Command 示例：

```powershell
.\dist\opendesk.exe -script examples/runtime/file.js -console-mode script
.\dist\opendesk.exe -script examples/runtime/command.js -console-mode script
```

其他带环境变量的示例先通过 `$env:变量名 = '值'` 设置并在运行后清除，只替换可执行文件路径。
这些是用法，不是 Windows 实机已通过的声明。特别是 File JSON 的 `writeJSON`，当前
[File 契约](../../docs/api/file.md)在 Windows 返回 `ATOMIC_REPLACE_UNSUPPORTED`，不能用普通
文本写入悄悄替代它的原子写契约。基础 File 示例仅使用同步文本接口，未修改 JSON API。

相关单项测试：`tests/runtime-api/single/file.js`、`single/command.js`、`single/http-axios.js`。
运行命令和前置条件见 [单项测试索引](../../docs/api/examples/single-tests.md)；单项测试通过不等于
示例已运行。示例自检、HTTP 服务端观察和正式 Runtime gate 要分别报告。

旧的根目录路径暂时只做兼容转发；新旧入口都使用相同前置条件。Execution 来源保持真实入口，
不会伪造为目标文件。退出兼容入口前必须查明调用者并验证命令，见
[目录与迁移规则](../../docs/quality/example-test-layout.md)。
