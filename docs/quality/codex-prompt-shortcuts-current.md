# Codex 提示词快捷栏：复制消息与管理器定向交付

2026-10-27，`master`，HEAD `39ff3eebad34de5c020ebe699909129600d76d56`。本轮未提交、未推送、未创建或切换分支，未核验远端。本文替代上一轮“当前运行”记录；旧截图和分数不是本轮验收结论。

复制按钮短标签保持原样；完整正文复制并读回后，在工作区右下角显示独立成功消息和约 5 秒本地图文广告演示。管理器调整为 760×600，明确选中态并降低次要操作权重。**代码已加载、定向功能已验证；独立视觉均分仍低于 95，用户视觉接受待定。Codex 写入与跟随继续延期。**

## 当前入口与运行来源

工作目录：仓库根目录 `/Users/shopme/Documents/workspace/opendesk`。已原样运行：

```bash
./dist/OpenDesk.app/Contents/MacOS/opendesk -ui -script examples/custom-ui/codex-prompt-shortcuts/main.js -console-mode script -log-dir .runtime/examples/custom-ui/codex-prompt-shortcuts
```

最后启动于 15:44:29，主 PID **80598**、UI host **80599**，均来自本仓库固定 `dist/OpenDesk.app`。交付时管理器窗口 `167273` 可见，bounds `(484,230,760,600)`；关闭管理可恢复工具条。PID、窗口 ID 和坐标仅是现场证据，下次必须重查。

本轮有原生改动，已用 `scripts/build_macos_app.sh` 刷新配套主程序和 UI host，沿用现有 `com.opendesk.cli` 与 ad-hoc 开发签名，`codesign --verify --deep --strict dist/OpenDesk.app` 通过。这是开发构建验证，不是发行包验收。

源码 `main.js` 与实际加载的 `script_snapshot.js` SHA-256 均为 `16904426ef0f351dd00659627f959ebc896f3c0f9ae8c5309ef3bbc95588891c`。最终主程序为 `ff9188eff1de9cd2ddca5850891f19368964fa09197354e216905308dfdfa978`，host 为 `a898af76bf51f63c423b9e9612002e09f972ebe744ff75b01ffb94cc918f1e14`。完整源码、二进制 hash 与构建时间见本地 `provenance-final.json`。

## 改动与四类证据

| 状态 | 当前事实 |
| --- | --- |
| 代码已修改 | `main.js` 移除按钮“已复制”和管理器底部复制反馈，新增两个可复用消息通道与退出清理；`message-demo.json` 提供可关闭的本地演示。管理器收回空白、突出选中项、降低次要控件权重。 |
| 实际已加载 | 当前脚本 snapshot 与源码 hash 相同；固定开发包主程序和 native host 在最后一次原生修改后重建、签名并启动。实窗中可见新选中态、完整广告标题与浅灰关闭按钮。 |
| 视觉已观察 | 实际查看工具条、管理器、复制与图文消息截图。无明显裁切、重叠或异常留白；广告标题最初过早省略已修复。独立评分尚未达到 95，不能标记用户视觉验收通过。 |
| 功能已验证 | 当前入口真实复制完整 31 UTF-16 单元正文（含换行、emoji、组合音标）；短标签仍为“验收”。连续 12 次交替复制逐次匹配正文，只观察到两个消息窗口。管理器复制时焦点保持在管理器；消息显示中退出后自有窗口归零。 |

正式 logo 逐字节复用 `apps/opendesk/assets/opendesk-logo.png`，SHA-256 `c7e114f765a5ed207f20240b80781f10f279cc374450bbad10f3046a99cf2b1f`；首位 logo、三个提示词槽和下一按钮保留，不生成替代品牌图。

本轮消息实现由 native owner 负责：`automation/custom_ui_notify.go`、`pkg/customui/notification.go` / `validate.go`、macOS `machost/notification_darwin.*` / `native_darwin.m`、Windows `winhost/NotificationSurface.cs`，同步类型与 canonical API 文档。图片通过现有本地资源校验，拒绝 URL、脚本目录外路径和非法图片；内部 imageAsset 不暴露到公开状态。同 placement 的 bottom anchor 按实际尺寸向上堆叠，间距 8pt；整组适配后才提交。macOS 消息窗关闭开窗缩放动画，避免立即读回尚在缩放的尺寸。

演示配置使用本地正式图片，标题明确包含“广告演示”；没有网络、遥测、广告服务或链接动作。成功反馈约 2600ms，广告 5000ms，均可提前关闭。每个通道最多一个句柄；连续点击更新并重置倒计时，失败只记录通知错误，不把已完成复制误报为失败。

## 实窗与定时证据

运行产物统一位于 `.runtime/tests/codex-prompt-shortcuts-messages/`，不入版本控制：

- `toolbar-final.png`：正式 logo、三个提示词槽与下一按钮；空槽禁用。
- `manager-polished.png` / `.json`：最后构建实际加载后的 760×600 管理器，选中高亮与次要操作层级。
- `messages-polished.png` / `.json`：最后构建的两条独立消息，标题完整、关闭按钮清晰。
- `copy-polished.log`：最后构建的全文复制核验；`copy-final.log`、`copied-toolbar.png` 记录前一同实现构建的按钮状态。
- `timing.json`、`messages-final.json`、`ad-remaining.json`、`messages-expired.json`：约 1.06 秒两条消息；约 3.65 秒仅广告；约 5.90 秒消息全部关闭。该定时采样在关闭按钮提亮前完成，后续未改计时逻辑。
- `rapid-copy.log`、`rapid-summary.json`：12 次交替复制逐次读回，14 次独立窗口采样，最多且总共两个消息窗口 ID；不会无限叠窗。
- `manager-focus-summary.json` / `manager-focus-observations.json`：最终构建中 7 次有消息的采样，焦点始终为自有管理器。
- `manager-copy-quit-retry-logs/`、`quit-window-cleanup.json`：管理器复制后有消息期间正常退出，自有窗口为零；交付时已重新启动最终构建。
- `provenance-final.json`、`build-final.log`、`reviews-final.json`：构建、实际加载与独立评审记录。

截图通过只允许指定自有 host PID / Window ID 的 observer 获取；黑色区域是未采集的其他应用内容。未读取或操作 Codex。一次管理器预检在窗口移动后返回 NOT_FOUND，动作前停止；另一次全应用 AX 搜索因未物化 menuBar 返回 SEARCH_INCOMPLETE，未提交动作。随后重新读取自有窗口当前 geometry，打开管理器并通过唯一语义控件执行；不把失败预检记为通过。初次管理器截图捕获到异步打开过渡帧，已排除并在实际 WindowInfo 核验后重新采集。

## 定向验证与限制

从仓库根目录运行：

```bash
node --test tests/custom-ui/codex-prompt-shortcuts.test.cjs tests/custom-ui/codex-prompt-insert.test.cjs tests/test-architecture/example-explorer-catalog.test.js
./dist/opendesk -ui -script tests/runtime-api/custom-ui-toast-image.js -console-mode script
node scripts/api-docs.js check
node scripts/check_api_docs_contract.js
git diff --check
```

- Node 定向回归：**218 项，216 通过、0 失败、2 项可选外部 Browser oracle 跳过**。内存测试不代表桌面通过。
- 正式 JavaScript Runtime Toast gate：**PASS**。覆盖本地 PNG/JPEG、同句柄更新、image:null 清除、非法创建/更新不改变状态或 timer、私有字段边界、三条堆叠、长文字 resize、关闭中间项重排、槽位复用、无关 placement 隔离、位置改变后的重排和兼容别名。
- 两处异步问题经独立评审修复：复制锁在等待反馈前释放；消息 drain 收尾同步清除 running，避免微任务间隙丢失最新内容。独立反事实检查恢复旧实现时对应回归失败，当前实现通过。
- 原生专项评审未发现 CRITICAL/HIGH；短标题 cell inset 问题已修复、复审并由新截图确认。早期测试误把 AppKit 动画中尺寸与 JSON 对象字段顺序当作布局缺陷，已分别修正动画行为与数值断言，没有放宽间距或对齐要求。
- 本轮不跑完整 Runtime catalog 或全仓回归。既有 `go vet` 的 `file_handle.go:135 Seek` 签名告警不在本轮修复范围，不声称全仓静态检查通过。未单独运行 TypeScript 编译。
- Windows native 源码同步，但环境缺少 .NET，**未完成 Windows host 编译或目标系统 live 验证**；Linux Custom UI 当前不支持。多屏、Space/全屏和其他缩放均未验证。

## 独立视觉结论

| 维度 | 工具条 | 管理器 | 消息 |
| --- | ---: | ---: | ---: |
| 布局与对齐 | 96 | 94 | 95 |
| 字体排印 | 93 | 93 | 94 |
| 层级与品牌 | 95 | 94 | 94 |
| 视觉与状态一致性 | 94 | 95 | 95 |
| 产品完成度 | 94 | 94 | 95 |
| 算术均分 | **94.4** | **94.0** | **94.6** |

评分针对当前 macOS 单屏 2× Retina 自有实窗截图，不继承旧 tooltip 分数。评审确认关闭按钮、选中态与次要操作层级的具体问题已解决，未指出必须继续改动的严重可见问题。**三者均未达到用户要求的 95；用户视觉确认仍待定。** 无法找到可证明为已批准的原始精确原型，因此不声称精确还原，也不为凑分扩大设计范围。

## 数据、延期与服务保护

唯一用户库前后 SHA-256 均为 `046f55a4cef84b8be6aa77e50158c441a18cc477146ece1c13880bf5bcf8a4e4`，revision 6、两条提示词、settings 均未改变；该现场内容比旧交接更新，未恢复旧 hash。配置及消息不写入用户库。

Codex composer 写入、窗口跟随、空草稿回读、多行真实粘贴等继续为 **NOT_TESTED / 延期**。已有 CUA 明确拒绝访问 `com.openai.codex`，本轮未用其他通道绕过；`insert.js` 候选和内存反例通过不代表实际兼容。真实 Browser 迁移及完整存储管理实窗矩阵也未扩大。

仅正常退出并重启本轮核验归属的开发入口。安装版 PID 84099 / 84111 与 Browser native-host 93082 最终仍存活且原启动时间保持，未操作。原有未提交 tooltip、预览、类型、候选写入和相关文档均保留；总工作区 diff 包含这些继承修改，不能全部归为本轮新改动。运行产物仅留 `.runtime/`。
