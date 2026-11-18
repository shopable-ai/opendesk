---
docType: reference
title: Sound API
description: 播放并控制内置提示音或本地音频文件。
order: 250
---

# Sound API

**状态：Secondary / Native**

`Sound` 提供两种明确的播放语义：旧的 `play*`、`playSound` 和 `play` 是同步阻塞兼容接口；
`start` / `playAsync` 创建可控制的非阻塞播放会话。需要播放较长音频、暂停、停止或等待完成时，
使用会话接口。

系统默认输出音量、mute 与设备发现请使用 [Audio API](audio.md)。`Audio` 不替代或复制本页的
播放器；两个 namespace 保持职责分离。

`Sound` 是 output-only：它不会监听系统输出、麦克风或其他应用，也不会识别声音。需要把本地
`.wav` / `.mp3` 当作参考模式监听时，使用 capability-gated 的
`Audio.watchSound()` / `Audio.waitForSound()`；该能力只在内存中匹配，并不改变 Audio recording
capture 仍为 `notImplemented` 的边界。当前默认产品构建尚未接入系统音频 capture backend，
`patternWatch` 会明确报告 `unsupported`；已有 matcher/backend seam 不代表真实系统监听可用。

## Sound.playSuccess() / Sound.playFail() / Sound.playWarning() / Sound.playError() / Sound.playCaptcha() / Sound.playSound() / Sound.play() / Sound.start() / Sound.playAsync() / Sound.stop() / Sound.stopAll() / Sound.getActive()：方法总览

| 方法 | 参数 | 返回 | 用途 |
| --- | --- | --- | --- |
| `Sound.playSuccess()` | 无 | `void` | 成功提示音并等待完成。 |
| `Sound.playFail()` | 无 | `void` | 失败提示音并等待完成。 |
| `Sound.playWarning()` | 无 | `void` | 警告提示音并等待完成。 |
| `Sound.playError()` | 无 | `void` | 错误提示音并等待完成。 |
| `Sound.playCaptcha()` | 无 | `void` | captcha 提示音并等待完成。 |
| `Sound.playSound(path)` | `path: string` | `void` | 播放指定文件并等待完成。 |
| `Sound.play(path)` | `path: string` | `void` | `playSound` 的兼容别名并等待完成。 |
| `Sound.start(path, options?)` | `path: string`、`{loop?: boolean}` | `SoundPlayback` | 非阻塞启动并返回控制句柄。 |
| `Sound.playAsync(path, options?)` | 同 `start` | `SoundPlayback` | `start` 的别名。 |
| `Sound.stop(id)` | `id: string` | `boolean` | 按 ID 请求停止；未知或已结束会话返回 `false`。 |
| `Sound.stopAll()` | 无 | `number` | 请求停止当前 execution 拥有的所有活动会话，返回接受的数量。 |
| `Sound.getActive()` | 无 | `ActiveSoundPlayback[]` | 查询当前 execution 的活动会话快照。 |
| `playback.isPlaying()` | 无 | `boolean` | 判断句柄是否尚处于 playing/paused/stopping。 |
| `playback.startedAt` | 无 | `string` | 会话创建时的 UTC 时间快照。 |

### 同步兼容接口

```js
// 从仓库根目录运行时，path 相对于当前工作目录或发布包资源目录。
Sound.playSuccess();
Sound.play('./public/done.mp3');
```

这些方法会等待音频播放完成；在同一个 JavaScript execution 中等待期间无法调用另一个
`Sound.stop()`。它们仍会观察 execution cancellation：CLI 的 `Ctrl-C`、transport cancellation
或 execution deadline 会停止当前播放并以 `CANCELED` 结束，而不会等待音频自然完成。旧脚本
应继续使用它们，长音频和需要控制的场景应改用 `start()`。

### 非阻塞播放会话

`Sound.start(path, options?)` 与 `Sound.playAsync(path, options?)` 省略 `options.loop` 时默认 `false`。两者同步返回当前 execution 拥有的 `OpenDeskSoundPlayback`；无效 options 同步抛错，不自动修正类型。

```js
const playback = Sound.start('./public/long.mp3');
console.log(playback.id, playback.status());

await System.delay(1000);
playback.pause();
await System.delay(250);
playback.resume();

const result = await playback.wait();
console.log(result.status); // completed, stopped, or failed
```

无限循环播放必须显式停止；execution teardown 也会自动停止它：

```js
const loop = Sound.playAsync('./public/heartbeat.wav', { loop: true });
await System.delay(5000);
loop.stop();
const result = await loop.wait();
if (result.status !== 'stopped') throw new Error('unexpected playback result');
```

`status()` 的值为 `playing`、`paused`、`stopping`、`completed`、`stopped` 或 `failed`。
`stop()`、`pause()`、`resume()` 返回 `true` 表示本次状态请求已接受；它们返回 `false` 时会话
已经处于不适用或终止状态。`stop()` 返回后，输出设备的缓冲尾音可能还会持续很短时间；
会话会立即进入 `stopped`，`await playback.wait()` 是可靠的停止生命周期通知，不会等待这段
尾音或平台驱动的关闭。

`wait()` 总会在会话进入终止状态后 resolve 一个结果对象；解码/流式错误以 `status: 'failed'`
返回，并附带 `error`。execution teardown 造成的未完成等待会以 `CANCELED` 拒绝。

精确返回形状复用现有类型：

```ts
// Sound.getActive() 的每一项；空列表为 []。
interface OpenDeskActiveSoundPlayback {
  id: string;
  path: string;
  status: OpenDeskSoundPlaybackStatus;
  loop: boolean;
  startedAt: string; // UTC RFC3339Nano 创建时间
}
// await playback.wait()，不是 getActive 的记录。
interface OpenDeskSoundPlaybackResult {
  id: string;
  path: string;
  status: 'completed' | 'stopped' | 'failed';
  error?: string; // 仅存在非空终止错误时提供
}
```

`getActive()` 是当前 execution 尚未终止会话的快照；其中 paused/stopping 也不证明输出此刻可听。`wait()` 的正常终态只 resolve，不因 `failed` 自动 reject；execution 取消的 rejection 与该业务结果区分。

`playback.id` 是创建时分配的字符串会话标识，用于当前 execution 内的 `Sound.stop(id)`；不是跨 execution 可复用的标识。`playback.path` 是 owner 按下述搜索顺序找到的本地文件路径字符串；可能保留相对路径，不保证绝对化或解析 symlink。这两个属性与 `startedAt` 一样由创建时填入当前句柄对象；读取不发起播放、查询或 Promise。当前 JS 属性是普通快照字段；自行改写不会改变 native 会话身份或路径。

### 路径、格式与错误

`path` 可以是绝对路径，或相对于当前工作目录、可执行文件旁的 `sounds` 资源目录、以及
`public` 资源目录的路径。预置名称 `success`、`fail`、`warning`、`error` 和 `captcha` 只供
内部提示音方法使用。当前支持 `.mp3` 与 `.wav`，扩展名大小写不敏感；路径必须是文件，不能
为空或包含 NUL。找不到、无法读取、无法解码或格式不支持时会抛出带稳定 `code` 与 `operation`
属性的 JavaScript `Error`。

| code | 含义 |
| --- | --- |
| `INVALID_ARGUMENT` | 路径、播放 ID 或 `start` options 无效。 |
| `NOT_FOUND` | 音频文件不存在。 |
| `UNSUPPORTED_FORMAT` | 不是 `.mp3` 或 `.wav`。 |
| `BACKEND_FAILED` | 文件解码、speaker 初始化或播放流失败。 |
| `CANCELED` | execution teardown 取消了播放等待。 |

播放器的 speaker 是进程级共享输出；不同采样率的会话会重采样到当前 speaker 采样率，互不
因为另一次 `play` 而重置。会话只归创建它的 execution 管理，`stopAll()` 不会接管其他
execution 的播放。

当 `Audio.watchSound()` 监听 system source 时，`Sound.start()` 播放的内容可能重新进入系统混音。
脚本应检查 `Audio.getCapabilities().patternWatch.selfPlaybackExclusion`，不要在 watcher callback 中
播放与 reference 相同的音频。声音命中只是技术线索；订单等业务状态仍需另行确认。

## playback.isPlaying()

同步查询既有播放会话是否仍处于非终态活动状态，不代表此刻输出可听声音。

**签名**
```ts
playback.isPlaying(): boolean;
```

**参数**

无。

**返回值**

`boolean`：`playing`、`paused`、`stopping` 均为 `true`；`completed`、`stopped`、`failed` 为 `false`。

**行为与错误**

`playback` 是当前 execution 中 `Sound.start()` 或 `Sound.playAsync()` 返回的句柄，不是独立全局对象。两者共享 native 实现；此查询只读取会话状态，不启动/恢复播放、不等待完成、不申请麦克风或录屏权限。各平台使用相同状态判定，创建句柄仍依赖平台音频输出 backend 和可读音频资源。

有效句柄上的查询没有单独的错误 code、Promise rejection、timeout 或 signal 参数，也不会取消播放。它是瞬时状态，不保证下一步仍活动；需要区分暂停与播放请调用 `status()`，需要终态结果请使用 `wait()`。execution teardown 负责结束所属播放；此方法不是取消入口。

**示例**

仅定义供已有句柄调用的函数，不创建播放；实际播放查询本轮未 live 验证：

```js
function describePlayback(playback) {
  return { active: playback.isPlaying(), status: playback.status() };
}
```

## playback.startedAt

读取既有播放句柄创建时的 UTC 时间字符串。

**签名**
```ts
interface OpenDeskSoundPlayback {
  readonly startedAt: string;
}
```

**参数**

无；这是属性，不是函数。

**返回值**

同步返回 `string`，使用 RFC 3339 Nano 格式（UTC `Z`，小数秒精度按值变化）。

**行为与错误**

从当前 execution 的 `Sound.start()` / `Sound.playAsync()` 返回句柄读取；各平台由同一 native owner 在资源解码并取得输出后、提交播放前采样系统时钟。这不是首个样本到达设备的精确时间，不是单调时钟，也不是时长或恢复时间。暂停、恢复、停止及完成不会更新原始会话时间。

读取属性无 I/O、权限请求、Promise、timeout 或 signal，也不取消播放；创建句柄的平台/音频资源前提同上。有效句柄读取没有专门错误。类型声明为 readonly，调用方不应赋值；当前 JS 桥接创建的是普通数据属性，并未以属性描述符强制只读，修改它不会更改 native 会话时间。

**示例**

仅定义供已有句柄调用的函数，不创建播放；本轮仅核对代码，未 live 验证：

```js
function playbackStartTime(playback) {
  return playback.startedAt;
}
```
