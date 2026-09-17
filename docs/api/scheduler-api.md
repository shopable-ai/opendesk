---
title: Scheduler HTTP API
description: OpenDesk 本地 Scheduler 的任务管理与运行历史 HTTP API 契约。
order: 530
docType: protocol
---

# Scheduler HTTP API

本文负责 OpenDesk Scheduler 的本机 HTTP protocol contract：endpoint、请求/响应、公开 Job / JobRun 数据模型与 transport 安全边界。

- 普通用户如何从计划中心创建和验证真实计划：见 [Scheduler](scheduler.md)。
- 当前桌面 App 的管理命令：见 [Scheduler CLI](scheduler-cli.md)。
- Store / Runner ownership、SQLite/WAL、takeover 与 recovery：见 [Scheduler Runtime Concurrency](../architecture/scheduler-runtime-concurrency.md)。

## 服务地址与 transport 边界

Headless / 开发模式可以启动本地 Scheduler owner：

```bash
./opendesk -http -port 60844
```

API 基地址：

```text
http://127.0.0.1:60844/api/scheduler
```

如果计划脚本需要 `ui.toast()` 等 Custom UI，长驻 owner 需要启用 `-ui`：

```bash
./opendesk -http -ui -port 60844
```

Headless Scheduler API 只接受本机 loopback 请求并检查 `Host` 与浏览器 `Origin`。不要通过反向代理把它暴露到 LAN 或公网。

OpenDesk Desktop App 使用同一 Scheduler service / handler 语义，但 App Mode local bridge 由运行时分配随机 loopback endpoint，并要求 `X-OpenDesk-App-Token`。endpoint/token 是产品私有连接信息，不是需要用户手工复制的公开配置；普通桌面管理优先使用 [Scheduler CLI](scheduler-cli.md) 或计划中心。

Scheduler 到期执行不通过 HTTP 调用自己。内部链路仍然是：

```text
Scheduler Service
→ standard Execution
→ JavaScript Runtime
```

## 通用响应

成功响应使用 HTTP `200`：

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

错误响应使用对应 HTTP 状态，并把状态码写入 `code`：

```json
{
  "code": 400,
  "message": "job name is required"
}
```

常见状态：

| HTTP 状态 | 含义 |
| --- | --- |
| `200` | 请求成功 |
| `400` | JSON、字段、脚本来源或调度表达式无效 |
| `403` | 非本机请求、非法 Origin，或 App bridge token 无效 |
| `404` | 任务不存在或已删除 |
| `405` | 当前路径不支持该 HTTP 方法 |

时间字段使用 RFC3339。Job ID、Run ID、Execution ID 都是不透明字符串。

## Job 数据模型

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 任务 ID |
| `name` | string | 任务名称，最长 200 字符 |
| `enabled` | boolean | 是否参与未来自动调度 |
| `scheduleType` | string | `at`、`every` 或 `cron` |
| `scheduleExpression` | string | 对应调度表达式 |
| `timezone` | string | IANA 时区或 `Local` |
| `misfirePolicy` | string | `run_once` 或 `skip` |
| `taskType` | string | 当前只支持 `script` |
| `sourceType` | string | `file` 或 `inline` |
| `scriptPath` | string | file 来源的脚本路径 |
| `hasInlineScript` | boolean | inline 来源正文已持久化；不会返回正文 |
| `createdAt` | string | 创建时间 |
| `updatedAt` | string | 最近更新时间 |
| `lastRunAt` | string | 可选，最近运行完成后的记录时间 |
| `nextRunAt` | string | 可选，下一次自动调度时间 |
| `lastRun` | JobRun | 可选，最近一次运行记录 |

## JobRun 数据模型

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | Scheduler Run ID |
| `jobId` | string | 所属 Job ID |
| `scheduledAt` | string | 本次运行的计划时间；手动运行时为服务端创建手动 Run 的时间 |
| `startedAt` | string | 可选，实际开始时间 |
| `finishedAt` | string | 可选，完成时间 |
| `status` | string | `queued`、`running`、`succeeded`、`failed`、`canceled`、`skipped` |
| `error` | string | 可选，错误或取消原因 |
| `executionId` | string | 可选，对应标准 Execution |
| `triggerType` | string | `scheduled`、`manual` 或 `unknown` |

### triggerType 的可信语义

`triggerType` 由 Scheduler 服务端在创建 JobRun 时写入并持久化：

- `scheduled`：Job 到期后由 Scheduler 领取并创建 Run；
- `manual`：通过 `POST .../run` / Run Now 创建；
- `unknown`：历史数据库中的旧记录没有足够事实证明来源。

payload 不能通过提交字段声明 `triggerType`，也不能通过自己的 `Execution.source` 把一次运行提升为 `scheduled`。真实自动调度验收应读取 JobRun 的 `triggerType`。

`POST .../run` 返回 `queued` 只说明手动 Run 已经入队，不是 Execution 成功证据。

## 创建任务

```http
POST /api/scheduler/jobs
Content-Type: application/json
```

请求字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `name` | 是 | 非空，最长 200 字符 |
| `sourceType` | 否 | `file` / `inline`；省略默认 `file` |
| `scriptPath` | file 是 | Scheduler script root 内现存普通 `.js` 文件 |
| `inlineScript` | inline 是 | JavaScript 原文，最多 256 KiB |
| `scheduleType` | 是 | `at`、`every`、`cron` |
| `scheduleExpression` | 是 | 对应的时间表达式 |
| `timezone` | 否 | IANA 时区或 `Local`；默认 `Local` |
| `misfirePolicy` | 否 | `run_once` / `skip`；默认 `run_once` |
| `taskType` | 否 | 当前只能是 `script` |

`scriptPath` 与非空 `inlineScript` 必须恰好提供一个。JSON 不接受未知字段；HTTP 请求体有独立上限，inline 正文仍受 256 KiB 限制。

### file 来源

```json
{
  "name": "文件任务",
  "sourceType": "file",
  "scriptPath": "report.js",
  "scheduleType": "at",
  "scheduleExpression": "2026-09-18T21:00:00+09:00",
  "timezone": "Asia/Tokyo",
  "misfirePolicy": "skip"
}
```

文件路径在创建时以及执行前都受 script root、符号链接、普通文件和 `.js` 扩展名校验。非法路径不能先执行再报错。

### inline 来源

```json
{
  "name": "文本提醒",
  "sourceType": "inline",
  "inlineScript": "await ui.toast({message: 'done', timeoutMs: 2000});",
  "scheduleType": "at",
  "scheduleExpression": "2026-09-18T21:05:00+09:00",
  "timezone": "Asia/Tokyo",
  "misfirePolicy": "skip"
}
```

普通 Job 响应不会回传完整 inline 正文。执行时仍创建标准 Execution 与受控 script snapshot。

## 时间类型

### at

接受 RFC3339，或结合 `timezone` 解释的本地日期时间。`at + skip` 拒绝已经过去的创建时间；`at + run_once` 可以在恢复规则允许时补跑一次。

一次性计划完成后会停用且不再拥有 `nextRunAt`。

### every

使用 duration，例如 `5m`、`30m`、`2h`。当前最小间隔由 Scheduler 的调度校验规则决定。`every` 为 fixed-delay：本次完成后再等待完整 interval。

### cron

使用 Linux 五字段 cron，不包含秒：

```text
分钟 小时 日 月 星期
```

例如每天 09:00：`0 9 * * *`。

## 列出任务

```http
GET /api/scheduler/jobs
```

成功时 `data` 是 Job 数组。inline 任务只返回来源存在标记，不返回正文。

## 暂停任务

```http
POST /api/scheduler/jobs/{id}/pause
```

暂停阻止未来自动调度。已经开始运行的 Execution 不会因为 pause 被伪报为已停止。

## 恢复任务

```http
POST /api/scheduler/jobs/{id}/resume
```

恢复后根据任务类型重新建立未来调度；已经过期且 `misfirePolicy=skip` 的一次任务不能被恢复成过去时间的自动执行。

## 立即运行

```http
POST /api/scheduler/jobs/{id}/run
```

创建的 JobRun 必须带：

```json
{
  "triggerType": "manual"
}
```

手动运行不改写原来的未来计划时间，也不能作为自动调度验收的通过证据。

## 查询运行记录

```http
GET /api/scheduler/jobs/{id}/runs?limit=20
```

`limit` 允许 `1` 到 `100`。返回按最近优先排列的 JobRun 数组。

真实自动计划验证至少应比较：`scheduledAt`、`startedAt`、`triggerType`、`status`、`executionId`，而不是只看日志是否存在。

## 删除任务

```http
DELETE /api/scheduler/jobs/{id}
```

成功数据：

```json
{
  "id": "job-example",
  "deleted": true
}
```

删除停止未来调度，但不会强制终止已经进入 running 的 Execution。并发删除/领取时，应以之后查询到的真实 Run 状态为准。

## 与桌面计划中心和 CLI 的关系

OpenDesk Desktop 的计划中心、Scheduler CLI 和 Runtime examples 都应连接同一个 App Scheduler，不应各自维护第二套数据或通过前端 timer 模拟调度。

产品真实调度测试的 add / verify / remove 命令、15/45 秒默认与 Native 证据边界见 [Scheduler CLI](scheduler-cli.md)。

Headless 本地管理页仍可用于开发：

```text
http://127.0.0.1:60844/scheduler
```

它只是本协议的本机客户端，不是桌面产品需要再包装一次的第二个计划中心。
