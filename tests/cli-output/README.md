# CLI terminal output

本目录验证 CLI 终端展示边界，不重复 JavaScript Runtime API 的业务契约。测试覆盖颜色前缀、
`auto|always|never`、`NO_COLOR` / `FORCE_COLOR`、管道纯文本、Agent JSON、错误 stderr、
`console.clear()`、framework/business owner 与 console 方法标签、execution artifact 无系统 ANSI，
并防止框架完成消息或内部轮询细节泄漏到业务 `scriptLogs`。

从仓库根目录先构建当前源码，再直接运行 JavaScript 测试：

```bash
make build
node tests/cli-output/console-color.js
```

可用 `OPENDESK_BINARY=/absolute/path/to/opendesk` 核验指定构建物。运行证据写入
`.runtime/tests/cli-output/console-color-<timestamp>-<pid>/`。

macOS 上的真实 PTY 接线验收是独立步骤；先确保 shell 没有请求禁色：

```bash
NO_COLOR= TERM=xterm-256color /usr/bin/script -q .runtime/tests/cli-output/tty-auto.log ./dist/opendesk -script examples/environment.js -console-mode full
```

`tty-auto.log` 应包含 SGR 前缀；这是正式终端探针，不替代用户从仓库根目录直接执行公开示例。
