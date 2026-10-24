# 移植映射（上游 f1927c2d5 → fork 0.11.21）

| 上游文件/改动 | fork 落点 | 适配说明 |
|---|---|---|
| `packages/tui/src/wheel-scroll.ts`（新增，82 行） | 同路径原样复制 | 自包含纯 TS，无 import，直接可用 |
| `packages/tui/src/index.ts`（+1 导出） | 同路径 | 导出 WheelScrollAccelerator |
| `packages/tui/src/tui-alt-screen.ts`（滚轮接线 +35/-8） | `packages/tui/src/tui.ts`（fork 无 alt-screen 文件，滚轮处理在 `tui.ts:1443`） | `scrollBy(direction * TUI.WHEEL_SCROLL_LINES)` → `scrollBy(direction * this.wheelScroll.next(direction, now))`；删硬编码常量；新增 `setWheelScrollLines()` |
| （上游无对应：fork 需自加键位） | `packages/tui/src/keybindings.ts` + `tui.ts:1537` 键处理 | 新增 `tui.viewport.bottom` 默认键 `ctrl+end`（上游为 `tui.altScreen.bottom`；fork 保留自己的 viewport 命名族）；处理体复用 follow |
| `packages/coding-agent/src/core/settings-manager.ts`（+22） | 同路径 | Settings 接口加 `fullscreenWheelScrollLines?: "auto" \| number`；defaults 加 `"auto"`；校验（"auto" 或正整数，非法回退+警告）+ getter |
| `packages/coding-agent/src/modes/interactive/interactive-mode.ts`（+8） | `interactive-mode.ts:2064` 构造点 | fork TUI 构造无 options → 构造后 `this.ui.setWheelScrollLines(this.settingsManager.getFullscreenWheelScrollLines())` |
| `packages/coding-agent/src/modes/interactive/tui-renderer.ts`（+4） | 不需要 | 上游在 renderer 里传 options；fork 走 setter 路线，此文件不动 |
| `packages/coding-agent/src/modes/interactive/components/settings-selector.ts`（+20） | 评估后**不移植** | 上游加了设置 UI 选项；fork 的 settings-selector 结构未核对，v1 只做 settings.json 层（避免 UI 面适配），记 Deferred |
| `packages/coding-agent/src/experimental/client-tui.ts`（+1） | 不移植 | fork 无对应 experimental 结构 |
| 测试：`packages/tui/test/wheel-scroll.test.ts`（+47） | 同路径移植 | 两边 runner 同为 node:test |
| 测试：`tui-alt-screen.test.ts`（+25）/ coding-agent 三个测试 | 择要移植 | alt-screen 结构不匹配的跳过；settings-manager 测试追加校验用例 |
| `docs/settings.md`（+1） | fork 有则加一行 | 实现时核对 |
| CHANGELOG ×2 | root CHANGELOG.md | 按上游口径 + fork 风格记一条 |

## fork 惯例备注（实现时遵守）

- commit 风格：conventional + scope（`feat(tui,coding-agent): ...`），英文主题行。
- `FORK_NOTES.md`：Dmatut7 的 fork 台账，155KB 纯手写风格。**PR 内不动它**（外人补账容易破坏其编号体系）；PR 描述里引用上游 commit `f1927c2d5` 让维护者自行记账——这正是他 "upstream pick" 的日常。
- husky pre-push 会跑 preflight；不绕过。
