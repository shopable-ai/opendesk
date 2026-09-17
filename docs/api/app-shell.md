---
title: App Mode 与 App Shell
description: 从 opendesk -app 启动应用，并理解 Manifest、App Shell、automation.app 与 App API 的职责边界。
docType: guide
order: 205
---

# App Mode 与 App Shell

OpenDesk 的业务应用入口首先是 **App Mode**：

```bash
opendesk -app ./my-app -console-mode script
```

在源码仓库中开发 Runtime 时，同一个入口可以写成：

```bash
./dist/opendesk -app ./my-app -console-mode script
```

`-app <package-dir>` 负责**启动一个 App Mode package**。App Shell 是这个运行模式的宿主层，负责把 package Manifest 投影为主窗口、Tray / Menu Bar、Single Instance 与应用级生命周期。

`automation.app` 不是 App Mode 的启动入口，也不是 package 管理器。它是 **App Mode 已经启动以后，当前 `main.js` 与自己的 App Shell 交互的 JavaScript API**。

## 先区分五个概念

| 概念 | 主要职责 | 典型入口 |
| --- | --- | --- |
| App Mode | 真实运行一个 OpenDesk 应用 package | `opendesk -app <package-dir>` |
| App package / Manifest | 声明应用 identity、entry、window、tray 与静态菜单 | `opendesk.app.json` |
| App Shell | 宿主 Manifest 的原生应用外壳与生命周期 owner | Runtime 内部创建，不由业务脚本手工 new |
| automation.app | 当前 App Mode execution 与自己的 App Shell 交互 | `automation.app.onAction()` 等 |
| App | 操作 Calculator、Browser 等**外部桌面应用** | `App.launch()`、`App.terminate()` 等 |

因此不要把下面三种“app”当成同一个接口：

```text
opendesk -app ./my-app
    = 启动当前 OpenDesk App Mode 应用

automation.app.quit()
    = 让当前 App Mode 应用沿统一生命周期退出

App.launch("Calculator")
    = 从自动化脚本操作另一个桌面应用
```

大写 `App` 的完整 Reference 见 [App API](app.md)。

## 一条完整的 App Mode 链路

```text
my-app/
├── opendesk.app.json
├── main.js
└── assets/
        |
        v
opendesk -app ./my-app
        |
        v
validate package / Manifest
        |
        v
App Shell
├── single instance
├── main window contract
├── tray / menu bar
└── application lifecycle
        |
        v
Current Execution / main.js
        |
        ├── ordinary OpenDesk APIs
        └── automation.app
             ├── onAction()       <- tray / activation action
             ├── updateMenuItem() -> update existing menu state
             ├── quit()           -> request current app shutdown
             └── getCapabilities()  optional context/capability probe
```

这里有两个关键边界：

1. Tray/Menu action **回到当前 App Mode Execution**，不会因为点击一个菜单项就启动第二个 Runtime。
2. `automation.app` 只控制当前应用外壳；业务自动化仍继续使用 `UI`、`page`、`App`、`File`、`Command`、`ui` 等普通 OpenDesk API。

## OpenDesk Flow 文件入口

第一方 OpenDesk product App Mode 还提供统一的 Flow 导入入口：macOS Finder
打开 `.odflow`、OpenDesk/Script Runner 实窗接收 `.odflow`/`.js`/`.mjs` 文件拖放、
产品菜单中的“安装 Flow…”文件选择器，以及已运行实例收到的 LaunchServices 文档事件，
都会把参数交给同一个 native `FlowInstallService`。拖放由 AppKit 原生 host 接收
文件 URL，再以受限内部事件交给 product App Mode；路径不会进入页面 JavaScript，也不会
拼接成 shell 命令。裸 `.js`/`.mjs` 只支持拖放或文件选择，不注册为系统双击关联。
Windows 的文件关联沿用同一服务和安全的单实例文档转交协议；当前仓库只做
source/cross-build 验证，未把 Windows live 行为写成通过。

所有入口都只接受本机真实普通文件的绝对路径，拒绝相对路径、NUL、符号链接、目录和
其他扩展名。单批最多 `32` 个路径，每个路径长度最多 `4096`；热启动的单实例文档转交
还会拒绝重复路径，并且只允许 `.odflow`。macOS bundle 的 LaunchServices / Finder
文件关联也只声明 `.odflow`：`.js` 与 `.mjs` 原有 `-script` 语义不变，只有用户主动拖放
或在“安装 Flow…”中选择时才作为 local Flow 安装。

这些入口只做解析、签名/信任确认、安装和 Runner 刷新，不执行 Flow。未知发布者
必须经过用户确认；安装成功后 Runner 会重新扫描并显示稳定的 `flow-*` / `local-*`
安装项，但只有用户明确点击运行才会产生新的 Execution。重启产品后 Runner 仍从安装
catalog 发现这些项目，卸载则继续走同一 Flow 服务。当前 Windows 只保留
相同的单实例文档转交/源码边界，文件关联与桌面 live 资格仍需目标系统验收。Flow 的 CLI 合同、
trust scope 与卸载策略见 [Flow CLI](flow-cli.md) 和 [Flow 包格式与 CLI](flow-packages.md)。

## 普通 App 开发者的最短路径

已经安装 OpenDesk Runtime 后，应用开发通常只需要：

```bash
opendesk app validate ./my-app
opendesk app doctor ./my-app
opendesk -app ./my-app -console-mode script
```

其中：

- `validate`：静态校验 package / Manifest；
- `doctor`：输出更完整的诊断；
- `-app`：真正启动应用并执行 `main.js`。

`validate` / `doctor` 不执行业务 JavaScript，也不创建 App Shell。完整参数和机器可读错误见 [App Package CLI](app-package-cli.md)。

如果你正在 OpenDesk 源码仓库中开发 Runtime，可以把上面的 `opendesk` 替换为 `./dist/opendesk`；这只是同一个 Runtime 的源码开发入口，不改变 App Mode 契约。

完整应用开发流程见 [Script App Packaging](script-app-packaging.md)。

## automation.app 在什么时候使用

对于只在 App Mode 中运行的 `main.js`，最常见主链路是：

```js
automation.app.onAction(async event => {
  if (event.id === 'sync.now') {
    await automation.app.updateMenuItem('sync.menu', {
      label: 'Syncing…',
      enabled: false,
    });

    // 在这里继续调用普通 OpenDesk 自动化 API。
  }
});
```

这里故意使用不同的 `action` 与菜单项 `id`：`event.id === 'sync.now'` 来自 Manifest 的 `action`，而 `updateMenuItem('sync.menu', ...)` 使用 Manifest menu item 的稳定 `id`。

需要退出当前应用时调用：

```js
await automation.app.quit();
```

### getCapabilities() 为什么存在

`automation.app.getCapabilities()` 不是 App Mode 的“第一个业务步骤”，也不负责创建或启动 App Shell。

它主要解决**共享代码和兼容性探测**：同一段 JavaScript 可能既被 `-app` 使用，也可能被 `-script`、HTTP、Scheduler 等 execution 复用。此时可以先判断当前 execution 是否真的由 App Mode App Shell 拥有。

```js
const caps = automation.app.getCapabilities();

if (caps.enabled) {
  console.log('running as App Mode package:', caps.packageId);
}
```

如果一个文件明确就是 App Mode 的 `main.js`，通常不需要在每次 `onAction()`、`updateMenuItem()` 或 `quit()` 前重复调用 `getCapabilities()`。

四个公开方法的签名、返回值、错误和示例统一见 [automation.app API](automation-app.md)。

## Manifest 与 Runtime 状态的边界

`opendesk.app.json` 是**静态应用契约**。它决定 package identity、entry、主窗口约束、Tray/Menu 初始结构和 Single Instance 等启动信息。

`automation.app` 是**运行期控制面**，P0 只负责：

- 接收当前 Shell action；
- 更新 Manifest 中已经存在的菜单项状态；
- 请求当前应用退出；
- 查询当前 App Shell capability / package identity。

因此 Runtime 不应通过 `automation.app` 动态创建另一份 Manifest、任意增加菜单结构，或把 package authoring 混入业务脚本。

Manifest schema、版本、路径安全和兼容性见 [App Package Format](../architecture/app-package-format.md)。

## 文档职责

按问题类型使用下面的文档，不要把所有 App Mode 内容重新堆回一个 API 页面：

| 你要解决的问题 | 文档 |
| --- | --- |
| 第一次把 JavaScript 做成 App Mode 应用 | [Script App Packaging](script-app-packaging.md) |
| 查 `automation.app.*` 方法 | [automation.app API](automation-app.md) |
| 查 `App.*` 外部应用控制 | [App API](app.md) |
| 查 `opendesk app validate/doctor/build` | [App Package CLI](app-package-cli.md) |
| 查 Manifest schema / compatibility | [App Package Format](../architecture/app-package-format.md) |
| 查 App Shell / Tray / Single Instance 架构 | [App Shell、Tray / Menu Bar 与 Single-Instance](../architecture/app-shell-tray-menu.md) |
| 查开发态与正式桌面产物的启动差异 | [App Mode desktop launch contract](../architecture/app-mode-desktop-launch.md) |

这页只承担 **App Mode / App Shell 的用户关系导航**。公开方法 Reference 不再和图标编码、平台线程、资源校验、发布 staging 等实现/架构内容混在同一页。
