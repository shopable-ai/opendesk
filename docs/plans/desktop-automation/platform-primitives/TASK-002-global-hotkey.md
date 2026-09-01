# TASK-002 — Global Hotkey

Status: TODO
Priority: P0
Depends on: TASK-001 optional, not required

## Goal

建立正式的系统级快捷键注册能力，使 FloatingWindow、Custom UI、Scheduler、脚本与未来 Agent 可以把“快捷键触发”直接绑定到 Function，而不是模拟按键或依赖 UI 按钮。

## MVP API 候选

```js
const hotkey = GlobalHotkey.register('CommandOrControl+Shift+C', async event => {
  // call function directly
});

hotkey.enable();
hotkey.disable();
hotkey.unregister();

GlobalHotkey.list();
GlobalHotkey.unregisterAll();
```

也可在审计后采用更符合现有 Runtime 命名体系的对象名，但不得创建重复入口。

## 必须解决

- 快捷键规范化：Command/Control/Option/Alt/Shift 与字母、数字、Function keys。
- 重复注册冲突。
- OS 已占用快捷键。
- callback single-flight / reentrancy。
- execution 生命周期结束后的自动释放。
- 多 execution 的所有权隔离。
- callback 错误必须进入统一 execution event / error 体系。
- macOS 权限需求必须基于真实实现验证，不能臆测。
- UI 按钮和 Hotkey 应调用同一个业务函数，不允许“快捷键触发 UI 按钮再触发函数”成为架构主路径。

## 推荐架构

```text
Hotkey event
  -> Runtime event loop
  -> registered callback
  -> domain function

FloatingWindow button
  -> Runtime event loop
  -> same domain function
```

## 非目标

- 不做完整键盘记录器。
- 不做 keylogger。
- 不做跨应用文本窃取。

## 测试

至少覆盖：

1. register -> trigger -> callback。
2. unregister 后不再触发。
3. duplicate registration。
4. enable/disable。
5. callback Promise。
6. callback failure。
7. execution close 自动清理。
8. FloatingWindow 与 Hotkey 绑定同一函数的示例。

## Done

- macOS 有真实可触发 smoke evidence。
- Runtime 生命周期不会泄漏 handler。
- 文档、类型、机器索引同步。
- 示例包含垂直 FloatingWindow 快捷复制按钮 + keyboard shortcut 绑定的最小案例。
