# Farland Product Context

## 1. Product Positioning

Farland is an advisor-led travel and student transport coordination mini-program for Chinese students and families. It is not a public ride-hailing marketplace, and it should not feel like Uber, Didi, or a driver bidding board.

The product combines:

- hotel request support
- daily itinerary visibility
- student airport pickup and school transfer coordination
- family school visit transport
- short charter support for campus visits
- operations-managed driver and vehicle sourcing

## 2. Current Demo Scope vs Long-Term Scope

### Current ICT Demo Scope

The current ICT demo should stay focused on a clean customer-facing service experience:

- hotel booking request
- My Trip page
- mock itinerary data
- customer-safe transportation appointment display
- invite-bound customer transfer quote detail
- operator-reviewed customer quote publishing
- customer driver selection as a pending intent signal
- operator final driver confirmation or driver-unavailable handling
- points, benefits, and advisor contact
- internal driver quote system remains unchanged

For this demo, Transfer Detail can exist as an optional or hidden flow. It should not dominate the customer homepage.

### Long-Term Scope

The following entities define the long-term student transport and itinerary roadmap:

- `transfer_request`
- `transport_quote`
- `transport_order`
- `charter_service`
- `charter_segment`
- `activity_event`
- transparent service fee quote flow

These long-term entities are product direction. They are not all required for the current ICT demo implementation.

## 3. P1.1 Customer Quote Data Boundary

P1.1 locks the boundary between internal driver quotes and future customer-facing transportation quotes.

```text
driver_quotes = internal supply quotes for operator review
customer_transport_quotes = customer-visible curated quotes after operator publish
transport_orders = confirmed customer transportation orders
```

Rules:

- Customer pages must never read `driver_quotes`.
- Customer-facing cloud functions must never return `driver_quotes`.
- `customer_transport_quotes` is the only future quote source for customer pages.
- Operator review is required before any quote becomes customer-visible.
- Farland service fee 10% must be calculated in Cloud Functions only.
- Transfer Detail now reads published `customer_transport_quotes` for invite-bound requests.
- My Trip home should show summaries and entry points, not raw quote pools.

See `docs/product/p1-1-data-boundary-customer-quotes.md` for the full P1.1 boundary.

## 4. P1.2A Implemented Customer Quote Flow

The current implementation supports the minimal safe customer quote flow:

```text
driver quote submitted
→ operator reviews driver quote
→ operator publishes curated customer quote
→ customer opens invite-bound transfer detail
→ customer chooses a driver option
→ operator confirms driver or marks driver unavailable
```

Implemented cloud functions:

- `createCustomerInvite`
- `reviewDriverQuote`
- `createCustomerQuoteDraft`
- `publishCustomerQuotesBatch`
- `getCustomerTransportQuotes`
- `selectCustomerQuote`

Current status semantics:

- `driver_quotes.quote_status`
  - legacy internal driver quote status
  - do not repurpose for customer review state
- `driver_quotes.operator_review_status`
  - `pending`
  - `approved`
  - `rejected`
- `customer_transport_quotes.quote_status`
  - `draft`
  - `published`
  - `selected`
  - `cancelled`

Customer selection is not a confirmed order. It means:

```text
客户倾向选择该司机，等待 Farland 运营确认司机是否可接单。
```

Operator confirmation uses the existing `selectDriverQuote` path and sets the request to assigned. Only after this step may the customer see driver contact and vehicle details.

If a customer-selected driver becomes unavailable, the operator can reject that quote. The customer sees:

```text
司机因个人行程调整无法接待，Farland 已为您补偿20元，请您重新选择司机。
```

This still does not create a production `transport_order`. That remains a future roadmap item.

## 5. Target Customer

Primary customers:

- Chinese students studying in the United States
- parents traveling with students
- families doing school visits
- families arranging airport pickup, school return, holiday departure, or summer school pickup

Common scenarios:

- airport pickup
- school return
- holiday departure
- summer school pickup
- hotel to school visit transfer
- family school visit transport
- short charter for school visits

## 6. Business Model

Farland uses a transparent coordination fee model.

Client-facing quote formula:

```text
Client total = driver/fleet quote + Farland service fee
Farland service fee = driver/fleet quote * 10%
```

Client quote cards must show:

- 司机报价
- Farland 服务费 10%
- 预计总价

The service fee covers Farland's coordination work, not hidden markup.

## 7. Core Transport Logic

Transport must remain split into three separate entities:

```text
transfer_request -> transport_quote -> transport_order
```

- `transfer_request`: what the client needs.
- `transport_quote`: Farland-curated client-visible option.
- `transport_order`: confirmed execution record.

Do not collapse these states into one object. A quote is not an order. A selected quote is not a driver assignment.

## 8. Client Visibility Rules

Clients should see:

- their request immediately after submission
- pickup and dropoff
- pickup time
- passenger count
- luggage count
- flight number if available
- client-visible special needs
- request status
- 1 to 3 Farland-curated quote options
- driver/fleet quote
- Farland service fee 10%
- estimated total
- included wait time
- cancellation/change notes
- activity timeline

Clients should not see:

- internal cost
- company margin
- raw backend quote pool
- every driver quote
- internal notes
- supplier private notes
- backup driver internal reasoning
- driver phone before assignment
- vehicle plate before assignment

## 9. Driver Profile Logic

Before assignment, clients may see a driver profile teaser only:

- communication language
- service style
- familiar routes
- suitable scenario
- vehicle class
- capacity summary

Before assignment, clients must not see:

- driver phone
- exact plate number
- full legal identity
- internal rating notes
- raw supplier remarks

After assignment, clients may see:

- driver display name or alias
- phone number
- vehicle model
- plate number
- pickup meeting point

## 10. Transparent Pricing Logic

Quote cards should display pricing as:

```text
司机报价：USD 220
Farland 服务费 10%：USD 22
预计总价：USD 242
```

The Farland service fee should be presented as covering:

- driver screening
- vehicle matching
- itinerary confirmation
- flight tracking coordination
- pickup/dropoff detail confirmation
- communication with driver
- emergency coordination
- backup coordination if driver changes

Avoid wording such as:

- 平台抽成
- 司机底价
- 低价司机
- 原始报价池

## 11. Driver Change Backup Support

Farland should not promise that the same driver is guaranteed for every service, especially for multi-day charter.

Correct promise:

```text
Farland coordinates driver screening, itinerary confirmation, and backup support if driver or vehicle changes.
```

Client-facing fallback wording:

```text
如因工时、档期或当地规定需要调整，Farland 将协调同等级替补并同步确认。
```

## 12. Charter Logic

Charter should be shown in three layers:

1. Trip-level service coverage
2. Day-level service window
3. Segment-level timeline movement

Example:

```text
Trip layer:
访校包车服务
10月12日-10月14日｜每日 10 小时｜Large SUV

Day layer:
今日包车服务 08:00-18:00

Segment layer:
08:15 酒店出发
09:00 学校参访
11:45 午餐待命
17:30 返回酒店
```

## 13. MVP Scope

Current MVP should prioritize:

- hotel booking entry
- My Trip / daily itinerary
- transfer request visibility
- Farland-curated quote cards
- transparent driver quote + Farland service fee 10% pricing
- customer quote selection as pending operator confirmation
- confirmed ride card
- charter display card
- mock data before backend integration

Do not implement yet:

- public ride-hailing
- live map
- payment
- customer self-dispatch
- customer driver bidding
- full supplier portal
- full charter operations automation

## 14. UI Style

UI should feel:

- iOS-like
- premium
- calm
- white-card based
- grouped-list based
- restrained

Use Farland primary color:

```text
#6672A8
```

Avoid:

- heavy purple blocks
- OTA promotion style
- marketplace dashboards
- loud discounts
- dense backend tables on customer pages

## 15. Product Principle

The core product rule:

```text
客户先看到自己的需求，再看到 Farland 筛选后的方案，最后才看到确认后的司机。
```

Farland's value is not raw driver access. Farland's value is trusted coordination, transparent service pricing, driver screening, itinerary fit, and backup support.
