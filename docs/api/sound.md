---
title: Sound API
description: 播放并控制内置提示音或本地音频文件。
order: 14
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

## 方法

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
