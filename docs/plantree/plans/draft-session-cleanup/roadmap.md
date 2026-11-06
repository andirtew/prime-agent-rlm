# Roadmap — draft-session-cleanup

## Done

- [x] `draft-abrupt-detach-discard`：强断开/干净退出残留空草稿会话文件（worker 架构下丢弃链路死代码）。新增 worker_discard_empty_drafts（worker 五重守卫+supervisor 驱逐围栏接线），独立复核首轮 FAIL（worker 泄漏）→ 修复轮 → 复审 PASS。测试 10/10、回归 87/87、3 连强断开集成实测（文件清理+无进程泄漏）。合并 `b8b81669f`（tree 等价 ✓）→ 归档 → 清理 → 落地。计划见 [README.md](README.md)
- [x] `draft-config-only-discard`：仅配置变更（切模型/档位）的空会话也丢弃。isDiscardableDraftContent 白名单反查（共享语义不动），closeSession 严格闸门保下文件时显式删除。独立复核 PASS（15 种条目逐一核对）+ 三条低危建议全采纳。测试 14/14、回归 64/64、切模型+强断开集成实测文件删除。合并 `138cbfc8d`（tree 等价 ✓）→ 归档 → 清理 → 落地。计划见 [topics/config-only-draft-discard.md](topics/config-only-draft-discard.md)

## In Progress

（无）

## Next

（无）

## Deferred

- 存量孤儿空会话文件的一次性清理脚本（不进仓库，用户需要时提供）
