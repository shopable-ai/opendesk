# Native Accessibility 架构

本文定义 OpenDesk Accessibility V1 的原生 owner、身份、线程、菜单组合与 teardown 合同。用户调用
schema 以 [Accessibility API](../../api/accessibility.md) 和
[Desktop UI Menu API](../../api/desktop-ui-menu.md) 为准；本文不是另一个公共自动化框架。

## 单一链路与责任边界

```text
可信脚本入口 / execution.Request
  → automation.InitJSOptions
  → 006-ui.js 创建现有大写 UI
  → registerAccessibility(runtime, opts)
      → 唯一 AccessibilityRuntime（execution-owned）
      → macOS AX backend / Windows UIA backend
      → EventLoop 上的 Promise settlement
  → attachUIMenu(runtime, same owner)
```

`AccessibilityRuntime` 持有请求队列、总 deadline、取消、元素 ref 表、目标身份、backend 和 native
资源；原生 backend 只接收已验证的内部 scope/handle，不接触 Goja 对象。`UI` 菜单方法只负责完整路径
解析、逐层展开、重新观察和最终动作协调，不能创建 `MenuRuntime` 或另一张元素表。

应用 adapter 负责具体应用/版本/语言菜单映射、业务前置条件、业务结果验证，以及经过验证的替代路径。
通用 Runtime 不翻译菜单、不自动修复路径、不 OCR/鼠标降级，也不新增 Recorder、Compiler 或 Replay
Runtime。

原有视觉 `UI.tapText()` / `tapImage()` / `tapTexts()` 仍走截图、视觉定位和 mouse；小写 `ui` 仍只
管理 OpenDesk Custom UI。`App` 与 `window` 只提供现有 target、激活和身份信息。

## 授权与初始化

`execution.Request.EnableAccessibility` 由可信入口显式设置，并传到
`automation.InitJSOptions.EnableAccessibility`。本地 `-script`、`-script-text`、stdin 和 `ai run`
可启用；HTTP、MCP 与 Scheduler 默认关闭。所有入口仍使用同一个 Runtime builder；区别只是不可由 JS
更改的 authorization input。

即使禁用，Runtime 也注册 `Accessibility.getCapabilities()` 和 UI 菜单 surface，使脚本能看到
`hostAuthorization.enabled: false`；其他调用在参数通过基本边界后拒绝为 `CAPABILITY_DISABLED`，不
初始化需要目标访问的扫描、不弹权限窗口。SourceLabel、JS 选项和环境变量不是授权依据。该开关不是
完整 Runtime 沙箱。

初始化顺序必须保证：

1. 创建并注册现有 AppRuntime、WindowManager 等基础 owner；
2. 加载现有 polyfills，使 `006-ui.js` 完成 `global.UI`；
3. 创建唯一 AccessibilityRuntime，并显式注册六个 Accessibility 方法，不反射导出 owner；
4. 将三个菜单方法附加到该 UI 对象；
5. Accessibility 注册或菜单附加失败时，关闭已创建的 owner 并等待资源退出；
6. 成功后把 owner 交给 `RuntimeLifecycle.Accessibility`。

`Close`、`Wait`、backend factory、测试 seam、native handles、队列和 ref 表永远不是 JS API。测试
backend factory 只经内部 Request/InitJSOptions 注入，不能由脚本或环境变量选择。

## Target 与身份

### Scope 解析

- App scope 复用现有 App target parser 和当前进程实例消歧；0 个实例为 `TARGET_NOT_FOUND`，多个为
  `AMBIGUOUS_TARGET`。
- Window scope 复用当前 WindowManager 的原生枚举，重新验证稳定 window id、PID 和 native handle。
  `:unresolved`、handle 0 或只凭标题/PID/bounds 的对象不能成为 native scope。
- Element scope 只能来自当前 execution ref 表；公开 id 或序列化 JSON 不能反查任意 native object。
- Ref 绑定进程实例（包括可用的 launch time）、window/container 身份和 native element。PID、handle、
  title、identifier 都不能单独成为跨重启永久身份。

每次 read/perform/menu step 前重新验证目标实例。窗口/进程关闭重建、ref 释放或其他 execution 的 ref
返回 `STALE_TARGET` / `INVALID_ARGUMENT`，不得自动按名称重定位。

### Popup owner

menu bar 是应用级 semantic root，macOS 不能用主窗口矩形裁剪。Windows 多窗口优先锚定明确 HWND。
展开产生的 popup 可能在原窗口外，也可能有新 handle；backend 必须用平台 owner/relationship 证明它
仍属于原 target。相同 PID、同名文字、空间接近或 handle 改变都不是充分条件；证明不了就 fail closed。

## Selector、节点与 role 规范化

selector 的 role/name/identifier 是当前 scope 内的精确 AND predicate。搜索必须遍历到有界完成后才能
证明零或唯一；遇到 maxDepth/maxNodes/deadline 而不能证明时返回 `SEARCH_INCOMPLETE` / `TIMEOUT`。

backend 把原生角色规范化到共享 role；核心映射如下：

| OpenDesk role | macOS AX role | Windows UIA control type |
| --- | --- | --- |
| `application` | `AXApplication` | application semantic root |
| `window` | `AXWindow` | `Window` |
| `menuBar` | `AXMenuBar` | `MenuBar` |
| `menu` | `AXMenu` | `Menu` |
| `menuItem` | `AXMenuItem` / `AXMenuBarItem` | `MenuItem` |
| `button` | `AXButton` | `Button` |
| `checkbox` | `AXCheckBox` | `CheckBox` |
| `radioButton` | `AXRadioButton` | `RadioButton` |
| `textField` | `AXTextField` | `Edit` |
| `staticText` | `AXStaticText` | `Text` |
| `list` | `AXList` | `List` |
| `listItem` | 无独立 AX 常量；不能从 `AXRow` 猜测 | `ListItem` |
| `table` / `row` / `cell` | `AXTable` / `AXRow` / `AXCell` | `Table` / `DataItem` / `DataItem` |
| `group` | `AXGroup` | `Group` |

未列出或不能安全等价的原生角色统一为 `unknown`，同时保留 `nativeRole`；禁止兜底映射为 button。
role 只描述语义分类，动作仍必须查询当前 AX action/属性可写性或 UIA pattern。

Snapshot 返回 detached 普通数据；只有 `find()` 为唯一候选创建受管 ref。默认不读 value，受保护/密码
value 一律拒绝。错误和常规日志不带 selector、value、完整树、完整菜单路径或 native address。

## 请求、队列与 EventLoop

一个 AccessibilityRuntime 使用有界 FIFO 请求队列，V1 上限 32。请求 deadline 从入队开始，覆盖查询、
菜单逐层操作、复核和必要清理；每层不能获得新的完整 timeout。菜单组合在这个 owner 内串行，避免自身
操作互相穿插，但不能锁住真人、其他进程或旧鼠标脚本。

原生 worker 不持有或操作 Goja value。参数在 EventLoop 上验证并转换成 Go 数据，worker 只做 native
调用，结果再调度回所属 EventLoop settlement。Promise 迟到时先检查 execution/owner 状态；关闭后
丢弃 JS settlement，但仍必须正确释放 native 结果。

排队取消会移除/跳过请求；in-flight 调用只传播 context 并使用平台 timeout，V1 不承诺强制中断，
所以 `hardCancel: false`。动作提交后 timeout/cancel 必须根据是否可能发生输入返回 `unknown`，不能因
Promise 已放弃就把 native 资源计数强制归零，也不能为卡住 provider 不断创建替代线程。

## Ref 生命周期与资源计数

ref 表上限 256，表项记录 execution nonce、target/container identity、native handle、released/in-flight
状态。每个请求在使用 ref 时获取 lease；`release()` 标记待释放，只有 lease 归还后才调用 backend
release，避免与原生请求竞态。同一个合法已释放 ref 再 release 返回 false；伪造/跨 execution 对象失败。

`RuntimeLifecycle` 必须对 Accessibility 对称接入：

```text
CancelAsync → Close/stop accepting → Wait → ResourceCounts
```

计数显式为 `accessibilityWorkers`、`accessibilityPending`、`accessibilityQueued`、
`accessibilityRefs`、`accessibilityNativeResources`。未 await 请求属于 pending lifecycle，不能被 execution
结束条件遗漏；只持有闲置 ref 不维持脚本存活，但 teardown 必须释放它。初始化、成功、失败、timeout、
cancel 和多次 execution 后，正式 cleanup event 都必须报告五项为零；若 provider 未返回，则如实报告
残留/阻塞，不能伪造零。

## 动作状态与菜单 side effect

最终动作只能提交一次。每次提交前重新检查 target、enabled/readonly、当前状态和实际 action/pattern：

- `invoke` 只用 AX/UIA 的明确命令动作；
- `setValue` 只用可写 value/value pattern；
- `expand` / `collapse` 需要方向明确的 expand/collapse 状态与 pattern；
- `select` 使用 selection item 语义，不借 toggle；
- `setChecked` 已满足时为 `not_needed`，三态/未知状态不能用循环 toggle 猜。

`not_started`、`not_needed`、`acknowledged`、`unknown` 描述最终动作状态，不是业务后置条件。菜单错误
还记录 zero-based `failedLevel`、`completedLevels` 和 `expansionOccurred`；最终动作没开始不代表之前
没有展开 side effect。清理只在仍能证明菜单属于原 target 时进行，不向未知前台窗口盲发 Escape，且
清理失败不能覆盖原错误。

## 平台 backend

### macOS AX

- 使用 AXUIElement client API；权限 preflight 不带 prompt，实际操作前重查 `AXIsProcessTrusted()`。
- 查询实际 supported actions 和 attribute settable 状态；CF object 在成功、失败和取消路径都按
  Create/Copy ownership 释放。
- 对实际调用的每个 AXUIElement 设置有界 messaging timeout；不假定子元素继承父元素 timeout。
- 原生动作不依赖鼠标坐标；无 cgo 明确 unsupported，不切 AppleScript。

### Windows UIA

- 使用类型化 UIA COM client 和元素 pattern，不把 IUnknown 当任意 IDispatch。
- 唯一 worker 固定在一个 OS thread，以 MTA 初始化、调用和释放；Goja/Custom UI 线程不阻塞执行 UIA。
- HRESULT、BSTR、VARIANT、数组与 COM reference 在所有路径成对处理；目标 action 由当前 pattern 决定。
- native bounds 不直接进入 OpenDesk mouse logical coordinates；混合 DPI 或转换无法证明时 `bounds: null`。

平台源码存在、依赖存在和 cross-compile 只证明相应层级；Runtime/native live evidence 独立报告，不能
互相替代。普通 smoke 只能操作 repo-owned fixture 或本轮明确启动且可安全清理的实例。

## V1 明确不做

- 全桌面事件订阅、持续 wait API 和完整文本 range 编辑；
- 独立 MSAA 公共后端；
- 菜单自动翻译、路径修复、OCR/鼠标 fallback；
- 新 HTTP/MCP route、第二个脚本 runner、Recorder/Compiler/Replay Runtime；
- 从未验证 native bounds 推导鼠标坐标，或把原生 acknowledgment 当业务完成。
