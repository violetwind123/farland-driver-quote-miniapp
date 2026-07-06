# Codex 任务 · 部署并真机验证 Path A(客户行程体验落「我的行程」tab)

> 交接给 Codex(负责 CloudBase / DevTools 部署与真机验证)。作者侧无 CloudBase / DevTools 权限,只提交代码(未 push)。
> 守卫防的是**代码回归**,防不了**真机渲染**——本文的第 3 节验证清单才是重点。

## 背景:Path A 模型
客户点分享卡 → 落非 tab 页 `pages/customer/home/home`(接住 `trip_id`/`invite_code`)
→ home 只做两件事:把 invite 存本地键 `customer_active_trip_invite` + `wx.switchTab` 到
  `pages/customer/itinerary-tab/itinerary-tab`,**自己不渲染 invite**
→ `itinerary-tab`(带 `__isItineraryTab: true` 标记)无参进入 / onShow 收到新分享时读本地 invite
  → 复用 home 的 invite 三态视图渲染:**未发布** = 空态 +「查看行程草稿」按钮 → 点开内联图;**已发布** = 行程卡片。
→ tab 自带 bottombar;内联图 `z-index` 低于自定义 tabBar,bottombar 保留;客户只读(无下载 / 保存 / 长按 / 转发)。

不建 `customer_trip_access`(不自动绑定);显式「保存到我的 Farland」仍是唯一服务端绑定路径。

规范全文见 [`itinerary-sheet-discipline.md`](itinerary-sheet-discipline.md) §7 Path A。

## 分支 / 提交(本地,未 push;若 Codex 在远端请先让作者 push)
- branch: `codex/091-customer-card-ui`
- Path A 提交:`58a3ef0`(接线)→ `2b90471`/`934823c`(文档)→ `3e5a428`/`f98b77a`(守卫加固)
- 本轮**只动 4 个文件**:`home-page-config.js`、`itinerary-tab.js`(需部署)、`itinerary-discipline-check.js`、`itinerary-sheet-discipline.md`(dev-only)

## 1. 前置检查
- 守卫必须过:`node scripts/itinerary-discipline-check.js`(应输出 ✓ R1..R6b 全过)
- `node --check miniprogram/pages/customer/home/home-page-config.js`
- `node --check miniprogram/pages/customer/itinerary-tab/itinerary-tab.js`

## 2. 部署范围(本轮只此)
- 上传 2 个小程序文件(DevTools 上传 / 预览):
  - `miniprogram/pages/customer/home/home-page-config.js`
    (注意:此文件被 home 页和 itinerary-tab **共用**,一次上传同时影响两处)
  - `miniprogram/pages/customer/itinerary-tab/itinerary-tab.js`
- 云函数:本轮**无改动,不需重新部署**。
  但请确认 `createCustomerTripInvite` 线上版 `buildTripSharePath` 返回的是
  `/pages/customer/home/home?trip_id=...&invite_code=...`(Path A 的入口依赖它落 home)。
  若线上还是旧的落 `mobile-itinerary`,请把该云函数按分支版本部署一次。

## 3. 真机 / DevTools 验证清单(重点)
用两条测试行程各走一遍:一条【未发布但已生成 sheet】、一条【已发布】(如 096 / 102)。

### A. 入口跳转
- [ ] 打开客户 invite 分享卡 → 短暂落 home 后自动 switchTab 到「我的行程」tab(不是停在无 bottombar 的 home)
- [ ] tab 底部 bottombar(自定义 tabBar)可见,选中态在「我的行程」

### B. 未发布(sheet_draft)
- [ ] tab 显示「跟没有行程一样的空态 + 一个『查看行程草稿』按钮」
- [ ] 点按钮 → 内联展开手机版行程单图,底部 bottombar 仍可见
- [ ] 图不可长按保存、无转发按钮、无下载 / 保存入口
- [ ] 点「返回」→ 回到空态 + 草稿按钮界面(不是退出小程序)

### C. 已发布(official)
- [ ] tab 显示行程卡片(行程总览 / today card),不是只有一张图
- [ ] 「查看完整行程单」作为次要入口仍能打开内联图(只读)

### D. 复用 / 切换
- [ ] 已在 tab 时再打开另一条 invite 分享卡 → tab 切到新行程(onShow 生效)
- [ ] 手动切到 hotel tab 再切回「我的行程」→ 状态不丢、不重复请求

### E. 回归(别被 Path A 带坏)
- [ ] 运营端「客户主页预览 / 手机版行程单预览」照常
- [ ] 手机版行程单推送链路(`image_url` + 服务端上传 `cloud://`)不受影响

## 4. 纪律(硬约束)
- 不碰 091(docId `bf757c4c...`、`2026XBC091`):不新增写路径,保留 `opsUpsert*` 的 091 reject
- 不下发客户 PII / 派单前司机身份 / 成本 / 供应商到客户面
- 不动 `opsUpsertCustomerTrip` 的 `image_url` 链路(已 22/22 通过)
- 只部署上面列的 2 个小程序文件;不顺手改别的

## 5. 反馈
逐条回填上面 `[ ]`,失败项贴现象 / 截图 / console。
若 B / C 任一 tab 显示不对(比如 sheet_draft 显示了行程卡片、或已发布只显图),**先别改代码**,
把 `getCustomerTripByInvite` 返回的 `stage` 值和 tab 当前 `data.tripInviteMode` / `data.tripInviteSheet` 贴出来给作者。

---

# 追加任务 · 第二层发布闸门(customer_official_released,owner 定:默认关)

规范见 [`itinerary-sheet-discipline.md`](itinerary-sheet-discipline.md) §7.1。模型:内容照常自动发布(opsUpsert 不碰),但客户看不看得到**正式行程卡片**由运营手动 release 控制;默认关 → 行程停在草稿态(客户看手机行程单图),运营在运营详情页点「发布正式行程」才升级。

## D1. 部署范围(这 4 个云函数须**一起**部署,缺一会出问题)
- `getCustomerTripByInvite`(official 闸门加 `customer_official_released===true`)
- `getCustomerHome`(同上)
- `publishCustomerTrip`(发布写标记 true;`release:false` 收回)
- `getOperatorTripPreview`(返回 `customer_official_released`)
- 小程序:重新上传(含 `operator/customer-trip-detail/*` 的第一步/第二步、`customer/home/home-page-config.js` 的 op_preview 分支)。
- ⚠️ **只部署读闸门不部署运营发布按钮**(或反之)= 客户全被闸死看不到正式行程 / 发布无效。务必同批。
- ⚠️ opsUpsert **不在本批**,一行未改。

## D2. 部署即行为变化(务必知会)
部署后,**所有存量行程**(包括之前已给客户看正式行程卡片的)都会**回落到手机行程单图**,直到运营在运营详情页逐个点「发布正式行程」。这是 owner 要的默认关语义,不是 bug。上线前确认运营知道要去 release 存量行程。

## D3. 验证清单(真机 / DevTools)
用一条【已同步内容、有 sheet】的测试行程:
- [ ] 运营详情页第二步显示「未发布」+「发布正式行程」按钮(要有 draft 才可点)
- [ ] 发布前:客户 tab = 手机行程单图(第一层);运营页第一步「预览客户界面」打开也是图,且能返回运营页(不被顶到客户 tab)
- [ ] 点「发布正式行程」→ toast 成功 → 客户 tab 刷新后 = 正式行程卡片(第二层);运营页第二步变「已发布 v?」+「收回正式行程」
- [ ] 点「收回正式行程」→ 客户 tab 回落到手机行程单图;`published_snapshot` 内容不变(只是不可见)
- [ ] 关键警告未清时点发布 → 被拦(`CRITICAL_WARNINGS_REMAIN`);无 draft 时发布按钮禁用
- [ ] 回归:酒店 / 访校 / 评价卡等独立模块不受影响(评价上下文 `getRideReviewContext` 仍按 published 显示当天摘要——已知边界,未纳入闸门)

## D4. 反馈
逐条回填;若发布后客户 tab 仍显图(或未发布就显卡片),贴 `getOperatorTripPreview` 返回的 `customer_official_released` 与 `getCustomerTripByInvite` 的 `stage`。
