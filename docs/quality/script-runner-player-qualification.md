# Script Runner Player Qualification

基准：2026-09-16，生产分支 `master`。

状态值只使用 `PASS / FAIL / BLOCKED / NOT_RUN`。

## 自动化源码验证

| 项目 | 状态 | 证据 |
| --- | --- | --- |
| display name 只剥离末尾 `.js` | PASS | `tests/custom-ui/script-runner-player.test.js` |
| Previous / Next 只选择、不执行、边界不循环 | PASS | 同上 |
| List Panel 单击确认后只隐藏、不销毁、不执行，再次打开复用句柄 | PASS | 同上 |
| Up/Down 高亮与 Enter 提交状态分离 | PASS | 同上 controller-level 行为测试 |
| 快速开关 obey latest intent 且 single-flight | PASS | 同上 |
| 删除后的确定性 replacement helper | PASS | 同上 |
| 官方 `main.js` 在产品 runner 捕获前装饰 base controller | PASS | 同上 source integration assertion |
| 高频列表不显示 `.js` | PASS | 同上 presentation assertion |
| 紧凑 Panel 仅保留列表与图标化“管理脚本”入口 | PASS | 同上 markup 与 manager navigation assertion |
| `apps/opendesk/script-runner-v1/` 未修改 | PASS | 本次变更集不包含该目录 |

## 仍需真机 Qualification

| 项目 | macOS | Windows | 说明 |
| --- | --- | --- | --- |
| Runner 六个高频控件无裁切 | PASS | NOT_RUN | `.runtime/tests/script-runner-player/current-live/panel-open-current-source.png` |
| 长名称 / 中文名称截断但完整语义保留 | PASS | NOT_RUN | 同一实窗截图与 `open-panel.json` 的完整 AX 行名 |
| Panel 与 Runner 位置关系 | PASS | NOT_RUN | 同一实窗截图与 `open-panel.json` 的 native bounds |
| Runner 移动时 Panel 跟随 | NOT_RUN | NOT_RUN | 需要真实 move 事件 |
| Up/Down / Enter 原生键盘 | PASS | NOT_RUN | `.runtime/runs/direct-20260916-195823-193000/summary.json` 记录首次 post-snapshot 与 AX tree 同步竞争；未重放输入，随后 `current-live/read-state.json` 独立确认下一项已提交、Panel 已隐藏且未运行 |
| Esc 只收起 Panel | PASS | NOT_RUN | `keyboard-escape.json` |
| 点击桌面/其他应用/无关 OpenDesk 后自动收起 | NOT_RUN | NOT_RUN | `outside-deactivate.json` 已证明切换到其他应用会收起且不提交；桌面与无关 OpenDesk 窗口仍未运行 |
| 点击 Runner / Panel 内部不误收起 | NOT_RUN | NOT_RUN | 同上 |
| 运行期间 Panel 可查看但所有 selection mutation 被锁定 | PASS | NOT_RUN | `start-safe-run.json`、`running-panel-keyboard.json`；4 行均 disabled，Enter 不提交，Escape 仍隐藏 |
| Stop 后立即恢复导航/选择 | PASS | NOT_RUN | `stop-safe-run.json`；安全 sleep fixture 被正常取消，Run/Stop 状态恢复 |
| 批量运行标题显示实际 queue item，结束后恢复当前脚本 | NOT_RUN | NOT_RUN | 需要完整管理器 + Runner 同屏验证 |
| 刷新、删除、文件缺失错误不替换 Run 目标 | NOT_RUN | NOT_RUN | 需要真实文件系统与 UI 验证 |
| 多显示器 / 缩放 / 屏幕边缘 | NOT_RUN | NOT_RUN | 目标系统实机 |
| Runner 关闭清理 Panel / listeners / base lifecycle | NOT_RUN | NOT_RUN | 需要 native resource evidence |

## 本地正式命令

先从仓库根目录执行 JS 回归：

```bash
node --test tests/custom-ui/script-runner-simple.test.js tests/custom-ui/product-script-runner.test.js tests/custom-ui/script-runner-player.test.js
```

macOS 构建后，使用当前项目正式 App Mode 启动方式打开 OpenDesk，并按本文件矩阵进行实窗验证。运行产物、截图和日志写入 `.runtime/tests/script-runner-player/`，不得提交 `.runtime/`。

Windows 采用对应当前 `master` 构建出的 `dist/opendesk.exe` 与配套 UI host，执行相同交互矩阵；没有 Windows 真机时保持 `NOT_RUN`，不得用跨编译替代真机通过。
