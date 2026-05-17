# TEST CASES

1. token 正常打开：`test-transfer-token-001` 可加载页面与字段。
2. token 不存在：输入不存在 token，应显示“该报价链接已失效”。
3. token 已取消：quote_invites.status=cancelled 时失效。
4. token 已过期：expires_at 早于当前时间，函数更新 status=expired 并失效。
5. ride_request 不存在：request_id 无效时失效。
6. ride_request 状态不允许报价：状态非 draft/quoting/quoted 时失效。
7. 首次提交报价：driver_quotes 新增记录，quote_status=submitted。
8. 重复提交报价：同 token 更新原记录，不新增；quote_status=updated（selected 例外）。
9. transfer 订单显示：展示接送字段，仅显示 quote_price/currency/quote_note 表单。
10. charter 订单显示：展示包车字段，额外显示 price_type/included_hours/overtime_rate。
11. quote_price 为空：前端 toast 拦截。
12. quote_price 为 0：前端/后端均返回失败。
13. 司机端不显示 internal_notes：页面和 getQuoteInviteByToken 返回中都不含该字段。
14. 司机端不显示 customer_phone_snapshot：页面和返回中都不含该字段。

测试页面路径：
- `/pages/driver/quick-quote/quick-quote?token=test-transfer-token-001`
- `/pages/driver/quick-quote/quick-quote?token=test-charter-token-001`
