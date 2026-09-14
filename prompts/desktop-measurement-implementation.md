# OpenDesk：以已确认 HTML 样机为基准完成真实 Desktop Measurement Session

## 目标需求

直接在当前 OpenDesk `master` 上继续实施桌面测量工具，直到真实产品实现与已确认样机的核心视觉层级、交互语义和功能合同基本一致，并形成可维护的自动化验证闭环。

仓库：

```text
https://github.com/shopable-ai/opendesk
```

目标分支：

```text
master
```

不要创建新分支。当前可能有其他会话并行修改 `master`，开始以及提交关键修改前都重新读取真实 HEAD，不要 reset、checkout 或覆盖无关修改。

本轮不是继续讨论方案，也不是重新制作 HTML 样机。需要持续执行代码修改、测试、修复和复验，直到当前环境中能够完成的 P0/P1 项闭合；遇到单个失败时定位并最小修复，不要停在审计报告。

## 权威输入

必须首先完整查看并以当前仓库内容为准：

```text
apps/opendesk/prototypes/desktop-measurement/README.md
apps/opendesk/prototypes/desktop-measurement/index.html
apps/opendesk/prototypes/desktop-measurement/template.html
apps/opendesk/prototypes/desktop-measurement/model.js

docs/architecture/desktop-automation/desktop-measurement.md
docs/quality/desktop-measurement-prototype.md

tests/desktop-measurement/README.md
tests/desktop-measurement/browser.test.py
tests/desktop-measurement/model.test.js

pkg/measurement/
```

其中 `apps/opendesk/prototypes/desktop-measurement/index.html` 是已经确认的长期 UI / Interaction Oracle。不要为了迁就当前 Go 实现而降低样机合同，也不要把样机里的模拟桌面、fixture 控制器或测试替身直接复制到生产代码。

## 当前已知偏差，仅作为检查起点

必须用最新源码重新验证，不能盲信下面描述；若仍成立则直接修复：

- 当前 `pkg/measurement/session.go` 仍通过 `replaceSurface()` 在普通状态变化时创建新 surface，再关闭旧 surface；应优先收口为单一稳定 Measurement Session / Surface 的状态更新。
- 当前原生界面与样机的信息层级明显不同：工具条偏向顶部，详情嵌入 HUD，而样机是底部小工具条、独立角落 HUD、目标附近 micro 信息和按需独立 Inspector。
- 当前 `Escape` 可能直接结束会话，没有先处理详情、菜单等局部 UI 的关闭语义。
- 当前实现需要核查并补齐：八方向 resize handles、拖动、Tab / Shift+Tab 候选层级切换、Alt/Option 暂停吸附、1–4 工具快捷键、R/I、三档复制快捷键、Shift+方向键语义等。
- 当前 `CaptureFrame.TargetConfirmed` 的产品默认策略需要与 canonical 设计重新对齐：能可靠识别进入前真实目标窗口时应直接锁定；证据不充分时才进入显式确认，不应让所有正常入口都多一次无意义确认。
- `pkg/measurement/session_layout_test.go` 当前更偏向字符串/token 存在性检查，无法阻止工具条位置、Inspector 归属、Esc、候选切换、resize handles 等交互回归。

## 必须达到的产品结果

最终用户链路必须真实成立：

```text
全局快捷键 / Recorder「测量」 / 开发者「桌面测量…」
→ 进入同一个 Measurement Session
→ 保存并锁定进入前真实目标上下文
→ 在任何测量 UI 出现前冻结干净桌面快照
→ 明确 Target 与 Reference
→ 点 / 区域 / 两点 / 两区域测量
→ 目标与参照边框、必要距离线、目标附近短标签
→ 角落精简 HUD 自动避让
→ 底部小工具条切换模式 / 参照 / 复制 / 详情 / 退出
→ 拖动、八方向改变大小、键盘微调、候选切换、临时暂停吸附
→ 三档复制或保存
→ 详情按需打开且关闭详情不结束会话
→ 退出后完整清理并恢复合法上下文
```

默认状态不得回退为大型普通工具窗口，不应长期占据目标软件可见区域，也不能把 PID、窗口句柄、完整 JSON 等调试信息常驻在主界面。

## 实施要求

优先保留已经正确的 Measurement 几何、快照、颜色、结果模型和生命周期代码；重点维修 presentation / interaction / session coordination。若结构已经难以维护，可把生产 View 拆成清晰的内部 HTML/CSS/JS 或等价资源，但不要创建第二套测量模型。

普通状态切换应尽量在同一个 surface 内更新，不因切换工具、结果、HUD、详情等反复销毁并创建窗口。先检查 `customui` 当前是否已有可靠的内部状态更新 / execute / patch 机制；只有确实缺少时，增加最小的内部能力，不要无必要扩张公共 Runtime API。

严格落实 canonical 交互：

- 底部可收起小工具条：点、区域、两点、两区域、参照、复制、详情、退出。
- 独立角落 HUD，约 240–280 logical units、4–6 行核心信息，并根据目标避让。
- 独立 Inspector / 详情，默认关闭；Esc 在详情、菜单或编辑状态存在时先关闭局部状态，再决定是否退出 Measurement。
- 目标附近只允许必要的 micro 信息、尺寸、边距、十字线或可选放大镜，不出现大型跟随面板。
- 区域支持移动与八方向 resize handles。
- 1/2/3/4 切换模式；Tab / Shift+Tab 在已有候选层级中切换；按住 Alt/Option 暂停吸附；方向键微调，Shift+方向键按 canonical 合同执行；R/I 和三档复制快捷键按正式设计实现。
- Target 与 Reference 必须视觉和数据上同时明确；可靠识别进入前目标窗口时直接锁定，无法可靠识别才要求用户确认；OpenDesk 自己的测量 surface、Recorder 工具条或系统菜单不能静默成为 Reference。
- point color 必须来自冻结源像素；logical / image pixel / display mapping 不混用；支持负坐标、Retina / mixed DPI 和多显示器合同。
- 三档输出保持：简明数值、完整中文说明、结构化数据；每档都保留必要的参照、单位和坐标空间。

## 测试与防回归

先运行并保持 HTML Oracle 自身测试：

```sh
node --test tests/desktop-measurement/model.test.js
python3 tests/desktop-measurement/browser.test.py
```

然后为生产实现建立明确的 Prototype → Native parity matrix。历史 34 个浏览器交互检查不能只作为文档列表，应逐项对应到：

```text
生产单元/合同测试
或
真实原生集成验收
或
受当前环境限制的 NOT_RUN
```

尤其补齐能真正阻止 UI/交互漂移的测试，而不是只断言 HTML 中存在某个 token。至少覆盖工具条位置与层级、Inspector 默认关闭与独立性、Esc 层级、八方向 handles、拖动与 resize、Tab、Alt、快捷键、三档输出、Reference 锁定、重复入口复用同一会话、稳定 surface、退出清理。

运行相关 Go 测试，并在修改范围允许时执行：

```sh
go test ./pkg/measurement/...
go test ./...
```

若仓库已有更准确的 build / lint / app test 命令，以当前正式脚本为准。任何失败都区分“本轮引入”“既有无关失败”“环境阻塞”，不要用编译成功替代交互验收。

当前网页环境无法完成真实 macOS / Windows 输入权限、物理多屏、系统剪切板或 native surface 观察时，把它们明确标记为 `NOT_RUN`，但继续完成所有可以通过源码、自动测试和静态合同闭合的工作，并生成下一阶段最小本地验收命令。

## 完成标准

只有同时满足以下条件才算本轮完成：

1. 生产桌面测量的核心 UI/交互与已确认 HTML Oracle 达到约 95% 以上一致性；允许不复制样机的模拟桌面与 fixture 控制器。
2. 不再存在明显的大窗口式回退、顶部复杂控制条、HUD 内嵌大详情等已知结构漂移。
3. 单一 Measurement Session / surface 生命周期稳定；普通状态更新不会反复制造窗口级副作用。
4. 四种测量模式、Reference、HUD、micro label、详情、拖动、resize、候选切换、暂停吸附、键盘微调、三档输出和退出清理在代码与测试合同上完整。
5. 历史 34 项 Oracle 行为都有生产对应关系；P0 行为没有“完全无测试保护”的空白。
6. 所有本轮可运行测试通过；不能运行的真实系统项目明确 `NOT_RUN`，不虚报 PASS。
7. 不遗留 `tests/desktop-measurement/prototype/` 的当前路径引用；长期样机唯一当前位置是 `apps/opendesk/prototypes/desktop-measurement/`。
8. 不覆盖并行会话的无关修改，不引入第二套 Runtime、Geometry、截图或 Recorder 实现。

## 最终交付

完成代码、测试和必要文档修改后，直接写入 `master`。最终只需给出高密度结果：

- 最终 HEAD / 关键提交；
- 主要修改文件；
- Prototype → Native 已闭合的关键差异；
- 实际执行的测试及 PASS/FAIL/NOT_RUN；
- 当前环境仍无法验证的最小剩余项；
- 本地下一步只保留真正需要真机验证的命令和操作。

不要只给建议、审计报告或下一轮计划；在当前网页会话能继续修复时就继续执行，直到达到上述完成标准或受到明确的外部环境阻塞。
