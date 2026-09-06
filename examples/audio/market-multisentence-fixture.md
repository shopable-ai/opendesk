# Market multi-sentence audio fixture

从仓库根目录运行：

```bash
./dist/opendesk -script examples/audio/generate-market-multisentence-fixture.js -console-mode script
```

## 人类可读的生成思路

这个 fixture 不是“识别一句话”的 ASR 测试，而是测试 Audio pattern watcher 能否从一段有背景、有噪声、音量变化和干扰的系统混音中，找到两个预先注册的固定声音模板。

生成器按以下顺序工作：

1. macOS 优先用系统自带、无需网络和付费账号的 `/usr/bin/say` 生成三句话，再用 `/usr/bin/afconvert` 转成 48 kHz、mono、PCM16 WAV。
2. 如果 TTS 不可用、命令失败，或设置 `OPENDESK_AUDIO_FIXTURE_FORCE_FALLBACK=1`，就用 JavaScript 的正弦音符、包络和谐波生成确定性 cue。
3. 生成一个原创、确定性的和弦/低音/琶音/节拍背景 bed，再加入固定伪随机噪声；不下载网上音乐，因此每次运行内容一致，也没有第三方素材版权或网络失败问题。
4. 把 cue 混入 20 秒背景，并把输出统一写成 48 kHz、mono、PCM16 WAV。

## 三句话与监听目标

| patternId / 文件 | 句子内容 | 监听角色 | 混音时间 |
| --- | --- | --- | --- |
| `order-created` | “Order created” | 注册 reference、应命中 | 3 秒 |
| `payment-completed` | “Payment completed” | 注册 reference、应命中 | 11 秒 |
| `payment-pending-confuser` | “Payment pending” | 不注册，只作相近语句干扰、应零命中 | 7 秒 |

监听器只注册前两个 reference：

```js
references: [
  { id: 'order-created', path: '.../order-created.wav' },
  { id: 'payment-completed', path: '.../payment-completed.wav' },
]
```

因此 `order`、`payment` 是 pattern ID，不是关键词；Audio matcher 比较固定声学模板，不做关键词提取、不做 ASR，也不能单独证明订单或支付业务事实。

## 20 秒混音结构

- 背景：原创确定性和弦、低音、琶音、节拍和噪声。
- 3.0 秒：`Order created`，目标命中。
- 7.0 秒：`Payment pending`，相近语句 confuser，目标应零命中。
- 11.0 秒：`Payment completed`，目标命中，并经过 44100→48000 重采样路径。
- 16.2 秒：额外的扫频音调干扰，目标应零命中。

生成器最后会打印 `utterances`、`watchTargets`、`tts`、fallback 原因和四个 WAV 的绝对路径。正式 listener 在当前产品 backend 不可用时会记录 `skipped`，memory seam 不能冒充 live capture 证据。
