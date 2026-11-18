---
title: SQLite Runtime API
description: 第一方、execution-owned 的异步 SQLite 数据库句柄。
order: 370
docType: reference
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
HTTP、MCP 和 Scheduler execution 默认不注入 `SQLite`，也没有任意 SQL 的 HTTP route 或专用 MCP tool。
可信本地 MCP 宿主可用 `--allow-script-execution --script-capabilities=sqlite` 显式授权普通脚本，见
[MCP Runtime 调用](../integrations/mcp/runtime-api.md)。客户端请求不能授予该能力；默认受限模式不变。

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

## 打开数据库：SQLite.open(options)

打开一个归当前 execution 所有的独立数据库句柄。

**签名**

```ts
SQLite.open(options: {
  path: string,
  mode?: 'rw' | 'rwc' | 'ro',
  timeoutMs?: number,
  signal?: AbortSignal,
}): Promise<OpenDeskSQLiteDatabase>
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| options | object | 是 | 无 | 只接受下列字段。 |
| options.path | string | 是 | 无 | 非空本地路径或 `:memory:`；父目录必须存在，见[文件边界](#入口与文件边界)。 |
| options.mode | string | 否 | `rw` | `rw`、`rwc`、`ro`，语义见下表。 |
| options.timeoutMs | number | 否 | 30000 | 1–600000 整数毫秒，从调用起计时。 |
| options.signal | AbortSignal | 否 | 无 | 进一步收紧本次操作的取消范围。 |

**返回值**

`Promise<OpenDeskSQLiteDatabase>`，仅在连接成功后 resolve；句柄不能跨 execution 传递，落盘文件可由后续
execution 重新打开。不存在的 `rw`/`ro` 文件不会被创建。

**行为与错误**

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

权限由入口/宿主授予，客户端 SQL 或 options 不能提权；未注入时访问 `SQLite` 是 JavaScript 名称错误，
并非 `SQLiteError`。路径/权限/驱动打开失败为 `OPEN_FAILED`，受保护路径为 `PROTECTED_PATH`，
参数错误为 `INVALID_ARGUMENT`，预取消为 `CANCELED`、截止时间为 `TIMEOUT`；失败不返回可用句柄。
错误字段见[错误](#错误)。

**示例**

在已授权的本地 execution 中，工作目录已有 `data/` 目录：

```js
const db = await SQLite.open({ path: 'data/tasks.sqlite', mode: 'rwc' });
try {
  await db.exec('CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY, title TEXT NOT NULL)');
} finally {
  await db.close();
}
```

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

## API 一览

| 方法 | 用途 |
| --- | --- |
| [SQLite.open(options)](#打开数据库sqliteopenoptions) | 打开 execution-owned 句柄。 |
| [db.exec(sql, params?, options?)](#dbexecsql-params-options) | 执行单条 SQL，返回影响行数。 |
| [db.query(sql, params?, options?)](#dbquerysql-params-options) | 返回有限的行对象数组。 |
| [db.batch(statements, options?)](#dbbatchstatements-options) | 在一个事务内执行一组语句。 |
| [db.close()](#dbclose) | 排队释放句柄，可重复调用。 |

## 句柄方法

以下 `db` 均为 `SQLite.open()` 返回的句柄；权限与路径边界见[入口与文件边界](#入口与文件边界)。
示例在已授权的本地 execution 内运行；除打开示例外，假设已有 `tasks(id INTEGER PRIMARY KEY,
 title TEXT NOT NULL)` 表及开放的 `db`，调用者最终在 `finally` 中关闭句柄。

## db.exec(sql, params?, options?)

执行一条顶层 SQL 并返回受影响行数。

**签名**

```ts
db.exec(
  sql: string,
  params?: OpenDeskSQLiteParams,
  options?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<{ changes: number }>
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| sql | string | 是 | 无 | 非空的单条 SQL；受[单语句规则](#单语句排队取消与写入结果)约束。 |
| params | OpenDeskSQLiteParams | 否 | 无绑定 | 位置数组或命名对象，见[参数、值与精度](#参数值与精度)。 |
| options | object | 否 | 无 | 只接受下列字段。 |
| options.timeoutMs | number | 否 | 30000 | 1–600000 整数毫秒，包含排队时间。 |
| options.signal | AbortSignal | 否 | 无 | 取消本次操作，不能延长 execution 生命周期。 |

**返回值**

`Promise<{ changes: number }>`，影响行数由 SQLite 返回；不提供行对象或 lastInsertId。

**行为与错误**

参数通过 SQLite 原生绑定。必须使用已授权、未关闭句柄；`ro` 连接拒绝写入为 `READ_ONLY`。
参数和 SQL 边界错误在执行前 reject；引擎语法、约束等失败为 `SQL_ERROR`，关闭中或已关闭为 `CLOSED`，
队列满为 `QUEUE_FULL`。`signal` 预取消为 `CANCELED`、截止时间为 `TIMEOUT`；预取消的写入状态为
`not_started`/`false`。SQL 开始后的失败可能为 `unknown`/`null`，不得自动重试。
完整错误码与状态见[错误](#错误)及[写入结果](#单语句排队取消与写入结果)。

**示例**

```js
const result = await db.exec('INSERT INTO tasks (title) VALUES (?)', ['参数绑定']);
console.log(result.changes);
```

## db.query(sql, params?, options?)

执行单条 SQL，返回完整且有界的行对象数组。

**签名**

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

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| sql | string | 是 | 无 | 非空单条 SQL，见[单语句规则](#单语句排队取消与写入结果)。 |
| params | OpenDeskSQLiteParams | 否 | 无绑定 | 位置数组或命名对象，见[参数、值与精度](#参数值与精度)。 |
| options | object | 否 | 无 | 只接受下列字段。 |
| options.timeoutMs | number | 否 | 30000 | 1–600000 整数毫秒，包含排队和读取。 |
| options.signal | AbortSignal | 否 | 无 | 取消本次查询。 |
| options.maxRows | number | 否 | 10000 | 1–100000 整数，结果行数上限。 |
| options.maxBytes | number | 否 | 8388608 | 1–67108864 整数，编码结果字节上限。 |

**返回值**

`Promise<Array<Record<string, OpenDeskSQLiteValue>>>`；没有记录时 resolve `[]`。
列类型和整数精度见[参数、值与精度](#参数值与精度)。

**行为与错误**

必须使用已授权、未关闭句柄；参数、单语句、队列及关闭错误见[错误](#错误)。语法、扫描等引擎错误为
`SQL_ERROR`；`signal` 预取消/执行取消为 `CANCELED`、超时为 `TIMEOUT`。只取消单次查询时，后续操作
仍可使用健康句柄；execution 取消则清理该 execution 的资源。

它不等同于安全意义的“只读”：只读边界
必须使用 `SQLite.open({ mode: 'ro' })`。例如 DML `... RETURNING` 也可以由 `query` 返回行；若它在
结果上限、取消或读取错误处失败，写入结果可能为 `writeState: 'unknown'` / `committed: null`，不得自动重试。

为避免无界结果，query 默认最多返回 **10,000 行**和 **8 MiB** 的编码结果数据。`maxRows` 可设为
1–100,000，`maxBytes` 可设为 1–64 MiB；任一上限触发时 reject `RESULT_LIMIT`，不会静默截断后返回部分行。

**示例**

```js
const rows = await db.query('SELECT id, title FROM tasks WHERE id > ?', [0], { maxRows: 100 });
console.log(rows);
```

## db.batch(statements, options?)

在同一个事务内按顺序执行一组 SQL，并只在完整成功时提交。

**签名**

```ts
db.batch(statements: Array<{ sql: string; params?: OpenDeskSQLiteParams }>,
  options?: { timeoutMs?: number; signal?: AbortSignal }
): Promise<{ results: Array<{ changes: number }> }>
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| statements | Array<object> | 是 | 无 | 1–256 个元素，全部在入队前校验。 |
| statements[].sql | string | 是 | 无 | 非空单条 SQL，不允许原始事务/连接控制。 |
| statements[].params | OpenDeskSQLiteParams | 否 | 无绑定 | 绑定规则见[参数、值与精度](#参数值与精度)。 |
| options | object | 否 | 无 | 只接受下列字段。 |
| options.timeoutMs | number | 否 | 30000 | 1–600000 整数毫秒，覆盖排队、事务、提交。 |
| options.signal | AbortSignal | 否 | 无 | 进一步限制整个 batch。 |

**返回值**

`Promise<{ results: Array<{ changes: number }> }>`，按输入顺序返回影响行数，不返回查询行。

**行为与错误**

权限来自打开句柄的入口；`ro` 写入为 `READ_ONLY`，约束等引擎错误为 `SQL_ERROR`，参数/SQL 边界、
`CLOSED`、`QUEUE_FULL` 见[错误](#错误)。预取消为 `CANCELED` 且 `not_started`/`false`；运行期取消或
超时分别为 `CANCELED` 或 `TIMEOUT`，应检查实际的写入状态。

`batch` 的每个元素是 `{ sql, params? }`（最多 256 个），并固定在**同一个物理连接**上的一个真实事务内执行。
全部元素成功才提交；提交点之前任一元素出错、超时或取消时尝试回滚整个 batch，不能用逐条独立提交冒充事务。
事务内失败后，只有显式回滚成功（或已确认事务结束）才报告 `rolled_back` / `false`。
COMMIT 失败后若回滚无法确认，则为 `unknown` / `null`，并关闭不确定的连接；不得自动重试。
若 COMMIT 已成功后才观察到取消，则 rejection 可报告 `committed` / `true`，不能声称已回滚。
成功时 `results` 与输入顺序一一对应。

首版不提供跨调用 `BEGIN`/`COMMIT`、transaction callback 或可跨句柄共享的事务 API。`BEGIN`、`COMMIT`、
`ROLLBACK`、`SAVEPOINT`、`RELEASE` 等原始事务控制语句均被拒绝，尤其不能放进 batch 绕过 owner。`ATTACH`、
`DETACH` 和 `VACUUM` 这类改变连接/文件边界的语句也不受此句柄支持。

**示例**

```js
const result = await db.batch([
  { sql: 'INSERT INTO tasks (title) VALUES (?)', params: ['first'] },
  { sql: 'INSERT INTO tasks (title) VALUES (?)', params: ['second'] },
], { timeoutMs: 5_000 });
console.log(result.results);
```

## db.close()

按 FIFO 顺序释放当前句柄。

**签名**

```ts
db.close(): Promise<void>
```

**参数**

无；不接受 options、signal 或 timeoutMs，传入非 undefined 参数会 reject `INVALID_ARGUMENT`。

**返回值**

`Promise<void>`，成功 resolve `undefined`。重复调用也成功；关闭过程中的调用复用关闭 Promise。

**行为与错误**

只作用于当前 execution 的句柄，不授予额外权限。物理关闭失败为 `CLOSE_FAILED`，Runtime teardown
期间可 reject `CANCELED`；完整字段见[错误](#错误)。关闭本身不承诺撤销已经提交的写入。

`close()` 可重复调用。第一次开始关闭后，句柄拒绝新的 `open` 后操作，正常 close 会等待已经进入该句柄队列
的操作结束，再释放连接、Rows、Stmt、worker、队列和 AbortSignal listener。脚本忘记 `close()` 时，
execution teardown 仍会关闭所有归该 execution 的句柄；但业务脚本应始终在 `finally` 中显式关闭。

**示例**

```js
try {
  console.log(await db.query('SELECT id, title FROM tasks'));
} finally {
  await db.close();
}
```

## 单语句、排队、取消与写入结果

每次 `query`、`exec` 和每个 batch 元素只接受一条顶层 SQL。一个可选结尾分号、字符串字面量或注释中的
分号不构成第二条语句；真正的多语句输入在执行前 reject，不能产生部分写入。

同一句柄的操作串行且最多排队 32 个等待操作；batch 从开始到提交/回滚期间不会被该句柄的其他操作插入。数据库 I/O 在
native worker 执行，Goja 参数读取、Promise settlement 和 AbortSignal listener 都回到所属 EventLoop，
不会把 SQLite 的锁等待、执行或结果读取阻塞到 JavaScript EventLoop 上。

execution cancel 或未捕获脚本异常会清理 execution 的工作；单次 `timeoutMs`、`AbortSignal` 或
SQL 错误结束对应操作，不意味着所有健康句柄都被关闭。正常的
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
