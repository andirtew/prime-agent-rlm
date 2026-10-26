# Evidence — codex-catalog-dict-form

## 根因（已核实）

- 实测 `curl https://pi.dev/api/models/providers/openai-codex`：HTTP 200，body 为**按模型 id 键的字典**（`{"gpt-6-luna":{...},"gpt-6-astra":{...}}` 共 7 条，5304 字节），带 etag，304 重验证有效。
- 现役缓存 `~/.prime/agent/openai-codex-catalog-cache.json` 为 `models:[]` + etag —— 拉取成功、解析为空、负缓存 4h。
- 代码两处（`parseCodexCatalogPayload` 解析、`refreshCodexRemoteCatalog` 的 `rawEntries` 持久化）都只认数组/`{models:[...]}` 信封，字典落到 `[]`。
- 既有测试全部以数组形式 mock（`fakeResponse([...])`），因此当时 14/14 通过而线上为空——**测试形状与真实端点不符**是漏网原因。
- 内置清单无 gpt-6-astra，目录是唯一来源。

## 实现

- `openai-codex-remote-catalog.ts`：新增 `catalogEntries(value)` 单一入口（数组 → 原样；含 `models` 数组的 record → 信封；其他 record → `Object.values()` 字典；否则 `[]`），`parseCodexCatalogPayload` 与 `rawEntries` 共用。
- 缓存落盘格式不变（条目数组）；304、负缓存、离线回落、TTL 均未触碰。
- 测试 +2：字典形式解析/落盘/离线重读 round-trip；字典混入非法值跳过。

## 环境备注

- canonical 与 worktree 的 `node_modules` 过期（上游 v0.11.21 引入的 `partial-json` 未装，测试 import 失败）：在 canonical 根 `npm install` 补齐，lockfile 无变化、工作树保持干净。
- worktree 以 symlink 复用 canonical 的 `node_modules`（根 + 4 个子包）。

## 门禁（worktree 实跑）

- `vitest test/openai-codex-remote-catalog.test.ts`：**16/16**（含新 2 例；biome 格式化后复跑）
- `vitest test/model-registry.test.ts`：**72/72**（回归）
- `tsgo --noEmit`：exit 0
- `biome check --error-on-warnings`（2 触碰文件）：`--write` 修 1 处格式后复检干净
- pre-commit（`npm run check` 全链）：commit 时执行，结果见提交信息
- 未跑：`npm run build`（改动仅 TS 源 + 测试，构建产物不在本次交付范围；安装时另行构建）

## Review

- 实现自审：PASS（见上）；范围、边界、兼容逐项核对
- 独立复核（阶段 4）：见下

## 独立复核（阶段 4，2026 当日）

- 复核人：百炼/kimi-k3（prime CLI 非交互，独立会话，cwd=worktree）
- 复核人自行动作：逐行审查 diff、curl 实测端点形状、独立重跑 vitest（2 文件 88/88 通过）、核对 readCachedCodexCatalog 旧缓存读取路径
- 结论：**PASS**，无阻塞问题
- 低危观察（不阻塞）：既有空缓存（models:[]）在 4h TTL 内仍被信任，修复对该状态最长延迟 4 小时生效后自愈——属原负缓存机制的自然行为
- SOURCE_TIP：`0dd4f1e617b499aa5014ee21957371d74be08b0a`

## 落地

- MERGE_COMMIT：`101606e9b219be04d654560cdd10b27dab9726a3`（tree 等价 ✓，远端核对一致）
- 归档：`archive/codex-catalog-dict-form` → `70a1b45b877cb7c4d97ece2a5c8d1b4c0c4d4b97`，四方核对 OK
- 清理：本地/远端 active 分支已删（远端删除走 pre-push guard 文档的 `PRIME_AGENT_ALLOW_MIRROR_PUSH=1` 授权通道），worktree 已移除
- 交付：按用户要求**未安装**到现役 `~/prime-agent-rlm`；用户后续自行更新+构建后，重启 prime 应在 /model 看到 gpt-6-astra 等目录模型
- 待用户实测：`/model` 出现目录模型；既有空缓存最长 4h 负缓存延迟后自愈（也可删 `~/.prime/agent/openai-codex-catalog-cache.json` 立即重拉）
