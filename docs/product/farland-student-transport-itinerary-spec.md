# Farland Student Transport & Daily Itinerary Product Spec

## 1. Product Positioning

Farland is an advisor-led student travel coordination system. It combines daily itinerary visibility, hotel support, transfer sourcing, charter planning, and operational follow-up.

Farland is not a public ride-hailing marketplace. Clients should not feel they are watching drivers bid against each other. They should see structured requests, Farland-vetted quote options, and confirmed service records.

## 2. Core Principle

Transport must be separated into three layers:

```text
transfer_request -> transport_quote -> transport_order
```

- `transfer_request`: what the client needs.
- `transport_quote`: what Farland publishes as a client-visible option.
- `transport_order`: what is confirmed for execution.

This separation prevents the most common product bug:

```text
quote received != quote selected
quote selected != order confirmed
order confirmed != driver details released
```

## 3. Core Scenarios

### Transfer Client

The client needs an airport pickup, school transfer, hotel transfer, station transfer, or point-to-point ride.

The client should see:

- request snapshot
- current sourcing status
- 1 to 3 Farland-vetted quote options
- selected option status
- confirmed ride details when available

### Ops-Created Transfer Request

The client may contact Farland on WeChat first. Operations may create the request on behalf of the client.

The request should still become client-visible immediately, with wording such as:

```text
由 Farland 顾问代您提交
```

### Charter Client

A charter is not a single ride card. It is a service layer over the trip.

It should display at three levels:

- Trip layer: charter coverage across dates.
- Day layer: service window for a specific day.
- Segment layer: pickup, standby, school visit, lunch, return, and other timeline movements.

## 4. Entity Model

### trip

Trip-level customer container.

Recommended fields:

- `trip_id`
- `title`
- `client_name`
- `date_range`
- `cities`
- `overall_status`
- `pending_count`

### itinerary_day

Daily itinerary container.

Recommended fields:

- `day_id`
- `trip_id`
- `date`
- `city`
- `day_index`
- `summary`
- `status`

### itinerary_item

Timeline card base object.

Recommended fields:

- `item_id`
- `day_id`
- `type`
- `start_at`
- `end_at`
- `title`
- `location`
- `linked_entity_type`
- `linked_entity_id`
- `client_status`

Recommended item types:

- `flight`
- `hotel`
- `school_visit`
- `meal`
- `transfer_request`
- `transfer_order`
- `charter_segment`
- `note`

### transfer_request

Client transport demand snapshot.

Recommended fields:

- `request_id`
- `trip_id`
- `created_by`
- `pickup`
- `dropoff`
- `pickup_time`
- `passengers`
- `luggage`
- `flight_no`
- `special_needs`
- `preference_input`
- `status`

### transport_quote

Client-visible Farland-vetted service option.

Required pricing fields:

- `driver_quote_amount`
- `farland_service_fee_rate`
- `farland_service_fee_amount`
- `client_visible_total`
- `currency`

Pricing rule:

```text
farland_service_fee_rate = 10%
farland_service_fee_amount = driver_quote_amount * 10%
client_visible_total = driver_quote_amount + farland_service_fee_amount + explicit_extra_fees
```

Recommended fields:

- `quote_id`
- `request_id`
- `public_title`
- `vehicle_class`
- `capacity`
- `driver_profile_teaser`
- `driver_quote_amount`
- `farland_service_fee_rate`
- `farland_service_fee_amount`
- `client_visible_total`
- `currency`
- `includes`
- `excludes`
- `valid_until`
- `is_recommended`
- `curation_reason`
- `status`

Client-facing quote cards must explicitly show:

```text
司机报价
Farland 服务费 10%
预计总价
```

### transport_order

Confirmed execution record.

Recommended fields:

- `order_id`
- `request_id`
- `accepted_quote_id`
- `order_no`
- `confirmed_pickup_time`
- `meeting_point`
- `wait_policy`
- `cancel_policy`
- `assigned_driver_id`
- `release_contact_at`
- `status`

### charter_service

Trip-level charter service layer.

Recommended fields:

- `charter_id`
- `trip_id`
- `date_range`
- `service_area`
- `daily_hour_limit`
- `vehicle_class`
- `continuity_preference`
- `continuity_status`
- `pricing_summary`
- `status`

### charter_segment

Day-level charter movement or standby segment.

Recommended fields:

- `segment_id`
- `charter_id`
- `day_id`
- `start_at`
- `end_at`
- `origin`
- `destination`
- `purpose`
- `linked_item_ids`
- `status`

### activity_event

Timeline and audit event.

Recommended fields:

- `event_id`
- `entity_type`
- `entity_id`
- `visibility_scope`
- `event_type`
- `message`
- `actor_type`
- `created_at`

Visibility scopes:

- `client_visible`
- `internal_only`

## 5. Status Flow

### transfer_request

```text
submitted -> reviewing -> sourcing -> quoted -> selected -> converted
```

Terminal states:

```text
expired / canceled
```

### transport_quote

```text
draft -> published -> viewed -> accepted
```

Terminal states:

```text
expired / withdrawn / declined
```

### transport_order

```text
pending_lock -> confirmed -> assigned -> in_progress -> completed
```

Terminal states:

```text
canceled / failed
```

### charter_service

```text
planning -> sourcing -> quoted -> confirmed -> active -> completed
```

Terminal states:

```text
canceled / partially_changed
```

## 6. Client Visibility Rules

### Always Client-Visible

- pickup
- dropoff
- pickup time
- flight number
- passenger count
- luggage count
- client-visible special needs
- created by client or Farland advisor
- current request status
- published quote options
- driver quote amount
- Farland service fee 10%
- estimated total
- quote expiry
- included wait time
- cancellation/change notes
- Farland recommendation badge

### Visible Only After Assignment

- driver display name or alias
- driver phone
- vehicle model
- vehicle plate
- meeting point
- direct contact action

### Never Client-Visible

- internal cost
- raw supplier pool
- all unfiltered driver quotes
- company margin
- internal note
- supplier private note
- backup driver internal reasoning
- risk flags not meant for client

## 7. Client-Facing Copy

### Request States

- `接送需求已提交`
- `Farland 正在为您确认用车方案`
- `已收到优选用车方案`
- `已选择方案，等待最终确认`
- `接送已预约`
- `已分配司机`

### Quote Card Pricing

Use:

```text
司机报价
Farland 服务费 10%
预计总价
```

Avoid hiding the service fee inside a single opaque total. The service fee is part of Farland's transparent coordination model.

### Recommended Quote Header

```text
Farland 已为您筛选以下优选用车方案
```

### Forbidden Copy

- `司机抢单`
- `司机竞价`
- `最低价司机`
- `附近司机`
- `立即叫车`
- `保证升级`
- `保证最低价`
- `保证有车`

## 8. Client UI Structure

### My Trip

Should show:

- trip overview card
- day list or day tabs
- selected day timeline
- pending item count
- transport status cards

### Day View

The timeline must stay clean.

For `transfer_request`:

```text
接送需求已提交
Farland 正在为您匹配优选用车方案
```

For `quoted`:

```text
已收到 1-3 个优选用车方案
查看用车方案
```

For `selected`:

```text
已选择方案，等待最终确认
```

For `transport_order.confirmed`:

```text
接送已预约
司机信息将在确认后显示
```

For `assigned`:

```text
已分配司机
```

### Transfer Detail

Must use four sections:

1. Request snapshot
2. Operations status
3. Published quote cards
4. Activity timeline

### Quote Card

Each quote card should show:

- public title
- suitable scenario
- vehicle class
- seats and luggage
- driver profile teaser
- included items
- excluded items
- wait policy
- valid until
- driver quote
- Farland service fee 10%
- estimated total
- recommendation badge
- CTA: `选择此方案`

Do not show driver phone or plate before assignment.

### Charter Display

Trip layer:

```text
访校包车服务
10月12日-10月14日｜每日 10 小时｜大型 SUV
优先同一司机；如因工时、档期或当地规定需要调整，Farland 将协调同等级替补并同步确认。
```

Day layer:

```text
今日包车服务 08:00-18:00
车辆等级：Large SUV
服务状态：已确认
```

Segment layer:

```text
08:15 酒店出发
09:00 学校 A 参访
11:45 午餐待命
13:00 学校 B
17:30 返回酒店
```

## 9. MVP Scope

### Phase 1: Documentation

- Add product spec.
- Add mock data plan.
- Do not change production flow.

### Phase 2: Mock Data

Create fixtures for:

1. client-created transfer request
2. ops-created transfer request
3. quoted request with three transport quotes
4. confirmed order without driver assignment
5. assigned order with driver details
6. charter service with day segments

Fixtures may include `_internal_only`, but UI must never render it.

### Phase 3: UI Skeleton

Use mock data only.

Pages:

- My Trip
- Day View
- Transfer Detail
- Quote Cards
- Charter Display

Do not connect backend yet.

### Phase 4: Backend Integration

Only after mock UI is validated:

- create transfer request backend
- publish quote backend
- select quote backend
- convert quote to transport order
- assignment and activity event updates

## 10. Acceptance Criteria For Future UI

- Customer sees transfer request immediately.
- Customer sees no raw driver bidding.
- Customer sees 1 to 3 Farland-vetted quote options.
- Quote cards show driver quote, Farland service fee 10%, and estimated total.
- Customer cannot see internal cost or margin.
- Customer cannot see driver phone or plate before assignment.
- Daily timeline remains clean and does not show full quote detail.
- Transfer detail page contains request snapshot, operations status, quote cards, and activity timeline.
- Charter display separates trip-level coverage and day-level execution.
- Existing driver quote MVP remains unchanged.
