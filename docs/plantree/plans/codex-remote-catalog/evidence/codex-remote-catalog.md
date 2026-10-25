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
