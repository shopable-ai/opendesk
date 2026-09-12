---
title: App Mode 与 App Shell
description: 从 opendesk -app 启动应用，并理解 Manifest、App Shell、automation.app 与 App API 的职责边界。
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
    await automation.app.updateMenuItem('sync.now', {
      label: 'Syncing…',
      enabled: false,
    });

    // 在这里继续调用普通 OpenDesk 自动化 API。
  }
});
```

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