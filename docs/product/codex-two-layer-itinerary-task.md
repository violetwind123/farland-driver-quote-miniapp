# Codex Task v2: Two-Layer Itinerary — Sheet (forward-only) → Official (publish-after-confirm)

> 执行前必读:`docs/product/miniprogram-dev-guidelines.md`(边界总则,优先级高于设计稿)、`docs/product/p5-itinerary-sheet-png-contract.md`(PNG 契约)。
> 基线:分支 `codex/091-customer-card-ui`,HEAD `1477601`,工作树干净。
> 禁止改:酒店页、091 gate、评价卡、app.json/tabBar、theme.wxss。

## 0. 一句话

手机版行程单 = web 生成的图,小程序**转发即见、无需发布**;正式行程(R3 UI)= 客户线下确认后运营**手动发布**;同一 invite 链接自动升级;手机行程单图发布后降级为"查看完整行程单"次要入口。**小程序绝不端上自渲染行程。**

## 1. Goal

```
Layer 1 手机版行程单 (Web-generated sheet)
- Web produces itinerary_sheet PNG → 写入 customer_trips.itinerary_sheet (TOP-LEVEL field).
- Mini-program DISPLAYS + FORWARDS the sheet. No official publish required.
- 有效 invite_code = 临时查看 sheet。打开 invite 不创建 customer_trip_access
  (绑定是单独的显式"保存到我的 Farland"动作)。

Layer 2 正式行程 (Official R3 UI)
- 运营在客户线下确认后手动 发布正式行程(小程序不追踪确认过程)。
- 同一 invite 链接自动升级:customer/home 每次打开重新判定状态。
- 发布后 sheet 图保留为次要「查看完整行程单」入口。
```

小程序**禁止**用 `tripInviteTrip.days` / `todayOverviewCard` / `daily_summary_cards` / `itinerary_days` 重排行程;手机行程单**只消费** `customer_trips.itinerary_sheet`。

**客户分享主路径 = `/pages/customer/home/home?trip_id=xxx&invite_code=xxx`**(不是 mobile-itinerary)。`mobile-itinerary` 仅作 sheet 图片查看子页;无图显示「手机版行程单生成中,请稍后查看或联系 Farland 顾问」。

## 2. 数据形态(权威)

```js
customer_trips: {
  itinerary_sheet: { png_url, width, height, order_no, version, generated_at, source_hash }, // TOP-LEVEL
  draft_snapshot: {},      // 永不作为客户可见源
  published_snapshot: {}   // Layer-2 正式 UI 源
}
```

读取规则:Layer 1 **只读** `customer_trips.itinerary_sheet`,**绝不读** draft_snapshot 里任何其他字段。历史数据若曾把 sheet 放进 draft_snapshot,可做 migration fallback,但优先 top-level 且不暴露其他 draft 字段。

## 3. 后端 —— 六个函数(不是四个)

### 3a. opsUpsertCustomerTrip —— 接受 sheet
`cloudfunctions/opsUpsertCustomerTrip/index.js`
- `buildSourceDoc`:加 `itinerary_sheet` 为**顶层** explicit field-pick `{png_url,width,height,order_no,version,generated_at,source_hash}`(非裸 spread)。
- `validatePayload`:**后端 png_url scheme 白名单 = `{https:, cloud:}` 仅此**——拒 `wxfile:`/`http:`/`data:`/相对路径(wxfile 是设备本地临时路径,不能作 web 持久 URL)。
- 保留 091 reject 与全部既有 gate。`node scripts/ops-upsert-customer-trip-test.js` 必须仍全绿。

### 3b. createCustomerTripInvite —— 允许 sheet-draft invite(当前 BLOCKER)
`cloudfunctions/createCustomerTripInvite/index.js`
- 现 `:112-114` 强制 `visibility_status==='published' && review_status==='approved' && published_snapshot` → 挡死 Layer 1。改为:
```
if published_snapshot exists      → 允许 OFFICIAL invite (stage:'official')
else if itinerary_sheet.png_url   → 允许 SHEET-DRAFT invite (stage:'sheet_draft')
else                              → 拒: "手机版行程单尚未生成"
```
- **把生成路径 `:86` 改成 `/pages/customer/home/home?trip_id=...&invite_code=...`**(原为 mobile-itinerary)。两种 stage 同一路径,由 home 判定渲染什么。invite 记录存 `stage`,但访问保持 version-agnostic,使同一 invite 发布后自动升级。

### 3c. getOperatorTripPreview —— 返回 sheet 状态
`cloudfunctions/getOperatorTripPreview/index.js`(现 `itinerary_sheet` 引用 = 0)
- 返回里加:`itinerary_sheet`(scheme 校验后)+ `sheet_status`(`generating` | `ready`)+ `can_forward_sheet`(= sheet ready)。运营 UI 靠这些渲染 Layer-1 按钮/状态。

### 3d–3f. getCustomerTripByInvite / getCustomerHome / getOperatorCustomerHomePreview —— 双通道读
三者各已有 `normalizeItinerarySheet`(scheme 白名单;客户端展示可另兼容 `wxfile:`)。两通道:
- **Sheet 通道:** access-ok(invite 或已绑定)时,**始终**下发 `trip.itinerary_sheet`(顶层、scheme 校验)——即使无 published_snapshot。未发布文档里**只**下发这一个字段。
- **Waiting → sheet_draft:** getCustomerTripByInvite 的 `hasPublishedSnapshot` 分支(~`:934`)现返回 `{waiting:true}`。改:未发布 + access-ok + 有效 `itinerary_sheet` → `{waiting:false, stage:'sheet_draft', itinerary_sheet, trip:null}`;都没有则保持 `{waiting:true}`。
- **Published(Layer 2):** 有 published_snapshot → 富 trip(R3)照旧,`stage:'official'`,并带 `itinerary_sheet` 供次要入口。
- **打开时不自动创建 customer_trip_access。** 保留现有 `temporary_invite` vs `customer_trip_access` 区分(`:944/954`);绑定仍是单独显式"保存"动作。
- PII 不变:allowlist 投影 + denylist strip;sheet 是唯一新增顶层字段,安全 {url+meta};不 spread draft。

## 4. 客户 UI

### 4a. mobile-itinerary → 极简图片查看器
`miniprogram/pages/customer/mobile-itinerary/*`
- 删掉全部自渲染(行程概览/`progressNodes`、每日安排/`days`/`.mi-day-row`、今日卡/`todayOverviewCard`/`.mi-today-card`、住宿)。
- 只渲染:`<image mode="widthFix" src="{{itinerarySheet.png_url}}">` + 保存图片/转发 + 联系顾问;无图 → `手机版行程单生成中`。
- **停止复用完整 `home-page-config`。** 给它 MINIMAL config,只暴露 `{trip_id, invite_code, itinerarySheet, loading, error}` + `saveImage/previewImage/contactAdvisor`;**不得**携带 `tripInviteTrip.days/todayOverviewCard/progressNodes/selectedTripDayNo/openTripDayDetail`。(短期若为降风险保留 home-page-config,WXML 也必须一个都不引用上述字段——但目标是 minimal viewer。)

### 4b. home —— 三态
`miniprogram/pages/customer/home/home.*`(+ config)
- `stage==='sheet_draft'`:只显示「查看手机行程单草稿」→ 跳 mobile-itinerary。无 R3 UI,无空等待页。
- `stage==='official'`:R3 富 UI(不变)+ 次要「查看完整行程单」→ mobile-itinerary。
- 今日卡三份拷贝保持一致。

## 5. 运营 UI —— 两层 + 硬词汇
`miniprogram/pages/operator/customer-trip-detail/*`
- **Layer 1 手机版行程单** —— 状态 `已生成/生成中`;按钮 **预览手机行程单 / 转发客户**。无发布。`can_forward_sheet` 时可用。
- **Layer 2 正式行程** —— 状态 `草稿待复核 / 已发布 vN / 有更新待发布`;按钮 **预览正式客户界面 / 发布正式行程**(`publishTrip`)。
- **词汇铁律:Layer 1 绝不用"发布"**(Layer 1 = 转发/预览/查看;仅 Layer 2 = 发布)。消除"没发布怎么能发?"的困惑。
- 把运营转发/预览导航 `customer-trip-detail.js:869 / 952 / 1035` 从 mobile-itinerary 改到 home(纯图片预览按钮可保留 mobile-itinerary 作查看器)。解耦 转发(Layer 1)与 发布(Layer 2),去掉"必须先发布才能转发"的 gate。旧的 `published+needs_review` 文案补丁(`f5b1fd3`)随之作废。

## 6. 部署(Codex)& Web(BLOCKER —— 先查)
- 重新部署:opsUpsertCustomerTrip、createCustomerTripInvite、getOperatorTripPreview、getCustomerTripByInvite、getCustomerHome、getOperatorCustomerHomePreview。`OPS_SYNC_SHARED_SECRET` 复用。
- **在 CloudBase 先查 `customer_trips`(尤其 102 `2026NBC102`)有没有 `itinerary_sheet.png_url`。** 没有 → web 需先渲染 750px PNG 并经 opsUpsertCustomerTrip 按 PNG 契约写入。在此之前全显示"生成中",属预期非 bug。

## 7. QA(只读,不写生产)
1. DevTools 编译 0 错。
2. invite 路径:建 invite → 路径是 `/pages/customer/home/home?...`(非 mobile-itinerary)。
3. sheet-draft:有 itinerary_sheet、未发布 → 打开 invite → home 显「查看手机行程单草稿」→ mobile-itinerary 显 PNG(无等待页、无 days 渲染)。打开未创建 customer_trip_access。
4. 未发布转发:sheet ready 时运营可"转发",无需发布。
5. 发布升级:发布正式行程 → 同一 invite 现显 R3 UI + 查看完整行程单 → sheet。
6. 无图 → 生成中(无 days fallback)。
7. Greps:`grep -RE "mi-day-row|每日安排|mi-today-card" miniprogram/pages/customer/mobile-itinerary` → 空;`grep -c 查看行程卡片 miniprogram/pages/customer/home/home.wxml` → 3;无 `.phone-*`、行程主按钮非 contactAdvisor;`grep -rn "mobile-itinerary/mobile-itinerary?trip_id" cloudfunctions` → createCustomerTripInvite 里该路径已消失。
8. 酒店完好;无 091/app.json/theme 改动。

## 8. 验收
- invite 路径 = home;未发布可转发;发布使同一链接升级为 R3;sheet 保留为次要入口。
- opsUpsert png_url 后端白名单 = {https:, cloud:};itinerary_sheet 顶层;无 draft 字段泄漏客户。
- 打开 invite 不创建 customer_trip_access。
- mobile-itinerary 只渲染 PNG(+生成中),minimal config,零自渲染。
- 运营:Layer 1 绝不出现"发布";Layer 2 独占"发布"。
- PII/091 干净;opsUpsert fixture 绿;DevTools 编译;`git diff --stat` 仅上述文件(+docs)。

## 9. 回报
HEAD · 改动文件 · 部署结果 · 102 有 itinerary_sheet? · 各态行为 · greps · invite 路径检查 · 未自动绑定检查 · 酒店回归 · 是否 blocked-on-web · 是否可 push/upload。
