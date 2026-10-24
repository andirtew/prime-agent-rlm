# Evidence — tui-follow-hint-click

## 实现
- `packages/tui/src/tui.ts` renderFullscreen follow-hint 区块：渲染后登记 `addFrameClickEntry`（region col=padWidth、width=labelWidth+1 含尾随格、onClick→scrollToBottom；anchor=from=row、count=1）。复用 fork 原生 press→release 点击路由，零新机制。
- 视觉不变：右对齐中文 hint、loud 反色计数变体原样；仅获得点击能力。

## 门禁（worktree 实跑）
- tsgo --noEmit：exit 0
- biome check（2 触碰文件）：通过
- packages/tui npm test：1570 pass / 0 fail（含新增 2 用例：点击 hint 回底并恢复跟随、hint 外点击不误触）
- 待 commit 时 fork pre-commit 全链复核

## 落地（2026-10-24）

- SOURCE_TIP：`432b24e2f20d67ae86b41b95f95c9911fca78444`（pre-commit 全链绿）
- MERGE_COMMIT：`9e92921fc`（`merge: 合并 active/tui-follow-hint-click`，tree 等价 ✓，远端核对一致）
- 归档：`archive/tui-follow-hint-click` = SOURCE_TIP（本地+远端核对 OK；active 分支与 worktree 已删）
- 起因：用户实测 pi 的 "Jump to latest message" chip 可点击回底，要求同等体验；本次用 fork 原生机制补齐点击能力
