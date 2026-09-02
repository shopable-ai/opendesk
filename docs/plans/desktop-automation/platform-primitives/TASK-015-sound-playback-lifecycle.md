# TASK-015 — Sound Playback Lifecycle

Status: DONE
Priority: P1
Depends on: TASK-004-audio.md

## Goal

在不破坏旧 `Sound.play*()` / `Sound.playSound()` / `Sound.play()` 同步兼容语义的前提下，补齐
适合长音频和桌面自动化的播放会话：非阻塞启动、暂停、恢复、停止、完成通知、循环播放和
execution teardown 清理。

## Audit decision

Decision: EXTEND

逐项审计结果：

| 接口 | 当前问题 | 本任务结果 |
| --- | --- | --- |
| `playSuccess` / `playFail` / `playWarning` / `playError` / `playCaptcha` | 只有同步完成语义；旧注释和部分资源命名不准确 | 保留兼容入口，统一资源解析和错误模型 |
| `playSound(path)` / `play(path)` | 长音频阻塞 owner EventLoop，无法在同一 execution 中控制 | 保持 blocking；文档引导使用 `start` |
| `start(path, options)` | 缺失 | 新增会话句柄，支持 `{loop?: boolean}` |
| `playAsync(path, options)` | 缺失 | 新增 `start` 别名 |
| playback handle | 缺失状态、暂停/恢复/停止和完成通知 | 新增 `status`、`isPlaying`、`pause`、`resume`、`stop`、`wait` |
| `stop(id)` / `stopAll()` | 缺失 owner-scoped 控制入口 | 新增，不能接管其他 execution |
| `getActive()` | 缺失观察入口 | 新增 owner-scoped 快照 |
| `Audio` volume/mute/device | 已由 TASK-004 提供；不应在 Sound 重复 | 保持职责边界，不新增录音或默认设备切换 |

## Contract

- 旧同步入口仍在播放结束后返回；调用者不能在同一个同步调用栈中调用 `stop`。
- `start` 立即返回 execution-scoped handle；`wait()` resolve `{id, path, status, error?}`。
- terminal status 为 `completed`、`stopped` 或 `failed`；`stop()` 接受后会话立即进入 `stopped`，
  `wait()` 提供同一终态的异步通知，不等待平台输出缓冲尾音。
- loop playback 必须由 handle 或 `stop(id)` / `stopAll()` 停止；execution teardown 自动停止所有
  owner playback，并取消未完成 `wait()`。
- 进程级 beep speaker 只初始化一次；并发会话共享输出，不因另一次播放重新初始化而截断已有会话。
  每次会话结束只释放逻辑占用，不调用可能被平台驱动阻塞的全局 speaker.Close。
- `.mp3` / `.wav` 扩展名大小写不敏感；空路径、NUL、目录、缺失文件和未知 options fail before
  opening/initializing the speaker。

## Verification

- JavaScript Runtime API contract/unit gate 覆盖所有新增 namespace 方法和参数 fail-before-side-effect。
- JavaScript Runtime API tests 覆盖路径/options 的 fail-before-side-effect、会话入口和旧接口；
  native owner 不新增常规 `automation/sound_test.go`，避免把可由 JS 观察的公开契约分散到实现目录。
- 真实声音播放 smoke 仅在明确拥有当前 macOS 音频设备和可审查 fixture 时执行；普通 API unit gate
  不制造可听副作用。

## Execution record — 2026-09-02

### Implementation

- `automation/sound.go` 保留七个旧同步入口，并新增 `start`、`playAsync`、`stop`、`stopAll`、
  `getActive` 和会话句柄的 `status`、`isPlaying`、`pause`、`resume`、`stop`、`wait`。
- 播放会话绑定创建它的 execution；runtime teardown 会停止会话、取消未完成等待并在 cleanup
  event 中报告 `soundWorkers`、`soundPending`、`soundPlaybacks`。
- `stop()` 是立即可返回的逻辑终止操作，`wait()` resolve 终态结果；不再用需要全局 speaker 锁的
  `beep.Ctrl` 修改路径，也不在每次会话结束时调用可能被音频驱动阻塞的 `speaker.Close()`。
- `Audio.getCapabilities().playback` 明确同时报告旧 blocking 兼容入口与新的 non-blocking、
  controllable Sound 会话；Audio capture 和默认设备切换仍按 TASK-004 边界保持未实现。

### Evidence

- `go test ./automation ./pkg/execution -run 'Test(Audio|RuntimeLifecycle|Runner)' -count=1` -> PASS。
- `./scripts/test_runtime_apis.sh unit` -> PASS，`433/433`；证据目录：
  `.runtime/tests/runtime-api/20260902T115520Z-70796/`。
- 从仓库根目录原样执行：
  `go run ./cmd/opendesk -script examples/sound-playback.js -console-mode script` -> PASS；
  输出验证 pause/resume/stop/wait 以及 `activeAfterWait=0`，证据目录：
  `.runtime/runs/direct-20260902-195658-736000/`；cleanup event 中 sound 三项均为 `0`。
- `python3 -m json.tool docs/api/runtime-api.ai.json` 与 `git diff --check` -> PASS。
- `go test ./...` -> Audio、Sound、execution 及其余相关 package 通过；全仓仅保留工作树原有的
  `pkg/visionrun` 4 个环境输入失败（缺 real validation input、`capture_contract.json` 或当前
  preflight report），未出现本任务相关失败。

## Remaining

- `Audio.recordMicrophone()`、`Audio.recordSystemAudio()`、`Audio.stopRecording()` 继续保持
  `notImplemented`，按 TASK-004/TASK-006 单独设计权限、artifact 和 teardown。
- 不加入音量淡入淡出、队列、混音、转码或跨 execution 的全局 stop。
