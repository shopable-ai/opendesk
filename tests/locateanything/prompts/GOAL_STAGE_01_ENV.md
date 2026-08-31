执行：

```bash
cd /Users/mac/Documents/workspace/clawdesk
python3 tests/locateanything/scripts/run_stage_01_env.py
```

本阶段只做控制机和 bridge 拓扑确认。

必须落地的检查：

1. 当前控制机：
   - `x86_64/arm64`
   - Python
   - `dist/clawdesk`
   - venv
   - `torch/transformers/mlx/mlx_vlm/PIL`
   - `models/LocateAnything-3B-8bit`
   - `models/LocateAnything-3B-bf16`
2. `serviceUrl`：
   - 从 `tests/locateanything/config/default.config.json` 或 override 读取
   - 验证 `/health`
3. 本地 mock fallback：
   - 如果本地已有 mock 服务就复用
   - 如果没有，就临时启动一次并验证 `/health` + `/v1/ground`
4. 端口占用：
   - 记录 `18777` 是否可复用
   - 如不可复用，记录实际 fallback 端口

产物：

- `.runtime/tests/locateanything/stage_01_env/summary.json`
- `.runtime/tests/locateanything/reports/STAGE_01_ENV_REPORT.md`

必须明确回答：

- 当前控制机是否能直接跑真实 MLX 模型
- 如果不能，阻塞点是架构、模型目录还是 `mlx/mlx_vlm`
- 局域网主路径是否已经可达
