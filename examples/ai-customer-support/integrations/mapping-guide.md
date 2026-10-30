# 数据处理方案：从字段对应开始

适用于本例的设置 → **业务数据与同步 → 数据处理方案**。目前有商品清单和客户名册两种模板；全部内置数据明确为虚构。普通用户只需改字段名，不需要修改 React 源码或编写完整业务 DTO。

## 先走通一个商品样例

从**仓库根目录**启动当前原生 Demo：

```sh
./examples/ai-customer-support/scripts/run-desktop.sh
```

维护者更新 React 后先从仓库根执行 `npm --prefix examples/ai-customer-support run build`。纯浏览器也可以直接打开 `examples/ai-customer-support/preview/index.html`；它与原生窗口使用同一份生成 HTML。

1. 选择「示例旗舰店」，进入设置，展开「数据处理方案」，选择「商品清单」。
2. 看输入中的 `title`，它已对应商品名称。其他对应项包含 ID、SKU、人民币参考价、简介、正整数版本和 UTC 更新时间。可将输入中的 `title` 改成 `productName`，再将名称对应字段改成 `productName`。
3. 点「试跑（不写入资料）」，查看完整输出同步页和新增/更新计数。故意把价格改成数字，试跑会报告失败阶段、行号和输出字段；原资料和已应用页标记不会变化。
4. 修正后重新试跑，点「保存处理方案」。找到保存的方案，点「启用」，再点「使用方案并预检」。
5. 在下方核对来源、增量和下一游标，点「确认应用同步页」。返回商品页可搜索虚构星云马克杯。也可先取消预检，资料和游标保持原样。
6. 点「停用」阻止后续使用，已确认的数据保留。导出方案 JSON，并在「方案备份与恢复」中复制全文到本机文本文件。将其粘贴回来可恢复配置，恢复后默认停用。同店铺/来源的旧方案会被替换。

客户模板同样操作，名称默认对应 `name`，备注对应 `notes`。可以把 CRM 的 `displayName` 映射为客户名称。模板不建立真实聊天身份映射，不授予订单操作或聊天权限。

## 输入和执行规则

- 输入是顶层 JSON 数组，最多 100 行、64KiB UTF-8；允许未选中的列，但它们不会出现在输出中。选择器仅支持顶层字段名，不能写表达式或嵌套路径。
- 方案绑定店铺与来源。输入如果自带 `storeId` / `sourceId`，必须与方案相同。不要把同来源方案改绑到另一店铺。
- 下一页标记由数据来源提供；样例使用 `mapping-v1`。同一页完全一致可以重放。数据变更须提高来源版本、保持更新时间不回退并使用下一页标记；不能仅改游标来强行覆盖旧版本或本地人工覆盖。
- 手动试跑、保存和预检都不会推进已应用游标，只有确认应用才推进。错身份、坏字段、版本/游标或外键/覆盖冲突整批拒绝。
- 界面更新同店/同来源/同类型/同 ID 的已有资料时，保留未映射的商品元信息、图片位置以及客户标签和会话关联；不覆盖人工本地修改。映射器不猜测新的聊天身份。
- 修改字段、输入、页标记、店铺资料或方案会使旧试跑失效；修改或停用方案也会取消其待确认结果。没有后台轮询或定时执行。
- 当前方案和业务数据各有自己的备份。方案仅存在本次页面内存；导出的方案只含字段配置，不含客户输入、输出、凭据、聊天或启用授权。关闭前分别保存，不要把「已保存方案」理解为已写入磁盘。

## 需要几行自定义 JavaScript 时

已有的 [mapped-demo-adapter.mjs](mapped-demo-adapter.mjs) 与界面共享 `src/domain/business-mapping.ts`，完整实体协议和域校验只有一份。示例的 `pull` 先准备虚构数据，在下面这行修改自己的逻辑：

```js
row.title = row.title.trim();
```

例如清理输入后缀，或根据已获授权的本地字段拼接简介；不要在没有依据时生成价格、库存、政策或身份。真实数据获取可替换示例中的 `mappingSample`，但需先明确平台与授权契约。导出的方案可在可信 Node 中用 `parseMappingPlan` 读取，再传给 `mapBusinessRow`；读取 JSON 不执行其中代码。

从**仓库根目录**执行离线示例（Node >=22、已安装本例依赖，输出名须未使用）：

```sh
node examples/ai-customer-support/scripts/sync-business.mjs --adapter examples/ai-customer-support/integrations/mapped-demo-adapter.mjs --store store-demo --source mapping-cli-demo --out .runtime/business-sync/mapped-example-v1.json
```

成功回执 `PUBLISHED` 仅表示文件准备好。原生在业务文件区填写 `mapped-example-v1.json` 后读取，浏览器选择该文件；两者都须预检后明确确认。CLI 示例使用独立来源 `mapping-cli-demo` 和 `mapped-v1` 游标，界面样例默认来源 `mapping-products`、游标 `mapping-v1`；不要混用同一来源的不同演示链，后续保持各自的来源标识。重放 CLI 页时传 `--cursor mapped-v1`，输出另选新文件名。

Node Adapter 拥有本机文件、网络和进程权限，只运行可信代码。现有 Worker 提供故障和超时隔离，不是安全沙箱。代码异常、超时或坏返回不会发布同步文件，既有资料须经独立 UI 确认才会变化；`afterSync` 也不表示界面已应用。界面字段配置没有任意代码执行，不保存平台密钥。

`mapBusinessRow` 的无状态用法生成完整实体，不是部分更新协议。需要更新已有关联客户或商品元信息时，使用界面方案，或给 `runMappingPlan` 传入已经校验的业务状态；自定义完整 Adapter 须自行明确全部字段。不可把默认空标签或空关联误当成“保持不变”。

## 维护者验证

以下命令均从**仓库根目录**执行，浏览器证据写入 `.runtime/tests/ai-customer-support/mapping-20261030/browser/`：

```sh
node --test examples/ai-customer-support/tests/business-mapping.test.mjs examples/ai-customer-support/tests/business-mapping-state.test.mjs
npm --prefix examples/ai-customer-support run typecheck
npm --prefix examples/ai-customer-support run build
PLAYWRIGHT_CHROMIUM_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node examples/ai-customer-support/tests/business-mapping-browser.mjs
```

浏览器验证、原生加载/视觉、原生业务操作和真实平台接入分别记录，不相互替代。真实平台、持久化/文件清单及真实聊天身份由各自工作负责。

旧独立 App Mode 的映射验收启动器已随该入口退役。工作区 controller 和映射场景保留供后续迁移；在当前 `native-demo.js` 入口上的加载、视觉和映射操作尚未重新验收，不能沿用旧 App Mode 的通过结论。普通体验使用上面的一行启动命令；[入口清理记录](../../../docs/quality/ai-customer-support-ui-retirement-20261030.md)列出保留范围与验证边界。
