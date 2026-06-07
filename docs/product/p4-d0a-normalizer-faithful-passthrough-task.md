# P4-D0A · Make Customer Trip Card Normalizers Preserve Canonical Fields

> **执行者:Codex** · 自包含任务,无需先读其他文档即可执行(契约全文见
> `docs/product/p4-d0-card-snapshot-contract-and-normalization.md`)。
> **一句话目标:** 让 `buildCustomerTripVisibleDraft` 的归一化器"默认忠实透传"标准卡片字段,
> 不再静默丢 `travel_snapshot` / `ui_flags` / `source_refs` / `parent_group_*` / 酒店富字段;
> 同时补强敏感字段黑名单,保证默认透传后仍安全。

---

## 0. 唯一可改文件

```
cloudfunctions/buildCustomerTripVisibleDraft/index.js
```

**不要改:** 客户端任何代码 / `trip091CardSystem.js` / 发布(publish)/ 分享(invite)/
`importCustomerTripJSON` / `ride_requests` / `transport_orders` / schema / 数据库存量数据。

---

## 1. 背景(为什么)

- 卡片(timeline item)、每日(day)、酒店(hotel)的归一化器目前是**白名单式**:显式列字段返回,
  **未展开 `...item`**,所以源 JSON 里的富字段被静默丢弃 → `draft_snapshot` / `published_snapshot`
  缺字段 → 客户页 / 运营预览只能显示窄版卡片。
- 修法:**白名单逐字段拷贝 → 展开 `...item` + 叠加规范化默认值 + 黑名单兜底**。
- 改成默认透传后,**安全完全依赖 `INTERNAL_KEYS` 黑名单**,故本任务必须**同步补强黑名单**。

---

## 2. 改造 1/3:四个归一化器改"默认透传"

通用模式:**先展开源对象 → 再叠加规范化/计算字段(覆盖在上层)→ 最后 `sanitizeCustomerObject` 兜底**。
保留每个函数原有的"计算字段"(如 `has_time_conflict`、`start_time_text`、name/address 兜底),不能丢。

### 2.1 `normalizeTimelineItem`(当前约 :263)

**当前(白名单,节选):**
```js
function normalizeTimelineItem(item, index) {
  const itemType = item.item_type || item.type || 'other';
  return sanitizeCustomerObject({
    item_id: item.item_id || item.id || `${itemType}_${index + 1}`,
    item_type: itemType,
    card_type: item.card_type || item.cardType || itemType,
    // ... 仅显式列出的 ~34 个字段;travel_snapshot / ui_flags / source_refs / parent_group_* 不在内 → 被丢
  });
}
```

**改为(默认透传 + 规范化默认 + 受控可见性):**
```js
function normalizeTimelineItem(item, index) {
  const itemType = item.item_type || item.type || 'other';
  const normalized = {
    ...item,                                              // ① 透传全部标准字段
    // ② 叠加规范化/兜底默认(覆盖在上层,保留原有兜底语义)
    item_id: item.item_id || item.id || `${itemType}_${index + 1}`,
    item_type: itemType,
    type: itemType,
    card_id: item.card_id || item.item_id || item.id || `${itemType}_${index + 1}`,
    card_type: item.card_type || item.cardType || itemType,
    sequence: item.sequence || index + 1,
    title: item.title || '行程节点',
    time: item.time || item.planned_start_time || item.planned_arrival_time || '',
    customer_note: item.customer_note || item.customer_visible_note || item.note || item.description || '',
    // 其余原有显式兜底字段(planned_*、drive_time_text、from/to、flight_no 等)保持,作为缺省值层
    source_refs: filterCustomerSourceRefs(item.source_refs),   // ③ 受控:见 §3
    ...gateHotelConfirmation(item),                            // ③ 受控:见 §3(仅 hotel 卡相关)
  };
  return sanitizeCustomerObject(normalized);                   // ④ 黑名单兜底
}
```
> 注意:`...item` 在最上面,规范化默认在下面**覆盖**——保证 `card_id` 等始终有值,
> 同时 `travel_snapshot` / `ui_flags` / `parent_group_*` / `route_check_id` / `content_*` 等富字段自动保留。

### 2.2 `normalizeDay`(当前约 :322)

保留 `timeline_items` 映射、`hotel` 兜底、`has_time_conflict` / `start_time_text` 等**计算字段**,
只把"固定返回对象"改成 `...day` 打底:
```js
return sanitizeCustomerObject({
  ...day,                                  // 透传 day 级富字段(day_theme / customer_display_flags 等未来字段不丢)
  day_no: day.day_no || index + 1,
  title: day.title || `Day ${day.day_no || index + 1}`,
  start_time_text: startTimeText,          // 计算字段保留
  has_time_conflict: Boolean(displayedRaw && estimatedRaw && displayedRaw !== estimatedRaw),
  warning_codes: Array.isArray(day.warning_codes) ? day.warning_codes : [],  // 注:warning_codes 在黑名单内,会被 sanitize 剥离(符合预期)
  timeline_items: timelineItems,           // 用归一化后的,不能用原始 day.timeline_items
  hotel,                                   // 用归一化后的
  transport_summary: day.transport_summary ? sanitizeCustomerObject(day.transport_summary) : null,
});
```
> ⚠️ `timeline_items` / `hotel` / `transport_summary` 必须用**归一化后的值覆盖**,不能被 `...day` 的原始值盖回。

### 2.3 `normalizeDayHotel`(当前约 :299)

保留 name/address 的 `firstText` 兜底与"无 name 无 address 返回 null"逻辑,改 `...hotel` 打底:
```js
return sanitizeCustomerObject({
  ...hotel,                                // 透传酒店富字段(room_summary / check_out_date / confirmation_no 等)
  hotel_id: hotel.hotel_id || hotel.id || `day_${dayNo}_hotel`,
  name: name || '酒店安排',
  hotel_name: name || '酒店安排',
  customer_note: hotel.customer_note || hotel.customer_visible_note || hotel.note || '',
  linked_day_no: dayNo,
  ...gateHotelConfirmation(hotel),         // 受控:confirmation_no 默认隐藏(§3)
});
```

### 2.4 `normalizeTopLevelHotel`(当前约 :362)

同上,`...hotel` 打底 + 保留计算字段(`date_text`、`status_text`)+ 受控 `confirmation_no`。

### 2.5 派生器不得覆盖富字段

`deriveDailySummaryCards` / `deriveHotelCards` / `deriveFlightCards`:**只派生摘要**,
不得吃掉或覆盖 `itinerary_days` 内已透传的富字段。核对它们不会反写 timeline 卡片。

---

## 3. 改造 2/3:受控可见性(两个相反默认)

新增两个小工具函数:

```js
// source_refs:默认可见(opt-out),仅去掉显式标 false 的
function filterCustomerSourceRefs(refs) {
  if (!Array.isArray(refs)) return undefined;
  return refs
    .filter((r) => r && r.visible_to_customer !== false)
    .map((r) => ({ title: r.title || '', url: r.url || '', source_type: r.source_type || '' }));
}

// confirmation_no:默认隐藏(opt-in / fail-closed),仅 confirmation_no_visible === true 才保留
function gateHotelConfirmation(obj) {
  if (!obj || typeof obj !== 'object') return {};
  if (obj.confirmation_no && obj.confirmation_no_visible === true) {
    return { confirmation_no: obj.confirmation_no };
  }
  return { confirmation_no: '' };   // 默认抹掉
}
```

> 设计依据:`source_refs` 可能含 Maps 查询链接 / Waze 截图 / 供应商后台,需逐条隐藏能力,但通常可见;
> 酒店 `confirmation_no` 高敏感(家庭群多人可见场景),必须 fail-closed,默认不出。
> 与现有 `documents.visible_to_customer`(opt-out)模式一致。

---

## 4. 改造 3/3:补强黑名单 `INTERNAL_KEYS`(:17)

**核心原则:快照不携带任何司机/车辆身份;司机/车辆展示一律从 `transport_orders` 客户安全投影取。**

在 `INTERNAL_KEYS` 数组**追加**以下键(均不在现列表,无重复):

```js
// 司机 / 车辆身份(含字符串拼接泄漏:vehicle_summary 把车牌嵌在文本里,必须整体剥)
'driver_name', 'driver_phone', 'driver_openid', 'driver_user_id',
'vehicle_id', 'plate_number', 'vehicle_summary', 'vehicle_model', 'vehicle_color',
// 价格 / 内部金额
'quote_price', 'driver_quote_amount', 'farland_service_fee_amount', 'client_total_internal',
// 操作者 / 审计身份
'operator_user_id', 'operator_openid', 'created_by_openid', 'updated_by_openid',
// 原始 / 调试
'raw_json', 'raw_source', 'debug', 'debug_info',
```

> `vehicle_summary` / `vehicle_model` / `vehicle_color` 是在用户清单基础上、依"无车辆身份入快照"
> 原则补入,用于堵住车牌字符串泄漏。若团队希望保留"车型/颜色"客户可见,应改由 transport_orders 投影提供,
> 不从快照出。Review 时请确认这一取舍。

---

## 5. 约束(再次强调)

- 只改 `buildCustomerTripVisibleDraft/index.js`。
- 不动客户端、不动 `trip091CardSystem.js`、不动发布 / 分享 / 导入 / 单次用车链路 / schema / 存量数据。
- 091 走硬编码分支,本任务**不影响线上 091**(`sanitizeCustomerObject` 仅作用于通用 `normalizeSnapshotV2` 路径)。

---

## 6. 验收标准

- [ ] 一条含 `travel_snapshot` / `ui_flags` / `source_refs` / `parent_group_*` / `route_check_id` /
      `content_verified_at` 的标准卡片 JSON,经 `normalizeSnapshotV2` 后,这些字段**完整保留**在
      `draft_snapshot.itinerary_days[].timeline_items[]` 中。
- [ ] day 级 / 酒店级富字段(如 `room_summary`、`check_out_date`、未来 `day_theme`)同样不丢。
- [ ] `confirmation_no`:不带 `confirmation_no_visible: true` 时,输出中为空;带 true 时保留。
- [ ] `source_refs`:标 `visible_to_customer: false` 的条目被剔除,其余保留。
- [ ] **安全:** 构造一条恶意混入 `driver_phone` / `plate_number` / `vehicle_summary` / `cost` /
      `operator_openid` / `raw_json` 的卡片,经归一化后这些键**全部不存在**(递归各层)。
- [ ] `normalizeDay` 输出里 `timeline_items` / `hotel` 是**归一化后**的值(没被 `...day` 原始值盖回)。
- [ ] 现有非 091 行程的发布/预览功能回归正常(草稿能建、能发布、客户页能渲染)。

---

## 7. 验证步骤(Step 3 等价性,不动线上)

1. 取 091 经 `buildTrip091CardSystem(trip)` 的输出(它已是 `snapshot_model_version: 2`)。
2. 把其 `itinerary_days` 当作源数据,喂入改造后的 `normalizeSnapshotV2`,逐字段 diff 两份快照。
3. **预期差异(均为正确结果,非回归):**
   - 司机/车辆身份字段(`driver_name` / `plate_number` / `vehicle_summary` 等)在通用输出中**缺失**
     —— 符合"无身份入快照",这些应改由 transport_orders 供数。
   - `confirmation_no` 在未开可见时为空。
   - `source_refs` 中标记隐藏的条目缺失。
4. **除上述外的所有富字段须零丢失。** 若有意外丢失,即归一化器仍有白名单残留,需补。

> 此验证脚本一次性、可丢弃,不写入生产路径;它同时是"091 去硬编码(P4-D0 Step 4 灰度)"的就绪检查。

---

## 8. 风险与坑

- **覆盖顺序坑:** `...item` / `...day` 必须在**最上面**,规范化默认在下面覆盖;
  且 `timeline_items` / `hotel` 等"归一化后的子结构"必须再覆盖一层,别被原始值盖回。
- **黑名单是唯一防线:** 默认透传后,任何没进黑名单的内部字段都会泄漏。本任务的黑名单补强**必须与
  透传改造同一个改动一起合入**,不能分两次。
- **字符串拼接泄漏:** 光拦字段名不够(`vehicle_summary` 嵌车牌),坚持"无司机/车辆身份入快照"原则。
- **不要顺手"优化"091:** 091 路径不在本任务范围,任何对 `trip091CardSystem.js` 的改动都会越界。

---

## 9. 关键行号速查(改前请以实际为准)

| 目标 | 位置 |
| --- | --- |
| `INTERNAL_KEYS`(数组,补强) | `index.js:17` |
| `sanitizeCustomerObject`(递归黑名单) | `index.js:54` |
| `normalizeTimelineItem`(改透传) | `index.js:263` |
| `normalizeDayHotel`(改透传) | `index.js:299` |
| `normalizeDay`(改透传) | `index.js:322` |
| `normalizeTopLevelHotel`(改透传) | `index.js:362` |
| `normalizeSnapshotV2`(组装,通用路径入口) | `index.js:551` |
| 路径分支(091 vs 通用) | `index.js:655` |
