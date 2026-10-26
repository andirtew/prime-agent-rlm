# Roadmap — codex-remote-catalog

## Done

- [x] 阶段0-8 全链：实现（目录拉取+缓存+合并+registry 接线）→ 14/14 测试 + 回归 98 → kimi 审查 FAIL→修复→复审 PASS → 合并 `cd33eca67`（tree 等价 ✓）→ 归档 `archive/codex-remote-catalog` → 清理 → 落地

## In Progress

- [ ] `codex-catalog-dict-form`：修复 pi.dev 字典格式 payload 解析为空（负缓存 4h）的问题，计划见 [topics/dict-payload-fix.md](topics/dict-payload-fix.md)

## Next

- [ ] 用户重启 prime 实测：/model 列表出现 GPT-6 Astra 等目录模型（依赖 dict-form 修复合并）

## Deferred

（无）
