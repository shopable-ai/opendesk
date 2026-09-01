# TASK-003 — Desktop Event / Watcher

Status: TODO
Priority: P0
Depends on: TASK-002 recommended

## Goal

建立统一的桌面事件订阅原语，减少大量固定轮询，为 Window/App/Clipboard/Display/Input 等能力提供可组合的 watcher。

## MVP 范围

优先实现可靠、低风险事件：

```text
window.focused
window.created
window.closed
window.moved
window.resized
app.launched
app.terminated
clipboard.changed
display.changed
```

输入事件只在有明确产品需求和权限模型时增加，不把本任务演变为全局输入监控器。

## API 候选

```js
const sub = Events.on('window.focused', event => {});
sub.unsubscribe();

const event = await Events.once('window.created', { timeout: 5000 });
```

## 必须解决

- 与 Goja EventLoop 的线程边界。
- subscription ownership 与 execution teardown。
- backpressure / event storm。
- debounce / coalescing 是否放在底层或 helper。
- callback Promise 与失败语义。
- event payload schema version。
- timeout / cancellation。
- 平台 capability discovery。

## 设计约束

- Event 是事实通知，不负责业务推理。
- Watcher 不自动点击、不自动恢复。
- 不允许因为某平台没有原生事件就 silent polling；若使用轮询 fallback 必须显式标记 backend。
- Scheduler 是时间触发，Events 是状态变化触发，两者不要合并。

## 测试

至少覆盖：

1. 窗口 focus 变化。
2. 窗口 move/resize。
3. app launch/terminate。
4. clipboard changed。
5. unsubscribe。
6. execution teardown。
7. callback error。
8. event storm 不造成队列无界增长。
9. once + timeout。

## Done

- 有统一 event abstraction。
- 至少 macOS 核心事件有真实 smoke evidence。
- 与 execution events 日志区别清楚：一个是桌面外部事件，一个是 OpenDesk 执行事件。
- 文档、类型、机器索引同步。
