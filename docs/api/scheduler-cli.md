---
title: Scheduler CLI
description: 管理当前 OpenDesk Desktop App Scheduler，并执行真实一次性调度验证的命令行契约。
order: 535
docType: cli
---

# Scheduler CLI

Scheduler CLI 用于管理**当前正在运行的 OpenDesk Desktop App 所拥有的 Scheduler**。它不会启动第二个 Scheduler、不会直接修改 Scheduler SQLite，也不会要求用户复制 endpoint 或 token。

CLI 会从当前用户的 OpenDesk 产品数据目录发现 App 发布的本机动态连接信息，对每个候选执行 loopback、token 和状态探测：

- 没有可达实例时明确失败；
- 只有一个可达实例时连接该实例；
- 同时存在多个可达实例时拒绝任意选择，要求先消除歧义；
- 过期的 discovery 文件只有通过真实认证探测后才可能被使用，因此文件存在本身不代表实例存活。

普通桌面用户优先使用 [Scheduler](scheduler.md) 中的计划中心；HTTP endpoint 和 Job/JobRun 字段见 [Scheduler HTTP API](scheduler-api.md)。

## 调用形式

从包含 `dist/opendesk` 的仓库根目录：

```bash
./dist/opendesk scheduler <command> [options]
```

Windows 对应使用 `dist\opendesk.exe`。

成功时 stdout 是一个 JSON envelope：

```json
{
  "ok": true,
  "result": {}
}
```

失败时 stderr 返回：

```json
{
  "ok": false,
  "error": {
    "code": "APP_SCHEDULER_NOT_RUNNING",
    "message": "no current OpenDesk desktop Scheduler instance is running"
  }
}
```

成功退出码为 `0`；命令执行失败为非零；缺少主命令的 usage 错误使用退出码 `2`。

## scheduler create

创建普通计划。必须提供名称、调度表达式，并且在文件脚本、直接内联脚本、内联脚本文件三种来源中恰好选择一种。

文件脚本示例：

```bash
./dist/opendesk scheduler create \
  --name "晚间整理" \
  --at "2026-09-18T21:00:00+09:00" \
  --script "cleanup.js" \
  --misfire skip
```

内联脚本示例：

```bash
./dist/opendesk scheduler create \
  --name "完成提醒" \
  --at "2026-09-18T21:05:00+09:00" \
  --inline "console.log('scheduled');"
```

主要参数：

| 参数 | 说明 |
| --- | --- |
| `--name` | 计划名称，必填 |
| `--schedule-type` | `at`、`every`、`cron`；默认 `at` |
| `--expression` | 调度表达式 |
| `--at` | RFC3339 单次时间；提供后等价于 `--schedule-type at --expression ...` |
| `--timezone` | IANA 时区或 `Local`；默认 `Local` |
| `--misfire` | `run_once` 或 `skip`；默认 `run_once` |
| `--script` | Scheduler 脚本目录中的 `.js` 路径 |
| `--inline` | 直接提供 JavaScript 文本 |
| `--inline-file` | 从指定文件读取 JavaScript 文本，并按 inline source 创建任务 |

真正的路径、扩展名、目录边界、sourceType 和调度表达式校验仍由当前 App Scheduler 服务端完成。CLI 不通过直接执行已安装 Flow 的内部文件绕过 Flow 的受控执行链。

## scheduler list

列出当前 App Scheduler 的任务：

```bash
./dist/opendesk scheduler list
```

`result.jobs` 是公开 Job 数组，`result.runnerState` 是当前连接实例报告的 Scheduler Runner 状态。

## scheduler runs

查询指定任务的运行记录：

```bash
./dist/opendesk scheduler runs --job job-xxxxxxxx --limit 20
```

`--limit` 会限制在 `1` 到 `100`。`JobRun.triggerType` 是 Scheduler 服务端写入的可信触发来源：

- `scheduled`：由到期调度领取创建；
- `manual`：由立即运行创建；
- `unknown`：历史记录无法证明来源。

不要通过 payload 的 `Execution.source` 推断自动调度是否通过。

## scheduler delete

按精确 job ID 删除计划及其未来调度：

```bash
./dist/opendesk scheduler delete --job job-xxxxxxxx
```

删除不等于停止一个已经开始运行的 Execution。调用方需要通过运行记录观察真实终态。

## scheduler test add

创建一批真实的一次性 Scheduler 验证任务：

```bash
./dist/opendesk scheduler test add
```

产品默认使用同一提交时间基准创建：

- 文本提醒：约 15 秒后；
- 文件提醒：约 45 秒后。

两条任务都是 `at + misfire=skip`。命令创建完成后立即退出；后续执行必须由仍在运行的 App Scheduler 到期自动触发，不能通过 `Run Now` 完成验收。

返回结果包含 `batchId`、两个真实 `jobId` 和绝对计划时间。批次状态保存在 OpenDesk 产品受控数据目录；重复请求可使用显式 `--request-id` 获得幂等语义。测试文件写入 Scheduler 脚本根目录的保留子目录，只复用完全相同的受控内容；如果同一路径已有不同内容，命令失败而不是覆盖用户文件。

自动化合同测试可以显式缩短间隔，例如：

```bash
./dist/opendesk scheduler test add --first-delay 2s --second-delay 5s
```

这不会改变产品默认的 15 / 45 秒。

## scheduler test verify

查询并验证已有批次；该命令只观察，不运行任务：

```bash
./dist/opendesk scheduler test verify --batch latest --wait 60s
```

默认启动延迟容差为 3 秒，可使用 `--latency-tolerance` 调整。验证内容包括：

- 创建时请求的未来时间与重新查询的持久化时间一致；
- 到期前运行历史为空；
- `scheduledAt` 与预期绝对时间一致；
- `startedAt` 不早于计划时间；
- `triggerType` 必须为 `scheduled`；
- 两条任务拥有不同 Execution ID；
- 每条一次性任务最多自动运行一次；
- 完成后不存在下一次自动排期；
- stdout、artifact 与正确的 job / Execution 关联；
- `ui.toast()` 调用、返回和关闭结果可以被记录。

结构化报告写入产品数据目录下 `.runtime/scheduler-tests/<batchId>/report.json`。

`verificationStatus: "passed"` 只代表上述**客观 Scheduler/Execution 合同**通过，不等于 Native 通知已经肉眼可见。报告中的 `nativeVisual` 与各平台状态独立记录；没有真实观察时保持 `NOT_RUN`，环境阻塞时应记录 `BLOCKED`。

## scheduler test remove

只清理指定批次拥有的任务：

```bash
./dist/opendesk scheduler test remove --batch latest
```

清理依据持久化 batch 中的真实 job ID，不按任务名称扫描删除，也不会清空用户 Scheduler 数据库。

如果删除与 Scheduler 到期领取并发：

- 尚未开始的未来计划会被移除；
- 已经进入 running 的 Execution 不会被伪报为已停止；
- 返回值通过 `runningAtRemovalJobIds` 等字段报告服务端观察到的真实状态。

## Runtime examples

相同批次实现也由 `examples/scheduler/` 下的 Runtime examples 使用：

```bash
./dist/opendesk -script examples/scheduler/test-add.js -console-mode script
./dist/opendesk -script examples/scheduler/test-verify.js -console-mode script
./dist/opendesk -script examples/scheduler/test-remove.js -console-mode script
```

这些示例要求 OpenDesk Desktop App 已经运行，并连接同一 App Scheduler；它们不会悄悄启动独立 HTTP Scheduler。

## 安全与生命周期边界

- CLI 只连接 loopback 动态 endpoint，并使用当前 App 发布的随机认证 token；token 不应打印到正常命令输出。
- CLI 不直接打开 Scheduler 数据库，也不创建另一个 Scheduler owner。
- 创建 CLI 进程退出不影响已经持久化的计划；调度生命周期属于桌面 App Scheduler。
- 关闭计划中心窗口或隐藏 Runner 不应停止 Scheduler。
- 手动 `Run Now` 记录为 `manual`，不能满足真实自动调度批次的 `triggerType=scheduled` 验证。
