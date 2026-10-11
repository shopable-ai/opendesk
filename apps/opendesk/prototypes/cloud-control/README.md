# Cloud Control R0.2 多端原型

入口：[index.html](index.html)（在本地浏览器打开）。

这是一份**多端产品架构与操作信息布局**的静态 HTML/CSS/JS 交互原型，包含 Browser、Desktop、Mobile 端卡片、统一任务处理过程、托管开关、默认/自定义提供者与授权范围的示意交互。

- 归属：OpenDesk **多端总体框架**的产品演示，不是只属于 Browser 扩展的 Side Panel。
- 所有互动**仅改变当前网页的演示状态**；没有网络请求、身份凭据存储、真实配对、Socket 连接或任务执行。
- 页面中的服务器 URL 属于示例，绝不是已经存在的 OpenDesk 官方服务器。
- Browser R1 真正的 UI 应嵌入“我的任务”和现有设置入口，不应复制这个大屏为新的云控工作台。
- Mobile 只是规划的第三类端，不代表 Android/iOS 应用已实现。
- 唯一总体设计入口：[Execution Control R0.2](../../../../docs/architecture/execution-control-r02.zh-CN.md)。真正上线前必须复核文档、当前源码与用户授权。

静态验证：直接打开文件，切换端类型、提供者模式和示意托管开关。此页面不依赖 Node、网络或外部 CDN。
