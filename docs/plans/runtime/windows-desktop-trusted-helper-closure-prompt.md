# OpenDesk Windows Desktop Entry / Trusted Helper Closure

## 目标需求

让 Windows OpenDesk 达到“**一个产品、一个普通用户启动入口、内部 helper 自动受控运行**”的发布前状态。

最终用户链路必须成立：

```text
安装或解压 OpenDesk
→ 普通用户只启动一个 Desktop entry
→ 不出现 Console 窗口
→ 同一 OpenDesk Runtime / App Mode 提供 Script Runner、Recorder、Scheduler Center、Runtime Log 等产品能力
→ 首次需要 host-backed Custom UI 时，由 Runtime 自动启动发行包内 Native UI Host
→ 用户无需且不应手动启动 helper
→ Desktop 与 CLI 在 Windows 默认大小写不敏感文件系统中仍是两个真实、独立的入口文件
→ CLI 保持 Terminal / automation 使用方式
```

固定角色：

```text
opendesk-desktop.exe
→ Windows GUI subsystem
→ 普通用户唯一桌面启动入口

opendesk.exe
→ Windows Console subsystem
→ CLI / developer / automation entry

ui-host/opendesk-ui-host.exe
→ OpenDesk 内部 Native UI helper
→ Runtime 按需自动启动
→ 不作为用户入口
```

内部 helper 必须采用可信 sidecar 模型：随同一发行包交付、从 Runtime 自己的固定 package-relative 路径启动、与 Runtime 保持相同用户/完整性级别、通过窄本地协议通信，并由 Runtime 管理启动、握手、关闭和异常失败。

## 当前状态

架构决策已经冻结，但生产路径仍可能残留 `opendesk.exe` / `OpenDesk.exe` 仅靠大小写区分的旧实现。Native UI Host 已有自动启动与协议握手机制。

Windows consumer signing、SmartScreen / Smart App Control / Defender、真实交互式桌面窗口、UAC、WebView2 clean-machine 行为等仍需要 Windows 环境提供最终发布证据，不能用静态检查替代。

## 本轮执行

基于当前真实实现直接完成 P0 收口，不重新设计 Custom UI 或 App Mode 架构：

- 把 Windows Desktop entry 正式统一为 `opendesk-desktop.exe`，并同步 build、distribution、Installed App Builder、provenance、验证器、CI/tests 和文档；
- 保持 `opendesk.exe` 为 CLI，不为了减少文件数量删除 CLI；
- 保持 `ui-host/opendesk-ui-host.exe` 为内部 helper，不把它变成第二个用户应用；
- 让正式 packaged helper 路径优先于兼容/开发 fallback；不要通过 PATH、shell、临时目录或用户 App Mode package 查找 production helper；
- 验证 Desktop entry 为 PE GUI subsystem 2、CLI 为 Console subsystem 3，并阻止大小写折叠冲突；
- Installed App Builder 继续保全完整同平台 Runtime payload，同时验证 Desktop、CLI、Native UI Host 都存在；
- 对当前环境能够执行的静态、单元和构建契约验证全部执行；没有 Windows live 证据的项目必须明确保留为后续验收项。

本轮同时审查但不伪造以下发布安全闭包：Authenticode signing、受保护安装目录、helper 完整性/签名验证、父进程异常退出后的 helper 清理、helper crash/restart 边界、WebView2 部署、SmartScreen / Smart App Control / Defender 信誉与误报、更新器未来的签名链。

## 完成标准

- Windows artifact contract 明确要求三个不同角色：`opendesk-desktop.exe`、`opendesk.exe`、`ui-host/opendesk-ui-host.exe`。
- `opendesk-desktop.exe` 是普通用户唯一 Desktop entry；用户不需要启动 CLI 或 Native UI Host。
- Desktop / CLI 不再通过文件名大小写表达两个角色，大小写不敏感目录中不会发生路径冲突。
- Desktop entry 的 Windows GUI subsystem = 2；CLI 的 Console subsystem = 3；对应 CI / distribution gate 能发现回归。
- Distribution provenance 的 `cliEntry` / `desktopEntry` 与真实 artifact 一致且是两个不同路径。
- Installed App Builder 输入、输出和 fixture tests 保全 Desktop、CLI、Native UI Host 三个角色。
- Runtime payload checker 将新的 Desktop entry 视为 Windows required payload，并继续检测 case-insensitive collision。
- 正常生产代码、构建脚本、CI 与面向用户的当前文档不再依赖旧 `OpenDesk.exe`；若历史/负向测试保留该字符串，必须明确只是旧错误案例。
- Native UI Host 仍由 Runtime 自动拉起，packaged canonical path 的优先级清楚，不要求用户执行第二个程序。
- 当前环境可执行测试通过；未执行的 Windows 真机、安全信誉、签名和交互式 UI 验收被准确列为后续 gate，而不是标记为 PASS。

## 必要边界

- 不通过删除 CLI 或 Native UI Host 来制造“单 EXE”假象。
- 不把多个内部进程解释成多个用户产品或多个用户启动步骤。
- 不修改 `opendesk.app.json` public schema，不新增 capability dependency solver，不提前实施 minimal/headless packaging。
- 没有真实 Publisher certificate / timestamp service 时，不伪造 Authenticode 已签名结论。
- 没有 Windows 11 真实用户桌面证据时，不宣称 SmartScreen、Smart App Control、Defender、WebView2、Recorder 或产品窗口已经完成最终发布验收。
- 不把 Native UI Host 改成运行时下载、TEMP 落地执行、管理员提权或通用网络服务。