# P4-D2 行程详情页收口 — 状态与 Codex 任务

> 范围原则:只做收口,不引入新业务对象、不改 schema、不碰单次用车链路
> (`ride_requests` / `driver_quotes` / `transport_orders`),不提前做 P5 评价。

---

## 一、已完成:P4-D2A(本批已落地,无需 Codex 重做)

目标:让 `customer-trip-detail` 成为正式的单行程管理入口,补齐"进入客户真实页面"这一验收缺口。

### 1. `customer-trip-detail` 新增"进入客户真实页面"(只读)

- 文件:`miniprogram/pages/operator/customer-trip-detail/customer-trip-detail.{js,wxml,wxss}`
- 新增方法 `openCustomerFacingPreview()`:
  1. 调云函数 `getOperatorCustomerHomePreview`,入参 `{ trip_id, preview_access_mode: 'temporary_guest' }`
  2. 取 `result.customer_share_preview` 写入 `app.globalData.operatorCustomerSharePreview`
  3. `wx.navigateTo` 到 `customer-trip-mobile-preview`
- UI:在"客户视图预览"面板顶部加 CTA 卡片(按钮"预览"),并加一行提示区分"下方 inline 快照仅供字段审阅"。

**关键设计决策(已裁决,勿改):**

- 渲染端 `customer-trip-mobile-preview` 是 `Page(customerHomePageConfig)`,**与客户 home 共用同一份 page config**,只是改从 `globalData.operatorCustomerSharePreview` 读数据。
  因此"运营所见 = 客户所见"由**共用配置**保证,而非真的走客户路由。
- **不要**改成 `switchTab` 到 `customer/home` + `tripInviteMode`。
  原因:`tripInviteMode` 分支会调 `getCustomerTripByInvite`,**要求真实 invite 存在**,违背只读原则。
- **已验证 `getOperatorCustomerHomePreview` 为纯只读**:全部 `customer_trip_access` / `customer_trip_invites` 调用均为 `.where().get()`,无任何 `.update/.set/.add/.remove`、无 `serverDate`、不写 `viewed` / `last_operator_previewed_at`。
- 未发布态安全:`buildCustomerSharePreview` 在未发布时返回 `waiting: true` 等待页,与客户真实所见一致,按钮不会崩。

### 2. 返回逻辑修正

- `customer-trip-detail.js`:`backToImport()` → `backToTripManagement()`,fallback url 改为
  `/pages/operator/trip-management/trip-management`;WXML 文案"返回导入" → "返回行程管理"。

### 3. Dashboard 旧入口降级(未删除)

- `dashboard.{wxml,wxss}`:"客户界面预览" → "客户界面预览(辅助)",移到列表末尾,加 `legacy-entry` 类做视觉弱化(opacity 0.72 + 标题降权)。保留其独有能力(按 `request_id` 预览、按指定已注册客户预览)。
- `customer-home-preview.{js,wxml,wxss}`:页面顶部加 `legacy-notice` 提示条,点击跳 `trip-management`(`goTripManagement()`)。

### 4. 统计口径 label 收口

- `trip-management.{js,wxml}`:列表卡片 metric label `active access` → **"已保存人数"**;
  值由 `X 人已保存` 改为 `X 人`(与"行程天数 / X 天"的现有 metric 模式一致)。
  口径不变:`active_access_count` 仍来自 `customer_trip_access`(status=active),`unpublished` 仍来自 `customer_trips.visibility_status !== 'published'`。

### P4-D2A 验收清单

- [ ] 行程管理 → 进入某 trip → 点"进入客户真实页面",**已发布行程**显示正式客户页。
- [ ] 同一按钮,**未发布行程**显示等待页(不报错、不创建 invite/access)。
- [ ] `customer-trip-detail` 点返回,回到行程管理列表。
- [ ] Dashboard 不再有两个并列的同类预览入口造成混淆。
- [ ] 进入真实页面后,`customer_trip_access` 无新增记录(只读验证)。

---

## 二、下一步:P4-D2B(给 Codex 执行)— 分享卡不再预绑定 access

### 背景(经代码核对修正)

> ⚠️ 原假设"客户打开分享卡自动保存"**不成立**,已核对推翻:
> - `getCustomerTripByInvite`:对 `customer_trip_access` 全是 `.where().get()` 只读,返回 `auto_saved: false`。打开**不写** access。
> - 真正污染源是 **`createCustomerTripInvite`**:当传入 `customer_user_id` 时,会调
>   `upsertCustomerTripAccess` **预写一条 `status:'active'` 的 access**(`granted_source:'operator_share_card'`,
>   `bind_mode` 默认 `farland_profile`)。运营生成"指定客户分享卡"= 客户还没自存就被计入"已保存人数"。
> - 两个调用方会触发:`customer-home-preview.js:526`、`customer-import.js:712`。
>   `customer-trip-detail.js:303`(P4-D2A 新增)只传 `trip_id`,**已干净**。

### 目标边界

```
createCustomerTripInvite  = 只创建/复用 customer_trip_invites + 记录 intended-customer 元数据;绝不写 customer_trip_access
saveCustomerTripToProfile = 唯一创建 active customer_trip_access 的入口
listOperatorTrips 已保存数 = 排除 granted_source = operator_share_card
```

这也对齐 P4-D3 原则:trip ownership / intended customers 与 `customer_trip_access` 分离。

### 改动点(Codex 执行)

1. **云函数 `createCustomerTripInvite`:移除 access 预写。**
   删去 `customer ? upsertCustomerTripAccess(...) : null` 两处调用(复用 invite 分支 ~224 行、新建 invite 分支 ~300 行),
   函数不再写/改 `customer_trip_access`。
2. **invite 上新增 intended-customer 元数据(是"新增"不是"保留)。**
   核对发现 `inviteData`(~284 行)**当前根本没存 `customer_user_id`**,customer 只用于派生 access + 写 audit log。
   故需在 `inviteData` 增加 `intended_customer_user_id`(及可选 `intended_customer_name` / `bind_mode`),
   否则移除 access 预写后归属信息会丢失。客户端可继续传 `customer_user_id / bind_mode`,云函数只当元数据存。
3. **云函数 `saveCustomerTripToProfile`:自存时覆盖 `granted_source = 'invite_save'`。**
   现第 170 行 `existing ? (existing.granted_source || 'invite_save') : 'invite_save'` 会**保留**旧的
   `operator_share_card`,导致"先被预绑定、后真实自存"的客户被 B 误排除。改为自存一律写 `invite_save`,
   使 `granted_source` 成为可靠判据。
4. **云函数 `listOperatorTrips`:计数排除 `operator_share_card`。**
   在 `activeAccessCountForTrip` 的 in-memory 去重循环里加 `if (row.granted_source === 'operator_share_card') 跳过`。
   **用内存过滤,不要用 `.where(_.neq(...))`**——避免 null/缺失字段语义坑,保证 `invite_save` 和历史无字段记录仍计数。

### 约束

- **不新建云函数**;改的是 `createCustomerTripInvite` / `saveCustomerTripToProfile` / `listOperatorTrips`。
- **不改 schema**(仅在 invite 文档**追加**元数据字段,向后兼容)。
- **不碰** `ride_requests` / `driver_quotes` / `transport_orders`。
- **不动存量数据**(见第三节,存量清理是独立迁移)。
- **不做** P5 评价。

### 验收

- [ ] 运营生成"指定客户分享卡" → 只产生 `customer_trip_invites`,**不产生** `customer_trip_access`。
- [ ] invite 文档上能查到 intended-customer 归属。
- [ ] 客户点"保存到我的 Farland" → 创建/更新 1 条 access,`granted_source = invite_save`(同 openid 幂等)。
- [ ] `trip-management` 的"已保存人数"= 仅真实自存者;运营预绑定 / 家庭群多人查看不计数。
- [ ] **客户侧不受影响**:`getCustomerHome` 未改,B 不会让任何客户在"我的行程"丢卡。

### B 安全性已验证

`getCustomerHome.findCustomerTripAccess`(~1294 行)按 openid/user_id 查 access、**不按 granted_source 区分**,
故 B(仅改 `listOperatorTrips` 运营侧计数)**完全不影响客户"我的行程"可见性**。这也正是存量清理(A)必须谨慎的原因。

---

## 三、后续路线(本批之后,逐条独立)

| 阶段       | 内容                                                          | 依赖          |
| ---------- | ------------------------------------------------------------- | ------------- |
| P4-D2B     | 分享卡不再预绑定 access + 计数排除 `operator_share_card`(见上) | P4-D2A 已稳定 |
| P4-D2B-mig | 存量 `operator_share_card` access 清理(A)——独立数据迁移      | P4-D2B 上线后 |
| P4-D3      | 同行客户 / 家庭归属(运营归属,非 access)                      | P4-D2B        |
| P4-D4      | 每日行程卡旁生成评价卡入口(仅复制路径,不做卡)                | P4-D3         |
| P5-1       | 客户评价卡页面与提交(`trip_id + day_no` 锚点)                 | P4-D4         |
| P5-2       | 评价结果汇总(按 day / trip / driver / vehicle)               | P5-1          |

### P4-D2B-mig:存量清理(A,先 B 止血、确认无依赖后再做)

- 已确认 `getCustomerHome` 会把 `operator_share_card` access 当作客户可见行程展示,**直接删/置 inactive 会让预绑定但从未自存的客户在"我的行程"丢卡**。
- 因此 A 必须:① dry-run 查询 `granted_source='operator_share_card' AND status='active'` 的数量 + `trip_id`/`customer` 明细;② 备份;③ 与运营确认这些客户是否应保留可见;④ 一次性转换/清理 + 回滚方案。
- 注:P4-D2B 第 3 点(自存覆盖 `granted_source`)上线后,真实自存者会陆续转成 `invite_save`,残留 `operator_share_card` 的集合会逐步收敛为"纯预绑定从未自存",使 A 的清理目标更干净。

每日评价锚点已定:`review_scope = trip_day`,主锚 `trip_id + day_no`;当天有用车时双写
`transport_order_id / driver_id / vehicle_id` 以支撑司机质量沉淀。
