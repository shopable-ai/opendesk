你现在接手 `clawdesk` 项目的命名收尾与多机同步工作。必须直接执行，不要停在分析。

一、背景与当前状态
- 本地仓库目录已经改为：`/Users/a0000/Documents/workspace/clawdesk`
- 主模块名已改为：`clawdesk`
- 主程序关键 import 已改为 `clawdesk/...`
- MCP server 信息已改为：`clawdesk-mcp` / `Clawdesk MCP Server`
- macOS 稳定二进制/APP 关键脚本已改为 `clawdesk-mac`、`Clawdesk.app`、`com.clawdesk.cli`
- 主程序与 MCP 入口已做过真实编译验证：
  - `go build -o /tmp/clawdesk ./main.go`
  - `go build -o /tmp/clawdesk-mcp ./cmd/clawdesk-mcp`
- `go build ./...` 仍会因为仓库内历史目录 `test/wechat` 存在 mixed packages 问题失败：
  - `found packages main (generate_ground_truth.go) and automation (wechat_visualization_test.go) in /Users/a0000/Documents/workspace/clawdesk/test/wechat`

二、本轮必须继续完成的事情
1. 以新路径 `/Users/a0000/Documents/workspace/clawdesk` 为根，继续搜索并收口残留命名：
   - `testMonkey-go`
   - `testmonkey`
   - `TestMonkey`
   - `com.testmonkey.cli`
   - `dist/TestMonkey.app`
   - `dist/testmonkey-mac`
   - `./testMonkey-go`
2. 但不要做全仓无差别清洗。优先级：
   - 代码 / build / scripts / prompts / active docs / user-facing入口
   - 历史研究报告、旧测试结论文档可保留上下文，不必全部洗掉
3. 重新验证：
   - `go build -o /tmp/clawdesk ./main.go`
   - `go build -o /tmp/clawdesk-mcp ./cmd/clawdesk-mcp`
4. 如果有必要，补一个新的 MCP 入口目录名，例如评估是否把 `cmd/testmonkey-mcp` 改为 `cmd/clawdesk-mcp`
   - 但改之前先检查引用与影响范围
   - 如果要改，必须连带验证可编译
5. 处理远端 `mac4g`：
   - 先验证 `ssh mac4g` 是否恢复可达
   - 若可达，检查远端对应工作区路径与仓库名
   - 在远端同步必要的 `clawdesk` 命名修改
   - 分开报告：SSH reachability、公钥登录是否工作、远端修改是否完成
6. 如果 `mac4g` 仍不可达，不要假装完成。明确记录阻塞，并给出下一次继续时最短路径

三、执行约束
- 当前工作区原本就是脏的，不要回滚用户已有改动
- 只做与命名迁移直接相关的最小修改
- 修改前先读上下文，修改后做真实验证
- 最终输出必须包含：
  - 已修改文件/目录
  - 已验证命令及真实结果
  - 仍残留的旧命名位置（若有）
  - `mac4g` 状态
  - 下一步最小闭环

四、建议先做的命令
- `pwd`
- `git status --short`
- `rg -n "testMonkey-go|testmonkey|TestMonkey|com\.testmonkey\.cli|dist/TestMonkey.app|dist/testmonkey-mac|\./testMonkey-go" /Users/a0000/Documents/workspace/clawdesk`
- `go build -o /tmp/clawdesk ./main.go`
- `go build -o /tmp/clawdesk-mcp ./cmd/testmonkey-mcp`
- `ssh -o BatchMode=yes -o ConnectTimeout=8 mac4g 'hostname && pwd'`
