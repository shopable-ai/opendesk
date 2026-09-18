# Flow Marketplace HTML 原型

状态：**可运行交互原型，待用户确认；不是生产 Marketplace。**

入口：[index.html](index.html)  
交互与后续实施合同：[ORACLE.md](ORACLE.md)

## 打开

`index.html` 是自包含 HTML，CSS、图标、示例数据和脚本均内置；无 CDN、构建步骤或真实网络依赖。

从仓库根目录，在 macOS 可直接打开：

```bash
open apps/opendesk/prototypes/marketplace/index.html
```

也可以用浏览器打开该文件，或从仓库根目录运行本地静态服务：

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory apps/opendesk/prototypes/marketplace
```

然后访问 `http://127.0.0.1:8765/`。静态服务不是 Marketplace Backend。

## 可以体验什么

| 页面 / 环节 | 可操作内容 |
| --- | --- |
| 市场首页 | 六个示例 Flow；关键词、分类、系统、价格、排序与空状态 |
| 侧栏帮助区 | 桌面端贴底、无 Card、图标与标题同行；窄屏改为普通文档流紧凑帮助行 |
| Flow 详情 | 概览、使用说明、版本记录、权限、发布者、兼容系统与价格示意 |
| 网页交接 | ID-only Install Intent 展示、未装客户端、未收到唤起确认、手动安装说明 |
| 桌面安装预览 | 具体版本确认、权限确认、模拟付费授权、校验、Flow / Publisher 信任范围 |
| 本机演示 | 安装与运行分离；明确确认后模拟运行；移除记录 |
| 更新 / 故障 | 新增权限重新确认；断网、签名或摘要失败、Release 撤回、事务失败与取消 |

建议体验：选择「文件自动整理」→ 查看详情 → 安装到 OpenDesk → 演示桌面确认 → 同意本次权限 → 确认安装 → 仅批准此 Flow → 在 Flow Runner 中查看。此时模拟运行次数必须为 **0**。

右上角「演示设置」可切换故障与演示系统。设置仅作用于下一次安装，不检测真实设备。更新案例会明确载入一条旧版模拟记录。

## 安全与实现边界

- 不调用真实 Marketplace API，不注册或打开 `opendesk://`，不连接 OpenDesk Runtime。
- 不提供无效 `.odflow` 下载来伪装安装成功；不接收上传，不创建订单、不扣费。
- 数据、发布者身份、签名 Key ID、版本、系统要求与价格全部为 fixture。市场验证不自动产生本地信任。
- 原型仅用内存 / `localStorage` key `opendesk.marketplace.prototype.v1` 保存模拟状态；存储不可用时降级为内存，不清除其他网站数据。
- 签名、digest、entitlement、transaction 状态是模拟结果，不是安全验证实现。权限说明也不是 Runtime 强制沙箱的实现证明。
- 购买、安装、运行始终独立。真实产品中的授权与 Trust 必须由现有 owner 决策，不使用这个前端模型替代。
- 未改动 `configs/product.json`、官方 URL、生成 `.odcfg`、发行资源或现有安装安全内核。

## 测试

在仓库根目录运行纯模型测试，依赖 Node.js 自带的 test runner：

```bash
node --test tests/prototypes/marketplace.test.cjs
```

浏览器检查需要 Python、Playwright 和 Chromium。已有这些依赖时，在仓库根目录执行：

```bash
python tests/prototypes/marketplace-smoke.py
```

可使用 `--browser-executable /path/to/chromium` 指定现有 Chromium。测试只启动静态服务和浏览器，不启动 OpenDesk。

运行证据写入 `.runtime/tests/marketplace-prototype/`，不提交运行截图或日志。

v1.1 已重新完成真实资格：Flow Commercial Qualification run `35300159654` 的 `Marketplace prototype` job 中，29 项模型/静态合同通过，Chromium DOM 交互 smoke 通过；响应式检查覆盖 320 / 390 / 768 / 1280 像素，并验证帮助区桌面贴底、帮助区自身四边 `margin = 0`、去 Card、图标标题同行以及移动端非 fixed。运行证据由 CI 上传为 `marketplace-prototype-evidence`。

当前执行环境的浏览器策略阻止 `file://` 和本地 HTTP 导航，因此本轮浏览器命令为：

```bash
python tests/prototypes/marketplace-smoke.py --set-content --browser-executable /usr/bin/chromium
```

该模式将同一 HTML 字节内容载入 Chromium DOM 后实际点击、检查和截图，**不证明本地 URL 导航、文件双击打开或浏览器持久存储端到端通过**。持久存储逻辑单独由模型测试验证。当前 v1.1 smoke 已通过，但仍不能替代 macOS / Windows Native UI、真实下载、支付、OS 唤起或签名校验。
