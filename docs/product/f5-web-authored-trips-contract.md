# F5 · Web 权威建行程:customer_trips 写入合约 + 小程序消费链路

> 决策(延续「派单边界」F 轨道):**行程的创作权在 web 端**。web 直接/服务端写 `customer_trips` 的
> canonical **source 文档**;小程序不再有 JSON 导入口子(`customer-import`、覆盖面板、`importCustomerTripJSON`
> 全部已删)。运营在小程序里只做「生成草稿 → 预览 → 发布 → 分享卡」,客户手机打开行程单。
>
> 关键结论:**web 写 source 文档,小程序 读/建草稿/发布/分享 全链路零改动**——它们本来就消费
> `importCustomerTripJSON` 产出的同一形状。本文件 = web 端要复刻的那个形状。

---

## 0. 模型:web 写 source,运营在小程序 build/publish(不是 web 直接写快照)

```
web 端授权 + 校验 → 写 customer_trips 的 source 文档(draft/published 快照留空)
  → 运营小程序:行程管理看到该行程(hidden/pending_review)
    → 生成客户可见草稿(buildCustomerTripVisibleDraft:source → draft_snapshot,剥内部字段/PII)
    → 预览客户真实页面(getOperatorCustomerHomePreview)
    → 发布(publishCustomerTrip:draft_snapshot → published_snapshot,version+1)
    → 生成客户分享卡(createCustomerTripInvite)→ 微信转发
  → 客户手机打开(getCustomerTripByInvite:读 published_snapshot,白名单 + PII 兜底剥离)
```

> **不建议 web 直接写 `published_snapshot`**:那会绕过小程序的快照构建与脱敏(`stripCustomerContact`
> / `INTERNAL_KEYS` / `sanitizeTransportSummary`)。web 只写 source,让运营 build,是最省心且安全的路径。

---

## 1. web 必须写的 canonical customer_trips 文档

**Upsert 键:`external_trip_id`**(小程序按它原地覆盖/查找;`trip_id`/`trip_no` 默认等于它)。

```jsonc
{
  // —— 身份 ——
  "schema_version": "1.0.0",
  "external_trip_id": "WEB-2026-0001",   // 唯一,upsert 键
  "trip_id": "WEB-2026-0001",            // 默认 = external_trip_id
  "trip_no": "WEB-2026-0001",            // 默认 = external_trip_id;客户/运营展示号
  "trip_type": "mixed",                  // schema 枚举:transfer/charter/mixed/hotel_only
  "customer_profile_id": "prof_123",     // 顶层,运营归属

  // —— source 溯源 ——
  "source": { "source_type": "cloudflare_ops", "source_id": "ops_abc" },
  "source_type": "cloudflare_ops",
  "source_id": "ops_abc",
  "source_hash": "<sha256(payload)>",    // 推荐:变更检测/幂等

  // —— 展示头 ——
  "title": "美东访校行程",
  "city": "New York",
  "country": "US",
  "timezone": "America/New_York",
  "status": "active",
  "status_text": "",
  "start_at": "2026-08-01T10:00:00-04:00",
  "end_at": "2026-08-03T16:00:00-04:00",
  "date_start": "2026-08-01T10:00:00-04:00",  // 别名,= start_at
  "date_end": "2026-08-03T16:00:00-04:00",    // 别名,= end_at
  "summary": "",

  // —— 客户对象:只放展示名,禁止 phone/wechat/email(见 §2)——
  "customer": { "display_name": "张女士", "name": "张女士" },
  "customer_display_name": "张女士",
  "customer_name": "张女士",
  "customer_phone": "13800000000",       // 顶层运营元数据(快照不复制)
  "customer_wechat_id": "zhang_wx",      // 顶层运营元数据

  // —— 顾问 ——
  "advisor": { "name": "Farland 顾问" },

  // —— 行程主体 ——
  "itinerary_days": [
    { "day_no": 1, "date": "2026-08-01", "city": "New York", "title": "Day 1",
      "timeline_items": [ { "item_id": "i1", "title": "NYU",
        "location_name": "New York University", "planned_start_time": "10:40" } ] }
  ],
  "hotels": [
    { "hotel_id": "h1", "name": "Riu Plaza", "check_in_date": "2026-08-01",
      "check_out_date": "2026-08-02", "linked_day_no": 1, "address": "...", "phone": "212-555-1000" }
  ],
  "flights": [],
  "transfers": [],
  "charter_services": [],
  "documents": [],

  // —— 别名(小程序部分读路径用;可与主字段同值)——
  "hotel_requests": [ /* = hotels */ ],
  "daily_itinerary": [ /* = itinerary_days */ ],

  // —— 生命周期种子:web 写死这几项,快照留空,由运营 build/publish ——
  "review_status": "pending_review",
  "visibility_status": "hidden",
  "warning_codes": [],
  "critical_warning_codes": [],
  "published_version": 0,
  "draft_snapshot": {},
  "published_snapshot": {},

  "created_at": "<iso>",
  "updated_at": "<iso>"
}
```

> `day_no` / `linked_day_no` 用**数字**(小程序按 `Number()` 匹配)。字段类型尽量与示例一致;
> 数组缺省给 `[]`,对象缺省给 `{}`,不要给 `null`。

---

## 2. 安全硬规则(web 写入前自我强制)

| 规则 | 原因 |
| --- | --- |
| **`customer` 子对象只放 `display_name`/`name`/`customer_profile_id`;phone/wechat/email 只放顶层 `customer_phone`/`customer_wechat_id`** | 快照会复制 `trip.customer` → 可转发分享卡;联系方式进子对象会泄给第三方。小程序 build 已 `stripCustomerContact` 兜底,但源头别放 |
| **禁止写司机/车辆身份字段**(`driver_name`/`driver_phone`/`plate_number`/`vehicle_summary` 等) | 司机信息运行时由 `transport_orders` 投影,快照不得内嵌 |
| **禁止写内部/成本字段**(`internal_note`/`operator_note`/`supplier_note`/`cost`/`driver_cost`/`margin`) | 客户可见边界;小程序黑名单也会剥,源头别写 |
| **不要写 `published_snapshot` 让客户直接可见** | 绕过小程序脱敏;只写 source,运营 build/publish |
| **不要写 docId `bf757c4c6a2054f800350a925147b32e`(091)** | 091 是硬编码路径,单独维护,勿被 web 覆盖 |

小程序侧已有三道兜底(即使 web 违规也不外泄):`buildCustomerTripVisibleDraft.stripCustomerContact` +
`INTERNAL_KEYS` + `sanitizeTransportSummary`;客户读路径 `getCustomerTripByInvite` / `getCustomerHome`
再各剥一次 customer 联系方式。但**源头合规是第一责任**。

---

## 3. 小程序消费链路(逐步:云函数 / 字段 / 分享参数)——均零改动

| 步骤 | 云函数 | 读/写 | 关键字段 / 参数 |
| --- | --- | --- | --- |
| 行程列表 | `listOperatorTrips` | 读 source | `title`/`trip_no`/`visibility_status`/`published_version`/`party_name`/`primary_customer_name`/已保存数 |
| 打开单行程 | `getOperatorTripPreview` | 读 draft/published(compact)+ ownership + active 酒店 invite | 见 compact 白名单;`active_hotel_invites` |
| 生成草稿 | `buildCustomerTripVisibleDraft` | source → `draft_snapshot` | 读 `itinerary_days`/`hotels`/`flights`/`transfers`/`charter_services`/`customer`/`advisor`/`title`/`start_at`/`end_at`;剥 PII/内部 |
| 预览客户页 | `getOperatorCustomerHomePreview` | 读 published(已发布)否则 draft | 只读,不建 access/分享卡 |
| 发布 | `publishCustomerTrip` | `draft_snapshot` → `published_snapshot`,`published_version`+1,`review_status=approved` | — |
| 生成分享卡 | `createCustomerTripInvite` | 读 published | 返回 `share_path` = `/pages/customer/home/home?...invite_code=...`;不写 access |
| 客户打开 | `getCustomerTripByInvite` | 读 `published_snapshot` | 白名单逐字段 + `stripCustomerContact`;司机由 `transport_orders` 运行时投影 |
| 客户已保存 | `getCustomerHome` | 读 published | 同上脱敏;`customer_visible=false` 不进 feed |

**结论:因为 web 写的 source 与 `importCustomerTripJSON` 产出的形状一致,以上读路径无需新增 normalizer / 兼容层。**

---

## 4. 幂等 / 版本 / 存量

- **幂等**:按 `external_trip_id` upsert;`source_hash` 相同可跳过重写。
- **改行程**:web 重写 source(新 `source_hash`);运营重新「生成草稿 → 发布」推给客户。小程序保留旧
  `published_snapshot` 对客户可见,直到运营手动发布(既有生命周期)。
- **091 除外**:硬编码路径,web 不碰。

---

## 5. 验证证据(本仓库,静态)

- `node scripts/web-trip-flow-static-check.js` —— 喂一份带 PII 的 web 风格 source,跑
  `normalizeSnapshotV2`(build)→ `normalizePublishedSnapshot`(客户视图),断言:
  2 天/酒店卡结构正确、客户 `display_name` 保留、**customer 的 phone/wechat/email 被剥、酒店前台电话保留、
  无内部/供应商/成本字段**,客户视图同样无 PII。**全部通过**。
- `node --check` 全部改动云函数通过;小程序内 `importCustomerTripJSON`/`customer-import`/`openCustomerImport` 零残留。

---

## 6. 交给 Web 仓库的活(不跨仓部署)

web 侧需要实现「按 §1 payload 写 customer_trips + §2 安全规则」。两种写法:
1. **web 直连 CloudBase**(有 env admin 凭证)→ 直接 `customer_trips.add/set`;或
2. **CloudBase HTTP 函数**(server-to-server,HMAC)→ 由 web 调,函数按 §1/§2 校验后写库。

若选 (2),需要在**小程序仓库**新建一个 `opsUpsertCustomerTrip` 云函数(对标 `opsUpsertRideRequest`:
HMAC 门控 + schema 1.0.0 校验 + §2 安全剥离 + upsert)。这是**本仓库**的活,不是跨仓部署;需要时另起任务。
