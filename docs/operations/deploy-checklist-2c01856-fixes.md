# 部署清单:2c01856 后的一批修复(F1 / 客户边界 / 酒店流 / D4 / P1)

> 分支:`codex/091-customer-card-ui`(已 push,与 origin 同步,最新 commit `80bb444`)。
> 范围:`2c01856..HEAD` 这批修复,已通过静态验证(node --check + 静态一致性),**未做真机/云端动态测试**。
> 约束:**不要 merge main**;所有生产写(重新发布行程)需运营批准;每步做完再下一步。

---

## 0. 一句话

分享"手机行程单"的链路本身是通的;这批要部署的是**客户可见安全修复**(客户手机号/微信不进可转发快照、091 酒店硬编码不泄漏、ops 内部字段不给客户/司机)。
**关键坑:`buildCustomerTripVisibleDraft` 的 PII 剥离只对新构建的快照生效 → 部署后必须重新发布受影响行程,否则历史已发布快照仍含客户手机号。**

---

## 1. A 组 · 客户可见安全(最小必部署集,先部署)

| 云函数 | 改了什么 | 部署要点 |
| --- | --- | --- |
| `buildCustomerTripVisibleDraft` | `stripCustomerContact`:customer 对象剥离 phone/wechat/email/contact,不进快照 | **只影响新构建快照** → 见 §3 重新发布 |
| `getCustomerHome` | 停止返回 `execution_note`;加 `customer_visible !== false` 过滤 | 直接部署 |
| `getQuoteInviteByToken` | 司机 invite 面不再回显 `execution_note`,只用 dispatch_note/special_requests | 直接部署 |

**前端(不是云函数,随小程序上传/预览生效):**
`miniprogram/pages/customer/home/home-page-config.js`、`miniprogram/pages/customer/hotel-detail/hotel-detail.js`
—— 091 酒店硬编码加了 `isTrip091HotelContext` 门(任意 Hyatt/KoP 酒店不再被注入 091 的 `#660610`)。上传小程序或 DevTools 预览即生效。

---

## 2. C 组 · 其余云函数(为一致性,A 组验完后一起部署)

| 云函数 | 改了什么 | 特别注意 |
| --- | --- | --- |
| `getCustomerTransportQuotes` | `customer_visible=false` 非运营拒;删 execution_note | |
| `getOperatorTripPreview` | 回带 `active_hotel_invites`(运营撤销分享卡用) | 见 §5 索引建议 |
| `opsUpsertRideRequest`（F1） | force 终态保护/CONFLICT_LOCKED、HMAC 签 timestamp+body、幂等收口 | Web 侧 HMAC 须对 `${x-ops-sync-timestamp}.${rawBody}` 签名 |
| `searchElongHotels` | 加鉴权、preview 持久化、城市缓存不投毒、单调用超时 25s→8s、per-openid 限频 | **控制台把函数超时调到 ~60s**;`rate_limits` 集合未建时限频 fail-open(可后补） |
| `createManualHotelOrder` | 按 preview_id 服务端回查用存储价（防改价下单）、幂等键含 preview_id | 依赖 `searchElongHotels` 先写 `hotel_order_previews` |
| `createHotelOrderInvite` | 复用刷新版本快照、`action:'revoke'` 撤销 | |
| `manageManualHotelOrders` | 列表 `orderBy(created_at desc)` 不丢最新单 | |
| `submitQuickQuote` | 非司机账号不得经报价链接转成司机 | |
| `updateOperatorTripOwnership` | 归属保存不再清空 customer_profile_id;phone/wechat 仅顶层 | |

---

## 3. ⚠️ 部署 A 组后必做:重新发布受影响行程（需运营批准）

`buildCustomerTripVisibleDraft` 的 PII 剥离只作用于**之后构建**的快照。历史已发布快照仍是修复前内容。

对每条**已发布、且 customer 对象曾带过手机号/微信**的普通行程:
```
运营页 customer-trip-detail → 生成客户可见草稿(重建)→ 发布
```
- 091 走硬编码路径,不经 stripCustomerContact,不受此影响(维持现状)。
- 只需处理"customer 对象里有 phone/wechat"的行程;不确定的可全部重发一遍(幂等,安全)。

---

## 4. 验证(每步都做,静态之外的动态验证)

1. **A 组部署 + 前端上传后**,DevTools/真机:
   - 运营发布一条普通行程 → 生成客户分享卡 → **换另一个 openid（家庭群成员）打开** → 核对:
     - [ ] 看不到客户本人手机号 / 微信号；
     - [ ] 酒店卡确认号是真实值或"待同步",**不是 091 的 `#660610`**；
     - [ ] 司机/报价面看不到 `execution_note` 内部文案。
2. **C 组部署后**:酒店搜索能出结果(不超时)、下单价格以服务端为准、撤销分享卡后客户旧链接打不开（`INVITE_INACTIVE`）。

---

## 5. 控制台 / 集合 / 索引事项（按需，不阻塞主流程）

- **`searchElongHotels` 函数超时**:控制台调到 ~60s（多次串联上游调用需要）。
- **`rate_limits` 集合**:建了才激活酒店搜索限频（40 次/60s/openid);不建则 fail-open（搜索照常，只是不限频）。阈值是暂定默认,写在 `searchElongHotels` 常量里可调。
- **`hotel_order_invites` 索引**:建议 `trip_id`(或 `trip_id`+`status`)索引(getOperatorTripPreview 现在按 trip 查 active invite);数据量小时无索引也能跑,查询失败已 catch→[] 兜底。
- **`hotel_order_previews`**:createManualHotelOrder 依赖它;首次写自动建，无需手动。

---

## 6. 明确不动（保留建议,本批未改）

- 供应商 token 最小化（客户房卡带 little_majia_id 等，预订闭环需要）；
- `createManualHotelOrder` OPENID 401 守卫（审查证实不可达，纯一致性）；
- order-preview 客户端 15 分钟锁二次校验（服务端已拒过期）。

---

## 7. 部署顺序总览

```
1. 部署 A 组 3 个云函数 + 上传小程序前端
2. 重新发布受影响普通行程(§3,运营批准)
3. 动态验证 §4.1(换账号打开分享卡,核对无 PII / 无错误确认号)
4. 验证通过 → 部署 C 组(含 searchElongHotels 超时调整)
5. 动态验证 §4.2(酒店搜索/下单/撤销)
6. 处理 §5 控制台/索引事项
```
