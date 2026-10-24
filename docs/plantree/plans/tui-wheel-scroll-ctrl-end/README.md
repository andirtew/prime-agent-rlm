# 计划：TUI 滚轮加速配置 + 一键回底（tui-wheel-scroll-ctrl-end）

## Goal

把上游 `earendil-works/pi`（main）已有的两个 TUI 能力移植进本 fork（基线 0.11.21，`7fcbf3ab`）：

1. **滚轮可配置 + 自动加速**：settings 键 `fullscreenWheelScrollLines`（`"auto"` 或正整数，默认 `"auto"`），底层 `WheelScrollAccelerator` 按滚动速度 1–6 行/格；
2. **一键回底**：`ctrl+end` 绑定到视口回底（对齐上游 `tui.altScreen.bottom` 语义，fork 内命名 `tui.viewport.bottom`）。

完成后以 PR 形式贡献给 Dmatut7/prime-agent-rlm；本 fork main 同时保留完整历史。

## Non-goals

- 不移植可点击的 "Jump to latest" chip（上游 `79680533c`，涉及 alt-screen 渲染管线重构，量大且与 fork 0.11.x 结构差异大；v1 不做）。
- 不移植上游 `tui.altScreen.*` 全套键位改名（page/half/line 滚动族），只补 bottom 一个绑定。
- 不动 fork 的 TUI 渲染架构、不做其他上游 pick。

## Scope（允许修改的文件）

```text
packages/tui/src/wheel-scroll.ts                    新增（上游原文件，自包含无依赖）
packages/tui/src/tui.ts                             滚轮事件接线 + viewport.bottom 键处理 + setWheelScrollLines()
packages/tui/src/keybindings.ts                     tui.viewport.bottom 默认键 ctrl+end
packages/tui/src/index.ts                           导出 WheelScrollAccelerator（对齐上游）
packages/tui/test/wheel-scroll.test.ts              新增（随上游测试移植）
packages/coding-agent/src/core/settings-manager.ts  fullscreenWheelScrollLines 设置 + 校验 + getter
packages/coding-agent/src/modes/interactive/interactive-mode.ts  构造 TUI 后传入设置
packages/coding-agent/test/settings-manager.test.ts 追加设置校验用例（若文件结构允许）
packages/coding-agent/docs/settings.md              补一行文档（若 fork 有此文件）
CHANGELOG（root）                                    按上游口径记一条
```

禁止修改：fork 其余源码、`.github/`、`FORK_NOTES.md`（除非 Dmatut7 惯例要求，见 topics/port-map.md 的备注）、`docs/fork/`。

## Current facts（已核实）

- fork `packages/tui/src/tui.ts:546`：`WHEEL_SCROLL_LINES = 1` 硬编码；滚轮处理在 `tui.ts:1443`（`scrollBy(direction * TUI.WHEEL_SCROLL_LINES)`）。
- fork `packages/tui/src/keys.ts:449`：**已能解析** `ctrl+end`（`\x1b[8^`），但无任何 action 绑定。
- fork 键位：`tui.viewport.top` = `shift+alt+up`、`tui.viewport.follow` = `ctrl+shift+down`（`keybindings.ts`）；键处理在 `tui.ts:1537/1541`。
- fork TUI 构造点：`interactive-mode.ts:2064`：`new TUI(new ProcessTerminal(), getShowHardwareCursor())`，无 options 参数。
- 上游来源 commit：`f1927c2d5`（feat(tui,coding-agent): configurable fullscreen wheel scrolling with auto acceleration，2026-09-29）——16 文件 +275/-20；其中 `packages/tui/src/wheel-scroll.ts`（82 行）**无后续改动**（上游至今仅此一 commit 触碰）。
- 上游键位：`tui.altScreen.bottom` = `ctrl+end`（"Scroll viewport to bottom"）。
- fork 的 tui 测试跑法：`node --test --import tsx test/*.test.ts`（package.json scripts.test）。
- coding-agent 从 `@earendil-works/pi-tui`（workspace 包，fork 内 packages/tui，版本 0.11.21）导入 TUI。

## Decision

- **移植而非重写**：`wheel-scroll.ts` 从上游原样复制（自包含纯 TS，无 import）；tui/settings 侧按 fork 0.11.x 接口适配，行为与上游 `"auto"` 语义一致（本地 macOS 终端 1 行/格依赖 OS 加速；其余环境速度感应加速，上限 6 行/格）。
- **ctrl+end 走 fork 原生命名**：新增 `tui.viewport.bottom`（默认键 `ctrl+end`），实现复用 `tui.viewport.follow` 的处理体（回底并恢复跟随），不引入上游 altScreen 键族。
- **设置传递用 setter 而非改构造签名**：fork 的 TUI 构造是位置参数 `(terminal, showHardwareCursor?)`，为最小侵入加 `setWheelScrollLines(lines)`，在 `interactive-mode.ts` 构造后立即注入；设置热重载不进 v1（会话重启生效，与 showHardwareCursor 等既有 TUI 设置同等待遇）。
- fork 惯例研究备注见 topics/port-map.md（含 FORK_NOTES/CHANGELOG 是否入 PR 的处理）。

## Acceptance criteria

1. settings 写 `"fullscreenWheelScrollLines": 5` 时每格滚 5 行；写 `"auto"` 或不写时按上游 auto 语义；非法值回落 `"auto"` 且产生设置警告（不炸会话）。
2. 全屏下按 `ctrl+end` 立即回底并恢复跟随输出。
3. `npx tsgo --noEmit`、biome（触碰文件）、`packages/tui && npm test`、`npm run build` 全部通过。
4. 不改变 fork 其他行为（默认 wheel=auto 在 macOS 本地终端 = 每格 1 行，与现状一致）。

## Test matrix

- `packages/tui/test/wheel-scroll.test.ts`（随上游移植：auto 加速/固定值/burst/换向重置）
- `packages/coding-agent/test/settings-manager.test.ts` 追加：auto 透传、正整数透传、非法值回退
- `npx tsgo --noEmit` + biome 触碰文件 + `npm run build`
- 真实 TUI 手感验证：**未在真实界面验证**（开发环境无法交互式确认，交付说明中如实标注；由用户在 --dist 构建后实测）

## Security boundary

纯本地 UI 行为改动；无密钥、无网络、无生产数据；不触碰 git 历史。

## Dependencies / Blockers

- 上游 commit 已定位，无阻塞。
- 依赖 npm workspace 安装（node_modules 需 install）。

## Compatibility / rollback

- 纯增量：新文件 + 新设置键 + 新键位；默认行为与 fork 现状一致（auto 在 macOS 本地 = 1 行/格）。
- 回滚 = revert 该 merge commit；设置键残留无害。

## Next target

- TASK：`tui-wheel-scroll-ctrl-end`
- 分支：`active/tui-wheel-scroll-ctrl-end`（基于 push 本计划的 fork main）
- worktree：`/Users/xu/自建项目/primeagent-worktrees/tui-wheel-scroll-ctrl-end`
- 证据文件：`docs/plantree/plans/tui-wheel-scroll-ctrl-end/evidence/tui-wheel-scroll-ctrl-end.md`
- 派工：单席实现（GLM/主代理直做）+ 独立复审（对照上游 commit 逐 hunk 比对）
