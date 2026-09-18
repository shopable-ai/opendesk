---
docType: index
---

# 文件、路径与数据

本地文件、JSON、路径、键值、SQL 与内置数据处理库

从 [Agent 短入口](README.md) 按任务进入本组；不顺序通读其他组。下表由唯一 Reference/类型确定性生成，不是另一份行为合同。

`node scripts/api-docs.js read <文档名> <方法名>` 返回正文及必要共享段；只读文档，不调用方法。类型中的公开声明不等于当前宿主已授权/已实现。摘要中的省略不用于执行决策。


## File

相对路径基于 Execution.workdir；JSON、句柄和普通同步方法语义不同。

来源：[file.md](../file.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `File.append(path: string, text: string, encoding?: string): void;` | 追加文本 | 有：持久化写入/删除，受路径或 SQL 约束；继承本节限制 | [File.append](../file.md#fileappendpath-text)；`read file File.append` |
| `File.appendBytes(path: string, bytes: OpenDeskByteInput): void;` | 追加字节 | 有：持久化写入/删除，受路径或 SQL 约束；继承本节限制 | [File.appendBytes](../file.md)；`read file File.appendBytes` **正文缺口：禁止据类型直接生成调用** |
| `File.copy(pathFrom: string, pathTo: string): void;` | 复制文件 | 有：持久化写入/删除，受路径或 SQL 约束；继承本节限制 | [File.copy](../file.md#filecopypathfrom-pathto)；`read file File.copy` |
| `File.create(path: string): void;` | 创建空文件 | 有：持久化写入/删除，受路径或 SQL 约束；继承本节限制 | [File.create](../file.md)；`read file File.create` **正文缺口：禁止据类型直接生成调用** |
| `File.createIfNotExists(path: string): void;` | 不存在时创建 | 有：持久化写入/删除，受路径或 SQL 约束；继承本节限制 | [File.createIfNotExists](../file.md)；`read file File.createIfNotExists` **正文缺口：禁止据类型直接生成调用** |
| `File.createWithDirs(path: string): void;` | 自动创建父目录后建文件 | 有：持久化写入/删除，受路径或 SQL 约束；继承本节限制 | [File.createWithDirs](../file.md)；`read file File.createWithDirs` 共享整页兜底 |
| `File.cwd(): string;` | 当前工作目录 | 纯计算/路径；不提交外部输入；继承本节限制 | [File.cwd](../file.md#filecwd)；`read file File.cwd` |
| `File.ensureDir(path: string): void;` | 确保目录存在 | 有：持久化写入/删除，受路径或 SQL 约束；继承本节限制 | [File.ensureDir](../file.md#fileensuredirpath)；`read file File.ensureDir` |
| `File.exists(path: string): boolean;` | 是否存在 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [File.exists](../file.md#fileexistspath)；`read file File.exists` |
| `File.getExtension(fileName: string): string;` | 取扩展名 | 纯计算/路径；不提交外部输入；继承本节限制 | [File.getExtension](../file.md)；`read file File.getExtension` **正文缺口：禁止据类型直接生成调用** |
| `File.getHumanReadableSize(bytes: number): string;` | 人类可读大小 | 纯计算/路径；不提交外部输入；继承本节限制 | [File.getHumanReadableSize](../file.md)；`read file File.getHumanReadableSize` **正文缺口：禁止据类型直接生成调用** |
| `File.getName(filePath: string): string;` | 取文件名 | 纯计算/路径；不提交外部输入；继承本节限制 | [File.getName](../file.md)；`read file File.getName` **正文缺口：禁止据类型直接生成调用** |
| `File.getNameWithoutExtension(filePath: string): string;` | 取不带扩展名文件名 | 纯计算/路径；不提交外部输入；继承本节限制 | [File.getNameWithoutExtension](../file.md)；`read file File.getNameWithoutExtension` **正文缺口：禁止据类型直接生成调用** |
| `File.getSimplifiedPath(path: string): string;` | 路径规范化 | 纯计算/路径；不提交外部输入；继承本节限制 | [File.getSimplifiedPath](../file.md)；`read file File.getSimplifiedPath` **正文缺口：禁止据类型直接生成调用** |
| `File.isDir(path: string): boolean;` | 是否目录 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [File.isDir](../file.md#fileisfilepath--fileisdirpath)；`read file File.isDir` |
| `File.isEmptyDir(path: string): boolean;` | 是否空目录 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [File.isEmptyDir](../file.md#fileisemptydirpath)；`read file File.isEmptyDir` |
| `File.isFile(path: string): boolean;` | 是否文件 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [File.isFile](../file.md#fileisfilepath--fileisdirpath)；`read file File.isFile` |
| `File.join(parent: string, ...children: string[]): string;` | 拼路径 | 纯计算/路径；不提交外部输入；继承本节限制 | [File.join](../file.md#filejoinparent-children)；`read file File.join` |
| `File.listDir(path: string): string[];` | 列目录 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [File.listDir](../file.md#filelistdirpath)；`read file File.listDir` |
| `File.move(path: string, newPath: string): void;` | 移动 | 有：持久化写入/删除，受路径或 SQL 约束；继承本节限制 | [File.move](../file.md#filemovepath-newpath)；`read file File.move` |
| `File.open(path: string, mode: "r" \| "w" \| "a"): OpenDeskFileHandle;` | 按模式打开文件 | 依模式：可能创建/截断；返回需关闭的句柄；继承本节限制 | [File.open](../file.md#fileopenpath-mode)；`read file File.open` |
| `File.path(relativePath: string): string;` | 获取绝对路径 | 纯计算/路径；不提交外部输入；继承本节限制 | [File.path](../file.md#filepathrelativepath)；`read file File.path` |
| `File.read(path: string, encoding?: string): string;` | 读取文本 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [File.read](../file.md#filereadpath)；`read file File.read` |
| `File.readBytes(path: string): ArrayBuffer;` | 读取字节 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [File.readBytes](../file.md#filereadbytespath)；`read file File.readBytes` |
| `File.readJSON(filePath: string, options?: OpenDeskFileJSONReadOptions): Promise<unknown>;` | 异步读取并按 Runtime JSON.parse 解析 JSON | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [File.readJSON](../file.md#filereadjsonfilepath-options)；`read file File.readJSON` |
| `File.realPath(path: string): string;` | 解析一个**已经存在**的文件或目录，跟随符号链接／Windows reparse point，并返回宿主文件系统的 canonical 绝对路径。它只做路径解析，不创建…（摘要） | 需核对正文；不能假定无副作用；继承本节限制 | [File.realPath](../file.md#filerealpathpath)；`read file File.realPath` |
| `File.remove(path: string): void;` | 删除文件 | 有：持久化写入/删除，受路径或 SQL 约束；继承本节限制 | [File.remove](../file.md)；`read file File.remove` **正文缺口：禁止据类型直接生成调用** |
| `File.removeDir(path: string): void;` | 删除目录 | 有：持久化写入/删除，受路径或 SQL 约束；继承本节限制 | [File.removeDir](../file.md)；`read file File.removeDir` **正文缺口：禁止据类型直接生成调用** |
| `File.rename(path: string, newName: string): void;` | 重命名 | 有：持久化写入/删除，受路径或 SQL 约束；继承本节限制 | [File.rename](../file.md)；`read file File.rename` **正文缺口：禁止据类型直接生成调用** |
| `File.renameWithoutExtension(path: string, newName: string): void;` | 重命名但保留扩展名 | 有：持久化写入/删除，受路径或 SQL 约束；继承本节限制 | [File.renameWithoutExtension](../file.md)；`read file File.renameWithoutExtension` **正文缺口：禁止据类型直接生成调用** |
| `File.stat(path: string): OpenDeskFileStat \| null;` | 查询跨平台稳定文件元数据 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [File.stat](../file.md#filestatpath)；`read file File.stat` |
| `File.write(path: string, text: string, encoding?: string): void;` | 写文本 | 有：持久化写入/删除，受路径或 SQL 约束；继承本节限制 | [File.write](../file.md#filewritepath-text)；`read file File.write` |
| `File.writeBytes(path: string, bytes: OpenDeskByteInput): void;` | 写字节 | 有：持久化写入/删除，受路径或 SQL 约束；继承本节限制 | [File.writeBytes](../file.md#filewritebytespath-bytes)；`read file File.writeBytes` |
| `File.writeJSON(filePath: string, value: unknown, options?: OpenDeskFileJSONWriteOptions): Promise<void>;` | 异步、安全替换地写入 JSON | 有：持久化写入/删除，受路径或 SQL 约束；继承本节限制 | [File.writeJSON](../file.md#filewritejsonfilepath-value-options)；`read file File.writeJSON` |
| `File.writeNew(path: string, text: string, encoding?: string): void;` | 独占创建一个新文本文件；目标或父目录别名存在风险时拒绝 | 有：持久化写入/删除，受路径或 SQL 约束；继承本节限制 | [File.writeNew](../file.md#filewritenewpath-text)；`read file File.writeNew` |
| `FileHandle.close(): void;` | `File.open()` 返回受控的同步 `FileHandle`，适用于需要维护当前位置、截断或请求落盘的场景；普通完整文件读写优先使用 `File.read()`、…（摘要） | 需核对正文；不能假定无副作用；继承本节限制 | [FileHandle.close](../file.md#fileopenpath-mode)；`read file FileHandle.close` |
| `FileHandle.read(maxBytes?: number): string;` | `File.open()` 返回受控的同步 `FileHandle`，适用于需要维护当前位置、截断或请求落盘的场景；普通完整文件读写优先使用 `File.read()`、…（摘要） | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [FileHandle.read](../file.md#fileopenpath-mode)；`read file FileHandle.read` |
| `FileHandle.readBytes(maxBytes?: number): ArrayBuffer;` | `File.open()` 返回受控的同步 `FileHandle`，适用于需要维护当前位置、截断或请求落盘的场景；普通完整文件读写优先使用 `File.read()`、…（摘要） | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [FileHandle.readBytes](../file.md#fileopenpath-mode)；`read file FileHandle.readBytes` |
| `FileHandle.seek(offset: number, whence?: 'start' \| 'current' \| 'end'): number;` | `File.open()` 返回受控的同步 `FileHandle`，适用于需要维护当前位置、截断或请求落盘的场景；普通完整文件读写优先使用 `File.read()`、…（摘要） | 需核对正文；不能假定无副作用；继承本节限制 | [FileHandle.seek](../file.md#fileopenpath-mode)；`read file FileHandle.seek` |
| `FileHandle.sync(): void;` | `File.open()` 返回受控的同步 `FileHandle`，适用于需要维护当前位置、截断或请求落盘的场景；普通完整文件读写优先使用 `File.read()`、…（摘要） | 需核对正文；不能假定无副作用；继承本节限制 | [FileHandle.sync](../file.md#fileopenpath-mode)；`read file FileHandle.sync` |
| `FileHandle.truncate(size: number): void;` | `File.open()` 返回受控的同步 `FileHandle`，适用于需要维护当前位置、截断或请求落盘的场景；普通完整文件读写优先使用 `File.read()`、…（摘要） | 需核对正文；不能假定无副作用；继承本节限制 | [FileHandle.truncate](../file.md#fileopenpath-mode)；`read file FileHandle.truncate` |
| `FileHandle.write(text: string): void;` | `File.open()` 返回受控的同步 `FileHandle`，适用于需要维护当前位置、截断或请求落盘的场景；普通完整文件读写优先使用 `File.read()`、…（摘要） | 需核对正文；不能假定无副作用；继承本节限制 | [FileHandle.write](../file.md#fileopenpath-mode)；`read file FileHandle.write` |
| `FileHandle.writeBytes(bytes: OpenDeskByteInput): void;` | `File.open()` 返回受控的同步 `FileHandle`，适用于需要维护当前位置、截断或请求落盘的场景；普通完整文件读写优先使用 `File.read()`、…（摘要） | 需核对正文；不能假定无副作用；继承本节限制 | [FileHandle.writeBytes](../file.md#fileopenpath-mode)；`read file FileHandle.writeBytes` |


## path

状态、前置权限、平台、错误/等待/取消与副作用按选中正文核对。

来源：[path.md](../path.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `path.basename(path: string, suffix?: string): string;` | 返回最后路径段，可去除精确 suffix。 | 纯计算/路径；不提交外部输入；继承本节限制 | [path.basename](../path.md#pathbasenamevalue-suffix)；`read path path.basename` |
| `path.delimiter: string;` | 当前平台路径列表分隔符。 | 纯计算/路径；不提交外部输入；继承本节限制 | [path.delimiter](../path.md#pathdelimiter)；`read path path.delimiter` |
| `path.dirname(path: string): string;` | 返回父目录。 | 纯计算/路径；不提交外部输入；继承本节限制 | [path.dirname](../path.md#pathdirnamevalue)；`read path path.dirname` |
| `path.extname(path: string): string;` | 返回扩展名。 | 纯计算/路径；不提交外部输入；继承本节限制 | [path.extname](../path.md#pathextnamevalue)；`read path path.extname` |
| `path.isAbsolute(path: string): boolean;` | 判断是否为当前平台绝对路径。 | 纯计算/路径；不提交外部输入；继承本节限制 | [path.isAbsolute](../path.md#pathisabsolutevalue)；`read path path.isAbsolute` |
| `path.join(...paths: string[]): string;` | 连接并规范化路径片段。 | 纯计算/路径；不提交外部输入；继承本节限制 | [path.join](../path.md#pathjoinparts)；`read path path.join` |
| `path.normalize(path: string): string;` | 规范化路径字符串。 | 纯计算/路径；不提交外部输入；继承本节限制 | [path.normalize](../path.md#pathnormalizevalue)；`read path path.normalize` |
| `path.relative(from: string, to: string): string;` | 返回相对路径。 | 纯计算/路径；不提交外部输入；继承本节限制 | [path.relative](../path.md#pathrelativefrom-to)；`read path path.relative` |
| `path.resolve(...paths: string[]): string;` | 以 `Execution.workdir` 为 fallback 基准解析绝对路径。 | 纯计算/路径；不提交外部输入；继承本节限制 | [path.resolve](../path.md#pathresolveparts)；`read path path.resolve` |
| `path.sep: string;` | 当前平台目录分隔符。 | 纯计算/路径；不提交外部输入；继承本节限制 | [path.sep](../path.md#pathsep)；`read path path.sep` |


## AppStorage

状态、前置权限、平台、错误/等待/取消与副作用按选中正文核对。

来源：[storage.md](../storage.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `AppStorage.clear(): void;` | 清空当前存储 | 有：持久化写入/删除，受路径或 SQL 约束；继承本节限制 | [AppStorage.clear](../storage.md#appstorageclear)；`read storage AppStorage.clear` |
| `AppStorage.getItem(key: string): string;` | 读取字符串值 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [AppStorage.getItem](../storage.md)；`read storage AppStorage.getItem` 共享整页兜底 |
| `AppStorage.getLength(): number;` | 键数量 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [AppStorage.getLength](../storage.md#appstoragegetlength--appstoragekeyindex)；`read storage AppStorage.getLength` |
| `AppStorage.key(index: number): string;` | 按索引取键名 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [AppStorage.key](../storage.md#appstoragegetlength--appstoragekeyindex)；`read storage AppStorage.key` |
| `AppStorage.removeItem(key: string): void;` | 删除键 | 有：持久化写入/删除，受路径或 SQL 约束；继承本节限制 | [AppStorage.removeItem](../storage.md#appstorageremoveitemkey)；`read storage AppStorage.removeItem` |
| `AppStorage.setItem(key: string, value: unknown): void;` | 写入值 | 有：持久化写入/删除，受路径或 SQL 约束；继承本节限制 | [AppStorage.setItem](../storage.md#appstoragesetitemkey-value)；`read storage AppStorage.setItem` |


## SQLite

可信本地 execution；有界 SQL/队列/取消，句柄必须关闭。

来源：[sqlite.md](../sqlite.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `SQLite.open(options: OpenDeskSQLiteOpenOptions): Promise<OpenDeskSQLiteDatabase>;` | `timeoutMs` 是本次打开及其进入句柄队列前的额外 deadline；`signal` 是本次操作额外的 `AbortSignal`。两者只能收紧 executi…（摘要） | 依模式：可能创建/截断；返回需关闭的句柄；继承本节限制 | [SQLite.open](../sqlite.md#打开数据库sqliteopenoptions)；`read sqlite SQLite.open` |
| `db.batch(statements: OpenDeskSQLiteBatchStatement[], options?: OpenDeskSQLiteOperationOptions): Promise<OpenDeskSQLiteBatchResult>;` | `batch` 的每个元素是 `{ sql, params? }`（最多 256 个），并固定在**同一个物理连接**上的一个真实事务内执行。 全部元素成功才提交；在提交…（摘要） | 有：持久化写入/删除，受路径或 SQL 约束；继承本节限制 | [db.batch](../sqlite.md#dbbatchstatements-options)；`read sqlite db.batch` |
| `db.close(): Promise<void>;` | `close()` 可重复调用。第一次开始关闭后，句柄拒绝新的 `open` 后操作，正常 close 会等待已经进入该句柄队列 的操作结束，再释放连接、Rows、Stm…（摘要） | 需核对正文；不能假定无副作用；继承本节限制 | [db.close](../sqlite.md#dbclose)；`read sqlite db.close` |
| `db.exec(sql: string, params?: OpenDeskSQLiteParams, options?: OpenDeskSQLiteOperationOptions): Promise<OpenDeskSQLiteExecResult>;` | 执行一条顶层 SQL 并返回受影响行数。参数始终由 SQLite 原生绑定，绝不通过字符串拼接生成 SQL。 | 有：持久化写入/删除，受路径或 SQL 约束；继承本节限制 | [db.exec](../sqlite.md#dbexecsql-params-options)；`read sqlite db.exec` |
| `db.query(sql: string, params?: OpenDeskSQLiteParams, options?: OpenDeskSQLiteQueryOptions): Promise<Record<string, OpenDeskSQLiteValue>[]>;` | 执行一条顶层 SQL 并返回行对象数组；没有记录时 resolve `[]`。它不等同于安全意义的“只读”：只读边界 必须使用 `SQLite.open({ mode: …（摘要） | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [db.query](../sqlite.md#dbquerysql-params-options)；`read sqlite db.query` |


## jslibs

Runtime 默认预加载的第三方库；按库级能力发现，不把第三方完整 API 复制成 OpenDesk 方法合同。

来源：[libs.md](../libs.md)。

本节列的是 Runtime bundled library 能力卡，不是 OpenDesk 方法表。Agent 先确认库、版本/固定身份、全局入口和用途；不在目录展开第三方完整 API。

| 库 | Runtime 入口 | 版本 / 固定身份 | 主要用途 | 默认加载 | 详细信息 |
| --- | --- | --- | --- | --- | --- |
| Lodash | `_` | 4.17.21 | 数组、集合、对象与函数工具；包括 flatten、groupBy、uniq、debounce 等 | 是 | [Lodash](../libs.md#lodash)；`read libs "#lodash"` |
| YAML / js-yaml | `YAML` | 5.4.1 | YAML 解析与序列化；稳定入口为 parse/stringify | 是 | [YAML / js-yaml](../libs.md#yaml)；`read libs "#yaml"` |
| CSV / Papa Parse | `CSV` | 5.7.0 | CSV 解析与生成；稳定入口为 parse/stringify | 是 | [CSV / Papa Parse](../libs.md#csv)；`read libs "#csv"` |
| query-string | `queryString` | 仓库固定快照 | URL query 参数解析与拼接 | 是 | [query-string](../libs.md#querystring)；`read libs "#querystring"` |
| Moment | `moment` | 2.18.1 | 日期时间格式化、加减与比较；现有 Recipe 兼容能力 | 是 | [Moment](../libs.md#moment)；`read libs "#moment"` |
| Cheerio | `cheerio` | 仓库固定快照 | HTML 解析与类 jQuery 节点查询 | 是 | [Cheerio](../libs.md#cheerio)；`read libs "#cheerio"` |
| js-beautify | `window.js_beautify` | 1.14.9 | 格式化 JavaScript 文本 | 是 | [js-beautify](../libs.md#js-beautify)；`read libs "#js-beautify"` |


## 生成依据

维护命令：`node scripts/api-docs.js generate`；校验：`node scripts/api-docs.js check`。不能手工改本表；修改 canonical 正文/类型后重生成。下面是内容版本，不把旧行号当成当前定位。


- `docs/api/file.md` SHA-256 `3e370158c9523503b9f3dc0f9517fb773d97ab4a3f84aedd248c7386effe0b48`

- `types/File.d.ts` SHA-256 `867b93bc051f2f21ae08e7c240d2c39432d891b4d835091909409adec364c3e1`

- `docs/api/path.md` SHA-256 `a247eae9631b28fa8062d5a9cbc8fbe347c6f6b4ae470da08b75ff63dadab1df`

- `types/path.d.ts` SHA-256 `051e27eb1542d59ffb4670c9d03d3f2fe5edc90c6988e6ec8aa2cccdacd452c2`

- `docs/api/storage.md` SHA-256 `25ab75c9467511ef79aafad5954b174602dea86431f7c80f1658bbdde851f1a6`

- `types/AppStorage.d.ts` SHA-256 `7a623ed3a209e476aa776d7c4296a47b90a2670aa3a467c689f5f1183bd615ba`

- `docs/api/sqlite.md` SHA-256 `174c8e2e3c838c8154309e89c206dadce5010513cdc3a04c09a5b2be5cb7a2c4`

- `types/sqlite.d.ts` SHA-256 `0026c6278e61d03029ca89dc8f997017db8ded1c77b3f7d5213af7c369dd458c`

- `docs/api/libs.md` SHA-256 `68e835bc9996066afb5fa7916b8593ab1437600a7bcc7a9a28c1eb7cfea994e7`
