---
docType: index
---

# 网页 DOM 与 Browser

在已授权网站和 Tab 内通过已安装 Core 观察、语义定位、读取、操作和验证

从 [Agent 短入口](README.md) 按任务进入本组；不顺序通读其他组。下表由唯一 Reference/类型确定性生成，不是另一份行为合同。

`node scripts/api-docs.js read <文档名> <方法名>` 返回正文及必要共享段；只读文档，不调用方法。类型中的公开声明不等于当前宿主已授权/已实现。摘要中的省略不用于执行决策。


## BrowserDOM

状态、前置权限、平台、错误/等待/取消与副作用按选中正文核对。

来源：[browser-dom.md](../browser-dom.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `BrowserDOM.act(args: { operation: 'fill' \| 'click'; target: Record<string, any>; value?: string; sourceReadRequestId?: string; timeoutMs?: number }): BrowserDOMResponse;` | fill 或 click | 需核对正文；不能假定无副作用；继承本节限制 | [BrowserDOM.act](../browser-dom.md#browserdomactargs)；`read browser-dom BrowserDOM.act` |
| `BrowserDOM.close(): void;` | 关闭本 execution 的 Client | 需核对正文；不能假定无副作用；继承本节限制 | [BrowserDOM.close](../browser-dom.md#browserdomclose)；`read browser-dom BrowserDOM.close` |
| `BrowserDOM.locate(args: { scope: BrowserDOMScope; query: BrowserDOMQuery; timeoutMs?: number }): BrowserDOMResponse;` | 唯一语义定位 | 需核对正文；不能假定无副作用；继承本节限制 | [BrowserDOM.locate](../browser-dom.md#browserdomlocateargs)；`read browser-dom BrowserDOM.locate` |
| `BrowserDOM.observe(args: { scope: BrowserDOMScope; timeoutMs?: number }): BrowserDOMResponse;` | 观察当前有限 DOM | 需核对正文；不能假定无副作用；继承本节限制 | [BrowserDOM.observe](../browser-dom.md#browserdomobserveargs)；`read browser-dom BrowserDOM.observe` |
| `BrowserDOM.read(args: { target: Record<string, any>; field: 'text' \| 'value'; timeoutMs?: number }): BrowserDOMResponse;` | 读取本次 DOM 实值 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [BrowserDOM.read](../browser-dom.md#browserdomreadargs)；`read browser-dom BrowserDOM.read` |
| `BrowserDOM.status(): BrowserDOMResponse;` | 连接、session、资源诊断 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [BrowserDOM.status](../browser-dom.md#browserdomstatus)；`read browser-dom BrowserDOM.status` |
| `BrowserDOM.tabs(): BrowserDOMResponse;` | 已授权网站的真实 Tab 列表 | 需核对正文；不能假定无副作用；继承本节限制 | [BrowserDOM.tabs](../browser-dom.md#browserdomtabs)；`read browser-dom BrowserDOM.tabs` |
| `BrowserDOM.verify(args: { target: Record<string, any>; condition: BrowserDOMCondition; timeoutMs?: number }): BrowserDOMResponse;` | 独立 DOM 后置验证 | 需核对正文；不能假定无副作用；继承本节限制 | [BrowserDOM.verify](../browser-dom.md#browserdomverifyargs)；`read browser-dom BrowserDOM.verify` |
| `BrowserDOM.wait(args: { target: Record<string, any>; condition: BrowserDOMCondition; timeoutMs?: number }): BrowserDOMResponse;` | 有界等待 DOM 条件 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [BrowserDOM.wait](../browser-dom.md#browserdomwaitargs)；`read browser-dom BrowserDOM.wait` |


## 生成依据

维护命令：`node scripts/api-docs.js generate`；校验：`node scripts/api-docs.js check`。不能手工改本表；修改 canonical 正文/类型后重生成。下面是内容版本，不把旧行号当成当前定位。


- `docs/api/browser-dom.md` SHA-256 `e7c35039f7e5850aaaa65b0626ba9bce8be77bb239c5e0236eaf019c94025a66`

- `types/BrowserDOM.d.ts` SHA-256 `0ce26c0fb372daaabe7ac466dac44de91c98defb618b172144def0bc20eba286`
