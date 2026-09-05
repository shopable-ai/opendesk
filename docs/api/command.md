---
title: Command API
description: 在本地 JavaScript execution 中运行命令行程序并读取结果。
order: 7
---

# Command

`Command` 是 OpenDesk JavaScript Runtime 的命令行执行对象。它不是 Node.js 兼容层，也不需要
`require('child_process')`。公开接口保持为两个方法：能力检测和一次性执行。

## 运行

从仓库根目录直接执行示例：

```bash
./dist/opendesk -script examples/command.js -console-mode script
```

`opendesk` 原本就能执行 JavaScript，因此本地 `-script` 和 `ai run` 均默认提供 `Command`，不需要额外
开关。`ai run` 只是需要 recipe 输入、JSON envelope 和 execution artifacts 时的可选入口：

```bash
./dist/opendesk ai run examples/command.js
```

HTTP、MCP 和 Scheduler execution 不提供命令执行能力。此时仍可调用 `getCapabilities()` 检测，
`run()` 会以 `COMMAND_DISABLED` 失败。

## 方法

| 方法 | 说明 |
| --- | --- |
| `Command.getCapabilities()` | 返回 `{ schemaVersion, enabled, supported, executionScoped }`。 |
| `Command.run(command, args?, options?)` | 直接运行程序，等待退出并返回 stdout、stderr 和 exit code。 |

```js
const result = await Command.run('/usr/bin/git', ['status', '--short'], {
  cwd: Execution.workdir,
  timeout: 10_000,
  maxOutputBytes: 1024 * 1024,
  env: { LANG: 'C.UTF-8' },
});

console.log(result.stdout);
```

`run()` 不经过 shell；`command` 是可执行文件，`args` 是可选字符串数组。无参数时可直接写：

```js
const result = await Command.run('/usr/bin/uname');
```

成功结果只有以下字段：

```json
{
  "exitCode": 0,
  "stdout": "Darwin\n",
  "stderr": ""
}
```

## Options

| 字段 | 默认 | 契约 |
| --- | --- | --- |
| `cwd` | OpenDesk 当前工作目录 | 必须是已存在目录。 |
| `env` | `{}` | 字符串键值，覆盖继承的 host 环境。 |
| `input` | 未设置 | 一次性 UTF-8 stdin，写完自动关闭；最大 64 MiB。 |
| `timeout` | `0` | 毫秒；`0` 表示仅服从外层 execution deadline，最大 24 小时。 |
| `maxOutputBytes` | 4 MiB | stdout + stderr 合计上限，最大 64 MiB。 |

输出按 UTF-8 字符串返回。接口不提供 shell 解释、流式 handle、PTY、detached、IPC 或交互式 stdin。

## 错误

参数无效、启动失败、非零退出、超时、输出超限或 execution 被取消时，`run()` reject `CommandError`。
公开错误字段为 `name`、`code`、`exitCode`、`stdout` 和 `stderr`；其中后三项在没有对应数据时为
`null` 或空字符串。

| code | 含义 |
| --- | --- |
| `COMMAND_DISABLED` | 当前 execution 不提供命令执行能力。 |
| `INVALID_ARGUMENT` | command、args 或 options 不合法。 |
| `START_FAILED` | 可执行文件不存在、无权限或启动失败。 |
| `EXIT_NONZERO` | 程序退出码非零。 |
| `TIMEOUT` | 超过 `timeout`。 |
| `OUTPUT_LIMIT` | 合并输出超过 `maxOutputBytes`。 |
| `IO_FAILED` | stdin/stdout/stderr 读写失败。 |
| `CANCELED` | 外层 execution 被取消。 |

命令进程归当前 execution 管理；超时、中断和 teardown 会清理仍在运行的进程。这不是 sandbox：
本地脚本中的命令继承 OpenDesk 进程当前 OS 用户的权限。
