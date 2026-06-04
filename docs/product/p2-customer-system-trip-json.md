# P2-A Customer System And Trip JSON Standard

## Scope

This document standardizes the customer system target architecture before more P2 feature work.

Current repository reality:

- Customer pages already exist:
  - `pages/customer/home/home`
  - `pages/customer/transfer-detail/transfer-detail`
  - `pages/customer/benefits/benefits`
- Customer quote and invite cloud functions already exist:
  - `createCustomerInvite`
  - `getCustomerTransportQuotes`
  - `selectCustomerQuote`
- `getCustomerHome` has started moving from mock data toward real aggregation using `users`, `customer_trip_access`, `customer_invites`, `ride_requests`, `customer_trips`, and `customer_transport_quotes`.

The customer logic works, but it is scattered. P2-A defines the target boundary for future work.

This is a documentation and schema standard. Do not infer permission to change routing, tabBar, driver quick-quote, operator quote flow, or customer quote selection from this document alone.

## Product Decisions

### Invite-Based Entry

Customers should not freely browse or self-register.

```text
operator creates invite
-> customer opens invite card
-> customer confirms access mode
-> cloud function records OPENID
-> customer_trip_access controls future visibility
```

### Invite Code Is Bootstrap Only

`invite_code` is not the long-term authorization source.

Target:

```text
invite_code
-> claimCustomerInvite
-> customer_trip_access
-> getCustomerHome / getCustomerTransportQuotes
```

### Default Access Mode

Default invite access mode is:

```text
trip_only
```

Meaning:

```text
Customer can view this trip / quote.
After visible_until, it disappears from My Trip.
Backend service records and audit logs remain.
```

### Persistent Profile

The customer may choose:

```text
保存到我的 Farland 行程
```

This becomes:

```text
farland_profile
```

Meaning:

```text
Customer can see current trips, eligible historical trips, future trips, preferences, points, benefits, hotels, and driver info for active services.
```

### Customer-Facing Wording

Do not use:

- 注册
- 创建账号
- 已绑定用户
- 未绑定用户
- OPENID
- 客户身份绑定

Use:

- 查看本次行程
- 保存到我的 Farland 行程
- 确认并查看行程
- Farland 顾问已为您同步行程
- 王女士
- 本次行程

## Target Code Boundary

Future target:

```text
claimCustomerInvite handles all invite binding.
getCustomerTransportQuotes only reads after access is authorized.
selectCustomerQuote only selects quotes after access is already authorized.
getCustomerHome aggregates based on customer_trip_access.
```

`selectCustomerQuote` must not perform identity binding in the final architecture.

## Data Model

### users

Customer-related fields:

```js
{
  customer_profile_id: "",
  customer_binding_mode: "trip_only" | "farland_profile" | "",
  display_name: "",
  last_customer_seen_at: "",
  customer_status: "active" | "inactive"
}
```

Rules:

- OPENID comes only from `cloud.getWXContext().OPENID`.
- Frontend must never pass OPENID.
- Phone and WeChat ID are profile fields only.

### customer_profiles

Persistent Farland customer profile. Used only when the customer chooses `保存到我的 Farland 行程`.

```js
{
  _id,
  display_name,
  salutation,
  phone,
  wechat_id,
  advisor_owner_user_id,
  tags,
  preferences: {
    preferred_vehicle_classes: [],
    language_preferences: [],
    needs_child_seat: false,
    quiet_vehicle_preference: false,
    special_notes: []
  },
  status,
  linked_user_id,
  latest_trip_at,
  created_at,
  updated_at,
  updated_by_user_id
}
```

### customer_invites

Invite card access bootstrap.

```js
{
  _id,
  invite_code,
  request_id,
  trip_id,
  customer_profile_id,
  customer_name,
  customer_phone,
  allowed_bind_modes: ["trip_only", "farland_profile"],
  default_bind_mode: "trip_only",
  status: "unused" | "claimed" | "expired" | "revoked",
  claimed_openid,
  claimed_user_id,
  claimed_bind_mode,
  claimed_access_id,
  claimed_at,
  expires_at,
  created_by,
  created_by_openid,
  created_at,
  updated_at
}
```

Rules:

- `unused`: first valid OPENID can claim.
- `claimed`: same OPENID can reopen; different OPENID is rejected.
- `expired`: rejected.
- `revoked`: rejected.

### customer_trip_access

Future source of truth for customer visibility.

```js
{
  _id,
  trip_id,
  request_id,
  customer_profile_id,
  user_id,
  openid,
  bind_mode: "trip_only" | "farland_profile",
  status: "active" | "expired" | "revoked",
  visible_from,
  visible_until,
  invite_id,
  invite_code_snapshot,
  granted_source: "invite" | "import" | "migration" | "admin",
  first_claimed_at,
  last_viewed_at,
  created_at,
  updated_at
}
```

Rules:

- `trip_only` must have `visible_until`.
- `farland_profile` may keep history visible.
- Only `active` access rows authorize customer reads.
- `expired` / `revoked` access cannot show customer trips.

### customer_trips

Standard customer-visible trip object.

```js
{
  _id,
  trip_no,
  external_trip_id,
  trip_type: "transfer" | "charter" | "mixed" | "hotel_only",
  customer_profile_id,
  source_type: "ride_request" | "import_json" | "manual",
  source_id,
  title,
  city,
  country,
  timezone,
  status: "draft" | "active" | "completed" | "cancelled" | "archived",
  status_text,
  start_at,
  end_at,
  summary,
  transfer,
  charter,
  hotels,
  itinerary_days,
  documents,
  advisor,
  visible_from,
  default_visible_until,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at
}
```

Render rules:

- `trip_type = transfer`: render transfer card.
- `trip_type = charter`: render charter service card.
- Empty `charter`: do not show charter section.
- Documents with `visible_to_customer = false`: do not return to customer.

### customer_transport_quotes

Customer pages may read `customer_transport_quotes` only.

Future links:

```js
{
  trip_id,
  customer_profile_id,
  customer_access_id,
  source_invite_id
}
```

Rules:

- Customer pages must never read `driver_quotes`.
- Service fee calculation remains backend-only.

## Standard JSON

Schema files:

- `docs/schema/customer-trip.schema.json`
- `docs/schema/customer-trip-import-batch.schema.json`
- `docs/schema/examples/customer-trip.transfer.sample.json`
- `docs/schema/examples/customer-trip.charter.sample.json`
- `docs/schema/examples/customer-trip.mixed.sample.json`

JSON Schema must use:

- Draft 2020-12
- required fields
- enum
- `oneOf` where appropriate
- `additionalProperties: false`

Semantic validations beyond JSON Schema:

- `start_at < end_at`
- `visible_until` after trip end
- timezone is valid
- segment order is valid
- customer-visible itinerary legs should include route estimates in each drivable `itinerary_days[].timeline_items[]` entry:
  - `drive_time_text`: estimated drive time or service duration, for example `约 35 分钟`
  - `distance_text`: estimated distance, for example `约 8 miles`
  - `traffic_text`: estimated traffic condition, for example `Good`, `Moderate`, or `Heavy`
- driver-sensitive fields are only customer-visible when allowed
- documents marked `visible_to_customer = false` are not returned

School visit card snapshots:

- `itinerary_days[].timeline_items[]` may include `card_type = "school_visit"`.
- `display_snapshot` stores the customer-visible school profile frozen at publish time:
  `name_en`, `name_zh`, `entity_type_text`, `city`, `state`, `address`, `ranking_badges`, `intro_lines`, `strengths`, and `fit_tags`.
- `time_snapshot` stores visit execution times from the itinerary:
  `departure_time`, `arrival_time`, `appointment_time`, and optional `time_warning_text`.
- School visit cards should not show route, drive time, distance, traffic, driver, advisor, price, or internal notes.

## AI-To-JSON Operator Workflow

```text
operator prepares raw itinerary
-> ChatGPT converts itinerary to standard JSON
-> operator pastes JSON into import panel
-> importCustomerTripJSON dry_run validates and previews
-> operator confirms apply
-> cloud function writes customer_trips and customer_trip_access
-> customer My Trip displays updated itinerary
```

Rules:

- AI output is never written directly to production.
- All AI-generated JSON must pass schema validation.
- Operator must approve dry_run before apply.
- CloudBase remains source of truth.
- External spreadsheets are never master data.

## Future Cloud Functions

Do not implement from this document alone.

### claimCustomerInvite

Purpose: centralized invite binding.

Input:

```js
{
  invite_code,
  request_id,
  bind_mode,
  display_name
}
```

Rules:

- OPENID from `cloud.getWXContext()`.
- `trip_only` creates `customer_trip_access` only.
- `farland_profile` creates or links `customer_profiles`.
- Same claimed OPENID can reopen.
- Different OPENID cannot reuse claimed invite.

### importCustomerTripJSON

Purpose: dry-run and apply standard JSON import.

Input:

```js
{
  dry_run,
  payload
}
```

Rules:

- operator / super_admin only
- dry_run does not write data
- apply writes `customer_trips` and `customer_trip_access`
- writes `audit_logs`

### adminListCustomers

Purpose: operator customer directory.

### adminUpdateCustomerList

Purpose: safe customer table patching with optimistic locking.

## Operator Customer Directory

Future page:

```text
pages/operator/customer-directory/customer-directory
```

Requirements:

- list, not spreadsheet grid
- search by name / phone
- filter by advisor / tag
- row drawer for details
- safe editable fields only
- batch update through cloud function

Editable fields:

- display_name
- phone
- advisor_owner_user_id
- tags
- preferences
- default access preference

Read-only fields:

- openid
- role
- status
- latest_trip_at
- active_trip_count
- last_seen_at

Do not allow:

- editing OPENID
- role escalation
- direct database writes from frontend

## Engineering Rules

Must follow:

- frontend never uses `wx.cloud.database()`
- frontend never passes OPENID
- cloud functions use `cloud.getWXContext().OPENID`
- operator functions require `requireRole`
- customer functions require `customer_trip_access` or valid invite
- sensitive fields never returned to customer

Do not do now:

- subpackage refactor
- Redis/cache
- payment
- map
- push notification
- external spreadsheet as source of truth
- direct AI write to database
