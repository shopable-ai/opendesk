# LocateAnything Goal Prompts

这些 prompt 现在对应的是 `tests/locateanything/` 里的分阶段实现，而不是单个 demo。

控制机信息：

- 主机名：`min-Mac4g.local`
- 局域网 IP：`192.168.30.15`
- 项目目录：`/Users/mac/Documents/workspace/clawdesk`

默认拓扑：

- 当前机器：`clawdesk` + 微信自动化 + stage runner
- 局域网另一台机器：LocateAnything bridge + 真模型

推荐顺序：

1. `GOAL_MASTER.md`
2. `GOAL_STAGE_01_ENV.md`
3. `GOAL_STAGE_02_MODEL_ONLY.md`
4. `GOAL_STAGE_03_SCRIPT_ASSISTED.md`
5. `GOAL_STAGE_04_BOUNDARY_STRESS.md`
6. `GOAL_STAGE_05_REPORT.md`

每个阶段都要参考：

- `tests/locateanything/config/default.config.json`
- `tests/locateanything/manifests/`
- `tests/locateanything/scripts/`
- `tests/locateanything/plan/LANE_STRATEGY.md`
