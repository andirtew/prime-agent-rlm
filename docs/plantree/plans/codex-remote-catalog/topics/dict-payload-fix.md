# dict-payload-fix — codex 目录字典格式解析修复

任务名：`codex-catalog-dict-form`
分支：`active/codex-catalog-dict-form`
worktree：`/Users/xu/自建项目/primeagent-worktrees/codex-catalog-dict-form`
证据：`docs/plantree/plans/codex-remote-catalog/evidence/codex-catalog-dict-form.md`

## Goal

pi.dev 目录实际以**按模型 id 键的字典**返回，当前解析只认数组/`{models:[...]}` 两种形式，导致动态目录永远解析为 0 个模型并负缓存 4 小时。修复后：登录 codex 的账号重启 prime 后，`/model` 应出现 `gpt-6-astra` 等目录模型。

## Current facts（已核实）

- 实测（修复当天）：`curl https://pi.dev/api/models/providers/openai-codex` 返回 HTTP 200，body 是 `{"gpt-6-luna":{...},...,"gpt-6-astra":{...}}` 共 7 个模型条目（5304 字节），etag 存在，304 重验证有效。
- 现役机器缓存 `~/.prime/agent/openai-codex-catalog-cache.json` 为 `{"checkedAt":...,"etag":"W/\"...\"","models":[]}`——拉取成功但解析为空，负缓存生效。
- `parseCodexCatalogPayload`（解析）与 `refreshCodexRemoteCatalog` 的 `rawEntries`（持久化）两处都只接受数组或 `{models:[...]}` 信封，字典落到 `[]`。
- 既有测试全部用数组形式 mock（`fakeResponse([...])`），因此 14/14 通过但线上为空——测试形状与真实端点不符。
- 内置清单（models.generated.ts）无 gpt-6-astra，动态目录是唯一来源。

## Decision

新增单一辅助函数 `catalogEntries(value)`：

```ts
function catalogEntries(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (isRecord(value)) return Array.isArray(value.models) ? value.models : Object.values(value);
    return [];
}
```

`parseCodexCatalogPayload` 与 `rawEntries` 持久化共用该函数。理由：

- 字典与数组、信封三种形式互不冲突（有 `models` 数组字段优先，其余 record 视为 id 键字典）；
- 缓存落盘格式不变（仍存条目数组），旧缓存读取路径零改动；
- 解析入口收敛到一处，两处不再各自维护形状判断。

## Scope

- `packages/coding-agent/src/core/openai-codex-remote-catalog.ts`（两处调用点 + 新辅助函数）
- `packages/coding-agent/test/openai-codex-remote-catalog.test.ts`（新增字典形式用例）

## Non-goals

- 不改缓存文件名/结构、TTL、etag 逻辑；
- 不做其他 provider 目录；
- 不重写既有数组/信封用例（保持回归覆盖）。

## Acceptance criteria

1. 字典 payload（含 gpt-6-astra 条目）→ `refreshCodexRemoteCatalog` 返回包含该模型，缓存落盘 models 为条目数组；
2. 数组、`{models:[...]}` 用例全部保持通过（回归）；
3. 304 重验证、负缓存、离线回落等既有行为不变（回归）；
4. tsgo --noEmit、biome check（触碰文件）、coding-agent 测试全绿，pre-commit 全链通过。

## Test matrix

- 新增：字典形式解析 + 落盘断言；字典内混入非法条目时跳过；
- 回归：既有 17 用例 + model-registry 相关测试；
- 门禁：tsgo / biome / test / pre-commit。

## Security boundary

pi.dev 端点公开无认证；改动不触碰凭据；无网络行为变化（同一端点同一头）。

## Compatibility / rollback

三种 payload 形状向后兼容；缓存格式不变；回滚 = revert 合并提交。

## Dependencies / Blockers

无。worktree 需 symlink canonical 的 node_modules（monorepo 依赖不在 worktree 里）。
