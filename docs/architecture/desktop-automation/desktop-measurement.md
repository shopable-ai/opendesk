# 桌面测量：无侵入式 Measurement Session

> 产品与交互设计基线，2026-09-14。本文是本职责唯一正文，不是已经发布的 Runtime API Reference。
> 当前结论：快捷键／Recorder 测量按钮／开发者菜单 → 同一个测量会话；透明标注层 + 屏幕角落精简信息 + 按需详情；复制固定三档。
> 验证状态：浏览器合成样机的 16 项几何测试、34 项交互检查，以及 Native Measurement 的包级／Custom UI 合同测试均须保持通过。2026-09-15 已在 macOS 本机实测真实 OpenDesk Surface、冻结截图、底部工具条、HUD／Inspector、原生键盘 relay 和退出／重入；Windows、物理混合 DPI 与真实 Recorder 隔离仍分别标记为 NOT_RUN。

## 1. 用户实际看到的方案

不打开大型测量工具窗口。用户仍能看清目标软件；测量模式展示冻结画面，目标程序本身不被暂停，也不承诺继续实时显示其变化。

```text
快捷键／Recorder「测量」／开发者「桌面测量…」
→ 可靠确定进入前的真实目标窗口
→ 冻结画面并锁定参照；不确定时才请用户点选窗口
→ 移动鼠标取点取色，或框选、测距、调整
→ 角落查看核心数值，画面就地查看选区和距离
→ 复制三档之一／按需打开详情和保存
→ 退出测量，清理临时交互并恢复原上下文
```

产品界面只保留：目标边框、参照边框、必要标尺／距离线、尺寸标签、角落信息、小型工具条。鼠标附近仅保留十字线、可选像素放大镜和极短操作提示，不再携带完整数值面板。

无侵入是视觉和上下文约束，不是鼠标穿透：测量点击、拖动、快捷键必须由测量会话消费，不能落到目标程序形成真实业务操作。

## 2. 产品功能树

```text
桌面测量
├─ 进入与唯一会话
│  ├─ 开发者菜单／Recorder 工具栏／全局快捷键
│  ├─ 重复触发复用当前会话；启动中合并请求
│  └─ 保存进入前的真实应用、窗口、Recorder 状态
├─ 确定测量上下文
│  ├─ 获取真实窗口；排除测量自身和入口工具 UI
│  ├─ 明确参照：默认整个窗口；可主动改为内容区或自定义区域
│  ├─ 明确锁定；鼠标移动不改变参照
│  └─ 冻结窗口、显示器、几何、源图及逐显示器映射
├─ 选择测量对象
│  ├─ 悬停显示候选及来源，不将候选冒充已确认目标
│  ├─ 像素／边缘／视觉矩形／可靠语义元素／父区域／窗口
│  ├─ 切换候选层级，临时关闭吸附
│  └─ 不可靠时退回人工框选，不静默猜测
├─ 完成测量
│  ├─ 点：绝对／相对／百分比坐标，源像素颜色
│  ├─ 区域：绝对／相对几何，宽高比例、宽高比、覆盖率
│  ├─ 两点：有向 ΔX／ΔY，水平／垂直／直线距离
│  ├─ 两区域：间距、投影重叠、实际重叠、中心与对齐偏差
│  └─ 目标相对参照：左／上／右／下有符号边距与中心偏移
├─ 查看与调整
│  ├─ 透明标注层同时表达目标与参照
│  ├─ 角落信息按测量模式显示，自动避让与折叠
│  ├─ 拖动、八方向尺寸手柄、方向键微调、重新吸附
│  └─ 详情默认关闭；主动打开后查看完整数据
├─ 带走数据
│  ├─ 第一档：简明数值
│  ├─ 第二档：完整中文说明
│  ├─ 第三档：结构化数据与必要程序上下文
│  └─ 复制或保存；所有档位保留参照、单位、坐标空间
└─ 退出与恢复
   ├─ 释放 Overlay／HUD／详情／临时输入资源／快照
   ├─ 校验后恢复原真实应用与窗口
   ├─ 恢复对应 Recorder 会话的原状态
   └─ 异常、取消、权限丢失同样走幂等清理
```

## 3. 屏幕信息分层

| 层次 | 默认状态 | 内容 | 禁止事项 |
| --- | --- | --- | --- |
| 测量标注层 Overlay | 开启 | 参照虚线、目标实线、候选点线、尺寸手柄、必要距离标签 | 普通标题栏、大片不透明底板、成为自己的 Target |
| 角落信息 HUD | 开启 | 参照简名与锁定状态、当前模式的核心数值 | 默认显示 PID、句柄、完整 JSON 或所有高级指标 |
| 鼠标微提示 | 需要时 | 十字线、色块、短提示；取色时可打开像素放大镜 | 大型跟随面板遮挡当前目标 |
| 小型工具条 | 开启，可收起 | 点／区域／两点／两区域，参照，复制，详情，退出 | 扩展成布局设计器或应用工具箱 |
| 详情 Inspector | 默认关闭 | 全量几何、坐标映射、元数据、导出与高级调整 | 进入会话时自动显示；关闭详情即结束测量 |

角落信息优先右上角，也允许用户固定左上角。建议宽度约 240–280 逻辑单位，按模式使用约 4–6 行；这是初始设计预算，不是跨字体硬编码尺寸。

| 模式 | 默认核心信息 | 收入详情的信息 |
| --- | --- | --- |
| 点 | 绝对 X/Y；相对 X/Y；相对百分比；HEX；RGB，必要时 alpha | 显示器标识、图像像素位置、色彩空间、完整映射 |
| 区域 | 宽×高；绝对与相对 X/Y；占参照宽／高百分比；四边距 | 百分比 X/Y、宽高比、面积比、覆盖率、中心／对齐偏差 |
| 两点 | 直线距离；ΔX/ΔY；水平／垂直距离 | 两端点完整坐标、颜色与来源 |
| 两区域 | 水平／垂直间距；实际重叠面积；中心偏移；B 相对于 A | 投影重叠、四边有符号距离、完整对齐偏差 |

普通界面只显示“参照：客服窗口·整窗·已锁定”这样的名称，不展示程序窗口 ID。颜色之外用线型和文字区分目标、参照、候选，不能只依赖颜色。

避让顺序：当前目标与鼠标优先，其次选区手柄，再次角落信息和工具条，最后辅助标签。标签的排版必须将 HUD／工具条作为障碍物，不能只在标签之间避让。角落位置有滞回，原位置仍安全时不随每次鼠标移动跳动。目标很大导致四角均冲突时，收起为一行状态，暂隐次要标注；不得声称任意场景都能完全零遮挡。

工具条初始停在底部居中，采用与 Prototype 一致的小体积布局；其最左侧的握把只移动工具条本身，不移动全屏 Measurement surface 或冻结快照。用户可在本次会话内把它拖到任意不贴边的位置；拖动受窗口可见边界约束，复制菜单随上下空间翻转。位置不跨会话保存，避免把某一显示器的布局错误带到另一台设备。

多屏时 HUD 跟随当前交互显示器的安全区域，不按整个虚拟桌面的单一角落放置。鼠标提示到边缘翻转并裁限。详情打开时另行选择尽量不覆盖目标的位置；显式文本编辑可以暂时接收焦点，但关闭后必须恢复测量输入路由。

## 4. 入口与快捷键

三入口调用同一个测量会话 owner 的幂等进入动作，不创建三个窗口实例，也不另启 Runtime。已有会话只显示一次轻提示，保留原参照、快照和结果；再次按全局快捷键不是隐式退出或重新冻结。

建议初始绑定：macOS `Command+Option+Shift+M`；Windows `Control+Alt+Shift+M`。这是可配置候选，不是“保证无冲突”的结论。避开 macOS 截图的 Command+Shift+3/4/5，以及 Windows 截图的 Win+Shift+S；发布前还须扫描当前本地 OpenDesk 注册点，并做本机实际注册与触发检查。

当前 `globalShortcut.isRegistered()` 只查询当前 Runtime 的本地 registry，不能证明系统全局没有其他应用占用。不能用它伪造全局冲突扫描。注册或触发失败时说明原因并允许改键，两个可点击入口继续可用。

会话内快捷键，不长期注册为系统级单键：

| 操作 | 建议按键 |
| --- | --- |
| 点／区域／两点／两区域 | 1／2／3／4 |
| 切换到更大候选／较小候选 | Tab／Shift+Tab，仅画布测量状态 |
| 临时自由选择 | 按住 Alt／Option；另提供可点击吸附开关 |
| 微调 | 方向键；Shift+方向键为 10 步 |
| 更换参照／打开详情 | R／I |
| 简明复制／完整说明／结构化复制 | CommandOrControl+C／+Shift+C／+Alt+C |
| 退出 | Esc，或明确的退出按钮 |

详情、下拉菜单、文本编辑获得焦点时，Tab 和普通编辑键恢复其正常意义，不被候选切换逻辑吞掉。点的精确微调按所属源图 1 像素映射回逻辑空间；区域默认按 1 逻辑单位微调，不混称两者。

## 5. 目标、参照与吸附

Target 是正在测量的点、区域，或两组已确认的对象。Reference 是这些数据共同依赖的明确坐标参照。默认选择进入前可靠识别的真实目标窗口，并在显示 HUD 时明确标为“整窗·已锁定”。系统菜单、Recorder 工具栏或 Measurement 自己的 surface 不能取代真实窗口。

记录窗口上下文必须早于测量 UI 抢占识别条件；菜单路径需要可信的进入前外部窗口上下文。无法确认时进入“选择参照”，不静默使用 OpenDesk 窗口。默认整个窗口的边界是否含标题栏、阴影须按当前 Window/Screen 实际合同固定并记录；不能将 client area 与整个窗口混用。自定义参照必须主动确认，保存新 reference revision，重新计算派生量。

磁性选择不是要求所有平台都自动识别所有层级：

- 点默认逐像素，不悄悄吸到按钮中心；边缘吸附由明确操作启用。
- 对已获取的候选做包含关系组织：较小区域 → 父区域 → 窗口。像素、边缘、视觉矩形和语义元素是来源，不假装它们永远构成严格包含链。
- 视觉候选只叫“视觉矩形候选”；AX/UIA 数据也必须核对当前窗口、范围与快照一致性。结构或时间不一致时不宣称语义可靠。
- 点线框表示候选，短标签交代“视觉边缘／语义控件／窗口”等来源；确认后才变为目标实线。参照虚线始终保留。
- Tab 只在已经获得的候选间切换；不可靠、歧义或权限不足时立即允许人工框选。按住 Alt 暂停吸附；调整后重新吸附也必须可见并可撤销。

P0 必须有可靠窗口参照、人工框选、候选展示／确认／切换／退出路径。语义候选仅在现有能力确实可靠时出现；不得为视觉效果编造控件。

## 6. 快照与原始像素

冻结顺序：取得会话与输入隔离 → 保存上下文 → 获取真实窗口与显示器几何 → 隐藏／排除测量和入口工具 surface → 等待合成画面更新 → 采集源图 → 再次核对几何 → 固化快照 → 展示冻结画面及测量 Overlay。

快照至少包含：snapshotId、capture timestamp、窗口 identity/bounds/bounds kind、逐显示器 identity/logical bounds/pixel dimensions、逐显示器 logical↔pixel transform、源图及内容校验信息、色彩空间／通道／alpha 语义、Reference geometry/revision。多个显示器可能不是同一瞬间采集，需记录每块时间与 capture skew；超出项目明确容差时重试或报告，不能伪称跨屏原子截图。

沿用当前 Window/Screen 的归一化坐标与 Geometry、ImageColor 能力。若底层返回不同坐标约定，只做明确适配，不能发明一个与现有 Window API 不兼容的全局坐标系。

对于已经确认无旋转、轴对齐的单个截图块：

```text
sx = imagePixelWidth  / sourceLogicalWidth
sy = imagePixelHeight / sourceLogicalHeight
u  = floor((desktopX - sourceLogicalOriginX) × sx)
v  = floor((desktopY - sourceLogicalOriginY) × sy)
```

一般情况使用该块明确保存的变换；不能把上面的简单式无条件用于旋转或不同捕获方向。显示器归属使用半开边界，并处理边界处的浮点误差。虚拟桌面空洞、源图缺失或越界返回不可用，不取最近屏幕代替，也不静默 clamp 为边缘像素。

混合 DPI 不能用一个全局 scale。跨屏区域先按各显示器截图块切分，各自映射；拼接图只用于显示，不能把经过插值的拼接图当成 canonical 原始像素源。

取色只读取冻结源图的明确像素，不从 Overlay、放大镜或缩放预览读取，不插值、不混合邻点。通道顺序、premultiplied alpha、色彩 profile/HDR 等必须注明；未经确认不能一律标为 sRGB 或保证等于肉眼显示色。取色的 raw byte 值与经过色彩转换的显示预览不得混为一个字段。

同一组两点／两区域必须属于同一 snapshot。刷新画面是显式操作，建立新 snapshot；旧结果不得与新点静默拼成一组。显示器热插拔、缩放或几何变化需要暂停／刷新，不能继续沿用失效映射。目标窗口消失后，可以查看明确标为历史快照的数据，但不能假称恢复到了该窗口。

## 7. 几何语义

设参照 R=(rx,ry,rw,rh)，目标区域 T=(tx,ty,tw,th)，宽高均大于零，X 向右、Y 向下。

```text
relativeX = tx - rx                  relativeY = ty - ry
relativeWidth = tw                  relativeHeight = th
xPercent = 100 × (tx-rx)/rw          yPercent = 100 × (ty-ry)/rh
widthPercent = 100 × tw/rw           heightPercent = 100 × th/rh
left = tx-rx                        top = ty-ry
right = (rx+rw)-(tx+tw)              bottom = (ry+rh)-(ty+th)
centerOffsetX = tx+tw/2-(rx+rw/2)     centerOffsetY = ty+th/2-(ry+rh/2)
```

四边距的符号只描述相应一条边：正数为该边的内侧余量，零为对应边重合，负数为越过对应边；一条边为正不意味着整个目标都在参照内部。

相对宽高不因平移参照而改变；归一化宽高或百分比另设字段，不能都叫 relativeWidth。除法遇零尺寸参照返回错误，不导出 Infinity/NaN。

面积比 `area(T)/area(R)` 与参照覆盖率 `area(T∩R)/area(R)` 分开；越界时不能把二者混用。目标位于参照内部的比例为 `area(T∩R)/area(T)`。宽高比为 tw/th。

对齐偏差统一使用 Target 对应边减 Reference 对应边。因此左／上对齐偏差与同名边距同号，右／下对齐偏差与同名边距反号，字段必须分别命名。

两点按 B−A 给出 ΔX、ΔY，水平／垂直距离取绝对值，直线距离为 hypot(ΔX,ΔY)。两区域分别给出非负 horizontalGap、verticalGap、X/Y 投影重叠及交集面积；接触时 gap=0 且面积=0，不等于重叠。有符号边距另计算为 B 相对于 A，不把负 gap 同时定义为包含距离或重叠深度。中心偏移和对齐差也固定为 B−A。

说明样例：R=(100,80,1200,800)，T=(196,200,320,180)。相对位置=(96,120)，四边距=(96,120,784,500)，占参照宽／高=26.6667%／22.5%。这些是合同测试数值，不是当前用户真实窗口的读数。

## 8. 三档复制与保存

三档只按信息完整度划分，不再增加“第四种高级模式”。保存使用同一档位定义，避免复制与保存生成两套不同模型。

| 档位 | 内容 | 使用者 |
| --- | --- | --- |
| ① 简明数值 | 类型、参照简名与范围、coordinateSpace、单位、快照标识、绝对／相对位置、当前模式核心结果；点包含颜色，区域包含尺寸和四边距 | 日常复制到脚本、聊天或笔记 |
| ② 完整中文说明 | 第一档 + 全量比例、覆盖率、中心／对齐偏差、边距符号、颜色源说明、映射摘要和失效提示 | 交给开发者／Agent 阅读，不需要先解读 JSON |
| ③ 结构化数据 | schemaVersion、测量对象、Reference、Snapshot/Display 映射、来源可靠性、完整几何、稳定重定位线索、必要运行时证据与适用边界 | 程序处理、复核和后续校准 |

最简档也不能只给 `(x,y)` 或只给 `#RRGGBB`，否则脱离使用环境后就丢失了参照和来源。

程序数据中区分：

```text
stableHints
  应用 bundle identifier／可用时的 executable identity、窗口标题线索、角色
  这些也只是重定位线索，不保证永远稳定
runtimeEvidence
  本次 PID、进程启动标识、窗口句柄／ID、观察时间
  仅用于这次采集诊断；应用重启后必须重新解析，禁止直接复用
```

界面不常驻 runtimeEvidence，详情中折叠显示；第三档可包含必要字段，不附加无关用户数据或凭据。仅凭 PID 或标题都不能证明下次是同一个窗口。

复制只在用户操作后写入剪切板，成功后给“已复制：完整说明（含参照）”这类反馈，不自动退出测量。写入失败必须显示失败或可手工复制的内容，不虚报成功。默认不附送整屏截图。

保存结构化测量需要复核源图时，可由用户显式选择“包含原始快照”；原图与标注预览分开保存，文件／hash／capture metadata 一致。未保存源图的 JSON 必须说明 source asset 未保存，不能留下看似可读但实际失效的临时路径。默认不上传、不联网分析截图。

## 9. 数据模型与生命周期

以下为内部设计合同，不表示新增公共 API：

```text
MeasurementSession
  id / owner / lifecycleState / entrySource / operationMode
  originalContext { externalApplication, externalWindow, recorderSession, recorderRevision }
  snapshot { id, capturedAt, windowEvidence, displayTiles[], rawSources, mapping, colorMetadata }
  reference { kind, humanLabel, bounds, boundsKind, coordinateSpace, locked, revision }
  candidate { source, bounds, parentCandidates, reliability, snapshotId }
  targets[] { kind, value, source, snapshotId, referenceRevision, confirmed }
  measurements { point, region, pair, referenceRelation }
  presentation { hudAnchor, inspectorOpen, overlaySurfaceIds }
  ownedResources { inputLease, temporaryShortcuts, surfaces, subscriptions, rawImages }
```

```text
空闲 IDLE
→ 准备 PREPARING（去重启动、保存上下文、获得输入隔离）
→ 需要时选择参照 PICK_REFERENCE
→ 冻结 FREEZING（隐藏工具 UI、采集并校验）
→ 测量 FROZEN/MEASURING（预览、选择、草稿）
→ 调整 REVIEW（保留结果、微调、复制、可选详情）
→ 恢复 RESTORING
→ 空闲 IDLE
```

Inspector 开关是展示子状态，不新建会话。更换参照需确认并增加 revision；重新冻结增加 snapshotId。所有异步结果须校验 sessionId/generation，过期结果不能重建已退出的 Overlay。

Esc 优先关闭已打开的菜单／详情；正在拖动时撤销这次草稿；其余测量状态退出。明确的“退出”按钮始终结束整个会话。用户不需要理解内部枚举。

## 10. Recorder、原生 surface 与清理边界

Recorder 与开发者菜单通过已有 Runtime 内的控制边界交给唯一 owner。若当前 Recorder 自身运行在已有独立 Execution 中，应复用当前可用的路由，不复制 Measurement 实现，不为测量另启一个 Runtime；实际 owner 位置须以本地源码确认。

Measurement 必须取得可恢复的录制隔离状态：保存 recorder session identity/revision、原 toolbar 状态、捕获状态和输入状态；将测量事件从业务事件采集源头隔离，而不是事后删几条 action。入口触发的按下／抬起和工具 UI 点击也要覆盖。若当前 Recorder 不支持可证明可靠的隔离，不得在录制中静默启动测量或用停止／重新启动录制冒充恢复，应明确阻止并提示先暂停。

退出恢复要验证还是同一个 Recorder 会话且没有用户主动改动；不能用旧状态覆盖期间新建、停止或切换的录制。若进入前正在录制且隔离是受控临时暂停，只恢复同一会话既有状态，不创建新的录制；恢复前检查按键／鼠标释放，避免丢失抬起事件后卡键。

原生实现优先复用当前 Custom UI/native host。macOS 可评估 borderless nonactivating NSPanel；Windows 可评估无普通窗口框的 surface 与 WS_EX_NOACTIVATE/WS_EX_TOOLWINDOW。它们只是底层候选，不代表设置几个 flag 就已证明焦点、可访问性、截图排除和生命周期全部正确。

必须分别核对：不出现普通标题栏；测量 surface 不新增 Dock／Taskbar／普通窗口切换项；应用原有项目不因测量被错误删除；输入可被测量消费而不激活目标业务操作；显示用 surface 不截获尺寸手柄输入；窗口识别和截图按 instrument surface identity 排除自身，不能粗暴排除同 PID 下所有合法业务窗口。

退出按资源账本幂等执行：停止新事件 → 取消异步采集／候选任务 → 销毁 Overlay/HUD/详情 → 解除测量临时快捷键和输入资源 → 释放源图与订阅 → 校验原目标仍有效 → 尝试恢复原应用／窗口 → 恢复对应 Recorder 状态 → 清空唯一会话槽位。

全局“进入测量”快捷键属于 App 生命周期，测量内快捷键属于 Session 生命周期。不得调用 Runtime 级 unregisterAll() 清理测量，从而误删其他功能的快捷键。异常／取消／宿主关闭必须覆盖同一清理链；目标被关闭、ID 复用或系统拒绝激活应报告恢复受限，不能伪报原窗口恢复成功。

## 11. 生产实现与稳定 Surface

`apps/opendesk/prototypes/desktop-measurement/index.html` 是唯一长期 UI / Interaction Oracle；它不进入生产。`pkg/measurement` 是 Production owner，继续使用 `CaptureMapping`、`Reference`、`Result` 与冻结 PNG 的真实 Geometry，而不复制 Prototype 的模拟模型。

每个 Session 只创建一个 `kind: measurement` 的 Native surface。首次进入捕获一次干净冻结 Snapshot，固定预览图与透明 Overlay；工具、HUD、参照、Inspector、候选和结果改变均通过 `UpdateControl` 的 `Source`、`Text`、`Visible`、`Classes` 与 `Value` patch 既有 controls。只有显式“重新冻结”才再次 Capture，退出才销毁 surface 和临时 PNG。

默认视觉层级为冻结桌面、Target / Reference outline、必要标注、角落 HUD 和底部居中小工具条；Inspector 默认隐藏且独立打开。macOS 非激活 Panel 还在可见期间以原生受限键盘 relay 发送 Measurement 的全部快捷键，关闭时移除监听；Windows bridge 保持同一键盘词表。此机制没有新增 JavaScript Runtime API。

## 12. Prototype → Native 验收映射

| Oracle 行为 | Native 自动保护 | 真机范围 |
| --- | --- | --- |
| 单一稳定 surface、重复进入、显式刷新 | `pkg/measurement/session_test.go` | macOS 快捷键进入、退出、重入 |
| HUD / Inspector、底部工具条、三档输出 | `pkg/measurement/session_layout_test.go` 与 Session 行为测试 | macOS 截图检查 |
| Point / Region / Two Point / Two Region、8 handle、边距与 DPI Geometry | `pkg/measurement/...` | Region 键盘模式已实测；物理多屏另测 |
| `Source` patch 与图片资源 | `pkg/customui/memory_driver_source_test.go` | 原生冻结截图实际显示 |
| 1–4、Tab、Alt、Arrow、R、I、Escape、三档复制 | `tests/custom-ui/measurement-keyboard-bridge.test.js` 与 Session 行为测试 | macOS 真实 `2`、`I`、`Esc` 已实测 |

2026-09-15 本机证据写入 `.runtime/tests/desktop-measurement/macos/`：`23-frozen-snapshot-assets-retry.png` 显示真实冻结桌面、Target / Reference 与底部工具条；`24-key-2-relay.png` 显示前台应用仍活动时切换到区域；`25-inspector-key-i.png` 与 `26-inspector-escape.png` 证明 Inspector 层级；`30-session-exit.png` 与 `31-session-reenter.png` 证明清理和重入。

Windows Native、物理 mixed-DPI / 多显示器、真实 Recorder 隔离以及系统剪切板粘贴仍是 **NOT_RUN**。这些缺口不能被浏览器样机或编译结果伪装为通过。

## 参考与既有合同

- [Global Shortcut API](../../api/global-shortcut.md)：Runtime 注册与生命周期、isRegistered 的范围。
- [ui API](../../api/ui.md)、[Geometry API](../../api/geometry.md)、[ImageColor API](../../api/image-color.md)：调用以当前发布合同为准。
- [Recorder 共存规则](recorder-app-coexistence.md)：集成应复用现有边界。
- [Apple 键盘快捷键](https://support.apple.com/en-us/102650)、[Microsoft 截图工具](https://support.microsoft.com/en-us/windows/apps/use-snipping-tool-to-capture-screenshots)：系统常见截图入口。
- [Apple nonactivatingPanel](https://developer.apple.com/documentation/appkit/nswindow/stylemask-swift.struct/nonactivatingpanel)、[Microsoft Extended Window Styles](https://learn.microsoft.com/en-us/windows/win32/winmsg/extended-window-styles)：原生 surface 评估依据，不替代真机测试。
