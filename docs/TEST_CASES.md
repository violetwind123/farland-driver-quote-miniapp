# TEST CASES

## P0 Driver Quote Flow

1. 运营可创建报价单。
2. 运营可生成群共享 token。
3. 分享路径格式为 `/pages/driver/quick-quote/quick-quote?token=...`。
4. 未注册司机打开链接后显示司机和车辆录入表单。
5. 未注册司机提交后，`users`、`drivers`、`vehicles`、`driver_quotes` 都写入。
6. 已注册司机再次打开同一链接时，自动显示司机和车辆信息。
7. 同一司机重复报价时，更新原报价而不是新增重复记录。
8. `driver_quotes` 保存司机和车辆快照字段。
9. 司机端不返回 `internal_note`。
10. 司机端不返回其他司机报价。

## P1 Customer Hotel + Trip Flow

### A. Entry And Tab Bar

1. 普通打开小程序，进入客户侧页面。
2. 底部只显示两个 Tab：`酒店预订`、`我的行程`。
3. 点击 `酒店预订` 后，底部 Tab 选中态正确。
4. 点击 `我的行程` 后，底部 Tab 选中态正确。
5. 客户侧底部不显示司机入口、运营入口、美国用车自助入口。

### B. Hotel Booking Page

1. 页面主色使用 `#6672A8`。
2. 顶部 Hero 图片正常显示，没有右侧白边。
3. 左上角 Farland logo 正常显示，没有遮挡 Hero 文案。
4. 搜索卡片显示两个 Tab：`酒店预订`、`访校酒店`。
5. `酒店预订` 默认输入框为空，只显示浅灰 placeholder：`Boston`。
6. 点击输入框后，用户可以自行输入城市。
7. 切换到 `访校酒店` 后，输入框为空，只显示浅灰 placeholder：`Loomis Chaffee School`。
8. 从 `访校酒店` 切回 `酒店预订`，不会把 `Loomis Chaffee School` 写入输入值。
9. 从 `酒店预订` 切回 `访校酒店`，不会把 `Boston` 写入输入值。
10. 默认入住日期为今天，离店日期为明天。
11. 离店日期不能等于或早于入住日期。
12. 用户未填写城市/学校时点击查询，提示必填。
13. 用户填写城市/学校后点击查询，调用 `createHotelRequest`。
14. 提交成功后显示成功提示，并可跳转到 `我的行程`。
15. `FARLAND CONCIERGE` 服务模块显示 5 个服务项。
16. 服务模块底部显示：`以上服务均为 Farland Concierge 免费服务。`
17. 服务 icon 色调一致，不出现明显偏色。

### C. My Trip Page

1. 打开 `我的行程`，页面能加载 `getCustomerHome` 数据。
2. 顶部显示行程概览和下一项确认行程。
3. 今日行程时间线正常显示。
4. 时间线中的 `接送需求已提交` 状态显示清楚。
5. 页面只保留 5 个主要模块：
   - 今日行程
   - 整体行程
   - 我的用车
   - 我的酒店
   - 积分福利 / 联系顾问
6. `我的用车` section 可以显示接送需求摘要、包车摘要和已确认接送。
7. 接送需求摘要卡显示：
   - 上车点
   - 下车点
   - 时间
   - 由 Farland 顾问代您提交
   - 已收到的优选方案数量
8. 首页只显示需求摘要和 `查看用车方案` 按钮，不把 3 个报价全部堆在日程页。
9. 首页不单独展开 `接送需求与方案`、`访校包车服务`、`已确认接送` 三个重型 section。
10. 点击 `查看用车方案` 进入 `pages/customer/transfer-detail/transfer-detail?request_id=...`。
11. Transfer Detail 页面显示：
    - 需求快照
    - 运营状态
    - 优选用车方案
    - 处理进度
12. Transfer Detail 页面显示 3 个优选报价方案。
13. 每个报价卡显示：
   - 方案标题
   - 车型
   - 容量
   - 司机画像 teaser
   - 包含项
   - 不含项
   - 报价有效期
14. 每个报价卡必须拆开显示：
    - 司机报价
    - Farland 服务费 10%
    - 预计总价
15. 推荐报价显示 `推荐` badge。
16. 点击 `选择此方案` 后，显示 `已选择方案，等待 Farland 最终确认`。
17. 活动时间线显示：
    - 接送需求已提交
    - Farland 开始确认优选用车方案
    - 已发布 3 个优选用车方案
18. 包车信息在 `我的用车` 内只显示摘要，不展开 Day/Segment 明细。
19. 已确认接送在 `我的用车` 内显示。
20. 已确认接送只显示已分配后的司机别名、车型、车牌或集合点信息。

### D. Client Data Safety

1. 客户侧页面不显示 `internal_note`。
2. 客户侧页面不显示 `internal_cost`。
3. 客户侧页面不显示 company margin。
4. 客户侧页面不显示原始 driver quote pool。
5. 客户侧页面不显示所有司机报价。
6. 报价阶段不显示司机手机号。
7. 报价阶段不显示车牌。
8. 只有 assigned / confirmed 后才显示司机联系信息。

### E. Existing Driver And Operator Regression

1. 司机分享卡片仍然打开 `pages/driver/quick-quote/quick-quote?token=xxx`。
2. `quick-quote` 仍然能读取 `options.token`。
3. `quick-quote` 仍然调用 `getQuoteInviteByToken`。
4. 司机仍然可以提交报价。
5. 同一司机重复报价仍然更新原报价。
6. 运营端 request-detail 仍然能看到司机报价。
7. 运营端仍然可以选择司机报价。
8. 取消报价单功能仍然可用。
9. 客户侧新增 UI 不影响 operator 页面路径。
10. 客户侧新增 UI 不影响 driver home 页面路径。

### F. Static Checks

1. `miniprogram` 前端无 `wx.cloud.database()`。
2. 关键 JS 文件通过 `node --check`。
3. `miniprogram` 主包体积低于 2MB。
4. 单个图片文件低于 500KB。
5. WXML 结构没有明显未闭合标签。
