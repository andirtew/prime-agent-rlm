# thinking-level-map-fix — codex 目录模型丢失思考档位表

任务名：`codex-catalog-thinking-map`
分支：`active/codex-catalog-thinking-map`
worktree：`/Users/xu/自建项目/primeagent-worktrees/codex-catalog-thinking-map`
证据：`docs/plantree/plans/codex-remote-catalog/evidence/codex-catalog-thinking-map.md`

## Goal

目录合成的 openai-codex 模型（gpt-6-astra 等）丢失 `thinkingLevelMap`，导致 `/effort max` 被判"不支持"并 clamp 回 high。修复后：目录模型带上 pi.dev 提供的完整档位表，xhigh/max 可用。

## Current facts（已核实）

- pi.dev 目录条目携带 `thinkingLevelMap`（实测 gpt-6-astra：`{"off":null,"minimal":"low","low":"low","medium":"medium","high":"high","xhigh":"xhigh","max":"max"}`）。
- fork 的 `parseCodexModel` 只解析 id/name/reasoning/input/cost/contextWindow/maxTokens（+compat 继承），**不解析 thinkingLevelMap**——目录模型无 map。
- 内置清单 openai-codex 段（gpt-5.1 等）也未声明 map。
- 档位判定（`packages/ai/src/models.ts` `getSupportedThinkingLevels`）：`xhigh`/`max` 必须 `thinkingLevelMap` 显式声明，`null` 值=不支持；无 map 的推理模型只有 off/minimal~high。
- 请求层无此限制（用户实测 max 可用、pi 可用）；纯本地元数据缺口。
- `ThinkingLevelMap = Partial<Record<ModelThinkingLevel, string | null>>`（pi-ai types）。

## Decision

`parseCodexModel` 补解析 `thinkingLevelMap`：

- 新辅助 `parseThinkingLevelMap(value)`：非 record → undefined；逐项校验 value 为 `string | null` 才收录；全空/无合法项 → undefined。
- 回退语义与其他字段一致：目录条目有合法 map → 用之；无 → 回退同 id 内置条目的 map；再无 → 不带（行为同现状）。
- 整表替换（不做逐键合并）：pi.dev 每次下发完整表，逐键合并反而会残留旧键造成半新半旧。

## Scope

- `packages/coding-agent/src/core/openai-codex-remote-catalog.ts`
- `packages/coding-agent/test/openai-codex-remote-catalog.test.ts`

## Non-goals

- 不改 `getSupportedThinkingLevels` / effort 判定逻辑；
- 不改内置清单（目录 overlay 本来就会带新表覆盖）；
- 不做 per-key merge。

## Acceptance criteria

1. 目录条目带 map（含 max）→ 合成模型 `getSupportedThinkingLevels` 含 max/xhigh；
2. 目录条目无 map、同 id 内置有 → 用内置 map（回退生效）；
3. map 里 value 非法（数字等）的键被跳过，`null` 语义保留（off:null → off 不可用）；
4. 既有 16 用例 + model-registry 72 回归全绿；tsgo/biome/pre-commit 过。

## Test matrix

- 新增：目录 dict 带 map → levels 含 max；回退到内置 map；非法 value 跳过 + null 保留。
- 回归：codex-catalog 16、model-registry 72。
- 门禁：tsgo / biome / vitest / pre-commit。

## Security boundary

无新网络行为、无凭据接触。

## Compatibility / rollback

无 map 的目录条目行为不变（回退链兜底）；回滚 = revert 合并提交。

## Dependencies / Blockers

无。worktree symlink canonical node_modules。

## Next target

按上述 Decision 实现，交付时**不安装现役**（等用户批准）。
