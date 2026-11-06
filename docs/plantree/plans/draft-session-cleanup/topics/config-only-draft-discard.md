# config-only-draft-discard — 仅配置变更的空会话也纳入丢弃

任务名：`draft-config-only-discard`
分支：`active/draft-config-only-discard`
worktree：`/Users/xu/自建项目/primeagent-worktrees/draft-config-only-discard`
证据：`docs/plantree/plans/draft-session-cleanup/evidence/draft-config-only-discard.md`

## Goal

上一任务（draft-abrupt-detach-discard）让零内容空草稿在客户端离开后被丢弃，但**"只切了模型/思考档/服务层、没说过一句话"的会话仍被保留**：worker 的 `hasUserContent` 把创建前缀之外的 `model_change`/`thinking_level_change`/`service_tier_change` 算作用户内容，且 `closeSession` 内部的删文件闸门用的正是这个严格判定。用户裁定：这类会话同样是垃圾，丢弃。

## Current facts（已核实）

- 复现链：`/model` 切换模型 → 退出 → 驱逐发生（supervisor 侧 `isEvictableEmptySessionSummary` 只看 messageCount/名字/忙/cron，配置变更看不见 → 判空）→ worker `discardEmptyDrafts` 的 `isEmptyDraftContent` 因 `hasUserContent`（配置类条目=内容）拒绝 → 文件保留 → 历史区残留"（无消息）"行。
- 即便 worker 侧放行，`closeSession("killed")` 的内部闸门 `isEmptyDraftSession = !keepsResumeEntry && isEmptyDraftContent(state)` 仍会用严格判定走 archive（保文件）——**两处都要处理**。
- `hasUserContent`（session-manager）被多处共享，**不能改其语义**；放宽只应发生在丢弃链路。
- 保留价值语义（用户裁定）：真实消息、custom 内容、label、compaction、branch_summary、名字、定时任务 = 保留；纯 model_change/thinking_level_change/service_tier_change/session_state 等簿记 = 不保留。

## Decision

1. 新增 worker 侧私有谓词 `isDiscardableDraftContent(state)`：无 messages、无 sessionName、无定时任务、且条目中**不存在** `message`/`custom_message`/`custom`/`label`/`compaction`/`branch_summary`（不依赖 hasUserContent 的前缀跳过逻辑，直接白名单排除配置族）。
2. `discardEmptyDrafts` 用它替换 `isEmptyDraftContent` 判定（其余四重守卫不变）。
3. 文件删除：`closeSession("killed")` 后若文件仍在（内部闸门按严格判定走了 archive），由 `discardEmptyDrafts` 显式调 `deleteSavedSessionFile` 删除——closeSession 语义对其他调用方零改动。
4. supervisor 侧零改动（其 messageCount 判定本来就把这类会话当空）。

## Scope

- `packages/coding-agent/src/modes/daemon/daemon-mode.ts`（新谓词 + discardEmptyDrafts 接线）
- `packages/coding-agent/test/daemon-worker-discard-empty-drafts.test.ts`

## Non-goals

- 不改 `hasUserContent`/`isEmptyDraftContent` 本体（共享语义）；
- 不改 closeSession 内部闸门；
- 不动 supervisor 侧判定；
- 不做存量清理（另行脚本）。

## Acceptance criteria

1. 单测：配置型条目-only（含多轮 model_change）会话被丢弃且文件删除被调用；有 message/custom/label/compaction/名字/任务的照旧保留；
2. 集成实验：create+attach+`set_model` 切换+强断开 → 文件消失；
3. 原有 10 个单测与回归全绿；
4. tsgo/biome/pre-commit 过。

## Security boundary

删除仍限"零用户价值内容"；名字/消息/custom/压缩记录/定时任务任一存在即保留。

## Compatibility / rollback

对非配置型会话行为不变；回滚 = revert 合并提交。

## Next target

交付后**不安装现役**（等用户批准）。
