# DATABASE

## Collections

### ride_requests
核心字段：
- `_id`, `request_no`, `service_type`, `service_subtype`
- `pickup_date`, `pickup_time`, `pickup_location`, `dropoff_location`, `stops`
- `passengers`, `luggage_count`, `vehicle_requirement`, `language_requirement`
- `sign_required`, `child_seat_required`, `airport_transfer`, `flight_no`, `flight_time`
- `service_city`, `service_area`, `start_time`, `end_time`, `estimated_hours`, `itinerary_summary`
- `special_requests`, `quote_deadline`, `status`, `created_at`, `updated_at`
- 敏感字段（司机端禁回传）：`customer_phone_snapshot`, `internal_notes`

### quote_invites
核心字段：
- `_id`, `request_id`, `token`
- `driver_id`, `driver_name`, `driver_phone`, `driver_wechat`
- `invite_channel`, `status`, `expires_at`, `viewed_at`, `submitted_at`
- `created_by`, `created_at`, `updated_at`

### driver_quotes
核心字段：
- `_id`, `request_id`, `quote_invite_id`, `invite_token`
- `service_type`, `driver_id`, `driver_name`, `driver_phone`
- `quote_price`, `currency`, `quote_note`
- `price_type`, `included_hours`, `overtime_rate`
- `quote_status`, `is_selected`, `selected_at`, `submitted_at`, `updated_at`

## Transfer 测试数据
```json
{
  "_id": "req_transfer_001",
  "request_no": "FR202605200001",
  "service_type": "transfer",
  "service_subtype": "airport_pickup",
  "customer_name_snapshot": "Test Client",
  "customer_phone_snapshot": "+1 0000000000",
  "pickup_date": "2026-05-20",
  "pickup_time": "15:30",
  "pickup_location": "Boston Logan Airport Terminal E",
  "dropoff_location": "Marriott Cambridge, 50 Broadway, Cambridge, MA",
  "stops": [],
  "passengers": 3,
  "luggage_count": 4,
  "vehicle_requirement": "SUV",
  "language_requirement": "English preferred",
  "sign_required": true,
  "child_seat_required": false,
  "airport_transfer": true,
  "flight_no": "CX812",
  "flight_time": "15:00",
  "service_city": "Boston",
  "service_area": "Boston / Cambridge",
  "special_requests": "需要举牌，协助搬运行李",
  "internal_notes": "高端访校家庭，司机端不可见",
  "quote_deadline": "2026-05-18 18:00",
  "status": "quoting",
  "created_at": "2026-05-07 12:00:00",
  "updated_at": "2026-05-07 12:00:00"
}
```

```json
{
  "_id": "invite_transfer_001",
  "request_id": "req_transfer_001",
  "token": "test-transfer-token-001",
  "driver_name": "David",
  "driver_phone": "+1 6170000000",
  "driver_wechat": "David Driver",
  "invite_channel": "wechat",
  "status": "sent",
  "expires_at": "2026-12-31 18:00",
  "created_at": "2026-05-07 12:00:00",
  "updated_at": "2026-05-07 12:00:00"
}
```

## Charter 测试数据
```json
{
  "_id": "req_charter_001",
  "request_no": "FR202606030001",
  "service_type": "charter",
  "service_subtype": "full_day_charter",
  "customer_name_snapshot": "Test Client B",
  "customer_phone_snapshot": "+1 0000000000",
  "pickup_date": "2026-06-03",
  "pickup_time": "09:00",
  "pickup_location": "Boston Marriott Cambridge",
  "dropoff_location": "Boston Marriott Cambridge",
  "start_time": "09:00",
  "end_time": "18:00",
  "estimated_hours": 9,
  "service_city": "Boston",
  "service_area": "Boston / Cambridge",
  "itinerary_summary": "市区包车 + 学校参访",
  "stops": ["Harvard University", "MIT", "Boston College", "Newbury Street"],
  "passengers": 4,
  "luggage_count": 0,
  "vehicle_requirement": "Suburban",
  "language_requirement": "Basic English preferred",
  "sign_required": false,
  "child_seat_required": false,
  "airport_transfer": false,
  "flight_no": "",
  "flight_time": "",
  "special_requests": "访校家庭，需要准时、车辆整洁",
  "internal_notes": "司机端不可见",
  "quote_deadline": "2026-06-01 18:00",
  "status": "quoting",
  "created_at": "2026-05-07 12:00:00",
  "updated_at": "2026-05-07 12:00:00"
}
```

```json
{
  "_id": "invite_charter_001",
  "request_id": "req_charter_001",
  "token": "test-charter-token-001",
  "driver_name": "Michael",
  "driver_phone": "+1 6460000000",
  "driver_wechat": "Michael Driver",
  "invite_channel": "wechat",
  "status": "sent",
  "expires_at": "2026-12-31 18:00",
  "created_at": "2026-05-07 12:00:00",
  "updated_at": "2026-05-07 12:00:00"
}
```
