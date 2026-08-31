你现在接手 `clawdesk` 仓库的“改名收尾 + 提交准备 + 局域网 origin 对齐 + GitHub 迁移准备”工作。不要停在分析，直接执行。

一、当前真实状态
- 本地工作区路径：`/Users/a0000/Documents/workspace/clawdesk`
- 远端工作区路径：`/Users/mac/Documents/workspace/clawdesk`
- 两边当前分支：`master`
- 两边当前 HEAD 一致：`561b0476ae728c893b6f644ab97c9164a9a313a8`
- 本地主程序与 MCP 入口已验证可编译：
  - `go build -o /tmp/clawdesk ./main.go`
  - `go build -o /tmp/clawdesk-mcp ./cmd/clawdesk-mcp`
- `go build ./...` 仍会被历史目录 `test/wechat` 的 mixed packages 问题挡住，这不是本轮改名引入的新问题
- 当前电脑已被配置成局域网 Git 源：
  - bare repo: `/Users/a0000/Documents/git-remotes/clawdesk.git`
- 本地 `origin`：
  - `/Users/a0000/Documents/git-remotes/clawdesk.git`
- `mac4g` 的 `origin`：
  - `clawdesk-lan:/Users/a0000/Documents/git-remotes/clawdesk.git`
- `mac4g` 已配置 SSH alias `clawdesk-lan` 指向当前电脑 `192.168.200.250`
- 但目前还没有做首次 push；原因是工作区很脏，不能直接无脑提交

二、本轮必须完成的目标
1. 继续收敛 `clawdesk` 命名迁移中“用户可见入口”的残留旧名
2. 明确区分：
   - 需要现在改的：代码、脚本、构建入口、提示词、活跃文档、用户 API 入口
   - 可以暂时不改的：历史研究、旧报告、缓存、生成物、`.editme` 派生索引、产物日志
3. 形成“最小可提交改名集”
4. 做真实验证
5. 准备提交代码
6. 推到当前局域网 `origin`
7. 让 `mac4g` 对齐到该 `origin`
8. 评估并准备下一步 GitHub 私有仓库迁移方案（不一定本轮就要真正创建，取决于认证条件）

三、严格执行顺序

第一阶段：盘点并缩小改名提交范围
1. 在本地执行：
   - `pwd`
   - `git status --short`
   - `git remote -v`
   - `rg -n "testMonkey-go|testmonkey|TestMonkey|com\.testmonkey\.cli|dist/TestMonkey.app|dist/testmonkey-mac|\./testMonkey-go" /Users/a0000/Documents/workspace/clawdesk`
2. 只挑出“应该纳入本次改名提交”的文件：
   - `.go`
   - `scripts/*`
   - `README.md`
   - `QUICKSTART.md`
   - `docs-user-api/*`
   - `prompts/*`
   - 其他明显属于当前用户入口/运行入口的文件
3. 不要把这些内容纳入本次提交：
   - 所属测试目录、`docs/quality/`、`.runtime/` 或 `.archive/`
   - `.runtime/`
   - `.hermes/`
   - `.omx/`
   - `__pycache__/`
   - 各类历史分析/研究文档，除非它们是当前入口文档
   - `.editme/` 目录默认不要整理或纳入治理

第二阶段：补齐改名残留
1. 处理仍然应该改但尚未改的关键位置，例如：
   - `cmd/testmonkey-mcp` 目录名是否应改为 `cmd/clawdesk-mcp`
   - `pkg/README.md` 标题和说明中的旧产品名
   - `README.md`/`QUICKSTART.md`/`docs-user-api` 中仍然用户可见的旧名字
   - 运行命令示例里的 `./testMonkey-go`
2. 改之前先读上下文
3. 改完后重新搜索一次确认残留已降到可接受范围

第三阶段：真实验证
必须至少执行并报告结果：
- `go build -o /tmp/clawdesk ./main.go`
- `go build -o /tmp/clawdesk-mcp ./cmd/clawdesk-mcp` 或如果目录未改则对应实际入口
- 若改了脚本/命令入口，至少再验证相关路径存在

第四阶段：准备提交代码
1. 基于最小改名提交范围做 staged plan，不要把脏工作区的无关内容一锅端
2. 明确列出：
   - 将要 `git add` 的文件
   - 明确排除的文件/目录
3. 如果需要，先创建 `.git/info/exclude` 临时忽略明显不该提交的本地噪音，但不要改用户全局偏好
4. 然后完成：
   - `git add <仅本次改名相关文件>`
   - `git status --short`
5. 在真正 commit 前，先做一次最终自检：
   - staged diff 是否只包含改名与入口修正
   - 是否混入了运行产物、缓存、历史报告

第五阶段：提交并推送到局域网 origin
1. 生成清晰 commit message，例如：
   - `rename runtime surfaces from testmonkey to clawdesk`
2. 提交后执行：
   - `git push -u origin master`
3. 验证 bare repo 有新引用

第六阶段：让 mac4g 对齐
1. 在 `mac4g` 上执行：
   - `git fetch origin`
   - 根据远端工作区状态决定：
     - 若没有必须保留的本地脏改动，可对齐到 `origin/master`
     - 若有，则先说明风险，再谨慎处理
2. 最终报告要分开说明：
   - `mac4g` 是否已 fetch
   - 是否已完全对齐 `origin/master`
   - 若未完全对齐，阻塞点是什么

第七阶段：GitHub 私有仓库迁移准备
1. 检查本机是否有可用 GitHub 认证：
   - `gh` 是否存在
   - `gh auth status`
   - `~/.git-credentials`
   - `~/.hermes/.env` 中是否有 `GITHUB_TOKEN` / `GH_TOKEN`
2. 若认证可用，则评估下一步可执行命令
3. 若认证不可用，不要假装完成，只输出“创建 shopable-ai 私有仓库所需前提”
4. 本轮不强求真正创建 GitHub 仓库，重点是先把本地/LAN Git 基线收口干净

四、硬性要求
- 不要回滚用户原有无关改动
- 不要做全仓无差别字符串替换
- 不要把历史产物、缓存、研究报告混进本次提交
- 每说会执行某个动作，就立刻执行
- 最终汇报必须包含：
  - 本轮实际修改了哪些文件/目录
  - 哪些残留旧名被有意保留，为什么
  - 哪些文件被纳入提交，哪些被排除
  - 编译/验证真实结果
  - push 是否成功
  - `mac4g` 是否对齐
  - GitHub 私有仓库迁移准备状态
