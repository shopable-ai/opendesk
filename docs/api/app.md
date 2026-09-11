---
title: App API
description: Launch, find, wait for, terminate, and restart desktop applications by stable identity.
order: 200
---

# App

`App` 是 OpenDesk JavaScript Runtime 的实验性应用生命周期 API。它按稳定 identity 启动、查找、等待、终止和重启桌面应用，不创建第二套 Process、Window 或 EventLoop 系统。

优先使用稳定 identity：macOS 使用 bundle id 或 `.app` path；PID 只标识一次运行实例；显示名称可能变化。一个 identity 匹配多个进程时，返回的 group 会保留全部匹配 `pids` 与 `instances`。

## API 一览

| 方法 | 用途 |
| --- | --- |
| `App.list()` | 返回当前应用/进程 snapshot。 |
| `App.get(target)` | 按 identity 返回当前匹配 group。 |
| `App.isRunning(target)` | 判断当前是否存在匹配实例。 |
| `App.launch(target, options?)` | 启动或激活应用并可等待 readiness。 |
| `App.waitForLaunch(target, options?)` | 等待应用达到 process/window readiness。 |
| `App.waitForExit(target, options?)` | 等待该 identity 当前不再运行。 |
| `App.terminate(target, options?)` | 向开始时匹配的实例发出 graceful 或 force 终止请求。 |
| `App.restart(target, options?)` | 终止匹配实例后按稳定 identity 重新启动。 |
| `App.getCapabilities()` | 返回当前平台和 backend 的能力矩阵。 |

## 公共约定

### App target

```ts
type OpenDeskAppTarget =
  | number
  | string
  | { pid: number }
  | { name: string }
  | { bundleId: string }
  | { path: string };
```

对象 target 必须只包含一个 identity 字段。字符串绝对路径按 path 解释；macOS 上含点且不含路径分隔符的字符串可按 bundle id 解释，其他普通字符串按 name 解释。有歧义时使用显式对象。

### macOS Calculator 别名

macOS + cgo 的 native identity backend 当前只提供两个精确系统别名：

| 输入 name | 规范化 identity |
| --- | --- |
| `计算器` | `com.apple.calculator` |
| `Calculator` | `com.apple.calculator` |

别名不是通用翻译或模糊匹配。显式 `{ bundleId }`、`{ path }` 与 PID 不参与翻译；未知 name 保持原 name 行为。

### Readiness

| 值 | 含义 |
| --- | --- |
| `'process'` | 当前 snapshot 至少出现一个匹配 PID；默认值。 |
| `'window'` | 匹配 PID 中至少一个出现在 Window facade。 |

custom readiness predicate 当前不支持。timeout 默认 10 秒，最大 5 分钟；execution 取消或 teardown 会取消并回收等待 worker。

### Group 与 instance

`App.get()`、`App.launch()`、`App.waitForLaunch()` 与 `App.restart()` 返回按 identity 聚合的 group。一个 identity 可以对应多个 process instance；调用方不应假设 `pids[0]` 是唯一实例。

## App.list()

返回当前应用/进程 snapshot。

**签名**

```ts
App.list(): OpenDeskAppInstance[];
```

**参数**

无。

**返回值**

`OpenDeskAppInstance[]`。macOS native backend 使用 NSWorkspace；其他平台按当前 capability 使用 process fallback。

**行为与错误**

同步读取当前 snapshot，不启动、激活或终止应用。backend 失败时同步抛结构化错误。

**示例**

```js
const apps = App.list();
console.log(apps.map(app => ({ pid: app.pid, name: app.name })));
```

## App.get(target)

返回当前匹配 identity 的应用 group。

**签名**

```ts
App.get(target: OpenDeskAppTarget): OpenDeskAppGroup | null;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `target` | `OpenDeskAppTarget` | 是 | 无 | 要查找的应用 identity。 |

**返回值**

`OpenDeskAppGroup | null`。当前没有匹配实例时返回 `null`。

**行为与错误**

同步读取当前 snapshot。一个 identity 有多个实例时返回同一 group 中的全部实例，不默认挑选第一个。

**示例**

```js
const app = App.get({ bundleId: 'com.apple.calculator' });
if (app) console.log(app.pids);
```

## App.isRunning(target)

判断当前是否存在匹配实例。

**签名**

```ts
App.isRunning(target: OpenDeskAppTarget): boolean;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `target` | `OpenDeskAppTarget` | 是 | 无 | 要检查的应用 identity。 |

**返回值**

`boolean`。

**行为与错误**

只读取当前 snapshot，不等待后续变化。无效 target 或 backend 失败会同步抛结构化错误。

**示例**

```js
if (App.isRunning({ name: 'Calculator' })) {
  console.log('running');
}
```

## App.launch(target, options?)

启动或激活目标应用，并可等待 readiness。

**签名**

```ts
App.launch(
  target: OpenDeskAppTarget,
  options?: OpenDeskAppLaunchOptions,
): Promise<OpenDeskAppGroup>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `target` | `OpenDeskAppTarget` | 是 | 无 | 要启动或激活的应用 identity。 |
| `options` | `OpenDeskAppLaunchOptions` | 否 | `{}` | 启动与 readiness 选项。 |
| `options.waitUntilReady` | `'process' \| 'window'` | 否 | `'process'` | 启动后等待条件。 |
| `options.timeout` | `number` | 否 | `10000` ms | 等待 readiness 的 timeout。 |
| `options.activate` | `boolean` | 否 | backend 默认 | 是否请求激活目标应用。 |

**返回值**

`Promise<OpenDeskAppGroup>`。

**行为与错误**

已运行应用可以被激活，不会创建平行的 OpenDesk process abstraction。当前保留的 `args`、`env`、`cwd` 字段若 backend 尚不支持，会明确返回 `NOT_SUPPORTED`，不会静默忽略。

**示例**

```js
const app = await App.launch(
  { bundleId: 'com.apple.calculator' },
  { waitUntilReady: 'window', timeout: 10000 },
);
console.log(app.pids);
```

## App.waitForLaunch(target, options?)

等待目标应用达到明确 readiness。

**签名**

```ts
App.waitForLaunch(
  target: OpenDeskAppTarget,
  options?: OpenDeskAppWaitOptions,
): Promise<OpenDeskAppGroup>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `target` | `OpenDeskAppTarget` | 是 | 无 | 要等待的应用 identity。 |
| `options` | `OpenDeskAppWaitOptions` | 否 | `{}` | 等待选项。 |
| `options.waitUntilReady` | `'process' \| 'window'` | 否 | `'process'` | readiness 条件。 |
| `options.timeout` | `number` | 否 | `10000` ms | timeout。 |

**返回值**

`Promise<OpenDeskAppGroup>`。

**行为与错误**

本方法只等待，不负责启动应用。timeout 抛 `TIMEOUT`；execution 取消抛 `CANCELED`。

**示例**

```js
const app = await App.waitForLaunch('Calculator', {
  waitUntilReady: 'window',
  timeout: 10000,
});
```

## App.waitForExit(target, options?)

等待目标 identity 当前不再运行。

**签名**

```ts
App.waitForExit(
  target: OpenDeskAppTarget,
  options?: OpenDeskAppWaitOptions,
): Promise<true>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `target` | `OpenDeskAppTarget` | 是 | 无 | 要等待退出的应用 identity。 |
| `options` | `OpenDeskAppWaitOptions` | 否 | `{}` | 等待选项。 |
| `options.timeout` | `number` | 否 | `10000` ms | timeout。 |

**返回值**

`Promise<true>`。

**行为与错误**

目标在 timeout 内不再运行时 resolve `true`。超时抛 `TIMEOUT`，execution 取消抛 `CANCELED`。

**示例**

```js
await App.waitForExit({ bundleId: 'com.apple.calculator' }, {
  timeout: 10000,
});
```

## App.terminate(target, options?)

向调用开始时匹配的全部实例发出 graceful 或 force 终止请求，并等待退出。

**签名**

```ts
App.terminate(
  target: OpenDeskAppTarget,
  options?: OpenDeskAppTerminateOptions,
): Promise<OpenDeskAppTerminateResult>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `target` | `OpenDeskAppTarget` | 是 | 无 | 要终止的应用 identity。 |
| `options` | `OpenDeskAppTerminateOptions` | 否 | `{}` | 终止选项。 |
| `options.force` | `boolean` | 否 | `false` | `false` 为 graceful；`true` 为明确 force 请求。 |
| `options.timeout` | `number` | 否 | `10000` ms | 等待退出的 timeout。 |

**返回值**

`Promise<OpenDeskAppTerminateResult>`。

**行为与错误**

`force: false` 超时不会自动升级为 force；调用方必须显式决定是否再次以 `force: true` 调用。开始时没有目标时按当前实现返回结构化 not-found 结果或错误，不会终止不相关进程。

**示例**

```js
await App.terminate({ bundleId: 'com.apple.calculator' });
```

## App.restart(target, options?)

终止匹配实例后按稳定 identity 重新启动应用。

**签名**

```ts
App.restart(
  target: OpenDeskAppTarget,
  options?: OpenDeskAppRestartOptions,
): Promise<OpenDeskAppGroup>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `target` | `OpenDeskAppTarget` | 是 | 无 | 要重启的应用 identity。 |
| `options` | `OpenDeskAppRestartOptions` | 否 | `{}` | 终止、启动和 readiness 选项。 |

**返回值**

`Promise<OpenDeskAppGroup>`。

**行为与错误**

PID 输入会先解析为可复用的 bundle/path/name identity，再执行 restart；不会尝试用已经退出的旧 PID 直接“重新启动”。终止或启动阶段失败会以对应结构化错误拒绝。

**示例**

```js
const app = await App.restart(
  { bundleId: 'com.apple.calculator' },
  { waitUntilReady: 'window', timeout: 10000 },
);
```

## App.getCapabilities()

返回当前平台、backend、identity、readiness 与 mutation 支持矩阵。

**签名**

```ts
App.getCapabilities(): OpenDeskAppCapabilities;
```

**参数**

无。

**返回值**

`OpenDeskAppCapabilities`。

**行为与错误**

同步读取 capability，不启动、激活或终止应用。调用方应以当前返回值判断平台支持，不把其他平台的构建或测试状态当作本机能力。

**示例**

```js
console.log(App.getCapabilities());
```

## 错误

Promise rejection 的稳定 `error.code` 包括：

```text
INVALID_ARGUMENT
NOT_SUPPORTED
NOT_FOUND
LAUNCH_FAILED
TERMINATE_FAILED
TIMEOUT
CANCELED
BACKEND_FAILED
```

同步的 `list()` / `get()` / `isRunning()` 在参数或 backend 失败时直接抛同样的结构化错误。

## 平台与能力

| 平台 | identity / list | launch | terminate | window readiness |
| --- | --- | --- | --- | --- |
| macOS + cgo | NSWorkspace；PID/name/bundle/path | bundle/name/path | graceful/force | Window facade |
| macOS without cgo | process fallback | name/path | process signal/kill | partial |
| Windows | process fallback | name/path | process signal/kill | Window facade |
| Linux | process fallback | executable name/path | process signal/kill | capability-dependent |

`page.openApp()` 与 AI CLI `app.open` 保持各自公开合同并复用同一 launcher bridge；`System` process API、`window` 与 `Events` 保持独立职责。
