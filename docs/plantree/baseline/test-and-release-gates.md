# 测试与发布门禁（primeagent fork）

| 门禁 | 命令 | 说明 |
|---|---|---|
| 类型检查 | `npx tsgo --noEmit`（仓库根） | fork 的 check 之一 |
| Lint | `npx biome check packages/tui/src packages/coding-agent/src`（触碰文件） | 全量 check 含更多步骤，触碰面小时按文件跑 |
| TUI 单测 | `cd packages/tui && npm test` | node --test --import tsx test/*.test.ts |
| 构建 | `npm run build`（仓库根） | tui→ai→agent→coding-agent 全链 build，--dist bundle 产物验证 |
