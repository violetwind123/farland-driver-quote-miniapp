# AGENTS.md — 本仓库所有 AI agent 必读

这是 Farland 微信小程序。**动代码前先读本文 + 下面链接的规范。** 规范优先级高于设计稿与任何个人推断。

## 提交前必跑(违反即失败)
```
node scripts/itinerary-discipline-check.js
```

## 手机版行程单 · 铁律(全文:docs/product/itinerary-sheet-discipline.md)
1. **手机版行程单 = web 生成的图片**;小程序只展示/预览/转发,**永不端上渲染行程**(不用 `days`/`todayOverviewCard`/`daily_summary_cards` 拼页)。
2. 客户正式 invite `share_path` = **`/pages/customer/home/home?..`**;客户从**「我的行程」**看行程单。**不得**落 `mobile-itinerary`。
3. 客户界面**只读**:无"转发行程单"按钮、无 `open-type="share"`、不二次转发(转发是**运营**动作)。
4. `mobile-itinerary` 页只作**运营预览/兼容跳转**,不作客户正式二次分享页;不得有 share、不得自渲染。
5. 酒店预订等客户功能保持**独立入口**,不被行程单流程覆盖。
6. 单层(A)/两层(B)是**唯一待 owner 锁的项**(见规范 §7);其余铁律恒生效。

## 其它硬边界(全文:docs/product/miniprogram-dev-guidelines.md)
- **091 雷区**:不新增 id/内容键硬编码,不碰既有 091 gate,`opsUpsert*` 保留 091 reject。
- **PII 白名单**:客户读 allowlist 投影 + denylist strip,禁裸 `...doc` spread;不下发客户联系方式/司机身份(派单前)/成本/供应商。
- **web-authoritative**:客户数据由 web 经 HMAC `opsUpsert*` 写入;小程序无客户端直写库、不信前端 OPENID 授权。
- `home.wxml` 今日卡有 3 份拷贝、`mobile-itinerary`/`customer-trip-mobile-preview` 是 include 薄壳——改一处要顾及全部。

## 协作纪律(踩过的坑)
- **一次一个边界清晰的任务;小步 commit**;别铺跨模块的大 changeset(会被回滚)。
- **多 agent 同仓**:别留大块未提交改动、别在同一文件上并行盲改——会互相覆盖(本仓已发生多次)。动共享文件前先确认谁独占分支。
- 感觉现状和描述对不上时,**先 `git log/status`、读真实代码再动手**,别凭叙述。
- 设计稿是输入不是法律;把产品意图/不变式写在设计稿之上,先复述意图再实现。
