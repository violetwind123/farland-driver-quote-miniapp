# F5 · opsUpsertCustomerTrip HTTP 合约(web → customer_trips 写入落点)

> 本仓库云函数 `cloudfunctions/opsUpsertCustomerTrip`。web 端通过它把 canonical 行程 source 写进
> `customer_trips`(upsert by `external_trip_id`)。安全模型对标 `opsUpsertRideRequest`。
> 配套:字段合约见 `f5-web-authored-trips-contract.md`;本文只讲**如何调用**。
>
> ⚠️ 未部署。部署前置见 §6。

---

## 1. 调用方式

- **云函数名**:`opsUpsertCustomerTrip`
- **两种入口**(同一 handler,安全一致):
  1. **CloudBase HTTP 触发路由**(推荐,web server→server):`tcb service create -p ops-upsert-customer-trip -f opsUpsertCustomerTrip -e <env-id>`,web 端 `POST` 到该 HTTP 路径。
  2. 直连 `callFunction`(需 CloudBase access token)—— 依然必须带合法 HMAC(见 §3),否则拒。
- **HTTP 方法**:`POST`,`Content-Type: application/json`,body = canonical source JSON(见 `f5-web-authored-trips-contract.md` §1)。

---

## 2. 请求 headers

| Header | 必填 | 说明 |
| --- | --- | --- |
| `x-ops-sync-timestamp` | ✅ | ISO8601,如 `2026-08-01T12:00:00Z`;与服务器时钟偏差须 ≤ 15 分钟 |
| `x-ops-sync-signature` | ✅ | `sha256=<hex>` 或纯 `<hex>`;HMAC-SHA256(见 §3) |
| `Authorization: Bearer <token>` | 视配置 | 仅当环境设了 `OPS_SYNC_ACCESS_TOKEN`/`TCB_ACCESS_TOKEN` 时校验 |

---

## 3. 签名 base string(关键)

```
signature = HMAC_SHA256(  key = OPS_SYNC_SHARED_SECRET,
                          message = `${x-ops-sync-timestamp}.${rawBody}` )  → hex
```

- `rawBody` = **原样发送的 JSON 字符串字节**(签名与发送必须是同一份字符串,勿重新序列化)。
- 时间戳纳入签名 → 截获一对 (body, signature) 无法换新时间戳重放。

**Node.js 签名示例(web 端):**
```js
const crypto = require('crypto');
function signAndSend(payloadObj) {
  const body = JSON.stringify(payloadObj);                 // 这份字符串既用于签名也用于发送
  const ts = new Date().toISOString();
  const sig = crypto.createHmac('sha256', process.env.OPS_SYNC_SHARED_SECRET)
    .update(`${ts}.${body}`).digest('hex');
  return fetch(TCB_HTTP_URL_FOR_opsUpsertCustomerTrip, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ops-sync-timestamp': ts,
      'x-ops-sync-signature': sig,
      // 'authorization': `Bearer ${process.env.OPS_SYNC_ACCESS_TOKEN}`, // 若配置了
    },
    body,
  });
}
```

---

## 4. Payload(canonical source)

见 `f5-web-authored-trips-contract.md` §1 完整示例。最小必填:`external_trip_id, trip_type, title, status,
city, country, timezone, start_at, end_at, customer.display_name, source.source_type`。

**服务端会自动:**
- 把 `customer.phone/wechat/email/...` **从 customer 子对象剥离**,`phone`/`wechat_id` 提到顶层
  `customer_phone`/`customer_wechat_id`(客户可见快照不含它们)。
- 深度剥离内部/成本/供应商字段(`internal_note`/`cost`/`margin`/`supplier_note`/`little_majia_id`…)。
- **拒绝**:`draft_snapshot`/`published_snapshot`(web 不写快照)、司机身份字段、`external_trip_id/trip_id/trip_no = 2026XBC091`。
- 新建时写死 `review_status=pending_review`、`visibility_status=hidden`、`published_version=0`、空快照。

---

## 5. 响应示例

**新建成功**
```json
{ "success": true, "code": 0, "action": "created",
  "trip_id": "WEB-2026-0001", "external_trip_id": "WEB-2026-0001",
  "review_status": "pending_review", "visibility_status": "hidden", "published_version": 0 }
```
**更新已发布行程**(客户仍看旧版,直到运营重新发布)
```json
{ "success": true, "code": 0, "action": "updated",
  "review_status": "needs_review", "visibility_status": "published", "published_version": 3,
  "note": "Customer still sees the last published version until an operator republishes." }
```
**幂等(同 source_hash)**
```json
{ "success": true, "code": 0, "idempotent": true, "action": "unchanged", "external_trip_id": "WEB-2026-0001" }
```
**错误**（`success:false` + `error_code`）

| error_code | code | 触发 |
| --- | --- | --- |
| `CONFIG_MISSING` | 500 | 环境未配 `OPS_SYNC_SHARED_SECRET` |
| `BAD_TIMESTAMP` | 401 | 时间戳缺失/过期(>15min) |
| `BAD_SIGNATURE` | 401 | 签名不匹配(含篡改 body) |
| `UNAUTHORIZED` | 401 | 配了 access token 但不匹配 |
| `VALIDATION_ERROR` | 400 | 缺必填(`missing` 列出) |
| `SNAPSHOT_NOT_ALLOWED` | 400 | payload 带 draft/published_snapshot |
| `SENSITIVE_FIELD_PRESENT` | 400 | 出现司机身份字段 |
| `TRIP_091_PROTECTED` | 409 | 目标是 091 |
| `INVALID_JSON` | 400 | body 非法 JSON |

---

## 6. 部署前检查清单(需部署环境提供,勿臆造)

- [ ] 部署云函数 `opsUpsertCustomerTrip`(含 `wx-server-sdk` 依赖)。
- [ ] 环境变量:**`OPS_SYNC_SHARED_SECRET`(必填)**;`OPS_SYNC_ACCESS_TOKEN`(可选,加一层 bearer)。与
  `opsUpsertRideRequest` 复用同一 secret 即可(两者签名算法一致)。
- [ ] 若走 HTTP 路由:`tcb service create -p ops-upsert-customer-trip -f opsUpsertCustomerTrip -e <env-id>`,把 URL 交给 web。
- [ ] web 侧配置同一 `OPS_SYNC_SHARED_SECRET`,按 §3 签名。
- [ ] （可选)给 `customer_trips.external_trip_id` 建索引(upsert 按它查);数据量小时非必需。
- [ ] 冒烟:web 推一条测试行程 → 运营小程序行程管理看到(hidden/pending_review)→ 生成草稿 → 预览 → 发布 → 分享卡 → 另一账号打开,核对无客户手机号/微信、无错误酒店确认号。

---

## 7. 测试证据(本仓库,静态)

- `node scripts/ops-upsert-customer-trip-test.js` → **12/12 PASS**:合法→created、PII 剥离到顶层、
  内部/供应商深剥(酒店电话保留)、缺签名/过期/篡改 body 401、拒 published_snapshot、拒 091、拒司机身份、
  缺必填 VALIDATION_ERROR、重复幂等、更新已发布行程 needs_review 且 published 快照/版本保留。
- `node scripts/web-trip-flow-static-check.js` → PASS(source→build→客户视图无 PII)。
- `node --check` 通过。

---

## 8. 剩余风险

- **限频**:本函数无 per-caller 限频(web server→server,受 HMAC 保护,风险低);如需可加 `rate_limits` 计数(参 searchElongHotels)。
- **schema 深校验**:仅做必填 + 类型基本校验(对齐 schema `required`),未接完整 JSON-Schema 校验器;
  web 侧应先按 `docs/schema/customer-trip.schema.json` 校验再发。
- **web→CloudBase 通道选型**:HTTP 路由 vs 直连 callFunction,由部署方定;两者安全等价(都过 HMAC)。
- **时钟偏差**:web 与云端时钟需 ≤15min;NTP 同步即可。
