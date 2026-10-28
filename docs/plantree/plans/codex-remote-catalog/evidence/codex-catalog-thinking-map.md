# Evidence — codex-catalog-thinking-map

## 根因（已核实）

- pi.dev 目录条目带 `thinkingLevelMap`（实测 gpt-6-astra：off:null / minimal~max 全表，max:xhigh 显式声明）。
- fork 的 `parseCodexModel` 不解析该字段 → 目录合成模型无 map。
- 档位判定 `getSupportedThinkingLevels`（pi-ai models.ts）：`xhigh`/`max` 必须在 map 显式声明；`null`=不支持；普通档位缺省=可用（provider 默认）。
- 内置清单 openai-codex 段也无 map。→ 用户 `/effort max` 被 clamp 回 high（"Model ... does not support thinking level max"），请求层实际支持。

## 实现

- `parseCodexModel` 新增 `parseThinkingLevelMap`：record → 收录 value 为 `string|null` 的键（键 cast 到 `ModelThinkingLevel`，未知键无害——判定只读已知档位）；无合法对 → undefined。
- 回退链：目录条目 map → 同 id 内置条目 map → 不带字段（现状行为）。整表替换（pi.dev 下发完整表，逐键合并会残留旧键）。
- 缓存路径无需改动：`rawEntries` 按原始条目存盘，map 随条目完整往返。
- 测试 +3：目录 map 解锁 xhigh/max（含 off:null、缺省档位语义）；内置 map 回退；非法 value 跳过且 null 语义保留。

## 门禁（worktree 实跑）

- `vitest openai-codex-remote-catalog.test.ts`：**19/19**（含新 3 例）
- `vitest model-registry.test.ts`：**72/72**（回归）
- `tsgo --noEmit`：exit 0（初版有键类型错误，cast 到 `ModelThinkingLevel` 后通过）
- `biome check`（2 触碰文件）：`--write` 修 1 处格式后复检干净
- pre-commit（`npm run check` 全链）：commit 时执行，结果见提交信息
- 未跑：`npm run build`（安装时另行构建，本任务不安装现役）

## 实现期自抓问题

- 首版测试断言写错档位语义（以为普通档位缺省=不可用；实际只有 xhigh/max 受显式声明约束，`null` 才是显式禁用）——跑测失败后按 `getSupportedThinkingLevels` 真实语义修正断言，并顺带在用例里把这个语义文档化。

## Review

- 实现自审：PASS（见上）
- 独立复核（阶段 4）：见下

## 独立复核（阶段 4）

- 复核人：百炼/kimi-k3（prime CLI 非交互，独立会话，cwd=worktree）
- 复核人自行动作：逐行审查、独立重跑 91/91、写探针实测缓存往返（带 off:null 的 map 落盘重读完整）、核实请求层消费（openai-codex-responses.ts 用 thinkingLevelMap?.[effort] ?? effort 翻译档位）、核实用户 override 路径无共享引用突变
- 结论：**PASS**，无阻塞问题
- 低危 1（已采纳）：缺 changelog——按自用分支惯例直写 [Unreleased]（走了计划 Scope 增补流程：main 更新计划 → active 同步合并 → 补条目，91/91 复跑）
- 低危 2（记录不采纳改动）：未知键透传——消费方只读已知档位键，确无影响，注释已声明语义
- SOURCE_TIP：`c82b4b82dbbb25de465c2d1135d5121623ca414e`（2+1 commit：feat + merge/changelog）
