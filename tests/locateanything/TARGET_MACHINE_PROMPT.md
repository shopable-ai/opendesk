# 目标电脑执行提示

你现在就在目标电脑上操作。

工作目录：

```bash
cd /Users/mac/Documents/workspace/opendesk
```

## 这台电脑的信息

- 主机名：`min-Mac4g.local`
- LocalHostName：`min-Mac4g`
- 当前局域网 IP：`192.168.30.15`
- 项目目录：`/Users/mac/Documents/workspace/opendesk`

## 你应该直接在哪执行

是，直接在目标电脑里的 `workspace/opendesk` 执行。

## 相关文件

- `tests/locateanything/locateanything_bridge.py`
- `tests/locateanything/demo_grounding.js`
- `tests/locateanything/README.md`

## 只在本机测试

启动 bridge：

```bash
cd /Users/mac/Documents/workspace/opendesk
~/Documents/workspace/local-ai-rag/.venv/bin/python tests/locateanything/locateanything_bridge.py --backend mock --host 127.0.0.1 --port 18777
```

运行 opendesk demo：

```bash
cd /Users/mac/Documents/workspace/opendesk
./dist/opendesk -script tests/locateanything/demo_grounding.js -timeout 2
```

输出文件：

```text
.runtime/tests/locateanything/mock_grounding_auto.png
```

## 给局域网其他机器访问

如果需要让同一局域网的其他机器访问这个 bridge，不要绑定 `127.0.0.1`，改成：

```bash
cd /Users/mac/Documents/workspace/opendesk
~/Documents/workspace/local-ai-rag/.venv/bin/python tests/locateanything/locateanything_bridge.py --backend mock --host 0.0.0.0 --port 18777
```

此时局域网访问地址是：

- 健康检查：`http://192.168.30.15:18777/health`
- Grounding 接口：`http://192.168.30.15:18777/v1/ground`

示例：

```bash
curl http://192.168.30.15:18777/health
```

```bash
curl -X POST http://192.168.30.15:18777/v1/ground \
  -H 'Content-Type: application/json' \
  -d '{
    "imagePath": "tests/locateanything/fixtures/wechat/mock_wechat.png",
    "task": "gui_point",
    "phrase": "the send button",
    "profile": "auto"
  }'
```

## profile 路由规则

- `daily` -> `LocateAnything-3B-8bit` + `fast`
- `quality` -> `LocateAnything-3B-bf16` + `hybrid`
- `verify` -> `LocateAnything-3B-bf16` + `slow`

`profile=auto` 时当前 bridge 逻辑是：

- `gui_point` / `gui_box`：先 `daily`，失败再 `quality`
- `ground_multi` / `text` / `detect`：先 `quality`，必要时再 `verify`

## 当前这台机器的限制

这台目标机当前识别到的是：

- `x86_64`
- 当前项目里还没有这两个模型目录：
  - `models/LocateAnything-3B-8bit`
  - `models/LocateAnything-3B-bf16`

所以现在能直接跑通的是：

- `mock` backend
- opendesk 到 bridge 的联调流程

如果要跑真实 MLX 模型，应该换到 Apple Silicon 机器，并把模型目录放到：

```text
/Users/mac/Documents/workspace/opendesk/models/LocateAnything-3B-8bit
/Users/mac/Documents/workspace/opendesk/models/LocateAnything-3B-bf16
```

再运行：

```bash
python tests/locateanything/locateanything_bridge.py --backend mlx --host 0.0.0.0 --port 18777
```
