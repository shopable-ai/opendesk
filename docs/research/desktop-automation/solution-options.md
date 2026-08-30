# DESKTOP_AUTOMATION_SOLUTION_OPTIONS

- 更新时间：2026-04-07
- 适用范围：`testMonkey-go` 的通用桌面自动化技术选型
- 关联背景：`docs/research/2026-04-07-desktop-automation-landscape.md`
- 评分范围：1-5，**分数越高越好**
- 注意：`实现复杂度` 为反向评分，**越易实现分越高**

## 1. 目标

本轮不是评估某个单一应用，而是为仓库选择更可复用的桌面自动化底座。

关键目标：

- 支持通用桌面应用，而不是只支持微信
- 可与现有视觉/OCR/回放/证据链能力对接
- 能为后续 agent / MCP 暴露稳定执行接口
- 能逐步从单机实验演化为可验证、可回归的执行系统

## 2. 评估对象

本轮至少评估五条路线：

- **方案 A**：视觉优先（截图 + OCR + 模板/区域匹配）
- **方案 B**：系统可访问性 / UI tree 优先
- **方案 C**：输入模拟优先（键鼠、快捷键、窗口切换、脚本宏）
- **方案 D**：外部桌面自动化框架集成（pywinauto / AppleScript / xdotool 等按平台接入）
- **方案 E**：Hybrid Agent Runtime（语义自动化 + 视觉兜底 + MCP/agent 接口）

## 3. 评分维度与权重

| 维度 | 说明 | 权重 |
| --- | --- | --- |
| 通用性 | 对任意桌面应用与多系统场景的适配空间 | 0.20 |
| 稳定性 | UI 波动、主题变化、分辨率变化下的抗波动能力 | 0.15 |
| 实现复杂度 | 当前仓库落地最小闭环的难易度（高分=更简单） | 0.10 |
| 可维护性 | 技术债、调试成本、长期演进难度 | 0.15 |
| 可观察性 | 是否便于输出结构化证据、日志、失败原因 | 0.10 |
| Agent 适配度 | 是否适合暴露为 MCP / tool / planning primitive | 0.15 |
| 跨平台潜力 | Windows / macOS / Linux 的演化空间 | 0.15 |

## 4. 方案定义

### 方案 A：视觉优先

定义：

- 基于截图、OCR、颜色特征、模板匹配、区域定位完成感知和动作决策

典型参考：

- OpenCV
- PaddleOCR
- PyAutoGUI
- SikuliX

优点：

- 与当前仓库已有能力最接近
- 不依赖目标应用暴露可访问性树
- 对自绘界面、画布型界面、远程桌面更有普适性

缺点：

- 结构语义弱
- 对布局变化、缩放、字体变化敏感
- 动作执行与元素识别之间缺少强绑定

### 方案 B：系统可访问性 / UI tree 优先

定义：

- 优先通过系统辅助功能树、控件树、窗口树获得语义元素，再执行动作

典型参考：

- Windows UIAutomation
- pywinauto
- macOS Accessibility / AppleScript UI scripting
- Linux dogtail / AT-SPI

优点：

- 语义最强
- 便于形成稳定 element handle、角色、层级、文本结构
- 最适合精细动作与结构化证据输出

缺点：

- 不同应用支持质量差异很大
- 对自绘/游戏/Canvas/部分 Electron 场景不可靠
- 各平台 API 差异明显

### 方案 C：输入模拟优先

定义：

- 直接把键盘、鼠标、快捷键、窗口焦点切换、剪贴板等作为主执行手段

典型参考：

- AutoHotkey
- xdotool
- ydotool
- AutoKey

优点：

- 实现直接
- 对系统级任务、启动应用、切换窗口、基础热键流程很有效

缺点：

- 缺少语义层
- 稳定性依赖焦点、时序和坐标
- 很难单独承担复杂 agent 执行链

### 方案 D：外部桌面自动化框架集成

定义：

- 不自造完整自动化底座，按平台集成成熟工具，再由本仓库统一编排

候选参考：

- Windows：`pywinauto` / `uiautomation` / `Windows-MCP`
- macOS：`AppleScript` / `JXA` / Accessibility
- Linux：`xdotool` / `ydotool` / `dogtail`

优点：

- 现实、工程化、可快速借力
- 能按平台选最合适原生能力
- 便于先做 capability adapter，再逐步统一抽象

缺点：

- 平台差异会暴露到架构层
- 一开始的抽象设计必须克制，否则容易过度平台化

### 方案 E：Hybrid Agent Runtime（推荐）

定义：

- 外部语义自动化能力作为主执行层
- 视觉/OCR 作为观察与兜底层
- 输入模拟作为最终 fallback
- 对上暴露统一 action/observe/evidence/tool 接口

推荐结构：

1. `observe`
   - screenshot
   - OCR
   - optional UI tree
2. `locate`
   - text target
   - role-based target
   - region/layout target
3. `act`
   - semantic click/type/select when possible
   - input simulation fallback
4. `verify`
   - screenshot diff
   - OCR diff
   - structural evidence
5. `expose`
   - HTTP API
   - internal runtime API
   - MCP/tool interface

优点：

- 最贴合本仓库已有“视觉 + 结构化 + evidence + gate”方向
- 同时兼容微信类场景和通用桌面应用
- 适合未来接 agent / MCP / replay / failure taxonomy

缺点：

- 架构复杂度最高
- 需要明确定义平台 capability contract

## 5. 评分矩阵

| 方案 | 通用性 | 稳定性 | 实现复杂度 | 可维护性 | 可观察性 | Agent 适配度 | 跨平台潜力 | 加权总分 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A 视觉优先 | 4 | 3 | 4 | 3 | 4 | 3 | 5 | **3.75 / 5** |
| B UI tree 优先 | 3 | 4 | 2 | 4 | 5 | 4 | 3 | **3.65 / 5** |
| C 输入模拟优先 | 4 | 2 | 5 | 2 | 2 | 3 | 4 | **3.15 / 5** |
| D 外部框架集成 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | **4.00 / 5** |
| E Hybrid Agent Runtime | 5 | 4 | 3 | 5 | 5 | 5 | 5 | **4.65 / 5** |

## 6. 结论

### 最终主线：方案 E

原因：

1. **最符合仓库长期目标**：当前仓库不是单纯做脚本宏，而是在往“可观察、可验证、可回放、可被 agent 使用”的桌面执行系统走。
2. **最能复用现有资产**：现有截图、OCR、布局分析、HTML mirror、gate/evidence 思路，天然适合做 `observe + verify` 层。
3. **能消化外部成熟能力**：无需把所有平台自动化从零自研，可以把 `pywinauto`、macOS Accessibility、Linux 输入与 accessibility 工具接成 adapter。
4. **不会被单一应用绑定**：WeChat、浏览器、客服工具、ERP、原生 App 都只是 adapter 或 profile，不是架构中心。

### 次优落地路线：方案 D

如果希望更快做出第一版可用系统，建议先执行 D，再演进到 E：

- 先引入平台原生/成熟工具
- 再统一 action / observe / verify contract
- 最后暴露 MCP / agent tool 接口

## 7. 推荐架构分层

### L1. Platform Adapter

按平台接入成熟底座：

- Windows adapter
- macOS adapter
- Linux adapter

职责：

- window listing
- app launch/focus
- semantic element query if available
- primitive click/type/shortcut

### L2. Perception Layer

仓库已有能力优先放这里：

- screenshot
- OCR
- layout analysis
- mirror generation

职责：

- 观察当前界面
- 生成结构化中间表示
- 为 agent 提供可解释证据

### L3. Action Planning Layer

职责：

- 将高层动作转成平台动作
- 决定语义动作还是视觉 fallback
- 执行前检查 actionability

### L4. Verification and Evidence Layer

职责：

- 回放验证
- diff gate
- 失败分类
- artifact 持久化

### L5. Agent Exposure Layer

职责：

- HTTP API
- MCP tools
- prompt/runtime orchestration

## 8. 平台建议

### Windows

建议优先级：

1. `pywinauto` / `UIAutomation`
2. `Windows-MCP` 或等价 MCP 封装用于 agent 直连参考
3. 视觉/OCR 作为兜底

原因：

- Windows 的桌面自动化生态最成熟
- 最容易做出“语义动作 + 证据链”的效果

### macOS

建议优先级：

1. AppleScript / JXA / Accessibility
2. 截图 + OCR + 视觉分析
3. 必要时走坐标与键盘兜底

原因：

- 仓库当前已有较多 macOS 相关实验痕迹
- 但 macOS 原生自动化能力分散，权限控制也更严格

### Linux

建议优先级：

1. X11 场景：`xdotool` + accessibility
2. Wayland 场景：`ydotool` + 能力受限说明
3. 视觉/OCR 兜底

原因：

- Linux 差异性最大，应在 contract 中提前承认能力不齐

## 9. 近期实施建议

### Phase 1：Capability Matrix

先定义统一能力接口，而不是急着集成所有工具。

最小接口建议：

- `ListWindows`
- `FocusWindow`
- `CaptureScreen`
- `GetOCR`
- `FindTarget`
- `ClickTarget`
- `TypeText`
- `PressShortcut`
- `VerifyExpectation`
- `EmitEvidence`

### Phase 2：单平台闭环

优先选一个平台做完整闭环。

建议顺序：

1. Windows first，如果目标是通用桌面自动化演示
2. macOS first，如果目标是延续当前仓库已有本机能力沉淀

### Phase 3：App Profile

把 WeChat、浏览器、客服台、文件管理器等定义成 app profile，而不是平台主逻辑。

### Phase 4：MCP Exposure

在基础能力稳定后，再暴露：

- internal runtime API
- HTTP endpoint
- MCP tools

## 10. 不推荐的误区

1. 不要把微信自动化误当作通用桌面自动化架构。
2. 不要把 MCP 误当作底层自动化能力；它只是暴露接口。
3. 不要只做坐标点击链路，否则后续验证和恢复会很弱。
4. 不要只做视觉识别而不做证据链，否则很难稳定迭代。
5. 不要过早追求统一跨平台细节；应该先统一 capability contract。

## 11. 建议的下一份文档

如果继续往下推进，下一份最有价值的文档应该是：

- `docs/architecture/desktop-automation-capability-contract.md`

内容包括：

- capability schema
- platform-specific adapter contract
- observation/action/evidence lifecycle
- fallback policy
- failure taxonomy mapping
