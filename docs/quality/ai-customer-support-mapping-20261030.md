# AI 客服：普通用户数据处理方案

> **2026-10-30 入口退役说明：** 下文保留当时的源码状态、命令及证据；涉及独立「未连接」App Mode、staging 和原生业务/工作区/映射 gate 的命令已退役，不能作为当前运行入口或当前原生通过证明。共享业务代码、浏览器/领域测试及独立文件 gate 保留。当前以 `native-demo.js` 的聊天实窗 + 六页助手为基线，详见[入口清理记录](ai-customer-support-ui-retirement-20261030.md)。

2026-10-30，本轮工作区增量，未提交/推送。沿用 master；开始时 HEAD 与 origin/master 均为 `a867a782cac08ec06382236a962e2609e5342af3`。工作区含多项并行任务，本文只覆盖映射方案，不替代持久化/文件桥 Owner 的验收。

## 需求与决定

用户要求在 OpenDesk AI 客服内部提供方便普通用户编写少量业务接入/处理代码的设计，不修改 Codex/OMX hooks。现有 Adapter/worker/域校验/预检已经齐备；缺口是用户必须编写完整 DTO，无法从模板试跑和管理启停。

采用商品/客户模板、顶层字段对应和线性三步界面；可选代码沿用可信本地 Node Adapter。没有新增依赖、Runtime API、WebView eval 或拖拽平台。试跑/保存/预检不写业务资料，确认才应用。方案按店铺/来源保存并默认停用；启停版本和业务 epoch 防止旧结果继续应用。方案 JSON 备份不包含输入、聊天、凭据或启用授权。

- 新纯领域模块：`examples/ai-customer-support/src/domain/business-mapping.ts`，64KiB/100行输入，字段/行错误，店铺来源核对，共用现有最终 DTO 校验。
- 新产品界面：`src/views/BusinessMappings.tsx`；`BusinessData.tsx` 增加嵌入入口，`styles.css` 复用现有窄面板样式；所有正式状态在 `state.tsx`，没有第二套业务状态。
- 可选少量代码：`integrations/mapped-demo-adapter.mjs` 共享映射器，仍走既有 worker/父校验/独占原子发布。
- [操作与代码说明](../../examples/ai-customer-support/integrations/mapping-guide.md)，设计依据在本例 DESIGN.md §11。

## 发现与修复

独立代码复审发现：编辑器卸载重建时旧预检残留；客户模板的默认关联/标签会影响已有关联和草稿；字段名不支持空格。前两项按高优先级修复，已由新增回归及独立复审验证。最终限定复评确认原3项均已修复，无新增阻断：折叠后旧预检消失，普通文件预检不受影响；关联客户备注更新保留草稿；本地覆盖冲突继续拒绝。界面映射更新从同店/同来源/同类型/同ID的来源原件保留未选中字段，仍不绕过本地覆盖/版本/引用校验；产品更新时间跟随输入。无状态 Node 单行映射是完整实体生成，不保证部分更新；开发者更新现有资料须提供完整映射或经验证的业务状态。

## 验证证据（原生分时验收待完成）

证据根目录：`.runtime/tests/ai-customer-support/mapping-20261030/`。

| 项目 | 当前结果 |
| --- | --- |
| typecheck | PASS，`typecheck-final.log` |
| 新映射状态回归 | PASS，6/6，`state-final.log`；含关联客户备注更新保留人工草稿 |
| 新映射领域/真实CLI | PASS，15/15；与状态共21/21，`mapping-final.log`；包含真实CLI发布/超时/坏DTO、带空格列名、未映射字段保留 |
| 公开一行CLI | PASS，原样执行说明中的命令，`public-cli.log`；只证明PUBLISHED；独立读取文件与店铺、来源、版本及游标一致 |
| 新UI浏览器 | PASS，15场景；`browser/result.json`，含工作区收起重开取消旧预检、输入输出、试跑/启停/恢复、客户及商品应用、草稿保护和380px；零网络/pageerror/弹窗 |
| 共享Desktop/Package契约 | PASS，24/24，`desktop-contract.log`，已刷新core与输入hash |
| 原核心浏览器 | PASS，14/14，`core-browser.log` |
| 整套本例单元/CLI | PASS，265/265，`unit-final.log`。早期238/239的Host fixture失败保留在`unit.log`；Owner改为完整合法备份并加载canonical validator后通过 |
| 原业务浏览器 | PASS，7/7，`existing-browser-final.log`、`existing-business-browser-final/`。早期等待旧图片提示的FAIL记录和截图保留，Owner已修正断言 |
| 仓库级测试目录审计 | FAIL，`layout-final.log`：既有Go分类账缺漏/7行格式问题、缺少window-app-watch.js及single-entry文档清单不一致；失败项不涉及本轮映射文件，未扩大修复范围 |
| 原生加载/视觉/新流程 | NOT_TESTED：共享文件与原生窗口正在由持久化Owner修改/验收，需协调占用 |
| 真实平台 | NOT_TESTED，未选择平台、未调用CRM/电商、未发送真实客户消息 |

浏览器使用本机 Chrome、隔离 headless context、唯一生成 HTML 的 file:// 页面；不注入业务 state。不得把浏览器截图表述为原生实窗证据。

原生新增场景 `tests/custom-ui/ai-customer-support-mapping-native.js` 与运行器 `tests/custom-ui/tools/support-app/run-mapping-native.mjs` 已完成语法检查；正式运行前等待共享gate最小scenario入口和GUI租约。该运行器原样执行操作说明的App命令，再由独立`.js` controller操作其实际报告的窗口，不改源码入口或注入业务状态。

## 并行边界与剩余 Owner

另一个对话 `01a18b8f-dffe-7b40-8693-fe530be5596a` 负责工作区持久化、文件目录、原生图片/恢复和相关Host。已观察其对 `state.tsx` provider、`BusinessData.tsx` 和 Host 的增量；本轮保留其内容，只在自己的 MAPPING 分支与新模块推进。用户已明确授权分别分工、冲突分时使用。已完成一次build交接：当前HTML及app-integrity为 `b7819cb0303284a40d7cfbf2bedb4a54bba7a39e75b6944882decdd844b680a9`；浏览器加载响应和运行前后文件hash均一致。持久化Owner先占用原生窗口，完成后再交回本轮；不结束它的进程或覆盖其构建物。

10100保持既有进程；18082开始时未监听，未启动/停止它。未修改模型/provider/Codex/OMX、权限或签名身份。真实微信、旧R3.0-C质量阻断及生产写回不在本轮。
