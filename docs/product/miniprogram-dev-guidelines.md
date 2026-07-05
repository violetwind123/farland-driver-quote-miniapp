# Farland 小程序开发规范(product + engineering guardrails)

给任何在本仓库(小程序端)做客户/运营行程相关工作的 agent / 人。**优先级高于设计稿**:设计稿是素材,本规范是边界。

## 1. 产品边界(不可协商)

- **web 生成内容,小程序展示 / 派发。** 手机版行程单 = web 渲染的长图 PNG / 确认单;小程序**只用 `<image>` 展示 + 保存/转发,绝不在端上用数据重排一个行程页**。见 [p5-itinerary-sheet-png-contract.md](p5-itinerary-sheet-png-contract.md)。
- **写入走 web-authoritative:** 所有客户行程/订单数据由 web 经 HMAC `opsUpsert*`(`OPS_SYNC_SHARED_SECRET`,签名基 `${timestamp}.${rawBody}`,15 分钟时钟偏移,timing-safe 比较)写入。小程序端**没有** `wx.cloud.database` 直写、**不信任前端 OPENID** 做授权。
- **酒店预订页独立**,不混进行程单/行程展示流。

## 2. 两层行程模型(客户可见性的唯一真相)

```
第一层 手机版行程单(草稿阶段,给客户确认用)
  运营动作: 预览客户真实界面 / 转发客户   —— 无"发布"
  可见性 = access 绑定(invite/openid);转发即客户可见
  客户打开 = 「手机行程单草稿」按钮 → 点开 = web 的 itinerary_sheet 图

        ↓ 客户线下/顾问群确认(小程序不管确认过程)

第二层 正式行程(R3 新 UI)
  运营动作: 发布正式行程   —— 运营手动决定(确认后就发)
  可见性 = published_snapshot(发布后才有)
  客户打开(同一 invite 链接自动升级)= 行程总览 / today card / day-detail
  手机行程单图降级为"查看完整行程单"次要入口
```

客户端三态:**没转发**=无访问;**已转发未发布**=只有手机行程单草稿按钮→图;**已发布**=正式行程 UI + 查看完整行程单。

> 关键:`itinerary_sheet` 图的可见性**只靠 access,不靠 published_snapshot**——读函数在未发布时也要能把(且只把)这一个白名单字段发给已绑定客户;正式行程富 UI 才靠 published_snapshot。两条通道分开。

## 3. PII / 白名单(客户面)

- 客户读云函数一律 **allowlist 精确投影 + denylist 深度 strip**,**禁止 `...doc` 裸展开**到客户响应。
- 永不下发:客户 phone/wechat/email、司机身份/电话/车牌(派单前)、成本/毛利/供应商 token、访校内部块(visitOffice/contactPerson/advisorNotes/materials/requestedSlots/timeline)。
- `itinerary_sheet.png_url` scheme 白名单 `{https:, cloud:, wxfile:}`,拒 `http://`/`data:`/相对路径 → 整对象置 null;云函数 + 客户端双端校验。
- 「联系顾问」用现有 advisor-QR 弹窗,**不硬编码 hotline**。客户页禁用 `.card-internal`(运营专用类)。

## 4. 091 雷区

- 绝不新增 id/内容键硬编码,不引用 `2026XBC091`/`bf757c4c`/`trip091`/`resolveKnownTrip091*`/`isTrip091HotelContext`,不削弱既有 091 gate。`opsUpsert*` 保留 091 reject。

## 5. home.wxml 结构陷阱(复发温床)

- 今日卡在 home.wxml 有**三份渲染拷贝**(invite / home-pane-swiper / saved-non-swiper),**任何卡改动必须三处同改**,漏一处就是不一致 bug。
- `pages/customer/mobile-itinerary`、`pages/operator/customer-trip-mobile-preview` 是 `<include ../home/home.wxml>` **薄壳,没有自己的 UI**——不要在里面 fork 一套行程渲染(已复发 3 次:961b345→b250deb→d7a51f1)。

## 6. 设计稿的既定取舍

- 设计板 3a「联系顾问作为默认动作」**已被产品否决**:行程卡主按钮永远是「查看行程卡片」→ day-detail(invite=`openTripDayDetail`,saved=`openTodayDetail`)。联系顾问最多次要入口。

## 7. 非编造原则

- 后端没产出的字段(天气、per-node "时间有变"、`itinerary_sheet`、scenic 门票/讲解/顾问贴士…)→ **隐藏 / 显示"生成中"**,**绝不**拿手头能拿到的数据(如 `days`/`todayOverviewCard`)编一个填空洞。字段缺失是"显示占位"信号,不是"自渲染"信号。

## 8. 工作方式(踩过的坑)

- **外科手术,别铺摊子。** 一次只解一个边界清晰的问题,contained commit;不要一波改 50 个文件跨酒店/云函数/091/app.json——那种大 changeset 会被回滚。
- **多 agent 同仓:** 别留大块未提交改动(会被别的 agent 的 commit 冲掉)。要么小步 commit(不 push),要么先协调好谁独占分支。
- **本地验证门:** 改动后 `node --check` 所有改的 js、wxss 花括号平衡、`app.json` 合法、跑现有 `scripts/*-test.js`;云函数/数据链路要 DevTools + CloudBase 实测(本地验证不了的别当"已验证")。
- **不 push / 不 merge main / 不部署 / 不发布 / 不动生产数据 / 不碰 CloudBase 控制台**,除非用户明确要。
