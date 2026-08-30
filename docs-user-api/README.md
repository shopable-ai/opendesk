---
title: Clawdesk 用户 API 文档
description: Clawdesk 面向脚本作者、自动化使用者与 Agent 的唯一用户 API 文档入口。
order: 1
---

# Clawdesk 用户 API 文档

`docs-user-api/` 是当前仓库唯一维护的用户 API 文档目录。

这里的 Markdown 文件用于直接渲染成人类可读文档；编辑器类型声明与 Agent 索引是同一 API 面的派生物，但不替代 Markdown 文档。

## 事实优先级

发生冲突时按以下顺序判断：

1. 当前源码与运行时行为
2. `docs-user-api/runtime-api.ai.json` 的机器可读索引
3. `docs-user-api/*.md` 用户文档
4. `types/*.d.ts` 编辑器类型声明
5. Git 历史中的旧 TestMonkey 文档

已退役的 `docs-api/`、`docs-api-user/`、`docs/api/`、`dev/api.md` 不再作为当前接口事实源，也不应重新创建为并行 API 文档目录。

## 推荐阅读顺序

1. `index.md`：完整 API 地图与文档导航
2. `page.md`：截图、打开 URL / App、等待、权限
3. `input.md`：鼠标、键盘、触屏
4. `window.md`：窗口查询与控制
5. `vision.md`：OCR、UI 文本定位、provider
6. `image-color.md`：模板匹配、颜色与图像辅助能力
7. `runtime.md`：运行时注入、polyfill、stack/facade
8. `types.md`：VS Code / TypeScript 类型提示与同步规则
9. `cookbook.md`：可直接改造的脚本范例
10. 其余专题页按需查阅

## 文档分层

- **核心桌面自动化**：`page.md`、`input.md`、`window.md`、`screen.md`
- **视觉能力**：`vision.md`、`image-color.md`
- **系统与数据**：`system.md`、`file.md`、`storage.md`、`clipboard-console.md`
- **网络与服务**：`http.md`、`http-server.md`
- **运行时**：`runtime.md`、`polyfills.md`、`libs.md`、`runtime-utilities.md`
- **编辑器类型提示**：`types.md` + 仓库根目录 `types/*.d.ts`
- **机器可读索引**：`runtime-api.ai.json`
- **实践范例**：`cookbook.md`

## 三种消费形式

| 形式 | 位置 | 主要用途 |
| --- | --- | --- |
| 可渲染 Markdown | `docs-user-api/*.md` | 人类阅读、文档站点 |
| Agent API 索引 | `docs-user-api/runtime-api.ai.json` | AI 检索、代码生成约束 |
| TypeScript 声明 | `types/*.d.ts` | VS Code 自动补全、静态签名提示 |

仓库根目录 `jsconfig.json` 用于把 Clawdesk 的 JavaScript 脚本和 `types/*.d.ts` 放进同一编辑器工程。

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
- 新增、删除、改名或改变主要方法签名时，同时检查 Markdown、`runtime-api.ai.json` 与对应 `types/*.d.ts`。
- `.d.ts` 只表达调用签名和返回结构，不复制大段解释；说明性内容写在本目录 Markdown。
- 不在正式文档中写开发者本机绝对路径。
