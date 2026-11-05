# Evidence — draft-abrupt-detach-discard

## 根因（插桩实验定位，全部已核实）

架构：客户端 socket 归 **supervisor**，会话 runtime 住在 **worker** 进程（`options.worker` 为对象）。

1. **空草稿丢弃链路是死代码**：`isDiscardableDraft` 开头 `if (this.options.worker) return false`——worker 永远拒绝自行丢弃（防 supervisor 中继断连误判）；而 supervisor 侧没有丢弃逻辑。干净退出与强断开**都**残留文件（两个实验证实）。
2. **supervisor 有 `evictEmptySessionOnLastDetach`**（最后一个真实客户端离开→驱逐全空 worker，`isEvictableEmptySessionSummary`：messageCount=0、无名字、不忙、无 cron），但它走 `stopWorker` 优雅停止 → worker 以 reason="shutdown" 关会话 → `keepsResumeEntry=true` → **文件保留**。
3. worker 里真正的删文件逻辑（`closeSession` 的 `isEmptyDraftSession → deleteSessionFile`）需要 reason=killed + 空判定——两个条件在该路径都到不了。
4. 附带发现：worker 的 `state.clients` 里挂着 **supervisor 中继连接**（强断开时 supervisor 不退订），按"clients>0"判活会误判有人在用。
5. 实验方法：`HOME=/tmp/draft-home` 隔离 daemon（源码构建、独立 socket/agent 目录），DaemonClient 脚本模拟 create+attach+强断开/干净退出/命名。

## 实现

- **协议**：`worker_discard_empty_drafts` 命令（daemon-worker-protocol.ts）。
- **worker 侧** `AgentDaemon.discardEmptyDrafts()`：逐会话五重守卫——subagent 跳过（子会话随父生命周期）、**有名字跳过**（命名=意图回来，防名册滞后）、**仅 supervisor 中继挂载视为无人**（`authenticationRole !== "supervisor"` 过滤，复用 3762 行既有范式）、bash/活跃工作跳过、`isEmptyDraftContent`（消息/用户内容/定时任务）跳过——通过者 `closeSession("killed")`（复用既有删文件+artifact 清理路径），返回被丢弃的 sessionId 列表。
- **supervisor 侧**：`evictEmptySessionOnLastDetach` 在驱逐围栏内、二次候选校验后，先向 worker 发 discard 再优雅停 worker；失败仅记日志并回落旧行为（文件保留，不会更糟）。

## 集成实验（最终构建实测）

| 场景 | 结果 |
|---|---|
| A：create+attach+强断开（模拟关 iTerm 标签） | 文件被删 ✓（worker discarded 返回该会话） |
| B：create+attach+干净 detach | 文件被删 ✓ |
| C：create+attach+rename（唯一名）+强断开 | **文件保留** ✓（名字护栏） |
| D：create 后从未 attach（无 TTY 启动器/极端崩溃窗口） | 残留（已知边界：真实使用毫秒级窗口；无客户端→无"最后离开"事件可挂；记录不修） |

实验 C 首轮出现的"命名会话被删"为**假命名**：名字注册表被早前成功 rename 占用导致 rename 失败，会话实为未命名空草稿（换唯一名复验通过）。

## 门禁（worktree 实跑）

- 新测试 `daemon-worker-discard-empty-drafts.test.ts`：**8/8**（中继-only 丢弃、无客户端丢弃、真实客户端保留、subagent 保留、命名保留、bash/活跃工作保留、内容非空保留、混合批次只丢合格者）
- 回归：daemon-session-list + daemon-agent-roster + agent-connection-daemon + 新测试 = **214/214**
- `tsgo --noEmit` exit 0；biome 4 触碰文件 `--write` 修格式后复检干净
- pre-commit 全链：commit 时执行
- 集成实验见上（真实 daemon、隔离 HOME）

## Review

- 实现自审：PASS（守卫层级、失败回退、与既有 discard 调用形状一致、空父会话不可能有子会话故无孤儿级联）
- 独立复核（阶段 4）：见下

## 已知边界（如实记录）

- 场景 D（create-未-attach）不修：无客户端会话无 detach 事件可触发；真实客户端 create→attach 是毫秒窗口。
- 存量孤儿文件不在本任务范围（用户需要时另行脚本清理）。

## 独立复核（阶段 4）

- 复核人：独立子代理（全新会话，逐行 diff 审查 + 自行重跑 8/8、85/85、tsgo）
- 首轮结论：**FAIL**（1 阻塞 + 4 低危观察）
  - **阻塞**：丢弃成功后 roster 清空 → `isEmptyDetachEvictionCandidate` 的 `summaries.length > 0` 不再满足 → `stopWorker` 不执行 → **worker 进程无界泄漏**（用进程泄漏换文件清理），且无任何兜底回收路径
  - 低危：pendingAttaches/水合中会话守卫缺口（可达性极低）；循环无逐会话错误隔离；requestWorker 对 unknown-command 返回 failure 而非 reject（`.catch` 捕不到）；discarded 响应无人消费
- 复核同时确认通过项：协议兼容（老 worker fail-fast 回落）、五重守卫逻辑正确、数据安全双层防护（fence+drain+本地复评）、closeSession 调用形状与既有路径一致

## 修复轮（复核发现驱动）

1. **阻塞修复**：`passivateWorkerIfStillEligible` 的资格谓词放宽为 `isEmptyDetachEvictionCandidate(worker) || workerRosterEntries(worker).length === 0`——被丢弃掏空的 worker 仍会被停止（围栏入口已保证原有 ≥1 会话；重连窗口内客户端会留下会话行，两个判定都为 false，不误停）
2. pendingAttaches 守卫：attach 在途计为真实客户端（对齐 supervisor 3754 行语义）
3. 逐会话 try/catch 错误隔离：单个 closeSession 失败记日志继续处理其余
4. supervisor 消费响应：`response.success` 为 false 时记日志（覆盖老 worker unknown-command 的静默回落）
5. 测试 +2（pendingAttaches 保留、错误隔离），10/10

## 修复轮验证（最终构建实测）

- 3 次连续强断开：会话文件只余 1（未 attach 变体，已知边界）✓；worktree 进程仅 supervisor + 1 个 warm spare——**无 worker 泄漏** ✓
- 回归 87/87（新 10 + daemon-session-list + daemon-agent-roster）；tsgo/biome 绿

## 落地

- MERGE_COMMIT：`b8b81669ffb8aa69e50d9e03f86d2bb2b1512a3f`（tree 等价 ✓，远端一致）
- 归档：`archive/draft-abrupt-detach-discard` → `ef0b799328d8105521279be6dfc65dcb07c13814`，四方核对 OK
- 复审（独立子代理）：PASS——阻塞修复正确，两谓词子句互为兜底、对 roster 帧时序不敏感、误停场景逐一排除
- 清理：本地/远端 active 已删（guard 授权通道），worktree 与实验环境（/tmp/draft-*）已清
- 交付：按用户要求**未安装**现役；批准后更新 ~/prime-agent-rlm → bad 之后构建重启即生效
- 待用户实测：日常关 iTerm 标签页后，agents view 历史 区不再新增"（无消息）"行
