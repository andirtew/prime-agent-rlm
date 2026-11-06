# Evidence — draft-config-only-discard

## 根因（已核实）

- 上一任务后仍残留的场景：会话里只 `/model` 切过模型（或切档位/服务层）没说过一句话。
- worker `hasUserContent`：创建前缀之外的 model_change/thinking_level_change/service_tier_change 算"用户内容" → `isEmptyDraftContent` 判非空 → 丢弃跳过 → 文件保留。
- 即便放行，`closeSession("killed")` 的内部闸门 `isEmptyDraftSession` 也用同一严格判定 → 走 archive 保文件。**两处闸门都要处理**。
- supervisor 侧 `isEvictableEmptySessionSummary` 只看 messageCount/名字/忙/cron——本来看不见配置变更，判空，无需改。

## 实现

- 新私有谓词 `isDiscardableDraftContent`：条目白名单反查——存在 `message/custom_message/custom/label/compaction/branch_summary` 任一 → 保留；无定时任务 → 纯配置条目（model_change 等）视为可丢弃。不走 hasUserContent 的前缀跳过。
- `discardEmptyDrafts` 换用该谓词（其余四重守卫不变）；`closeSession("killed")` 后若文件仍在（严格闸门走了 archive），显式 `deleteSavedSessionFile`。
- `hasUserContent`/`isEmptyDraftContent`/`closeSession` 本体零改动（共享语义不动）。
- stash 场景核对（独立复核修正表述）：prompt stash 是客户端 TUI 进程内存态（ClientPromptStashStore），从不写会话文件，与本判定无交集；排队消息内存态且排队即活跃 → hasLiveSessionWork 守卫拦截。

## 集成实验（最终构建实测，隔离 HOME daemon）

- create + attach + `set_model` 切换 + 强断开 → **文件被删** ✓（残留的另一个文件是 daemon 启动器"未 attach"变体，已知边界非回归）

## 门禁（worktree 实跑）

- 测试重写为真实谓词驱动（stub 只留边界方法）：**12/12**（纯前缀丢弃、多轮配置切换丢弃、显式删文件调用、重连/在途 attach/subagent/命名/六类 keep-worthy 条目/定时任务/活跃工作/bash 保留、错误隔离、混合批次）
- 回归 89/89（新 12 + daemon-session-list + daemon-agent-roster）
- tsgo exit 0；biome 2 触碰文件干净
- pre-commit 全链：commit 时执行

## Review

- 实现自审：PASS
- 独立复核（阶段 4）：见下

## 独立复核（阶段 4）

- 复核人：独立子代理（全新会话，逐行 diff + SessionEntry 全集 15 种逐一核对 + 自行重跑 12/12）
- 结论：**PASS**，无阻塞缺陷。确认：白名单无用户价值遗漏（session_info 经 sessionName 守卫间接覆盖且谓词单点使用）；删文件复用 trash 优先的安全路径、时序无让出点、幂等；守卫顺序被测试真实检验
- 三条低优先级建议（全部采纳于收尾提交）：① 删除失败补日志（ok:false 与异常两路）② sessionFile 缺失反向用例 + session_info 行为钉住 ③ evidence 文档 stash 机制表述修正

## 落地

- MERGE_COMMIT：`138cbfc8d296fcfb3f06d8ea390141568323db70`（tree 等价 ✓，远端一致）
- 归档：`archive/draft-config-only-discard` → `9980d908964eef74476cffb54c36aa8aee41f567`，四方核对 OK
- 清理：本地/远端 active 已删，worktree 与实验环境已清
- 交付：**未安装现役**（等用户批准）
