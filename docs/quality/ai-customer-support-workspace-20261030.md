# AI 客服本地业务工作区续作验收

2026-10-30，仓库根目录 `/Users/shopme/Documents/workspace/opendesk`，master HEAD `a867a782cac08ec06382236a962e2609e5342af3`，大量既有未提交修改。未创建分支、提交或推送。采用用户本轮 P0–P4 与本例 [DESIGN §12](../../examples/ai-customer-support/DESIGN.md)，并保护并行的数据处理方案工作。

## 实现与边界

- 唯一业务 owner 仍为 `src/state.tsx`。工作区快照仅使用既有完整业务备份契约，不序列化聊天、草稿、授权、真实 Binding、托管、脚本或凭据。
- 每次启动自动保存关闭；显式保存或当次确认启用后才写入。启动不自动恢复。保存中出现新业务对象时不把新修改标为已保存，异常停止自动保存并要求刷新核对。
- 浏览器使用真实 IndexedDB 原子读写事务；原生使用稳定 advisory lock、预期 generation 与三个固定槽。同目录独占写 pending 后 Unix rename 发布；保留最新有效槽。恢复绑定 slot＋generation，完整校验、图片解码、确认后使用同一份字节。
- 原生清单只检查最多500个已枚举名称、返回最多100条，并显示截断。`File.listDir` 的底层枚举仍非硬上限。白名单、路径和容量在实际读取时复核。
- 业务 payload 8MiB不变，外层 JSON envelope 单独最多48MiB＋1KiB。固定 pending/abandoned 仅作故障残留，不能选作恢复版本。不承诺断电持久性、敌对路径竞争消除或Windows live。
- 独立审查发现 `File.writeNew` 临时 inode 的0644问题，已由 native owner 改成0600；硬链接与rename保持权限。父目录默认权限不变，历史宽松文件不自动修复；同账户与Windows ACL不属于该保证。
- 通用 JSON/HTTP Adapter 只读、一次一页、固定字段映射及来源前缀ID。UI应用成功后才能推进 checkpoint。CLI是可信本地Node代码，无真实平台接入或生产凭据。
- 商品 SVG fallback 使用 contain 展示完整标题，保持现有六页、约380px与视觉风格。未接真实微信、生产消息或财务操作。

## 新鲜验证

证据根为 `.runtime/tests/ai-customer-support/workspace-20261030/`；运行日志与截图不进入版本控制。

| 检查 | 结果及证据 |
| --- | --- |
| 方案独立复评 | 96/100，OKAY；已修复slot＋generation、envelope预算、提交点及底层枚举表述。评分不替代测试 |
| 全例单元/CLI | PASS 265/265；并行整合任务提供 `../mapping-20261030/` 当前全例收口证据 |
| Host/文件目标测试 | PASS 52/52；`host-owner-final-tests.log`；canonical validator与合法大payload fixture |
| TypeScript | PASS；`host-owner-typecheck.log`，并行整合后也通过 |
| Desktop/core/package契约 | PASS 24/24；`../mapping-20261030/core-build.log`、`desktop-contract.log`，现行core-inputs hash |
| 业务/核心浏览器 | PASS 7＋14；`browser-business.log`、`browser-core.log`；并行整合后重新通过 |
| 最终工作区浏览器 | PASS 13场景；`browser-workspace-final.log`、`browser-workspace/result.json`：默认无写入、显式保存、重开不自动恢复、取消、3槽、坏版本回退、真实IDB并发CAS、generation绑定、显式自动保存、真实IDB锁定下准备/发布两种迟到修改、配额故障回滚并关闭自动保存、380无横向溢出 |
| 通用接入 | PASS 9＋12；`adapter-verification.md`、`adapter-tests.tap`、`adapter-cli-regression.tap`；真实子进程CLI、loopback HTTP、超时/分页/限额/凭据不泄漏；README两条离线命令原样通过 |
| 签名宿主刷新 | PASS；`native-build-private.log`，固定 OpenDesk Local Development 身份，未改安装版或系统权限 |
| 真实 Runtime 文件与权限 | PASS 44断言；`runtime-1793344829865/result.json`，官方summary succeeded、293019ms。8MiB原文、11709584字节envelope精确往返；真实锁、CAS、坏版本及发布后故障残留。`native-file-permissions-audit.json`：umask022、parent0755下捕获52个临时inode，加pending/abandoned/三槽/lock均0600。早期取消及controller正则错误的FAIL原件保留 |
| 原生功能及视觉 | 进行中；图片、恢复取消/确认、工作区重开与损坏回退必须分别有真实窗口证据 |
| 公开一行App命令 | 待新构建重跑；旧构建的源码启动证据不能代替当前运行 |
| 独立代码复评 | 复评95/100，当前无P0/P1/P2未解决发现；权限P1已撤下。评分仅针对代码及现有证据，不替代实窗验收。修正的权限controller未重新运行，独立audit不冒充该controller PASS |

## 当前构建溯源

本机刷新了与当前native源码对应的配套构建，未覆盖 `/Applications/OpenDesk.app`。稳定签名身份指纹 `6A3487D1D884CA77AB04B380E0186E23F8E1EE39`。

| 产物 | SHA256 |
| --- | --- |
| `dist/OpenDesk.app/Contents/MacOS/opendesk` | `4c1664f7b2fda44dfbd12959c9d9c1e57c9f45feb138582d09e95d3523025ec2` |
| `dist/OpenDesk.app/Contents/Helpers/opendesk-ui-host` | `cf1331b4b6935ed759ebdef91773c783009905527f7a83cb816d0ed2af3697ae` |
| `examples/ai-customer-support/preview/index.html` | `b7819cb0303284a40d7cfbf2bedb4a54bba7a39e75b6944882decdd844b680a9` |

HTML由正式源码构建，app-integrity与之对应；源码、staging、公开源App与安装包的证据分别记录。未验收安装发行包；未运行Linux/Windows live、VM、Docker或Wine。既有整仓测试架构审计失败是已记录范围外问题，本轮未改Go分类账本。

## 复现入口

以下均从仓库根目录执行。普通用户入口只有启动命令和真实窗口交互：

```sh
./dist/opendesk -app examples/ai-customer-support -console-mode script -log-dir .runtime/tests/ai-customer-support/workspace-20261030/public-app
```

正式自动化gate分别运行，不能当作普通用户启动方式：

```sh
npm --prefix examples/ai-customer-support run test:workspace-browser
node tests/custom-ui/tools/support-app/run-workspace-files.mjs
node tests/custom-ui/tools/support-app/run-workspace-native.mjs run
```

失败记录：首次文件gate在40断言后异步收尾被取消，未算通过。第二次44断言及Runtime生命周期均正常完成；外部权限controller因`workspace.lock`正则写成`workspace-lock`报FAIL，仅此遗漏了锁路径。已修工具正则，并独立从原成功Runtime summary、已保存的临时inode采样与最终真实stat完成权限audit；未改写原失败报告，也未用新模拟替代真实运行。故障残留测试是在真实writeNew完成后诱发错误，不能表述为整进程kill或断电验证。
