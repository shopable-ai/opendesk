# Codex 提示词快捷栏运行体验交付

> 历史预览阶段记录。本文件描述当时状态；后续正式 logo、真实复制与管理入口的当前验证见 [真实业务入口验证](codex-prompt-shortcuts-current.md)。

2026-10-27，基于 `master` 的 `39ff3eebad34de5c020ebe699909129600d76d56`。本轮未提交、未推送；未核实远端。用户要求继续完善，并说明如何运行、实际启动情况和测试结果。

本轮保持已确认的三个提示词槽位、“下一”和“管理”共五个 40×40pt 居中纯文字按钮。没有新的视觉设计变更，没有修改完整模式的业务实现或原生组件。完整模式仍为 `COPY_ONLY_PENDING_AX_VALIDATION`。

## 可运行入口

工作目录为仓库根目录 `/Users/shopme/Documents/workspace/opendesk`。已准备好的固定开发构建为 `dist/OpenDesk.app`。

公开外观预览：

```bash
./dist/OpenDesk.app/Contents/MacOS/opendesk -ui -script examples/custom-ui/codex-prompt-shortcuts/preview.js -console-mode script -log-dir .runtime/examples/custom-ui/codex-prompt-shortcuts-preview
```

预览只创建自有原生窗口。悬停显示 tooltip，拖动顶部移动，点击原生关闭按钮退出；前台终端可用 `Ctrl+C`。五个按钮没有业务回调，不访问外部窗口、提示词库、剪贴板或键盘。日志在 `.runtime/examples/custom-ui/codex-prompt-shortcuts-preview/`。它没有自动关闭计时器或单实例保护，已有预览时先使用并关闭它再运行。

完整模式：

```bash
./dist/OpenDesk.app/Contents/MacOS/opendesk -ui -script examples/custom-ui/codex-prompt-shortcuts/main.js -console-mode script -log-dir .runtime/examples/custom-ui/codex-prompt-shortcuts
```

该模式读取本地提示词库、查询 Codex 窗口，并允许复制正文。提示词库为空或目标未识别时先显示管理器；管理器前台时快捷栏可能隐藏。保存提示词、关闭管理器、切回 Codex 后体验；通过管理器“退出”结束。完整命令在本轮仍未执行，保留原有 Codex 界面访问边界，不经其他通道绕过。

## 当前实窗与验证

当前保留的窗口来自旧独立预览命令：

```bash
./dist/OpenDesk.app/Contents/MacOS/opendesk -ui -script .runtime/tests/floating-tooltip/manual-preview.js -console-mode script -log-dir .runtime/tests/floating-tooltip/manual-preview/logs
```

本轮只读复查主 PID **48631**、host PID **48633**；主程序和 host 都来自本仓库 `dist/OpenDesk.app/Contents/`。WindowServer 确认标题“OpenDesk 提示词预览”、窗口 ID **166950**、可见 bounds **(420,240,60,280)**。PID 和坐标仅表示本次观察，不能当作下次运行的固定值。没有重复启动、移动或关闭该窗口。

| 交付状态 | 本轮事实 |
| --- | --- |
| 代码已修改 | 新增稳定 `preview.js`，复用原生 `FloatingWindow`；补充本目录和 Custom UI README，并登记 manual 示例 Catalog。修正完整模式初始管理器的条件说明。 |
| 实际已加载 | 当前运行的是旧独立入口，其源码与 Runtime `script_snapshot.js` SHA-256 完全相同。Node 静态比较确认新公开入口与这两份源码的窗口选项、五个按钮 id、label、text 和无回调声明完全一致。**未执行新路径命令，未声称它已加载。** |
| 视觉已确认 | 通过 ScreenCaptureKit 仅采集当前 host PID 的自有窗口；实际查看五按钮截图，文本居中、按钮外框一致，无裁切、错位或异常空白。未改变视觉，不重新评分，也不将旧 96.6 分作为新入口评分。 |
| 功能已验证 | 当前 WindowServer 读回可见窗口；本轮 Node 定向回归 120 项中 118 通过、2 项既有可选 Browser oracle 跳过。没有新增真实悬停、拖动或点击测试；历史 tooltip 实窗与 Runtime 证据见下文。 |

为保留用户正在体验的窗口，没有原样运行新公开入口的一行命令。静态声明一致性、Node 语法编译和旧路径实窗证据不等于新路径启动验收；也不证明完整 Codex 链路通过。

主程序 SHA-256 为 `f4a18be5bae70cea32704168a962d032dbf9d638d11000f7883e96010549e805`，host 为 `c0703b878e2da83680893b7820b2755d50cd44f3d0500b3ff964e649a5f69c17`。本轮重查 candidate9 provenance 中的源码和二进制共 12 个 hash 全部匹配；`codesign --verify --deep --strict dist/OpenDesk.app` 通过，仍为既有 ad-hoc 开发签名。

## 定向检查结果

从仓库根执行：

```bash
node --test tests/custom-ui/codex-prompt-shortcuts.test.cjs tests/test-architecture/example-explorer-catalog.test.js
node scripts/audit_test_architecture.js
git diff --check
```

- Node：**120 项，118 通过、0 失败、2 跳过**。覆盖完整生产脚本的内存 VM 回归和 Catalog 结构/启动参数；不触发真实桌面、剪贴板或 Browser。公开预览另做 Node 异步语法编译与原生声明一致性核对，结果通过。
- 目录总审计：**失败**，当前 Go 测试文件 360 个，已审核行预期 300 个，并报告未分类的既有 Go 测试。本轮没有新增或修改 `_test.go`、台账或审计逻辑；不把此结果表述为全仓通过，不扩展为台账修复。
- `git diff --check`：通过。`.runtime/` 已被既有 `.gitignore` 覆盖，无需新增忽略规则。

证据目录为 `.runtime/tests/codex-prompt-shortcuts-preview/`：`observed.json`、`window.png`、`declarations.json`、`provenance.json`、`node-tests.log`、`layout-audit.log`、`layout-audit.json`。运行产物不进入版本控制。

既有 tooltip 证据经 hash 核对仍对应当前原生源码与构建：32 个自有窗口场景、303,528 条几何断言、13,440 次放置、正式 JS tooltip contract 及文字 Runtime 的 192 个并发响应回归。本轮没有机械重跑它们；其范围及原始证据见 [tooltip 定位记录](floating-tooltip-position.md)。

完整 Codex 一行命令、跨应用跟随、安全插入、真实 Browser 迁移、Windows、多屏实机和屏幕阅读器仍未验证。保留用户当前 library/config/lock、安装版 `/Applications/OpenDesk.app` 和 Browser 服务；未创建或切换分支，未覆盖安装包或调整模型路由。
