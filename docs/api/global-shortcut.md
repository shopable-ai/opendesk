---
title: Global Shortcut API
description: macOS 与 Windows 系统级 globalShortcut 注册、回调与生命周期。
order: 14
---

# globalShortcut

`globalShortcut` 把系统范围快捷键事件投递回当前 OpenDesk JavaScript Runtime。它与 `keyboard` 方向相反：`keyboard` 发送输入，`globalShortcut` 接收系统快捷键触发。

状态：**Stable（macOS、Windows）**。Linux 保留对象形状，但注册会返回 `NOT_SUPPORTED`。

## API 一览

| 方法 | 用途 |
| --- | --- |
| `globalShortcut.register(accelerator, callback)` | 注册当前 Runtime 拥有的系统快捷键。 |
| `globalShortcut.unregister(accelerator)` | 注销当前 Runtime 的一个快捷键。 |
| `globalShortcut.isRegistered(accelerator)` | 检查当前 Runtime 是否拥有该注册。 |
| `globalShortcut.unregisterAll()` | 注销当前 Runtime 的全部快捷键。 |

## 公共约定

### Accelerator

支持 modifier：`CommandOrControl`、`Command`、`Control`、`Shift`、`Alt` / `Option`、`Meta`。

主键支持 `A-Z`、`0-9`、`F1-F24`、`Enter`、`Escape`、`Space`、`Tab`、`Backspace`、`Delete`、`Up`、`Down`、`Left`、`Right`。

兼容别名包括 `Cmd`、`Ctrl`、`CmdOrCtrl`、`CommandOrCtrl`、`Esc`、`Opt`。大小写、空格和 modifier 顺序会被规范化。重复 modifier、缺少主键、未知键或平台映射冲突为 `INVALID_ACCELERATOR`。

### Callback 与生命周期

callback 总是在所属 Runtime EventLoop 中执行。单个 shortcut callback 为 single-flight：上一次 Promise 未 settle 时，新触发会被忽略。

注册是 execution-owned resource。正常结束、异常、timeout、取消或 Runtime teardown 都会清理该 Runtime 创建的注册；不需要 busy loop 保活。

### macOS 权限

当前 macOS backend 需要实际运行 OpenDesk 的宿主拥有 Accessibility 与 Input Monitoring 权限。`register()` 不自动打开系统设置；首次配置可使用：

```js
await page.requestPermissions({
  section: 'globalShortcut',
  openSettings: true,
  strict: false,
});
```

普通 global shortcut 不需要 Screen Recording 或 Automation 权限。

## globalShortcut.register(accelerator, callback)

注册系统级快捷键。

**签名**
```ts
globalShortcut.register(accelerator: string, callback: () => unknown): void;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `accelerator` | `string` | 是 | 无 | 系统快捷键字符串。 |
| `callback` | `Function` | 是 | 无 | 触发时在当前 EventLoop 调用。 |

**返回值**

`undefined`。

**行为与错误**

注册冲突抛 `ALREADY_REGISTERED`；原生权限或资源启动失败抛 `REGISTRATION_FAILED`；不支持平台抛 `NOT_SUPPORTED`。callback throw/reject 进入 async-error 路径并使用 `CALLBACK_FAILED`。

**示例**
```js
function copyText() {
  clipboard.copy('Hello from OpenDesk');
}
globalShortcut.register('CommandOrControl+Shift+1', copyText);
```

## globalShortcut.unregister(accelerator)

注销当前 Runtime 拥有的一个快捷键。

**签名**
```ts
globalShortcut.unregister(accelerator: string): void;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `accelerator` | `string` | 是 | 无 | 要注销的 accelerator。 |

**返回值**

`undefined`。

**行为与错误**

当前 Runtime 未注册该快捷键时为 no-op；不能注销其他进程或其他应用拥有的 shortcut。非法 accelerator 抛 `INVALID_ACCELERATOR`。

**示例**
```js
globalShortcut.unregister('CommandOrControl+Shift+1');
```

## globalShortcut.isRegistered(accelerator)

检查当前 Runtime 是否拥有某个注册。

**签名**
```ts
globalShortcut.isRegistered(accelerator: string): boolean;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `accelerator` | `string` | 是 | 无 | accelerator。 |

**返回值**

`boolean`。

**行为与错误**

只查询当前 Runtime 的本地 registry，不探测其他进程或系统范围占用情况。

**示例**
```js
console.log(globalShortcut.isRegistered('CommandOrControl+Shift+1'));
```

## globalShortcut.unregisterAll()

注销当前 Runtime 创建的全部系统快捷键。

**签名**
```ts
globalShortcut.unregisterAll(): void;
```

**参数**

无。

**返回值**

`undefined`。

**行为与错误**

幂等清理当前 Runtime registry；不会影响其他 execution 或应用。

**示例**
```js
globalShortcut.unregisterAll();
```

## 错误

结构化错误提供 `code`、`operation` 和适用时的 `accelerator`。稳定 code：`INVALID_ACCELERATOR`、`ALREADY_REGISTERED`、`REGISTRATION_FAILED`、`NOT_SUPPORTED`、`CALLBACK_FAILED`。

## 平台与能力

macOS 与 Windows 提供 Stable backend；Linux 当前不支持注册。权限与 backend 失败不会静默降级为仅前台快捷键。
