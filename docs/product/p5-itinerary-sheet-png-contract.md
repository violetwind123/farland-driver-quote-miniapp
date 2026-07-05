# P5 · 访校行程单长图 PNG 集成契约(web 渲染 · 小程序仅展示)

状态:契约已定,小程序侧薄集成待接(依赖 web 产出 `itinerary_sheet` 字段)。
设计源:`uploads/设计方案评估/手机端/网页端Agent-Prompt.md §八`(H5→PNG 确定性渲染规范)、`手机版行程单.dc.html` / `手机版行程单长图.png`(视觉基准)、`交接说明.md`(运营/开发交接)。

> 顶层设计板 `Farland 客户端优化.dc.html` **不含**行程单 track;字段/渲染以上述行程单专属文档为唯一依据。

## 0. 边界(与既定架构一致)

- **web 是长图 PNG 的唯一生产者**;小程序**只用 `<image>` 展示 + 保存/转发,绝不在端上重排版**(避免字体/对齐差异)。
- 走既有 **web-authoritative** 通道:web 把 PNG 的**引用**(url + meta)作为一个白名单对象 `itinerary_sheet` 写进 `customer_trips` SOURCE,经现有 `opsUpsertCustomerTrip`(HMAC)落库;发布流水线把它复制进 `published_snapshot.itinerary_sheet`。
- 091 不经此路径重建;PNG 是**客户可见物**,内容不得含成本/司机身份/供应商/毛利。

## 1. web/后端 deliverable(§八 确定性规范)

1. 用 Playwright/Puppeteer 无头渲染行程单 H5:`viewport 宽 375`、`deviceScaleFactor=2`,等 `networkidle` + `document.fonts.ready` 后 `fullPage` 截图 → **750px 宽 PNG**,文件名 `{orderNo}.png`。
2. 上传到**稳定地址**:微信云存储 `fileID`(推荐,`cloud://` / `wxfile://`)或 HTTPS CDN。
3. 生成时机:行程单**创建/修改后异步生成并缓存**;推送时直接取缓存。
4. 数据同源:同一 JSON(单号如 `2026NBC102`)既喂 H5 也喂 A4 打印版;PNG 与 H5 逐区块一致、无接缝伪影。

## 2. 数据契约:`itinerary_sheet` 白名单对象

web 通过 `opsUpsertCustomerTrip` 在 SOURCE 顶层写入(**仅这些键**,`buildSourceDoc` 白名单重建时保留):

```json
"itinerary_sheet": {
  "png_url": "cloud://prod-xxx/itinerary/2026NBC102.png",   // 仅 https:// 或 cloud://|wxfile://
  "width": 750,
  "height": 5200,
  "order_no": "2026NBC102",
  "version": 3,                 // 随行程单修改自增,用于客户端缓存失效
  "generated_at": "2026-07-04T09:00:00-04:00",
  "source_hash": "…"           // 对应行程数据快照,便于校验 PNG 是否过期
}
```

- **禁止**在此对象放任何 URL 以外的行程明细(不是数据源,只是引用);不得含 `token`/签名参数暴露内部凭据。
- `opsUpsertCustomerTrip.validatePayload`:若存在 `itinerary_sheet.png_url` 且 scheme 不在允许集 → `VALIDATION_ERROR`(拒绝 `http://` / `data:` / 相对路径)。
- 发布(`publishCustomerTrip`)把 `source.itinerary_sheet` 原样拷进 `published_snapshot.itinerary_sheet`。

## 3. 小程序消费(薄集成,待接)

三个客户读云函数各自独立 sanitizer,**均需**做同一处理(否则某条路径漏网):

- `getCustomerTripByInvite` / `getCustomerHome` / `getOperatorCustomerHomePreview`:在各自 `normalizePublishedSnapshot` / `normalizePublishedTripSnapshot` 的返回对象里,**覆盖**(不是依赖 `...snapshot` 展开透传)`itinerary_sheet: normalizeItinerarySheet(snapshot.itinerary_sheet)`。
- `normalizeItinerarySheet(x)`(每个 fn 内各放一份,字符一致):
  - 非对象 → `null`;
  - `png_url` scheme 必须 ∈ `{https:, cloud:, wxfile:}`,否则整对象 → `null`(**安全关键**:阻断 `http://` / `data:` / 跟踪像素);
  - 仅回传 `{ png_url, width, height, order_no, version }`(丢弃 `source_hash` 等内部)。
- `home-page-config.js`:`tripInviteTrip.itinerarySheet = this.normalizeItinerarySheet(snapshot.itinerary_sheet)`(客户端二次 scheme 兜底)。
- `home.wxml`:仅当 `itinerarySheet.png_url` 存在时,渲染一个"查看完整行程单 / 保存图片"入口(不内联大图,点开走 `wx.previewImage`);无字段 → 不渲染(不占位、不编造)。
- `home.js`:`previewItinerarySheet(e)` → 有 url 则 `wx.previewImage({urls:[url],current:url})`,无则 toast「行程单生成中」。可选 `onShareAppMessage` 用 `imageUrl` 转发(引入卡片转发行为,需产品确认)。

> 依赖:`published_snapshot.itinerary_sheet` 字段由 web 发布流水线产出后,以上钩子才有内容;字段缺失时全链路 graceful(入口隐藏)。

## 4. 安全 checklist

- [ ] PNG url scheme 白名单双端校验(云函数 sanitize + 客户端兜底),拒 `http://` / `data:`。
- [ ] `itinerary_sheet` 只含引用与展示 meta,**无**行程明细/内部凭据/成本/司机身份。
- [ ] PNG 内容本身(web 渲染物)只含客户可见信息;渲染前对喂入 H5 的 JSON 做与客户读同级的白名单。
- [ ] 三个读云函数**全部**做 `normalizeItinerarySheet` 覆盖(缺一即 `...snapshot` 展开泄漏未净化 url)。
- [ ] 091:此路径不写/不重建 091;`opsUpsertCustomerTrip` 既有 091 reject 不动。

## 5. 验收

1. 用示例 JSON 生成的 PNG 与 H5 逐区块一致、无接缝;750px 宽。
2. web 推带合法 `cloud://` PNG 的行程 → 发布 → 客户打开,行程单入口出现、点开 `previewImage` 正常;换账号无客户手机号/微信、无成本/司机。
3. 携 `http://` 或 `data:` url 的 `itinerary_sheet` → 两个读函数均归一化为 `null`(入口隐藏),不外泄。
4. 无 `itinerary_sheet` 时,home 与既有行程/酒店/今日卡渲染不受影响。

## 6. 部署

- 重新部署 `opsUpsertCustomerTrip`(加 `itinerary_sheet` 白名单 + scheme 校验)、`getCustomerTripByInvite`、`getCustomerHome`、`getOperatorCustomerHomePreview`(加 `normalizeItinerarySheet`)。
- web 侧:Playwright 渲染服务 + PNG 上传(云存储/CDN)+ 通过 `opsUpsertCustomerTrip` 回写 `itinerary_sheet`(同一 `OPS_SYNC_SHARED_SECRET`)。
- 小程序:home 薄入口 + `previewItinerarySheet`;`onShareAppMessage` 转发为可选。
