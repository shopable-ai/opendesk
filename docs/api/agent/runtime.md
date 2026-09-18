---
docType: index
---

# 执行、系统与进程

执行上下文、计时取消、系统信息、子进程与音频

从 [Agent 短入口](README.md) 按任务进入本组；不顺序通读其他组。下表由唯一 Reference/类型确定性生成，不是另一份行为合同。

`node scripts/api-docs.js read <文档名> <方法名>` 返回正文及必要共享段；只读文档，不调用方法。类型中的公开声明不等于当前宿主已授权/已实现。摘要中的省略不用于执行决策。


## Execution

状态、前置权限、平台、错误/等待/取消与副作用按选中正文核对。

来源：[execution.md](../execution.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `Execution.activationSource: OpenDeskExecutionActivationSource;` | Custom UI capability 的授权来源。 | 读取当前执行/资源上下文；`string` | [Execution.activationSource](../execution.md#executionactivationsource)；`read execution Execution.activationSource` |
| `Execution.artifactDir: string;` | 当前运行 artifact 根目录。 | 读取当前执行/资源上下文；`string` | [Execution.artifactDir](../execution.md#executionartifactdir)；`read execution Execution.artifactDir` |
| `Execution.env: Readonly<Record<string, string>>;` | 冻结的环境字符串快照。 | 读取当前执行/资源上下文；`Readonly<Record<string,string>>` | [Execution.env](../execution.md#executionenv)；`read execution Execution.env` |
| `Execution.executionId: string;` | 当前 execution 完整关联 ID。 | 读取当前执行/资源上下文；`string` | [Execution.executionId](../execution.md#executionexecutionid)；`read execution Execution.executionId` |
| `Execution.ext: string;` | 实际交给 JavaScript Runtime 的源码扩展名。 | 读取当前执行/资源上下文；`string` | [Execution.ext](../execution.md#executionext)；`read execution Execution.ext` |
| `Execution.id: string;` | `executionId` 的短别名。 | 读取当前执行/资源上下文；`string` | [Execution.id](../execution.md#executionid)；`read execution Execution.id` |
| `Execution.input: unknown;` | 当前 recipe 的结构化输入。 | 读取当前执行/资源上下文；JSON value | [Execution.input](../execution.md#executioninput)；`read execution Execution.input` |
| `Execution.scriptDir: string \| null;` | `scriptPath` 父目录。 | 读取当前执行/资源上下文；`string \\| null` | [Execution.scriptDir](../execution.md#executionscriptdir)；`read execution Execution.scriptDir` |
| `Execution.scriptHash: string;` | 实际执行源码 SHA-256。 | 读取当前执行/资源上下文；`string` | [Execution.scriptHash](../execution.md#executionscripthash)；`read execution Execution.scriptHash` |
| `Execution.scriptPath: string \| null;` | 可信文件入口的规范化绝对路径。 | 读取当前执行/资源上下文；`string \\| null` | [Execution.scriptPath](../execution.md#executionscriptpath)；`read execution Execution.scriptPath` |
| `Execution.source: string;` | 脚本来源标签。 | 读取当前执行/资源上下文；`string` | [Execution.source](../execution.md#executionsource)；`read execution Execution.source` |
| `Execution.stack: string;` | Runtime 兼容模式元数据。 | 读取当前执行/资源上下文；`string` | [Execution.stack](../execution.md#executionstack)；`read execution Execution.stack` |
| `Execution.workdir: string;` | 当前 execution 工作目录。 | 读取当前执行/资源上下文；`string` | [Execution.workdir](../execution.md#executionworkdir)；`read execution Execution.workdir` |


## 全局接口（Global APIs）

状态、前置权限、平台、错误/等待/取消与副作用按选中正文核对。

来源：[global-apis.md](../global-apis.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `AbortController / AbortSignal：取消 HTTP 请求` | `AbortController` 与 `AbortSignal` 是运行时提供的轻量兼容接口，主要用于取消在途的 `http.request()` 或 `axios` …（摘要） | 需核对正文；不能假定无副作用；继承本节限制 | [AbortController](../global-apis.md#abortcontroller--abortsignal取消-http-请求)；`read global-apis AbortController` |
| `AbortController / AbortSignal：取消 HTTP 请求` | `AbortController` 与 `AbortSignal` 是运行时提供的轻量兼容接口，主要用于取消在途的 `http.request()` 或 `axios` …（摘要） | 需核对正文；不能假定无副作用；继承本节限制 | [AbortSignal](../global-apis.md#abortcontroller--abortsignal取消-http-请求)；`read global-apis AbortSignal` |
| `new ReadableStream(underlyingSource?, strategy?) stream.getReader(): ReadableStreamDefaultReader stream.cancel(reason?): Promise<void>` | 创建按需产生数据块、可由 reader 或 async iterator 消费的流： `underlyingSource.start(controller)`：构造时初始…（摘要） | 需核对正文；不能假定无副作用；继承本节限制 | [ReadableStream](../global-apis.md#readablestream)；`read global-apis ReadableStream` |
| `new TextDecoder(label?, options?) decoder.decode(input?, options?): string` | 把 `ArrayBuffer` 或 typed-array view 中的 UTF-8 字节解码为字符串： `label`：支持 `utf-8`、`utf8` 或 `un…（摘要） | 需核对正文；不能假定无副作用；继承本节限制 | [TextDecoder](../global-apis.md#textdecoder)；`read global-apis TextDecoder` |
| `new TextEncoder() encoder.encode(input?): Uint8Array encoder.encodeInto(input, destination): { read: number; written: number }` | 把字符串编码为标准 UTF-8 字节： `input`：待编码字符串；`encode()` 省略时使用空字符串。 `destination`：`encodeInto()`…（摘要） | 需核对正文；不能假定无副作用；继承本节限制 | [TextEncoder](../global-apis.md#textencoder)；`read global-apis TextEncoder` |
| `new TransformStream(transformer?)` | 把 writable 侧输入转换后送到 readable 侧： `transformer.start(controller)`：初始化转换器。 `transformer.…（摘要） | 需核对正文；不能假定无副作用；继承本节限制 | [TransformStream](../global-apis.md#transformstream)；`read global-apis TransformStream` |
| `URL：解析和拼接 URL` | 常用字段包括 `href`、`origin`、`protocol`、`host`、`hostname`、`port`、`pathname`、 `search`、`hash…（摘要） | 需核对正文；不能假定无副作用；继承本节限制 | [URL](../global-apis.md#url解析和拼接-url)；`read global-apis URL` |
| `URLSearchParams：查询参数` | 使用 `URLSearchParams` 生成查询字符串： 支持的接口： 当前实现覆盖 OpenDesk 脚本常用的查询参数场景；它不是完整浏览器 URL 或 DOM A…（摘要） | 需核对正文；不能假定无副作用；继承本节限制 | [URLSearchParams](../global-apis.md#urlsearchparams查询参数)；`read global-apis URLSearchParams` |
| `new WritableStream(underlyingSink?) stream.getWriter(): WritableStreamDefaultWriter stream.abort(reason?): Promise<void> stream.close(): Promise<void>` | 创建顺序接收数据块的 writable 流： `underlyingSink.start(controller)`：构造时初始化 sink。 `underlyingSin…（摘要） | 需核对正文；不能假定无副作用；继承本节限制 | [WritableStream](../global-apis.md#writablestream)；`read global-apis WritableStream` |
| `alert(message: string \| OpenDeskAlertOptions): Promise<void>;` | OpenDesk 的同名全局函数是 Dialog API 的 Promise alias，和浏览器的同步 API 不同：它们不会阻塞 Runtime EventLo…（摘…（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [alert](../global-apis.md#alert--confirm--prompt异步原生-dialog)；`read global-apis alert` |
| `cancelAnimationFrame(id: OpenDeskTimerId): void;` | `requestAnimationFrame()` 当前由约 60 FPS 的 timer 兼容实现提供，回调会收到毫秒时间戳。 它不会等待浏览器 DOM 绘制，也不代表…（摘要） | 需核对正文；不能假定无副作用；继承本节限制 | [cancelAnimationFrame](../global-apis.md#requestanimationframe--cancelanimationframe帧回调)；`read global-apis cancelAnimationFrame` |
| `clearInterval(id: OpenDeskTimerId): void;` | 周期任务必须在完成条件满足后调用 `clearInterval()`。不要用无限周期任务维持脚本生命周期； 需要等待窗口关闭或 UI 事件时，请使用对应的页面或 Cust…（摘要） | 需核对正文；不能假定无副作用；继承本节限制 | [clearInterval](../global-apis.md#setinterval--clearinterval周期计时器)；`read global-apis clearInterval` |
| `clearTimeout(id: OpenDeskTimerId): void;` | `delay` 使用毫秒；省略时由 Runtime 使用默认延迟。取消后回调不会执行。 | 需核对正文；不能假定无副作用；继承本节限制 | [clearTimeout](../global-apis.md#settimeout--cleartimeout一次性计时器)；`read global-apis clearTimeout` |
| `confirm(message: string \| OpenDeskConfirmOptions): Promise<boolean>;` | OpenDesk 的同名全局函数是 Dialog API 的 Promise alias，和浏览器的同步 API 不同：它们不会阻塞 Runtime EventLo…（摘…（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [confirm](../global-apis.md#alert--confirm--prompt异步原生-dialog)；`read global-apis confirm` |
| `console.clear(): void;` | 清理终端显示 | 需核对正文；不能假定无副作用；继承本节限制 | [console.clear](../global-apis.md)；`read global-apis console.clear` 共享整页兜底 |
| `console.debug(...args: unknown[]): void;` | 调试日志 | 需核对正文；不能假定无副作用；继承本节限制 | [console.debug](../global-apis.md)；`read global-apis console.debug` 共享整页兜底 |
| `console.error(...args: unknown[]): void;` | 错误日志 | 需核对正文；不能假定无副作用；继承本节限制 | [console.error](../global-apis.md)；`read global-apis console.error` 共享整页兜底 |
| `console.group(label: string): void;` | 分组开始标记 | 需核对正文；不能假定无副作用；继承本节限制 | [console.group](../global-apis.md#consolegrouplabel--consolegroupendlabel)；`read global-apis console.group` |
| `console.groupEnd(label: string): void;` | 分组结束标记 | 需核对正文；不能假定无副作用；继承本节限制 | [console.groupEnd](../global-apis.md#consolegrouplabel--consolegroupendlabel)；`read global-apis console.groupEnd` |
| `console.info(...args: unknown[]): void;` | 信息日志 | 需核对正文；不能假定无副作用；继承本节限制 | [console.info](../global-apis.md)；`read global-apis console.info` 共享整页兜底 |
| `console.log(...args: unknown[]): void;` | 普通日志 | 需核对正文；不能假定无副作用；继承本节限制 | [console.log](../global-apis.md)；`read global-apis console.log` 共享整页兜底 |
| `console.table(data: unknown): void;` | 打印 JSON 风格表格 | 需核对正文；不能假定无副作用；继承本节限制 | [console.table](../global-apis.md#consoletabledata)；`read global-apis console.table` |
| `console.time(label: string): void;` | 计时开始标记 | 需核对正文；不能假定无副作用；继承本节限制 | [console.time](../global-apis.md#consoletimelabel--consoletimeendlabel)；`read global-apis console.time` |
| `console.timeEnd(label: string): void;` | 计时结束标记 | 需核对正文；不能假定无副作用；继承本节限制 | [console.timeEnd](../global-apis.md#consoletimelabel--consoletimeendlabel)；`read global-apis console.timeEnd` |
| `console.warn(...args: unknown[]): void;` | 警告日志 | 需核对正文；不能假定无副作用；继承本节限制 | [console.warn](../global-apis.md)；`read global-apis console.warn` 共享整页兜底 |
| `copyToClipboard(text: string): void;` | 当脚本只需要读写文本时，可以直接使用全局函数： 需要清空剪贴板、处理平台重试或使用完整对象接口时，请阅读 Clipboard API。 | 需核对正文；不能假定无副作用；继承本节限制 | [copyToClipboard](../global-apis.md#copytoclipboard--getclipboard剪贴板快捷函数)；`read global-apis copyToClipboard` |
| `crypto.getRandomValues<T extends OpenDeskIntegerTypedArray>(array: T): T;` | 由宿主 `crypto/rand` 提供，不启动外部 Runtime | 观察/查询；可能读取敏感数据，不等于业务完成；安全随机字节与 UUID v4 | [crypto.getRandomValues](../global-apis.md#cryptogetrandomvalues)；`read global-apis crypto.getRandomValues` |
| `crypto.randomUUID(): string;` | 由宿主 `crypto/rand` 提供，不启动外部 Runtime | 需核对正文；不能假定无副作用；安全随机字节与 UUID v4 | [crypto.randomUUID](../global-apis.md#cryptorandomuuid)；`read global-apis crypto.randomUUID` |
| `delay(milliseconds?: number): Promise<void>;` | 三者都返回 `Promise<void>`，等待期间不会阻塞 Runtime 事件循环。`delay()` 是推荐的通用名称， `sleep()` 和 `sleepSec…（摘要） | 需核对正文；不能假定无副作用；继承本节限制 | [delay](../global-apis.md#delay--sleep--sleepseconds固定等待)；`read global-apis delay` |
| `getClipboard(): string;` | 当脚本只需要读写文本时，可以直接使用全局函数： 需要清空剪贴板、处理平台重试或使用完整对象接口时，请阅读 Clipboard API。 | 需核对正文；不能假定无副作用；继承本节限制 | [getClipboard](../global-apis.md#copytoclipboard--getclipboard剪贴板快捷函数)；`read global-apis getClipboard` |
| `notify(message: string): void;`（2 个声明；--types 核对） | `notify()` 是全局系统通知函数： 它的完整参数、同步返回、平台后端、权限和可见性边界见 notify。通知显示不是业务成功或执行证据的替代品。 | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [notify](../global-apis.md#notify系统通知)；`read global-apis notify` |
| `prompt(message: string \| OpenDeskPromptOptions): Promise<string \| null>;` | OpenDesk 的同名全局函数是 Dialog API 的 Promise alias，和浏览器的同步 API 不同：它们不会阻塞 Runtime EventLo…（摘…（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [prompt](../global-apis.md#alert--confirm--prompt异步原生-dialog)；`read global-apis prompt` |
| `queueMicrotask(callback: () => void): void;` | 在当前同步 JavaScript job 结束后、后续 timer 前排队一个回调。 `callback`：需要排队的函数。 `undefined`。 回调使用当前 Go…（摘要） | 需核对正文；不能假定无副作用；继承本节限制 | [queueMicrotask](../global-apis.md#queuemicrotask)；`read global-apis queueMicrotask` |
| `requestAnimationFrame(callback: (timestamp: number) => void): OpenDeskTimerId;` | `requestAnimationFrame()` 当前由约 60 FPS 的 timer 兼容实现提供，回调会收到毫秒时间戳。 它不会等待浏览器 DOM 绘制，也不代表…（摘要） | 需核对正文；不能假定无副作用；继承本节限制 | [requestAnimationFrame](../global-apis.md#requestanimationframe--cancelanimationframe帧回调)；`read global-apis requestAnimationFrame` |
| `setInterval(callback: () => void, delay?: number): OpenDeskTimerId;` | 周期任务必须在完成条件满足后调用 `clearInterval()`。不要用无限周期任务维持脚本生命周期； 需要等待窗口关闭或 UI 事件时，请使用对应的页面或 Cust…（摘要） | 需核对正文；不能假定无副作用；继承本节限制 | [setInterval](../global-apis.md#setinterval--clearinterval周期计时器)；`read global-apis setInterval` |
| `setTimeout(callback: () => void, delay?: number): OpenDeskTimerId;` | `delay` 使用毫秒；省略时由 Runtime 使用默认延迟。取消后回调不会执行。 | 需核对正文；不能假定无副作用；继承本节限制 | [setTimeout](../global-apis.md#settimeout--cleartimeout一次性计时器)；`read global-apis setTimeout` |
| `sleep(ms: number): Promise<void>;` | 三者都返回 `Promise<void>`，等待期间不会阻塞 Runtime 事件循环。`delay()` 是推荐的通用名称， `sleep()` 和 `sleepSec…（摘要） | 需核对正文；不能假定无副作用；继承本节限制 | [sleep](../global-apis.md#delay--sleep--sleepseconds固定等待)；`read global-apis sleep` |
| `sleepSeconds(seconds: number): Promise<void>;` | 三者都返回 `Promise<void>`，等待期间不会阻塞 Runtime 事件循环。`delay()` 是推荐的通用名称， `sleep()` 和 `sleepSec…（摘要） | 需核对正文；不能假定无副作用；继承本节限制 | [sleepSeconds](../global-apis.md#delay--sleep--sleepseconds固定等待)；`read global-apis sleepSeconds` |


## System

状态、前置权限、平台、错误/等待/取消与副作用按选中正文核对。

来源：[system.md](../system.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `System.delay(milliseconds?: number): Promise<void>;` | 非阻塞等待，不休眠主机 | 需核对正文；不能假定无副作用；继承本节限制 | [System.delay](../system.md#systemdelaymilliseconds)；`read system System.delay` |
| `System.getDirectoryContents(path: string): Array<Record<string, unknown>>;` | 列目录内容 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [System.getDirectoryContents](../system.md#systemgetdirectorycontentspath)；`read system System.getDirectoryContents` |
| `System.getEnv(name: string): string \| undefined;`（2 个声明；--types 核对） | 从本次 execution 的有效环境快照读取一个键 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [System.getEnv](../system.md#systemgetenv--systemhasenv)；`read system System.getEnv` |
| `System.getExecutablePath(): string;` | 当前可执行文件路径 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [System.getExecutablePath](../system.md#systemgetexecutablepath)；`read system System.getExecutablePath` |
| `System.getFingerprint(): string;` | 生成设备指纹 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [System.getFingerprint](../system.md#systemgetfingerprint)；`read system System.getFingerprint` |
| `System.getNetworkConnections(): OpenDeskNetworkConnectionInfo[];` | 获取活动网络连接 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [System.getNetworkConnections](../system.md#systemgetnetworkconnections)；`read system System.getNetworkConnections` |
| `System.getNetworkInterfaces(): OpenDeskNetworkInterfaceInfo[];` | 获取网络接口统计 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [System.getNetworkInterfaces](../system.md)；`read system System.getNetworkInterfaces` **正文缺口：禁止据类型直接生成调用** |
| `System.getPlatformInfo(): OpenDeskPlatformInfo;` | 获取 Runtime OS、架构和进程信息 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [System.getPlatformInfo](../system.md#systemgetplatforminfo)；`read system System.getPlatformInfo` |
| `System.getPowerInfo(): Record<string, unknown>;` | 获取电源/电池信息 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [System.getPowerInfo](../system.md)；`read system System.getPowerInfo` **正文缺口：禁止据类型直接生成调用** |
| `System.getProcessList(): OpenDeskProcessInfo[];` | 列出运行中进程 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [System.getProcessList](../system.md#systemgetprocesslist)；`read system System.getProcessList` |
| `System.getSessionCapabilities(): OpenDeskSystemSessionCapabilities;` | 查询 session backend 和逐操作能力 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [System.getSessionCapabilities](../system.md)；`read system System.getSessionCapabilities` 共享整页兜底 |
| `System.getSessionState(): OpenDeskSystemSessionState;` | 查询当前 session identity/state；不推测未知 lock state | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [System.getSessionState](../system.md#systemgetsessionstate)；`read system System.getSessionState` |
| `System.getSystemInfo(): OpenDeskSystemInfo;` | 获取系统概览 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [System.getSystemInfo](../system.md#systemgetsysteminfo)；`read system System.getSystemInfo` |
| `System.getSystemMetrics(): Record<string, number>;` | CPU/内存/磁盘使用率 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [System.getSystemMetrics](../system.md#systemgetsystemmetrics)；`read system System.getSystemMetrics` |
| `System.getUserInfo(): Record<string, unknown>;` | 当前用户信息 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [System.getUserInfo](../system.md#systemgetuserinfo)；`read system System.getUserInfo` |
| `System.getWorkingDirectory(): string;` | 当前工作目录 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [System.getWorkingDirectory](../system.md#systemgetworkingdirectory)；`read system System.getWorkingDirectory` |
| `System.hasEnv(name: string): boolean;` | 判断有效环境快照中是否存在一个键，包括空字符串值 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [System.hasEnv](../system.md#systemgetenv--systemhasenv)；`read system System.hasEnv` |
| `System.isAdministrator(): boolean;` | 是否管理员/root | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [System.isAdministrator](../system.md#systemisadministrator)；`read system System.isAdministrator` |
| `System.killProcess(pid: number): void;` | 结束指定 PID | 有：输入/应用或系统状态改变；继承本节限制 | [System.killProcess](../system.md#systemkillprocesspid)；`read system System.killProcess` |
| `System.lock(options: { confirm: true }): OpenDeskSystemSessionActionResult;` | 请求锁定当前 session（Experimental，平台受限） | 有：输入/应用或系统状态改变；继承本节限制 | [System.lock](../system.md#systemlockoptions)；`read system System.lock` |
| `System.logout(options: { confirm: true; force?: boolean }): OpenDeskSystemSessionActionResult;` | 请求注销当前 session（Experimental，破坏性） | 有：输入/应用或系统状态改变；继承本节限制 | [System.logout](../system.md#systemlogoutoptions)；`read system System.logout` |
| `System.product: Readonly<OpenDeskProductIdentity>;` | 只读 OpenDesk 产品身份；包含 id、name、website | 需核对正文；不能假定无副作用；继承本节限制 | [System.product](../system.md#systemproduct)；`read system System.product` |
| `System.restart(delay: number): void;` | 重启 | 有：输入/应用或系统状态改变；继承本节限制 | [System.restart](../system.md#systemrestartdelay)；`read system System.restart` |
| `System.shutdown(delay: number): void;` | 关机 | 需核对正文；不能假定无副作用；继承本节限制 | [System.shutdown](../system.md#systemshutdowndelay)；`read system System.shutdown` |
| `System.sleep(): void;` | 睡眠 | 需核对正文；不能假定无副作用；继承本节限制 | [System.sleep](../system.md#systemsleep)；`read system System.sleep` |
| `System.startScreenSaver(options: { confirm: true }): OpenDeskSystemSessionActionResult;` | 启动系统屏幕保护（Experimental，平台受限） | 有：输入/应用或系统状态改变；继承本节限制 | [System.startScreenSaver](../system.md#systemstartscreensaveroptions)；`read system System.startScreenSaver` |
| `System.toJSON(data: unknown): string;` | 美化 JSON 字符串 | 需核对正文；不能假定无副作用；继承本节限制 | [System.toJSON](../system.md#systemtojsondata)；`read system System.toJSON` |


## Command

状态、前置权限、平台、错误/等待/取消与副作用按选中正文核对。

来源：[command.md](../command.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `Command.getCapabilities(): OpenDeskCommandCapabilities;` | 查询当前 execution 是否允许命令执行。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [Command.getCapabilities](../command.md#commandgetcapabilities)；`read command Command.getCapabilities` |
| `Command.run(command: string, args?: string[], options?: OpenDeskCommandOptions): Promise<OpenDeskCommandResult>;`（2 个声明；--types 核对） | 启动一次命令，等待退出并返回 stdout、stderr 与 exit code。 | 需核对正文；不能假定无副作用；继承本节限制 | [Command.run](../command.md#commandrun-options)；`read command Command.run` |


## Audio

状态、前置权限、平台、错误/等待/取消与副作用按选中正文核对。

来源：[audio.md](../audio.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `Audio.getCapabilities(): OpenDeskAudioCapabilities;` | 查询当前平台/后端能力。 | 观察/查询；可能读取敏感数据，不等于业务完成；Native | [Audio.getCapabilities](../audio.md#audiogetcapabilities)；`read audio Audio.getCapabilities` |
| `Audio.getDefaultInput(): OpenDeskAudioDevice \| null;` | 返回默认输入设备。 | 观察/查询；可能读取敏感数据，不等于业务完成；Native | [Audio.getDefaultInput](../audio.md#audiogetdefaultinput)；`read audio Audio.getDefaultInput` |
| `Audio.getDefaultOutput(): OpenDeskAudioDevice \| null;` | 返回默认输出设备。 | 观察/查询；可能读取敏感数据，不等于业务完成；Native | [Audio.getDefaultOutput](../audio.md#audiogetdefaultoutput)；`read audio Audio.getDefaultOutput` |
| `Audio.getInputDevices(): OpenDeskAudioDevice[];` | 列出输入设备。 | 观察/查询；可能读取敏感数据，不等于业务完成；Native | [Audio.getInputDevices](../audio.md#audiogetinputdevices)；`read audio Audio.getInputDevices` |
| `Audio.getOutputDevices(): OpenDeskAudioDevice[];` | 列出输出设备。 | 观察/查询；可能读取敏感数据，不等于业务完成；Native | [Audio.getOutputDevices](../audio.md#audiogetoutputdevices)；`read audio Audio.getOutputDevices` |
| `Audio.getVolume(): number;` | 读取系统输出音量。 | 观察/查询；可能读取敏感数据，不等于业务完成；Native | [Audio.getVolume](../audio.md#audiogetvolume)；`read audio Audio.getVolume` |
| `Audio.isMuted(): boolean;` | 读取 mute 状态。 | 观察/查询；可能读取敏感数据，不等于业务完成；Native | [Audio.isMuted](../audio.md#audioismuted)；`read audio Audio.isMuted` |
| `Audio.mute(): boolean;` | 静音。 | 需核对正文；不能假定无副作用；Native | [Audio.mute](../audio.md#audiomute)；`read audio Audio.mute` |
| `Audio.setVolume(value: number): number;` | 设置系统输出音量。 | 需核对正文；不能假定无副作用；Native | [Audio.setVolume](../audio.md#audiosetvolumevalue)；`read audio Audio.setVolume` |
| `Audio.toggleMute(): boolean;` | 切换 mute。 | 需核对正文；不能假定无副作用；Native | [Audio.toggleMute](../audio.md#audiotogglemute)；`read audio Audio.toggleMute` |
| `Audio.unmute(): boolean;` | 取消静音。 | 需核对正文；不能假定无副作用；Native | [Audio.unmute](../audio.md#audiounmute)；`read audio Audio.unmute` |
| `Audio.waitForSound(options: OpenDeskAudioPatternWaitOptions): Promise<OpenDeskAudioPatternMatch>;` | 等待一次固定声音匹配。 | 观察/查询；可能读取敏感数据，不等于业务完成；Experimental | [Audio.waitForSound](../audio.md#audiowaitforsoundoptions)；`read audio Audio.waitForSound` |
| `Audio.watchSound( options: OpenDeskAudioPatternWatchOptions, callback: (event: OpenDeskAudioPatternMatch) => void \| Promise<void>, ): Promise<OpenDeskAudioSoundWatcher>;` | 持续监听固定声音 reference。 | 需核对正文；不能假定无副作用；Experimental | [Audio.watchSound](../audio.md#audiowatchsoundoptions-callback)；`read audio Audio.watchSound` |


## Sound API

状态、前置权限、平台、错误/等待/取消与副作用按选中正文核对。

来源：[sound.md](../sound.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `Sound.getActive(): OpenDeskActiveSoundPlayback[];` | 查询当前 execution 的活动会话快照。 | 依方法：呈现/交互/资源；不得视为纯查询；无 | [Sound.getActive](../sound.md#soundplaysuccess--soundplayfail--soundplaywarning--soundplayerror--soundplaycaptcha--soundplaysound--soundplay--soundstart--soundplayasync--soundstop--soundstopall--soundgetactive方法总览)；`read sound Sound.getActive` 共享整页兜底 |
| `Sound.play(soundPath: string): void;` | `playSound` 的兼容别名并等待完成。 | 依方法：呈现/交互/资源；不得视为纯查询；`path: string` | [Sound.play](../sound.md#soundplaysuccess--soundplayfail--soundplaywarning--soundplayerror--soundplaycaptcha--soundplaysound--soundplay--soundstart--soundplayasync--soundstop--soundstopall--soundgetactive方法总览)；`read sound Sound.play` 共享整页兜底 |
| `Sound.playAsync(soundPath: string, options?: OpenDeskSoundStartOptions): OpenDeskSoundPlayback;` | `start` 的别名。 | 依方法：呈现/交互/资源；不得视为纯查询；同 `start` | [Sound.playAsync](../sound.md#soundplaysuccess--soundplayfail--soundplaywarning--soundplayerror--soundplaycaptcha--soundplaysound--soundplay--soundstart--soundplayasync--soundstop--soundstopall--soundgetactive方法总览)；`read sound Sound.playAsync` 共享整页兜底 |
| `Sound.playCaptcha(): void;` | captcha 提示音并等待完成。 | 依方法：呈现/交互/资源；不得视为纯查询；无 | [Sound.playCaptcha](../sound.md#soundplaysuccess--soundplayfail--soundplaywarning--soundplayerror--soundplaycaptcha--soundplaysound--soundplay--soundstart--soundplayasync--soundstop--soundstopall--soundgetactive方法总览)；`read sound Sound.playCaptcha` 共享整页兜底 |
| `Sound.playError(): void;` | 错误提示音并等待完成。 | 依方法：呈现/交互/资源；不得视为纯查询；无 | [Sound.playError](../sound.md#soundplaysuccess--soundplayfail--soundplaywarning--soundplayerror--soundplaycaptcha--soundplaysound--soundplay--soundstart--soundplayasync--soundstop--soundstopall--soundgetactive方法总览)；`read sound Sound.playError` 共享整页兜底 |
| `Sound.playFail(): void;` | 失败提示音并等待完成。 | 依方法：呈现/交互/资源；不得视为纯查询；无 | [Sound.playFail](../sound.md#soundplaysuccess--soundplayfail--soundplaywarning--soundplayerror--soundplaycaptcha--soundplaysound--soundplay--soundstart--soundplayasync--soundstop--soundstopall--soundgetactive方法总览)；`read sound Sound.playFail` 共享整页兜底 |
| `Sound.playSound(soundPath: string): void;` | 播放指定文件并等待完成。 | 依方法：呈现/交互/资源；不得视为纯查询；`path: string` | [Sound.playSound](../sound.md#soundplaysuccess--soundplayfail--soundplaywarning--soundplayerror--soundplaycaptcha--soundplaysound--soundplay--soundstart--soundplayasync--soundstop--soundstopall--soundgetactive方法总览)；`read sound Sound.playSound` 共享整页兜底 |
| `Sound.playSuccess(): void;` | 成功提示音并等待完成。 | 依方法：呈现/交互/资源；不得视为纯查询；无 | [Sound.playSuccess](../sound.md#soundplaysuccess--soundplayfail--soundplaywarning--soundplayerror--soundplaycaptcha--soundplaysound--soundplay--soundstart--soundplayasync--soundstop--soundstopall--soundgetactive方法总览)；`read sound Sound.playSuccess` 共享整页兜底 |
| `Sound.playWarning(): void;` | 警告提示音并等待完成。 | 依方法：呈现/交互/资源；不得视为纯查询；无 | [Sound.playWarning](../sound.md#soundplaysuccess--soundplayfail--soundplaywarning--soundplayerror--soundplaycaptcha--soundplaysound--soundplay--soundstart--soundplayasync--soundstop--soundstopall--soundgetactive方法总览)；`read sound Sound.playWarning` 共享整页兜底 |
| `Sound.start(soundPath: string, options?: OpenDeskSoundStartOptions): OpenDeskSoundPlayback;` | 非阻塞启动并返回控制句柄。 | 依方法：呈现/交互/资源；不得视为纯查询；`path: string`、`{loop?: boolean}` | [Sound.start](../sound.md#soundplaysuccess--soundplayfail--soundplaywarning--soundplayerror--soundplaycaptcha--soundplaysound--soundplay--soundstart--soundplayasync--soundstop--soundstopall--soundgetactive方法总览)；`read sound Sound.start` 共享整页兜底 |
| `Sound.stop(id: string): boolean;` | 按 ID 请求停止；未知或已结束会话返回 `false`。 | 依方法：呈现/交互/资源；不得视为纯查询；`id: string` | [Sound.stop](../sound.md#soundplaysuccess--soundplayfail--soundplaywarning--soundplayerror--soundplaycaptcha--soundplaysound--soundplay--soundstart--soundplayasync--soundstop--soundstopall--soundgetactive方法总览)；`read sound Sound.stop` 共享整页兜底 |
| `Sound.stopAll(): number;` | 请求停止当前 execution 拥有的所有活动会话，返回接受的数量。 | 依方法：呈现/交互/资源；不得视为纯查询；无 | [Sound.stopAll](../sound.md#soundplaysuccess--soundplayfail--soundplaywarning--soundplayerror--soundplaycaptcha--soundplaysound--soundplay--soundstart--soundplayasync--soundstop--soundstopall--soundgetactive方法总览)；`read sound Sound.stopAll` 共享整页兜底 |
| `playback.id: string;` | 这些方法会等待音频播放完成；在同一个 JavaScript execution 中等待期间无法调用另一个 `Sound.stop()`。它们仍会观察 execution …（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [playback.id](../sound.md#soundplaysuccess--soundplayfail--soundplaywarning--soundplayerror--soundplaycaptcha--soundplaysound--soundplay--soundstart--soundplayasync--soundstop--soundstopall--soundgetactive方法总览)；`read sound playback.id` 共享整页兜底 |
| `playback.isPlaying(): boolean;` | playback.isPlaying；所属能力：Sound API | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [playback.isPlaying](../sound.md)；`read sound playback.isPlaying` **正文缺口：禁止据类型直接生成调用** |
| `playback.path: string;` | 这些方法会等待音频播放完成；在同一个 JavaScript execution 中等待期间无法调用另一个 `Sound.stop()`。它们仍会观察 execution …（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [playback.path](../sound.md#soundplaysuccess--soundplayfail--soundplaywarning--soundplayerror--soundplaycaptcha--soundplaysound--soundplay--soundstart--soundplayasync--soundstop--soundstopall--soundgetactive方法总览)；`read sound playback.path` 共享整页兜底 |
| `playback.pause(): boolean;` | 这些方法会等待音频播放完成；在同一个 JavaScript execution 中等待期间无法调用另一个 `Sound.stop()`。它们仍会观察 execution …（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [playback.pause](../sound.md#soundplaysuccess--soundplayfail--soundplaywarning--soundplayerror--soundplaycaptcha--soundplaysound--soundplay--soundstart--soundplayasync--soundstop--soundstopall--soundgetactive方法总览)；`read sound playback.pause` 共享整页兜底 |
| `playback.resume(): boolean;` | 这些方法会等待音频播放完成；在同一个 JavaScript execution 中等待期间无法调用另一个 `Sound.stop()`。它们仍会观察 execution …（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [playback.resume](../sound.md#soundplaysuccess--soundplayfail--soundplaywarning--soundplayerror--soundplaycaptcha--soundplaysound--soundplay--soundstart--soundplayasync--soundstop--soundstopall--soundgetactive方法总览)；`read sound playback.resume` 共享整页兜底 |
| `playback.startedAt: string;` | playback.startedAt；所属能力：Sound API | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [playback.startedAt](../sound.md)；`read sound playback.startedAt` **正文缺口：禁止据类型直接生成调用** |
| `playback.status(): OpenDeskSoundPlaybackStatus;` | 这些方法会等待音频播放完成；在同一个 JavaScript execution 中等待期间无法调用另一个 `Sound.stop()`。它们仍会观察 execution …（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [playback.status](../sound.md#soundplaysuccess--soundplayfail--soundplaywarning--soundplayerror--soundplaycaptcha--soundplaysound--soundplay--soundstart--soundplayasync--soundstop--soundstopall--soundgetactive方法总览)；`read sound playback.status` 共享整页兜底 |
| `playback.stop(): boolean;` | 这些方法会等待音频播放完成；在同一个 JavaScript execution 中等待期间无法调用另一个 `Sound.stop()`。它们仍会观察 execution …（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [playback.stop](../sound.md#soundplaysuccess--soundplayfail--soundplaywarning--soundplayerror--soundplaycaptcha--soundplaysound--soundplay--soundstart--soundplayasync--soundstop--soundstopall--soundgetactive方法总览)；`read sound playback.stop` 共享整页兜底 |
| `playback.wait(): Promise<OpenDeskSoundPlaybackResult>;` | 这些方法会等待音频播放完成；在同一个 JavaScript execution 中等待期间无法调用另一个 `Sound.stop()`。它们仍会观察 execution …（摘要） | 依方法：呈现/交互/资源；不得视为纯查询；继承本节限制 | [playback.wait](../sound.md#soundplaysuccess--soundplayfail--soundplaywarning--soundplayerror--soundplaycaptcha--soundplaysound--soundplay--soundstart--soundplayasync--soundstop--soundstopall--soundgetactive方法总览)；`read sound playback.wait` 共享整页兜底 |


## 生成依据

维护命令：`node scripts/api-docs.js generate`；校验：`node scripts/api-docs.js check`。不能手工改本表；修改 canonical 正文/类型后重生成。下面是内容版本，不把旧行号当成当前定位。


- `docs/api/execution.md` SHA-256 `1af37c7a95db2d27b65215582b3ca963d5c8bf076638031c4a366f5c2e5b0efa`

- `types/Execution.d.ts` SHA-256 `e1776073124a1585896ead8fdc22ad7f2da61546c9923a0f90fd3378f6c735d0`

- `docs/api/global-apis.md` SHA-256 `64be8b1eae5c756d52e9ee8446e5041b4e072929d280eceaabf463e29aaae6e1`

- `types/global.d.ts` SHA-256 `1cf9e19b27cd13fb50d7147713d1a2a67c2176a0be2de6791a2e325b5519da8c`

- `types/console.d.ts` SHA-256 `9d7c2ed399e35bdaff0e60e8052c2dbec0750ef965878418a5bdf9289d19dfb9`

- `docs/api/system.md` SHA-256 `98312025a56ef39653c2c3d2dbdf8b92a70866d9c04407711f4e0f686f0b49bf`

- `types/System.d.ts` SHA-256 `636fa6d8fca5728f2427e7119c12ba0b36ff88c34ebc02876e1573fa64316ae8`

- `docs/api/command.md` SHA-256 `55a08ab522c2c0598476c07dbadd0926b7068bfcba1589fa3accd204c633bac1`

- `types/Command.d.ts` SHA-256 `f7fdeeef6c9d26878e50b89a1197a6aae38df877f11177861b2f2d652ed8fd3a`

- `docs/api/audio.md` SHA-256 `dd9d9c3b5a446c8ecb86e87ab9b1b1980f456ab07d635138f162415fd8d7cf8c`

- `types/Audio.d.ts` SHA-256 `2f1192612c2fc62e4f360b6e1229e8aaeb0659e121971d02964058d95db90b4b`

- `docs/api/sound.md` SHA-256 `1dea29216d7ff3d80db255c5139ebaa48063d520064bbdc30020b4cef41430e9`

- `types/Sound.d.ts` SHA-256 `a40959b86b72f086c0510eba33095af99e234567843bd25060478902007eb974`
