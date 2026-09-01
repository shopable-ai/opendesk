# TASK-007 — App Lifecycle

Status: TODO
Priority: P1
Depends on: none

## Goal

把当前分散在 `page.openApp`、`System.processList()`、`System.killProcess()`、Window/PID 辅助逻辑中的应用生命周期能力整理成一致的 App 原语，避免上层自动化自己拼 PID、进程和窗口逻辑。

## 开始前必须审计

- `page.openApp` / `openURLInApp`。
- System process list / kill。
- Window 按 PID 操作。
- Recorder 对 app identity / pid 的保存方式。
- macOS bundle id、应用路径和启动方式的现有 helper。

## MVP API 候选

```js
App.launch(target, options?)
App.get(target)
App.list(options?)
App.isRunning(target)
App.waitForLaunch(target, options?)
App.waitForExit(target, options?)
App.terminate(target, options?)
App.restart(target, options?)
```

`target` 应优先支持稳定 identity，例如 bundle id / executable / PID；不要只靠可变的显示名称。

## Launch options 候选

```text
args
env
cwd
activate
waitUntilReady
timeout
```

平台不支持的字段必须显式 capability/error，不 silent ignore。

## 必须解决

- app identity 与 process identity 分离。
- 一个 App 多进程场景。
- launch 已运行 app 的语义。
- graceful terminate 与 force kill 区别。
- readiness 的定义：process started / window available / custom predicate。
- race condition：启动后 PID 变化、helper process。
- timeout / cancellation。

## 非目标

- 不重新实现完整 Process API。
- 不把 App 生命周期绑定到某一个 UI toolkit。
- 不把 `openURL` 浏览器行为混入 App core。

## 测试

至少覆盖：

1. 启动一个系统测试应用。
2. 已运行时再次 launch。
3. waitForLaunch。
4. graceful terminate。
5. force fallback（若设计支持）。
6. restart。
7. waitForExit。
8. app 不存在。
9. timeout。
10. PID 与 Window 联动 smoke。

## Done

- App API 复用现有 page/System/Window 能力，不出现第二套进程系统。
- macOS 至少一套真实 launch → ready → terminate Evidence。
- 旧接口兼容策略明确。
- 文档、类型、机器索引同步。
