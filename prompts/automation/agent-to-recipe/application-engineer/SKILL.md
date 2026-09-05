---
name: application-engineer
description: 根据当前业务任务建立或补强 OpenDesk 应用知识、定位与验证方法，交付 AppProfile 和必要 JS helper。支持 discover、harden、repair，不代替整个业务示范。
---

# 应用工程

## 入口与依据

对应方法 S2／S10。`discover` 只建立完成下一步所需的最小认识；`harden` 将已确认业务所需操作变成可重复的方法；`repair` 处理指定失效假设。不得因选择 harden 就自动把全部条目标为 qualified。

先读[共享合同](../../../../docs/frameworks/agent-to-recipe-skill-contract.md)和 [AGENTS.md](../../../../AGENTS.md)。专业依据是[应用开发框架](../../../../docs/frameworks/app-development-framework.md)，定位与 API 按当前 [API 文档](../../../../docs/api/README.md)核对。应用框架中的业务目标继承父合同，测试结果汇入父任务，不重复开展另一套完整项目。

## 输入

共享 `request.json`；TaskContract；当前所需的应用操作／工作包；已有 AppProfile 和实际观察；harden 还要已提炼过程，repair 还要失败证据。接触桌面前需要本次授权和操作拥有权。资料不足可返回定向观察请求，不凭空填 profile。

## 工作方法

1. 核对实际 OS、入口、构建来源、应用身份、账号／文档上下文、窗口、权限和必要 provider。不要从 MCP 工具名字推断同名 JS API 已存在。
2. 复用仍有效的知识；只观察当前任务相关页面、状态、区域和目标，不分析应用的所有功能。
3. 对观察结果分别标记事实、解释和假设。优先适用的低成本结构信号；必要时使用图色、OCR／Vision。所有动作点必须有当次可解释来源。
4. 为所需 operation 明确输入输出、前后条件、定位唯一性、Geometry 坐标来源、状态等待、结果读取、失败和停止策略。
5. 可复用的是规则，不是旧 windowId、焦点、截图或绝对坐标。相对坐标同样需要布局／尺寸／缩放等适用性验证；不支持的状态停止或经获准的安全准备后重查。
6. discover 输出最小资料即可；harden／repair 用获准的针对性场景验证真实缺口。不要强迫进行未获授权的 UI 测试、环境修改或系统权限重置。
7. 仅当普通公开 API 组合不足时，按[扩展框架](../../../../docs/frameworks/runtime-api-extension-framework.md)报告能力缺口，不顺手修改 Go、安装服务或增加应用专用核心 API。

## 必须保存的输出

`app-profile.json` 按共享字段，至少包含应用／环境范围、状态、区域、目标、Geometry 规则、operations、verifiers、局限、证据及条目成熟度。每个被后续使用的结论可追溯到证据或显式假设。

harden／repair 必要时交付普通 JS helper 片段及其接口、依赖和已测范围；不假设模块加载或新全局对象。输出新版本并给出受影响条目，不能覆盖旧事实。最后发布 `handoff.json`。

消费者：示范 Skill 读取可操作的最小资料；生成 Skill 读取所需规则／helper。两者都须在动作前确认现场，不能把 profile 当活的 UI 对象。

## Gate 与失败

复用 G0—G5 中实际适用项。定位歧义、未知来源坐标、错误窗口／账号、缺权限、provider 不可用或无法证明后置条件时不放行依赖动作。诊断按 F0—F6 等实际分类；资料缺失 F7。不能把观察型 AppProfile 的 pass 解读为所有 operation 均通过真机验证。

## 最小独立验收

给新 Agent 所需操作及 AppProfile，能够说明怎样重新定位和验证；改变窗口或超出布局范围时要求新观察／停止，而不是继续用旧坐标。新知识只能在范围和证据审查后复用，不自动写回共享 Skill。
