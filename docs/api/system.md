---
title: System API
description: 系统信息、进程、网络、目录、用户与系统状态查询。
order: 6
---

# System

System 提供系统信息与基础系统操作能力。

适用场景
- 获取系统信息、硬件指标
- 列出进程与网络连接
- 读取当前工作目录、可执行文件路径
- 获取用户信息与指纹
- 查询当前 GUI/login session 的 capability 与最小状态

注意
- 其中某些系统控制方法（如关机、重启、睡眠）副作用很强，应谨慎使用。

## System：方法总表

| 方法 | 用途 |
| --- | --- |
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
./opendesk -script examples/system-session-state.js -console-mode script
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

```js
const list = System.getProcessList();
console.log(JSON.stringify(list.slice(0, 10), null, 2));
```

**单项通常包含**
- pid
- name
- cmdline
- username
- cpuPercent
- memPercent

## System.killProcess(pid)

```js
await System.killProcess(12345);
```

## System.getNetworkConnections()

```js
const conns = System.getNetworkConnections();
console.log(JSON.stringify(conns.slice(0, 20), null, 2));
```

## System.getWorkingDirectory()

```js
console.log(System.getWorkingDirectory());
```

## System.getExecutablePath()

```js
console.log(System.getExecutablePath());
```

## System.getDirectoryContents(path)

```js
const items = System.getDirectoryContents('.');
console.log(JSON.stringify(items, null, 2));
```

**每一项通常包含**
- name
- size
- mode
- modTime
- isDir

## System.getUserInfo()

```js
console.log(JSON.stringify(System.getUserInfo(), null, 2));
```

## System.isAdministrator()

```js
console.log(System.isAdministrator());
```

## System.getFingerprint()

```js
console.log(System.getFingerprint());
```

## System.toJSON(data)

```js
const text = System.toJSON({ hello: 'world' });
console.log(text);
```

## System：高副作用方法

下面三个 power 方法是既有 compatibility surface，与新增 session action 分层。它们目前保持原调用
形状，避免在本卡制造 breaking change；调用方不得把它们的命令返回当作最终关机/重启/睡眠证明。

## System.shutdown(delay)

```js
await System.shutdown(60);
```

**说明**
- delay 单位按实现传给系统命令
- 不同系统行为略有差异

## System.restart(delay)

```js
await System.restart(60);
```

## System.sleep()

```js
await System.sleep();
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
