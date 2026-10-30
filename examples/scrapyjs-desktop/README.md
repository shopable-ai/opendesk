# ScrapyJS R2.4 Desktop HTTP Adapter

状态：业务层源码及 Node 回环 Fixture 测试已完成；**OpenDesk native / macOS / Windows / Browser→Desktop 实测均 NOT_TESTED**。

## 原始目标与源码归属

- Browser ScrapyJS React 保留唯一用户管理 UI；本目录只实现 Mac/PC 上可选静态 HTTP GET 节点，不能替代 Browser 已登录 DOM。
- 优先复用 OpenDesk Desktop 的 http.download、Execution、File、原生取消机制，不创建第二个 HTTP 服务、代理和 Go Runtime。
- HTML/JSON 以 inert .body 文件落盘；不执行页面 JavaScript、不模仿 Chromium/TLS 指纹、不提取已登录 Cookie。
- Desktop HTTP 只保存响应及 JSON 顶层数组的条数。HTML CSS 字段提取和 JavaScript 渲染不在本轮声称完成。

读取过 Browser main 的 ScrapyJS capture-policy、app-model、controller/main、README 和 docs；当时尚无正式发布的 R2.2 ExecutionPlan/HeaderProfile/RunReceipt Schema。本目录的输入只是**本地投影**，不是官方 Schema：
- executionPlan: executor=desktop-http, method=GET, targetOrigins, urls, limits。
- headerProfile: headers。
- 输出 format=scrapyjs.desktop-http.local-receipt.v1，不能假定已与 Browser RunReceipt 兼容。

**Browser R2.2 正式合同公布后须显式映射并验证；不得在 Desktop 建立平行的 Recipe 管理业务。**

## 从 Desktop 仓库根目录复制执行

先在另一终端启动只用于本地验证的独立回显服务器：

    node tests/scrapyjs-desktop/fixture-server.mjs

审阅 examples/scrapyjs-desktop/example-input.json 的 URL、Origin、请求头和各项上限后，运行：

    OPENDESK_SCRAPYJS_LOCAL_APPROVAL=READ_ONLY_GET ./dist/opendesk ai run examples/scrapyjs-desktop/main.mjs --input-file examples/scrapyjs-desktop/example-input.json

OPENDESK_SCRAPYJS_LOCAL_APPROVAL 只是**本机操作者审阅提示**，不得由网页或 AI 自动设置，不授予宿主权限。可信本机文件入口中 http.download 的准入仍由 Host 判定。HTTP/MCP/Scheduler/inline 的泛用执行禁止下载；不能靠从 Browser 调用 POST /executions 绕过。无需部署 Node 常驻应用，Node fixture 仅在测试时手动运行。

输出由宿主定位到 Execution.artifactDir/scrapyjs-desktop/Execution.id，包含 page-N.body 和 receipt.json。运行失败不能声称成功；操作停止不撤销已提交文件，需由原 execution 状态与 artifact 读回确认。Console 只输出状态、文件位置、页数和错误码，不输出完整 URL、请求头值或正文。

## Header 能力 / 三层证据

| 请求头 | Adapter 接受 | 原生链路证据 |
| --- | --- | --- |
| Accept | 是，最大 256 可打印 ASCII 字符 | 已提交给 http.download；OpenDesk 服务端回显 NOT_TESTED |
| Accept-Language | 是，同上 | 同上 |
| User-Agent | 是，同上 | 不保证 Go 默认值或代理保留；必须核对真实回显 |
| Cookie / Authorization / Proxy-Authorization | 否 | 不读取 Browser 会话 |
| Host / Origin / Referer / Sec-* / Range / If-Range / X-* / 任意其他头 | 否 | 严格白名单 |

计划值、提交给 Native API 的值不等同于实际发送值。receipt.submittedHeaderValues 是 JS 参数快照；receipt.actualWireHeaders 固定 NOT_OBSERVABLE_FROM_DESKTOP_API。只有确实受控的本机 /headers 返回 JSON 时，才在对应 page 中记录 fixtureClaimedHeaders；该值仍属于**服务器声明**，不能替代抓包或 OpenDesk native 链路实测。TLS、JA3、代理出口和真实浏览器指纹不随 User-Agent 改变。

## 安全、可靠性及剩余缺口

- 只能 GET，最多 3 个 URL、3 次请求、每页 512 KiB、每次 20 秒，总请求预算不超过 60 秒；只允许用户显式批准的 Origin，禁止额外字段、无凭据 URL、fragment、跨源请求、重复 URL。
- 远端必须 HTTPS；HTTP 只用于直接批准的 127.0.0.1 回环 Fixture。拒绝 localhost、.local、.internal、IPv6 literal、其他 IPv4 literal。原生 http.download 默认最多 5 次同源重定向、不允许 HTTPS 降级；强制 allowCrossOriginRedirects=false。
- 使用原生流式大小限制、解压后 bytesWritten、SHA-256 和安全提交；文件名无 .html 执行关联。返回 SHA-256 不等于 JS 又完成一次独立哈希检查；Node Fixture 的哈希校验是独立的。
- 遇错误、超限、未知响应或取消停止，不自动重试、切换引擎、重发带副作用的请求。拒绝不符合格式的正文，receipt 记录实际完成页和错误码。
- **仍有真实 SSRF 防护缺口：** Desktop JS API 未暴露 DNS 解析结果及连接时的 peer IP。获准的 DNS hostname 仍可能解析到 private、link-local 或 metadata 网段，或遭 DNS rebinding。生产接受不可信外部目标前，须由可信 Native HTTP 层在每次解析/重定向/拨号位置阻断该类地址；当前未改 Go，不能宣称已经全面防御 SSRF。
- Native HTTP 下载没有提供请求最终 wire headers、TLS 指纹、详细最终 URL 和响应头，不能把值相等写成已验证。
- Browser→Desktop 可信任务交接未验证，不存在已完成的跨设备通信；只有用户主动本机执行测试这一种路径。

## 验证命令与证据等级

在 Desktop 仓库根目录：

    node --test tests/scrapyjs-desktop/desktop-http-adapter.test.mjs

测试启动真正的 Node loopback HTTP echo server；Downloader 仍是明确标注的 Node 适配桩。覆盖白名单、Origin/SSRF 静态筛选、1-3 页、HTML/JSON、文件 SHA、超限、取消、原生拒绝与 fail closed。**NODE_LOOPBACK_FIXTURE 不等于 REAL_OPENDESK_HTTP PASS。**

下一步 Desktop 真机验收：用以上原样命令运行可信 OpenDesk，核对 receipt、server echo 三个 header 值、原生 hash、超限和 Stop 的最终状态；MAC_DESKTOP、WINDOWS_DESKTOP、REAL_NETWORK 分别记录真实证据，无结果均 NOT_TESTED。接着在 Browser React 现有 UI 中接入**单一**受审任务交接协议；不得新建 Desktop 管理 UI。
