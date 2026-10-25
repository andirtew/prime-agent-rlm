# Evidence — codex-remote-catalog

## 实现
- 新文件 `packages/coding-agent/src/core/openai-codex-remote-catalog.ts`（~230 行）：
  - `refreshCodexRemoteCatalog(cachePath, bundled, {fetchFn, offline, force})`：4h TTL 磁盘缓存（`openai-codex-catalog-cache.json`，原子写 0600）、etag if-none-match 304 重验证、空 body 不带 validator、pendingRefreshes 并发去重、网络失败/空目录回落缓存、离线模式直读缓存
  - `mergeCodexCatalogModels(models, catalog)`：目录同 id 覆盖内置（新元数据）、目录独有追加、其他 provider 直通
  - `parseCodexModel`：字段逐项校验，缺省回退同 id 内置条目再回退保守默认（ctx 272000 / maxTokens 128000 / 零成本）；baseUrl/api/provider 强制锚定 codex 值
- `model-registry.ts` 接线（镜像 prime-inference 目录刷新范式）：
  - `loadModels()`：同步读磁盘缓存 → `liveCodexCatalogModels` → `mergeCodexCatalogModels` 覆盖 combined 的 codex 段（OAuth modifyModels 之后、`this.models = combined` 之前）
  - `refreshAvailableModels()`：挂 `pendingCodexCatalogRefresh` 后台刷新（offline 尊重 PI_OFFLINE）→ 完成后 `reloadModelsAfterCatalogChange()` 重建
  - `waitForPendingModelRefreshes()` 等待 codex 刷新落定（会话模型恢复场景）
  - `getExecutableModels()` 账号目录交集不动：显示 =（内置 ∪ 目录）∩ 账号可用
- 修复一个实现期发现的真 bug：pending 去重链 `void promise.finally()` 在网络失败时产生 unhandledRejection（测试实测抓到），改为 `.catch(() => undefined).finally(...)`

## 实测依据
- pi.dev 目录端点公开无认证、返回完整元数据（2026-10-25 实测：gpt-6-astra 等 7 模型，含 cost/contextWindow）
- 账号目录交集侧：fork 注释记载 0.153.x 起账号目录列出 GPT-6 Astra，客户端版本常量 0.159.0 已足够

## 门禁（worktree 实跑）
- tsgo --noEmit：exit 0
- biome check（3 触碰文件）：过（--write 自动修 3 处格式后复检干净）
- 新测试 `openai-codex-remote-catalog.test.ts`：11/11（merge 语义 2、缓存读取 2、刷新 7：TTL 短路/etag 重验证+写盘/304 保缓存/网络回落/空目录不清缓存/并发去重/离线）
- 回归：model-registry 72 + audit/schema-drift 12 + settings-manager 85 全过
- 待 commit：pre-commit 全链 + npm run build

## 审查与落地（2026-10-25）

- 独立审查（百炼/kimi-k3，prime CLI --print 非交互）：首轮 **FAIL**——必修：merge 时机在用户 overrides/custom models 之后（用户配置被静默丢弃）；另 5 低危（负缓存缺失/checkedAt 未来无校验/重复 id/死字段/测试风格）
- 修复：merge 移入 loadBuiltInModels（overrides 之前，对齐 prime-inference 范式）+ 负缓存 + isPlausibleCheckedAt 双读路径 + payload 去重 + lastModified 死字段清理 + 测试转 vitest；新增用户覆盖优先的集成回归用例（models.json 自定义 gpt-5.1 cost=7 压过目录条目 99）
- 复审（kimi-k3）：**PASS**；采纳其一行加固建议（raw 读路径同校验），第三个 commit
- 期间另修实现期自抓 bug：pending 去重链 unhandledRejection
- SOURCE_TIP：`6bd829f9714837b3321add1bc4c79f1ed72c43b9`（3 commit：feat + fix(审查) + fix(一行加固)，pre-commit 全链绿）
- MERGE_COMMIT：`cd33eca67`（tree 等价 ✓，远端核对一致）；归档 `archive/codex-remote-catalog` 四方核对 OK；active 分支与 worktree 已清理
- 不提 PR（纯自用）；CHANGELOG 直写 [Unreleased]（fork 的 .changes/ fragment 规则为上游 PR 流程，自用分支不适用）
