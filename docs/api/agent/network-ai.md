---
docType: index
---

# 网络、回调与模型

HTTP 请求、当前 execution 的回调、模型及 CLI Agent

从 [Agent 短入口](README.md) 按任务进入本组；不顺序通读其他组。下表由唯一 Reference/类型确定性生成，不是另一份行为合同。

`node scripts/api-docs.js read <文档名> <方法名>` 返回正文及必要共享段；只读文档，不调用方法。类型中的公开声明不等于当前宿主已授权/已实现。摘要中的省略不用于执行决策。


## http / axios：HTTP 请求

状态、前置权限、平台、错误/等待/取消与副作用按选中正文核对。

来源：[http.md](../http.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `axios.defaults: OpenDeskAxiosConfig;` | 默认配置 | 有：网络/子进程，可能传出数据或产生费用；继承本节限制 | [axios.defaults](../http.md)；`read http axios.defaults` **正文缺口：禁止据类型直接生成调用** |
| `axios.delete<T = unknown>(url: string, config?: OpenDeskAxiosConfig): Promise<OpenDeskAxiosResponse<T>>;` | DELETE | 有：网络/子进程，可能传出数据或产生费用；继承本节限制 | [axios.delete](../http.md#axiosput--axiospatch--axiosdelete修改与删除)；`read http axios.delete` |
| `axios.get<T = unknown>(url: string, config?: OpenDeskAxiosConfig): Promise<OpenDeskAxiosResponse<T>>;` | GET | 有：网络/子进程，可能传出数据或产生费用；继承本节限制 | [axios.get](../http.md#axiosget使用-params)；`read http axios.get` |
| `axios.interceptors: { request: OpenDeskAxiosInterceptorManager<OpenDeskAxiosConfig>; response: OpenDeskAxiosInterceptorManager<OpenDeskAxiosResponse>; };` | 请求拦截器 | 有：网络/子进程，可能传出数据或产生费用；继承本节限制 | [axios.interceptors](../http.md#axiosinterceptors请求与响应拦截器)；`read http axios.interceptors` |
| `axios.patch<T = unknown>(url: string, data?: unknown, config?: OpenDeskAxiosConfig): Promise<OpenDeskAxiosResponse<T>>;` | PATCH | 有：网络/子进程，可能传出数据或产生费用；继承本节限制 | [axios.patch](../http.md#axiosput--axiospatch--axiosdelete修改与删除)；`read http axios.patch` |
| `axios.post<T = unknown>(url: string, data?: unknown, config?: OpenDeskAxiosConfig): Promise<OpenDeskAxiosResponse<T>>;` | POST | 有：网络/子进程，可能传出数据或产生费用；继承本节限制 | [axios.post](../http.md#axiospost提交数据)；`read http axios.post` |
| `axios.put<T = unknown>(url: string, data?: unknown, config?: OpenDeskAxiosConfig): Promise<OpenDeskAxiosResponse<T>>;` | PUT | 有：网络/子进程，可能传出数据或产生费用；继承本节限制 | [axios.put](../http.md#axiosput--axiospatch--axiosdelete修改与删除)；`read http axios.put` |
| `axios.request<T = unknown>(config: OpenDeskAxiosConfig): Promise<OpenDeskAxiosResponse<T>>;` | 任意请求 | 有：网络/子进程，可能传出数据或产生费用；继承本节限制 | [axios.request](../http.md)；`read http axios.request` **正文缺口：禁止据类型直接生成调用** |
| `http.download(url: string, options: OpenDeskHttpDownloadOptions): Promise<OpenDeskHttpDownloadResult>;` | 授权的原生流式 GET 下载到最终文件 | 有：输入/应用或系统状态改变；继承本节限制 | [http.download](../http.md#httpdownloadurl-options原生流式下载)；`read http http.download` |
| `http.get<T = unknown>(url: string, options?: Omit<OpenDeskHttpRequestOptions, "url" \| "method">): Promise<OpenDeskHttpResponse<T>>;` | GET | 有：网络/子进程，可能传出数据或产生费用；继承本节限制 | [http.get](../http.md#httpgeturl-options)；`read http http.get` |
| `http.post<T = unknown>(url: string, data?: unknown, options?: Omit<OpenDeskHttpRequestOptions, "url" \| "method" \| "data">): Promise<OpenDeskHttpResponse<T>>;` | POST | 有：网络/子进程，可能传出数据或产生费用；继承本节限制 | [http.post](../http.md#httpposturl-data-options)；`read http http.post` |
| `http.request<T = unknown>(options: OpenDeskHttpRequestOptions): Promise<OpenDeskHttpResponse<T>>;` | 任意 HTTP 请求 | 有：网络/子进程，可能传出数据或产生费用；继承本节限制 | [http.request](../http.md#httprequestoptions)；`read http http.request` |


## Webhook

状态、前置权限、平台、错误/等待/取消与副作用按选中正文核对。

来源：[webhook.md](../webhook.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `Webhook.listen<TBody = unknown, TResponse = unknown>( name: string, handler: (request: OpenDeskWebhookRequest<TBody>) => OpenDeskWebhookResponse<TResponse> \| Promise<OpenDeskWebhookResponse<TResponse>>, options?: OpenDeskWebhookListenOptions …〔长签名需 read --types〕` | 注册当前 Execution 的本地 POST JSON handler | 等待/订阅；回调副作用由调用方决定，须清理；继承本节限制 | [Webhook.listen](../webhook.md#webhooklistenname-handler-options)；`read webhook Webhook.listen` |
| `handle.close(): void;` | 撤销新调用资格并关闭当前 listener | 需核对正文；不能假定无副作用；继承本节限制 | [handle.close](../webhook.md#handleclose)；`read webhook handle.close` |
| `handle.name: string;` | handle.name；所属能力：Webhook | 需核对正文；不能假定无副作用；继承本节限制 | [handle.name](../webhook.md)；`read webhook handle.name` **正文缺口：禁止据类型直接生成调用** |
| `handle.requestHeaders(): Readonly<Record<string, string>>;` | 取得调用当前入口所需的认证请求头 | 需核对正文；不能假定无副作用；继承本节限制 | [handle.requestHeaders](../webhook.md#handlerequestheaders)；`read webhook handle.requestHeaders` |
| `handle.url: string;` | handle.url；所属能力：Webhook | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [handle.url](../webhook.md)；`read webhook handle.url` 共享整页兜底 |


## LLM

状态、前置权限、平台、错误/等待/取消与副作用按选中正文核对。

来源：[llm.md](../llm.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `LLM.generate<T = string>(options: OpenDeskLLMGenerateOptions): Promise<OpenDeskModelCallResult<T>>;` | 通过选定 HTTP 协议生成文本或严格结构化的 `result.data`。 | 有：网络/子进程，可能传出数据或产生费用；继承本节限制 | [LLM.generate](../llm.md#llmgenerate)；`read llm LLM.generate` |
| `LLM.getCapabilities(options?: {profile?: string}): OpenDeskLLMCapabilities;` | 可选诊断：无副作用查询 Profile 与 HTTP 协议配置状态。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [LLM.getCapabilities](../llm.md#llmgetcapabilities)；`read llm LLM.getCapabilities` |


## Agent

状态、前置权限、平台、错误/等待/取消与副作用按选中正文核对。

来源：[agent.md](../agent.md)。

| 精确方法；主要输入 → 输出（签名） | 解决的问题 | 副作用；适用限制 | 契约获取 |
| --- | --- | --- | --- |
| `Agent.getCapabilities(options?: {backend?: string; profile?: string}): OpenDeskAgentCapabilities;` | 可选诊断：无副作用查询 backend、Profile 与 executable 配置状态。 | 观察/查询；可能读取敏感数据，不等于业务完成；继承本节限制 | [Agent.getCapabilities](../agent.md#agentgetcapabilities)；`read agent Agent.getCapabilities` |
| `Agent.run<T = string>(options: OpenDeskAgentRunOptions): Promise<OpenDeskModelCallResult<T>>;` | 通过选定 CLI 协议执行一次 Agent task 并返回已验证的 `result.data`。 | 有：网络/子进程，可能传出数据或产生费用；继承本节限制 | [Agent.run](../agent.md#agentrun)；`read agent Agent.run` |


## 生成依据

维护命令：`node scripts/api-docs.js generate`；校验：`node scripts/api-docs.js check`。不能手工改本表；修改 canonical 正文/类型后重生成。下面是内容版本，不把旧行号当成当前定位。


- `docs/api/http.md` SHA-256 `1787a2e1e89008b750360ba826caf55cc8b0ef126bd7ba874b547ae71aa2380e`

- `types/http.d.ts` SHA-256 `3aa8e1b99369c7a34abd5ede951ece764982fee90bcca0b15c716e2fe0c93ed6`

- `types/axios.d.ts` SHA-256 `47bd7958e8d37f15066fdaeb69baf0c037445ebc4cb1414b2ff08789f7e8f010`

- `docs/api/webhook.md` SHA-256 `3664261c9938811208b2c6deada80d13243874cb2aa94bf447ad2667121a91c0`

- `types/Webhook.d.ts` SHA-256 `da7fdd867b2745d71f53c9941f51ae840ce95f0843c35c5d2ff8cfc7faeeca2d`

- `docs/api/llm.md` SHA-256 `d1538e663024748150e44887c16b193b2bbb797d749e9cd190d826a2d8c43e28`

- `types/LLM.d.ts` SHA-256 `a3cdd4303dc72da5be674c811dfa2e1469984f2776ddd7a47682da4b09d4af10`

- `docs/api/agent.md` SHA-256 `ad75df70c715d322300df3ac1e2187beb90617352004be8ee48ed285584a1439`

- `types/Agent.d.ts` SHA-256 `4f9097c9613c98679bb6b5c688ba1cfa3e7b6af918e917dcb1482ca529b48428`
