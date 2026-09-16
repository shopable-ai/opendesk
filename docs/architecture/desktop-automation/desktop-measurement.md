# Desktop Measurement：无侵入式 Measurement Session

> 本文是 OpenDesk Desktop Measurement 的唯一产品 / Framework 设计正文。HTML Prototype 是 UI / Interaction Oracle；生产实现位于 `pkg/measurement`、`pkg/customui`、`cmd/opendesk` 与 Recorder 集成层。历史 P0–P4 实施文档和一次性 prompt 不再作为并行事实源。

## 1. 产品定位

Desktop Measurement 不是截图编辑器，也不是第二套 Locator Runtime。它负责把一次真实桌面状态冻结成可验证、可复用的 Automation Evidence：

```text
真实桌面上下文
→ 获取干净 Frozen Snapshot
→ 坐标 / 颜色 / 区域 / 距离 / 边距测量
→ 保存来源、可靠性、窗口身份、显示器映射和结构化 Evidence
→ Recorder / Human-to-Recipe / Agent-to-Recipe / Qualification / Repair 消费
```

绝对坐标、当前像素和当前窗口几何默认只是 runtime evidence，不自动升级成长期稳定 Locator。

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
+ 磁吸定位
+ 三级坐标
+ Frozen Source Pixel 颜色
+ Window / Local 两组关键边距
        ↓
按需 Inspector / 导出 / 保存 / Authoring handoff
        ↓
退出并幂等清理
```

三入口必须进入同一个 Session；并发启动 single-flight；重复进入不创建第二套 Runtime。

默认全局快捷键单一来源：

```text
internal/measurementshortcut.GlobalShortcutAccelerator
= CommandOrControl+Shift+M
```

菜单显示、Recorder tooltip 和注册逻辑都从该来源投影。

## 3. Session 与 Snapshot 状态

```text
IDLE
↓
PREPARING
↓
FREEZING
↓
MEASURING
```

调整真实界面时：

```text
MEASURING
↓ 调整界面
ADJUSTING
↓ 再次使用任一统一入口继续测量
FREEZING
↓ 新 Snapshot
MEASURING
```

每个可产生异步候选的冻结代际绑定：

```text
sessionId
generation
snapshotId
```

OCR / AX / UIA / Vision / Image 等异步候选返回时必须与当前 token 全匹配；旧 generation / snapshotId 结果直接丢弃。

## 4. Frozen Snapshot 合同

进入 Measurement 时：

```text
保存进入前上下文
→ 确定目标窗口
→ 隐藏 / 排除 Measurement 自身 UI
→ 获取真实显示器与窗口几何
→ 截取源图
→ 再核对几何
→ 固化 Snapshot
→ 显示 Measurement Surface
```

目标应用没有被暂停；Measurement 中的坐标、颜色、区域、边距和候选证据都绑定到同一帧。

`更新画面` 保持 Session，但 generation 增加、重新 capture、生成新 snapshotId，并使旧 Snapshot 派生结果失效。

`调整界面` 必须隐藏冻结画面、Overlay、HUD、Toolbar、Inspector，恢复真实桌面交互；继续测量时重新 FREEZING。旧 Snapshot 可以暂时留在内存用于清理，但不能继续作为当前 Evidence。

## 5. Surface 产品合同

默认 Surface 只保留：

- Frozen Desktop / Display image；
- 窗口外弱蒙版；
- Measurement Overlay；
- 鼠标旁 Cursor HUD；
- 角落 Corner HUD；
- 小型 Toolbar；
- 按需 Inspector。

当前主 Toolbar 合同：

```text
点 / 区域 / 两点 / 两区域
|
磁吸定位 / 边距：窗口或局部参照 / 更新画面 / 调整界面 / 详情 / 退出
```

`选择局部参照`、结构化导出、简明/中文输出、保存格式等低频能力属于 Inspector，不再占用主 Toolbar。

Native / Custom UI host 必须保证无普通标题栏、不成为自身 Target、不进入截图源，并保持 macOS / Windows 产品语义一致。

## 6. Cursor HUD：三级坐标 + 源像素颜色

鼠标旁高频信息：

```text
屏幕   X / Y
窗口   X / Y
区域   X / Y
■ #RRGGBB
```

- 屏幕：virtual desktop screen logical，可为负值；
- 窗口：相对目标窗口；
- 区域：相对当前可靠 Candidate / Target；
- 颜色：Frozen Snapshot 原始 Capture Pixel，不能读取蒙版/HUD/Overlay 混合后的像素。

无可靠区域时显示 `区域 —`，不得伪造 `(0, 0)`。

## 7. Measurement Target 与磁吸定位

正式名称：**磁吸定位**。默认开启；用户可关闭；Alt / Option 只临时暂停。

磁吸移动的是 Measurement Target / Selection Frame，不是系统鼠标。

候选来源复用已有感知能力：

```text
当前窗口上下文
→ Accessibility / UI Tree / UIA
→ OCR / Perception Resolver / Vision / Image
→ Frozen Snapshot 的边缘 / 颜色 / 连通区域候选
→ 人工框选
```

Candidate 必须保存 `source / reliability / semantic-or-visual / bounds / runtime token`。视觉候选不能冒充语义控件。

### 7.1 Tab 语义不能再与 Target Window 混淆

`Tab / Shift+Tab` 只切换**当前 Frozen Snapshot 内**的 UI Candidate 层级，例如：

```text
文本输入框
→ 输入区
→ 聊天区
→ 窗口
```

它不得：

- 把 `CaptureFrame.Targets` 中的其他目标窗口当成 UI Candidate；
- 因按 Tab 切换目标窗口；
- 因按 Tab 触发重新截图或新 snapshotId。

`CaptureFrame.Targets` 是 Inspector 中显式选择“要测量哪个真实窗口”的候选列表，与磁吸 Candidate Stack 是两个不同概念。

当前 Native 若尚未拿到真实 UI Candidate Stack，Tab 必须安全 no-op 并诚实提示；不能伪造 candidate。后续把 AX / UIA / Perception candidate provider 接入后，Tab 才在同一 Snapshot 内循环该真实栈。

## 8. 两级有效参照：Window + Local

普通自动化开发只默认展示两组关键关系：

```text
Target → Window Reference
Target → Local Layout Reference | null
```

Local Reference 必须是可靠且有布局意义的父区域；与 Target 几乎重合的 wrapper、纯技术层、无独立几何意义或可靠性不足的节点都跳过。没有可靠局部参照时保持 `null`，不编造。

## 9. Signed Margins

每组边距：

```text
left / top / right / bottom
```

全部保留符号；越过 Reference 时允许负值，不 clamp 到 0。

Corner HUD 最多显示 Window + 一个 Local Reference。Overlay 一次只重点绘制一组四条边距线：默认 Window，可切换 Local；不能同时铺八条线或增加第三、第四组默认边距。

## 10. Overlay

激活后：窗口外轻度压暗、目标窗口保持亮度、当前 Candidate 清晰边框、已确认 Target 更明确、Local Reference 按需弱边框、当前边距关系四条重点线。

禁止多层父节点蒙版、Target 大面积染色、不透明底板覆盖业务 UI、Overlay 污染源像素取色。

## 11. 测量模式

### 点

保存 screen logical、window-relative、可靠 region-relative、capture pixel、Frozen RGB/HEX、display mapping。

### 区域

保存 absolute bounds、Window / Local relative geometry、percentage geometry、signed margins、必要派生量。

### 两点

保存 A/B、ΔX/ΔY、horizontal/vertical distance、Euclidean distance。

### 两区域

保存 A/B bounds、horizontal/vertical gap、projection overlap、overlap area、center delta、B relative to A。

## 12. Structured Measurement Evidence

生产 Evidence 复用 `pkg/measurement` 的 Geometry / Result，不建平行数据模型。结构至少表达：

```text
sessionId / generation / snapshotId
coordinateSpace
capture/display mapping
target.bounds
windowReference.bounds
localReference.bounds | null
targetToWindow.signedEdges
targetToLocal.signedEdges | null
window/local/percentage geometry
raw frozen pixel color
candidate source + reliability
window identity hints
runtime evidence
semantic / visual evidence
stable relocation hints
```

稳定重定位线索和单次运行证据必须分离。绝对坐标、当前窗口位置、当前 Pixel、CaptureMapping、视觉区域默认只做约束、验证、消歧和维修证据。

## 13. Automation Authoring / Qualification / Repair

正式链路：

```text
Recorder / Human / Agent semantic evidence
+
MeasurementEvidence
↓
AuthoringMeasurementInput
↓
semantic-first 普通 OpenDesk JavaScript
↓
正式 Execution
↓
独立业务验证
```

semantic locator 可用时仍以 semantic-first；Measurement geometry 用于 constrained search / verification。失败维修只请求必要的新 Evidence。

对应实现：

- `pkg/measurement/evidence.go`
- `pkg/measurement/product_contract.go`
- `pkg/measurement/authoring.go`
- `pkg/measurement/qualification.go`
- `pkg/measurement/repair.go`
- `pkg/recorder/measurement_evidence.go`
- `workflows/agent-to-recipe/design/measurement-evidence.md`

P4 Repair Candidate 只有在：

```text
execution PASS
AND
business verification PASS
```

后才允许进入 qualified；不得静默改写黄金 Recipe。

## 14. Recorder 集成与输入隔离

Recorder「测量」调用 App Mode 持有的同一 Measurement Service。录制期间打开 Measurement 时，Recorder 必须先 pause 输入接受门；Measurement 的 mouse / keyboard / Tab / Alt / drag / toolbar input 不进入业务录制；Measurement 退出后保持 paused，用户显式 resume 后才继续录制。

隔离发生在输入接受边界，不能靠事后删 action。

## 15. macOS / Windows Host Contract

两平台共享：

- `WindowSpec.Kind = measurement`；
- Host-owned `MeasurementSurfaceSpec`；
- bounded pointer events；
- Measurement keyboard bridge；
- `Tab / Shift+Tab / Alt / Option / 1–4 / I / Esc` 会话按键语义；
- Surface 生命周期与幂等 cleanup。

`R` 不再是 Measurement session shortcut；人工 Local Reference 从 Inspector 显式进入。系统 `Cmd/Ctrl+C` 及其组合也不再由 Measurement bridge 劫持；结构化/简明/中文导出通过 Inspector 动作完成，底层三档编码能力继续保留。

平台不得开放任意 host-owned Measurement surface 构造能力、建立第二套 desktop input framework，或把 HTML fixture 当成 Native 证据。

## 16. HTML Interaction Oracle

正式交互样机：

```text
apps/opendesk/prototypes/desktop-measurement/
  index.html
  prototype.css
  model.js
  interaction-core.js
```

`template.html` 只作为兼容跳转，不复制第二套交互实现。

HTML 定义产品交互、信息层级、状态转换和几何语义；其中 synthetic UI tree、模拟微信、Canvas、多屏 fixture、browser clipboard 都只是测试替身。

## 17. 自动化验证分层

### Geometry / Model

绝对/相对/百分比、signed margins、负坐标、DPI、多显示器映射、两点/两区域。

### Prototype Browser Oracle

磁吸、三级坐标、源像素、两组边距、Tab Candidate Stack、Alt 暂停、弱蒙版、更新画面、ADJUSTING、token invalidation、Inspector、structured export、exit cleanup、视觉候选不冒充语义。

### Measurement Framework

single owner、session lifecycle、snapshot/generation、Window + Local References、Evidence、Authoring、Qualification、Repair、cleanup。

### Native / Custom UI Contract

macOS / Windows host、keyboard/pointer routing、overlay ownership、surface lifecycle，以及“Target Window 不能冒充 UI Candidate”的 guard。

### Recorder / App Mode

三入口同一 Service、Recorder bridge、capture pause/isolation、shortcut 单一来源、Measurement Evidence handoff。

## 18. 验证真实性边界

报告必须区分：

```text
HTML synthetic PASS
Go unit PASS
JS integration PASS
GitHub Actions contract PASS
build PASS
真实 macOS UI PASS
真实 Windows UI PASS
```

以下没有真实证据时必须保持 NOT_RUN / 未验收：Surface 的 Dock/Taskbar 行为、截图排除自身、焦点恢复、真实 AX/UIA Candidate Stack、Recorder 真输入隔离、物理多显示器/Retina/Windows DPI、系统剪切板、全局快捷键冲突、ADJUSTING 真交互体验。

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
10. ADJUSTING 立即使旧 Snapshot 失去当前身份。
11. 异步结果必须通过 sessionId + generation + snapshotId 校验。
12. Recorder 隔离发生在输入接受边界。
13. 三入口共享同一个 Session。
14. Target Window 列表与 Snapshot UI Candidate Stack 永远是两个概念。
15. 当前没有真实 Candidate Evidence 时不伪造候选、不用 Tab 触发 recapture。


## 20. Frozen core、Native invariant 与 Product Extension（2026-09-16）

权威顺序：明确用户需求/后续纠正 → 可执行 Prototype → FROZEN ORACLE → 本文 Native/Framework 合同及明确扩展 → Production → Tests/Qualification。

| 层 | 合同 | 依据与边界 |
|---|---|---|
| Frozen HTML Oracle | 十个主 Toolbar 控件、四个工具、Magnet、Margin、Update、Adjust/Continue、Inspector、HUD、Esc、Session/Snapshot | `ORACLE.md` 与可执行 HTML/CSS/JS；不能从旧 Production 或测试反推 |
| Native / Framework invariant | 干净 capture、真实窗口身份、单 owner/surface、token 校验、坐标映射、资源释放、Recorder 输入隔离 | 本文既有 capture/session/native 章节；harness 不是实现 |
| EXT-TARGET | Inspector 显式选择/确认真实目标窗口 | 既有目标窗口合同；不得劫持 Tab 或冒充 UI Candidate |
| EXT-LOCAL | Inspector 人工局部参照 | 最多一个 Local；用户显式选择；不增加 Esc 层级 |
| EXT-OUTPUT | 简明/中文/结构化编码、保存格式、保存正式结果、Authoring handoff | 低频能力留在 Inspector；核心 Evidence 不依赖 Result/outputFormat |
| 未批准 | 旧 Region resize/nudge、多级 Esc | 无当前需求依据；不是 Product Extension |

`NOT_SUPPORTED_BY_HTML` 不等于产品禁止；`Production 已实现` 也不等于需求确认。首次默认 Region；同一 Service 内退出后工具保留；新 Session Magnet 重置 ON、Alt 重置 OFF。Region 有效重拖产生新的 Target；Arrow 不修改测量。详情按钮是 open，I 是 toggle；Esc 只有“Inspector 开则关闭，否则退出”。Update 保留工具/Magnet/pointer/Inspector-open，清理旧结果/候选/Local/drag；Adjust 清理 pointer/Inspector/Alt/drag，Continue 重新冻结同一 Session。

Micro HUD 必须由真实 pointer hover 驱动并在边缘翻转，四角 class 只能作为未收到 pointer 前的 fallback。Corner HUD、status、Toolbar、Inspector 是独立信息层。生产 Result 中明确命名的 ratio 字段继续保持 0–1；HTML percentage 修正不得破坏既有 ratio API。
