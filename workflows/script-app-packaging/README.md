# Script App Packaging

本目录负责把**已经写好并验证过的 OpenDesk JavaScript**整理为 App Mode package，并按目标平台装入可双击启动的桌面发布产物。

主链路：

```text
已有 JavaScript 自动化
→ 建立/检查 App Mode package
→ opendesk.app.json
→ -app 开发态验证
→ macOS .app / Windows portable distribution
→ 桌面启动验证
```

## 从这里开始

- 开发者或 Agent 执行具体 packaging 作业时，使用 [`$build-script-app`](skills/build-script-app/SKILL.md)。
- 普通用户查看公开功能、目录结构、命令和平台边界时，阅读 [Script App Packaging](../../docs/api/script-app-packaging.md)。
- App Mode 内 `automation.app`、tray/menu action、菜单状态、Single Instance 与退出语义见 [automation.app API](../../docs/api/app-shell.md)。
- 最小可运行 App Mode 示例见 [`examples/app-mode/basic`](../../examples/app-mode/README.md)。

## 与其他工作流的关系

- Agent-to-Recipe / Human-to-Recipe 负责把任务整理成可维护的普通 JavaScript；Script App Packaging 从已经可运行的脚本之后开始，不负责重新理解业务流程或精炼 Recorder generated script。
- [Protected Packages](../protected-packages/README.md) 负责 `.js` → `.odpkg` 的加密、Publisher 签名与 License；它和 App Mode desktop packaging 是两个正交维度。一个产品可以先形成 App Mode package，再按明确产品设计决定其中执行普通 `.js` 还是受保护 artifact，但不能把两种 packaging 混成同一个概念。
- 本工作流不等于 installer 工程。当前 macOS 路径生成/装配 `.app`；Windows P0 是 portable distribution。MSI、MSIX、自动 Start Menu shortcut、文件关联等未实现能力不得写成已支持。

## 固定边界

- `opendesk.app.json` 描述 App Mode package identity、entry、主窗口与 tray/menu 行为；不要把运行时临时状态、机器绝对路径或未公开配置塞进 Manifest。
- 不在本工作流里发明 Runtime API、环境变量或 Manifest 字段。特别是端口/endpoint 配置，只有当前实现、测试与 `docs/api/` 已形成公开契约后才能使用。
- 发布验证必须区分 package layout、cross-build、目标 OS live launch、真实 UI/Tray 行为和代码签名资格；没有做过的层级写 `not run` / `not qualified`。
- 不把 `examples/app-mode/basic` 当作最终用户产品。它只用于理解和验证当前 App Shell 能力。
