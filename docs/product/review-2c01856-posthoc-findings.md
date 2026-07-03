# 2c01856 事后深审:发现与修复清单(F1/酒店流部署门槛)

> 审查方式:5 审计面并行 + 逐条反驳式核实(24 agents)。15 项确认(6 bug + 9 risk)、4 项被驳(证据充分)、10 备注、0 丢弃。
> **判定:`opsUpsertRideRequest`(F1)与艺龙酒店流 均 ❌ 不予部署,修完 P0 后放行。**
> 已在线上的前端改动中另有 2 个 bug 需尽快修(#12/#13)。

---

## 判定依据(一句话版)

- **F1**:终态保护可被 `force_new_request` 绕过(直接违反 `ops-dispatch-boundary-decision.md` 的 conflict_locked 强制条款,且会杀掉客户已选中的报价面)+ HMAC 未签时间戳(可永久重放)。
- **酒店流**:订单价格完全取自**客户端传入的 preview**(无服务端校验 = 可改价下单)+ `searchElongHotels` **无任何调用者鉴权**(任意用户烧付费配额)且 25s HTTP 超时配 3s 函数默认限制**在生产必然超时**(同 091 build 超时如出一辙)。

---

## P0-F1(修完放行 F1 部署)

| # | 严重度 | 问题 | 位置 | 修法 |
| --- | --- | --- | --- | --- |
| 1 | 🔴 bug | `force_new_request/force_reopen` 绕过终态保护:TERMINAL 检查跑在重推的新 doc 上,被替换请求的 assigned/confirmed 状态从未检查;`retireCustomerVisibleQuoteSurface` 无条件取消旧请求全部 quote_invites + 含 `selected` 的客户报价面;旧 doc 无 superseded 标记 | `opsUpsertRideRequest/index.js:270-289, 349-351, 234-245` | force 前先读被替换 doc:非 `cancelled` 则拒绝或写 `conflict_locked` + audit 人工裁决;旧 doc 打 `superseded_by_request_id` |
| 2 | 🟠 risk | HMAC 只签 rawBody,`x-ops-sync-timestamp` 不在签名内 → 截获一对 (body,signature) 可永久重放;且双方缺 `ops_payload_hash` 时同版本会落全量 update(今日无损,纵深缺口) | `:121-131, 309, 322, 337-348` | 签 `${timestamp}.${rawBody}`;同版本缺 hash 视为幂等/冲突而非 update |
| 3 | 🟠 risk | `customer_visible` 只写不读(全仓唯一出现点):push `false` 的请求照样被 getCustomerTransportQuotes/getCustomerHome 完整服务 | `opsUpsertRideRequest/index.js:199` + 读路径 | 在两个客户读路径强制 `customer_visible===false` 拒绝/过滤;或从契约删掉该字段 |
| 4 | 🟠 risk | `execution_note` 双重用途:ops 自由文本同时渲染给**客户**(transfer-detail/home)和司机(quick-quote),契约只把 dispatch_note 列为司机安全,客户安全性无人分类 | `getCustomerHome:599,908`、`getCustomerTransportQuotes:521`、`transfer-detail.wxml:71`、`home.wxml:374+` | 拆字段:`customer_note`(客户安全)与 dispatch/execution(司机);客户读路径停止返回 execution_note |

## P0-Hotel(修完放行酒店流部署)

| # | 严重度 | 问题 | 位置 | 修法 |
| --- | --- | --- | --- | --- |
| 5 | 🔴 bug | **订单定价完全信任客户端**:价格/房型/取消政策 verbatim 取自客户端 `preview`,`preview_id` 从不回查(searchElongHotels 不持久化 preview) | `createManualHotelOrder/index.js` | searchElongHotels 服务端持久化 preview(id→价/房/过期);下单按 preview_id 服务端取价 |
| 6 | 🔴 bug | `searchElongHotels` 顺序串联 Elong HTTPS 调用,单次超时默认 25s,函数目录**无 config.json 提超时** → 生产 3s 限制必超 | `searchElongHotels/index.js` | 加 config 提到 60s;单调用降 5-8s;detail 调用 `Promise.allSettled` 并行 |
| 7 | 🔴 bug | `searchElongHotels` **零鉴权**(不 require wx-server-sdk,无 OPENID/角色/状态检查,无日志)→ 任意用户烧付费配额 | 同上 `exports.main` | 加 OPENID + active user 门控(参照 elongHotelGateway),加 per-openid 限频 |
| 8 | 🔴 bug | 城市列表缓存投毒:首页失败(非 '0' Code)时把**空数组缓存 24h** | `:715` 附近 | 仅 `cities.length>0` 才写缓存;失败用短负缓存 |
| 9 | 🔴 bug | 幂等 token 全局复用串草稿:`client_order_token` 单一 storage key,仅成功才清 → 超时后换酒店重下,拿回**上一单**(标题还显示"提交成功") | `hotel/order-preview` | token 按草稿派生(preview_id)或 preview 变更即重生成 |

## P0-已上线前端(与部署无关,尽快修)

| # | 严重度 | 问题 | 位置 | 修法 |
| --- | --- | --- | --- | --- |
| 10 | 🔴 bug | **091 酒店硬编码经新 invite 路径泄给任意酒店分享卡**:名字命中 hyatt/kop 模糊键即注入 091 写死的入住日期/预订号(inventory 文档层③的精确复发) | `customer/hotel-detail.js`(resolveKnownTrip091Hotel*) | 兜底函数加 `trip_no===2026XBC091` 门(短期);C4 删除(终态) |
| 11 | 🔴 bug | 司机"获取微信昵称"用 `wx.getUserProfile`——基础库 2.27.1 起恒返回匿名"微信用户"+灰头像,自动填进 users/driver 档案 | `driver/quick-quote` | 删按钮或改 `input type="nickname"` + open-type avatar 模式;禁止匿名昵称自动填名 |

## P1(部署后一周内)

- 酒店 invite 复用不比对 `published_version` → 重发布后旧快照继续被分享(bug,`createHotelOrderInvite`)。
- `hotel_order_invites` 无撤销路径(status 检查是死防御)。
- `manageManualHotelOrders` `.limit(100)` 无 orderBy → 超量后最新待付订单可能不可见。
- 客户房卡暴露供应商内部 token(little_majia_id/goods_uniq_id 等,预订闭环需要,但应评估最小集)。
- `createManualHotelOrder` 补 OPENID 401 守卫(纯一致性,exploit 不可达已证)。

## 被驳回(不修,有据)

1. 全量覆盖写=设计语义(单向快照推送,patch 反而破坏字段清除传播);2. 报价 invite 群链接可见工作单=已签署的产品设计(司机注册前必须能看单);3. `createManualHotelOrder` 空 openid 不可达(平台注入,无 HTTP 触发器);4. elongHotelGateway verbatim 透传=运营专用工具+validate 回环需要原始字段。

## 正面确认(审查同时证实的)

- `opsUpsertRideRequest` **无 callFunction 绕过**(直接调用与 HTTP 同路,无签名必拒);签名字符串与解析体一致。
- `getCustomerTransportQuotes` 的 lib 删除**未丢鉴权**(逐字节等价内联)。
- `selectDriverQuote` 只透传不透明 ops id,无边界问题;`getRequestDetail` 仍 operator-only。
- 评价卡转发路径参数往返正确。

## 备注(挂账)

`reopened_at` 无写入者(isQuoteFromCurrentRound 是 no-op)、opened 事件覆盖首开时间戳、日期无远期/停留时长边界。
