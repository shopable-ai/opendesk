# Clawdesk 用户 API 文档

文档目录：
/Users/a0000/Documents/workspace/clawdesk/docs-user-api

这是当前项目重新整理后的“用户可读 API 文档”入口页。

特点
- 独立于现有 docs-api/
- 以当前源码为准
- 保留旧文档中适合用户查阅的写法
- 明确区分原生 API、polyfill 增强、兼容层

建议阅读顺序
1. index.md
2. page.md
3. input.md
4. window.md
5. vision.md
6. runtime.md
7. cookbook.md
8. 其余专题页

核心页面
- page.md：截图、打开 URL、权限、等待
- input.md：mouse / keyboard / touchscreen
- window.md：窗口信息与窗口控制
- vision.md：OCR、DetectUI、provider capabilities

扩展页面
- runtime.md：legacy / upgraded / playwright 栈与 facade 说明
- cookbook.md：高频可复制脚本范例

专题页面
- screen.md
- system.md
- file.md
- clipboard-console.md
- http.md
- http-server.md
- polyfills.md
- libs.md

快速索引
- Page API: ./page.md
- Input API: ./input.md
- Window API: ./window.md
- Screen API: ./screen.md
- System API: ./system.md
- File API: ./file.md
- Clipboard and Console: ./clipboard-console.md
- HTTP and Axios: ./http.md
- Vision API: ./vision.md
- HTTP Server API: ./http-server.md
- Polyfills: ./polyfills.md
- JS Libraries: ./libs.md
- Runtime Stacks: ./runtime.md
- Cookbook: ./cookbook.md

使用建议
- 写桌面自动化脚本时，优先从 page + window + Vision 三组 API 开始
- 做截图与权限问题排查时，先看 page.md
- 做输入控制时，看 input.md
- 做 HTTP 集成时，看 http.md 和 http-server.md
- 做迁移脚本或 facade 理解时，看 runtime.md
- 想直接抄可运行脚本模板时，看 cookbook.md

说明
- README.md 作为 CLI 文档系统与目录浏览入口
- 更完整的正式入口与分层说明见 index.md
