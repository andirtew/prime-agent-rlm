# Roadmap — codex-remote-catalog

## Done

- [x] 阶段0-8 全链：实现（目录拉取+缓存+合并+registry 接线）→ 14/14 测试 + 回归 98 → kimi 审查 FAIL→修复→复审 PASS → 合并 `cd33eca67`（tree 等价 ✓）→ 归档 `archive/codex-remote-catalog` → 清理 → 落地
- [x] `codex-catalog-dict-form`：pi.dev 实际按模型 id 键字典返回目录，原解析只认数组/信封导致恒为空并负缓存 4h。`catalogEntries()` 统一三形式（解析+持久化共用），测试 16/16、回归 72/72，kimi 独立复核 PASS。合并 `101606e9b`（tree 等价 ✓）→ 归档 `archive/codex-catalog-dict-form` → 清理 → 落地。计划见 [topics/dict-payload-fix.md](topics/dict-payload-fix.md)

## In Progress

- [ ] `codex-catalog-thinking-map`：目录合成模型丢失 thinkingLevelMap，xhigh/max 被判不支持。计划见 [topics/thinking-level-map-fix.md](topics/thinking-level-map-fix.md)

## Next

- [ ] 用户重启 prime 实测：/model 列表出现 GPT-6 Astra 等目录模型（依赖 dict-form 修复合并）

## Deferred

（无）
