---
docType: index
---

# 外部入口、计划与分发

现有 CLI/HTTP/MCP、计划、安装和打包；不是 JS 全局对象

从 [Agent 短入口](README.md) 按任务进入本组；不顺序通读其他组。下表由唯一 Reference/类型确定性生成，不是另一份行为合同。

`node scripts/api-docs.js read <文档名> <方法名>` 返回正文及必要共享段；只读文档，不调用方法。类型中的公开声明不等于当前宿主已授权/已实现。摘要中的省略不用于执行决策。


## AI CLI

状态、前置权限、平台、错误/等待/取消与副作用按选中正文核对。

来源：[ai-cli.md](../ai-cli.md)。

| 命令/协议章节 | 完整正文 |
| --- | --- |
| 最快开始 | [读取](../ai-cli.md#最快开始)；`read ai-cli "#最快开始"` |
| JSON output contract | [读取](../ai-cli.md#json-output-contract)；`read ai-cli "#json-output-contract"` |
| ai run 与 -script | [读取](../ai-cli.md#ai-run-与--script)；`read ai-cli "#ai-run-与--script"` |
| odpkg 受保护包执行语义 | [读取](../ai-cli.md#odpkg-受保护包执行语义)；`read ai-cli "#odpkg-受保护包执行语义"` |
| Discover first | [读取](../ai-cli.md#discover-first)；`read ai-cli "#discover-first"` |
| Command tree | [读取](../ai-cli.md#command-tree)；`read ai-cli "#command-tree"` |
| Targeted screenshots and coordinates | [读取](../ai-cli.md#targeted-screenshots-and-coordinates)；`read ai-cli "#targeted-screenshots-and-coordinates"` |
| Deterministic actions | [读取](../ai-cli.md#deterministic-actions)；`read ai-cli "#deterministic-actions"` |
| Vision and image assistance | [读取](../ai-cli.md#vision-and-image-assistance)；`read ai-cli "#vision-and-image-assistance"` |
| Workflows and compatibility recipes: explore once, automate repeatedly | [读取](../ai-cli.md#workflows-and-compatibility-recipes-explore-once-automate-repeatedly)；`read ai-cli "#workflows-and-compatibility-recipes-explore-once-automate-repeatedly"` |
| Progressive Desktop Context policy | [读取](../ai-cli.md#progressive-desktop-context-policy)；`read ai-cli "#progressive-desktop-context-policy"` |


## HTTP server API

状态、前置权限、平台、错误/等待/取消与副作用按选中正文核对。

来源：[http-server.md](../http-server.md)。

| 命令/协议章节 | 完整正文 |
| --- | --- |
| HTTP Server API：接口总表 | [读取](../http-server.md#http-server-api接口总表)；`read http-server "#http-server-api接口总表"` |
| POST /SCRIPT_RUN | [读取](../http-server.md#post-script_run)；`read http-server "#post-script_run"` |
| POST /executions | [读取](../http-server.md#post-executions)；`read http-server "#post-executions"` |
| GET /executions/{id} | [读取](../http-server.md#get-executionsid)；`read http-server "#get-executionsid"` |
| DELETE /executions/{id} | [读取](../http-server.md#delete-executionsid)；`read http-server "#delete-executionsid"` |
| GET /executions/{id}/summary | [读取](../http-server.md#get-executionsidsummary)；`read http-server "#get-executionsidsummary"` |
| GET /executions/{id}/events | [读取](../http-server.md#get-executionsidevents)；`read http-server "#get-executionsidevents"` |
| GET /status | [读取](../http-server.md#get-status)；`read http-server "#get-status"` |
| POST /vision/ocr | [读取](../http-server.md#post-visionocr)；`read http-server "#post-visionocr"` |
| POST /vision/detect-ui | [读取](../http-server.md#post-visiondetect-ui)；`read http-server "#post-visiondetect-ui"` |
| POST /api/accessibility-workbench/v1/launch | [读取](../http-server.md#post-apiaccessibility-workbenchv1launch)；`read http-server "#post-apiaccessibility-workbenchv1launch"` |
| Accessibility Workbench transport contract | [读取](../http-server.md#accessibility-workbench-transport-contract)；`read http-server "#accessibility-workbench-transport-contract"` |
| POST /api/accessibility-inspector/v1/pair | [读取](../http-server.md#post-apiaccessibility-inspectorv1pair)；`read http-server "#post-apiaccessibility-inspectorv1pair"` |
| DELETE /api/accessibility-inspector/v1/authorization | [读取](../http-server.md#delete-apiaccessibility-inspectorv1authorization)；`read http-server "#delete-apiaccessibility-inspectorv1authorization"` |
| GET /api/accessibility-inspector/v1/capabilities | [读取](../http-server.md#get-apiaccessibility-inspectorv1capabilities)；`read http-server "#get-apiaccessibility-inspectorv1capabilities"` |
| GET /api/accessibility-inspector/v1/windows | [读取](../http-server.md#get-apiaccessibility-inspectorv1windows)；`read http-server "#get-apiaccessibility-inspectorv1windows"` |
| POST /api/accessibility-inspector/v1/sessions | [读取](../http-server.md#post-apiaccessibility-inspectorv1sessions)；`read http-server "#post-apiaccessibility-inspectorv1sessions"` |
| GET /api/accessibility-inspector/v1/sessions/{sessionId} | [读取](../http-server.md#get-apiaccessibility-inspectorv1sessionssessionid)；`read http-server "#get-apiaccessibility-inspectorv1sessionssessionid"` |
| DELETE /api/accessibility-inspector/v1/sessions/{sessionId} | [读取](../http-server.md#delete-apiaccessibility-inspectorv1sessionssessionid)；`read http-server "#delete-apiaccessibility-inspectorv1sessionssessionid"` |
| POST /api/accessibility-inspector/v1/sessions/{sessionId}/observations | [读取](../http-server.md#post-apiaccessibility-inspectorv1sessionssessionidobservations)；`read http-server "#post-apiaccessibility-inspectorv1sessionssessionidobservations"` |
| POST /api/accessibility-inspector/v1/sessions/{sessionId}/visual-captures | [读取](../http-server.md#post-apiaccessibility-inspectorv1sessionssessionidvisual-captures)；`read http-server "#post-apiaccessibility-inspectorv1sessionssessionidvisual-captures"` |
| POST /api/accessibility-inspector/v1/sessions/{sessionId}/validate | [读取](../http-server.md#post-apiaccessibility-inspectorv1sessionssessionidvalidate)；`read http-server "#post-apiaccessibility-inspectorv1sessionssessionidvalidate"` |
| PUT /api/accessibility-inspector/v1/sessions/{sessionId}/review | [读取](../http-server.md#put-apiaccessibility-inspectorv1sessionssessionidreview)；`read http-server "#put-apiaccessibility-inspectorv1sessionssessionidreview"` |
| POST /api/accessibility-inspector/v1/sessions/{sessionId}/import | [读取](../http-server.md#post-apiaccessibility-inspectorv1sessionssessionidimport)；`read http-server "#post-apiaccessibility-inspectorv1sessionssessionidimport"` |
| GET /api/accessibility-inspector/v1/sessions/{sessionId}/handoff | [读取](../http-server.md#get-apiaccessibility-inspectorv1sessionssessionidhandoff)；`read http-server "#get-apiaccessibility-inspectorv1sessionssessionidhandoff"` |
| HTTP Server API：stack 兼容参数 | [读取](../http-server.md#http-server-apistack-兼容参数)；`read http-server "#http-server-apistack-兼容参数"` |
| HTTP Server API：错误条件 | [读取](../http-server.md#http-server-api错误条件)；`read http-server "#http-server-api错误条件"` |
| HTTP Server API：使用建议 | [读取](../http-server.md#http-server-api使用建议)；`read http-server "#http-server-api使用建议"` |


## Agent-first Recorder

状态、前置权限、平台、错误/等待/取消与副作用按选中正文核对。

来源：[recorder.md](../recorder.md)。

| 命令/协议章节 | 完整正文 |
| --- | --- |
| Recorder：生命周期工具 | [读取](../recorder.md#recorder生命周期工具)；`read recorder "#recorder生命周期工具"` |
| Recorder：最小 MCP 调用顺序 | [读取](../recorder.md#recorder最小-mcp-调用顺序)；`read recorder "#recorder最小-mcp-调用顺序"` |
| Recorder：确定性回放契约 | [读取](../recorder.md#recorder确定性回放契约)；`read recorder "#recorder确定性回放契约"` |


## Scheduler HTTP API

状态、前置权限、平台、错误/等待/取消与副作用按选中正文核对。

来源：[scheduler-api.md](../scheduler-api.md)。

| 命令/协议章节 | 完整正文 |
| --- | --- |
| 服务地址与 transport 边界 | [读取](../scheduler-api.md#服务地址与-transport-边界)；`read scheduler-api "#服务地址与-transport-边界"` |
| 通用响应 | [读取](../scheduler-api.md#通用响应)；`read scheduler-api "#通用响应"` |
| Job 数据模型 | [读取](../scheduler-api.md#job-数据模型)；`read scheduler-api "#job-数据模型"` |
| JobRun 数据模型 | [读取](../scheduler-api.md#jobrun-数据模型)；`read scheduler-api "#jobrun-数据模型"` |
| 创建任务 | [读取](../scheduler-api.md#创建任务)；`read scheduler-api "#创建任务"` |
| 时间类型 | [读取](../scheduler-api.md#时间类型)；`read scheduler-api "#时间类型"` |
| 列出任务 | [读取](../scheduler-api.md#列出任务)；`read scheduler-api "#列出任务"` |
| 暂停任务 | [读取](../scheduler-api.md#暂停任务)；`read scheduler-api "#暂停任务"` |
| 恢复任务 | [读取](../scheduler-api.md#恢复任务)；`read scheduler-api "#恢复任务"` |
| 立即运行 | [读取](../scheduler-api.md#立即运行)；`read scheduler-api "#立即运行"` |
| 查询运行记录 | [读取](../scheduler-api.md#查询运行记录)；`read scheduler-api "#查询运行记录"` |
| 删除任务 | [读取](../scheduler-api.md#删除任务)；`read scheduler-api "#删除任务"` |
| 与桌面计划中心和 CLI 的关系 | [读取](../scheduler-api.md#与桌面计划中心和-cli-的关系)；`read scheduler-api "#与桌面计划中心和-cli-的关系"` |


## Scheduler CLI

状态、前置权限、平台、错误/等待/取消与副作用按选中正文核对。

来源：[scheduler-cli.md](../scheduler-cli.md)。

| 命令/协议章节 | 完整正文 |
| --- | --- |
| 调用形式 | [读取](../scheduler-cli.md#调用形式)；`read scheduler-cli "#调用形式"` |
| scheduler create | [读取](../scheduler-cli.md#scheduler-create)；`read scheduler-cli "#scheduler-create"` |
| scheduler list | [读取](../scheduler-cli.md#scheduler-list)；`read scheduler-cli "#scheduler-list"` |
| scheduler runs | [读取](../scheduler-cli.md#scheduler-runs)；`read scheduler-cli "#scheduler-runs"` |
| scheduler delete | [读取](../scheduler-cli.md#scheduler-delete)；`read scheduler-cli "#scheduler-delete"` |
| scheduler test add | [读取](../scheduler-cli.md#scheduler-test-add)；`read scheduler-cli "#scheduler-test-add"` |
| scheduler test verify | [读取](../scheduler-cli.md#scheduler-test-verify)；`read scheduler-cli "#scheduler-test-verify"` |
| scheduler test remove | [读取](../scheduler-cli.md#scheduler-test-remove)；`read scheduler-cli "#scheduler-test-remove"` |
| Runtime examples | [读取](../scheduler-cli.md#runtime-examples)；`read scheduler-cli "#runtime-examples"` |
| 安全与生命周期边界 | [读取](../scheduler-cli.md#安全与生命周期边界)；`read scheduler-cli "#安全与生命周期边界"` |


## Flow CLI

状态、前置权限、平台、错误/等待/取消与副作用按选中正文核对。

来源：[flow-cli.md](../flow-cli.md)。

| 命令/协议章节 | 完整正文 |
| --- | --- |
| opendesk flow pack | [读取](../flow-cli.md#opendesk-flow-pack)；`read flow-cli "#opendesk-flow-pack"` |
| opendesk flow inspect | [读取](../flow-cli.md#opendesk-flow-inspect)；`read flow-cli "#opendesk-flow-inspect"` |
| opendesk flow verify | [读取](../flow-cli.md#opendesk-flow-verify)；`read flow-cli "#opendesk-flow-verify"` |
| opendesk flow install | [读取](../flow-cli.md#opendesk-flow-install)；`read flow-cli "#opendesk-flow-install"` |
| opendesk flow list | [读取](../flow-cli.md#opendesk-flow-list)；`read flow-cli "#opendesk-flow-list"` |
| opendesk flow run | [读取](../flow-cli.md#opendesk-flow-run)；`read flow-cli "#opendesk-flow-run"` |
| opendesk flow uninstall | [读取](../flow-cli.md#opendesk-flow-uninstall)；`read flow-cli "#opendesk-flow-uninstall"` |


## App Package CLI

状态、前置权限、平台、错误/等待/取消与副作用按选中正文核对。

来源：[app-package-cli.md](../app-package-cli.md)。

| 命令/协议章节 | 完整正文 |
| --- | --- |
| API 一览 | [读取](../app-package-cli.md#api-一览)；`read app-package-cli "#api-一览"` |
| 公共约定 | [读取](../app-package-cli.md#公共约定)；`read app-package-cli "#公共约定"` |
| opendesk app validate | [读取](../app-package-cli.md#opendesk-app-validate)；`read app-package-cli "#opendesk-app-validate"` |
| opendesk app doctor | [读取](../app-package-cli.md#opendesk-app-doctor)；`read app-package-cli "#opendesk-app-doctor"` |
| opendesk app build | [读取](../app-package-cli.md#opendesk-app-build)；`read app-package-cli "#opendesk-app-build"` |
| OpenDesk 源码维护者 | [读取](../app-package-cli.md#opendesk-源码维护者)；`read app-package-cli "#opendesk-源码维护者"` |
| App Mode 与受保护包边界 | [读取](../app-package-cli.md#app-mode-与受保护包边界)；`read app-package-cli "#app-mode-与受保护包边界"` |
| JSON Schema association | [读取](../app-package-cli.md#json-schema-association)；`read app-package-cli "#json-schema-association"` |


## 受保护包 CLI

状态、前置权限、平台、错误/等待/取消与副作用按选中正文核对。

来源：[protected-packages.md](../protected-packages.md)。

| 命令/协议章节 | 完整正文 |
| --- | --- |
| 术语与职责 | [读取](../protected-packages.md#术语与职责)；`read protected-packages "#术语与职责"` |
| API 一览 | [读取](../protected-packages.md#api-一览)；`read protected-packages "#api-一览"` |
| 公共约定 | [读取](../protected-packages.md#公共约定)；`read protected-packages "#公共约定"` |
| opendesk package protect | [读取](../protected-packages.md#opendesk-package-protect)；`read protected-packages "#opendesk-package-protect"` |
| opendesk package inspect | [读取](../protected-packages.md#opendesk-package-inspect)；`read protected-packages "#opendesk-package-inspect"` |
| opendesk package verify | [读取](../protected-packages.md#opendesk-package-verify)；`read protected-packages "#opendesk-package-verify"` |
| opendesk license device | [读取](../protected-packages.md#opendesk-license-device)；`read protected-packages "#opendesk-license-device"` |
| opendesk license issue | [读取](../protected-packages.md#opendesk-license-issue)；`read protected-packages "#opendesk-license-issue"` |
| opendesk license inspect | [读取](../protected-packages.md#opendesk-license-inspect)；`read protected-packages "#opendesk-license-inspect"` |
| opendesk license verify | [读取](../protected-packages.md#opendesk-license-verify)；`read protected-packages "#opendesk-license-verify"` |
| opendesk license install | [读取](../protected-packages.md#opendesk-license-install)；`read protected-packages "#opendesk-license-install"` |
| opendesk license activate | [读取](../protected-packages.md#opendesk-license-activate)；`read protected-packages "#opendesk-license-activate"` |
| opendesk license status | [读取](../protected-packages.md#opendesk-license-status)；`read protected-packages "#opendesk-license-status"` |
| opendesk license refresh | [读取](../protected-packages.md#opendesk-license-refresh)；`read protected-packages "#opendesk-license-refresh"` |
| opendesk license deactivate | [读取](../protected-packages.md#opendesk-license-deactivate)；`read protected-packages "#opendesk-license-deactivate"` |
| 执行受保护包 | [读取](../protected-packages.md#执行受保护包)；`read protected-packages "#执行受保护包"` |
| 开发验证 | [读取](../protected-packages.md#开发验证)；`read protected-packages "#开发验证"` |
| 错误 | [读取](../protected-packages.md#错误)；`read protected-packages "#错误"` |
| 安全约束 | [读取](../protected-packages.md#安全约束)；`read protected-packages "#安全约束"` |
| 平台与能力 | [读取](../protected-packages.md#平台与能力)；`read protected-packages "#平台与能力"` |
| 内部与参考实现边界 | [读取](../protected-packages.md#内部与参考实现边界)；`read protected-packages "#内部与参考实现边界"` |


## 生成依据

维护命令：`node scripts/api-docs.js generate`；校验：`node scripts/api-docs.js check`。不能手工改本表；修改 canonical 正文/类型后重生成。下面是内容版本，不把旧行号当成当前定位。


- `docs/api/ai-cli.md` SHA-256 `da5bb15c0d9df8e85eaa656dff05d19ecf60514e3dff459e28be418b3d9217a4`

- `docs/api/http-server.md` SHA-256 `a88ec56dab863b0fa5b95953a8f84a840676966ccc2646e5c7dfa6b806326718`

- `docs/api/recorder.md` SHA-256 `3ec590e2781568296d21a8db5a19106ff8510f5a8713af074826b53001493f1f`

- `docs/api/scheduler-api.md` SHA-256 `e4767fc76423e0fbb92276e6920a8898c42c60e1519e2638fb988547f7e62a89`

- `docs/api/scheduler-cli.md` SHA-256 `9a853482eb5a1dd53952636f2f0d2bf793283ec28120248c9583f30d7eda6aa4`

- `docs/api/flow-cli.md` SHA-256 `9ed1083d9dcb26801253e28a56abb44644548f9ac52b35fd3166d302d59e1da1`

- `docs/api/app-package-cli.md` SHA-256 `ef72b967db1ddfe8c6a7fa73b9133a5a6c7fa66e940b2c8e2d2b9b3b5731c63e`

- `docs/api/protected-packages.md` SHA-256 `b49462ac7f978ea37fbaabcde6a63a89232bf1b516f50e6a5ffc7bd36f89a3fb`
