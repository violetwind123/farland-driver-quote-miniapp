# API

## login
无输入。用于运营登录和创建默认 `driver` 用户。

## createQuoteInvite
```json
{
  "request_id": "req_charter_001",
  "expires_at": "2026-06-01 18:00"
}
```

返回：
```json
{
  "success": true,
  "token": "q_xxx",
  "share_path": "/pages/driver/quick-quote/quick-quote?token=q_xxx"
}
```

## getQuoteInviteByToken
```json
{
  "token": "q_xxx"
}
```

返回司机可见 `request`、共享 `invite`、当前司机 `driver/vehicle`、`is_registered` 和已有报价。

## submitQuickQuote
```json
{
  "token": "q_xxx",
  "driver_profile": {
    "name": "David",
    "phone": "13800138000"
  },
  "vehicle_profile": {
    "vehicle_type": "suburban",
    "vehicle_model": "Chevrolet Suburban",
    "seats": 7,
    "luggage_capacity": 5,
    "plate_number": "ABC123"
  },
  "quote_price": 680,
  "currency": "USD",
  "quote_note": "含基础等待"
}
```

首次报价创建 driver / vehicle / quote；重复报价更新原 quote。
