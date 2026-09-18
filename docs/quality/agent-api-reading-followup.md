# Agent API 阅读入口：接续实施验收

本记录针对已推送的实现提交 `9388ba04a4fca5fb085590f2cd4d472a7fbbcd9c`，补充[原交付记录](agent-api-reading.md)。原记录中 17 项测试及“JSON 只读字段”的测量是前一版基线；本记录的 26 项测试与“校验后独占另存”演示为本次接续结果。不是第二份 API 合同。

## 最终阅读链

[唯一短入口](../api/agent/README.md) → 按业务选择语义目录 → 比较方法用途、签名、副作用及限制 → `scripts/api-docs.js read` 实际返回 canonical 方法和必要依赖 → 核对当前入口/授权/结果验证 → 现有 CLI 或普通 JavaScript Recipe。

当前步骤的方法、输入输出、必要类型、权限/平台、错误/等待/取消与副作用均已明确且无未决依赖时，停止展开。新步骤或缺口触发下一次定向读取，不递归遍历全部链接。目录只用于发现，完整行为仍由 canonical Reference 负责；不预设 UI/OCR/Accessibility 的全局优先级。

## 本次直接提交

| 提交 | 实际文件范围 |
| --- | --- |
| `198d6b44efa03c2e824f979a8986bcd2afcabd40` | 将已验证但尚未在分支上落库的 10 个语义目录与 9 处导航/Workflow/Skill 接入真正提交到 master；复用内容 SHA 校验过的生成对象 |
| `9388ba04a4fca5fb085590f2cd4d472a7fbbcd9c` | 修改短入口、`scripts/api-docs.js`、`scripts/api-docs-map.js`、`tests/api-docs/reader.test.js`，补齐委托契约、传输校验、独立覆盖清单和三组演示 |

第一次提交涉及 `AGENTS.md`、`docs/api/README.md`、`docs/api/index.md`、`workflows/README.md`、Agent WORKFLOW / capability-discovery / application-engineer Skill、Human Skill、recorder-script-refiner Skill，以及 `docs/api/agent/{targets,elements,vision,input-events,data,runtime,presentation,network-ai,authoring,entrypoints}.md`。

并行提交的根 README/QUICKSTART、Framework 导航、code-rebuild、CI 以及原质量记录均保留；没有用旧快照覆盖它们。远端更新使用 `force:false` 非强制快进，没有新建分支。本地验证环境是隔离源码快照，不是用户电脑工作区，未声称看过用户未提交修改。

## 本次补齐的真实缺口

`Locator` 文本依赖正则原先只匹配字面量 `Locator.`，现覆盖 find/waitFor/tap。getValue/setValue 会继续读取 UI 底层方法及 Accessibility 公共语义；tap 会携带三种目标实际委托的方法；window.wait/activate 同样展开正文明确复用的 get/current。

全局 notify、Dialog、剪贴板快捷方法现在跨页进入真正的 canonical 方法，并继续展开该页共享契约。所有依赖仅记录来源位置，没有复制第二套参数/错误正文。

END 标记不能证明中间内容未丢失。现在 `plan` 包含选择项及 packet SHA-256，`verify` 同时复核输出、字节/字符、范围和当前源版本；有结束标记但丢失中段、同长度篡改、遗漏依赖和过期来源均会失败。`read --max-bytes N` 超限整包拒绝，stdout 为空，不返回成功形状的残片。`plan --types` 与 `read --types` 相匹配。

`verify` 验证保存或实际传入的完整字符串，不证明聊天宿主把该文件完整发送给模型。宿主仍须核对实际返回范围。工具没有新的 Runtime、网络调用、业务执行或协议格式变更。

## 离线检查

实际运行在 GitHub Actions 完整 checkout，源码为上述实现提交：

[Actions run 35345949660](https://github.com/shopable-ai/opendesk/actions/runs/35345949660)，阅读 job `105602441034`。

| 检查 | 真实结果 |
| --- | --- |
| `node scripts/api-docs.js check` | PASS；10 组、45 个文档入口、493 个条目，链接/锚点/来源一致性错误 0 |
| `node --test tests/api-docs/reader.test.js` | 26 pass，0 fail，0 skipped；包含三组只读演示 |
| 目录再生成与已提交文件比较 | PASS；CI 先检查已提交目录，再生成验证，不能通过先重生成掩盖漂移 |
| `git diff --check` 和生成后工作区 | PASS；CI 记录的 worktree-status 为空 |
| 独立 Reference/类型发现 | PASS；扫描 63 个 declared global 名称及 8 个显式 docType: reference 页面；新增未路由 global/Reference 的注入测试会失败 |
| `node scripts/check_api_docs_contract.js` | FAIL（该实现提交上的既有失败）；本次两笔读取层提交未修改旧检查或产品代码 |

原检查在本次 commit 的 canonical job `105602441324` 实际输出：

```text
API_DOC_CONTRACT_ERROR apps/opendesk/scheduler-center.js: missing canonical Scheduler Center inline template name
```

该失败已在接续修改前的 CI 复现；因此 9388ba04 对应的整体 workflow 不是全绿。新阅读 job 与该旧失败独立。该 run 的 canonical job 后续产品 JS syntax step 被跳过，不能称其通过。提交报告前，master 已有并行提交更新旧检查器与 Workflow；此处只记录已核实的 9388ba04 结果，不把历史失败或成功冒充所有后续 commit 的状态。

493 是方法、属性、实例和兼容名称的目录条目，不是 493 个已逐一运行认证的 API。45 个入口还包含 CLI/Protocol；只有部分历史页带 docType，不能把“8 个显式 Reference”误说成全部 Reference。覆盖还联合全部已登记 Reference 的总表/标题/类型成员与机器索引 41 个 globals；机器 keyMethods 不是唯一覆盖依据。类库按当前正式文档的模块入口呈现，不等于附带第三方所有方法的行为合同。

仍有 29 个可发现但缺少可确认 canonical 正文的旧条目，明确标记 blocked，例如 page.waitForNavigation、部分 File 方法及 axios.request。不会从类型猜造调用，也没有从覆盖分母删除缺口。`coverage.json` 保存完整清单；读取层通过不是旧合同全部补齐。

## 三组真实文档读取演示

测试输入均未预先指定 API；选择和比较记录在确定性测试中。它们验证读取路径与内容，不是独立 Agent 的盲测。

**A：从指定应用当前窗口取得订单号，只观察。** 进入 targets/elements，比较 window.get/list/content 与 UI.readText/getValue。选择 window.get 的唯一身份和 UI.readText 的可见文字来源；native textField value 是不同需求，不拿 accessible name 或 OCR 假充。取得 scope、坐标、错误和平台边界后停止，不展开输入、菜单、文件和历史案例。

**B：读配置、校验、另存且不覆盖。** 进入 data，比较 File.read/readJSON 和 write/writeJSON/writeNew。选择 readJSON 解析；schema 校验及 JSON.stringify 属于普通 JavaScript，不误说为 readJSON 自动校验。writeJSON 会替换已有文件，不符合本输入；选择 writeNew 的独占创建，要求目标位于已存在且获准的目录，不使用 exists 加 write 的竞态做法。明确原件/输出边界后停止；不读取真实配置，也不实际保存业务结果。

**C：已有 Recipe 取消后重复输入，只审查局部。** 只读失败示例源码，才识别 UI.tapTexts 的真实调用；比较其 actionState/completed/等待与 Runtime 取消边界。UI.tapTargets 需要不同 selector 证据，不能在未知动作后盲切。确认 catch 中无条件重放不安全后停止，不更改其余业务，不调用该示例，不宣称已修好客户脚本。

以下均为该次 CI 实际输出，不是 token 估算；Unicode 字符按代码点计数。入口和目录每次完整读取，跨包重复读取逐次累计，没有虚构缓存命中：

| 演示 | 入口＋目录＋阅读包 UTF-8 字节 | Unicode 字符 | 提取器来源文件体量 |
| --- | ---: | ---: | ---: |
| A 桌面取值 | 71,972 | 51,196 | 101,047 |
| B 配置校验后另存 | 36,984 | 23,994 | 32,742 |
| C Recipe 局部审查 | 49,584 | 33,316 | 78,261 |

“来源文件体量”为每个包内去重、跨包累计的源文件大小账本，不是操作系统底层 I/O 次数或流量；检查器自身会扫描更多文件，也不是模型上下文。三个演示均不全文读取 runtime-api.ai.json、不全文返回全部类型、不执行桌面或客户业务。没有 provider/tokenizer 数据，不声称效率、token 成本或成功率已提升。

### 实际读取范围

三个演示均完整读取 `docs/api/agent/README.md` 1–61 行（5,407 字节、2,815 字符）。A 另读 targets.md 1–147 行、elements.md 1–91 行；B 另读 data.md 1–157 行；C 另读 elements.md 1–91 行。这里行范围包含源文件末尾空行。

| 阅读包 | 输出字节 / 字符 | 返回的 canonical 源范围（1-based，含公共依赖） |
| --- | ---: | --- |
| `window.get` | 9,118 / 6,229 | `docs/api/window.md` 1–10, 44–122, 713–745, 957–966；`docs/api/app.md` 27–66 |
| `UI.readText` | 14,368 / 10,268 | `docs/api/desktop-ui.md` 1–15, 40–44, 338–453, 524–547, 827–865, 1310–1353 |
| `File.readJSON` | 5,334 / 3,434 | `docs/api/file.md` 1–22, 61–61, 105–130, 157–184, 435–442 |
| `File.writeNew` | 3,628 / 2,290 | `docs/api/file.md` 1–22, 61–61, 199–223, 435–442 |
| `UI.tapTexts` | 18,952 / 12,691 | `docs/api/desktop-ui.md` 1–15, 40–44, 338–453, 524–547, 897–994, 1310–1353 |
| `#异步完成与取消` | 5,933 / 3,523 | `docs/api/runtime.md` 1–12, 163–231 |

File.readJSON 的关键公共错误/取消在 file.md 157–184 行，属于 writeJSON 后面的共享小节；本次真实返回该段，未把 H2 105–130 当作完整合同。File.writeNew 是另一个独占写入合同，没有把异步 writeJSON 的替换/取消语义强行套给它。

### 版本与重现

CI 保存 `.runtime/tests/api-docs/reading-demos.json`（各包源 SHA-256、范围、大小、比较与停止点）、六个实际阅读包、coverage、测试 TAP、目录/工作区及 JSON 消费者记录。运行产物不提交；本文件只保存稳定验收摘要。阅读产物位于 run 的 `agent-api-reading-evidence`，id `10545719856`，留存 7 天，过期后可用同 commit 的测试重新生成。

程序消费 JSON、工具返回 Markdown 和真实模型加载分别记录。JSON 及其原有解析消费者不删除，不改变结构。旧 `Retain documentation verification inputs` 资料搬运步骤和临时准备 job 已从当前 CI 移除；保留的是正式检查与运行证据留存，不再上传整套源码资料作为交付。

## 验证状态边界

文件已在 master 调整并提交；隔离快照及完整 checkout 的离线检查/三组阅读演示已经验证。独立 Coding Agent 的实际 Skill 加载、自然选型盲测、真实 Runtime 调用、macOS/Windows 桌面操作、客户业务和 token 对照均未运行。无权限/无完整合同的条目继续阻塞，不能用静态检查代替现场验证。

后续 Agent-to-Recipe 的调用只需说明：继续当前任务，需要 API 时从 `docs/api/agent/README.md` 自行选择能力目录并取得完整契约及依赖；沿当前授权入口执行，缺口或未知副作用停止，不要求用户手工列出文件。
