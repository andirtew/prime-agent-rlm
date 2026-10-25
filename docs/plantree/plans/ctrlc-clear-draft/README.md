# ctrlc-clear-draft

## 目标
把 Ctrl+C 改成 pi 语义（自用定制，不提 PR）：输入框有草稿时按下 Ctrl+C 只清空草稿（先 stash，恢复键可找回），**绝不打断运行中的模型输出**；输入框为空时保持 prime 现状（打断/双击退出链）。打断能力不丢：Esc 打断照旧 + 空输入框 Ctrl+C。

## 依据
- 用户 pi 侧手感：Ctrl+C 一键清空输入框；prime 里该键被打断占用，只能长按退格
- pi 上游 handleCtrlC 源码实证：第一次清空 editor、500ms 内再按退出
- prime 现状：handleCtrlC → handleInterruptKey → interruptOrClearInput（名字带 clear 但从不清空；清空走 Esc=app.input.clear）

## 改动
- `interactive-mode.ts` `handleCtrlC()`：draft 非空 → `stashDraftBeforeEscapeClear()` + `clearInputBar()` + return（零打断调用）；空 → 原逻辑不变
- `interactive-mode-ctrl-c.test.ts`：3 个旧行为用例按新语义重写（"keeps the draft"、"preserves idle draft"、hint 过期改空 editor 场景）+ 新增 streaming-draft 不打断用例 + whitespace 草稿不 stash 用例

## 门禁
tsgo / biome / ctrl-c 测试组 / interactive-mode 相关回归 / build / pre-commit + 百炼 kimi 审查
