# Desktop Measurement：无侵入式 Measurement Session

> 本文是 OpenDesk Desktop Measurement 的唯一产品 / Framework 设计正文。HTML Prototype 是 UI / Interaction Oracle；生产实现位于 `pkg/measurement`、`pkg/customui`、`cmd/opendesk` 与 Recorder 集成层。历史 P0–P4 实施文档和一次性 prompt 不再作为并行事实源。
>
> **当前受控修订：DM-AMEND-2026-09-17-01。** 用户明确选择 Reference 后才冻结；Hover 与连续记录已经纳入 Frozen core。完整取舍、预算、存储约定及 Production Gap 见 [本次修订附件](desktop-measurement-amendment-2026-09-17.md)。旧 Oracle 原样保留在 `ORACLE.baseline-2026-09-16.md`，不是当前并行合同。新增 Native 选窗、HUD、Session Records 仍有源码缺口，不能称为“仅剩本地资格验证”。

## 1. 产品定位

Desktop Measurement 不是截图编辑器，也不是第二套 Locator Runtime。它负责把一次真实桌面状态冻结成可验证、可复用的 Automation Evidence：

```text
真实桌面上下文
→ Live 选择并确认 Reference Window
→ 获取干净 Frozen Snapshot
→ 坐标 / 颜色 / 区域 / 距离 / 边距测量
→ 显式记录多个已确认结果
→ 保存来源、可靠性、窗口身份、显示器映射和结构化 Session Evidence
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
REFERENCE_SELECTING：Live 窗口 Preview，不创建 Snapshot
        ↓ 用户明确单击确认窗口
锁定身份，排除 Measurement 自身 Surface
        ↓
FREEZING：几何复验与干净 Snapshot
        ↓
MEASURING
        ↓
点 / 区域 / 两点 / 两区域
+ 磁吸定位
+ 三级坐标
+ Frozen Source Pixel 颜色
+ Window / Local 两组关键边距
        ↓
点击锁定 → Enter / 记录 → 继续下一个
        ↓
按需 Inspector / 复制全部 / 保存 / Authoring handoff
        ↓
退出并幂等清理
```

三入口必须进入同一个 Session；并发启动 single-flight；重复进入不创建第二套 Runtime。前台窗口只可以是建议，不是用户已确认的 Reference。

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
REFERENCE_SELECTING
↓ 用户明确确认
FREEZING
↓
MEASURING
```

内部 PREPARING 不得跳过用户确认或提前截图。选择阶段允许 Live 窗口 preview/取消，不能输出正式像素测量证据。重新选择窗口由 Inspector 显式进入同一个选择流程；保留 Session records。

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

OCR / AX / UIA / Vision / Image 等异步候选返回时必须与当前 token 全匹配；旧 generation / snapshotId 结果直接丢弃。请求还必须匹配 pointer context、provider configuration 和 request epoch，避免同一 Snapshot 的旧 pointer 结果覆盖当前候选。

## 4. Frozen Snapshot 合同

只有在用户明确确认 Reference 后才允许：

```text
锁定真实窗口身份
→ 隐藏 / 排除 Measurement 自身 UI
→ 获取真实显示器与窗口几何
→ 截取源图
→ 再核对身份和几何
→ 固化 Snapshot
→ 显示 Measurement Surface
```

目标应用没有被暂停；Measurement 中的坐标、颜色、区域、边距和候选证据都绑定到同一帧。

`更新画面` 保持 Session，但 generation 增加、重新 capture、生成新 snapshotId，并使旧 Snapshot 派生的 current result/candidate 失效。**历史 Records 及其原 Snapshot 不失效、不删除、不改写为新 token。** 窗口关闭、替换或映射变化不能以同名窗口静默替代。

`调整界面` 必须隐藏冻结画面、Overlay、HUD、Toolbar、Inspector，恢复真实桌面交互；继续测量时重新 FREEZING。旧 Snapshot 可以保留用于已记录 Evidence，但不能继续作为当前 Evidence。高级全程 Live Measurement 不在本轮实现范围。

## 5. Surface 产品合同

MEASURING 的默认 Surface 只保留：

- Frozen Desktop / Display image；
- 窗口外弱蒙版；
- Measurement Overlay；
- 鼠标旁 Cursor HUD；
- 角落 Corner HUD；
- 小型 Toolbar；
- 按需 Inspector。

REFERENCE_SELECTING 使用 **Live Spotlight Selection**：当前 Hover Candidate Window 的 Live 原始像素与亮度保持不变，只在其边界描边；Candidate 之外的桌面区域使用中性深色 scrim/dim 压暗，形成类似微信截图选窗或模态背景的聚焦效果。实现应使用 even-odd cutout / 等价四周蒙版，禁止把白色、灰色、半透明填充、blur 或 opacity 覆盖到 Candidate 内部。窗口名称/bounds/确认提示放在外缘或独立 HUD，不能遮挡候选窗口中心内容。该选择蒙版不是 Frozen Snapshot 蒙版；确认前不显示冻结画面或正式颜色 HUD。

当前主 Toolbar 合同：

```text
点 / 区域 / 两点 / 两区域
|
磁吸定位 / 边距：窗口或局部参照 / 更新画面 / 调整界面 / 详情 / 退出
```

`选择局部参照`、重新选择窗口、记录名称、复制全部、结构化导出、简明/中文输出、保存格式等低频能力属于 Inspector，不再占用主 Toolbar。最小“记录/测量记录”操作放 Corner HUD 次级动作，主 Toolbar 不增加第十一项。

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

无可靠区域时显示 `区域 —`，不得伪造 `(0, 0)`。Micro HUD 保持轻量、pointer-events:none、靠边翻转，不能等待重型分割。

## 7. Measurement Target 与磁吸定位

正式名称：**磁吸定位**。默认开启；用户可关闭；Alt / Option 只临时暂停。OFF/Alt 不只是隐藏候选，还必须抑制新 provider 请求并取消/使旧工作失效。

磁吸移动的是 Measurement Target / Selection Frame，不是系统鼠标。

候选来源复用已有感知能力：

```text
当前 Frozen 窗口上下文
→ 有效 Candidate Cache
→ Accessibility / UI Tree / UIA
→ OCR / Perception Resolver / Vision / Image（按已实现能力）
→ Frozen Snapshot 的局部颜色 / 连通区域候选
→ 人工框选
```

Candidate 必须保存 `source / provider / reliability / semantic-or-visual / bounds / runtime token`。视觉候选不能冒充语义控件。轻量算法使用 bounded local ROI、RGB tolerance、connected component、visit/area/time/cancellation 上限，失败返回无可靠候选，不返回整个窗口。

已有 candidate 内且 Snapshot/seed color/包含栈一致时复用；父候选不能跨新子区域无限粘住。小位移/相近失败 seed 可负缓存。重型计算采用有界 latest-pointer throttle，与 Micro 解耦；参数和性能验收见修订附件。禁止每次 pointermove 截图或 Full Window Flood Fill。

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

Target Window 候选属于 Live acquisition / Inspector 显式重选流程，与磁吸 Candidate Stack 是两个不同概念。标签编辑框等 editable controls 保留正常输入/焦点语义。

当前 Native 若尚未拿到真实 UI Candidate Stack，Tab 必须安全 no-op 并诚实提示；不能伪造 candidate。后续把 AX / UIA / Perception candidate provider 接入后，Tab 才在同一 Snapshot 内循环该真实栈。

## 8. 两级有效参照：Window + Local

普通自动化开发只默认展示两组关键关系：

```text
Target → Window Reference
Target → Local Layout Reference | null
```

Local Reference 必须是可靠且有布局意义的父区域；与 Target 几乎重合的 wrapper、纯技术层、无独立几何意义或可靠性不足的节点都跳过。没有可靠局部参照时保持 `null`，不编造。相同规则适用于 provisional hover preview，不因 hover 增加第三组关系。

## 9. Signed Margins

每组边距：

```text
left / top / right / bottom
```

全部保留符号；越过 Reference 时允许负值，不 clamp 到 0。

Corner HUD 在 Hover 即显示 source、layer、width×height、比例和最多 Window + 一个 Local Reference 的边距。Candidate Preview 与 Locked Target 明确区分；Preview 的数值不是最终 Measurement Evidence。

Overlay 一次只重点绘制一组四条边距线：默认 Window，可切换 Local；不能同时铺八条线或增加第三、第四组默认边距。

## 10. Overlay

MEASURING 时：窗口外轻度压暗、目标窗口保持亮度、当前 Candidate 清晰边框、已确认 Target 更明确、Local Reference 按需弱边框、当前边距关系四条重点线。

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

## 12. Structured Measurement Evidence 与 Session Records

生产 Evidence 复用 `pkg/measurement` 的 Geometry / Result，不建平行数据模型。每条结构至少表达：

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

Session envelope 包含 `snapshots[]` 与 `measurements[]`。Hover preview 不入集合；Click 只 confirmed；Enter/记录才追加；显式持久化成功才 saved。追加克隆结果和 Snapshot，不持有 current mutable state。一次记录后清空 current，继续下一次；Update 保留历史；Exit 不删除已保存文件。

Native 优先已有 `.runtime/automation-authoring/<task-id>/measurement/sessions/<session-id>/`，standalone 使用 `.runtime/desktop-measurement/<session-id>/`。禁止写入 `apps/opendesk/**`。P0 使用 versioned JSON，Native 保存时原子替换；JSONL journal/数据库不作为必经路径。Prototype 浏览器保存不等于 Native filesystem 已接通，下载请求不等于 durable saved。

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

Session importer 应逐条映射至既有 canonical Evidence，保留 source/token/reference/hash；不得直接把 Prototype `prototypeOnly:true` 数据交给生产资格验证。当前 Session importer/handoff 仍是生产缺口，已有单条 Evidence loader 不等于自动支持整个 Session。

P4 Repair Candidate 只有在：

```text
execution PASS
AND
business verification PASS
```

后才允许进入 qualified；不得静默改写黄金 Recipe。

## 14. Recorder 集成与输入隔离

Recorder「测量」调用 App Mode 持有的同一 Measurement Service。录制期间打开 Measurement 时，Recorder 必须先 pause 输入接受门；Measurement 的 mouse / keyboard / Tab / Alt / drag / toolbar input 不进入业务录制；Measurement 退出后保持 paused，用户显式 resume 后才继续录制。

隔离发生在输入接受边界，不能靠事后删 action。新增 Live window selection / Record 输入同样受此边界约束。

## 15. macOS / Windows Host Contract

两平台共享：

- `WindowSpec.Kind = measurement`；
- Host-owned `MeasurementSurfaceSpec`；
- bounded pointer events；
- Measurement keyboard bridge；
- `Tab / Shift+Tab / Alt / Option / 1–4 / I / Esc` 会话按键语义；新增 Enter Record 只在非编辑控件且结果完整时生效；
- Surface 生命周期与幂等 cleanup。

`R` 不再是 Measurement session shortcut；人工 Local Reference 从 Inspector 显式进入。系统 `Cmd/Ctrl+C` 及其组合也不再由 Measurement bridge 劫持；结构化/简明/中文导出通过 Inspector 动作完成，底层三档编码能力继续保留。

平台不得开放任意 host-owned Measurement surface 构造能力、建立第二套 desktop input framework，或把 HTML fixture 当成 Native 证据。现有 image-target Surface 协议不足以证明 Live selector 已实现；需要显式 selection/capture 两阶段 owner 和 host 输入/透明/排除合同。

## 16. HTML Interaction Oracle

正式交互样机：

```text
apps/opendesk/prototypes/desktop-measurement/
  index.html
  prototype.css
  model.js
  visual-resolver.js
  records.js
  interaction-core.js
  ORACLE.md
  ORACLE.baseline-2026-09-16.md  # 原样历史，不作为并行当前 Oracle
```

`template.html` 只作为兼容跳转，不复制第二套交互实现。

HTML 定义产品交互、信息层级、状态转换和几何语义；其中 synthetic UI tree、模拟微信、Canvas、多屏 fixture、browser clipboard 都只是测试替身。

## 17. 自动化验证分层

### Geometry / Model

绝对/相对/百分比、signed margins、负坐标、DPI、多显示器映射、两点/两区域；bounded ROI/缓存/budget/fail-closed；confirmed records/token/不可变性/保存状态。

### Prototype Browser Oracle

Live Reference selection、**Candidate 原样 + 外围 spotlight 蒙版**、确认后冻结、磁吸 Hover size/margins、三级坐标、源像素、两组边距、Tab Candidate Stack、Alt/OFF 抑制工作、缓存/节流计数、MEASURING 弱蒙版、更新画面、ADJUSTING、token invalidation、多记录/跨 Snapshot 保留、Inspector、structured export、copy/save失败、exit cleanup、视觉候选不冒充语义。

### Measurement Framework

single owner、session lifecycle、snapshot/generation、Window + Local References、Evidence、Authoring、Qualification、Repair、cleanup。新增生产缺口需单独测试，不以 Prototype PASS 代替。

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

新增源码缺口必须标记 OPEN_IMPLEMENTATION，不得改名为 Native-only QA。当前真实状态见修订附件及 `tests/desktop-measurement/amendment-manifest.json`。

## 19. 不变量

1. 一套 `pkg/measurement` Geometry。
2. 一个 Measurement Service / owner。
3. 一个 CaptureMapping 合同。
4. 一个 Result / Evidence 主数据链；Session 只聚合经过验证的记录。
5. HTML 是 Oracle，不是 Runtime。
6. 视觉证据不冒充语义证据。
7. 绝对坐标不自动升级为长期 Locator。
8. Window + Local 默认最多两组关键边距。
9. Overlay 一次只突出一组边距关系。
10. ADJUSTING 立即使旧 Snapshot 失去当前身份，历史 Record 的来源不改写。
11. 异步结果必须通过 sessionId + generation + snapshotId 以及请求上下文校验。
12. Recorder 隔离发生在输入接受边界。
13. 三入口共享同一个 Session。
14. Target Window 列表与 Snapshot UI Candidate Stack 永远是两个概念。
15. 当前没有真实 Candidate Evidence 时不伪造候选、不用 Tab 触发 recapture。
16. 用户明确确认 Reference 前不冻结；preview、confirmed、recorded/saved 不混同。

## 20. Frozen core、Native invariant 与 Product Extension

2026-09-17 受控修订了 2026-09-16 的边界：EXT-TARGET 中的显式 Reference 选择不再只是 Native extension，而是 Frozen core 的必经行为；多记录和显式 Session JSON export 也进入 Frozen core。旧历史依据保留在版本历史和 archived Oracle，不允许以“旧版没有此行为”否定本次明确用户要求。

权威顺序：明确用户需求/后续纠正 → 可执行 Prototype → FROZEN ORACLE → 本文 Native/Framework 合同及明确扩展 → Production → Tests/Qualification。

| 层 | 合同 | 依据与边界 |
|---|---|---|
| Frozen HTML Oracle | Live Reference selection、十个主 Toolbar 控件、四工具、Magnet、Margin、Update、Adjust/Continue、Inspector、两层 HUD、Esc、Session/Snapshot、多记录与显式 Session 导出 | 当前 `ORACLE.md` 和可执行 HTML/CSS/JS；未修改条款继承 archived baseline |
| Native / Framework invariant | 干净 capture、真实窗口身份、单 owner/surface、token 校验、坐标映射、资源释放、Recorder 输入隔离 | 本文既有 capture/session/native 章节；harness 不是实现 |
| EXT-LOCAL | Inspector 人工局部参照 | 最多一个 Local；用户显式选择；不增加 Esc 层级 |
| EXT-OUTPUT | 简明/中文/结构化编码、其他保存格式、保存正式结果、Authoring handoff | 低频能力留在 Inspector；核心 Evidence 不依赖 Result/outputFormat |
| 未批准 | 旧 Region resize/nudge、多级 Esc、全程 Live 像素测量、跨 Snapshot 自动 relocation | 不是本修订许可的扩展 |

`NOT_SUPPORTED_BY_HTML` 不等于产品禁止；`Production 已实现` 也不等于需求确认。首次默认 Region；同一 Service 内退出后工具保留；新 Session Magnet 重置 ON、Alt 重置 OFF。Region 有效重拖产生新的 Target；Arrow 不修改测量。详情按钮是 open，I 是 toggle；Esc 只有“Inspector 开则关闭，否则退出”，选择阶段 Esc 直接退出。Update 保留工具/Magnet/pointer/Inspector-open，清理旧 current 结果/候选/Local/drag，保留历史 Records；Adjust 清理 pointer/Inspector/Alt/drag，Continue 重新冻结同一 Session。

Micro HUD 必须由真实 pointer hover 驱动并在边缘翻转，四角 class 只能作为未收到 pointer 前的 fallback。Corner HUD、status、Toolbar、Inspector 是独立信息层。生产 Result 中明确命名的 ratio 字段继续保持 0–1；HTML percentage 修正不得破坏既有 ratio API。
