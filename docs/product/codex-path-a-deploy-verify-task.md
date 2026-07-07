# Codex 交接 · 部署并真机验证:客户行程两层主线

> 交接给 Codex(负责 CloudBase / DevTools 部署与真机验证)。作者侧无 CloudBase / DevTools 权限,只提交代码。
> 本文是**合并版**,涵盖自上次上传 `e855fe5`(v2026.7.6)以来的全部改动:Path A tab + 第二层发布闸门 + 预览客户界面带 bottombar。
> 守卫防的是**代码回归**,防不了**真机渲染**——第 5 节真机验证才是重点。

## 0. 业务主线(先懂这个;权威全文见 [`itinerary-sheet-discipline.md`](itinerary-sheet-discipline.md) 顶部「业务主线」表)
1. 网页排行程 → 生成手机行程单图 → 同步(`opsUpsert` **自动**写 `published_snapshot` 内容 + 顶层 `itinerary_sheet` 图)。
2. 运营:**预览客户界面** + **准备转发客户**(生成 invite)。
3. 客户点分享卡 → 落「我的行程」tab(**带 bottombar**)→ 看**手机行程单图**(第一层 / 草稿态)→ 线下与顾问确认。
4. 运营:客户确认后 → **发布正式行程**(`customer_official_released=true`)。
5. 客户:tab 升级为**正式行程卡片**(第二层 / 正式态);手机行程单图降为「查看完整行程单」。
6. 运营可**收回** → 客户回落第一层。

**铁律**:内容发布(自动) ≠ 客户可见(手动 release,默认关);客户永远只读;实现不得突破主线。

## 1. 分支(已 push,与远端同步)
`codex/091-customer-card-ui`(HEAD `b3884c6`)

## 2. 部署面(自 `e855fe5` 以来的全部改动)
### 云函数(4 个,必须**一起**部署)
- `getCustomerTripByInvite` — 官方闸门加 `customer_official_released===true`(未 release 回落第一层图)
- `getCustomerHome` — 同上(`normalizePublishedTripSnapshot`)
- `publishCustomerTrip` — 发布写 `customer_official_released:true`;`event.release===false` 收回
- `getOperatorTripPreview` — 返回 `customer_official_released`

### 小程序(5 个文件,重新上传)
- `miniprogram/pages/customer/home/home-page-config.js`
- `miniprogram/pages/customer/home/home.wxml`
- `miniprogram/pages/customer/home/home.wxss`
- `miniprogram/pages/operator/customer-trip-detail/customer-trip-detail.js`
- `miniprogram/pages/operator/customer-trip-detail/customer-trip-detail.wxml`

### 不在本批
`opsUpsertCustomerTrip` **一行未改,不要动**(22/22 + image_url 链路)。

## 3. 前置检查(作者本地已全绿,你复核)
- `node scripts/itinerary-discipline-check.js`（R1..R6b 全过）
- `node scripts/ops-upsert-customer-trip-test.js`（仍 22/22）
- `node --check` 上面 4 云函数 `index.js` + `home-page-config.js` + `customer-trip-detail.js`
- 确认线上 `createCustomerTripInvite` 的 `buildTripSharePath` 返回 `/pages/customer/home/home?trip_id=...&invite_code=...`
  （Path A 入口依赖;若线上还是旧的落 `mobile-itinerary`,按分支版本部署一次该云函数）

## 4. ⚠️ 两个硬提醒
1. **4 个云函数必须同批**:只部署读闸门不部署运营发布按钮 = 客户全被闸死看不到正式行程。
2. **部署即回落**:所有存量行程(含已给客户看正式行程的)会回落到手机行程单图,直到运营逐个点「发布正式行程」。
   这是 owner 要的默认关语义,不是 bug——上线前知会运营去 release 存量行程。

## 5. 真机 / DevTools 验证(按主线走,用一条已同步、有 sheet 的测试行程,如 096 / 102)

### 入口(Path A)
- [ ] 客户点分享卡 → 短暂落 home 后自动 `switchTab` 到「我的行程」tab,底部 bottombar 可见、选中「我的行程」

### 第一层(未发布)
- [ ] 运营页第二步显示「未发布」+「发布正式行程」按钮(有 draft 才可点)
- [ ] 客户 tab = 手机行程单图(第一层);图不可长按保存、无转发、无下载

### 预览客户界面(重点:忠实 + 带 bottombar + 可返回)
- [ ] 运营页第一步 / 第二步点「预览客户界面」→ `switchTab` 落**带 bottombar 的真 tab**,显示与客户所见一致(此时 = 第一层图)
- [ ] tab 顶部有浮动「‹ 退出运营预览」→ 点它能返回运营详情页(不被顶死在客户 tab)

### 发布(第一层 → 第二层)
- [ ] 运营点「发布正式行程」→ toast 成功 → 客户 tab 刷新后 = 正式行程卡片(第二层);运营页第二步变「已发布 v?」+「收回正式行程」
- [ ] 此时运营点「预览客户界面」→ 带 bottombar 的 tab 显示正式行程卡片(第二层)

### 收回
- [ ] 运营点「收回正式行程」→ 客户 tab 回落手机行程单图;`published_snapshot` 内容不变

### 拦截 / 回归
- [ ] 关键警告未清点发布被拦(`CRITICAL_WARNINGS_REMAIN`);无 draft 时发布按钮禁用
- [ ] 酒店 / 访校 / 评价卡等独立模块不受影响(评价上下文 `getRideReviewContext` 仍按 published 显当天摘要,已知边界)

## 6. 纪律(硬约束)
- 不碰 091(`bf757c4c...` / `2026XBC091`):保留 `opsUpsert*` 的 091 reject
- 不下发客户 PII / 派单前司机身份 / 成本 / 供应商
- 不动 `opsUpsertCustomerTrip`;只部署上面列的 4 云函数 + 5 小程序文件

## 7. 反馈
逐条回填 `[ ]`。失败**先别改码**:
- 发布相关 → 贴 `getOperatorTripPreview` 的 `customer_official_released` 与 `getCustomerTripByInvite` 的 `stage`
- 入口 / 预览相关 → 贴 tab 的 `data.tripInviteMode` / `data.operatorInvitePreview`
