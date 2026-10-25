# plantree 计划注册表（primeagent fork 开发）

本仓库用于向 [Dmatut7/prime-agent-rlm](https://github.com/Dmatut7/prime-agent-rlm) 贡献移植功能的开发现场。
台账与状态按 plan-tree 规范维护。

| Plan | Status | Current Phase | Last Landed | Next Target |
|---|---|---|---|---|
| tui-wheel-scroll-ctrl-end | Done（已合并归档） | 闭环完成 | merge `39207b99d` → archive `2f722930d` | 等用户确认是否向 Dmatut7 开 PR |
| tui-follow-hint-click | Done（已合并归档） | 闭环完成 | merge `9e92921fc` → archive `432b24e2f` | 同上，可并入同一 PR |
| codex-remote-catalog | Done（已合并归档，自用不提 PR） | 闭环完成 | merge `cd33eca67` → archive `6bd829f97` | 用户实测 gpt-6-astra |

## 阅读顺序

1. `baseline/test-and-release-gates.md` — 本仓库门禁命令
2. `plans/<plan>/README.md` — 计划入口
3. `plans/<plan>/roadmap.md` / `implementation-status.md` / `topics/` / `evidence/`
