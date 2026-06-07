# P4-D0 · Customer Trip Card Snapshot Contract & Normalization Pipeline

> 卡片 snapshot schema 与 normalizer 收口 —— P4 的**地基**,应排在 P4-D1 行程管理列表**之前**。
> 目的:把当前**两套隐式卡片 schema**(091 硬编码富版 + 通用归一化窄版)固化为**一份明确契约**,
> 并让通用管线"默认忠实"地保存标准卡片字段。
> 本文档定义契约 + 收口计划;Step 1 不改代码,Step 2 起仅改 `buildCustomerTripVisibleDraft/index.js`。

---

## 0. 结构判断(先说结论)

**结构是对的,不对的是两处实现。** 别因症状去推翻结构。

| 层面 | 状态 |
| --- | --- |
| 数据模型 `customer_trips`:源数据 + `draft_snapshot` + `published_snapshot` | ✅ 正确 |
| 管线:导入 → 建草稿 → 复核 → 发布 → 客户读 published | ✅ 正确 |
| 按行程隔离:卡片存各自文档,无共享可变卡表(grep 无 `cards`/`destination_cards`/`trip_cards` 集合) | ✅ 正确 |
| 通用路径与 091 都吐 `snapshot_model_version: 2` 进同一文档、同一渲染器读 | ✅ 一致 |
| `importCustomerTripJSON` 已支持按 `external_trip_id` 原地覆盖 + 安全生命周期 | ✅ 就绪 |

**两处实现缺口(本文件收口对象):**

1. **通用归一化器是白名单 → 静默丢富字段。** `normalizeTimelineItem` / `normalizeDay` /
   `normalizeDayHotel` / `normalizeTopLevelHotel` 均为"显式列字段返回",**未展开 `...item`**。
   源 JSON 里的 `travel_snapshot` / `ui_flags` / `source_refs` / `parent_group_*` / 酒店富字段被丢弃。
2. **091 硬编码。** `buildCustomerTripVisibleDraft` 对 091 走 `trip091CardSystem.js`(1800 行),忽略文档数据。

**唯一"半结构"缺口:** canonical 卡片 schema 从未被正式定义 —— 本文件即补这份契约。

---

## 1. 快照顶层结构 · `snapshot_model_version: 2`

写入 `customer_trips.draft_snapshot` / `published_snapshot`,客户端直接渲染。

```jsonc
{
  "snapshot_model_version": 2,
  "trip_id": "", "external_trip_id": "", "trip_no": "",
  "title": "", "trip_type": "", "status": "",
  "city": "", "country": "", "timezone": "",
  "start_at": "ISO", "end_at": "ISO", "summary": "",
  "customer": { /* 客户可见,内部字段已剥离 */ },
  "advisor":  { /* 顾问信息 */ },
  "hero": { "title": "", "trip_no": "", "date_range": "", "city_summary": "" },
  "trip_summary":        { /* deriveTripSummary 派生 */ },
  "daily_summary_cards": [ /* deriveDailySummaryCards 派生(只摘要,不得覆盖富字段)*/ ],
  "hotel_cards":         [ /* deriveHotelCards 派生 */ ],
  "flight_cards":        [ /* deriveFlightCards 派生 */ ],
  "itinerary_days":      [ /* 见 §2 */ ],
  "hotels": [], "flights": [], "transfers": [], "charter_services": [],
  "documents": [ /* 仅 visible_to_customer !== false */ ]
}
```

> **派生 vs 透传:** `daily_summary_cards` / `hotel_cards` / `flight_cards` / `trip_summary` 是**派生**;
> `itinerary_days` 内卡片是**透传**(经归一化)。收口重点是后者忠实透传 + 前者不覆盖富字段。

---

## 2. 每日与卡片结构

```jsonc
// itinerary_days[n]  —— normalizeDay 也须改默认透传
{
  "day_no": 1, "date": "YYYY-MM-DD", "weekday": "", "city": "", "title": "", "summary": "",
  "displayed_start_time": "", "estimated_departure_time": "", "start_time_text": "",
  "has_time_conflict": false, "warning_codes": [],
  "timeline_items": [ /* §3 卡片数组 */ ],
  "hotel": { /* normalizeDayHotel,须默认透传酒店富字段 */ },
  "transport_summary": { /* 当日交通摘要;不得含司机身份,见 §4 */ }
  // 未来 day 级字段(day_theme / day_city_route / customer_display_flags 等)默认透传后自动保留
}
```

---

## 3. 卡片(card / timeline_item)canonical schema ⭐

> **核心契约。** 字段集取自 091 富实现(`buildCard`,现存最完整实现)。
> 标记:`[骨架]` 通用管线已保留;`[富]` 当前被丢、需收口补回;`[兼容]` 旧版渲染兼容;`[受控]` 需可见性门控。

```jsonc
{
  // —— 标识 ——
  "card_id": "", "card_type": "school_visit_card", // [骨架] 卡型见 §3.1
  "day_no": 1, "sequence": 1, "total_count": 8,     // [骨架]

  // —— 组合景点拆分(分组)——
  "parent_group_id": "", "parent_group_title": "", "group_sequence": 1, // [富]

  // —— 实体引用 ——
  "entity_ref": { "entity_id": "", "entity_type": "school|hotel|landmark|museum|...", "entity_subtype": "" }, // [骨架]

  // —— 三个核心 snapshot ——
  "display_snapshot": { /* §3.2,随 card_type 变化 */ }, // [骨架]
  "time_snapshot":    { /* §3.3 */ },                    // [骨架]
  "travel_snapshot":  { /* §3.4 maps/waze */ },          // [富]

  "route_check_id": "",                                   // [富]
  "ui_flags": { "show_route": false, "show_travel_meta": false,
                "show_contact_advisor": false, "show_driver": false }, // [富][受控:见 §3.5]

  // —— 酒店专属(hotel_arrival_card)——
  "hotel_stay_id": "", "check_in_date": "", "check_out_date": "",
  "room_summary": "", "room_type": "",                    // [富] 可客户可见
  "confirmation_no": "", "confirmation_no_visible": false, // [受控:默认隐藏,见 §3.6]

  // —— 内容来源与核验 ——
  "source_refs": [ { "title": "", "url": "https://...", "source_type": "official",
                     "visible_to_customer": true } ],     // [富][受控:默认可见,见 §3.6]
  "content_verified_at": "ISO",
  "content_quality_status": "verified_with_online_sources | needs_source_review",

  "customer_note": "",                                    // [骨架]

  // —— 旧版渲染兼容(buildLegacyCardFields)——
  "type": "", "item_type": "", "typeText": "", "time": "", "arrival_estimate": "",
  "title": "", "subtitle": "", "location": "", "detailLine": "", "note": "",
  "linked_entity_type": "", "linked_entity_id": ""        // [兼容]
}
```

### 3.1 卡型枚举(card_type)

| card_type | 含义 | display 变体 |
| --- | --- | --- |
| `school_visit_card` / `landmark_card` / `museum_card` | 访校 / 地标 / 博物馆 | §3.2 默认 |
| `hotel_arrival_card` | 到店 | §3.2 默认 + 酒店专属 |
| `flight_card` | 航班 | §3.2 航班变体 |
| `meeting_card` | 会面 / 预约 | §3.2 会面变体 |
| `custom_activity_card` | 自定义活动 | §3.2 活动变体 |

### 3.2 display_snapshot(随 card_type)

```jsonc
// 默认(school/landmark/museum/hotel):name_en, name_zh, entity_type_text, city, state, area,
//   location_text, address, ranking_badges[], rating_badges[], group, brand, star_rating,
//   landmark_type, museum_group, intro_lines[], strengths[], fit_tags[], highlight_tags[]
// flight_card:name_en, name_zh, flight_no, route, departure_airport, arrival_airport,
//   takeoff_time, landing_time, aircraft, intro_lines[], fit_tags[]
// meeting_card:name_en, name_zh, entity_type_text, intro_lines[], fit_tags[], location_text
// custom_activity_card:name_en, name_zh, entity_type_text, city, area, location_text,
//   intro_lines[], fit_tags[], highlight_tags[]
```

### 3.3 time_snapshot

```jsonc
{ "departure_time": "", "arrival_time": "", "appointment_time": "", "start_time": "",
  "end_time": "", "end_time_day_offset": 0, "time_warning_text": "" /* 晚到→"时间待复核" */ }
```

### 3.4 travel_snapshot(maps/waze 双源校时)`[富]`

```jsonc
{ "drive_time_text": "", "distance_text": "", "traffic_text": "", "traffic_level": "",
  "transport_mode": "drive", "travel_mode": "drive",
  "source_drive_time_text": "", "source_distance_text": "", "source_traffic_text": "",
  "maps_duration_text": "", "maps_distance_text": "", "maps_route_text": "",
  "maps_duration_minutes": 0, "maps_delta_minutes": 0,
  "maps_review_status": "ok_within_tolerance | source_conservative_or_slack | ...",
  "maps_checked_at": "ISO", "maps_check_mode": "",
  "waze_duration_text": "", "waze_distance_text": "", "waze_route_text": "", "waze_duration_minutes": 0 }
```

### 3.5 ui_flags 是 UI 请求,不是权限依据 `[受控]`

`ui_flags`(含 `show_driver`)可保留为字段,但**只表达 UI 渲染意图,不构成可见性授权**。
特别是司机信息:**客户页是否显示司机,必须以 `transport_orders` 客户安全投影 + `visibility_status` +
assigned/confirmed 状态为准**,绝不能因为某张卡 `show_driver: true` 就展示。快照里也不应内嵌司机身份(见 §4)。

### 3.6 受控可见性字段(两种相反默认)

| 字段 | 默认 | 规则 | 原因 |
| --- | --- | --- | --- |
| `source_refs[].visible_to_customer` | **可见(opt-out)** | normalizer 仅保留 `!== false` | 来源可能含 Maps 查询链接 / Waze 截图 / 供应商后台,需能逐条隐藏 |
| `confirmation_no` (`confirmation_no_visible`) | **隐藏(opt-in)** | 仅 `confirmation_no_visible === true` 时进客户卡 | 酒店确认号高敏感,fail-closed;家庭群多人可见场景不可默认暴露 |

> 备选方案:把酒店私有字段统一放进 `hotel_private_snapshot: {}` 容器并整体剥离。
> 本契约采用"显式 flag"路线,与现有 `documents.visible_to_customer` 模式一致。

---

## 4. 安全边界(默认透传后的**唯一防线**)

改成默认透传后,安全完全依赖 `INTERNAL_KEYS` 黑名单 + 导入端 `findSensitiveKey`。**Step 2 必须同步补强黑名单。**

**当前 `INTERNAL_KEYS`(`buildCustomerTripVisibleDraft/index.js:17`)已含:**
`openid` / `customer_openid` / `customer_user_id` / `user_id` / `driver_quotes` / `driver_quote` /
`internal_note(s)` / `operator_note(s)` / `operator_internal_note` / `raw_parse_note(s)` /
`source_raw_text` / `source_pdf_text` / `source_hash` / `warning_codes` / `critical_warning_codes` /
`audit_logs` / `cost` / `driver_cost` / `margin` / `supplier_note(s)` / `supplier_private_note(s)`

**Step 2 必须新增(均不在现列表):**
```
driver_name  driver_phone  driver_openid  driver_user_id
vehicle_id  plate_number
quote_price  driver_quote_amount  farland_service_fee_amount  client_total_internal
operator_user_id  operator_openid  created_by_openid  updated_by_openid
raw_json  raw_source  debug  debug_info
```

**核心原则(比逐字段拦更强):快照不携带任何司机/车辆身份。**
- 司机/车辆展示一律从 `transport_orders` 客户安全投影取,不从快照取。
- ⚠️ 注意拼接字符串泄漏:如 `vehicle_summary = "2025 Sienna · 黑色 · LUM5388"` 把车牌嵌在文本里,
  光 blocklist `plate_number` 拦不住 → 因此 091 的 `day_transport_summary` 这类内嵌司机/车辆摘要应整体不入快照。
- 由此,§5 Step 3 的 091 等价 diff **预期会在司机/车辆字段上不一致**,这是正确结果,不是回归。

---

## 5. 收口计划

### Step 1 — 定义契约(本文件)✅
固化为团队契约,无代码改动。

### Step 2 — normalizer 改"默认忠实" + 黑名单补强(= 任务 P4-D0A)
**仅改 `buildCustomerTripVisibleDraft/index.js`:**

1. **四个 normalizer 全部改默认透传**(白名单 → 展开 + 规范化默认值 + 黑名单兜底):
   - `normalizeTimelineItem`(:263)← 第一重点
   - `normalizeDay`(:322)← 须透传 day 级富字段
   - `normalizeDayHotel`(:299)← 须透传酒店富字段
   - `normalizeTopLevelHotel`(:362)← 须支持 `confirmation_no` / `room_summary` 等
   ```js
   // 示意
   function normalizeTimelineItem(item, index) {
     const itemType = item.item_type || item.type || 'other';
     return sanitizeCustomerObject({
       ...item,                                    // ① 透传全部标准字段
       item_id: item.item_id || `${itemType}_${index + 1}`,  // ② 叠加规范化默认
       card_id: item.card_id || item.item_id || `${itemType}_${index + 1}`,
       card_type: item.card_type || itemType,
       sequence: item.sequence || index + 1,
     });                                            // ③ sanitizeCustomerObject 黑名单兜底
   }
   ```
2. **`deriveDailySummaryCards` / `deriveHotelCards` / `deriveFlightCards` 只派生摘要,不得覆盖/吃掉富字段。**
3. **补强 `INTERNAL_KEYS`**(§4 列表),并实现受控可见性(§3.6:`source_refs.visible_to_customer` 过滤、
   `confirmation_no` 默认隐藏)。
4. **不动客户端、不动 091、不动发布/分享流程。**

### Step 3 — 用 091 数据做等价性验证(不动线上)
- 取 091 经 `buildTrip091CardSystem` 的卡片数据,喂入改造后的通用 `normalizeSnapshotV2`;
- 逐字段 diff;**预期差异**:司机/车辆身份字段(应缺失,改由 transport_orders 供数)、受控隐藏字段;
- 其余字段须零丢失。此验证也是"091 去硬编码"的就绪检查。

### Step 4 — 091 可切换灰度迁移(**不一步删**)
> 091 还可能承担:视觉参考 / 字段兜底 / 特殊排版 / demo 数据稳定性。逐步切,不大爆破。
```
① 通用管线能完整接收 091 同等字段(Step 2 完成)
② 用 091 JSON 跑通通用管线(Step 3 通过)
③ 加配置开关,让 091 切到通用管线(可随时切回硬编码)
④ 稳定运行一段时间后,再删 trip091CardSystem.js 与分支
```

---

## 6. 非目标(本轮不做)

- ❌ 卡片可视化编辑 UI(改内容仍是"重新导入 JSON")
- ❌ 091 一步删除(走 Step 4 灰度)
- ❌ "覆盖 JSON"运营入口(地基稳后再接)
- ❌ 改客户端渲染器
- ❌ 动 `ride_requests` / `transport_orders` 单次用车链路

---

## 7. 排序(P4-D0 是地基,排在 D1 前)

```
P4-D0   卡片 snapshot schema 与 normalizer 收口   ← 本文件,地基
P4-D1   行程管理列表(列表外壳已存在,但其显示内容的忠实度依赖 D0)
P4-D2   单个行程管理页(预览/发布/分享;D2-A 进入客户真实页面已落地)
P4-D3   每日评价入口
P5      评价提交与汇总
```

为什么先做 D0:卡片管线不收口,则行程管理页所见、运营预览所见、客户真实所见会继续不一致;
且它是"覆盖 JSON 编辑"与"091 去硬编码"的**共同前置**。地基稳之前,不在其上盖功能。

**下一步可执行任务 = P4-D0A**(见 Step 2):
> Make customer trip card normalizers preserve canonical fields + strengthen INTERNAL_KEYS.
> 只改 `buildCustomerTripVisibleDraft/index.js`,不动客户端 / 091 / 发布分享。

---

## 附:关键代码位置

| 内容 | 文件:行 |
| --- | --- |
| 通用快照构建 | `buildCustomerTripVisibleDraft/index.js:551` `normalizeSnapshotV2` |
| 卡片归一化(白名单,待改) | `…/index.js:263` `normalizeTimelineItem` |
| 每日归一化(白名单,待改) | `…/index.js:322` `normalizeDay` |
| 每日酒店归一化(白名单,待改) | `…/index.js:299` `normalizeDayHotel` |
| 顶层酒店归一化(白名单,待改) | `…/index.js:362` `normalizeTopLevelHotel` |
| 黑名单(数组,待补强) | `…/index.js:17` `INTERNAL_KEYS` / `:54` `sanitizeCustomerObject` |
| 091 富实现(= schema 来源) | `…/trip091CardSystem.js:1343` `buildCard` |
| 路径分支(091 vs 通用) | `…/index.js:655` |
| 客户端读快照渲染 | `getCustomerHome/index.js:1226` |
