# TASK-016 — Known Sound Pattern Watcher

Status: IN_PROGRESS
Priority: P1
Depends on: TASK-004-audio.md, TASK-015-sound-playback-lifecycle.md
Reuses: TASK-003-event-watcher.md lifecycle patterns
Coordinates with: TASK-006-screen-recording-stream.md internal capture backend

Implementation note: matcher、reference loader、execution lifecycle 与 backend injection seam 已具备；
默认产品构建仍未注册 macOS、Windows 或 Linux 系统音频 capture backend。因此当前
`patternWatch` 必须报告 `supported: false, status: 'unsupported'`，公开监听调用必须
`NOT_SUPPORTED` fail closed，不能把这些基础设施表述为可用的系统声音监听。

## Goal

为 JavaScript Runtime 增加 execution-scoped 的固定声音模式监听能力：从用户明确选择的系统输出
或目标进程音频流中，以有界内存匹配本地参考音频，并投递 `audio.pattern.matched` 技术事件。

首要场景是电商客户端订单提示音：声音命中只负责唤醒自动化；脚本仍须通过窗口、UI、OCR 或
业务接口确认订单。不得把一次声音匹配直接命名为 `order.created` 或当作不可丢失的业务事实。

## Audit decision

Decision: EXTEND

- `Sound` 已负责 MP3/WAV 播放和 execution-scoped playback，不增加 `Sound.listen*()`。
- `Audio` 已负责系统音量、mute 和设备发现；持续采集、匹配、权限和 teardown 继续由
  `automation/` native owner 承担。
- `Events.on(type, callback)` 没有 reference、threshold、cooldown 或 source 参数，且按事件类型
  coalesce；MVP 不增加第二个 `Events.on('audio.*')` 入口。
- `Screen.startRecording()` 当前不提供 PCM stream；匹配器不得通过临时录屏文件或高频 shell 命令
  模拟实时监听。
- `Audio.recordSystemAudio()` 继续保持 `notImplemented`。pattern watcher 只做内存内检测，不产生
  录音 artifact，必须通过独立 capability 报告。

## Proposed API

```js
const watcher = await Audio.watchSound({
  source: { type: 'process', pid: 12345 },
  references: [
    { id: 'new-order', path: './sounds/new-order.wav' },
  ],
  threshold: 0.88,
  cooldownMs: 3000,
}, async event => {
  console.log(event.data.patternId, event.data.confidence);
  // 这里只唤醒流程；随后验证订单窗口和状态。
});

console.log(watcher.id, watcher.status());
watcher.stop();
await watcher.wait();
```

全系统输出必须显式选择：

```js
await Audio.watchSound({
  source: { type: 'system' },
  references: [{ id: 'new-order', path: './sounds/new-order.wav' }],
}, callback);
```

`Audio.waitForSound(options)` 提供一次性等待，复用同一 backend、matcher 和 timeout/teardown
契约；不能通过反复打开临时录音文件实现。

### Options

| 字段 | 契约 |
| --- | --- |
| `source` | 必填；`{type:'system'}`，或 capability 支持时的 `{type:'process', pid}` |
| `references` | 必填非空数组；每项包含唯一非空 `id` 和本地 `.wav` / `.mp3` 路径 |
| `threshold` | 可选，有限 `(0,1]` 数值；默认 `0.88` |
| `cooldownMs` | 可选，`0..600000` 的整数；默认 3000，按 reference 独立抑制重复匹配 |
| `startupTimeoutMs` | 可选，`1..60000` 的整数；默认 10000，是覆盖 reference 读取/解码、matcher 准备、权限和 backend 初始化的协作式 deadline；阻塞 OS I/O 与随后有界清理可延迟 settle |
| `timeoutMs` | 仅 `waitForSound`，`1..600000` 的整数；默认 30000，从 setup 成功进入 listening 后计时，仍受 execution deadline 约束 |

首版必须冻结最大 reference 数量、单文件大小、参考音频时长、最大 watcher 数和 PCM backlog。
所有 reference 必须在启动 capture 或触发权限提示前完成参数与文件验证。

### Watcher handle

```ts
interface AudioSoundWatcher {
  readonly id: string;
  readonly backend: string;
  readonly startedAt: string;
  readonly sourceScope: 'system-mix' | 'process';
  /** 只证明本次 stream 保留请求 scope；system-mix 不因此具备应用归因。 */
  readonly sourceVerified: true;
  status(): 'listening' | 'stopping' | 'stopped' | 'failed';
  stop(): boolean;
  wait(): Promise<{
    id: string;
    status: 'stopped' | 'failed';
    stoppedAt: string;
    matches?: number;
    error?: string;
  }>;
}
```

- `stop()` 接受本次状态转换时返回 `true`，已 terminal 时返回 `false`；
- `wait()` 在有界 Stop/Wait 尝试与 matcher worker 停止、且不再投递新 callback 后 resolve；只有
  `status:'stopped'` 确认 session 已释放，`failed` 可能把最终 cleanup 留给 execution teardown；它不
  等待或取消 stop 前已经进入执行的 callback Promise；
- watcher 归创建它的 execution 所有，teardown 自动停止；
- callback Promise single-flight，未消费的新 match 只允许有界合并；
- watcher 仍在监听时，callback throw/reject 以 `CALLBACK_FAILED` 停止 watcher 并进入
  async-error 路径；stop 已接受后，先前已进入执行的 callback Promise 若随后 reject，在 execution
  尚未 teardown 时仍进入 async-error，但不改变 `stopped` 终态，也不延迟 `wait()`。

### Match event

```json
{
  "schemaVersion": 1,
  "type": "audio.pattern.matched",
  "backend": "wasapi-process-loopback",
  "timestamp": "2026-09-05T10:00:00Z",
  "sequence": 1,
  "coalesced": 0,
  "data": {
    "watchId": "audio-watch-1",
    "patternId": "new-order",
    "confidence": 0.93,
    "startOffsetMs": 4200,
    "endOffsetMs": 5100,
    "referenceDigest": "sha256:example",
    "sourceScope": "process",
    "sourceVerified": true,
    "contentIncluded": false
  }
}
```

`confidence` 是当前 matcher version 的相似度，不是业务概率。事件不得包含 PCM、频谱、reference
路径、设备名或进程名；同一分析窗口多个 reference 命中时必须使用确定性的 winner 规则。

## Matching contract

- reference 与 capture 统一到明确的内部 sample rate 和 mono layout；
- 使用频谱模板、log-mel correlation、constellation fingerprint 或经 fixture 证明的等价算法；
- 不比较文件 hash、压缩字节或逐样本完全相等；
- 对音量变化、声道下混和正常系统重采样保持稳定；
- ring buffer 上限只与最长 reference 和固定分析 margin 有关；
- frame drop/discontinuity 必须重置 matcher，不能跨缺口拼出一次命中；
- 过载不能建立无界队列；无法维持契约时以 `RESOURCE_LIMIT` 或 `BACKEND_FAILED` 结束。

首版不承诺抵抗明显变速、变调、强混响、人声遮蔽或多个强音源混合。应优先使用短、独特、频谱
明显的自定义提示音，而不是常见系统 beep 或音乐片段。

## Self-trigger protection

监听系统混音时，callback 中的 `Sound.start()` 可能重新进入 capture。保护优先级：

1. process-scoped capture 只包含目标进程；
2. native backend 排除 OpenDesk 当前进程；
3. 经测试的 runtime suppression window（当前尚未实现）。

capability 必须报告 `selfPlaybackExclusion: 'native' | 'runtime-guard' | 'unavailable'`。没有可靠保护
时不得把 system source 描述为可安全支持；当前 Runtime 会把 backend 声称但尚无实现的
`runtime-guard` 降为 `unavailable`。

## Capabilities

```js
Audio.getCapabilities().patternWatch
// {
//   supported, status, platform, backend, verified,
//   permission: 'screenRecording' | 'none',
//   sources: { system: {...}, process: {...} },
//   formats: ['wav', 'mp3'],
//   matcherVersion: 'spectral-template-v1',
//   sampleRate, maxReferences, maxReferenceBytes,
//   minReferenceDurationMs, maxReferenceDurationMs, maxConcurrentWatchers,
//   selfPlaybackExclusion,
//   rawAudioExposed: false,
//   rawAudioPersisted: false,
//   notes
// }
```

capability 来自运行时 backend/OS probe；不支持时 `watchSound()` 明确 `NOT_SUPPORTED`，不得回退
麦克风、其他 source 或 silent no-op。`verified: false` 必须使所有 source fail closed；该字段描述
当前进程的 backend/source probe，不冒充跨机器 live-evidence 报告。

当前默认产品 backend 为 unavailable/unsupported。以下平台策略描述待实现方向，不是当前支持声明；
只有接入具体 backend、capability probe 与对应 live evidence 后，相关 source 才能报告 supported。

## Platform strategy

### Windows

- system source 使用 WASAPI render-endpoint loopback；
- process source 使用 `ActivateAudioInterfaceAsync` process loopback，并以 PID 为 selector；
- target 消失时 `TARGET_GONE`，不扩大到 system mix；
- 没有真实 Windows evidence 前，只能报告 cross-compile/package，不得标记 verified。

### macOS

- macOS 13+ 使用 ScreenCaptureKit audio sample output，audio-only watcher 不生成视频文件；
- 使用 Screen Recording 权限和稳定 app identity；
- 当前开发宿主 macOS 12.7.6 只能验证编译与 fail-closed availability，不能作为 PCM live evidence；
- 维持应用最低 macOS 12.0，必须 weak-link 并在运行时检查 13.0 availability。

### Linux

后续评估 PipeWire sink monitor / target node。无法稳定把应用映射到 node 时 process scope 保持
unsupported；不隐藏调用 `parec`、ffmpeg 或 sox 作为默认正式 backend。

## Privacy

- 只有显式 `watchSound()` 才开始采集；source 必填；
- PCM 只进入有界内存，不落盘、不上传、不暴露 raw-frame callback；
- stop/failure/teardown 后立即释放 capture buffer、matcher 和 reference PCM；
- 日志、错误、事件和 Evidence 不含声音内容、reference 绝对路径、设备名或进程名；
- 正式 fixture 使用合成、无语音、无版权负担的短提示音；
- 默认 `contentIncluded=false`、`rawAudioPersisted=false`。

## Error model

`INVALID_ARGUMENT`、`NOT_FOUND`、`UNSUPPORTED_FORMAT`、`INVALID_REFERENCE`、`NOT_SUPPORTED`、
`PERMISSION_DENIED`、`DEVICE_UNAVAILABLE`、`TARGET_GONE`、`RESOURCE_LIMIT`、`BACKEND_FAILED`、
`CALLBACK_FAILED`、`TIMEOUT`、`CANCELED`。

## Testing

公共 JS 契约与行为写入 `tests/runtime-api/*.js`，登记 `tests/runtime-api/manifest.js`。从仓库根目录
执行正式 unit gate：

```bash
OPENDESK_RUNTIME_API_MODE=unit ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
```

不得恢复已删除的 shell wrapper；纯 matcher/native seam 才使用同包 Go 白盒测试。

至少覆盖：

1. options、callback、reference 和 capability；
2. reference fail-before-capture / fail-before-permission；
3. 正样本、不同音量、mono/stereo、常见 sample rate 和少量噪声；
4. confuser、长时间负样本、多个 reference、cooldown 与 deterministic winner；
5. callback single-flight/coalescing/failure；
6. discontinuity、device loss、target exit 和 permission denial；
7. stop/wait、execution cancellation、teardown 与资源归零；
8. callback 播放提醒音不会形成自触发循环；
9. 旧 Sound、Audio control/device、Events 和 Screen 无回归。

一次性 watcher 的 match、backend error 与 timeout 使用 producer-observed 的统一原子 first-signal
仲裁，不能依赖 EventLoop task 最终执行顺序；命中后只有 capture 成功停止并释放才 resolve，cleanup
失败必须 reject。backend 原始 OS 错误文本不得进入 JavaScript 或 Evidence。

注入式 Runtime API gate 使用程序合成的无版权 WAV fixture（reference、音量、噪声、重采样、confuser），
通过 `AudioCaptureBackendFactory` 作为监听 PCM 输入；fixture 与 JS evidence 位于临时 execution workdir，
正式运行日志写入：

```text
.runtime/tests/platform-primitives/task-016-audio-pattern-watcher/<run-id>/
```

该 gate 不是 macOS/Windows/Linux 平台 live capture evidence；真实 gate 仍需由独立平台 backend 与安全
fixture 进程完成。

必须分别报告公开一行命令、Runtime API gate、真实平台 live evidence 和仅 cross-compile 平台结果。

## Non-goals

- 不录制或导出系统音频，不监听麦克风，不暴露 PCM；
- 不做 STT、声纹、音乐识别、语义声音分类或 ML 训练；
- 不从实时系统声音自动录制 reference；
- 不自动点击、确认订单或把一次匹配等同于一个订单；
- 不新增 MCP/HTTP surface；
- 不创建第二套 Sound、Events、Screen Recording 或 Audio capture namespace。

## Done

- `Audio.watchSound()` / `waitForSound()` 与 watcher handle 契约可由 JavaScript 验证；
- 至少一个声明支持的平台/source 有真实 live evidence；
- matcher 满足冻结的命中率、误报、延迟与有界资源预算；
- self-trigger protection、权限、取消和 teardown 已验证；
- docs、types、machine index、manifest、example 和 capability 同步；
- 未 live verified 平台明确保持 unsupported/notVerified。

当前默认产品 backend 未实现且没有任一 source 的真实 live evidence，因此本卡保持
`IN_PROGRESS`，不得按上述 Done 条件关闭。
