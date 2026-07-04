# P4 · 运营主流程规格(行程管理 → 预览发布 → 客户查看 → 每日评价)

> ⚠️ **已被 F5 更新(2026-07):行程创作改为 web 权威。** 小程序 JSON 导入口子(`customer-import`、
> 覆盖 JSON 面板、`importCustomerTripJSON` 云函数)已全部删除;行程由 web 端写 `customer_trips` source,
> 运营在小程序只做「生成草稿 → 预览 → 发布 → 分享卡」。**本文中所有"粘贴/覆盖 JSON"节点视为历史**,
> 现行合约见 `f5-web-authored-trips-contract.md`。下文其余(build/publish/分享/评价)仍准确。

> 目的:把"运营怎么管一条行程"的**目标流程**定清楚,标出每个节点的现状(✅有 / ⚠️半 / ❌缺),
> 并把缺口的完整逻辑补上。这是干净的**数据驱动主流程**——普通行程都走它;091 是唯一例外(单独处理)。
>
> 配套文档:`p4-master-roadmap.md`(全局进度)、`p4-d0-091-card-pipeline-state-analysis`(091 半切混乱分析)、
> `p4-091-hardcode-inventory-and-dehardcode-reference.md`(091 去硬编码)。

---

## 0. 一句话定位

**普通行程的"导入 → 生成预览 → 进入预览 → 发布 → 客户查看"主干已 90% 打通。**
真正要补的只有两块:① **增加行程的引导流没串顺**;② **整套每日评价系统从零**。
091 因为硬编码 + 半切,是唯一不适配这条流的行程,**与主流程建设解耦**。

---

## 1. 目标流程

```
运营中心(dashboard)
└── 行程管理(trip-management:所有行程 + 状态)
      ├── [+ 增加行程] ── 粘贴标准 JSON ── 生成预览 ── 进入预览界面 ── 发布
      └── 点某条行程 ── 单行程管理页(customer-trip-detail)
            ├── 状态头部:review_status / visibility_status / version
            ├── 草稿 / 已发布 快照预览(inline tabs)
            ├── 覆盖 JSON(改时间/顺序/地点)
            ├── 进入客户真实页面(只读,= 客户所见)
            ├── 发布 + 客户分享卡
            ├── 行程概览(可折叠)
            └── 每日评价卡(Day1 / Day2 … 各一张,分开)
→ 客户查看(分享卡 invite / 已保存 My Farland)
→ 客户每日提交评价(家庭群多人各一次)
→ 运营看评价汇总(按 day / trip / driver / vehicle)
```

---

## 2. 逐节点现状

| 节点 | 现状 | 实现位置 |
| --- | --- | --- |
| 运营中心 → 行程管理(列表 + 状态) | ✅ | `trip-management`(B1 `569b754`/`73b68f6`);读 `listOperatorTrips` |
| ~~增加行程(粘贴 JSON)~~ | ❌ 已删(F5) | 小程序 JSON 导入已移除;行程由 web 端写 `customer_trips`,见 `f5-web-authored-trips-contract.md` |
| 生成预览(build draft) | ✅ | `customer-trip-detail` "生成客户可见草稿" → `buildCustomerTripVisibleDraft`(091 例外) |
| 进入预览界面 | ✅ | "进入客户真实页面"(D2A `73b68f6`)→ `getOperatorCustomerHomePreview` → mobile-preview |
| ~~覆盖 JSON 改行程~~ | ❌ 已删(F5) | 覆盖面板 + `importCustomerTripJSON` 已移除;改行程走 web 重写 source + 运营重新发布 |
| 发布 + 分享卡 | ✅ | `publishCustomerTrip` / `createCustomerTripInvite` |
| 客户查看 | ✅ | `getCustomerHome`(已保存)/ `getCustomerTripByInvite`(invite) |
| 行程概览折叠 | ⚠️ 小缺 | 概览/每日卡缺折叠交互(纯 UI) |
| **每日评价卡(Day 分开)** | ❌ **全缺** | 只有文案("发送每日评价卡"),无云函数、无页面、无集合 |

---

## 3. 缺口① · 增加行程引导流(小,先做)

**现状(6 步手动):** 导入页粘 JSON → apply → 回列表 → 找到那条 → 开详情 → 生成草稿 → 预览 → 发布。

**要补的逻辑:** 让它变成连续 4 步「粘 JSON → (自动建草稿) → 进预览 → 发布」。
- `customer-import` apply 成功后,**`redirectTo` 到该行程的 `customer-trip-detail`**(而非旧的 customer-home-preview),
  并在该页 `onLoad` 后**自动触发一次 build draft**,运营直接落在"预览 / 发布"那一步。
- 入口文案统一:`trip-management` 顶部"导入"按钮即"增加行程"。

**约束:** 不改 import/build/publish 云函数;只调整跳转目标 + 一次自动建草稿。091 排除(它走不了这条,且 build 会超时)。

---

## 4. 缺口② · 每日评价卡(Day1/Day2 分开)—— 完整设计

> 沿用初版备忘 P5 方案。锚点 = `trip_id + day_no`;当天有用车再双写 transport/driver/vehicle 以沉淀司机质量。

### 4.1 数据模型(新集合)
```jsonc
// service_review_invites —— 每张评价卡一条
{ trip_id, day_no, invite_code, status: 'active|revoked|expired',
  expires_at, max_openids?, created_by, created_at }

// ride_service_reviews —— 每次提交一条
{ trip_id, day_no, openid, rating, tags: [], text,
  // 当天有用车时双写(司机质量沉淀):
  transport_order_id, driver_id, vehicle_id,
  submitted_at }

// service_review_events —— 打开/提交审计(不建 access)
{ trip_id, day_no, openid, event: 'opened|submitted', at }
```

### 4.2 云函数(全新)
| 函数 | 职责 |
| --- | --- |
| `createRideReviewInvite(trip_id, day_no)` | 运营生成 Day N 评价卡 + 路径;可设过期/撤销/max_openids |
| `getRideReviewContext(invite_code)` | 客户打开时只读返回当天上下文(行程名、Day、当天概要);**不写 access** |
| `submitRideReview({invite_code, rating, tags, text})` | 提交评价;**同 openid 同 day 幂等(只一次)**;**不创建 customer_trip_access** |
| `listRideReviewsForOperator(trip_id)` | 运营看提交明细 + 按 day/trip/driver/vehicle 汇总;低分标记需跟进 |

### 4.3 运营侧(`customer-trip-detail`,每个 Day 卡旁)
- `[生成 Day N 评价卡]` → 生成/复用 `service_review_invites` → 微信转发评价卡;复制路径仅作兜底。
- 显示该 Day "已提交 X 份"。
- **Day1 / Day2 各一张独立卡 + 独立 invite**,互不影响。

### 4.4 客户侧(新页面 `pages/customer/review-card`)
```
/pages/customer/review-card?trip_id=xxx&day_no=N&invite_code=xxx
打开 = 只读当天 + 评分(星)/ 标签 / 文字 → 提交
```
- 家庭群多 openid **各自提交一次**;打开/提交**都不创建** `customer_trip_access`。
- 提交后显示"已收到反馈",同 openid 再开显示已提交。

### 4.5 关键规则(与客户绑定边界一致)
- 锚点 `trip_id + day_no`;Day 之间完全独立。
- 一个 openid 一天只能交一次(幂等)。
- **打开/提交评价 ≠ 绑定客户**(永不写 access)。
- invite 可过期 / 撤销 / 限 max_openids。
- 汇总按 day/trip/driver/vehicle;低分自动标记。

---

## 5. 缺口③ · 行程概览折叠(纯 UI,随手)

`customer-trip-detail` 的"今日/行程概览 + 每日卡"加折叠/展开,运营扫多条/多天时不必无限滚动。低优先。

---

## 6. 091 在这条流里的位置(单独,别混进主流程)

这条流是数据驱动管线。**普通行程已经走在上面**;**091 是唯一例外**——硬编码 + 半切(draft 通用 / published 硬编码),
所以它在这条流里最怪(build 超时、运营按钮走硬编码会回退 C3B、司机三来源)。详见 `p4-d0-091-card-pipeline-state-analysis`。

**两件事解耦:**
- **补主流程(缺口①②③)** → 服务所有未来普通行程,**和 091 无关,可立刻做**。
- **修 091** → 单独走 `B 先回退到一致态` 或 `A 正式去硬编码`,不要让它阻塞主流程建设。

---

## 7. 建造顺序

```
1. 缺口① 增加行程引导流(import → 自动建草稿 → 落 trip-detail 预览)   ← 小,先做
2. 缺口② 每日评价卡:
     E1 运营生成入口 + 复制 + 已提交数(customer-trip-detail)
     E2 客户评价页 + 4 个云函数 + 3 个集合
     E3 评价汇总(listRideReviewsForOperator + 运营汇总视图)
3. 缺口③ 行程概览折叠(纯 UI)
---- 与上并行、互不阻塞 ----
4. 091 收口(先 B 回退一致 / 中期 A 去硬编码)
```

> 原则:主流程(普通行程)优先做扎实;091 当成单独的 legacy 迁移,别让它拖住整条流。
