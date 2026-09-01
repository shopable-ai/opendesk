# TASK-009 — macOS Menu / MenuBar Integration

Status: BLOCKED
Priority: P1
Depends on: TASK-001 recommended
Mode: INTEGRATE_FIRST

## Goal

补齐 macOS 应用菜单、菜单项和系统菜单栏自动化能力，但默认优先复用 Accessibility / Peekaboo / 已有 third-party backend，不重复自研一套成熟 macOS Driver。

## 开始前决策

必须先输出 Build / Extend / Integrate / Skip 判断：

1. OpenDesk Accessibility API 是否已能稳定遍历和操作 AXMenuBar / AXMenu / AXMenuItem。
2. Peekaboo 当前是否已有稳定 menu/menu bar 能力及可复用接口。
3. 现有许可证、进程调用方式、CLI/MCP/库集成成本。
4. OpenDesk 是否只需要统一 facade，而非 native reimplementation。

若 Integration 已覆盖目标，禁止再写第二套 native menu driver。

## MVP 公共能力候选

```js
Menu.list({ app })
Menu.find(path, { app })
Menu.click(path, { app })
Menu.getEnabled(path, { app })
MenuBar.list()
MenuBar.click(item)
```

`path` 示例：`['File', 'Export', 'PDF…']`。

## 必须解决

- 菜单路径本地化与动态项。
- disabled / hidden / separator。
- submenu 展开与 timeout。
- app identity / pid。
- 系统菜单栏与 app menu bar 边界。
- integration backend 的版本与 capability。

## 非目标

- 不依赖 OCR 识别菜单文字作为默认实现。
- 不为了菜单自动化复制 Peekaboo 的整个 macOS 驱动层。
- 不把菜单业务流程硬编码进 core。

## 测试

至少覆盖：

1. 系统应用 File/Edit 等标准菜单读取。
2. 多级 submenu。
3. disabled item。
4. 菜单项不存在。
5. 本地化或动态菜单至少一例。
6. integration backend 不可用时的明确错误。

## Done

- 首先有明确 integration decision 和证据。
- 公共 API 与 backend 解耦。
- 若选择 Peekaboo/第三方，OpenDesk 只维护 adapter、capability 和 contract tests。
- 若必须自研，文档中必须证明现有 backend 无法满足目标。

## Execution record — 2026-09-02

Decision: `BLOCKED`（解除阻塞后采用 `INTEGRATE`，不新建第二套 native menu driver）

Base HEAD: `3fa3d39d6c52b281ec9c3bdb17335e8367a98551`

Final Commit: 本任务的 task-closing commit（实际 SHA 见 Git 历史与连续执行最终报告）

Implementation:

- 当前 Runtime、MCP、HTTP、`types/*.d.ts`、`docs/api` 和 examples 均没有 `Menu` / `MenuBar`
  公共 API，也没有可遍历完整 `AXMenuBar` / `AXMenu` / `AXMenuItem` tree 的 OpenDesk backend。
- 已有 `mouse.clickForPID()`、`keyboard.typeForPID()`、Window JXA actions 和 Recorder AX helpers
  只覆盖点按、focused element 写入或验证，不足以作为菜单层级、动态项、disabled/separator、timeout
  的实现；本轮没有把这些局部能力包装成第二套 menu driver。
- 本地归档的 Peekaboo provider 已覆盖 application menu list、frontmost menu list、按多级 path/name
  click、menu extra 和 system menu-bar item list/click，并返回 enabled、checked、separator、submenu、
  shortcut、path、owner/bundle 等结构化字段及 typed errors。它与本卡的成熟能力重叠充分，决策是
  thin JSON adapter，而不是 Cocoa/AX native reimplementation。
- Peekaboo 是 MIT 许可；仓库已保存 source manifest 和 license evidence。未新增依赖、公共 API、
  `runtime-api.ai.json` 或 `.d.ts`，因为当前宿主无法运行选定 provider，facade-only surface 不能满足 Done。

Tests:

- `go test ./...`：未通过；本任务相关 packages 均通过或无测试，现有 `pkg/visionrun` 仍有 4 个
  与本任务无关的 runtime-input/fixture 失败：两个 real validation input 缺失、一个
  `capture_contract.json` 缺失、一个 preflight `latest.json` 缺失。完整输出在本地
  `.runtime/tests/platform-primitives/task-009-menu-integration/go-test-all.log`。
- 未运行 Menu JS 或真实 macOS smoke：当前没有可调用的 OpenDesk API，`peekaboo` 不在 `PATH`，
  且 provider 的系统/工具链最低要求高于本机。没有把“测试未运行”记录为通过。

Evidence:

- 本机：macOS `12.7.6` (`21H1320`), `x86_64`, Swift `5.7.2`，仅 Command Line Tools；
  `peekaboo` 不在 `PATH`。
- 当前 Peekaboo 官方平台矩阵要求 released CLI/MCP 为 macOS 15+，CLI source build 为 macOS 15+
  与 Swift 6.2+；public SwiftPM package metadata 也从 macOS 14 开始。来源：
  [platform support](https://github.com/openclaw/Peekaboo/blob/main/docs/platform-support.md)。
- provider license 为 [MIT](https://github.com/openclaw/Peekaboo/blob/main/LICENSE)，仓库归档在
  `docs/research/external/peekaboo-LICENSE`；source snapshot manifest 在
  `docs/research/external/peekaboo.json`。
- 本地非提交审计：`.runtime/tests/platform-primitives/task-009-menu-integration/audit.json`；
  其中包含 provider capability、输入文件 SHA-256、host/toolchain 和未运行 smoke 的明确边界。

Why this is blocked:

- 选定的成熟 integration backend 在当前 macOS 12 / Swift 5.7 主机不能构建或运行；
  TASK-001 的完整 Accessibility provider 也因相同平台边界处于 `BLOCKED`。
- 为绕过 provider 下限而从 Cocoa/AX 重写完整 menu/menu-bar driver，违反本卡 `INTEGRATE_FIRST`
  和总 Goal 的防重复约束。
- 只提交接口或 mock adapter 无法证明标准菜单、多级 submenu、disabled/missing item、动态/本地化项、
  system menu bar click 和 backend unavailable error，因此不把未验证 surface 暴露为 public API。

Remaining / unblock condition:

- 在 macOS 15+、Swift 6.2+/对应 Xcode、已安装且已授权 Accessibility/Screen Recording 的
  Peekaboo host 上重新打开本卡。
- 实现 `DesktopProvider` / `PeekabooProvider` 的 thin JSON adapter，固定 provider version/capability
  handshake，并把 provider typed errors 映射为 OpenDesk error model；传统 app menu 与右侧 system
  menu bar 必须保持不同 capability。
- 完成 TextEdit/Finder 等标准菜单、多级 submenu、disabled、missing、动态/本地化、menu-bar item、
  provider unavailable 和 timeout 的 contract + real smoke evidence 后，再同步 JS API、docs、types 和
  `runtime-api.ai.json`。Peekaboo 当前 nested menu-extra item selection 仍需明确标为 unsupported。
