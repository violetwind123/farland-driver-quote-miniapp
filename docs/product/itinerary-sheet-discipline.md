# 手机版行程单 · 铁律(Itinerary Sheet Discipline)

> 本文件是**权威规范**,优先级高于设计稿与任何 agent 的推断。任何做"手机版行程单 / mobile itinerary / 行程分享"相关改动的人/agent,动代码前必须先读本文并按此锁定路由、权限、UI 状态。
> 强制校验:`node scripts/itinerary-discipline-check.js` 必须通过(违反即失败)。改规则要**先改本文 + owner 确认**,不许为了让某次改动过而放宽守卫。

## 0. 一句话定义
**手机版行程单 = web 生成的图片(长图 PNG / 确认单)。小程序只负责展示 / 预览 / 转发,永不端上渲染行程。**

## 1. 生产链路(web → CloudBase 存储)—— 别再踩过的坑
**正确链路(必须保留):**
1. web 生成手机版行程单图片,**存在网页侧**,把 **URL** 作为 `itinerary_sheet.image_url` 发给 `opsUpsertCustomerTrip`。
2. 云函数**服务端 fetch `image_url` → 校验是 PNG/JPEG → 上传 CloudBase 存储 → 得 `cloud://` fileID**,写入 `customer_trips` **顶层 `itinerary_sheet`**。
3. 客户端 `<image src="cloud://...">` 展示;客户读只读顶层 `itinerary_sheet` 这一个字段(不进 `draft_snapshot`/`published_snapshot`)。

**踩过的坑(不要重蹈):**
- **别用 `png_base64` 内联大图推送**:base64 会让请求体超 **CloudBase HTTP 网关上限**,在**网关层就 413 / EXCEED_MAX_PAYLOAD_SIZE**,根本进不了云函数——在云函数里"支持 base64"解决不了。大图一律走 `image_url` + 服务端上传。
- 字段名对齐:web 发 `itinerary_sheet.image_url`;云函数须认它(历史上一度只认 `png_url` → web 说成功但小程序读不到图,运营页显示"等待图片")。
- 预览链路要拿**详情页的 `preview.itinerary_sheet`**,不要退回旧的客户首页预览数据(否则明明已生成却显示"生成中")。
- 客户读的 `itinerary_sheet.png_url` scheme **仅 `https:` / `cloud:`**;拒 `wxfile:`/`http:`/`data:`/相对路径。

## 2. 运营端(operator)
- 运营详情页显示"手机版行程单 已生成 / 待网页生成"。
- 运营可 **预览** + **微信转发**。**转发是运营动作。**
- 运营预览可用独立页;运营预览态与客户正式访问**可共用展示壳,但客户侧不得因此获得二次转发能力**。

## 3. 客户端(customer)—— 权限与入口
- 「我的行程」tab = **`pages/customer/itinerary-tab/itinerary-tab`**(不是 home;home 已不在 tabBar);客户保存后的行程在此 tab 查看。
- 客户正式 invite `share_path` **必须落非 tabBar 承载页**(如 `pages/customer/mobile-itinerary`),**不得落 tabBar 页**。原因:**微信分享卡跳 tabBar 页会 switchTab 丢 query 参数**(trip_id/invite_code 收不到 → 推送打开是空页)。【守卫 R1】
- 客户界面**只读**:**不显示"转发行程单"按钮,不允许 `open-type="share"`,不开放二次转发**(转发是运营动作)。客户可"保存图片到相册",但不可再分享行程卡。【守卫 R2】
- 小程序**不重新渲染行程卡片 / 行程概览 / 每日安排**(不从 `days`/`todayOverviewCard`/`daily_summary_cards`/`progressNodes` 拼页)。手机版行程单只展示 web 图。【守卫 R3】
- 打开 invite **不自动创建 `customer_trip_access`**;绑定("保存到我的 Farland")是单独显式动作。

## 4. `mobile-itinerary` 页的定位
- 若保留 `pages/customer/mobile-itinerary`,**只能作运营预览 / 兼容跳转**,**不作客户正式二次分享页**。
- 该页**不得**有 `open-type="share"`,**不得**自渲染行程。

## 5. 其它模块不被覆盖
- 酒店预订等客户功能**保持独立入口**,不被手机版行程单流程覆盖或改路由。

## 6. 通用不变式(沿用)
- **091**:不新增 id/内容键硬编码;`opsUpsert*` 保留 091 reject;不碰既有 091 gate。
- **PII**:客户读一律 allowlist 投影 + denylist strip,禁止 `...doc` 裸 spread;不下发客户联系方式 / 司机身份(派单前)/ 成本 / 供应商。

## 7. 待锁 · A/B(唯一未定项)
客户"看到手机版行程单"之后,是否**额外**有一个 R3"正式行程"渲染层(行程总览 / today card / day-detail):
- **A 单层(本文 §3 现写法)**:客户永远只看 web 图,小程序不渲染任何行程卡片/概览。
- **B 两层**:图是第一步供客户确认;运营确认后发布,客户升级看小程序渲染的 R3 正式行程。
> Owner 口头说 B,但 §3"不重新渲染行程卡片/概览"是 A 的写法——**此项冲突,须 owner 最终锁定**。锁 B 时,§3 的"不渲染"改为"仅 sheet_draft 阶段不渲染;发布后允许 R3",并相应放宽守卫 R3 的作用面(仅约束 sheet 展示壳,不约束 home 正式态)。§1/§2/§4/§5/§6 与 A/B 无关,恒生效。

## 8. 当前代码合规状态(HEAD=Codex 版,已核实)
- ✓ **R1 合规**:invite 落非 tab 的 `mobile-itinerary`——**这是正确的**(分享卡不能带参进 tabBar 页)。之前误判为违规,已改正守卫。
- ✗ **R2 违规**:`mobile-itinerary.wxml` 有 `open-type="share"` 转发按钮(客户不应二次转发)——**唯一真缺口,需去掉**。
- ✓ R3:无自渲染残留。
- ✓ 数据链路:`opsUpsertCustomerTrip` 已认 `image_url` + `png_base64`、服务端 fetch + 上传 CloudBase 存储——**正确,勿动**。
> 修复:仅去掉客户侧 sheet 页的转发按钮(R2)。修完 `node scripts/itinerary-discipline-check.js` 应通过。
