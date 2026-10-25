# Evidence — ctrlc-clear-draft

## 实现
- `interactive-mode.ts` `handleCtrlC()`：退出提示链保留在最前；新增 draft 分支——`getText().length > 0` 时 `stashDraftBeforeEscapeClear()`（trim 非空才 stash+toast，whitespace 只清不存）+ `clearInputBar()`（含 queueSelection 恢复语义与 requestRender）+ return，零打断调用；空 editor 走原 `handleInterruptKey()`。
- 语义网：streaming 中按 Ctrl+C（有字）→ 只清空，turn 照跑；再按一次（空）→ 打断（原链）；Esc 打断路径不动；#2426 排队消息携带打断仍在 Esc/空框 Ctrl+C 可达。

## 门禁（worktree 实跑）
- tsgo --noEmit：exit 0
- biome（2 触碰文件）：干净
- `interactive-mode-ctrl-c.test.ts` **26/26**：重写 3 个旧行为用例（streaming-draft 不打断+queue 原样+stash 可恢复；idle draft 清空+stash；hint 过期改空框场景）+ 新增 2 用例（whitespace 不 stash；stash 恢复）
- 回归：custom-editor + clone-command 共 54/54
- npm run build 绿；待 commit pre-commit 全链 + kimi 审查
