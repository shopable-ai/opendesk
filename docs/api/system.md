---
docType: reference
title: System API
description: 系统信息、进程、网络、目录、用户与系统状态查询。
order: 380
---

# System

System 提供系统信息与基础系统操作能力。

适用场景
- 获取 OpenDesk Runtime-owned 产品身份
- 获取系统信息、硬件指标
- 列出进程与网络连接
- 读取当前工作目录、可执行文件路径
- 获取用户信息与指纹
- 查询当前 GUI/login session 的 capability 与最小状态

注意
- 其中某些系统控制方法（如关机、重启、睡眠）副作用很强，应谨慎使用。

## System：方法总表

| 方法 / 属性 | 用途 |
| --- | --- |
| System.product | 只读 OpenDesk 产品身份；包含 id、name、website |
| System.delay(milliseconds) | 非阻塞等待，不休眠主机 |
| System.getPlatformInfo() | 获取 Runtime OS、架构和进程信息 |
| System.getEnv(name, fallback?) | 从本次 execution 的有效环境快照读取一个键 |
| System.hasEnv(name) | 判断有效环境快照中是否存在一个键，包括空字符串值 |
| System.getSessionCapabilities() | 查询 session backend 和逐操作能力 |
| System.getSessionState() | 查询当前 session identity/state；不推测未知 lock state |
| System.lock({confirm: true}) | 请求锁定当前 session（Experimental，平台受限） |
| System.logout({confirm: true}) | 请求注销当前 session（Experimental，破坏性） |
| System.startScreenSaver({confirm: true}) | 启动系统屏幕保护（Experimental，平台受限） |
| System.getProcessList() | 列出运行中进程 |
| System.killProcess(pid) | 结束指定 PID |
| System.getNetworkInterfaces() | 获取网络接口统计 |
| System.getNetworkConnections() | 获取活动网络连接 |
| System.getPowerInfo() | 获取电源/电池信息 |
| System.shutdown(delay) | 关机 |
| System.restart(delay) | 重启 |
| System.sleep() | 睡眠 |
| System.getDirectoryContents(path) | 列目录内容 |
| System.getExecutablePath() | 当前可执行文件路径 |
| System.getWorkingDirectory() | 当前工作目录 |
| System.getUserInfo() | 当前用户信息 |
| System.isAdministrator() | 是否管理员/root |
| System.getSystemMetrics() | CPU/内存/磁盘使用率 |
| System.getFingerprint() | 生成设备指纹 |
| System.getSystemInfo() | 获取系统概览 |
| System.toJSON(data) | 美化 JSON 字符串 |

## System：常用方法

## System.product

Runtime-owned、只读的 OpenDesk 产品身份。

**签名**

```js
System.product.id
System.product.name
System.product.website
```

**参数**

无。

**返回值**

`System.product` 是冻结的只读对象，当前包含：

```json
{
  "id": "com.opendesk.desktop",
  "name": "OpenDesk",
  "website": "https://github.com/shopable-ai/opendesk#home"
}
```

**行为与错误**

- `System.product` 由 Runtime bootstrap 安装；`website` 从发布时生成并嵌入的 `product.odcfg` 派生，不来自 `.env`、`opendesk.app.json` 或用户脚本配置；
- `System.product` 本身不能被替换，`id`、`name`、`website` 也不能被修改；
- 官方 Script Runner、Recorder 等品牌入口应读取 `System.product.website`，不要各自硬编码官网 URL；
- 该对象只保存公开产品身份，不存 token、License key、私钥或其他 secret。

**示例**

```js
console.log(System.product.name);
await page.openURL(System.product.website);
```

`System.product` 只投影产品身份需要的官网值；Home、Help、Customize、Marketplace、Upgrade 的 URL policy 全部由同一个 publisher-owned `product` 配置维护。

## System.delay(milliseconds)

```js
await System.delay(250);
```

返回 `Promise<void>`，单位为毫秒。等待由 Runtime 事件循环托管，不阻塞 timer、HTTP
Promise 或其他异步回调，也不会让操作系统进入睡眠。省略参数等同于 `0`；负数、
`NaN`、无穷大和超过 24 小时的值会失败。

`System.delay()` 与全局 `sleep()` 使用同一类事件循环等待语义。需要让整台电脑休眠的
高风险操作仍是 `System.sleep()`，二者不可混用。

固定等待只适合短暂节流。等待窗口、文本或业务状态时，应优先使用带 timeout 和
postcondition 的条件等待。

## System.getPlatformInfo()

```js
const platform = System.getPlatformInfo();
console.log(platform.os, platform.arch, platform.processId);
```

返回：

```json
{
  "os": "darwin",
  "arch": "arm64",
  "processId": 12345,
  "runtimeVersion": "go1.x"
}
```

其中 `os` 使用 Go Runtime 的稳定值：`darwin`、`linux` 或 `windows`。不要使用该方法
绕过能力检测；平台信息只适合选择明确支持的平台实现。

## System.getEnv() / System.hasEnv()

```js
const path = System.getEnv('PATH');
const mode = System.getEnv('MY_PROJECT_MODE', 'development');

if (System.hasEnv('CI')) {
  console.log('running in CI');
}
```

`System.getEnv(name)` 返回字符串；键不存在时返回 `undefined`。传入字符串 fallback 后，只有键不存在
才返回 fallback，已定义的空字符串仍返回 `''`。`System.hasEnv(name)` 可明确区分“缺失”和“存在但
为空”。键名必须满足 `[A-Za-z_][A-Za-z0-9_]*`，额外参数或非字符串 fallback 会抛出 `TypeError`。

这两个方法是 `Execution.env` 的按键读取入口，不是绕过 Runtime 的第二套宿主环境读取器：

- 本地 execution 读取 `.env`、`.opendesk.env`（或显式 env file）与进程启动时 OS 环境合并后的快照；
- Windows 查询大小写不敏感，快照中的键仍统一为大写；
- HTTP、MCP、Scheduler 的快照默认为空，因此两个方法不能读取服务端宿主环境；
- 值在 execution 启动后保持不变，不会重新解析 shell startup 文件或观察父进程后续变化。

API 刻意不提供 `System.getAllEnv()`。环境经常包含 token，读取时应明确指定业务需要的键，也不要把
返回值无选择写入日志或外部请求。需要枚举已授权快照时可使用 `Execution.env`，并自行承担脱敏责任。

## System session：先查询能力

从仓库根目录运行只读示例：

```bash
./opendesk -script examples/runtime/system-session-state.js -console-mode script
```

```js
const capabilities = System.getSessionCapabilities();
if (capabilities.state.supported) {
  console.log(System.getSessionState());
}
```

capability 按 `state`、`lock`、`logout`、`startScreenSaver`、`wake`、`switchUser` 分开报告：

```json
{
  "schemaVersion": 1,
  "platform": "darwin",
  "backend": "coregraphics-session",
  "state": { "supported": true, "verified": false, "destructive": false, "requiresConfirmation": false },
  "lock": { "supported": false, "verified": false, "destructive": true, "requiresConfirmation": true },
  "logout": { "supported": false, "verified": false, "destructive": true, "requiresConfirmation": true },
  "startScreenSaver": { "supported": true, "verified": false, "destructive": true, "requiresConfirmation": true }
}
```

`verified: false` 是刻意的：仓库曾在某台机器运行过 smoke，不代表当前 session 具备相同权限、桌面
状态或恢复条件。

## System.getSessionState()

```js
const session = System.getSessionState();
```

返回字段：

```text
schemaVersion
platform
backend
state
userId
sessionId
active
onConsole
loginDone
remote
locked
observedAt
```

无法可靠判断的字段必须是 `null`。尤其不能因为当前进程仍能截图或收到事件就推断
`locked: false`；Windows 的 `LockWorkStation` 也是异步请求，官方文档明确说明 request success
不证明锁定 postcondition。

## Session mutation confirmation

所有新增 session-changing action 都必须显式传入 `confirm: true`：

```js
System.lock({ confirm: true });
System.startScreenSaver({ confirm: true });
System.logout({ confirm: true, force: false });
```

省略确认时在进入 native/backend 前抛出 `CONFIRMATION_REQUIRED`。成功返回：

```json
{
  "initiated": true,
  "verified": false,
  "operation": "System.lock",
  "platform": "windows",
  "backend": "win32-session"
}
```

`initiated` 只说明平台接受/启动请求。lock、logout、screen saver 都可能让当前 automation execution
无法继续；它们的真实 postcondition 必须由外部 observer 或恢复后的独立 execution 验证。

### System.lock(options)

- **Windows**：public `LockWorkStation`；仅 interactive desktop 可调用。异步返回不证明已锁定。
- **Linux**：仅在 `loginctl` 与 `XDG_SESSION_ID` 可用时调用当前 session 的 `lock-session`；desktop
  session manager 仍可能不响应。
- **macOS**：`NOT_SUPPORTED`。当前没有采用 undocumented `CGSession -suspend`、合成
  Control-Command-Q 或 Accessibility 点击来冒充 public stable API。

### System.logout(options)

- **Windows**：public `ExitWindowsEx(EWX_LOGOFF)`；`force: true` 可能丢失未保存数据。
- **Linux**：`loginctl terminate-session`；会终止当前 session 的全部进程，不支持 `force: true`。
- **macOS**：`NOT_SUPPORTED`。没有把 AppleScript/System Events 或 private loginwindow route 标为 Stable。

### System.startScreenSaver(options)

- **macOS**：Experimental，启动系统 `ScreenSaverEngine.app`。主机策略可能立即要求密码，因此正式
  live smoke 必须在一次性 interactive session 中执行并预先证明可恢复。
- **Windows / Linux**：当前 `NOT_SUPPORTED`；不制造外观一致但语义不同的 no-op。

`wake`、unlock、用户切换均不暴露；OpenDesk 不绕过密码或 lock screen。

## Session error codes

| code | 含义 |
| --- | --- |
| `INVALID_ARGUMENT` | option 类型、未知字段或平台不接受的 `force`。 |
| `CONFIRMATION_REQUIRED` | 缺少显式 `confirm: true`。 |
| `NOT_SUPPORTED` | 当前 backend/platform 没有该能力。 |
| `BACKEND_FAILED` | 平台 API 或 helper/command 请求失败。 |

## System.getSystemInfo()

**签名**：`System.getSystemInfo(): OpenDeskSystemInfo`。无参数，同步返回对象。host、CPU、memory 三组读取分别尝试；任一组失败只省略该组字段，当前 owner 不上抛该读取错误。因此 `{}` 或缺字段是允许的部分结果，不能当作完整硬件识别成功。CPU 字段取列表第一项，`cpuCores` 不是整机总核心数；内存为字节、`uptime` 为秒。无独立 timeout/signal。

```js
const info = System.getSystemInfo();
console.log(JSON.stringify(info, null, 2));
```

**返回结构通常包含**
- hostname
- os
- platform
- platformVersion
- kernelVersion
- uptime
- cpuModel
- cpuCores
- cpuMHz
- totalMemory
- freeMemory
- usedMemory
- memoryUsage

## System.getSystemMetrics()

**签名**：`System.getSystemMetrics(): Record<string, number>`。无参数，同步调用；CPU 使用率采样窗口约一秒，会阻塞当前 JavaScript。CPU、内存、根目录磁盘分别读取，失败组省略；当前 owner 返回部分对象且不上抛这些读取错误。比例字段为百分比，`availableMemory`/`availableDisk` 为字节；没有独立 timeout/signal，不能用 AbortSignal 抢占采样。

```js
const metrics = System.getSystemMetrics();
console.log(metrics);
```

**返回结构通常包含**
- cpuUsage
- memoryUsage
- availableMemory
- diskUsage
- availableDisk

## System.getProcessList()

**签名**：`System.getProcessList(): OpenDeskProcessInfo[]`。无参数，同步查询宿主 OS 进程。进程枚举失败同步抛 GoError；枚举成功后，每条记录固定有下列六个字段，单个属性读取失败被忽略并保留该次调用返回值（通常为空字符串或零），不代表该属性已准确取得。权限、进程退出和采样时点会影响结果；没有独立 timeout/signal。命令行和用户名可能含私密信息，示例只输出数量。

```js
const list = System.getProcessList();
console.log('process count:', list.length);
```

**单项通常包含**
- pid
- name
- cmdline
- username
- cpuPercent
- memPercent

## System.killProcess(pid)

**签名**：`System.killProcess(pid: number): void`。同步请求终止指定进程，成功返回 `undefined`；不是 Promise，也不等待进程最终退出。通用桥接将参数转为 Go `int32`，没有额外正整数或范围检查；调用方必须先验证 PID、进程身份与终止授权。查找进程或 OS kill 失败同步抛 GoError，不承诺稳定 code；没有单次取消/超时。它可以终止宿主或其他任务，不能用作通用资源清理。

```js
// 仅定义；调用前必须核对 PID 与终止授权。
function terminateOwnedProcess(pid) { System.killProcess(pid); }
```

## System.getNetworkInterfaces()

读取本机逐网卡累计 I/O 计数，不发起网络连接或探测远端。

**签名**
```ts
System.getNetworkInterfaces(): OpenDeskNetworkInterfaceInfo[];
```

**参数**

无。

**返回值**

同步返回数组，每项字段如下；没有接口时可为空数组。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `name` | `string` | OS 网卡名称，非 IP/MAC 地址。 |
| `bytesSent` | `number` | 累计发送字节数。 |
| `bytesRecv` | `number` | 累计接收字节数。 |
| `packetsSent` | `number` | 累计发送包数。 |
| `packetsRecv` | `number` | 累计接收包数。 |
| `errors` | `number` | 接收与发送错误计数之和。 |
| `drops` | `number` | 接收与发送丢包计数之和。 |

**行为与错误**

普通 OpenDesk JavaScript 直接调用全局 `System`，无需 `await`。由 native owner 查询本机 OS 统计；支持范围及计数可用性取决于当前平台的 gopsutil backend，不保证不同系统字段同样精细。不要求桌面 Accessibility、录屏或麦克风授权，也不触发这些权限请求；宿主 OS 的查询权限仍适用。它不是接口地址清单，也不返回速率；计数重置、系统采样时点和 JavaScript number 精度影响解释，不能据此证明网络可达。

底层统计读取失败同步抛出 JavaScript GoError，不承诺稳定 code 或空数组降级。没有 signal、timeout 或单次取消参数；同步查询不能由 JavaScript AbortSignal 抢占。

**示例**

普通 OpenDesk 脚本中只输出数量，不记录接口标识或地址：

```js
const interfaces = System.getNetworkInterfaces();
console.log('interface count:', interfaces.length);
```

## System.getPowerInfo()

读取平台命令提供的电源/电池原始文本，不改变电源状态。

**签名**
```ts
System.getPowerInfo(): OpenDeskPowerInfo;
```

**参数**

无。

**返回值**

同步返回对象，唯一可选字段 `batteryData?: string` 是命令 stdout 原文；可能为空字符串。不是规范化的电量、充电状态或百分比结构。缺少字段与空字符串不能解释成“没有电池”或“电量为零”。

**行为与错误**

普通 OpenDesk JavaScript 直接调用全局 `System`，无需 `await`。macOS 执行 `pmset -g batt`；Windows 执行 `WMIC Path Win32_Battery Get EstimatedChargeRemaining,BatteryStatus`；Linux 执行 `upower -i /org/freedesktop/UPower/devices/battery_BAT0`。输出语言、格式、命令安装及 OS 权限取决于主机；Linux 不自动发现其他电池设备。其他平台返回 `{}`。

这些只读命令不请求桌面、录屏或音频权限，不调用关机/睡眠。命令不存在、权限不足或退出失败均被当前 owner 吞掉，返回 `{}`，没有错误字段，也不抛出该命令错误。不要把空对象当作查询成功的电池状态。

调用同步阻塞至子命令结束；当前实现没有命令 timeout/context、signal 或单次取消入口，不能靠外层 Promise 或 AbortSignal 中断它。

**示例**

普通 OpenDesk 脚本中只检查是否取得文本，避免记录主机原始输出：

```js
const power = System.getPowerInfo();
console.log('power text available:', typeof power.batteryData === 'string');
```

## System.getNetworkConnections()

**签名**：`System.getNetworkConnections(): OpenDeskNetworkConnectionInfo[]`。无参数，同步查询 OS 当前连接，不发起连接。每项固定包含数值 `fd`、`family`、`type`、`pid`，字符串 `localAddr`、`remAddr`、`status`；地址按 `<IP>:<port>` 拼接，不是可直接解析的规范 URL（IPv6 未补方括号）。字段可用性、连接可见范围和权限依赖 gopsutil 平台 backend；查询失败同步抛 GoError，不承诺稳定 code 或空列表降级。无独立 timeout/signal。

```js
const conns = System.getNetworkConnections();
console.log('connection count:', conns.length);
```

## System.getWorkingDirectory()

**签名**

```ts
System.getWorkingDirectory(): string
```

无参数。同步返回**宿主进程**当前工作目录；不是 `Execution.workdir`，不会因 execution 绑定不同目录而改变。获取失败同步抛错，没有独立 timeout/signal。业务文件路径应使用 `Execution.workdir` 或 `path.resolve()`；不要通过改变进程 cwd 修正执行目录。

```js
console.log(System.getWorkingDirectory());
```

## System.getExecutablePath()

**签名**：`System.getExecutablePath(): string`。无参数，同步返回宿主进程可执行文件路径，来自 OS `Executable` 查询；不是当前脚本路径，也不保证已经解析 symlink。查询失败同步抛 GoError；没有独立 timeout/signal。

```js
console.log(System.getExecutablePath());
```

## System.getDirectoryContents(path)

**签名**：`System.getDirectoryContents(path: string): Array<Record<string, unknown>>`。同步读取目录直接子项，不递归。路径直接传 OS，相对路径基于**宿主进程 cwd**，与 `File` 的 execution 路径解析不同；业务代码应传明确绝对路径。目录读取失败同步抛 GoError；逐项 `stat` 失败跳过该项，因此成功列表也不保证是完整快照。无独立 timeout/signal。

每项固定包含：`name: string`（名称）、`size: number`（OS size）、`mode: string`（Go FileMode 文本）、`isDir: boolean`，以及 `modTime`（当前通用桥接暴露的 native `time.Time` 对象，不是 JS Date 或保证的 ISO 字符串）。需要 JSON 时间值时应自行明确转换，不能依赖该 native 对象的默认 JSON 投影。

```js
const items = System.getDirectoryContents(Execution.workdir);
console.log('entry count:', items.length);
```

**每一项通常包含**
- name
- size
- mode
- modTime
- isDir

## System.getUserInfo()

**签名**：`System.getUserInfo(): Record<string, unknown>`。无参数，同步返回 `username`、`userDomain`、`userProfile`、`homePath` 四个字符串，分别直接读取**宿主进程**环境 `USERNAME`、`USERDOMAIN`、`USERPROFILE`、`HOME`，缺失为空字符串，不跨平台补全账户资料。`hostname?: string` 仅在 OS 主机名查询成功时存在，失败不抛出。该旧接口与隔离的 `Execution.env` / `System.getEnv()` 快照不同，空 execution 环境不屏蔽这些宿主字段。没有独立 timeout/signal；避免记录个人标识。

```js
const user = System.getUserInfo();
console.log('hostname available:', typeof user.hostname === 'string');
```

## System.isAdministrator()

**签名**：`System.isAdministrator(): boolean`。无参数、同步返回。Windows 尝试只读打开 `\\.\PHYSICALDRIVE0`，打开成功才为 `true`，任何打开失败为 `false`；其他平台仅判断当前 UID 是否为零。它不是完整的权限/capability 检查，也不申请或提升权限；不抛出该 Windows 打开错误，无独立 timeout/signal。

```js
console.log(System.isAdministrator());
```

## System.getFingerprint()

**签名**：`System.getFingerprint(): string`。无参数、同步调用 machineid 的应用域保护标识，域名沿用 `testMonkey`；不是随机 execution ID 或公开硬件序列号。稳定性依赖底层 OS machine ID 与当前域，不保证跨系统重装、容器或 machine ID 变更后保持不变。读取/派生失败同步抛 GoError（含 `failed to generate hardware fingerprint`），不承诺稳定 code；没有独立 timeout/signal。不要将其输出到共享日志。

```js
const fingerprint = System.getFingerprint();
console.log('fingerprint available:', fingerprint.length > 0);
```

## System.toJSON(data)

**签名**：`System.toJSON(data: unknown): string`。同步将桥接导出的值交给 Go JSON marshal，以两个空格缩进，返回 JSON **字符串**，不会写文件；不是 `JSON.stringify()` 的替代合同。循环结构、不支持的 Go JSON 值或 NaN/Infinity 等编码失败同步抛 GoError，不承诺稳定 code；没有单次 timeout/signal。需要 JavaScript 的 `toJSON`、replacer 或 undefined 行为时使用标准 `JSON.stringify()`。

```js
const text = System.toJSON({ hello: 'world' });
console.log(text);
```

## System：高副作用方法

下面三个 power 方法是既有 compatibility surface，与新增 session action 分层。它们目前保持原调用
形状，避免在本卡制造 breaking change；调用方不得把它们的命令返回当作最终关机/重启/睡眠证明。

## System.shutdown(delay)

请求系统关机。

**签名**

```ts
System.shutdown(delay: number): void;
```

**参数**

`delay` 按秒表达，建议显式提供非负整数。当前通用桥接将输入转为 Go `int`，省略为 `0`，没有独立的非负、有限值或整数范围验证；不要依赖桥接校验用户输入。

**返回值**

同步成功返回 `undefined`，无 Promise。

**行为与错误**

Windows 执行 `shutdown /s /t <delay>`；macOS/Linux 执行 `shutdown -h +<delay/60>`，整数除法向零截断为分钟。`0..59` 秒均变成 `+0`，并非等待这些秒数；负数继续参与命令构造，最终行为由平台命令决定。

无确认步骤、单次 `signal` 或命令 timeout。命令不存在、权限不足或退出失败同步抛出 Error；其他平台抛出不支持错误。不承诺稳定错误 code，命令成功不证明最终电源状态已改变。

**示例**

```js
// 仅定义；调用此函数会请求真实关机。
function requestShutdown() { System.shutdown(120); }
```

## System.restart(delay)

请求系统重启。

**签名**

```ts
System.restart(delay: number): void;
```

**参数**

`delay` 按秒表达，建议显式提供非负整数。当前通用桥接转换为 Go `int`，省略为 `0`，没有独立的非负、有限值或整数范围验证。

**返回值**

同步成功返回 `undefined`，无 Promise。

**行为与错误**

Windows 执行 `shutdown /r /t <delay>`；macOS/Linux 执行 `shutdown -r +<delay/60>`，整数除法向零截断。`0..59` 秒均变成 `+0`，并非等待这些秒数。负数继续参与命令构造。

无确认步骤、单次 `signal` 或命令 timeout。命令不存在、权限不足或退出失败同步抛出 Error；其他平台抛出不支持错误。没有稳定错误 code，命令成功不证明最终重启已完成。

**示例**

```js
// 仅定义；调用此函数会请求真实重启。
function requestRestart() { System.restart(120); }
```

## System.sleep()

请求系统睡眠。

**签名**

```ts
System.sleep(): void;
```

**参数**

无。

**返回值**

同步成功返回 `undefined`，无 Promise。

**行为与错误**

Windows 执行 `rundll32.exe powrprof.dll,SetSuspendState 0,1,0`；macOS 执行 `pmset sleepnow`；Linux 执行 `systemctl suspend`。无确认步骤、单次 `signal` 或命令 timeout。命令不存在、权限不足或退出失败同步抛出 Error；其他平台抛出不支持错误。没有稳定错误 code，命令成功不证明最终睡眠状态。

**示例**

```js
// 仅定义；调用此函数会请求真实睡眠。
function requestSleep() { System.sleep(); }
```

## System / page：权限关系

旧文档常把“权限”归到 system 范畴。

但当前项目中，真正与截图、辅助功能、automation 权限强相关的是：
- page.checkScreenshotPermissions()
- page.requestPermissions()
- page.ensurePermissions()
- page.openMacOSPrivacySettings()

System 更适合承担“系统信息与状态查询”角色。

## 平台依据

- Apple `CGSessionCopyCurrentDictionary`：
  <https://developer.apple.com/documentation/coregraphics/cgsessioncopycurrentdictionary()>
- Microsoft `LockWorkStation`：
  <https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-lockworkstation>
- Microsoft `ExitWindowsEx`：
  <https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-exitwindowsex>
- systemd `loginctl`：
  <https://www.freedesktop.org/software/systemd/man/latest/loginctl.html>
