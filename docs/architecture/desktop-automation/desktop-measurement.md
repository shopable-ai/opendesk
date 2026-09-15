# Desktop Measurement：无侵入式 Measurement Session

> 本文是 OpenDesk Desktop Measurement 的唯一产品 / Framework 设计正文。HTML Prototype 是 Interaction Oracle；生产实现位于 `pkg/measurement`、`pkg/customui`、`cmd/opendesk` 与 Recorder 集成层。不要再创建第二份 Measurement 总设计。

## 1. 产品定位

Desktop Measurement 不是截图编辑器，也不是第二套 Locator Runtime。

它的职责是：

```text
真实桌面上下文
→ 获取干净冻结 Snapshot
→ 在同一帧上完成坐标 / 颜色 / 区域 / 距离 / 边距测量
→ 保存来源、可靠性、窗口身份、显示器映射和结构化 Evidence
→ 供 Automation Authoring / Recipe / Recorder / Qualification / Locator Repair 消费
```

Measurement Evidence 是**定位、校准、代码生成和维修证据**。绝对坐标、一次运行的像素和窗口几何默认属于 runtime evidence，不自动升级成长期稳定 Locator。

## 2. 唯一用户链路

```text
开发者 → 桌面测量…
或 Recorder → 测量
或 CommandOrControl+Shift+M
        ↓
同一个 Measurement owner / Service
        ↓
保存进入前真实上下文
        ↓
排除 Measurement 自身 Surface
        ↓
确认真实目标窗口和显示器
        ↓
FREEZING：获取干净 Snapshot
        ↓
MEASURING
        ↓
点 / 区域 / 两点 / 两区域
+ 磁吸候选
+ 三级坐标
+ 冻结源像素颜色
+ Window / Local 两组关键边距
        ↓
按需 Inspector / 复制 / 保存 / Authoring handoff
        ↓
退出并幂等清理
```

三入口不能创建三个实现，也不能创建三个 Measurement Runtime。重复进入必须复用当前唯一 Session；启动中的并发进入需要 single-flight。

当前默认全局快捷键的单一来源为：

```text
internal/measurementshortcut.GlobalShortcutAccelerator
= CommandOrControl+Shift+M
```

菜单显示、Recorder tooltip 和注册逻辑必须从同一来源投影，不允许再次硬编码旧快捷键。

## 3. Session 状态机

产品层状态：

```text
IDLE
  ↓
PREPARING
  ↓
FREEZING
  ↓
MEASURING
  ↓
REVIEW（按需）
```

必须额外支持：

```text
MEASURING
  ↓ 调整界面
ADJUSTING
  ↓ 继续测量
FREEZING
  ↓ 新 Snapshot
MEASURING
```

每个可产生异步候选的冻结代际必须绑定：

```text
sessionId
generation
snapshotId
```

任何 OCR / AX / UIA / Vision / 图像 / 颜色候选返回时，都必须与当前 token 全匹配；旧 generation 或旧 snapshotId 的结果直接丢弃，不能重新污染当前 Snapshot。

## 4. 默认冻结 Snapshot

Measurement 默认不是持续全屏截图。

进入时：

```text
保存进入前上下文
→ 确定目标窗口
→ 隐藏 / 排除 Measurement 自身 UI
→ 获取真实显示器与窗口几何
→ 截取源图
→ 再次核对几何
→ 固化 Snapshot
→ 再显示 Measurement Surface
```

目标应用没有被暂停；只是在 Measurement 中，所有坐标、颜色、区域、尺寸、边距和候选证据都绑定到进入时的同一帧。

### 4.1 收起信息 ≠ 取消冻结

正常测量：

```text
冻结 Snapshot：显示
Overlay：显示
Cursor HUD：显示
Corner HUD：显示
Toolbar：显示
```

用户收起 HUD / Inspector，只是减少遮挡：

```text
冻结 Snapshot：仍显示
Overlay：仍工作
```

不能把“隐藏 HUD”实现成“恢复实时桌面”。

### 4.2 更新画面

`更新画面` 保持同一 Session，但必须：

```text
旧异步结果失效
→ generation 增加
→ 隐藏 Measurement Surface
→ 重新捕获
→ 新 snapshotId
→ 清除旧 Snapshot 派生 Target / Candidate
→ MEASURING
```

### 4.3 调整界面

点击 `调整界面` 后进入 `ADJUSTING`：

```text
旧 Snapshot 立即失去“当前画面”身份
隐藏冻结画面
隐藏弱蒙版
隐藏 Overlay
隐藏 Cursor HUD
隐藏 Corner HUD
隐藏 Toolbar
隐藏 Inspector
恢复真实桌面输入
```

此时用户可以滚动、切换 Tab、展开菜单、输入、改变应用状态。

旧 Snapshot 可以暂时保留在内存用于安全清理，但其 `snapshotId` 不得继续作为当前 Evidence 输出。

`继续测量` 必须：

```text
重新确认窗口
→ FREEZING
→ 新 generation
→ 新 snapshotId
→ 新 CaptureMapping
→ 旧候选全部失效
→ MEASURING
```

## 5. Surface 产品合同

默认界面不是普通大型应用窗口，只包含：

- 冻结桌面 / 显示器图像；
- 窗口外弱蒙版；
- Measurement Overlay；
- 鼠标旁极小 Cursor HUD；
- 角落 Corner HUD；
- 小型 Toolbar；
- 按需 Inspector。

Native / Custom UI host 必须保证：

- 无普通标题栏；
- 不作为普通 Dock / Taskbar 工具窗口出现；
- Always-on-top 但不成为自己的 Measurement Target；
- Measurement 自身 UI 不进入截图源；
- 默认不错误抢占进入前目标窗口上下文；
- macOS / Windows 允许平台实现不同，但产品合同一致。

## 6. 鼠标旁 Cursor HUD：三级坐标 + 源像素颜色

鼠标旁只显示高频即时信息：

```text
屏幕   X / Y
窗口   X / Y
区域   X / Y
■ #RRGGBB
```

语义分别为：

1. **屏幕坐标**：虚拟桌面的 screen logical 坐标，可为负值。
2. **窗口坐标**：相对整个目标窗口的 logical 坐标。
3. **区域坐标**：相对当前可靠候选 / Target 区域的 logical 坐标。
4. **颜色**：当前冻结 Snapshot 的原始源像素，不读取蒙版、边框、HUD 或 Overlay 混合后的屏幕像素。

没有可靠区域时必须显示：

```text
区域 —
```

禁止伪造 `(0, 0)`。

Cursor HUD 必须避开当前像素；靠近屏幕边缘自动翻转 / 裁限；进入 Measurement 自己的工具 UI 时不能把工具 UI 当成业务目标。

## 7. Measurement Target 与磁吸定位

正式名称：**磁吸定位**。

默认开启，用户可以关闭；按住 Alt / Option 只做临时暂停。

磁吸移动的是：

```text
Measurement Target / Selection Frame
```

不是系统真实鼠标。

候选来源按已存在能力组合，不新建第二套 Locator Framework：

```text
当前窗口上下文
→ Accessibility / UI Tree / UIA 等语义证据
→ OCR / Perception Resolver / 现有视觉与图像能力
→ 冻结 Snapshot 的边缘 / 颜色 / 连通区域候选
→ 人工框选
```

候选必须显式保留：

```text
source
reliability
semantic / visual
bounds
runtime token
```

视觉或颜色候选只能称为“视觉区域 / 颜色区域 / 边缘区域”，不能因为长得像输入框就声称 `textField`。

Tab / Shift+Tab 只是候选切换机制：

```text
文本输入框
→ 输入区
→ 聊天区
→ 窗口
```

屏幕一次只展示当前候选，不把所有 ancestry 同时铺满。

## 8. 两级有效参照：Window + Local

普通自动化开发最有价值的关系只有两组：

```text
Target → 整个目标窗口
Target → 当前有意义的局部布局参照
```

生产结构使用：

```text
Window Reference
Local Layout Reference | null
Target
```

Local Reference 自动选择最近一个真正具有布局价值的可靠父区域，并跳过：

- 与 Target 几乎重合的 wrapper；
- 纯技术包装层；
- 没有独立几何意义的节点；
- 可靠性不足的候选。

没有可靠局部参照时：

```text
localReference = null
```

不能编造。

完整 ancestry / candidates 可以保留在 Evidence 中，但默认 HUD 不展示第三组、第四组边距。

## 9. 有符号边距

一组边距：

```text
left
top
right
bottom
```

全部采用有符号距离。Target 越过 Reference 时保留负值，例如：

```text
right = -12
```

禁止 clamp 到 0。

Corner HUD 最多显示：

```text
Target                     692 × 70

边距参照          左    上    右    下
整个窗口          ...   ...   ...   ...
输入区            ...   ...   ...   ...
```

Overlay **一次只重点绘制其中一组四条边距线**：

```text
默认：Target → Window
切换：Target → Local Reference
```

切换第二组不新增第三组，也不同时绘制八条线。

## 10. 弱蒙版与 Overlay

激活 Measurement 后：

```text
窗口外：轻度压暗
目标窗口内：保持原始亮度
当前候选：清晰候选边框
已确认 Target：更明确实线
Local Reference：需要时弱边框
当前边距关系：四条重点线
```

禁止：

- 每层父节点叠一层蒙版；
- 将 Target 大面积染色；
- 不透明底板覆盖业务 UI；
- 让蒙版参与取色。

蒙版表达“正在测量哪个窗口”，不是视觉特效层。

## 11. 测量模式

### 11.1 点

保存：

- screen logical 坐标；
- window-relative 坐标；
- 当前可靠 region-relative 坐标；
- capture pixel；
- frozen source RGB / HEX；
- display mapping。

### 11.2 区域

保存：

- absolute bounds；
- Window / Local relative geometry；
- percentage geometry；
- signed margins；
- center / ratio / coverage 等必要派生量。

### 11.3 两点

保存：

- A / B；
- ΔX / ΔY；
- horizontal / vertical distance；
- Euclidean distance。

### 11.4 两区域

保存：

- A / B bounds；
- horizontal / vertical gap；
- projection overlap；
- overlap area；
- center delta；
- B relative to A。

## 12. Structured Measurement Evidence

生产 Evidence 继续复用 `pkg/measurement` 的 Geometry / Result，不创建第二套结构。

结构化数据必须能表达：

```text
snapshot token:
  sessionId
  generation
  snapshotId

coordinateSpace
capture/display mapping

target.bounds
windowReference.bounds
localReference.bounds | null

targetToWindow.signedEdges
targetToLocal.signedEdges | null

window-relative geometry
local-relative geometry
percentage geometry

raw frozen pixel color
candidate source
candidate reliability
window identity hints
runtime evidence
semantic / visual evidence
stable relocation hints
```

必须区分：

### 稳定重定位线索

例如：

- 窗口身份提示；
- 可靠 semantic candidate；
- role / identifier / name；
- 已 qualification 的 Reference 关系。

### 本次运行时证据

例如：

- 绝对坐标；
- 当前窗口位置；
- 当前 Snapshot pixel；
- 当前 CaptureMapping；
- 当前视觉区域。

Runtime Evidence 默认用于约束、验证、消歧和维修，不自动变成唯一长期 Locator。

## 13. Automation Authoring / Recipe / Repair

正式链路：

```text
Recorder / Human / Agent 已有 semantic evidence
+
按需 MeasurementEvidence
        ↓
AuthoringMeasurementInput
        ↓
semantic-first 普通 OpenDesk JavaScript
        ↓
正式 Execution
        ↓
独立业务验证
```

推荐：

```text
semantic locator 可用
→ 仍以 semantic locator 为主
→ Measurement geometry 用于 constrained search / verification

semantic ambiguous
→ Window + Local + percentage geometry 用于消歧

visual drift
→ frozen pixel / region 用于 qualification

locator failure
→ Measurement-assisted Repair 只请求必要的新 evidence
```

禁止因为测量过就把 Recipe 退化为唯一绝对坐标点击。

对应实现：

- `pkg/measurement/evidence.go`
- `pkg/measurement/product_contract.go`
- `pkg/measurement/authoring.go`
- `pkg/measurement/qualification.go`
- `pkg/measurement/repair.go`
- `pkg/recorder/measurement_evidence.go`
- `workflows/agent-to-recipe/design/measurement-evidence.md`

## 14. Recorder 集成与输入隔离

Recorder「测量」调用 App Mode 持有的同一个 Measurement Service。

录制期间打开 Measurement 时：

1. Recorder 先审计并排除工具按钮自身点击；
2. 若 native capture 正在 recording，则先通过 Recorder 正式 `pause()` 关闭输入接受门；
3. Measurement 自身 mouse / keyboard / Tab / Alt / drag / toolbar input 不进入业务录制；
4. Measurement 退出后 Recorder 保持 paused，不能未经用户操作自动恢复业务录制；
5. 用户在 Recorder 中显式 resume 后才重新打开录制接受门。

正确隔离必须发生在输入接受边界，不能采用“录完以后删除几条 action”冒充隔离。

## 15. macOS / Windows Host Contract

两平台共享：

- `WindowSpec.Kind = measurement`；
- Host-owned `MeasurementSurfaceSpec`；
- bounded pointer events；
- Measurement keyboard bridge；
- Tab / Alt / 1–4 / R / I 等会话按键语义；
- Surface 生命周期与幂等 cleanup。

平台实现可以不同，但不得：

- 在公共 JS 中开放任意 host-owned Measurement surface 构造能力；
- 产生第二套 desktop input framework；
- 把 HTML fixture 当成真实 Native 证据。

## 16. HTML Interaction Oracle

正式交互样机：

```text
apps/opendesk/prototypes/desktop-measurement/
```

唯一维护关系：

```text
index.html
  ├─ prototype.css
  ├─ model.js
  └─ interaction-core.js
```

`template.html` 只作为兼容入口跳转到 `index.html`，不再复制第二套实现。

从仓库根目录直接：

```bash
open apps/opendesk/prototypes/desktop-measurement/index.html
```

不要求 npm、HTTP Server 或 OpenDesk Runtime。

HTML 定义：

- 产品交互；
- 信息层级；
- 状态转换；
- 几何语义。

HTML 中的 synthetic UI tree、模拟微信、Canvas、多屏 fixture、浏览器 clipboard 都是测试替身，不能复制成生产证据源。

## 17. 自动化验证分层

### A. Geometry / Model

覆盖：

- 绝对 / 相对 / 百分比坐标；
- signed margins；
- 负坐标；
- Retina / DPI；
- 多显示器映射；
- 区域包含 / 越界；
- 两点 / 两区域。

### B. Prototype Browser Oracle

覆盖：

- 模块化单一 Oracle；
- 磁吸默认开启；
- 三级坐标；
- 源像素颜色；
- 两组边距且最多两组；
- 一次只突出四条边距线；
- Tab / Shift+Tab；
- Alt 暂停；
- 弱蒙版；
- `更新画面`；
- `ADJUSTING`；
- `继续测量` 新 Snapshot；
- 旧 token candidate invalidation；
- Inspector 按需；
- structured export；
- exit cleanup；
- 视觉候选不冒充语义。

### C. Measurement Framework

覆盖：

- Service single owner；
- session lifecycle；
- snapshot / generation；
- Window + Local References；
- two margin relations；
- structured evidence；
- authoring / qualification / repair；
- cleanup。

### D. Native / Custom UI Contract

覆盖：

- macOS host contract；
- Windows host contract；
- Measurement keyboard / pointer routing；
- overlay ownership；
- Surface lifecycle。

### E. Recorder / App Mode

覆盖：

- 三入口 → 同一 Service；
- Recorder Measurement bridge；
- capture pause / isolation；
- shortcut 单一来源；
- Measurement Evidence handoff。

## 18. 验证真实性边界

报告必须明确区分：

```text
HTML synthetic PASS
Go unit PASS
JS integration PASS
GitHub Actions platform contract PASS
build PASS
真实 macOS UI PASS
真实 Windows UI PASS
```

GitHub Actions 在 macOS / Windows runner 上通过 Go host contract，只能证明**跨平台代码 / contract test**，不能写成“真实原生体验通过”。

以下仍必须本地真机验收：

- Surface 是否真正不进入 Dock / Taskbar；
- 截图是否完全排除 Measurement 自身；
- 焦点与目标窗口恢复；
- 真正 Accessibility / UIA 候选；
- Recorder 真实鼠标键盘隔离；
- 多显示器 / Retina / Windows DPI；
- 系统剪切板；
- 全局快捷键实际注册与冲突；
- 调整界面期间目标应用真实交互体验。

没有这些证据时必须写“未进行真机验收”。

## 19. 不变量

1. 一套 `pkg/measurement` Geometry。
2. 一个 Measurement Service / owner。
3. 一个 CaptureMapping 合同。
4. 一个 Result / Evidence 主数据链。
5. HTML 是 Oracle，不是 Runtime。
6. 视觉证据不冒充语义证据。
7. 绝对坐标不自动升级为长期 Locator。
8. Window + Local 默认最多两组关键边距。
9. Overlay 一次只突出一组边距关系。
10. ADJUSTING 必须让旧 Snapshot 立即失去当前身份。
11. 旧异步结果必须通过 sessionId + generation + snapshotId 校验。
12. Recorder 隔离发生在输入接受边界，不靠事后删 action。
13. 三入口共享同一个 Session，不创建第二套实现。
