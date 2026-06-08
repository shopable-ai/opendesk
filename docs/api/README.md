# TestMonkey API Docs

这个目录放两份文档：

- `runtime-api.ai.json`
  - AI 优先的结构化接口清单。
  - 适合作为提示词上下文、代码生成约束、后续自动生成其他格式文档的源数据。
- `runtime-api.md`
  - 给人直接阅读的说明文档。
  - 重点解释对象用途、常见参数、返回值和推荐调用方式。

当前文档覆盖两类接口：

- JavaScript 运行时 API
  - 通过 `go run main.go -script xxx.js` 或固定二进制/App 运行。
  - 这是框架的主接口层，也是 AI 生成脚本时最应该使用的接口。
- HTTP Server API
  - 通过 `go run main.go -http` 暴露。
  - 适合远程触发脚本和 OCR/UI 识别服务。

建议约定：

- 以后新增/删除 JS 全局对象或方法时，先更新 `runtime-api.ai.json`。
- `runtime-api.md` 作为人工阅读版，允许在不改变语义的前提下做更友好的重组和解释。
- 如需继续自动化，可基于 `runtime-api.ai.json` 生成 Markdown、HTML、网页文档或给 AI 作为 schema 输入。
