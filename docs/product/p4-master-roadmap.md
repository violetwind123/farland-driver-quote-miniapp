# P4 主路线图(全部任务总表)

> 单一事实来源。按**轨道**组织,取代散落的 D 编号。
> 图例:✅ 已完成并 commit · 🟡 已规划(有文档/规格,未执行)· ⛔ 被前置阻塞 · ▶️ 当前焦点

---

## 0. 当前定位

```
运营行程管理 → 司机/用车安排 → 客户行程预览 → 分享卡 → 客户查看 → 每日评价 → 服务质量沉淀
```

- **普通行程的"运营改行程闭环"已全线打通**:行程管理 → 行程编号 → 提交 JSON 覆盖 → 发布 → 客户刷新可见。
- **当前唯一硬骨头 = 091 三层硬编码**,它阻塞"所有行程统一数据驱动"。C1 baseline 已冻结,C2 091B 本地实验已证明通用 normalizer 能保留 36 张 day/timeline 卡;C3A 已让通用路径具备顶层 `destination_cards` parity 和酒店/航班去重。C3B 官方 091 source/draft 写入已按批准执行并在模拟器验证运营详情可加载;客户可见版本仍停在 published v24,尚未发布新草稿。`0c2d7c0` 已补 invite/share-card 的运行时用车投影代码,部署后真实 active invite 验证了 `temporary_invite` 不自动保存、敏感字段扫描为空;但 Day 4 司机来自 v24 硬编码快照透传(`status_text=车辆与司机已确认` ≠ 投影输出 `已分配司机`),`0c2d7c0` 的 `transport_orders` 投影未确认触发——发布无身份通用草稿后司机能否显示仍属 D-1 未验证项。
- 服务评价云函数已部署到 `cloud1-d3gmbz2bw024f051b`;开发者工具模拟器已验证运营「评价汇总」页可打开并显示空态。真机验证待用户返回后补。
- 其余(行程归属、历史 access 清理)都是**并行增量**,无强依赖。

---

## 轨道 A · 行程交付管线(地基)

| 任务 | 目标 | 状态 |
| --- | --- | --- |
| A1 卡片 snapshot 契约(原 P4-D0) | 正式定义 canonical 卡片 schema(字段/可见性/安全边界) | ✅ 文档 commit |
| A2 normalizer 收口(原 P4-D0A) | 4 个 normalizer 默认透传 + 黑名单补强 + 受控可见性 | ✅ `ae7dc7f` |
| A3 schema 缺口补全 | 091B 验证后,补路线元数据 / Day7 文案等缺口槽位;C3A 已补顶层 `destination_cards` 派生和酒店/航班摘要去重,剩余缺口随 C3B/C4 实切验证反哺 | 🟡 随 C3B/C4 |

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
| C3A 通用路径兼容 | 补 `normalizeSnapshotV2` 顶层 `destination_cards` 派生、酒店/航班摘要去重、非 091 timeline-only 回归验证;无生产写入 | ✅ `a695821` |
| **C3B 回填 + 切构建分支** | 真实 091 文档回填数据 + 改走 `normalizeSnapshotV2`(灰度);source/draft 已写入并模拟器验证运营详情可加载。`0c2d7c0` 已补 invite/share-card 从 `transport_orders`/linked `ride_requests` 运行时投影司机/车辆;部署后真实 active invite 验证 `temporary_invite` 不自动保存、敏感扫描为空;Day 4 司机可见但来自 v24 硬编码透传(非 `0c2d7c0` 投影,status 不匹配),发布前需确认真实 `transport_orders` 行或接受 pending;客户可见发布仍需单独批准 | ▶️ 当前焦点 · 待发布决策 |
| C4 删渲染兜底 | 删 `resolveKnownTrip091Hotel*`/`get091RouteMetaOverride`/刘女士 → **解锁:改酒店日期/预订/路线/客户名** | 🟡 待 C3 |
| C5 删构建硬编码 | 删 `trip091CardSystem.js` + `index.js` 091 分支/守卫,收口 | 🟡 待 C4 稳定 |

> **分段交付**:C3 已覆盖你的主诉求(时间/顺序/地点,走数据路径);C4 才补酒店日期/路线/客户名(被渲染兜底钉死的那组)。

---

## 轨道 D · 客户绑定与归属

| 任务 | 目标 | 状态 |
| --- | --- | --- |
| D1 取消分享卡预绑定(原 P4-D2B) | `createCustomerTripInvite` 停写 access、仅存 intended-customer 元数据;`saveCustomerTripToProfile` 一律写 `granted_source=invite_save`;导入页孤儿投递面板已移除 | ✅ `73b68f6` / `363148a` |
| D2 计数口径收口 | `listOperatorTrips` 已保存数排除 `granted_source=operator_share_card`(内存过滤) | ✅ `73b68f6` |
| D3 存量清理(原 P4-D2B-mig) | 历史 `operator_share_card` access:dry-run + 备份 + 回滚后清理 | 🟡 待 D1 上线 |
| D4 行程归属(原 P4-D3) | trip 指定 primary customer / family / traveler list(运营归属,**非 access**) | 🟡 规划 |

---

## 轨道 E · 服务评价(P5)

| 任务 | 目标 | 状态 |
| --- | --- | --- |
| E1 每日评价入口(原 P4-D4) | trip-detail 每日卡:生成 Day N 评价卡(自动复制路径)/ 复制路径 / 内联查看反馈 + 份数均分 | ✅ `e736c54` |
| E2 评价卡页面 + 提交(原 P5-1) | `pages/customer/review-card` + 4 个云函数;锚点 `trip_id + day_no`;同 openid 同 day 幂等;打开/提交均不创建 access;max_openids/过期/白名单/低分标记 | ✅ `e736c54` / 已部署 `createRideReviewInvite`、`getRideReviewContext`、`submitRideReview`、`listRideReviewsForOperator`;真机待验 |
| E3 评价结果汇总(原 P5-2) | 单行程:`listRideReviewsForOperator`(day/driver 汇总+低分标记);跨行程:`listDriverReviewSummaries` + 运营「评价汇总」页(按司机/行程、低分跟进列表、未归因桶) | ✅ `e736c54` / `ce04c14`;`listDriverReviewSummaries` 已部署,模拟器空态通过;真机待验 |

---

## 依赖与推荐顺序

```
A1✅ A2✅ ──→ A3🟡(随 C3B/C4)
B1✅ B2✅ B3✅                      ← 普通行程闭环,已通

C1✅ 冻结UI ─→ C2✅ 091B ─→ C3A✅ 通用兼容 ─→ ▶️ C3B 草稿已切/待发布决策 ─→ C4 删渲染兜底 ─→ C5 删构建硬编码
                    └─→ 反哺 A3 schema 缺口

并行(无强依赖,可随时插入):
  D1→D2→D3、D4
  E1→E2→E3
```

**当前唯一卡点 = C3B 发布决策。** 官方 091 source/draft 已写入并通过模拟器运营详情页复验;下一步不能自动发布、上传或继续写生产数据。`0c2d7c0` 已补客户 invite/share-card 运行时用车投影,部署后真实 active invite 模拟器确认 `getCustomerTripByInvite` 返回 `temporary_invite`、不自动保存、敏感字段扫描为空;但 Day 4 司机(林飞航)来自 v24 硬编码快照透传(`status_text=车辆与司机已确认` ≠ 投影输出 `已分配司机`),`transport_orders` 投影未确认触发,故 D-1 在"发布后通用草稿"上的司机显示仍未验证。发布前须确认 091 真实 `transport_orders` 行(令投影生效)或接受 pending,并保留完整回滚路径、由你单独批准。

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
| `p4-091b-local-normalizer-experiment-report.md` | C2/C3A 本地验证证据 | ✅ `84d951d` / `a695821` |
| `p4-c3-091-data-driven-switch-plan.md` | C3 切通用管线决策方案 | ✅ `b94f4af` |
| `p4-c3b-091-live-switch-execution-checklist.md` | C3B 生产切换执行清单 + 091B 证据 + 写入前决策护栏 + 最终 guardrail 澄清 | ✅ `f42a25a` / `74fa983` / `9e37325` / `b6b48e5` |
| `p4-c3b-091-official-write-approval-packet-template.md` | C3B 正式写入前 approval packet 模板 | ✅ `852a5e2` |
| `p4-master-roadmap.md`(本文件) | 全局总表 | ✅ `58911c9` |
