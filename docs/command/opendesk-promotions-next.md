# OpenDesk Promotions v4：本地 Native Qualification、失败修复与最终收口

仓库：`shopable-ai/opendesk`

目标分支：`master`

本轮**不要重新设计 Promotion、不要重新修改 HTML Oracle、不要重新做一次架构方案**。当前 `apps/opendesk/prototypes/promotions/index.html` 仍是已确认 v4 UI / Interaction Oracle；当前 master 已经完成 v4 Model / Native Renderer / Product Owner / Product Integration 的代码接线。

本轮目标只有：

```text
同步当前 master
→ 构建
→ 跑 Promotion / Custom UI / Product lifecycle 自动测试
→ 启动真实 OpenDesk Product
→ 做 macOS Native Qualification
→ 能做 Windows 就做 Windows；不能做就明确保留待验证
→ 任何失败直接修当前 master
→ 重新跑完整相关测试
→ 保存证据并给最终报告
```

不要创建新分支，不要 reset，不要 force push。存在并行会话；开始以及**每次写文件前**重新检查当前 `master HEAD`、`git status` 与目标文件最新内容，不能覆盖其他会话的新修改。

## 1. 首先读取

完整读取：

```text
AGENTS.md

docs/architecture/opendesk-promotions.md
docs/api/.rules.md
docs/api/ui.md

apps/opendesk/prototypes/promotions/index.html
apps/opendesk/prototypes/promotions/samples.js

apps/opendesk/promotions/core.js
apps/opendesk/promotions/controller.js
apps/opendesk/promotions/integration.js
apps/opendesk/promotions/owner.js
apps/opendesk/promotions/official-creative.js

apps/opendesk/main.js
apps/opendesk/app-controller.js
apps/opendesk/scheduler-client.js
apps/opendesk/opendesk.app.json
apps/opendesk/.release/app-mode-runtime-files.txt

cmd/opendesk/app_product_activity.go
cmd/opendesk/app_mode.go
cmd/opendesk/app_scheduler.go
cmd/opendesk/app_measurement_shortcut.go

pkg/customui/model.go
pkg/customui/process_driver.go
pkg/customui/machost/native_darwin.m
pkg/customui/winhost/Host.cs
pkg/customui/winhost/WebSurface.cs
pkg/customui/winhost/bridge.js

types/ui.d.ts

tests/promotions/core.test.js
tests/promotions/lifecycle.test.js
tests/runtime-api/custom-ui-image-readiness.js
tests/runtime-api/promotion-surface.js
```

先记录：

```text
START_HEAD=
git branch --show-current
git status --short
```

必须在 `master`。如果本地有其他未提交修改，不得丢弃；先识别是否与本任务文件冲突。

## 2. 不得回退的当前产品合同

必须保持：

```text
schemaVersion = 2
presentation = image | animated-image | media-only | image-text | text
```

media-only：

```text
允许 image / animated-image
禁止非空 title / description
只保留推广标识、⋯、×、CTA
```

尺寸：

```text
image / animated-image / media-only = 360 × 240
image-text = 360 × 268
text = 360 × 196
```

关闭：

```text
× = 仅关闭本次，不持久化
⋯ = 今天 / campaign 7 天 / 关闭全部
关闭全部后必须有“恢复推广”入口
```

动图：

```text
先 poster readiness
→ surface visible
→ GIF/WebP 自动播放一次
→ 最多约 5 秒
→ poster
```

不得恢复：

```text
promotionMotion
播放/暂停按钮
旧 footer
× = campaign dismissal
旧 schemaVersion:1 layout
四种 presentation
```

## 3. 第一轮自动测试

依次运行：

```bash
node --test tests/promotions/core.test.js
node --test tests/promotions/lifecycle.test.js
make test-promotions
```

任何失败：

1. 找真实生产原因；
2. 直接修生产代码或错误 fixture；
3. 不允许为了通过旧断言恢复旧 UI；
4. 重新运行直到全通过。

重点确保：

```text
5 种 presentation
media-only static / animated
media-only 不出现 title / description
unknown model fail closed
无 promotionMotion / footer
GIF poster → motion → poster
reduced-motion poster-only
× transient only
今天 / 7 天 / disable / restore
campaignId 防 creativeId 绕过
single-flight show
image decode failure
Runner list/move/hide
Agent guard
Runner guard
异步 create/show 与 automation 竞态
```

## 4. Go / Runtime / API 合同检查

先格式化本轮涉及 Go 文件：

```bash
gofmt -w \
  cmd/opendesk/app_product_activity.go \
  cmd/opendesk/app_mode.go \
  cmd/opendesk/app_scheduler.go \
  cmd/opendesk/app_measurement_shortcut.go \
  pkg/customui/model.go
```

然后运行：

```bash
go test ./cmd/opendesk ./pkg/customui ./pkg/appshell ./pkg/scheduler
node scripts/check_api_docs_contract.js
```

重点确认：

```text
ControlState.source
ControlState.imageComplete
ControlState.imageNaturalWidth
ControlState.imageNaturalHeight
```

从：

```text
macOS WKWebView / Windows WebView2 bridge
→ ProcessDriver JSON
→ pkg/customui.ControlState
→ automation/custom_ui.go
→ JavaScript control.getState()
```

全部真实透传。

如果 `docs/api/ui.md` 还没有明确记录 img ControlState 的上述字段，按 `docs/api/.rules.md` **只更新 canonical `ui.md`**；不要重新创建旧 `custom-ui.md`，不要恢复 `types/custom-ui.d.ts`。

类型文件 canonical 名称必须保持：

```text
types/ui.d.ts
```

旧：

```text
types/custom-ui.d.ts
```

不得恢复。

## 5. 构建

运行：

```bash
make build
```

必须确认：

```text
dist/opendesk
dist/opendesk-ui-host
```

构建成功。

随后运行公开 JavaScript image readiness：

```bash
./dist/opendesk -ui -script tests/runtime-api/custom-ui-image-readiness.js -console-mode script
```

必须看到：

```text
CUSTOM_UI_IMAGE_READINESS_OK=
```

且：

```text
imageComplete === true
imageNaturalWidth > 0
imageNaturalHeight > 0
```

如果失败，修 Runtime/host，不允许改测试绕过。

## 6. Promotion Native Surface 实窗资格验证

运行：

```bash
./dist/opendesk -ui -script tests/runtime-api/promotion-surface.js -console-mode script
```

验证两种 placement：

```text
runner-above
screen-bottom-right
```

真实检查：

```text
360×240 主卡
右上角 ⋯ / ×
没有播放/暂停
没有 footer
GIF 播放一次
约 5 秒后 poster
CTA 无明显背景按钮
图片 decode 失败不留空框
```

测试 fixture 若仍展示旧 UI，修 fixture；不要恢复生产旧 UI。

## 7. 正式 OpenDesk Product Qualification

启动真实产品：

```bash
./dist/opendesk -app apps/opendesk -console-mode script
```

如果仓库当前 canonical 启动命令不同，以真实 App Mode 文档 / build 输出为准，但不能退回单独 demo fixture 代替正式 Product。

逐项验证：

### A. Idle show

```text
Runner 可见
自动化 idle
Recorder idle
Measurement idle
Scheduler idle
→ Promotion 才允许出现
```

确认：

```text
Runner 上方
右边缘对齐
间隔约 12 logical units
不遮挡 Run / Stop
不扩大 Runner
```

### B. Runner lifecycle

验证：

```text
Runner move → Promotion 跟随重新 anchor
Runner hide → Promotion 收起
Runner close → Promotion 收起
Runner show → 重新进入可展示状态
List Panel open → Promotion 先收起
```

### C. Runner execution

让 Promotion 可见，然后点击 Run 或使用 Runner 运行快捷键。

必须观察：

```text
Promotion interaction disabled / canceled
→ Promotion surface 消失
→ 才开始 desktop-affecting recipe
```

重点测试 Promotion 正在 create/show 时立刻开始 Run，不允许晚到 Promotion 在任务开始后出现。

### D. Agent

在 AI Assistant 中触发真实 `Agent.run()` 路径和 Calculator 受控任务。

必须观察：

```text
Agent begin → Promotion 收起
Agent running → 不展示
Agent end → 重新进入 idle 条件后才可展示
```

### E. Scheduler

测试：

```text
Scheduler Center 打开
runNow
真实 scheduled execution
```

确认真实 executor 进入 product activity coordinator；不能只证明前端按钮关闭广告。

### F. Recorder

从正式菜单 / Recorder 入口打开。

确认：

```text
native menu callback 不被 barrier 阻塞
Promotion 先收起
Recorder active 期间不展示
Recorder 真正关闭后 activity 才释放
```

### G. Measurement

分别测试：

```text
正式菜单入口
全局快捷键入口
Recorder toolbar 入口
```

确认 Measurement session 生命周期完整抑制 Promotion。

## 8. Focus / Esc / Interaction Group 必须真机验证

不能只读源码下结论。

验证：

```text
Promotion show 不抢当前键盘焦点
点击 Promotion 可正常操作 CTA / ⋯ / ×
点击 Runner 不触发错误 outside close
点击 List Panel 不触发错误 group close
切换到组外窗口 → Promotion 收起
切到其他应用 / 后台 → 动画和 timer 不继续造成可见干扰
Esc → 符合 v4 Oracle
Promotion 关闭 → 焦点没有被送到错误窗口
```

特别检查：

> floating / nonactivating HTML surface 的 `keyEvents` 在 macOS 和 Windows 是否真实收到 Escape。

如果 Esc 在 nonactivating surface 上不可用，不允许用 `blur + timeout` 伪造。应在 Custom UI / interaction group 的正确 native 层修复，并添加最小回归测试。

## 9. Preference / restart

使用正式 Product 验证：

```text
× → 重启后不产生 dismissal
今天不再显示 → 重启仍生效
7 天不再显示此推广 → 重启仍生效
换 creativeId / 同 campaignId → 仍被 7 天规则抑制
关闭所有推广 → 重启仍不显示
托盘“恢复推广” → 恢复
```

偏好文件必须只在：

```text
<appDataRoot>/promotions/preferences.json
```

不得写 Recipe / source tree。

## 10. Windows

如果当前主机是 Windows：

- 重跑 `make test-promotions-native`；
- 验证 WebView2 正常路径；
- 模拟 / 验证 WebView2 unavailable；
- unavailable 时只禁用 Promotion，不阻塞 OpenDesk / Run / Stop；
- 验证 mixed DPI / multi-monitor placement。

如果当前不是 Windows：

```text
不要写 Windows Native passed
```

只报告：

```text
source/cross-platform contract reviewed
Windows native qualification pending
```

## 11. Release payload

核对：

```text
apps/opendesk/.release/app-mode-runtime-files.txt
```

正式包必须包含：

```text
promotions/core.js
promotions/controller.js
promotions/integration.js
promotions/official-creative.js
promotions/owner.js
```

不得因为测试方便加入：

```text
apps/opendesk/prototypes/promotions/**
tests/runtime-api/**
tests/promotions/**
```

## 12. 证据

所有本地 qualification 证据写入 `.runtime/`，例如：

```text
.runtime/promotions-qualification/<run-id>/
```

建议至少保存：

```text
commands.txt
node-tests.txt
go-tests.txt
build.txt
image-readiness.txt
product.log
screenshots/
  idle.png
  media-only.png
  animation.png
  list-open.png
  run-suppressed.png
  recorder-suppressed.png
  measurement-suppressed.png
  focus-before-after.png
qualification.md
```

不要把截图、临时 GIF、构建日志加入正式 release payload。

## 13. 修复原则

发现失败后直接修改当前 `master`，每次写入前重新读取目标文件。

禁止：

```text
新分支
reset
force push
回退 v4 Oracle
为了旧测试恢复旧 UI
只改测试不修生产问题
声称未验证平台已通过
```

如果其他并行会话在同一文件有新提交，先重新读取并合并意图。

## 14. 完成标准

本机可以完成的项目必须全部通过：

```text
node --test tests/promotions/core.test.js
node --test tests/promotions/lifecycle.test.js
make test-promotions
go test ./cmd/opendesk ./pkg/customui ./pkg/appshell ./pkg/scheduler
node scripts/check_api_docs_contract.js
make build
./dist/opendesk -ui -script tests/runtime-api/custom-ui-image-readiness.js -console-mode script
Promotion Native fixture
正式 OpenDesk Product lifecycle matrix
```

最后记录：

```text
FINAL_HEAD=
git status --short
```

## 15. 最终报告

最终只陈述真实证据，必须包含：

```text
START_HEAD
FINAL_HEAD

自动测试命令 / 结果
Go / build 结果
image readiness 结果

macOS Native qualification
Windows Native / cross-platform 状态

Runner / Agent / Scheduler / Recorder / Measurement 抑制结果
Focus / Esc / interaction group 结果
Preference restart 结果

截图 / 日志路径
release payload 核对
修改文件
仍存在风险
git status
```

没有截图或实窗验证，不写“Native 全部通过”。

发现问题就继续修复并重复相应测试，直到本机可验证项全部通过后再结束。
