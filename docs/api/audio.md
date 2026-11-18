---
docType: reference
title: Audio API
description: 系统音量、静音、设备发现与实验性的声音模式监听。
order: 240
---

# Audio

`Audio` 提供系统音量、mute、输入/输出设备发现，以及 capability-gated 的固定声音模式监听。音量和设备接口为 Native；`patternWatch` 为 **Experimental**。

## API 一览

| 方法 | 状态 | 用途 |
| --- | --- | --- |
| `Audio.getVolume()` | Native | 读取系统输出音量。 |
| `Audio.setVolume(value)` | Native | 设置系统输出音量。 |
| `Audio.isMuted()` | Native | 读取 mute 状态。 |
| `Audio.mute()` | Native | 静音。 |
| `Audio.unmute()` | Native | 取消静音。 |
| `Audio.toggleMute()` | Native | 切换 mute。 |
| `Audio.getOutputDevices()` | Native | 列出输出设备。 |
| `Audio.getInputDevices()` | Native | 列出输入设备。 |
| `Audio.getDefaultOutput()` | Native | 返回默认输出设备。 |
| `Audio.getDefaultInput()` | Native | 返回默认输入设备。 |
| `Audio.watchSound(options, callback)` | Experimental | 持续监听固定声音 reference。 |
| `Audio.waitForSound(options)` | Experimental | 等待一次固定声音匹配。 |
| `Audio.getCapabilities()` | Native | 查询当前平台/后端能力。 |

## 公共约定

### 音量

音量使用 `0..1` 的有限 `number`。硬件/backend 可能量化 readback，因此 `setVolume()` 后读取值不保证与输入浮点数逐位一致。

### 系统控制、设备与错误

本节只适用于音量、静音和设备查询，不代替 `watchSound()` / `waitForSound()` 的独立合同。默认 backend 仅 macOS 且启用 CGO 时使用 CoreAudio；其他平台及 macOS 非 CGO 构建当前为 unavailable，控制/设备方法抛 `NOT_SUPPORTED`，不回退到 shell。macOS 仍依赖设备实际提供的属性。

这些方法同步执行，没有单次 signal/timeout。由 Audio owner 返回的失败是带稳定 `code`、`operation` 的 Error，`operation` 为当前公开方法全名（如 `Audio.toggleMute`，也包括其内部读取阶段失败）。不要依赖 message 文案。参数对象自身抛出的 JS 异常不保证具有这些字段。

| code | 条件 |
| --- | --- |
| `INVALID_ARGUMENT` | `setVolume` 缺值、null/undefined、不接受的导出类型、非有限数或超出 `0..1`。当前桥接会拆箱 Number 对象，不是严格的 primitive-only 校验。 |
| `NOT_SUPPORTED` | backend 不支持、设备缺少对应属性，或写入属性不可设置。 |
| `DEVICE_UNAVAILABLE` | 控制方法找不到默认输出设备；或取得默认设备 ID 后，枚举中找不到该设备。 |
| `BACKEND_FAILED` | 其他 CoreAudio OSStatus、枚举/数据处理失败或非 AudioError；设置后读取的系统调用失败也可能属于此类。 |
| `READBACK_FAILED` | 音量成功读取值非有限/越界；或 mute 的成功 readback 与请求不符。不是所有读取失败的统称。 |

设置后的任何错误都不能证明设备 mutation 未发生；不要自动重复 toggle。设备枚举成功为空数组时表示没有匹配设备；CoreAudio 的单项 metadata 读取失败可能降级为空串、零或默认值，通道读取失败也可能使设备被过滤，不提供逐项错误保证。

### Pattern watch options

```ts
interface OpenDeskAudioPatternOptions {
  source: { type: 'system' } | { type: 'process'; pid: number };
  references: string[];
  threshold?: number;
  cooldownMs?: number;
  startupTimeoutMs?: number;
}
```

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `source` | `{type:'system'} \| {type:'process', pid:number}` | 是 | 无 | 明确捕获来源；不自动 fallback。 |
| `references` | `string[]` | 是 | 无 | 非空声音 reference ID/本地 wav/mp3 路径列表。 |
| `threshold` | `number` | 否 | `0.88` | `(0,1]` 匹配阈值。 |
| `cooldownMs` | `number` | 否 | `3000` | 同 reference 冷却；`0..600000`。 |
| `startupTimeoutMs` | `number` | 否 | `10000` | backend 启动 timeout；`1..60000`。 |

相对 reference 路径以 `Execution.workdir` 解析。当前 API 不向 JavaScript 暴露 raw audio，也不默认持久化捕获内容。

### Watcher

`watchSound()` 返回 execution-owned watcher，至少包含 `id`、`backend`、`startedAt`、`sourceScope`、`sourceVerified`，并提供 `status()`、`stop()`、`wait()`。状态为 `listening`、`stopping`、`stopped` 或 `failed`。

## Audio.getVolume()

读取系统输出音量。

**签名**
```ts
Audio.getVolume(): number;
```

**参数**

无。

**返回值**

`number`，范围 `0..1`。

**行为与错误**

同步读取；可抛 `NOT_SUPPORTED`、`DEVICE_UNAVAILABLE`、`BACKEND_FAILED`、`READBACK_FAILED`，具体见公共错误合同。

**示例**
```js
console.log(Audio.getVolume());
```

## Audio.setVolume(value)

设置系统输出音量。

**签名**
```ts
Audio.setVolume(value: number): number;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `value` | `number` | 是 | 无 | `0..1` 有限数。 |

**返回值**

backend 设置后的实际音量 readback，范围 `0..1`；可能量化，不保证与输入浮点数逐位一致。

**行为与错误**

同步调用；可抛 `INVALID_ARGUMENT`、`NOT_SUPPORTED`、`DEVICE_UNAVAILABLE`、`BACKEND_FAILED`、`READBACK_FAILED`。量化后仍处于范围内的 readback 是成功。抛错不证明设置未发生。

**示例**
```js
Audio.setVolume(0.5);
```

## Audio.isMuted()

读取当前系统 mute 状态。

**签名**
```ts
Audio.isMuted(): boolean;
```

**参数**

无。

**返回值**

`boolean`。

**行为与错误**

同步读取；可抛 `NOT_SUPPORTED`、`DEVICE_UNAVAILABLE`、`BACKEND_FAILED`；当前没有独立的 `READBACK_FAILED` 校验。

**示例**
```js
console.log(Audio.isMuted());
```

## Audio.mute()

将系统输出设置为 muted。

**签名**
```ts
Audio.mute(): boolean;
```

**参数**

无。

**返回值**

经校验的实际静音状态，成功为 `true`。

**行为与错误**

同步修改 mute 状态；可抛 `NOT_SUPPORTED`、`DEVICE_UNAVAILABLE`、`BACKEND_FAILED`、`READBACK_FAILED`，失败不证明设置未发生。

**示例**
```js
Audio.mute();
```

## Audio.unmute()

取消系统输出 mute。

**签名**
```ts
Audio.unmute(): boolean;
```

**参数**

无。

**返回值**

经校验的实际静音状态，成功为 `false`。

**行为与错误**

同步调用；可抛 `NOT_SUPPORTED`、`DEVICE_UNAVAILABLE`、`BACKEND_FAILED`、`READBACK_FAILED`，失败不证明设置未发生。

**示例**
```js
Audio.unmute();
```

## Audio.toggleMute()

切换系统 mute 状态。

**签名**
```ts
Audio.toggleMute(): boolean;
```

**参数**

无。

**返回值**

切换后的 `boolean` mute 状态。

**行为与错误**

先读取再执行一次对应 mutation，不是原子操作；可抛 `NOT_SUPPORTED`、`DEVICE_UNAVAILABLE`、`BACKEND_FAILED`、`READBACK_FAILED`。失败时结果可能未知，不能自动重放 toggle。

**示例**
```js
const muted = Audio.toggleMute();
```

## Audio.getOutputDevices()

列出当前可发现的输出设备。

**签名**
```ts
Audio.getOutputDevices(): OpenDeskAudioDevice[];
```

**参数**

无。

**返回值**

`OpenDeskAudioDevice[]`。

**行为与错误**

同步读取设备 metadata；不创建音频 capture。无匹配设备返回 `[]`；不支持抛 `NOT_SUPPORTED`，枚举/数据处理失败抛 `BACKEND_FAILED`。单项 metadata 降级见公共约定。

**示例**
```js
console.log(Audio.getOutputDevices());
```

## Audio.getInputDevices()

列出当前可发现的输入设备。

**签名**
```ts
Audio.getInputDevices(): OpenDeskAudioDevice[];
```

**参数**

无。

**返回值**

`OpenDeskAudioDevice[]`。

**行为与错误**

同步读取设备 metadata；无匹配设备返回 `[]`，不支持抛 `NOT_SUPPORTED`，枚举/数据处理失败抛 `BACKEND_FAILED`。单项 metadata 降级见公共约定。

**示例**
```js
console.log(Audio.getInputDevices());
```

## Audio.getDefaultOutput()

返回当前默认输出设备。

**签名**
```ts
Audio.getDefaultOutput(): OpenDeskAudioDevice | null;
```

**参数**

无。

**返回值**

`OpenDeskAudioDevice | null`。

**行为与错误**

CoreAudio 报告无默认设备时返回 `null`。取得默认 ID 后，枚举中找不到该设备抛 `DEVICE_UNAVAILABLE`；不支持抛 `NOT_SUPPORTED`，其他查询/枚举失败抛 `BACKEND_FAILED`。

**示例**
```js
console.log(Audio.getDefaultOutput());
```

## Audio.getDefaultInput()

返回当前默认输入设备。

**签名**
```ts
Audio.getDefaultInput(): OpenDeskAudioDevice | null;
```

**参数**

无。

**返回值**

`OpenDeskAudioDevice | null`。

**行为与错误**

CoreAudio 报告无默认设备时返回 `null`。取得默认 ID 后，枚举中找不到该设备抛 `DEVICE_UNAVAILABLE`；不支持抛 `NOT_SUPPORTED`，其他查询/枚举失败抛 `BACKEND_FAILED`。

**示例**
```js
console.log(Audio.getDefaultInput());
```

## Audio.watchSound(options, callback)

持续监听固定声音 reference 并投递匹配事件。

**签名**
```ts
Audio.watchSound(options: OpenDeskAudioPatternOptions, callback: (match: OpenDeskAudioPatternMatch) => unknown): Promise<OpenDeskAudioSoundWatcher>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options` | `OpenDeskAudioPatternOptions` | 是 | 无 | source/reference/threshold 等选项。 |
| `callback` | `Function` | 是 | 无 | 每次匹配回调。 |

**返回值**

`Promise<OpenDeskAudioSoundWatcher>`。

**行为与错误**

先完成 backend setup，再 resolve watcher。source 不支持、权限不足、reference 无效或 startup timeout 会 reject；不会自动切换 source/backend。watcher 由 execution teardown 清理。

**示例**
```js
const watcher = await Audio.watchSound({
  source: { type: 'system' },
  references: ['./sounds/notification.wav'],
}, match => console.log(match.reference));
await watcher.stop();
```

## Audio.waitForSound(options)

等待一次固定声音 reference 匹配。

**签名**
```ts
Audio.waitForSound(options: OpenDeskAudioPatternOptions & { timeoutMs?: number }): Promise<OpenDeskAudioPatternMatch>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options` | `OpenDeskAudioPatternOptions` | 是 | 无 | pattern watch 选项。 |
| `options.timeoutMs` | `number` | 否 | `30000` | listening 开始后的等待 timeout；`1..600000`。 |

**返回值**

`Promise<OpenDeskAudioPatternMatch>`。

**行为与错误**

setup timeout 与匹配 timeout 分开计算。超时、取消、backend/source/reference 失败明确 reject。

**示例**
```js
const match = await Audio.waitForSound({
  source: { type: 'system' },
  references: ['./sounds/notification.wav'],
  timeoutMs: 10000,
});
```

## Audio.getCapabilities()

返回 Audio 控制、设备和 patternWatch 能力摘要。

**签名**
```ts
Audio.getCapabilities(): OpenDeskAudioCapabilities;
```

**参数**

无。

**返回值**

`OpenDeskAudioCapabilities`。

**行为与错误**

只读取 capability，不修改音量，也不启动 capture。调用方必须以 `patternWatch` 实际 capability 判断监听是否可用。

默认 CoreAudio backend 的控制探测失败也可体现为 `false`；不能仅据该值区分不支持、没有默认设备或读取失败，也不保证下一次控制调用成功。

**示例**
```js
console.log(Audio.getCapabilities());
```

## 平台与能力

系统音量/设备能力依赖当前平台 native backend。patternWatch 当前产品 backend 只有在明确支持并获得所需权限时可用；不支持时报告 unsupported，而不是由 `Events` 或其他 API 模拟。
