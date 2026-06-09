# P4 · 091 当前状态完整分析(为什么逻辑乱、根因、出路)

> 目的:把 091 当前"半迁移"造成的混乱一次摊清——所有入口、构建/服务路径、司机来源、矛盾点,
> 并给出干净的心智模型 + 两条出路。配套:`p4-c3b-091-rollback-to-consistent-task.md`(方案 B 执行)。

---

## 0. 一句话

**问题集中在 091 一条行程的"半迁移"状态——它同时卡在硬编码和通用两套系统之间。最近所有报错都是这一个根因的症状。普通行程 / 主流程没问题。**

---

## 1. 当前真实状态(事实)

| 对象 | 内容 | 含司机 |
| --- | --- | --- |
| `091.draft_snapshot` | **36 卡 · 通用(C3B 写入)** · 无身份 | ❌ 已剥离 |
| `091.published_snapshot` | **v24 · 33 卡 · 硬编码** | ✅ 内嵌(林飞航/LUM5388) |
| `visibility_status` | `published` | |
| `review_status` | `needs_review` | |

客户和几乎所有预览看到的都是 **v24 硬编码**;那份 36 卡通用草稿**只在运营单行程页的"草稿预览"tab 可见**。

---

## 2. 全入口映射

| 入口 | 云函数 | 服务/构建哪份 | 091 司机来源 |
| --- | --- | --- | --- |
| 运营·内联草稿/已发布 tab | `getOperatorTripPreview`(compact) | draft(36通用)+ published(v24) | 草稿无 / v24 有 |
| 运营·进入客户真实页面 / 客户界面预览 | `getOperatorCustomerHomePreview` | **isPublished→published(v24)** | ✅ v24 硬编码(LUM5388) |
| 运营·"生成客户可见草稿"按钮 | `buildCustomerTripVisibleDraft`(**无 token**) | **091→硬编码重建** | ⚠️ 重新内嵌司机 |
| 运营·覆盖 JSON apply | `buildCustomerTripVisibleDraft`(**无 token**) | 同上,硬编码 | ⚠️ 同上 |
| 运营·发布 | `publishCustomerTrip` | 当前 draft → published | — |
| 客户·已保存 | `getCustomerHome` | published(v24)+ 运行时投影 | v24 内嵌 + transport 投影叠加 |
| 客户·分享卡 invite | `getCustomerTripByInvite` | published(v24)+ 0c2d7c0 投影 | v24 内嵌(投影未触发) |
| C3B 那次写入 | `buildCustomerTripVisibleDraft`(**带 token**) | 091→**通用**,无身份 | 无 |

**构建路径分支(`index.js:823`):** `091+无token→硬编码(默认)` / `091+有token→通用` / `非091→通用`。

---

## 3. 症状 → 根因(五个症状一个根)

| 症状 | 根因 |
| --- | --- |
| "生成草稿"→ **3s 超时**(FUNCTIONS_TIME_LIMIT_EXCEEDED) | `backupTrip091OriginalDoc` 每次把整份 ~1.3MB 文档写进 audit_logs + 大快照,超了 3s。**091 专属**,普通行程不触发 |
| draft 通用 / published 硬编码 并存 | C3B 只切了 draft,没动 published |
| 运营按钮会回退 C3B | 按钮不带 token → 默认硬编码 → 会覆盖通用草稿。UI 与迁移方向相反 |
| 司机一会儿有一会儿要 pending | 司机三来源:硬编码内嵌 / 通用剥离 / transport_orders 投影 |
| D-1 假阳性、司机可能消失 | 091 没有真实 transport_orders 行 → 发布通用草稿后投影没东西 → 司机掉 pending |

> 超时反而在"保护":它挡住了硬编码重建,否则早把 C3B 通用草稿误覆盖了。

---

## 4. 为什么会这样

C3B 用"**默认硬编码、临时传 token 才走通用**"去切一条**线上活跃行程**,而 UI / 发布 / 渲染层全默认硬编码——
这种"半切"本身必然产生互相矛盾的中间态。后续几轮一直在这个脆弱中间态上打补丁,所以不断冒新症状。

---

## 5. 干净的心智模型(应有不变量)

- **一条行程一条构建路径**,由**稳定配置**(doc 标志位)决定,不是每次调用传 token。
- **draft 与 published 同源**(要么都硬编码、要么都通用),不长期并存。
- **司机只有一个来源**:transport_orders 运行时投影;快照永不内嵌。
- **运营按钮行为与迁移方向一致**,不默认走回退路径。

现状违反全部四条——这是"乱"的总根源。

---

## 6. 两条出路

**A. 往前切到底(中期):** 解 D-1(建真实 transport_orders 行)→ 构建默认改通用(doc 标志位)→ 重建+发布通用 → C4 删渲染兜底 → C5 删硬编码 + 1.3MB 备份(超时随之消失)。终态干净,但动得多。

**B. 先回退到一致(短期,推荐):** 用 C3B 完整备份把 091 的 draft 恢复成 v24 同源 → 091 回到"纯硬编码、draft/published 一致"。**五个症状同时消失,客户零影响**(本就看 v24)。C3B 成果不丢(备份 + canonical source + 091B 沙盒里),将来用干净方式重做。

**推荐:短期 B、中期 A。** B 用一次恢复把当前乱源清零、风险归零;A 当成"D-1 先解决、默认位切换、渲染层一起清"的完整一轮,不再半切。

执行见 `p4-c3b-091-rollback-to-consistent-task.md`(B 已门控、可逆、零客户影响;pre-C3B 备份实测存在且内容验证通过,但记录哈希已过期,改用内容验证门)。
