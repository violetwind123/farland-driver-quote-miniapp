# P4-D0 · 091 地面真相只读核查(给 Codex)

> 🔒 **严格只读。** 本任务**不写库、不部署、不调用任何会写的云函数、不发布、不改文件**。
> 目的:在执行方案 B(091 回退,会写生产)之前,把"分析"对齐"现实"——
> 当前所有结论都是从**本地仓库 + C3B 证据**推出来的,需用**git / 线上 DB 只读 / 部署代码**核实。
>
> ⚠️ 已知:`codex/091-customer-card-ui` 领先 `origin/main` 约 **42 个 commit**。所以"部署的是哪条分支"会改变答案。

---

## 要回答的 4 个问题 + 怎么查(全只读)

### Q1 · 当前 main 有没有 `trip091CardSystem`(以及关键差异)
```bash
git fetch origin
git ls-tree -r origin/main --name-only -- cloudfunctions/buildCustomerTripVisibleDraft/
# 关注:trip091CardSystem.js 是否存在于 main
git diff --stat origin/main..HEAD -- cloudfunctions/buildCustomerTripVisibleDraft/
# 关注 index.js / trip091CardSystem.js 在 main vs 本分支的差异量
git log origin/main..HEAD --oneline -- cloudfunctions/buildCustomerTripVisibleDraft/ | cat
```
**报告:** main 是否有 trip091CardSystem;main 的 index.js 是否含 C3B 开关(`TRIP091_GENERIC_SWITCH_TOKEN`)、嵌套身份剥离(`sanitizeTransportSummary`)、守卫的 36 卡值。**关键:确认实际部署到云端的是哪条分支/哪个版本**(若无法从 git 确定,在云开发控制台看 `buildCustomerTripVisibleDraft` 已部署版本的源码,只读)。

### Q2 · 云函数实际构建路径(091 当前 draft 是哪条路建的)
> **不要调用 `buildCustomerTripVisibleDraft`(它会写)。** 用既有审计记录推断:
```
只读查 audit_logs:source_doc_id / target_id = bf757c4c6a2054f800350a925147b32e
按 created_at 倒序,看最近一条 091 build 的 detail.trip091_build_path
  = 'generic_normalize_snapshot_v2'(通用) 还是 'trip091_card_system'(硬编码)
```
**报告:** 当前 091 draft 是用哪条路径构建的(应为 `generic_normalize_snapshot_v2`,即 C3B);并对照**部署代码的默认分支**(无 token 时走哪条)。

### Q3 · draft / published 分别是什么版本(线上 DB 只读)
```
只读 db.collection('customer_trips').doc('bf757c4c6a2054f800350a925147b32e').get()
报告:
  visibility_status / review_status / published_version
  draft_snapshot.destination_cards.length        (预期 36 = C3B 通用)
  draft_snapshot 各 day.destination_cards 计数     (预期 [4,3,9,4,3,4,7,2])
  published_snapshot.destination_cards.length     (预期 33 = v24 硬编码)
  published_snapshot 各 day 计数                   (预期 [4,3,6,4,3,4,7,2])
  draft 里 transport_summary 是否含司机身份 / driver_visibility
  published 里 transport_summary 是否含司机身份(预期含,硬编码)
```
**报告:** 验证"draft=36通用 / published=v24-33硬编码"是否仍成立(B 的前提),以及司机在两份里的实际形态。

### Q4 · 哪些入口读 draft、哪些读 published(代码 grep,对照本分支)
```bash
# 服务侧
grep -nE "draft_snapshot|published_snapshot|getOperatorPreviewSnapshot|normalizePublishedSnapshot" \
  cloudfunctions/getOperatorTripPreview/index.js \
  cloudfunctions/getOperatorCustomerHomePreview/index.js \
  cloudfunctions/getCustomerHome/index.js \
  cloudfunctions/getCustomerTripByInvite/index.js
```
**报告(对照下表,确认或修正):**

| 入口 | 预期读 | 核实 |
| --- | --- | --- |
| `getOperatorTripPreview` | draft + published(compact) | |
| `getOperatorCustomerHomePreview` | `isPublished?published:draft`(091→published v24) | |
| `getCustomerHome` | published(+ 运行时投影) | |
| `getCustomerTripByInvite` | published(+ 0c2d7c0 投影) | |
| 运营 buildDraft / 覆盖 apply | 写 draft(091 无 token→硬编码) | |
| 运营 发布 | draft→published | |

---

## 输出

返回一份 Markdown:
- Q1–Q4 各一段结论 + 证据(命令输出 / DB 读数 / 行号);
- 一句话:**"分析与现实一致 / 有以下偏差:…"**;
- 若发现 **draft 不是 36 / published 不是 v24-33 / 部署分支不是本分支**,**立即标红**——因为 B 的前提会变。

## 约束(再次)
- 只读:`.get()` / `git` / `grep` / 控制台看源码。**禁止** `.set/.update/.add/.remove`、禁止调 build/publish/import、禁止部署、禁止改文件。
- 不动 091 文档、不动其它集合。
- 这一步**不需要**任何批准(纯只读);它的产出是"B 是否可按现有前提执行"的依据。
