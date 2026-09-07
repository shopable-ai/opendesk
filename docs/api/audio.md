---
title: Audio API
description: 系统音量、静音、设备发现与实验性的声音模式监听。
order: 9
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

同步读取；当前平台/backend 不支持或读取失败时明确抛错。

**示例**
```js
console.log(Audio.getVolume());
```

## Audio.setVolume(value)

设置系统输出音量。

**签名**
```ts
Audio.setVolume(value: number): void;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `value` | `number` | 是 | 无 | `0..1` 有限数。 |

**返回值**

`undefined`。

**行为与错误**

超出范围或非法值拒绝；backend mutation 失败明确抛错。

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

同步读取；不支持时明确失败。

**示例**
```js
console.log(Audio.isMuted());
```

## Audio.mute()

将系统输出设置为 muted。

**签名**
```ts
Audio.mute(): void;
```

**参数**

无。

**返回值**

`undefined`。

**行为与错误**

只修改 mute 状态；backend 不支持或 mutation 失败时抛错。

**示例**
```js
Audio.mute();
```

## Audio.unmute()

取消系统输出 mute。

**签名**
```ts
Audio.unmute(): void;
```

**参数**

无。

**返回值**

`undefined`。

**行为与错误**

backend 不支持或 mutation 失败时抛错。

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

读取并执行一次对应 mutation；不支持时明确失败。

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

同步读取设备 metadata；不创建音频 capture。

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

同步读取设备 metadata；backend 失败时明确抛错。

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

没有可解析默认设备时返回 `null`；backend 失败不伪装成 `null`。

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

没有可解析默认设备时返回 `null`。

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

**示例**
```js
console.log(Audio.getCapabilities());
```

## 平台与能力

系统音量/设备能力依赖当前平台 native backend。patternWatch 当前产品 backend 只有在明确支持并获得所需权限时可用；不支持时报告 unsupported，而不是由 `Events` 或其他 API 模拟。
