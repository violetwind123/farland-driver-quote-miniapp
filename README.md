Farland Driver Quote Miniapp is an internal operator-to-driver quote tool for Farland.

## 当前 MVP
- 运营创建简化报价单。
- 运营为订单生成一个微信群共享 token。
- 运营通过微信把同一个报价链接转发到司机群。
- 司机点击链接后进入 quick quote 页面。
- 已注册司机自动显示司机和车辆信息。
- 未注册司机首次填写司机和车辆信息。
- 司机提交报价后，运营在详情页汇总查看。

## 主流程
1. 创建 `ride_requests`
2. 生成 `quote_invites.token`
3. 转发：
   `/pages/driver/quick-quote/quick-quote?token=...`
4. 司机打开链接
5. `getQuoteInviteByToken` 返回任务信息以及当前微信对应的司机/车辆资料
6. `submitQuickQuote` 创建或更新司机、车辆、报价

## 数据集合
- `users`
- `drivers`
- `vehicles`
- `ride_requests`
- `quote_invites`
- `driver_quotes`

## 关键规则
- `task_description` 是当前 MVP 的核心司机可见字段
- `internal_note` 只给运营看
- 前端不能传 `openid`
- `openid` 一律由云函数读取
- 同一 `request_id + driver_id` 只保留一条报价，重复提交更新原报价
- `driver_quotes` 必须保存司机和车辆快照
