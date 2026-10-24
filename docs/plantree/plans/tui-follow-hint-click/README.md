# tui-follow-hint-click

## 目标
让全屏 transcript 底部行的「回到底部」提示（fork 已有：滚离底部时右对齐显示，有新内容时反色计数）支持**鼠标点击**——点击提示文字即回到底部并恢复跟随，对应 pi 1.2.0 的 "↓ Jump to latest message" chip 体验（fork 视觉语言保持不变）。

## 背景
- 用户实测 pi 的 chip 可点击回底，要求 prime 同等体验
- fork 地基齐全：`ClickRegion`/`addFrameClickEntry`/`clickTargetAt`/`dispatchFullscreenClick` 机制已在（pinned header 在用）；follow hint 渲染于 `tui.ts` renderFullscreen 的 followHintRow 区块
- 上游 pi 实现在新架构 `TuiAltScreen.compositeScrollToEndIndicator`（rect 命中），不直接搬代码，用 fork 原生机制实现同等行为

## Scope
- `packages/tui/src/tui.ts`：follow hint 渲染处登记 click entry（onClick → scrollToBottom）
- `packages/tui/test/fullscreen.test.ts`：点击 hint 回底 + 不误触的测试
- 两包 CHANGELOG Unreleased

## 明确不做（Deferred）
- hover 样式变化（pi 的 chip 也无 hover）
- 居中 chip 外观（保持 fork 右对齐 hint 风格）

## 门禁
tsgo / biome / packages/tui npm test / build / fork pre-commit 全链
