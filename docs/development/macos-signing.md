# macOS 开发签名与权限延续

所有命令从 OpenDesk 仓库根目录执行。日常开发固定使用同一证书、Bundle ID 和安装位置。
二进制内容变化后 CDHash 变化是正常的；授权连续性依赖旧版本记录的代码要求是否接受新版本。
同名 App、相同路径、相同证书显示名或自身签名验证成功，都不能替代跨版本检查。

## 一次性配置

没有可复用身份时，无需 Apple 付费会员即可建立专用于本机开发的身份：

```bash
./scripts/setup_macos_signing.sh
```

它创建有效期十年的 Code Signing 自签证书及专用钥匙串，并固定证书 SHA-1。只向当前用户的
keychain search list 追加专用钥匙串，保留已有项与 default keychain；不修改全局证书信任、TCC、
系统数据库或现有登录钥匙串。私钥导入只允许 `/usr/bin/codesign` 使用，不启用 unrestricted access。
重复执行复用原身份；部分设置中断时可用 `./scripts/setup_macos_signing.sh --resume` 恢复现有材料，
不会重新生成证书。

已有合适证书时，在首次配置前执行：

```bash
CODESIGN_KEYCHAIN=/absolute/path/to/existing.keychain-db ./scripts/setup_macos_signing.sh --identity CERTIFICATE_SHA1
```

`CERTIFICATE_SHA1` 必须是实际证书的 40 位指纹，不接受显示名。该命令不导出现有私钥。
已有配置时拒绝另外选择身份；确需轮换应作为一次身份迁移处理，不能删除配置后每次重新签发。

默认本机配置位置：

```text
~/Library/Application Support/OpenDesk/development-signing/
  config.json                       # 固定 identity 和 keychain 路径
  opendesk-development.keychain-db   # 专用钥匙串
  certificate.pem                   # 原始证书，不能用同名新证书替代
  private-key.encrypted.pem          # 加密恢复材料
  identity.p12                      # 加密恢复材料
  keychain-password                 # 仅当前用户可读，权限 600
```

目录权限为 700。密码和恢复材料只在本机，不入库、不上传、不打印。构建会解锁这个专用钥匙串，
不会解锁或修改登录钥匙串。请把整个目录做受保护的离线备份；密码与加密私钥相邻保存，因此目录
本身按私密材料保护。恢复时保留原证书/私钥/指纹，并修正配置中的绝对路径。仅有同名证书、同一
私钥重新签发的另一张证书或新建的同名钥匙串，都不等于恢复原签名身份。

## 日常构建与启动

```bash
./scripts/build_macos_app.sh
```

`make build-macos` 和 macOS 上的 `make build` 使用同一 bundle builder；`REBUILD=1
./scripts/run_macos_stable.sh ...` 也重建完整已签名包，不再直接改写 bundle 二进制。
Go 未加入 PATH 时可显式指定，例如本机现有工具链：

```bash
GO_BIN="$HOME/.local/opt/go1.25.13-amd64/bin/go" ./scripts/build_macos_app.sh
```

默认产物为 `dist/OpenDesk.app`。builder 先在 `.runtime/build/` 完成编译、嵌套 Mach-O 签名和严格
验证，再替换输出中的旧 bundle；同一输出目录同时只接受一个构建。失败不会报告成功，也不自动
换证书、跳过签名或回退 ad-hoc。配置缺失、指纹错误、私钥不可用或证书过期时，恢复原身份并重试。
遗留 build lock 必须先确认没有活跃构建再处理，不自动抢占其他构建。

```bash
./scripts/open_macos_app.sh
```

启动器只读取公有证书指纹并验证当前配置要求，不要求私钥在线、不解锁钥匙串；安装后可用
`OPENDESK_APP=/Applications/OpenDesk.app ./scripts/open_macos_app.sh`。
`run_macos_stable.sh` 仍是 CLI 执行入口；CLI 的责任进程链和权限可能与桌面 App 不同，不能用它的
权限结果代替已运行 App。`open` 返回成功仅代表启动请求受理，需核对真正 owner PID、加载路径和状态。

构建本身不覆盖 `/Applications`，不结束任何运行任务。更新安装前先保存输入并正常退出原 App，
核对没有其他服务正使用同一安装包，再把完整、验证过的 bundle 覆盖至固定位置并正常启动。
不要在已签名 bundle 内替换某个文件，也不要为了更新创建随机 Bundle ID、路径或权限重置脚本。

## 首次迁移与系统权限

旧 ad-hoc 版本的授权可能绑定旧 CDHash。第一次迁移到本机证书是一次身份变更，macOS 可能要求
用户为新身份重新授权。新安装同样由用户按需授权。仅在这种已确认的身份迁移中处理旧授权记录，
不要把删除重加权限或 `tccutil reset` 当作日常构建步骤。

后续应继续使用原证书。自签不是 Developer ID 发行签名，也不承诺绕过 Gatekeeper、设备策略、
系统再次确认或所有 TCC 服务的规则。辅助功能、屏幕录制、输入监控、按目标应用的自动化必须分别
验收。unknown 仍是无法确认，不能伪造为 granted 或武断解释为 denied。

权限窗口保持静默检查、显式请求及请求去重；无法确认时提示签名变化只是一种可能性，反复请求
无法修复旧签名要求失配。启动 preflight 与重新检查的本机诊断日志包含
`OPENDESK_SYSTEM_PERMISSIONS=`：来自当前 App 原生查询的 identity、checkedAt 和各权限状态，
不包含目标窗口、用户输入或任意环境变量，不作为遥测或授权缓存。

## 不同构建的连续性与真实升级验收

```bash
./scripts/check_macos_signing_continuity.sh /absolute/build-A/OpenDesk.app /absolute/build-B/OpenDesk.app
```

检查器要求主程序字节确实不同，验证 A/B 完整签名，然后导出 A 的 designated requirement，
用大写 `codesign --verify -R` 验证 B；对 A 中每个嵌套 Mach-O 同样检查。它拒绝按 CDHash 绑定的
版本要求和缺失 helper；还要求 CodeDirectory 哈希不同，防止仅签名时间变化造成假阳性。
最终签名后二进制摘要位于输出目录的 `opendesk-payload.sha256`，不会把自引用摘要放入密封 bundle。
开发 DR 固定 identifier 和签名证书 leaf 指纹，既适用于自签，也适用于
已有 Apple 证书。小写 `-r` 负责写入/导出要求，大写 `-R` 负责验证外部要求。

签名检查通过之后仍须进行以下现场验收，才能报告某项权限延续：

1. 固定 `/Applications/OpenDesk.app`、`com.opendesk.cli` 与同一签名配置安装 A，正常启动。
2. 从实际 App 的“系统权限”查询，并核对日志 identity.processId 与当前主进程。必要时由用户完成
   首次授权迁移，重启 A 后确认每个目标权限；对需要的能力做获准最小实测。
3. 保存输入、正常退出 A，覆盖完整 B，正常重启。不能借 CLI child、fixture 或另一 App ID 代测。
4. 再从实际 B 查询并实测相应能力，逐项报告 Accessibility / Screen Capture / Input Monitoring。
   记录源版本、二进制哈希、DR、实际 PID、检查时间和关键窗口证据。

仅“已编译”“签名完整”“B 满足 A 要求”“安装成功”不等于权限或视觉验收通过。

## 实验与发行边界

明确用途的 CI/实验构建保留：

```bash
MACOS_SIGNING_MODE=adhoc ./scripts/build_macos_app.sh
MACOS_SIGNING_MODE=unsigned ./scripts/build_macos_app.sh
```

旧的显式 `CODESIGN_IDENTITY=-` / `SKIP_CODESIGN=1` 分别作为这两种模式的兼容入口并输出警告。
它们不具有持续开发授权或发行资格，稳定启动器会拒绝。显式 development/release 模式不能同时
要求跳过签名或使用 `-`。不要给正常开发环境永久设置这些实验变量。

正式独立发行必须明确选择可用的 Developer ID Application 指纹：

```bash
MACOS_SIGNING_MODE=release CODESIGN_IDENTITY=CERTIFICATE_SHA1 ./scripts/build_macos_app.sh
```

该模式要求有效 Developer ID 身份，使用 hardened runtime、timestamp 与 Apple 默认 DR；仍需独立
完成发行所需 entitlement、兼容性、公证和 Gatekeeper 验收。自签本地开发成功不代表正式发行完成。
本轮不要求购买证书、发行公证或 Linux/Windows live 验证。

依据：[Apple Code Signing Tasks](https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/Procedures/Procedures.html)、
[TN2206](https://developer.apple.com/library/archive/technotes/tn2206/)、
[TN3127](https://developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements)、
[TN3161](https://developer.apple.com/documentation/technotes/tn3161-inside-code-signing-certificates)。

## UI Host 嵌套应用身份

当前正式包仅在 `Contents/Helpers/OpenDesk UI.app/Contents/MacOS/opendesk-ui-host`
保存 UI Host；通过原有 exec 与 stdin/stdout 协议启动，不经 LaunchServices、不放置裸 helper 副本或 symlink。
嵌套应用的 Bundle ID 为所属 App ID 加 `.ui-host`，名称与显示名称为所属 App 名称，复制完整
`OpenDesk.icns`，并设置 `LSUIElement=true`。签名顺序为 Mach-O leaf → 嵌套 App → 外层 App，
继续使用已固定证书和证书绑定 DR；后续相同布局升级同时检查嵌套 App 与可执行文件的 DR。

App Builder 接受旧裸 helper 模板；存在嵌套 App 时必须使用完整嵌套模板，派生其 ID、名称和版本，
删除旧裸副本及失效嵌套资源签名，输出仍等待发布者签名。首次从裸 helper 迁移到独立嵌套身份
不等于旧 helper DR 延续；外层 App 身份保持不变，真实权限与 Dock 行为须独立现场验证。
