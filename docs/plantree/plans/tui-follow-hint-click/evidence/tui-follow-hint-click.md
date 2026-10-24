# Evidence — tui-follow-hint-click

## 实现
- `packages/tui/src/tui.ts` renderFullscreen follow-hint 区块：渲染后登记 `addFrameClickEntry`（region col=padWidth、width=labelWidth+1 含尾随格、onClick→scrollToBottom；anchor=from=row、count=1）。复用 fork 原生 press→release 点击路由，零新机制。
- 视觉不变：右对齐中文 hint、loud 反色计数变体原样；仅获得点击能力。

## 门禁（worktree 实跑）
- tsgo --noEmit：exit 0
- biome check（2 触碰文件）：通过
- packages/tui npm test：1570 pass / 0 fail（含新增 2 用例：点击 hint 回底并恢复跟随、hint 外点击不误触）
- 待 commit 时 fork pre-commit 全链复核
