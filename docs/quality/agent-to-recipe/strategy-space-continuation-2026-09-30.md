# 求解策略空间接续审阅：从总地图到阶段正文

## 本轮结论与范围

读取基线：`7d07b60805948e2e1a7b9acead3684367ce864da`。本记录是文档方法及模板接续的静态审阅，不是 S1—S12 的实际生产、独立模型评测或真实桌面 Qualification。

原基线已拥有总地图、条件化操作策略、主备切换规则、模块入口边界、Calculator 演练 0.2 和唯一评分制度。本轮不重建这些内容；补齐总地图到 S8/S9 正文、应用能力合同、S11 模块复用检查的可读连接。没有修改 production JavaScript、Runtime、schema、Guard 或评分权重。

## 发现的问题及实际修改

| 问题 | 影响 | 本轮修改 |
| --- | --- | --- |
| 总地图未集中指出裁剪结果进入哪个既有人工视图 | 用户仍难从“有哪些方法”追到“本任务实际选了什么” | 总框架新增 0.6，映射合同/计划、Procedure、AppProfile、Candidate、阶段与资格记录；引用既有模板 |
| SemanticProcedure 模板把 selected 放入 runtime validation 单元格 | 容易将选中误记为已验证，且遗漏未选/失败理由 | 选择处置与运行验证分栏；输出规格要求两者与来源、范围分别记录 |
| S8/S9 模板缺少业务能力与裁剪正文 | 下游可能只拿到方法名，再猜接口与复用边界 | 增加按需裁剪、业务操作合同、消费者和工程缺口，不增加 schema |
| Calculator 方法样本开头写 S9 直接接收 DistilledSteps | 与 S8 checkpoint → S9 的正式阶段边界不一致 | 改为 S8 先消费 S7，再由 S9 消费通过的 S8；补填写后的裁剪及三个操作合同 |
| 模块模板未明确仅导入时的副作用边界 | 可复用模块可能在调用业务方法前激活应用或重复执行 main | Candidate 模板及其验证规格加入无动作导入、原入口正常执行、依赖变更和受控反例检查 |

所有新增阅读表都投影已有权威产物；不新建 solution-design.json、策略注册库或平行运行报告。正式选择/验证枚举以共享合同为准。保留原有章节与内容，六份原文件合计新增 118 行、删除 3 行。

## 实际做了哪些检查

本地是通过 GitHub 读取并按 Git blob SHA 校验的**六文件部分快照**，不是完整 clone；直接 clone 因网络/DNS 不可用失败。远端通过 GitHub 连接读取，写入采用基线 tree 上的精确 blob，提交时检查 master 并使用非强制快进。

| 已执行检查 | 结果与限制 |
| --- | --- |
| 原文完整性 | 六份本地原文 Git blob SHA 与固定基线完全一致，避免重建文本时误删原文 |
| 增量结构 | 保留全部既有标题及顺序；代码围栏闭合、表格列数一致 |
| 新增引用 | 13 处新增 Markdown 引用全部解析；本地目标检查正文，未落地目标以同基线 GitHub 文件/metadata 核对；新增显式锚点存在 |
| 负向校准 | 删除新锚点、构造不存在目标时可被局部链接检查识别；只证明该检查范围 |
| 选择/验证区分 | 原 selected/not-run/partial/pass 混写单元格已去除，并人工审阅分列后的语义 |
| Git 格式 | `git diff --check` 通过 |

上述共 43 项局部静态断言通过、0 项失败；这是检查脚本断言数，**不是 43 个既有工作流测试，也不是阶段得分或生产可靠率**。本地原始检查脚本、差异和结果位于 `.runtime/tests/strategy-docs/`，不作为源文件提交。

## 反方审阅：文档规则是否覆盖关键错误

以下是对方法正文的静态反例审阅，不是已执行的 Skill/Guard/UI 测试。

| 反例 | 正文给出的正确处理 | 实际行为验证 |
| --- | --- | --- |
| 需要分页但缺结束条件，却标不适用 | 保留未知/阻塞，不裁掉 requested | 未运行 |
| 候选 selected 就填 runtimeValidation=pass | 选择和验证分开，验证需要固定证据 | 未运行 |
| 用参考 JS 倒填首次 S2 的窗口事实 | 区分教学参考、实际观察和阶段来源 | 未运行 |
| S9 直接替代 S8 checkpoint | S8/S9 分别消费、分别退出，保留首次错误 | 未运行 |
| 清空 UI 顺便丢掉 firstResult | B030 保留任务值，B040 消费本次读数 | 未运行 |
| 无可靠备用仍自动尝试坐标 | 未验证候选不进入生产集合；必要时停止 | 未运行 |
| 模块仅导入就激活应用或顶层调用 main | S11 返修；无动作导入与原生产入口分别验证 | 未运行 |
| 备用或配置改变仍借用旧默认路径资格 | 重绑依赖/配置，按影响重验实际路径 | 未运行 |

## 尚未执行，不计通过

完整仓库的 workflow regression、独立 Producer、OpenDesk Runtime 导入/入口测试、Calculator Fresh Runs、真实消息发送、备用路径与跨版本兼容均未运行。没有受控 macOS 桌面和完整 Runtime；本轮也没有修改或重新生成 production Candidate。不能据此授予阶段 PASS、95 分或复用资格。

评分继续使用 `design/validation-plan.md` 的五维 25/20/20/20/15、20 个五分项及 Hard Fail 规则，S8/S9 等独立责任不合并。该记录不创建新的评分表或自动 Guard 能力。后续真实验证沿已有 WORKFLOW 和对应 Skill 接续，仅重验实际受影响的职责；不为本文重做 Calculator 全部历史示范。

## 固定文档字节

以下 Git blob 与 SHA-256 绑定本次审阅的六份修改正文；本报告不列自身 hash，避免循环引用。提交后的 commit 可从包含这些 blob 的 Git 历史核对。

| 路径 | Git blob SHA | SHA-256 |
| --- | --- | --- |
| `docs/frameworks/automation-problem-solving-framework.md` | `ab81e8d3b34c9d1e97fbf4fcff2d7d38fd639003` | `fa3b92fe8bfeadd5b07d06f6f56d8a65eb7f5a1c87062b29cdcdda4f7d47c5cc` |
| `workflows/agent-to-recipe/skills/procedure-synthesize/examples/calculator.md` | `4a3790f44e6be86f6c637f30011fe8aa7d43c7c8` | `0f31ad807722782f72ac5d4fd36032cc8fc6a40eff620952c78d85bac75f77c1` |
| `workflows/agent-to-recipe/skills/procedure-synthesize/references/output-spec.md` | `70b252719b51634075c93d3661a0a6138708e6d1` | `1446dfa9f8dca7f5013ef1c10e49d2dd75b060e53f4ccf6e49f9d023e3d04e2e` |
| `workflows/agent-to-recipe/skills/procedure-synthesize/templates/semantic-procedure.md` | `8e32b00ad67bc900d3632a487756d65c92e0aa10` | `fc5c0e02abe2168b8d77cc4ee6b90ae90df514333b877e57bbe60dbc12b6595b` |
| `workflows/agent-to-recipe/skills/recipe-build/references/validation.md` | `e099ac930aeba6fbb764295870f849ad728faed7` | `3e1b591fb8afc783c04352761fcec5683d0a7a6f7bcec43443070568df5d6fef` |
| `workflows/agent-to-recipe/skills/recipe-build/templates/candidate.md` | `ab2eb205ca15e77e24564e89ea5fe75e5b1c6ba8` | `c09181e0e92c3e8ee6aff0964c4ca2ecc4470af52e2d0b08290e17fe5d470cd2` |

## 人工阅读顺序

先读总框架 0.6，确认本任务决定应落在哪里；再读 procedure-synthesize 的 Calculator 样本，检查业务、数据与能力合同的具体形状；最后看 Candidate 模板的模块边界。实际运行排错仍先打开本次 `stage-review.md`，不是用本审阅记录代替实际阶段成果。
