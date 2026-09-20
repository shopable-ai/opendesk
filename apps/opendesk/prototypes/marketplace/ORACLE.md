# Flow Marketplace · 同站点静态安装 Oracle

日期：2026-09-20

状态：**STATIC_IMPLEMENTED / CORE_AUTOMATION_PASS / WINDOWS_FULL_RUNTIME_BLOCKED / MACOS_DESKTOP_NOT_RUN**

本文件定义当前主原型、本地真实 Notify Demo 和开发冷启动会话的可观察正确行为。整体架构只维护在 `docs/architecture/execution/flow-marketplace.md`。

## 1. 唯一真实开发链路

```text
node tests/prototypes/tools/marketplace-local-manual.mjs
→ 当前 index.html + canonical Notify Demo
→ 本次 run/site
→ Chrome 打开 run/site/index.html
→ 点击真实 Notify Demo「安装到 OpenDesk」
→ OS 分发 ID-only opendesk:// 给 OpenDesk
→ static resolver GET 同站点 release.json
→ 验证 Release v2
→ GET 同站点 notify-demo.odflow
→ 验包 + Release/Package 匹配
→ 一次原生安装/信任确认
→ flowinstall.Service 事务安装
→ Catalog / 真实 Flow Runner
→ 用户另外点击 Run
→ 新 Execution + Notify Demo Toast / 固定日志
```

任何“安装时直接产生业务 Execution/通知”都是失败。

## 2. 站点 Oracle

本次 HTTP 根目录只能是 run 下的 `site/`：

```text
site/
├── index.html
├── local-deep-link-smoke.html
└── flows/
    └── com.example.opendesk.notify-demo/
        └── local-notify-demo-1/
            ├── release.json
            └── notify-demo.odflow
```

必须成立：

- site root 是新建或空的真实目录；
- symlink 或已有未知内容必须拒绝；
- development config、App Data、Catalog、receiver log、HTTP request log 不得位于 site 中；
- 私钥不落盘；
- `index.html` 每次从 canonical 原型重新准备；
- `.odflow` 每次从 canonical 示例读取并核对 archive digest；
- 作者维护的 `main.js` / `clawdesk.runtime.json` 与 `flow.json` 必须一致；
- 包内生成的 trust/inventory/signature 由正式包 verifier 负责。

没有文件监听。源码改变后必须重新运行开发命令。

## 3. 页面 Oracle

生成页面：

- 只有真实 Notify Demo 使用实际 `opendesk://`；
- 查看 Release、下载包、安装协议必须指向同一 Flow/Release；
- 其他商品继续模拟；
- 不调用 `/local-smoke/status`；
- 不通过 blur、visibilitychange、timeout 或点击推断安装结果；
- 点击后只显示“已请求打开 OpenDesk，请在应用中完成安装”。

源码 `index.html` 未注入 binding 时仍是离线原型，CSP 保持 `connect-src 'none'`。

## 4. Release v2 Oracle

静态 `release.json`：

- 外层 schema = 1；
- Release schema = 2；
- Attestation schema = 2。

v2 签名至少保护：

```text
Marketplace / Flow / Release identity
flowName
version
Publisher ID / key / fingerprint
artifact digest / size / location
minimum OpenDesk version
publishedAt / status / entitlement
update channel / verified publisher
metadataRevision
attestation expiry
```

Go verifier 与 Node 本地发布器必须通过同一 golden bytes。static resolver 不接受 v1 Release，也不在失败时自动回退 dynamic resolver。

## 5. 地址、网络与 revision Oracle

相对 `artifactLocation` 使用 `artifactBaseUrl`；为空时沿用 `metadataBaseUrl`。合法配置路径前缀不能丢失或重复。

以下必须拒绝：

- `../`；
- 反斜杠；
- 绝对相对路径；
- query / fragment 混入相对位置；
- 未批准 redirect；
- production localhost / loopback；
- private / link-local 地址；
- 单标签内网主机。

production 请求期还要解析 DNS；默认 transport 只拨号到已校验公共 IP。开发 HTTP 例外只允许显式 loopback。

同一 Marketplace + Release：

```text
accepted revision=2
→ receive revision=1
→ reject before download and native confirmation
→ Catalog remains revision=2
```

同一 Release 不得绑定不同 artifact digest。位置改变但 digest 不变时提高 revision 并重签；包内容改变使用新 Release。

## 6. 开发配置与冷启动 Oracle

本地开发配置 schema = 3，至少包含：

```text
sessionId
expiresAt
appDataRoot
resolver=static
metadataBaseUrl
artifactBaseUrl
rootKeyId
rootPublicKey
logFile（可选）
```

只允许 HTTP loopback，且 expiry 必须是 canonical UTC RFC3339、未过期、短期有效。`appDataRoot` 必须是配置文件目录下真实、非 symlink 的私有子目录，且不能位于公开 `site/`。OpenDesk 在初始化 FlowInstall/Catalog 之前从该已验证配置绑定 appData；不能依赖 LaunchServices 环境继承。

显式 helper 启动后，OpenDesk 才允许登记一个本机 session pointer：

```text
schemaVersion
sessionId
configPath
configDigest
appDataRoot
expiresAt
```

该 pointer 保存于默认 OpenDesk App Data，而不是隔离测试 App Data，因此正式 bundle 冷启动后能够找到；它只保存路径、digest 和 public 配置关联，不保存私钥。

冷启动恢复只允许发生在：

- OpenDesk 正式 bundled App Mode；
- CLI 没有显式 development config；
- session 尚未过期；
- session/config ID 与 expiry 一致；
- config digest 未变化；
- config 与 appData 仍是真实可用路径；
- config.appDataRoot 与 session.appDataRoot 精确一致。

Deep Link 仍只有 Flow/Release/intent 三个 ID，不能携带 configPath、root、appData 或任意 Runtime 参数。

## 7. 冷启动检查 Oracle

从第一次启动输出取得 run dir：

```bash
node tests/prototypes/tools/marketplace-local-manual.mjs \
  --cold-start-check <manual-run-dir>
```

该检查必须：

1. 确认本次静态 server 仍存活；
2. 只停止本次记录的 OpenDesk；停止前同时核对 PID、命令标记与记录的进程启动时间；
3. 确认没有残留 bundle 进程；
4. 只通过 LaunchServices + ID-only URL 冷启动 bundle；
5. 在本次 receiver log 的新增部分观察到：
   - `development session restored`
   - `rejected invalid install intent`（使用不安装的负向 URL，仅证明分发）；
6. 更新 run.json 中本次冷启动 PID；
7. 保持 app 运行，随后由用户从主原型点击真实 Notify Demo 完成安装。

helper 预先启动 App 不能计作冷启动 PASS；只有上述实际重新启动才算。

## 8. HTTP 下载证据 Oracle

`http-requests.log` 位于 site 外，记录：

```text
timestamp
method
path
status
bytes
```

桌面验收时必须把：

```text
HTTP release request
+ HTTP artifact request / bytes
+ release artifactDigest
+ Catalog archiveDigest
```

串成同次证据，不能用本地侧载结果冒充 HTTP 下载。

## 9. 原生确认 Oracle

确认必须发生在：

```text
Release verified
+ artifact downloaded and digest checked
+ canonical .odflow verified
+ Release/Package identity matched
```

之后。

确认显示名称来自受 v2 attestation 保护且与包 manifest 一致的 `flowName`。

未知 Publisher 默认 trust 只允许当前 Flow；Release attestation 不能伪造 AuthorityProof 或自动扩大本地 Publisher Trust。

取消时不能新增：

- Trust；
- ready Catalog；
- 安装内容；
- Execution。

## 10. Install ≠ Run Oracle

安装路径只调用既有统一 Installer / FlowInstall，不允许调用 Runtime。

真实桌面验收：

```text
before install execution count
→ install
→ Catalog ready / Runner visible
→ execution count unchanged
→ user explicitly clicks Run
→ new execution + Toast/log
```

模拟 Runner 不是实际运行证据。

## 11. 普通静态服务器替换 Oracle

将生成的 `site/` 交给独立通用静态 HTTP server 后：

- `index.html` 可访问；
- `release.json` 可访问；
- `.odflow` 可访问且 digest 一致；
- `/v1/install-intents/*` 不存在；
- dynamic artifact endpoint 不存在；
- `/local-smoke/status` 不存在。

客户端只需要匹配该 origin 的受限开发配置，不需要第二个 Marketplace 业务服务。

## 12. 自动化证据

Flow Commercial Qualification run `35506679830`，基线 `ce94bca4f89a47560b1551a1d1274e81d6745309`：

| Gate | Result |
| --- | --- |
| Marketplace prototype/static/Chromium | PASS |
| portable owners | PASS |
| Marketplace development schema/session/appDataRoot tests | PASS |
| macOS Marketplace + B0/B1 Runtime | PASS |
| Windows Marketplace contract | PASS |
| Windows distribution build | PASS |
| Windows B0 direct Runtime | PASS |
| Windows full formal Runtime | BLOCKED / FAIL：`ATOMIC_REPLACE_UNSUPPORTED` |

Windows full gate 的失败发生在通用 Runtime evidence 原子替换基础设施，后续 distribution/B1 被跳过；不把它伪报成 static Marketplace 失败，也不把 Windows 完整回归计 PASS。

App Mode Payload 当前仍存在并行 Flow Runner / assistant asset snapshot 的无关失败；Official Product Config / flowDistribution parser 相关测试已恢复通过。

## 13. 仍需真实 macOS Desktop

以下仍为 `NOT_RUN`：

- Chrome 主原型实际点击；
- 热启动真实安装；
- `--cold-start-check` 后真实冷启动安装；
- 原生确认 UI 内容；
- 取消后零副作用；
- Runner 真实可见；
- 安装前后 execution 不增加；
- explicit Run 的 execution / Toast / log；
- 重复点击/重装；
- 过期/篡改 session 的本机拒绝。

## 14. download 扩展

`download` Deep Link 参数：**未实施**。默认页面不得生成该参数。
