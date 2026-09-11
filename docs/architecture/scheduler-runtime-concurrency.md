# Scheduler 多 Runtime 并发与执行归属

> 状态：Implemented P0 baseline
> 日期：2026-09-12
> 范围：Scheduler persistent store、SQLite 并发、Runner ownership、standby takeover 与多 Runtime 生命周期。

## 1. 结论

OpenDesk Scheduler 采用三个彼此独立的 scope：

```text
Runtime endpoint
→ runtime-instance scoped

Scheduler persistent store
→ OS-user scoped / shared by default

Scheduler runner ownership
→ runtime scoped / exclusive / single-active
```

核心原则：

> **共享数据，不共享执行权。**

默认 Scheduler DB 继续位于：

```text
~/.opendesk/opendesk/scheduler.db
```

`-scheduler-db` 仍可覆盖数据库位置；它改变的是 Scheduler Store identity，而不是 HTTP endpoint 或 App identity。

因此多个 OpenDesk Runtime 可以同时打开同一个 Store、通过各自的 Scheduler API 读写任务，但任意时刻只有一个 Runtime 获得该 Store 的 Runner ownership 并执行 polling、recovery 与 scheduled jobs。

## 2. 为什么不是 per-runtime DB

Scheduler 是持久产品数据。用户创建任务后关闭 OpenDesk，再次启动时任务必须继续存在，因此 Scheduler 不能放入：

```text
.runtime/instances/<runtime-id>/scheduler.db
```

也不能按动态 HTTP port、process id 或 App Shell instance 随机拆库。

默认 shared Store 使：

```text
Runtime A create/update/pause/delete
Runtime B list/read
Runtime C later restart
```

看到同一组持久 Scheduler tasks。

如果调用方显式使用不同 `-scheduler-db`，则它们自然属于不同 Scheduler Store，也拥有彼此独立的 Runner ownership。

## 3. 当前问题的真实根因

Runtime Endpoint Allocation 允许多个 Runtime 使用不同 localhost endpoint 后，旧 Scheduler 生命周期会让每个 HTTP Runtime 都执行：

```text
OpenStore(shared scheduler.db)
→ NewService
→ Service.Start
→ RecoverInterruptedRuns
→ polling engine
→ worker
```

`ClaimScheduledRun` 已经通过条件 UPDATE：

```sql
UPDATE scheduled_jobs
SET next_run_at = NULL
WHERE id = ?
  AND enabled = 1
  AND next_run_at = ?
```

对健康并发 claim 提供了基本 CAS 防护，但这不能解决多个完整 Runner 同时存在。

特别是旧 `Service.Start()` 会无条件运行 `RecoverInterruptedRuns`。当 Runtime A 正在执行一个 run 时启动 Runtime B，B 可以把 A 的 `running` run 误判为“上一个 OpenDesk 已中断”，再恢复该 job 的 `next_run_at`，从而制造重复 occurrence。

SQLite 文件锁/WAL 可以保护数据库结构，不会自动保护上述业务语义。

## 4. Store 与 Runner 分离

```text
Scheduler Service
├── Store
│   ├── scheduled_jobs
│   ├── job_runs
│   ├── next_run_at
│   ├── run history
│   └── persistent SQLite state
│
└── Runner
    ├── startup recovery
    ├── due polling
    ├── scheduled occurrence claim
    ├── execution worker
    └── shutdown recovery
```

所有 Runtime 都可以使用 Store API。

只有 active owner 可以运行 Runner 行为：

```text
recover
poll due tasks
claim occurrences
execute jobs
```

standby Runtime 不运行这些行为。

## 5. Ownership 机制

每个实际 DB 使用一个邻接 lock file：

```text
scheduler.db
scheduler.db.runner.lock
scheduler.db.migration.lock
```

lock file 的“存在”没有 ownership 含义。真正 ownership 由操作系统内核锁决定：

- macOS/Linux/BSD：`flock(LOCK_EX | LOCK_NB)`；
- Windows：`LockFileEx(LOCKFILE_EXCLUSIVE_LOCK | LOCKFILE_FAIL_IMMEDIATELY)`；
- 同一进程内同时创建多个 Scheduler Service 时，generic process-lock primitive 还会阻止同一路径的重入 ownership。

获得 lock 的 file handle 必须持续存活到 ownership 释放。

正常 Close：

```text
stop coordinator/engine/worker
→ cancel/wait current Scheduler Execution
→ recover unfinished queued/running state
→ release runner OS lock
→ stopped
```

异常 process crash/kill：

```text
OS closes process handle
→ kernel lock automatically released
→ standby retry acquires ownership
→ recovery
→ active
```

禁止通过“删除 `.lock` 文件”进行接管。

## 6. Runner 状态

```text
active
standby
stopping
stopped
```

启动流程：

```text
Service.Start
→ try scheduler.db.runner.lock
   ├── acquired
   │   → recover shared Store
   │   → active
   │   → start engine + worker
   └── unavailable
       → standby
       → keep Store/API usable
       → bounded timer retry
       → ownership acquired
       → recover
       → active
```

standby 默认使用低频 timer 重试；不会使用 busy loop。Runtime context cancel 后 retry goroutine 立即退出。

日志只记录状态变化或实际 acquisition error，不在每个 retry 周期打印噪音：

```text
scheduler: ownership acquired; runner active
scheduler: ownership unavailable; standby
scheduler: ownership transferred/acquired; runner active
scheduler: ownership released; runner stopped
```

## 7. Standby API 行为

shared Store CRUD 不需要请求转发到 active Runtime：

```text
ListJobs
GetJob
CreateJob
Pause
Resume
Delete
ListRuns
```

这些操作在 standby Runtime 上仍直接读写 shared DB。

active Runner 每次 polling 都重新读取 DB，因此通过 standby 创建、暂停、恢复或删除的任务会被 active Runtime 观察到；当前不引入额外 IPC/cache invalidation system。

`RunNow` 不属于 Store CRUD，而是明确的“立即执行”动作。P0 中它只允许在 active Runner 上调用；standby 返回 `ErrRunnerStandby`，不会偷偷启动第二套 execution worker。未来如果需要“任意 Runtime 接收 RunNow 并转交 owner”，应单独设计 durable command/claim，而不是破坏 single-active 边界。

## 8. SQLite 并发策略

现有配置继续保留：

```text
PRAGMA busy_timeout = 5000
PRAGMA foreign_keys = ON
PRAGMA journal_mode = WAL
```

Store 每个 process 当前仍限制：

```text
MaxOpenConns = 1
MaxIdleConns = 1
```

理由：

- WAL 适合多 Runtime concurrent read + occasional write；
- `busy_timeout=5000` 避免短暂 writer contention 立即暴露为普通 `SQLITE_BUSY`；
- 这些设置只负责 SQLite concurrency，不承担 Scheduler Runner 互斥。

本轮没有为了“更快”额外改变 `synchronous`。

## 9. Migration ownership

旧 migration 流程包含：

```text
PRAGMA table_info
→ if column missing
→ ALTER TABLE ADD COLUMN
```

两个首次启动的 Runtime 可以同时通过“column missing”检查，因此单靠 `IF NOT EXISTS` 的基础 schema 不能保护后续 ALTER。

`OpenStore` 现在在 SQLite initialization/schema migration 前获取：

```text
scheduler.db.migration.lock
```

只有 migration owner 执行：

```text
open/configure SQLite
→ CREATE TABLE/INDEX IF NOT EXISTS
→ inspect legacy columns
→ ALTER legacy columns when needed
```

完成后立即释放 migration lock。其他 Runtime 随后按最新 schema 初始化自己的 connection。

migration lock 与 runner lock 分开：standby Runtime 仍然必须能够安全 OpenStore，而 Runner single-active 不能被误用成 schema initialization lock。

## 10. Scheduled occurrence guarantee

当前目标保证：

> 在多个健康 Runtime 并存、共享同一 Scheduler Store 时，一个 due occurrence 只有 active Runner 会进入 polling/execution；数据库中的 scheduled claim 仍保留 CAS 作为第二层保护。

这不是严格的 end-to-end exactly-once。

例如：

```text
external side effect completed
→ process crashes
→ FinishRun 尚未提交
```

新 owner 无法仅凭本地 Scheduler DB 确认外部 side effect 是否已经发生，因此 crash recovery 仍可能表现为 at-least-once。

若未来任务需要金融级/外部系统级 exactly-once，应由业务操作提供 idempotency key、transactional outbox 或目标系统幂等能力，而不是虚报 Scheduler 可以单独保证。

## 11. Shutdown 与 takeover 顺序

active Runtime 不能在 Scheduler worker 尚未停止时先释放 ownership，否则会出现：

```text
old owner still executing
+
new owner recovery/execution
```

因此 Close 顺序固定为：

```text
state = stopping
→ cancel service context
→ stop ownership retry / polling
→ wait worker and current execution
→ RecoverInterruptedRuns
→ release runner lock
→ state = stopped
```

如果调用方的 Close context 超时，内部 finalizer 仍继续等待并最终释放 ownership；不能为了快速返回提前 unlock。

## 12. 与 App Single Instance 的边界

Scheduler ownership 与 App Shell `singleInstance` 是不同概念：

```text
App singleInstance
→ same app identity / UI lifecycle

Scheduler ownership
→ same Scheduler Store / execution lifecycle
```

不同 appId 的 Runtime 如果共享默认 Scheduler DB，仍竞争同一个 Scheduler runner lock。

Scheduler owner 也不使用：

```text
HTTP port
actualPort
127.0.0.1:<dynamic-port>
```

作为 identity。Runtime endpoint 是瞬时 transport，不是持久数据 owner。

## 13. 验证合同

Scheduler 多 Runtime gate 至少覆盖：

```text
shared DB can open from multiple Store instances
concurrent Store writes do not stably reproduce SQLITE_BUSY
legacy schema concurrent initialization is serialized
A active + B standby => active count = 1
job created through B => A observes and executes once
B startup while A run is running => B must not recover/cancel/duplicate A run
A graceful Close => B automatically becomes active
A process kill => OS releases ownership and B automatically takes over
restart with same DB => persisted tasks/history remain available
```

Windows CI 必须真实运行 Scheduler tests，从而执行 `LockFileEx`、SQLite shared-store 与 helper-process kill/takeover 路径；cross-compile 只能作为补充，不能替代该 evidence。

## 14. 后续风险，不在本轮扩大

- P1：Scheduler job 对应 Execution 的更细粒度 cancellation API。
- P1：Scheduler Execution 启动 child process 时的完整 descendant cleanup 证据。
- P1：其他真正影响业务正确性的跨 Runtime global resources。
- P2：crash-after-side-effect 场景的 idempotency/fencing/occurrence identity。
- P2：`.runtime`、logs、screenshots、Recorder artifacts 的全面 per-instance isolation。

这些问题不能反向改变本文件已经冻结的 scope：

```text
endpoint = instance scoped
Scheduler Store = user/shared scoped
Scheduler Runner = single-active scoped
```

## 15. 相关设计

- [Runtime Endpoint Allocation 与 App Instance Isolation](runtime-endpoint-allocation.md)：解决 transport endpoint ownership；不会通过“每 Runtime 一个 Scheduler DB”解决本问题。
- [App Shell、Tray / Menu Bar 与 Single-Instance](app-shell-tray-menu.md)：解决应用身份、activation 与 UI lifecycle；不是 Scheduler leader election。
