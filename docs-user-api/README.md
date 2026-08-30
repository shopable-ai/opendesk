---
title: Clawdesk 用户 API 文档
description: Clawdesk 面向脚本作者、自动化使用者与 Agent 的唯一用户 API 文档入口。
order: 1
---

# Clawdesk 用户 API 文档

`docs-user-api/` 是当前仓库唯一维护、并直接用于渲染的用户 API 文档目录。

这里的 Markdown 面向最终使用者；机器索引和编辑器类型只是同一 API 面的派生辅助，不应再各自形成一套说明文档。

## 事实优先级

发生冲突时按以下顺序判断：

1. 当前源码与实际 Runtime 行为
2. `docs-user-api/*.md` 正式可渲染用户文档
3. `docs-user-api/runtime-api.ai.json` Agent 机器索引
4. `types/*.d.ts` 编辑器类型声明
5. Git 历史

已退役的 `docs-api/`、`docs-api-user/`、`docs/api/`、`dev/api.md` 不再作为当前接口事实源，也不应重新创建为并行 API 文档目录。

## 推荐阅读顺序

1. `index.md`：完整 API 地图与文档导航
2. `page.md`：截图、打开 URL / App、等待、权限
3. `input.md`：鼠标、键盘、触屏
4. `window.md`：窗口查询与控制
5. `vision.md`：OCR、UI 文本定位、provider
6. `image-color.md`：模板匹配、颜色与图像辅助能力
7. `runtime.md`：运行时注入、polyfill、stack/facade
8. `cookbook.md`：可直接改造的脚本范例
9. 其余专题页按需查阅

## 文档分层

- **核心桌面自动化**：`page.md`、`input.md`、`window.md`、`screen.md`
- **视觉能力**：`vision.md`、`image-color.md`
- **系统与数据**：`system.md`、`file.md`、`storage.md`、`clipboard-console.md`
- **网络与服务**：`http.md`、`http-server.md`
- **运行时**：`runtime.md`、`polyfills.md`、`libs.md`、`runtime-utilities.md`
- **实践范例**：`cookbook.md`

## 配套的非渲染资产

用户文档之外还维护两类辅助资产：

| 位置 | 用途 |
| --- | --- |
| `docs-user-api/runtime-api.ai.json` | Agent 的机器可读对象地图与文档路由 |
| `types/*.d.ts` + `jsconfig.json` | VS Code / TypeScript 自动补全、参数和返回值提示 |

`types/*.d.ts` 不承担教程、平台行为、架构解释和历史迁移说明；这些内容应写进对应 API Markdown。

## API 状态约定

- **Stable**：当前主要用户入口，优先用于新脚本。
- **Secondary**：当前真实可用，但不是主链路能力。
- **Compatibility**：为历史调用或迁移保留，不代表完整第三方 API 兼容。
- **Experimental**：存在实现，但依赖、平台行为或长期稳定性尚未完全收口。
- **Conditional**：只有满足运行时条件时才注入。

## 维护原则

- 以“用户最终能调用什么”为主，不把源码内部对象全部暴露成推荐 API。
- 原生 Go API、polyfill、facade 必须明确区分。
- 示例优先采用当前稳定入口。
- 任何用户可见 API 的新增、删除、改名、参数或返回值变化，都必须同步检查对应 Markdown、`runtime-api.ai.json` 与 `types/*.d.ts`。
- Markdown 负责可渲染说明；JSON 负责 Agent 路由；`.d.ts` 负责编辑器签名，三者不要互相复制长篇内容。
- 不在正式文档中写开发者本机绝对路径。
