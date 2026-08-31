# Problem Definition / Round 1

目标不是做一套一次性微信脚本，而是建立一套：

- 可持续开发
- 可测试
- 可回放
- 可纠偏
- 可长期迭代

的微信自动化视觉识别与恢复框架。

## Round 1 只解决三件事

1. 明确主线方案与边界
2. 建立 preflight / evidence / replay / taxonomy / gate 基线
3. 规划最小闭环：`capture -> detect -> mirror -> compare`

## Round 1 不解决

- 完整自动发送闭环
- 多场景泛化
- 重型控制面平台
