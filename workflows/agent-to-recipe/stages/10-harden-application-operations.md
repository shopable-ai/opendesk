# S10：应用能力工程化与复用检查

责任 Skill：[application-engineer](../../../prompts/automation/agent-to-recipe/application-engineer/SKILL.md)，harden／repair。依据：[应用开发框架](../../../docs/frameworks/app-development-framework.md)、[Runtime 扩展框架](../../../docs/frameworks/runtime-api-extension-framework.md)。共同规则：[阶段约定](README.md)。

## 输入与进入条件

读取 S9 完整过程及明确缺口、当前 AppProfile、示范证据、API 合同和环境范围。S2 已形成的认识不是自动通过的稳定操作能力。

## 本阶段要做的事

先逐操作检查已有能力是否适用。对真实缺口补充身份／状态检查、目标唯一性、重新定位、当前 bounds 与坐标空间、状态等待、结果读取、验证、有限恢复和失败停止。

优先组合已有公开 API 与普通 JS helper。不得因为 AppProfile 里写了某种能力就假设 Runtime 已支持，也不把单次截图或百分比坐标当成跨布局证明。

声明支持的应用／OS／布局／语言／provider 范围，以及在线服务依赖。验证必须针对真实声明；能力不足时限定范围或阻塞，不能通过更多固定坐标和 sleep 掩盖未知。

没有缺口时，协调者记录引用的适用产物及复用依据，不虚构一次 harden 调用。应用专属知识不进入通用阶段文件或通用 Go 核心。

## 必须保存的输出与消费者

存在改动时交付新版 `app-profile.json`、必要 JS helper、操作验证与限制、依赖版本及 handoff。声明 qualified 的条目必须附实际证据；只做源码审阅不能称为 live 验证。

消费者 [S11](11-build-javascript-recipe.md) 读取确定版本。旧示范仍保留原 AppProfile 引用，不用新版覆盖过去事实；对受影响验证标记 needs-revalidation。

## 通过、阻塞与回退

必要操作在声明范围内可定位、可验证、可安全失败时通过。业务步骤或参数缺失返回 S8／S9；缺示范证据返回 S6；缺系统能力按现有扩展决策报告独立缺口，不把建设新引擎当默认方案。

## 下一阶段与最小验收

进入 S11。检查：必要 helper 不依赖旧窗口句柄／现场坐标；局部修复只使相关下游重验，且不能给未验证平台自动背书。
