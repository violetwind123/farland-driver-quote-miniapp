Farland Driver Quote Miniapp is an internal driver quote and dispatch mini-program for Farland. It is not a public ride-hailing platform. The current MVP supports Quick Quote links for selected partner drivers.

## 项目定位
- 内部合作司机报价系统 + 运营控价派单前置环节。
- 当前仅覆盖 Quick Quote 报价闭环，不包含完整运营后台/客户端。

## 当前 MVP 功能
- 司机通过 token 打开 `quick-quote` 页面查看可见订单信息。
- 司机提交或更新报价（transfer/charter 分场景表单）。
- 云函数完成邀请生成、token 校验、报价写入更新。

## 技术栈
- 原生微信小程序（WXML/WXSS/JS/JSON）
- 微信云开发 CloudBase 数据库 + 云函数（Node.js）

## 目录结构
- `miniprogram/pages/driver/quick-quote/`：司机快速报价页面
- `cloudfunctions/createQuoteInvite`：创建报价邀请
- `cloudfunctions/getQuoteInviteByToken`：token 打开邀请
- `cloudfunctions/submitQuickQuote`：提交/更新报价
- `docs/`：数据库、接口、测试说明

## CloudBase env 配置
1. 打开 `app.js`。
2. 将 `your-cloudbase-env-id` 替换为你的 CloudBase 环境 ID。
3. 在微信开发者工具中勾选云开发能力并上传部署对应云函数。

## 微信开发者工具运行
1. 导入仓库目录。
2. 确认 `app.json` 已注册页面路径：`miniprogram/pages/driver/quick-quote/quick-quote`。
3. 部署 `cloudfunctions` 下三个云函数。
4. 在编译模式输入带 token 页面路径进行联调。

## 如何插入测试数据
- 参考 `docs/DATABASE.md` 中 `ride_requests` 和 `quote_invites` 示例 JSON。
- 在 CloudBase 数据库中手动插入后测试。

## 如何使用 token 测试页面
- `/pages/driver/quick-quote/quick-quote?token=test-transfer-token-001`
- `/pages/driver/quick-quote/quick-quote?token=test-charter-token-001`

## 版本限制（MVP）
- 不含司机登录、订单大厅、支付、地图、派车单、客户报价单。
- 不含复杂权限控制与审计。

## 未来扩展顺序
1. 运营创建用车需求页面
2. 运营生成多个司机报价邀请
3. 运营查看司机报价对比
4. 运营选择司机报价
5. 运营生成客户报价单
6. 客户通过 share_token 查看报价单
7. 客户确认报价
8. 生成派车单
9. 服务完成记录
10. 价格库、司机评分、毛利统计
11. 通知机制
12. 权限和审计日志
