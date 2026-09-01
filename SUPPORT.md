# OpenDesk 支持与定制

本页是 OpenDesk 的统一支持与定制入口。

如果只是想组合已有能力，请先阅读：

- `docs/api/custom-api.md`：只使用现有 JavaScript API 自助扩展。
- `docs/api/index.md`：当前公开 API 地图。

## 先判断你的需求属于哪一类

```text
使用问题 / Bug
→ 先提供复现步骤、平台、版本和 Evidence

已有 API 的组合需求
→ JavaScript 自助扩展

已有外部服务或模型能力
→ HTTP / MCP 集成

必须新增 OS / Native / Go Runtime 能力
→ 源码级扩展或作者 / 维护者定制

企业内部软件、专有系统或长期自动化方案
→ 企业 / 商业定制
```

## JavaScript 自助扩展

适合：

- 默认参数。
- 参数校验。
- 多 API 组合。
- helper / adapter。
- 轻量 Polyfill。

这类需求通常不需要修改 Go Runtime，也不需要定制构建。

详见：

`docs/api/custom-api.md`

## HTTP / MCP 集成

如果目标能力已经存在于：

- Python / Node.js 服务。
- 模型服务。
- 数据库。
- 企业内部 API。
- 独立 Agent / Workflow 服务。

优先通过 HTTP 或 MCP 集成，而不是把所有依赖编译进 OpenDesk。

## 原生能力与定制构建

以下需求通常需要源码级 Native / Go 扩展：

- 新的 Windows / macOS / Linux 原生能力。
- 新设备、驱动或底层 SDK。
- 新权限模型。
- 原生性能或资源控制。
- 新 Runtime API。
- 需要 CLI / HTTP / MCP 共享的新核心能力。

如果你拥有对应源码和构建权限，可以由维护者按照 `docs/frameworks/runtime-api-extension-framework.md` 进行扩展。

如果你只有二进制发行版、没有源码权限，或者希望得到正式支持的构建，请联系 OpenDesk 项目作者 / 维护者提出定制需求。

## 可提供的定制类型

典型方向包括：

- Native API 定制。
- 企业内部软件 Adapter。
- 微信、千牛或其他桌面软件业务自动化。
- Workflow / Skill 开发。
- MCP Tool / Server 集成。
- HTTP API 集成。
- OCR / Vision / 模型 provider 集成。
- 私有模型或 Agent 集成。
- 长期运行、Checkpoint、恢复和可靠性工程。
- 私有发行包 / 定制构建。
- 部署、升级和维护支持。

具体是否适合进入 OpenDesk 核心、做成外置服务或保持客户私有，由需求评估后决定。

## 提交定制需求时请提供

为了更快判断技术方案、工作量和验收方式，建议至少提供：

```text
1. 业务目标
2. 操作系统与版本
3. 目标应用与版本
4. 输入
5. 期望输出
6. 当前已有 API 为什么不能完成
7. 是否需要长期运行
8. 权限 / 安全 / 数据约束
9. 失败成本
10. 验收条件
11. 期望部署方式
12. 是否允许通用部分回馈 OpenDesk 核心
```

截图、日志、测试页面、样例输入和失败 Evidence 会显著提高评估准确度。

## 商业定制交付流程

建议采用标准流程，而不是直接从一句需求开始写代码：

```text
需求提交
→ 技术分层判断
→ 方案与边界确认
→ 验收条件确认
→ 报价 / 排期（如适用）
→ 实现
→ 测试与 Evidence
→ 定制构建 / Adapter / Service 交付
→ 后续维护
```

可能的交付形态包括：

```text
JavaScript 扩展
HTTP / MCP Service
Native API
App Adapter
Workflow / Skill
定制二进制
部署包
测试与 Evidence 报告
维护支持
```

## 核心与客户私有能力的边界

默认原则：

```text
通用、低风险、可长期维护的底层能力
→ 可考虑进入 OpenDesk 核心

客户专有业务规则、内部系统逻辑
→ 保持私有 Adapter / Workflow

密钥、账号、客户数据和敏感配置
→ 不进入核心仓库
```

商业定制不应通过复制一套独立 Runtime 破坏核心架构；能复用的部分仍应遵循统一 Runtime、API、测试和 Evidence 规则。

## 如何联系

请优先使用你获取 OpenDesk 时对应的**官方项目 / 产品联系渠道**联系项目作者或维护者，并附上上面的定制需求信息。

如果你本身拥有本仓库访问权限，可以通过仓库协作渠道提交问题或定制需求。

未来如果建立统一官网、商务邮箱、Issue 模板、GitHub Discussions 或工单系统，只需要在本页更新正式入口；其他文档统一链接 `SUPPORT.md`，不要在多个页面散落私人邮箱、微信号或临时联系方式。
