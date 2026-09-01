# TASK-006 — Screen Recording / Frame Stream

Status: TODO
Priority: P1
Depends on: none

## Goal

在现有 `Screen` / `page.screenshot` 截图能力之上增加适合桌面自动化的连续画面原语，用于录制、调试、Evidence、视觉循环和低频观察；禁止重复实现已有单帧截图。

## 开始前必须审计

- `Screen.screenshot` / `page.screenshot` 当前实现与权限模型。
- display / window / region 坐标模型。
- Recorder 是否已有视频或帧序列 Evidence。
- macOS Screen Recording 权限检测。
- 是否已有第三方/native capture backend 可复用。

## MVP 分层

### A. Frame Stream 优先

```js
const stream = Screen.watch({
  target: { type: 'display', index: 0 },
  fps: 2,
});

stream.onFrame(frame => {});
stream.stop();
```

至少支持：display、window、region 三种 target 中当前平台真实可行的部分。

### B. Recording

```js
const recording = Screen.startRecording({
  target,
  fps: 10,
  output: '/tmp/run.mp4'
});

await recording.stop();
```

如果编码依赖过重，MVP 可以先可靠输出帧序列，再把视频编码作为后续层；不得为了“有 API”引入脆弱的大型依赖。

## 必须解决

- Retina / scale factor / 多显示器 / 负坐标。
- window move/resize 后 target 的语义。
- frame buffer ownership、内存上限和 backpressure。
- FPS 上限、drop policy、CPU 占用。
- execution teardown 自动停止。
- 权限拒绝和 target 消失的结构化错误。
- Evidence 文件大小、保留策略和敏感信息 redaction。

## 非目标

- 不做视频编辑器。
- 不做直播平台。
- 不把高 FPS 当作默认值。
- 不替代已有 screenshot API。

## 测试

至少覆盖：

1. 单显示器低 FPS stream。
2. region stream。
3. window target（平台支持时）。
4. stop / teardown。
5. target 消失。
6. 权限拒绝。
7. 多显示器/scale factor。
8. 长时间运行内存不持续增长。
9. recording 输出可读取或帧序列完整。

## Done

- 单帧 screenshot 无回归。
- 至少 macOS 有真实 frame-stream evidence。
- recording 若未达到稳定标准，明确标记 Experimental。
- 类型、API 文档、机器索引同步。
