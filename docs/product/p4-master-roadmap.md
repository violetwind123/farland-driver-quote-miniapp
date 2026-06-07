# P4 主路线图(全部任务总表)

> 单一事实来源。按**轨道**组织,取代散落的 D 编号。
> 图例:✅ 已完成并 commit · 🟡 已规划(有文档/规格,未执行)· ⛔ 被前置阻塞 · ▶️ 当前焦点

---

## 0. 当前定位

```
运营行程管理 → 司机/用车安排 → 客户行程预览 → 分享卡 → 客户查看 → 每日评价 → 服务质量沉淀
```

- **普通行程的"运营改行程闭环"已全线打通**:行程管理 → 行程编号 → 提交 JSON 覆盖 → 发布 → 客户刷新可见。
- **当前唯一硬骨头 = 091 三层硬编码**,它阻塞"所有行程统一数据驱动"。C1 baseline 已冻结,C2 091B 本地实验已证明通用 normalizer 能保留 36 张 day/timeline 卡;现在 ▶️ 当前焦点是 C3 回填 + 切构建分支。
- 其余(客户绑定收口、行程归属、评价系统)都是**并行增量**,无强依赖。

---

## 轨道 A · 行程交付管线(地基)

| 任务 | 目标 | 状态 |
| --- | --- | --- |
| A1 卡片 snapshot 契约(原 P4-D0) | 正式定义 canonical 卡片 schema(字段/可见性/安全边界) | ✅ 文档 commit |
| A2 normalizer 收口(原 P4-D0A) | 4 个 normalizer 默认透传 + 黑名单补强 + 受控可见性 | ✅ `ae7dc7f` |
| A3 schema 缺口补全 | 091B 验证后,补路线元数据 / Day7 文案等缺口槽位;C2 已暴露顶层 `destination_cards` 缺失和酒店/航班摘要重复派生问题 | 🟡 随 C3 |

---

## 轨道 B · 运营行程管理(单次行程操作)

| 任务 | 目标 | 状态 |
| --- | --- | --- |
| B1 行程管理列表(原 P4-D1) | 运营中心"行程管理",读 `customer_trips`,显示发布/版本/归属/已保存数 | ✅ `569b754`/`73b68f6` |
| B2 单行程页·真实预览(原 P4-D2A) | "进入客户真实页面"(只读)+ 返回 trip-management + Dashboard 旧入口降级 + "已保存人数" | ✅ `73b68f6` |
| B3 单行程页·覆盖 JSON(原 P4-D2C) | 粘贴新 JSON 覆盖(dry-run 校验 + 显式确认 + 重建草稿,不自动发布,091 排除) | ✅ `1ceb771` |

---

## 轨道 C · 091 去硬编码 ▶️ 当前焦点

> **目标(验收):091 全部信息卡片化 → 运营上传新 JSON 可改 091 的时间/顺序/地点,客户刷新可见。**
> 091 现为三层硬编码:① 构建层 `trip091CardSystem.js` · ② 渲染层 id 键 · ③ 渲染层内容键(酒店兜底)。
> 详见 `p4-091-hardcode-inventory-and-dehardcode-reference.md`。

| 任务 | 目标 | 状态 |
| --- | --- | --- |
| C0 硬编码总清单 | 三层耦合面完整地图 + 删除清单 | ✅ 文档 |
| C1 冻结 091 UI WIP | 把正在改的 `trip091CardSystem.js`/`day-detail`/`home`/`hotel-detail` 在稳定点提交,作为不动的对比基线 | ✅ `0423de2` |
| C2 091B 实验 | 新 id 的回填数据副本走通用管线,验证"纯数据能复现 091"、量出兜底补了什么 | ✅ `84d951d` |
| **C3 回填 + 切构建分支** | 091 文档回填数据 + 改走 `normalizeSnapshotV2`(灰度,有备份);先决策顶层 `destination_cards` 派生/读取兜底与酒店/航班 dedupe | ▶️ 当前焦点 |
| C4 删渲染兜底 | 删 `resolveKnownTrip091Hotel*`/`get091RouteMetaOverride`/刘女士 → **解锁:改酒店日期/预订/路线/客户名** | 🟡 待 C3 |
| C5 删构建硬编码 | 删 `trip091CardSystem.js` + `index.js` 091 分支/守卫,收口 | 🟡 待 C4 稳定 |

> **分段交付**:C3 已覆盖你的主诉求(时间/顺序/地点,走数据路径);C4 才补酒店日期/路线/客户名(被渲染兜底钉死的那组)。

---

## 轨道 D · 客户绑定与归属

| 任务 | 目标 | 状态 |
| --- | --- | --- |
| D1 取消分享卡预绑定(原 P4-D2B) | `createCustomerTripInvite` 停写 access;`saveCustomerTripToProfile` 为唯一写入口;invite 仅留 intended-customer 元数据 | 🟡 已规格化 |
| D2 计数口径收口 | `listOperatorTrips` 已保存数排除 `granted_source=operator_share_card`(内存过滤) | 🟡 随 D1 |
| D3 存量清理(原 P4-D2B-mig) | 历史 `operator_share_card` access:dry-run + 备份 + 回滚后清理 | 🟡 待 D1 上线 |
| D4 行程归属(原 P4-D3) | trip 指定 primary customer / family / traveler list(运营归属,**非 access**) | 🟡 规划 |

---

## 轨道 E · 服务评价(P5)

| 任务 | 目标 | 状态 |
| --- | --- | --- |
| E1 每日评价入口(原 P4-D4) | 每个 Day 卡旁生成评价卡路径 / 复制 / 查看提交数 | 🟡 规划 |
| E2 评价卡页面 + 提交(原 P5-1) | 客户打开 Day N 评价卡提交;锚点 `trip_id + day_no`;同家庭多 openid 各提交一次;不创建 access | 🟡 规划 |
| E3 评价结果汇总(原 P5-2) | 按 day/trip/driver/vehicle 汇总;低分自动标记跟进 | 🟡 规划 |

---

## 依赖与推荐顺序

```
A1✅ A2✅ ──→ A3🟡(随 C3)
B1✅ B2✅ B3✅                      ← 普通行程闭环,已通

C1✅ 冻结UI ─→ C2✅ 091B ─→ ▶️ C3 回填+切分支 ─→ C4 删渲染兜底 ─→ C5 删构建硬编码
                    └─→ 反哺 A3 schema 缺口

并行(无强依赖,可随时插入):
  D1→D2→D3、D4
  E1→E2→E3
```

**当前唯一卡点已解除 = C2(091B 本地实验) 已提交。** 下一步推进 C3,先决策通用路径的 canonical card source、顶层 `destination_cards` 派生/读取兜底、酒店/航班摘要去重,再设计可备份/可回滚的 091 切分支。

---

## 🚫 当前不做(防失控)

支付 · 地图 · 自动推送 · 完整 CRM · 司机评分公开页 · 评价大屏 · AI 情绪分析 · 积分 · 外部表格同步 · 自动生成全部评价卡。

---

## 文档索引

| 文档 | 用途 | commit |
| --- | --- | --- |
| `p4-d0-card-snapshot-contract-and-normalization.md` | A1 卡片契约 | ✅ `46dbcfc` |
| `p4-d0a-normalizer-faithful-passthrough-task.md` | A2 任务 | ✅ `46dbcfc` |
| `p4-d2c-customer-trip-json-overwrite-panel-task.md` | B3 任务 | ✅ `46dbcfc` |
| `p4-091-hardcode-inventory-and-dehardcode-reference.md` | C 轨道总参考 | ✅ `58911c9` |
| `p4-c3-091-data-driven-switch-plan.md` | C3 切通用管线决策方案 | 🟡 待提交 |
| `p4-master-roadmap.md`(本文件) | 全局总表 | ✅ `58911c9` |
