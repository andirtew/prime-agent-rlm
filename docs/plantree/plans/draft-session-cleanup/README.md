# draft-session-cleanup — 强断开残留空会话文件修复

任务名：`draft-abrupt-detach-discard`
分支：`active/draft-abrupt-detach-discard`
worktree：`/Users/xu/自建项目/primeagent-worktrees/draft-abrupt-detach-discard`
证据：`docs/plantree/plans/draft-session-cleanup/evidence/draft-abrupt-detach-discard.md`

## Goal

客户端**非正常断开**（关 iTerm 标签页 / 杀终端 / 崩溃 / 断网）时，daemon 内无消息、无 stash/队列/心跳的空草稿会话会留下孤儿会话文件，污染 resume 列表（"（无消息）"条目）。修复后：强断开与干净退出（/quit）行为一致——空草稿连同文件一起丢弃。

## Current facts（已核实）

- **可复现实验**（2026-11-05，现役 daemon）：经 socket 创建全新会话 → 客户端 `process.exit(0)`（无干净 detach）→ 数十秒后：
  - daemon 名册里会话消失 ✓（停止逻辑生效）
  - **磁盘会话文件残留**（5 行：session header + model_change + thinking_level 等，无任何用户消息）✗
- `closeSession(reason)` 对空草稿有完整丢弃路径：`isEmptyDraftSession → deleteSessionFile()`（daemon-mode.ts ~8626），`reason ∈ {shutdown, update}` 时保留记录。
- 干净 detach（/quit）路径：`detachClientFromActiveSession → isDiscardableDraft → queueMicrotask → closeSession("killed") → 删文件`，实测不残留。
- **疑点（待实现期验证）**：`isDiscardableDraft` 开头 `if (this.options.worker) return false`——worker 进程内直接放弃丢弃判定；强断开的清理发生在哪一层（supervisor 还是 worker）、是否走了别的 reason（如 passivation/completed）导致文件保留，需在 worktree 里插桩定位。

## Decision（方向）

让"客户端 socket 非正常关闭"与"干净 detach"对空草稿产生同一结局：会话停止 + 文件删除。具体落点（在哪一层补、如何避免竞态：客户端可能马上重连）在实现期通过插桩实验确定，遵循两个约束：

1. **安全边界不变**：有用户内容（消息/stash/队列/心跳/配置）的会话永不自动删；
2. 复用现有 `isEmptyDraftContent` 判定与 `deleteSessionFile` 路径，不另起炉灶。

## Scope（实现期允许调整，需回计划补记）

- daemon 会话生命周期相关：`modes/daemon/daemon-mode.ts`（detach/worker/丢弃路径）
- 可能涉及 worker 协议或 supervisor 侧（视插桩结果）
- 测试：daemon 生命周期测试（`test/session-lease.test.ts`、daemon 相关或新增用例）

## Non-goals

- 不改干净退出路径的行为（已正确）
- 不清理存量孤儿文件（一次性脚本另行处理，不进仓库）
- 不做"空闲超时自动删文件"（只修强断开这一条路径）

## Acceptance criteria

1. 复现实验（socket 创建空会话 + 强断开客户端）→ 数秒后**文件从磁盘消失**、名册无残留；
2. 有用户内容的会话强断开 → 文件保留（回归保护）；
3. 干净 detach 行为不变（回归）；
4. 相关测试全绿 + 既有 daemon 测试回归；tsgo/biome/pre-commit 过。

## Security boundary

删除仅限"零用户内容"的会话文件；判定必须复用 `isEmptyDraftContent`（含 jobs 检查），防止误删带任务/草稿的会话。

## Compatibility / rollback

干净退出、shutdown 保留记录等既有语义不变；回滚 = revert 合并提交。

## Dependencies / Blockers

无。worktree symlink canonical node_modules。

## Next target

实现期先做插桩实验定位强断开的实际清理路径与 reason，再落修复；交付后**不安装现役**（等用户批准）。
