# Elong Hotel API Integration Plan

Last checked: 2026-07-01

## Decision

Farland should integrate Elong hotels as a server-side supplier source first, not as a customer-facing direct booking flow. The first production slice should be:

1. Operator-only Elong gateway.
2. Static city and hotel metadata sync.
3. Real-time hotel detail search for selected stays.
4. Internal hotel quote normalization.
5. Advisor review before writing customer-visible `hotel_cards`.

This keeps the current Farland boundary intact: customer pages read published trip snapshots and hotel share-card snapshots, while supplier payloads, internal cost, validation state, and booking operations stay server-side.

## External API Notes

- International hotels only support search mode.
- The recommended technical flow is real-time search mode; the old offline mode is deprecated.
- Common protocol is HTTPS GET `/rest`, `format=json`, UTF-8, URL-encoded `data`, and signature `md5(timestamp + md5(data + appkey) + secretKey)`.
- Credentials and IP allowlist are environment-specific. Test uses `api-test.elong.com`; production uses `api.elong.com`.
- Elong requires compression support; the gateway sends `Accept-Encoding: br,gzip` and decodes both.
- Use `Version >= 1.62` unless Elong business support requires a newer value.

## Phase 1 Scope

### Static Sync

Call order:

1. `hotel.static.city` with `CountryType=2` for international country/city data.
2. `hotel.static.list` by Elong content `CityId`.
3. `hotel.static.info` by `HotelId`, with `Options=1,2,3,4,5` for detail, suppliers, rooms, images, and phones.

Suggested internal collections:

- `hotel_supplier_cities`
- `hotel_supplier_hotels`
- `hotel_supplier_static_snapshots`

### Real-Time Search

Use `hotel.detail` for a single international `HotelId`. Required Farland inputs:

- `ArrivalDate`
- `DepartureDate`
- `HotelIds`
- `NumberOfAdults`
- `ChildAges` when children are present
- `NumberOfRooms`

Default gateway options:

- `PaymentType=All`
- `SaveMajiaId=true`
- `Options=1,2,4,12`
- add option `13` only when `NumberOfRooms > 1`

Persist raw supplier identifiers from `hotel.detail`, because they must be passed through to validation and order creation:

- `RoomTypeID`
- `RatePlanId`
- `GoodsUniqId`
- `LittleMajiaId`
- `HotelCode`
- `SupplierId`
- `SubSupplierId`
- `ShopperProductId`
- `CurrencyCode`
- nightly `Rate` and `MinRate`
- `PrepayResult` / cancellation policy
- `BoardDetail` / `meals`

### Internal Quote Normalization

Do not write Elong results directly into published customer snapshots. Normalize into an internal candidate shape first:

```json
{
  "source": "elong",
  "hotel_id": "elong hotel id",
  "supplier_snapshot": {},
  "display": {
    "hotel_name": "",
    "address": "",
    "room_type": "",
    "check_in_date": "",
    "check_out_date": "",
    "currency": "",
    "total_rate": 0,
    "tax_and_fee": 0,
    "breakfast_text": "",
    "cancel_policy_text": ""
  },
  "passthrough": {
    "HotelCode": "",
    "SupplierId": "",
    "SubSupplierId": "",
    "ShopperProductId": "",
    "GoodsUniqId": "",
    "LittleMajiaId": ""
  },
  "review_status": "pending_review"
}
```

Only after advisor review should the selected hotel become part of `customer_trips.published_snapshot.hotel_cards` or a hotel share-card snapshot.

## Phase 2 Scope

Add `hotel.data.validate` before booking. The gateway already exposes a `validate` action, but the product flow should not expose it to customers. For international hotels, the request must keep adult and child counts identical to the earlier `hotel.detail` call and must return the international fields listed above.

Price validation must include daily prices when available:

- `DayPriceList[].Price` should use nightly `Rate`.
- `DayPriceList[].MinRate` is required for international hotel daily price validation when daily prices are sent.
- Sum of daily prices multiplied by room count must equal `TotalPrice`.

## Deferred

- `hotel.order.create`
- `hotel.order.pay`
- order status polling
- cancellation
- service requests / work orders
- customer-side direct payment

These should wait until search and validation are stable and Farland decides the commercial payment path.

## Cloud Function

Added:

- `cloudfunctions/elongHotelGateway`

Supported actions:

- `city` -> `hotel.static.city`
- `staticList` -> `hotel.static.list`
- `staticInfo` -> `hotel.static.info`
- `detail` -> `hotel.detail`
- `validate` -> `hotel.data.validate`

Required environment variables:

- `ELONG_HOTEL_USER`
- `ELONG_HOTEL_APP_KEY`
- `ELONG_HOTEL_SECRET_KEY`

Optional environment variables:

- `ELONG_HOTEL_ENV=test|prod`
- `ELONG_HOTEL_VERSION=1.62`
- `ELONG_HOTEL_LOCAL=zh_CN`
- `ELONG_HOTEL_TIMEOUT_MS=25000`

The function is operator-only and logs non-secret request summaries to `elong_hotel_api_logs`.

## Acceptance Checks

1. Missing environment variables return `ELONG_CONFIG_MISSING` without exposing secrets.
2. `city` returns international city data with `CountryType=2`.
3. `staticList` requires `CityId`.
4. `detail` requires stay dates and a single hotel id for international search.
5. `detail` returns `Guid` and raw result for internal normalization.
6. `validate` rejects calls that do not use a nested `request` object.
7. Customer pages remain unchanged and cannot call Elong directly.
