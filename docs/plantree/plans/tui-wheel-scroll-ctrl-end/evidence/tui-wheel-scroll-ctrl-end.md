# 证据 — tui-wheel-scroll-ctrl-end

## 实现（active/tui-wheel-scroll-ctrl-end）

- 移植上游 `earendil-works/pi` commit `f1927c2d5`（feat(tui,coding-agent): configurable fullscreen wheel scrolling with auto acceleration，closes #9758），适配 fork 0.11.21 结构。
- 改动：9 文件改 + 2 新增，+71/-2 行（`git diff --stat`）。
  - `packages/tui/src/wheel-scroll.ts`（新增，上游原文件 82 行，零适配）
  - `packages/tui/src/tui.ts`：删除硬编码 `WHEEL_SCROLL_LINES=1`，滚轮走 `wheelScroll.next()`；新增 `setWheelScrollLines()`；新增 `tui.viewport.bottom` 键处理（复用 scrollToBottom）
  - `packages/tui/src/keybindings.ts`：`tui.viewport.bottom` 默认键 `ctrl+end`
  - `packages/tui/src/index.ts`：导出 `WheelScrollAccelerator` / `WheelScrollLines`
  - `packages/coding-agent/src/core/settings-manager.ts`：`fullscreenWheelScrollLines?: number | "auto"`（钳制 1-100，非法回落 auto）+ getter/setter + defaults 登记
  - `packages/coding-agent/src/modes/interactive/interactive-mode.ts`：TUI 构造后注入设置（紧跟 setClearOnShrink 先例）
  - 测试 ×2、CHANGELOG ×2（Unreleased 段）、docs/settings.md 一行（上游原文）

## 验证（fork 基线门禁，全部实际运行）

| 检查 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `npx tsgo --noEmit` | exit 0，无错误 |
| Lint | `npx biome check <7 个触碰文件>` | 无错误（organizeImports 自动修复 2 处后复检通过） |
| TUI 单测 | `cd packages/tui && npm test` | 1568 pass / 0 fail（含移植的 wheel-scroll.test.ts） |
| 设置单测 | `cd packages/coding-agent && npx vitest --run test/settings-manager.test.ts` | 85 pass / 0 fail（含新增 2 用例：默认 auto + 钳制；非法值回退） |
| 构建 | `npm run build`（仓库根） | 全链成功；`dist/bundle` 含 `WheelScrollAccelerator`、`fullscreenWheelScrollLines`、`tui.viewport.bottom`（grep 证实）；`@opentelemetry/api` compile-cache 警告 3/114 为已知非致命（与基线一致） |
| 残留检查 | `grep WHEEL_SCROLL_LINES packages/tui/src/` | 零残留 |
| Scope 检查 | `git status --short` | 11 个文件全部在计划 Scope 内，无越界 |

## 适配说明（与上游差异）

- fork TUI 构造为 `(terminal, showHardwareCursor?)`，无 options——设置经新增 `setWheelScrollLines()` 注入（上游走 options 与 tui-renderer）。
- `tui.viewport.bottom`（fork 命名族）对应上游 `tui.altScreen.bottom`；处理体复用 `scrollToBottom`，与 `tui.viewport.follow` 同效。
- 设置 UI 面板条目（上游 settings-selector +20）未移植（v1 限 settings.json 层，记 Deferred）。
- wheel-scroll.test.ts 的 import 由 `.ts` 后缀改为 fork 的 `.js` 风格。

## 未做（如实记录）

- **未在真实界面验证**：开发环境无法交互式操作 TUI；滚轮手感与 ctrl+end 键感需用户在 `--dist` 构建后实测。
- 未移植：可点击 jump-to-latest chip（上游 79680533c）、overlay 下滚轮穿透（上游 11f991145）、设置面板 UI 条目、设置热重载（均记 roadmap Deferred）。

## 后续

- 阶段5-8：合并 fork main、归档、推送；PR（等用户确认是否向 Dmatut7 发）。
