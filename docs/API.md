# API

## createQuoteInvite
输入：
```json
{
  "request_id": "req_transfer_001",
  "driver_name": "David",
  "driver_phone": "+1 6170000000",
  "driver_wechat": "David Driver",
  "expires_at": "2026-12-31 18:00"
}
```
输出成功：
```json
{
  "success": true,
  "token": "qq_xxx",
  "share_path": "/pages/driver/quick-quote/quick-quote?token=qq_xxx"
}
```
输出失败：
```json
{ "success": false, "message": "参数不完整" }
```

## getQuoteInviteByToken
输入：
```json
{ "token": "test-transfer-token-001" }
```
输出成功：返回 invite、request（已脱敏）、existing_quote。
输出失败：
```json
{ "success": false, "message": "该报价链接已失效" }
```

## submitQuickQuote
输入：
```json
{
  "token": "test-transfer-token-001",
  "quote_price": 220,
  "currency": "USD",
  "quote_note": "含基础等待",
  "price_type": "all_in",
  "included_hours": 8,
  "overtime_rate": "USD 80/hour"
}
```
输出成功：
```json
{ "success": true, "message": "报价已提交，Farland 运营会再与您确认。" }
```
输出失败：
```json
{ "success": false, "message": "报价金额必须大于0" }
```
