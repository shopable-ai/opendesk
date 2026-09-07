---
title: Command API
description: 在本地 JavaScript execution 中运行命令行程序并读取结果。
order: 7
---

# Command

`Command` 是 OpenDesk JavaScript Runtime 的 execution-owned 命令执行 API。它直接启动可执行文件，不是 Node.js `child_process` 兼容层，也不经过 shell。

本地 `-script` 与 `ai run` execution 默认启用；HTTP、MCP 与 Scheduler execution 当前禁用。

## API 一览

| 方法 | 用途 |
| --- | --- |
| `Command.getCapabilities()` | 查询当前 execution 是否允许命令执行。 |
| `Command.run(command, args?, options?)` | 启动一次命令，等待退出并返回 stdout、stderr 与 exit code。 |

## 公共约定

### Command.run() options

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `cwd` | `string` | 否 | `Execution.workdir` | 子进程工作目录；必须是已存在目录。 |
| `env` | `Record<string, string>` | 否 | `{}` | 覆盖 `Execution.env` 中的同名键。 |
| `input` | `string` | 否 | 未设置 | 一次性 UTF-8 stdin；写完自动关闭；最大 64 MiB。 |
| `timeout` | `number` | 否 | `0` | 毫秒；`0` 仅服从外层 execution deadline；最大 24 小时。 |
| `maxOutputBytes` | `number` | 否 | 4 MiB | stdout + stderr 合计上限；最大 64 MiB。 |

接口不提供 shell command interpolation、流式 handle、PTY、detached/unref、IPC 或交互式 stdin。

环境键必须满足 `[A-Za-z_][A-Za-z0-9_]*`。Windows 下 Runtime 统一为大写并按大小写不敏感方式覆盖。未显式覆盖时，子进程使用当前 `Execution.env` 快照。

## Command.getCapabilities()

查询当前 execution 的命令执行能力。

**签名**

```ts
Command.getCapabilities(): {
  schemaVersion: 1;
  enabled: boolean;
  supported: boolean;
  executionScoped: true;
};
```

**参数**

无。

**返回值**

同步返回 `{ schemaVersion, enabled, supported, executionScoped }`。

**行为与错误**

本方法只读取 capability，不启动子进程。即使 `run()` 当前被禁用，也可调用本方法检查原因边界。

**示例**

```js
const capabilities = Command.getCapabilities();
if (!capabilities.enabled || !capabilities.supported) {
  console.log(capabilities);
}
```

## Command.run(command, args?, options?)

直接运行一个可执行文件，等待退出并收集有界输出。

**签名**

```ts
Command.run(
  command: string,
  args?: string[],
  options?: OpenDeskCommandRunOptions,
): Promise<OpenDeskCommandRunResult>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `command` | `string` | 是 | 无 | 可执行文件名称或路径；不按 shell command line 解析。 |
| `args` | `string[]` | 否 | `[]` | 参数数组。 |
| `options` | `OpenDeskCommandRunOptions` | 否 | `{}` | 运行选项，见 [`Command.run()` options](#commandrun-options)。 |

**返回值**

```ts
interface OpenDeskCommandRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}
```

**行为与错误**

成功只在进程以 exit code `0` 完成并且输出未超过限制时 resolve。非零退出、启动失败、timeout、输出超限、I/O 失败或 execution 取消时 reject `CommandError`。

`CommandError` 的公开字段包括 `name`、`code`、`exitCode`、`stdout` 与 `stderr`。稳定错误码：

```text
COMMAND_DISABLED
INVALID_ARGUMENT
START_FAILED
EXIT_NONZERO
TIMEOUT
OUTPUT_LIMIT
IO_FAILED
CANCELED
```

命令进程归当前 execution 管理；timeout、中断和 teardown 会清理仍在运行的进程。`Command` 不是 sandbox，本地命令继承 OpenDesk 进程当前 OS 用户权限。

**示例**

```js
const result = await Command.run('/usr/bin/git', ['status', '--short'], {
  cwd: Execution.workdir,
  timeout: 10000,
  maxOutputBytes: 1024 * 1024,
  env: { LANG: 'C.UTF-8' },
});

console.log(result.stdout);
```

## 平台与能力

`Command` 的可用性由 execution 来源与当前平台 backend 决定。本地脚本和 `ai run` 默认启用；HTTP、MCP 与 Scheduler execution 当前返回禁用 capability，不能通过脚本 options 或环境变量自行升级授权。
