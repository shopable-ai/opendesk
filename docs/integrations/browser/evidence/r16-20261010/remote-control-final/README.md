# R16 最终进程启动加固证据

本目录对应固定关闭 Codex App Server 远程控制启动偏好后的最终生产源码。生产集合 SHA256：`1e96b15cfaaa304408c71edb52ea021e00334df77a75a180f43c638beb6bb22c`。归档前核对全部 15 个源码/文档哈希与全部 13 个日志/产物哈希，无差异。

`final-evidence.json` 是实际测试完成时的原始 manifest；`baseCommit:cebf211056c63a66f9203f403940476cd92b3125` 只标识当时尚未推送的本地前一候选，`candidateCommit:null` 没有改写。最终远端提交用包含本目录的提交树和生产集合核对，不把本地候选当远端身份。

## 最终结果

- Go race：browserai **47 PASS / 5 opt-in SKIP**（包含子测试）；browsercli **2 PASS**；无 Socket 的 Native 定向合同 **5 PASS**。
- 真实最终源码 Linux 测试二进制：实际 Probe、同 thread 17→21、MCP 1 秒活动启动观察窗、流式开始后的 interrupted terminal、232 字节 Workflow JSON 均 PASS；cold resume 明确 SKIP / 不支持。
- 为保全旧相对路径输出，原测试二进制在独立临时 cwd 运行。没有 source overlay、复制仓库或 fake CLI 参与这次真实检查。命令、cwd、exit code 与二进制哈希在 manifest。
- `go vet` 和两包 Darwin/arm64 交叉编译 exit 0；Darwin 二进制未执行。
- 最小硬化由实际 owned child 验证：父环境为空、0、false、1 时子进程都只有一个固定值 1；不含 `--remote-control`，RPC 白名单不允许重新开启。没有主动创建或修改个人 remote-control enrollment 测试账号偏好。

`archive-map.json` 映射原始日志/合成数据相对路径到本目录平铺文件；内容保持逐字节一致。三份测试二进制不提交到文档；第三方源码摘录只在原始运行目录保留，manifest 记录哈希，本目录以下列官方固定版本链接代替转载。归档后实施说明与父索引补充最终证据链接；其文档字节可与冻结 manifest 不同，生产与测试字节没有改变。

官方依据：[CLI 启动模式选择](https://github.com/openai/codex/blob/rust-v0.159.2/codex-rs/cli/src/main.rs)、[App Server 远控生命周期](https://github.com/openai/codex/tree/rust-v0.159.2/codex-rs/app-server/src/remote_control)。私有启动 marker 在 worker 启动前选择 `DisabledEphemeral`，不修改用户持久设置。

原生 macOS/Chrome、真实 Browser 工具往返、旧 Node/Go Socket、RunHost 保存后关闭 AI 重复执行依旧 **NOT_TESTED**。父目录保留更早真实失败及 24 项既有测试登记 FAIL，本次 PASS 不擦除这些记录。
