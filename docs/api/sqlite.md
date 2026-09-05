---
title: SQLite Runtime API
description: 第一方、execution-owned 的异步 SQLite 数据库句柄。
order: 8
---

# SQLite

`SQLite` 是 OpenDesk 本地 JavaScript Runtime 的第一方数据库 API。它直接复用 OpenDesk
已锁定的 `modernc.org/sqlite` 驱动，不需要 Native Extension、`sqlite3` CLI、Node.js、npm 包、
数据库服务或 daemon。

它和 Scheduler 内部的 SQLite Store、Scheduler 业务 schema 以及 `AppStorage` 完全分开：本 API 不复用或
返回 Scheduler 的连接、内部表或 `AppStorage` 数据。Scheduler 默认数据库路径以及直接 CLI 中由
`-scheduler-db` 配置的路径会被拒绝，不能通过此 API 打开。

```js
const db = await SQLite.open({ path: 'data/tasks.sqlite', mode: 'rwc' });
try {
  await db.exec('CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY, title TEXT NOT NULL)');
  await db.exec('INSERT INTO tasks (title) VALUES (?)', ['parameter binding']);
  const rows = await db.query('SELECT id, title FROM tasks ORDER BY id');
  console.log(rows);
} finally {
  await db.close();
}
```

所有数据库操作均为 Promise API；没有同步版本、同义别名，也没有 `SQLite.query()` 这类全局方法。
`query`、`exec`、`batch` 和 `close` 都只存在于 `SQLite.open()` 返回的句柄上。

## 入口与文件边界

SQLite 仅注入可信本地 execution：`-script`、`-script-text`、`-script-stdin` 和 `opendesk ai run`。
HTTP、MCP 和 Scheduler execution 不注入 `SQLite`，也没有任意 SQL 的 HTTP route 或 MCP tool。
因此新增该全局对象不会让远程入口取得宿主文件系统访问能力。

路径规则和 [`File.path()`](file.md#filepathrelativepath) 一致：相对路径以不可变的
`Execution.workdir` 为基准；绝对路径按所在平台的原生规则使用。Windows 驱动器/UNC 路径、包含空格
或中文的路径都可作为 JavaScript 字符串传入。调用者负责显式创建父目录；SQLite 不会为了一个错误
路径递归创建目录。

路径不会跨平台改写语义：在 macOS/Linux 等 POSIX 系统上，反斜杠字符是文件名的普通字符，不会被改为
目录分隔符；在 Windows 上则按 Windows 路径分隔符规则处理。

为保护其他 Runtime owner，`SQLite.open()` 也会拒绝受保护的内部数据库路径：默认的 Scheduler 数据库
`~/.opendesk/opendesk/scheduler.db`，以及当前直接 CLI 进程以 `-scheduler-db` 配置的 Scheduler 路径。
该保护同时检查可解析的 symlink 别名；脚本应改用自己的明确数据库文件。它不改变普通用户自选数据库的
路径规则。

`:memory:` 是特殊路径。每个 `SQLite.open({ path: ':memory:' })` 都得到独立的内存数据库，不会共享
进程全局业务连接或另一个句柄的表；它可使用默认 `rw` 或 `rwc`，但没有既存文件可供 `ro` 打开，因此
`mode: 'ro'` 会 reject。

## 打开数据库：`SQLite.open(options)`

```ts
SQLite.open({
  path: string,
  mode?: 'rw' | 'rwc' | 'ro',
  timeoutMs?: number,
  signal?: AbortSignal,
}): Promise<OpenDeskSQLiteDatabase>
```

| `mode` | 默认 | 含义 |
| --- | --- | --- |
| `rw` | 是 | 只打开已存在数据库；目标不存在时 reject，绝不创建。 |
| `rwc` | 否 | 允许 SQLite 创建目标数据库；父目录仍必须已经存在。 |
| `ro` | 否 | 在实际 SQLite 连接层以只读方式打开；任何写入都失败，不能靠检查 SQL 是否以 `SELECT` 开头冒充只读。 |

`timeoutMs` 是本次打开及其进入句柄队列前的额外 deadline；`signal` 是本次操作额外的
`AbortSignal`。两者只能收紧 execution 自身的取消/截止时间，不能延长它。`path`、mode、options
或当前入口不合法时同样以 rejected Promise 报 `SQLiteError`。

`open`、`exec`、`query` 和 `batch` 的 `timeoutMs` 默认是 30,000 ms，必须是 1–600,000 的整数；
`AbortSignal` 已经 aborted 时直接以 Promise rejection 完成。`close` 不接受 options。

## 参数、值与精度

`exec`、`query` 和每个 `batch` 元素可以使用位置参数或命名参数。位置参数数组绑定到 SQL 中的 `?`
占位符：

```js
await db.exec(
  'INSERT INTO notes (title, body, attachment) VALUES (?, ?, ?)',
  ['计划', '不拼接 SQL 字符串', new Uint8Array([1, 2, 3])],
);
```

运行时严格验证占位符数量及参数类型。位置参数只接受顺序 `?` 占位符，不支持编号 `?NNN`。`:name`、`@name`
或 `$name` 使用名称精确匹配的对象；名称须以 Unicode 字母开头，后续可含字母、数字和 `_`，例如
`:名字` 配合 `{ 名字: '值' }`。两种
参数形式不能混用，named object 也不能多出或漏掉名称。支持的值为 `null`、`boolean`、`string`、有限
`number`、SQLite `INTEGER` 范围内的 `BigInt` 和 `Uint8Array`。`Uint8Array` 在异步入队前会复制快照，
之后修改原数组不会改变已绑定的 BLOB。函数、`Date`、`ArrayBuffer`、`undefined`、`NaN`、无穷值和不安全
整数 `number` 都会 reject；不要把已经丢失精度的 JavaScript number 当作 SQLite INTEGER 输入，应使用
`BigInt` 或精确十进制文本配合 `CAST`。

SQLite 本身没有 BOOLEAN 存储类：绑定的 `boolean` 按 SQLite INTEGER 语义保存，读取时返回 `0` 或 `1`
的 `number`，而不是尝试从 schema 推断 JavaScript boolean。

返回行是普通对象数组，列值映射如下：

| SQLite 值 | JavaScript 值 |
| --- | --- |
| `NULL` | `null` |
| 安全范围内的 `INTEGER` | `number` |
| 安全范围外的 `INTEGER` | 精确十进制 `string` |
| `REAL` | `number` |
| `TEXT` | `string` |
| `BLOB` | `Uint8Array` |

如需把精确十进制文本写为 INTEGER，可让 SQLite 显式转换，例如
`CAST(? AS INTEGER)`；不要先把它变成不安全的 JavaScript number。

## 句柄方法

### `db.exec(sql, params?, options?)`

```ts
db.exec(
  sql: string,
  params?: OpenDeskSQLiteParams,
  options?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<{ changes: number }>
```

执行一条顶层 SQL 并返回受影响行数。参数始终由 SQLite 原生绑定，绝不通过字符串拼接生成 SQL。

### `db.query(sql, params?, options?)`

```ts
db.query(
  sql: string,
  params?: OpenDeskSQLiteParams,
  options?: {
    timeoutMs?: number;
    signal?: AbortSignal;
    maxRows?: number;
    maxBytes?: number;
  },
): Promise<Array<Record<string, OpenDeskSQLiteValue>>>
```

执行一条顶层 SQL 并返回行对象数组；没有记录时 resolve `[]`。它不等同于安全意义的“只读”：只读边界
必须使用 `SQLite.open({ mode: 'ro' })`。例如 DML `... RETURNING` 也可以由 `query` 返回行；若它在
结果上限、取消或读取错误处失败，写入结果可能为 `writeState: 'unknown'` / `committed: null`，不得自动重试。

为避免无界结果，query 默认最多返回 **10,000 行**和 **8 MiB** 的编码结果数据。`maxRows` 可设为
1–100,000，`maxBytes` 可设为 1–64 MiB；任一上限触发时 reject `RESULT_LIMIT`，不会静默截断后返回部分行。

### `db.batch(statements, options?)`

```ts
db.batch([
  { sql: 'INSERT INTO tasks (title) VALUES (?)', params: ['first'] },
  { sql: 'UPDATE counters SET value = value + ? WHERE name = ?', params: [1, 'writes'] },
], { timeoutMs: 5_000 });
// Promise<{ results: Array<{ changes: number }> }>
```

`batch` 的每个元素是 `{ sql, params? }`（最多 256 个），并固定在**同一个物理连接**上的一个真实事务内执行。
全部元素成功才提交；在提交点之前任一元素出错、超时或取消时整个 batch 回滚，不能用逐条独立提交冒充事务。
如果 `COMMIT` 本身与取消或底层错误竞态，Runtime 不会谎称已经回滚，而是以 `writeState: 'unknown'`、
`committed: null` reject；调用者不得自动重试。成功时 `results` 与输入顺序一一对应。

首版不提供跨调用 `BEGIN`/`COMMIT`、transaction callback 或可跨句柄共享的事务 API。`BEGIN`、`COMMIT`、
`ROLLBACK`、`SAVEPOINT`、`RELEASE` 等原始事务控制语句均被拒绝，尤其不能放进 batch 绕过 owner。`ATTACH`、
`DETACH` 和 `VACUUM` 这类改变连接/文件边界的语句也不受此句柄支持。

### `db.close()`

```ts
db.close(): Promise<void>
```

`close()` 可重复调用。第一次开始关闭后，句柄拒绝新的 `open` 后操作，正常 close 会等待已经进入该句柄队列
的操作结束，再释放连接、Rows、Stmt、worker、队列和 AbortSignal listener。脚本忘记 `close()` 时，
execution teardown 仍会关闭所有归该 execution 的句柄；但业务脚本应始终在 `finally` 中显式关闭。

## 单语句、排队、取消与写入结果

每次 `query`、`exec` 和每个 batch 元素只接受一条顶层 SQL。一个可选结尾分号、字符串字面量或注释中的
分号不构成第二条语句；真正的多语句输入在执行前 reject，不能产生部分写入。

同一句柄的操作串行且最多排队 32 个等待操作；batch 从开始到提交/回滚期间不会被该句柄的其他操作插入。数据库 I/O 在
native worker 执行，Goja 参数读取、Promise settlement 和 AbortSignal listener 都回到所属 EventLoop，
不会把 SQLite 的锁等待、执行或结果读取阻塞到 JavaScript EventLoop 上。

execution cancel、`timeoutMs`、`AbortSignal`、SQL 错误和脚本异常都会取消/清理仍在运行的工作。正常的
主动 `close()` 不抢占已接受的 FIFO 操作，而是在它们结束后释放连接；取消覆盖排队、锁等待、SQL 执行和
行读取，而不是只用 `Promise.race` 留下后台 SQL。

对写入取消，错误会提供 `writeState` 和兼容字段 `committed`：

| `writeState` | `committed` | 含义 |
| --- | --- | --- |
| `not_started` | `false` | 已确认本次写尚未开始。 |
| `rolled_back` | `false` | 已确认本次事务已回滚。 |
| `committed` | `true` | 已确认提交发生。 |
| `unknown` | `null` | 无法安全判断提交点；调用者不得自动重试。 |
| `not_applicable` | `null` | 非写入操作，不适用提交状态。 |

## 错误

所有预期失败都是 `SQLiteError` 的 Promise rejection，而不是 `[]`、`null` 或伪成功结果：

```ts
interface OpenDeskSQLiteError extends Error {
  name: 'SQLiteError';
  code: string;
  operation: 'SQLite.open' | 'SQLiteDatabase.exec' | 'SQLiteDatabase.query'
    | 'SQLiteDatabase.batch' | 'SQLiteDatabase.close';
  committed: boolean | null;
  writeState: 'not_started' | 'rolled_back' | 'committed' | 'unknown' | 'not_applicable';
}
```

稳定 code 为：

| code | 含义 |
| --- | --- |
| `INVALID_ARGUMENT` | path、mode、SQL、params、options、单语句或事务控制规则不合法。 |
| `OPEN_FAILED` | 数据库不存在、父目录缺失、路径/权限或 SQLite 打开失败。 |
| `SQL_ERROR` | SQLite 编译、绑定、执行、扫描或事务失败。 |
| `READ_ONLY` | `mode: 'ro'` 连接尝试写入。 |
| `RESULT_LIMIT` | query 超过 `maxRows` 或 `maxBytes`。 |
| `QUEUE_FULL` | 同一句柄的有界等待队列已满。 |
| `MULTIPLE_STATEMENTS` | SQL 包含第二条顶层语句。 |
| `TRANSACTION_CONTROL_FORBIDDEN` | 使用了由 `batch` owner 管理的原始事务控制语句。 |
| `CONNECTION_CONTROL_FORBIDDEN` | 使用了 `ATTACH`、`DETACH`、`VACUUM` 等改变连接边界的语句。 |
| `PROTECTED_PATH` | 路径属于受保护的内部数据库（包括 Scheduler 默认路径或当前 CLI 配置的 `-scheduler-db`）。 |
| `CLOSED` | 句柄已关闭或正在关闭，不能接受新操作。 |
| `TIMEOUT` | 本次 `timeoutMs` 或 execution deadline 到期。 |
| `CANCELED` | AbortSignal、execution cancel 或 teardown 已取消操作。 |
| `CLOSE_FAILED` | 底层连接释放失败。 |
| `INTERNAL` | 非预期的 Runtime/驱动边界失败。 |

普通 SQL 业务错误应该由脚本捕获并按业务语义处理；不要以“重试一切”处理 `unknown` 写入结果。

## 可复制示例

仓库根目录下的完整示例、PowerShell 命令、smoke 行为范围和两个独立进程的持久化验证见
[`examples/sqlite/README.md`](../../examples/sqlite/README.md)。公开 quickstart 的直接命令为：

```bash
./dist/opendesk -script examples/sqlite/quickstart.js -console-mode script
```

示例所有运行产物都写到 `.runtime/tests/sqlite/`；不会操作用户原有数据库、受保护的 Scheduler 数据库或
`examples/` 目录。
