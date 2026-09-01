---
title: Sound API
description: 播放内置提示音或本地音频文件。
order: 14
---

# Sound API

**状态：Secondary / Native**

`Sound` 用于播放内置提示音或本地 MP3/WAV 文件。

系统默认输出音量、mute 与设备发现请使用 [Audio API](audio.md)。`Audio` 不替代或复制本页的
播放器；两个 namespace 保持职责分离。

| 方法 | 参数 | 返回 | 用途 |
| --- | --- | --- |
| `Sound.playSuccess()` | 无 | `void` | 成功提示音。 |
| `Sound.playFail()` | 无 | `void` | 失败提示音。 |
| `Sound.playWarning()` | 无 | `void` | 警告提示音。 |
| `Sound.playError()` | 无 | `void` | 错误提示音。 |
| `Sound.playCaptcha()` | 无 | `void` | captcha 提示音。 |
| `Sound.playSound(path)` | `path: string` | `void` | 播放指定文件。 |
| `Sound.play(path)` | `path: string` | `void` | 播放指定文件。 |

```js
Sound.playSuccess();
Sound.play('./public/done.mp3');
```

`path` 可以是绝对路径，或相对于当前工作目录/发布包资源目录的路径。当前实现支持 `.mp3` 与 `.wav`。播放会等待音频播放完成，因此长音频不适合作为不阻塞的后台播放器。

预置声音文件依赖发布包或工作目录里的资源文件；找不到、无法读取或不受支持的文件时会抛出错误。
