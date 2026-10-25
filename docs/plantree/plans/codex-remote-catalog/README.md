# codex-remote-catalog

## 目标
openai-codex 的模型列表动态化：从 pi.dev 公开目录（https://pi.dev/api/models/providers/openai-codex，上游 pi 1.2.0 同款机制，带完整元数据）拉取，与内置清单合并显示。OpenAI 出新模型 → pi.dev 更新 → prime 自动出现，无需改代码。**纯自用，不提 PR。**

## 机制（镜像 fork 现有 prime-inference 目录刷新范式）
- 磁盘缓存：`~/.prime/agent/models-store.json`（openai-codex 条目：models + checkedAt + etag + lastModified；原子写 0600）
- TTL 4 小时 + etag if-none-match 304 重验证；未过期/离线/拉取失败 → 回落缓存与内置清单（pi 同款容错）
- 合并语义：内置 codex 清单 ∪ 目录（同 id 目录条目覆盖内置，内置独有保留）
- 接线：`loadModels()` 同步读磁盘缓存；`refreshAvailableModels()` 挂后台刷新（pendingCodexCatalogRefresh → 完成后 `reloadModelsAfterCatalogChange()` 重建 this.models），镜像 pendingPrimeInferenceCatalogRefresh 的既有写法
- `getExecutableModels()` 账号目录交集逻辑不动（对合并后列表继续生效）

## Scope
- 新文件 `packages/coding-agent/src/core/openai-codex-remote-catalog.ts`（解析/缓存/刷新/合并）
- `packages/coding-agent/src/core/model-registry.ts` 接线（loadModels 合并 + refreshAvailableModels 后台刷新 + 实例字段）
- 新测试 `packages/coding-agent/test/openai-codex-remote-catalog.test.ts`（mock fetchFn）
- CHANGELOG Unreleased

## 明确不做
- 不提 PR（自用）
- 不做其他 provider 的目录（仅 openai-codex）
- 不做 models.json 自定义 provider 的动态化

## 门禁
tsgo / biome / coding-agent 相关测试 / build / pre-commit 全链 + 百炼 kimi 独立审查
