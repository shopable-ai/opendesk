# Desktop Measurement：DM-AMEND-2026-09-17-01 实施与剩余差距

本文件是 `desktop-measurement.md` 的受控修订附件，不是第二套产品架构。用户明确纠正优先于旧 Frozen 条款。当前 UI 合同见 `apps/opendesk/prototypes/desktop-measurement/ORACLE.md`；旧 Oracle 的原始 blob 原样保存在同目录 `ORACLE.baseline-2026-09-16.md`，只作为历史和未修改条款的继承来源。

## 1. 决策与范围

采用 **A：选择 Reference → Freeze → Measurement**。选择阶段只有 Live 窗口名称/边框/bounds 预览，不进行 Live 像素测量。它也构成 C 的最小安全子集，而不是每帧截图的 Live Measurement。

| 方案 | 坐标、颜色与证据 | 窗口移动、滚动、动画 | 复杂度与性能 | 本轮决定 |
|---|---|---|---|---|
| A：选择后冻结 | 一次确认对应稳定源像素、映射和窗口身份；margin 可复算 | 历史 Snapshot 不改写；需要新画面时 Update | 不随 pointer 截图；分析缓存可复用 | 实现 Prototype |
| B：全程 Live | pointer、AX/UIA、图像、颜色可能来自不同帧 | 连续失效、候选漂移、截图/HUD 排除和竞态显著增加 | 必须建立帧级一致性、取消和背压 | P2，不实施 |
| C：Live preview + 确认时冻结 | 确认后的正式证据同 A；此前只能称 preview | 需防确认瞬间窗口变化 | 窗口级 preview 可控，像素级 preview 成本高 | 只实施 Live 窗口预览 |

入口链为 `IDLE → REFERENCE_SELECTING → FREEZING → MEASURING`。建议前台窗口不等于用户确认。重复入口复用同一 Session。Inspector 中显式重新选择进入同一 Session 的 Live 选择阶段；旧 Records 保留。Update/Adjust/Continue 沿用原工具、Esc、输入隔离和稳定 Surface 合同，不恢复旧 handles/nudge 或多级 Esc。

## 2. Resolver 实施合同

Prototype `visual-resolver.js` 只消费无 HUD 的 Frozen 分析像素。优先现有缓存，再 frozen synthetic semantic tree，缺少非窗口语义候选时用 Visual；最后允许人工框选。源为 synthetic tree 就诚实标记 fixture，不冒充真实 AX/UIA。

集中参数：64ms 重型计算间隔、7 logical px 小移动阈值、最大 768×384 logical-pixel ROI、60000 visited pixels、50000 candidate bbox pixels、Reference 面积占比不超过 0.5、填充率至少 0.70、最短边 12、12ms cooperative 时间预算、最多 8 个缓存区域。容差是 RGB 距离而非严格相等。它们是本轮初始安全预算，不是所有机器/图像的最优性能承诺。

每个 pointermove 更新 Micro HUD；只有需要新候选时进入 latest-pointer trailing throttle。已有稳定候选内部、同 Snapshot、颜色相近时复用；语义栈上下文发生变化时不能因还在父矩形里就继续粘住父候选。Tab 选中层级在同一包含栈内保留。移动进入子区域、离开旧候选、颜色变化、provider/tolerance/模式/代际变化会重新校验。无候选的小范围重复 seed 也有有界负缓存。

4-connected ROI flood fill 的 seen 和 queue 都有上限。ROI 边界命中、透明 seed、访问/面积/时间预算用尽、过大背景、过小/稀疏区域或旧 token 一律返回无可靠 Visual Candidate；不会把截断的 ROI 当成控件，也不会把整个窗口伪装成 flood-fill 成功。已知 Window 祖先如需进入栈，必须另用 `window-reference` 来源。

异步验证至少包括 Session/generation/Snapshot，Prototype 还绑定 candidate epoch、pointer revision 和 provider。Update/Adjust/Exit/Alt/OFF 立即使旧工作失效。同步 JS 算法在有限工作中合作检查预算；这不是可抢占的硬实时 12ms 保证。Production 的后台 worker 同样必须有并发上限，不能只取消 Future 而不断累积不响应取消的 provider。

## 3. 连续记录与持久化

`Hover preview → Click confirmed → Enter/记录加入 Session → 显式保存得到 saved`，四个动作不混为一谈。主 Toolbar 仍是十项；Record 和 Records 入口属于 Corner HUD 的次级操作，label、Copy All、Save、重新选择在 Inspector。

Session envelope 必须包含 `sessionId`、reference identity、`snapshots[]`、`measurements[]`。每条有 type/label/geometry/coordinates/margins/candidate/sourcePixel/stableRelocationEvidence、自己的完整 snapshot token。Only confirmed，partial pairs、preview、stale snapshot 均拒绝。Record 克隆证据，不引用正在变化的当前状态。Update 清空 current，不删除历史；Exit 清掉未保存内存状态，已经保存的文件不删除。退出前显示未保存提示，不增加新的 Esc hierarchy。

Prototype 初始上限 100 条、16 个 Snapshot、20 MiB encoded source images；超限拒绝添加并保留已有记录，不偷偷淘汰仍被 Record 引用的 Snapshot。PNG 仅在该 Snapshot 首次 Record 时序列化；多条记录共享一份 source。Prototype 可以实际复制整个 Session JSON，或触发浏览器 JSON 下载。成功 `writable.close()` 后才把精确对应的 records 标成 saved；下载请求本身不证明用户磁盘保存成功。取消/失败保留集合及可复制数据。

### JSON 与 JSONL

| 选择 | 追加 / 崩溃 | AI 与人工消费 | 本轮取舍 |
|---|---|---|---|
| Versioned JSON envelope | 集合在内存追加，显式保存时完整写入；Native 采用原子替换 | 单文件可读，一次读取 snapshots + records，不需重建日志 | P0 采用 |
| JSONL journal | 可逐条 append；需处理最后半行、序号、去重、fsync、snapshot 事务与 compaction | AI 可以流式读取，但需重建 Session 和 Snapshot 引用 | 仅在确有自动恢复要求时增加，不作为 P0 必经路径 |

P0 不承诺未保存内存数据的崩溃恢复，也不把浏览器下载称为 Native atomic persistence。不引入数据库。Native 如要求可恢复记录，优先每次显式 Record 后原子保存完整 manifest 的可选策略，必须先明确用户授权与 source-image 事务；不能把每次 hover/click 写磁盘。

### 已核验的存储 owner

当前 `pkg/measurement/evidence.go::EvidencePathsForTask` 已使用：

```text
.runtime/automation-authoring/<task-id>/measurement/
  evidence.json
  snapshot.png
```

`authoring.go::SaveAuthoringMeasurementInput` 也复用这个目录。新的 Native Session 包应在已有 task package 内扩展，而不是覆盖单记录 `evidence.json`：

```text
.runtime/automation-authoring/<task-id>/measurement/sessions/<session-id>/
  measurement.json
  snapshots/<snapshot-id>.png
```

没有 task 时可用 `.runtime/desktop-measurement/<session-id>/`。拒绝 `apps/opendesk/**`、不安全 path segment、越界 artifact ref、同名替换窗口，以及未经确认的任意写路径。部署时 root 应来自既有用户 artifact owner，不能把 app 安装目录推断为用户工作区。

以上 Native 路径和 bridge 是**待实现合同**；本轮实际实现的 Prototype 保存是浏览器 picker/下载，不能指定 `.runtime` 或声称已经接上本地 authoring filesystem。浏览器回归下载产物由测试 harness 保存到 `.runtime/tests/desktop-measurement/prototype/measurement-session.json`。

### Authoring 适配边界

生产继续使用现有 `MeasurementEvidence`、`MeasurementProductEvidence`、`Result` 和 `BuildAuthoringMeasurementInput`。Session 是这些证据的集合/索引，不新建 Geometry Runtime。逐条校验 Snapshot hash、mapping、window identity、source 与 semantic flag，再映射到既有 Result：Prototype `pp` 对应 `twoPoint`，`rr` 对应 `spacing`，百分比 0–100 与既有明确命名的 ratio 0–1 不得混用。

Prototype JSON 的 `prototypeOnly:true` 不得进入 Native qualification。当前生产 loader **尚不支持** Session envelope；不能把“AI 可一次读取合成 JSON”表述为“正式 Authoring importer 已完成”。未来 importer 保留每条 evidenceRef 和 Snapshot，不跨 Snapshot 自动 relocation，不把 absolute geometry 升级成 stable locator，不直接生成/执行 Recipe。

## 4. 边界与 Fail Closed

| 风险 | 必须行为 | 本轮证明 / 余项 |
|---|---|---|
| 选择中窗口移动/resize | pointer down/up 必须是同一 identity 与同一 bounds；变化则重新 preview，不确认旧几何 | Prototype pointer-down/up 校验；Native identity/mapping/capture 前后复验未接入 |
| 窗口关闭/替换 | identity/PID/native handle 不一致即取消确认；不能按相同标题替代 | 当前 Native capture 精确恢复线索可复用；Live selection owner 待实施 |
| 冻结后移动/滚动/视频 | 已记录 Snapshot 不变化，Current 是这帧而非“实时正确”；Update/Adjust 后使用新 token | Prototype 多 Snapshot 回归 |
| Popup/Menu/跨应用遮挡 | 顶层窗口归属明确才确认；不把不属于 Reference 的 popup 当 Local；需要时重选 | Prototype 两窗口顶层命中；Native popup ownership 待验 |
| 多屏、负坐标、Retina、125% | 分离 screen logical、window-relative、image pixel；逐 display 半开区间映射；洞或未覆盖部分无源像素 | 合成 1.25×/mixed/负坐标测试；Native 当前单 display capture 不能被称为完整跨屏实现 |
| 透明/渐变/阴影/圆角/大背景/文本孔洞 | 只返回满足预算的 visual bbox；透明、过宽泛、不闭合/稀疏区域无候选，保留人工路径 | Node ROI/alpha/area/density/budget tests；不承诺识别任意 UI |
| HUD 污染 | 分析及颜色只读 Frozen source，不截图 Measurement chrome | 合成 source provenance；Native exclusion 需真机 |
| 栈顺序抖动 | 同上下文保留 Tab 层；进入新子区域后重算，不无限粘住父层 | browser 稳定层与新 child 检查；Native scheduler/cache pending |
| 快移/Update/Adjust 并发 | token + request epoch/pointer context 验证，旧结果不应用 | browser stale tests；Native 已有 token/epoch guard，本次补 OFF/Alt gating |
| Records 引用旧 Snapshot | 历史 token 合法但不是 current；Record 新增仅接受当前确认结果，旧 records 不重写 | records.js 单元 + 跨两 Snapshot browser |
| 资源与隐私 | 内存/文件大小上限；source 可以含敏感 UI，用户显式导出，不遥测上传 | Prototype 有界内存、显式保存；Native 文件权限/原子事务仍需集成 |

## 5. Production Gap Matrix：不得把源码缺口改名为 Native-only QA

检查基准 `8d4e6a9231ba95c9483b692785305e7e331ec540`。以下状态仅指本修订内容，不否认已有生产四工具、Mapping、Evidence、Recorder 隔离等能力。

| Gap | 已完成 | 未完成 / owner | 状态 |
|---|---|---|---|
| PG-01 显式 Live Reference selection | Prototype 完整选择/重选/确认后捕获及测试；Oracle/架构已修订 | `session.go::openNew` 仍先 `Capture(ctx, "")`；`app_measurement.go` 仍用 `selected.isActive` 作为确认；`MeasurementSurfaceSpec` 仍是 image-target 输入平面。需要真正 Live selector 与 host/capture 两阶段协议 | **OPEN_IMPLEMENTATION** |
| PG-02 Hover resolver 性能 | Prototype bounded ROI、正/负缓存、64ms throttle、稳定层、计数与回归；生产补 Magnet OFF/Alt 的新工作与旧完成门禁 | Native `resolveAsync` 仍按 pointer 创建请求、取消后 provider 未必停止；需要单 flight + latest pending、bounded worker、cache、visual source adapter；`writePreviewOverlay` 仍生成整图 PNG | **PARTIAL_SOURCE_ONLY** |
| PG-03 Hover Corner HUD | Prototype preview/locked、source/layer/size/Window+Local/比例以及一组 overlay | Native `patchPreview` 主要更新 snapInfo/PNG，没有对应完整 hover HUD 合同 | **OPEN_IMPLEMENTATION** |
| PG-04 多记录 / 文件 / Authoring | Prototype 记录、copy、真实浏览器下载与失败处理；路径和 envelope 合同明确 | Native Session journal、Inspector/Enter binding、不可变多 Snapshot artifact、canonical loader/handoff bridge 尚未接通 | **OPEN_IMPLEMENTATION** |
| PG-05 旧输入合同 | 四模式、十项 toolbar、Esc、无 handles/nudge、source provenance、ratio、Adjust 保持 | 所有新增 Native 行为需在不破坏这些约束下实现 | **PRESERVED / NATIVE NOT_RUN** |

本轮生产 patch 只针对 `candidate_stack.go` 的 OFF/Alt 请求抑制、pending invalidation 与完成校验；新增同包 `candidate_suppression_test.go` 验证 100 次 pointermove 不再唤起 provider。该测试是 internal Go seam，不是公共 Runtime API 测试。网页版环境只完成 gofmt/源码审阅，**没有执行完整 Go package suite**，不能写成 PASS_AUTOMATED。

Native PG-01/02/03/04 都是剩余实现工作，不能交接成“仅剩构建、权限、视觉验收”，也不能仅给 phase 增加一个字符串就关闭 PG-01。生产实现需在新 Oracle 已冻结后继续，按各 PG 单独补 MemoryDriver/JS/host regression，再进入真实平台 qualification。

## 6. 本轮实际验证

`node --test tests/desktop-measurement/model.test.js tests/desktop-measurement/amendment.test.js`：50/50（原有16 + 新34）。`python tests/desktop-measurement/browser.test.py`：97/97，page errors 0。100 次小范围 pointermove 增加 0 次 expensive visual resolve / flood fill；另外跨时间的25次小移动也复用。3条记录跨2个 Snapshot，Copy All 与实际 Chromium JSON 下载包含完整集合及各自 PNG source。

已静态查看选择阶段、Hover 与 records/visual 场景截图，确认轻 Micro / Corner 两层与保持十项 Toolbar。测试环境限制 `file://`，沿用现有测试策略将**同一 checked-in 外部资源** inline 到 Chromium `set_content`；没有用第二套 UI 实现，不把该结果冒充用户 OS/direct-open 权限验证。

原始运行日志/截图/JSON 只在 `.runtime/tests/desktop-measurement/`；正式摘要与逐源码 SHA256 见 `tests/desktop-measurement/amendment-manifest.json`。`import-manifest.json` 的历史导入计数不改写。

真实 macOS/Windows、Go package suite、生产 build 和现有用户本机工作区均没有在本轮获得新的 PASS。Native 最终还需验证 capture 前后身份、transparent live selection、input interception、self exclusion、global shortcut、Recorder pause、物理 DPI/多屏/负坐标、source/record一致、clipboard、atomic save、路径和重复退出/重入。
