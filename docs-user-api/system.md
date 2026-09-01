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

注意
- 其中某些系统控制方法（如关机、重启、睡眠）副作用很强，应谨慎使用。

## System：方法总表

| 方法 | 用途 |
| --- | --- |
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
