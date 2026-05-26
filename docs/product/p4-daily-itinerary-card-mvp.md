# P4 Daily Itinerary Card MVP

## 1. Product Positioning

The P4 MVP is the `Daily Itinerary Card MVP`.

It is a day-first customer surface for Farland trips. It is not a generic order list, hotel booking page, quote marketplace, or full CRM experience.

The goal is to make the customer's first screen answer: what is happening today, what is confirmed, what still needs Farland confirmation, and who to contact.

This MVP should preserve Farland's advisor-led positioning. The customer sees a curated day-start card, not raw transportation operations.

## 2. Customer Day-Start Logic

When the customer opens the mini-program on a service day, the first customer-facing surface should be the Today Card.

The customer should not first see:

- hotel booking
- points / benefits
- full quote list
- all historical trips
- internal driver quote information

The Today Card should be selected by date and trip context. If the customer is opening an advisor-shared link, the card should be scoped to that shared trip or request. If the customer opens My Trip directly, the card should prioritize the active or nearest upcoming trip day.

If today's itinerary is not ready, show a precise empty state such as:

```text
Today's details are being finalized by Farland.
```

## 3. Today Card Information Hierarchy

The card should be structured in this order.

### Trip label

- trip number
- day number
- date
- city / route summary

Example:

```text
Trip 2026XBC091 · Day 1 · Fri, Jun 5
Boston -> Amherst -> Providence
```

### Status area

- published / updated time
- advisor confirmed
- vehicle confirmed
- driver pending / assigned
- changed / delayed if applicable

Recommended customer vocabulary:

- Advisor confirmed
- Vehicle confirmed
- Driver pending
- Driver assigned
- Updated by Farland
- Schedule changed

### Service window

- departure time
- estimated service window
- vehicle class
- party / luggage if available

### Timeline

Each timeline item should support:

- time
- title
- location / route
- drive time
- traffic level
- note

Timeline items should be short and scannable. Long explanations should move into detail views.

### Hotel / end point

- hotel name
- estimated arrival time
- address placeholder if available

### Advisor action

Primary actions:

- Contact advisor
- View full trip

The advisor action should be available even before driver assignment.

### Optional secondary actions

- View documents
- View transport details
- Copy address

Secondary actions should not compete with the current-day timeline.

## 4. Example Mapping: Trip 091

Use trip `2026XBC091` as the initial product example.

Example Day 1:

```text
Date: Jun 5 Fri
Departure: Est. depart at 8:10 AM
Stop 1: 10:00 Amherst College
End point: 13:40 Renaissance Providence Downtown Hotel
Route: Boston -> Amherst -> Providence
Traffic: Good
Party: 6
Luggage: 3
Vehicle: Toyota Sienna or similar
```

The Today Card for this day should not show the full eight-day trip. It should show the current day, then provide a next-day teaser:

```text
Tomorrow: Brown University + Yale University
```

The full trip, hotel detail, documents, and transportation detail should remain behind secondary actions.

## 5. Data Model Proposal

Define a customer-facing view model:

```js
today_card: {
  trip_id,
  trip_no,
  day_no,
  date,
  weekday,
  city_summary,
  title,
  status,
  status_text,
  last_updated_at,
  change_summary,
  service_window,
  depart_time,
  vehicle_summary,
  party_summary,
  advisor,
  driver_visibility,
  driver,
  timeline_items,
  hotel,
  next_day_teaser,
  documents,
  actions
}
```

Suggested field notes:

- `status` should be machine-readable, such as `draft`, `published`, `updated`, `vehicle_confirmed`, `driver_assigned`, or `completed`.
- `status_text` should be customer-facing and concise.
- `driver_visibility` should make driver release explicit, such as `hidden`, `pending`, or `assigned`.
- `driver` should be empty unless assignment is real and customer-visible.
- `timeline_items` should be an ordered list of customer-safe schedule entries.
- `actions` should describe allowed UI actions without requiring the frontend to infer state from raw records.

Example shape:

```js
today_card: {
  trip_id: "2026XBC091",
  trip_no: "2026XBC091",
  day_no: 1,
  date: "2026-06-05",
  weekday: "Fri",
  city_summary: "Boston -> Amherst -> Providence",
  title: "Day 1: Boston, Amherst, Providence",
  status: "vehicle_confirmed",
  status_text: "Advisor confirmed",
  last_updated_at: "2026-06-04T20:42:00.000Z",
  change_summary: "",
  service_window: "8:10 AM departure",
  depart_time: "8:10 AM",
  vehicle_summary: "Toyota Sienna or similar",
  party_summary: "6 guests · 3 bags",
  advisor: {
    name: "Farland Advisor",
    contact_label: "Contact advisor"
  },
  driver_visibility: "pending",
  driver: null,
  timeline_items: [
    {
      time: "8:10 AM",
      title: "Depart Boston",
      location: "Boston",
      route: "Boston -> Amherst",
      drive_time: "",
      traffic_level: "Good",
      note: ""
    },
    {
      time: "10:00 AM",
      title: "Amherst College",
      location: "Amherst College",
      route: "",
      drive_time: "",
      traffic_level: "",
      note: ""
    },
    {
      time: "1:40 PM",
      title: "Arrive at hotel",
      location: "Renaissance Providence Downtown Hotel",
      route: "Amherst -> Providence",
      drive_time: "",
      traffic_level: "",
      note: ""
    }
  ],
  hotel: {
    name: "Renaissance Providence Downtown Hotel",
    arrival_time: "1:40 PM",
    address: ""
  },
  next_day_teaser: "Tomorrow: Brown University + Yale University",
  documents: [],
  actions: [
    { type: "contact_advisor", label: "Contact advisor" },
    { type: "view_full_trip", label: "View full trip" }
  ]
}
```

## 6. Relationship With Existing Data

The MVP should extend the current customer home contract without forcing a full backend migration.

Related current structures:

- `getCustomerHome`
- `today_itinerary`
- `trip_overview`
- `charter_services`
- `transport_orders`
- `transfer_requests`
- `customer_transport_quotes`

Recommended relationship:

- `getCustomerHome` may return `today_card` alongside the current fields.
- `today_itinerary` should remain for backward compatibility during the MVP.
- `trip_overview` can provide trip label, date range, and party context.
- `charter_services` and `transfer_requests` can feed service-window and route summaries.
- `transport_orders` can feed assigned driver and vehicle details only after assignment.
- `customer_transport_quotes` can feed customer-safe transport option states, but should not dominate the first screen.

The first implementation may use mock data or a frontend adapter before the final data model is fully migrated.

Do not require a full backend migration in the first implementation.

## 7. Visibility and Sensitive Information Rules

The customer-facing Today Card must not show:

- raw driver quotes
- other driver quotes
- driver internal cost
- company margin
- internal notes
- supplier private notes
- driver phone before assignment
- plate number before assignment
- customer private phone to driver

Driver details, phone number, vehicle plate, and exact assignment information are visible only after assignment is real and customer-visible.

The Today Card should not imply driver bidding, nearby drivers, instant dispatch, or lowest-price matching.

## 8. Out of Scope for MVP

Do not implement in this MVP:

- live map tracking
- payment
- full document upload system
- complete dispatch system
- customer quote selection redesign
- driver quick-quote redesign
- real-time notification infrastructure
- full trip editor

The MVP is a customer-facing day-start card. It should not become a full operations rewrite.

## 9. Acceptance Criteria

The feature is successful if:

- customer opens the mini-program and sees today's card first
- card clearly shows date, route, departure time, stops, hotel, and service status
- trip `2026XBC091` Day 1 can be represented cleanly
- driver details are hidden unless assigned
- full trip and transport detail remain secondary
- current customer page does not become more cluttered
- customer-visible data remains sanitized and does not expose internal operational data

Manual QA should verify:

- Today Card appears above existing customer sections.
- Empty state is clear when no day data exists.
- Driver pending state hides phone and plate.
- Driver assigned state shows only the assigned driver and assigned vehicle.
- Full trip and transport detail remain reachable but secondary.

## 10. Recommended Next Implementation Task

After this document is reviewed, the next implementation task should be:

- add mock `today_card` data to `getCustomerHome`
- render Today Card at the top of `pages/customer/home/home`
- keep existing sections below for compatibility

Suggested initial scope:

```text
cloudfunctions/getCustomerHome/index.js
miniprogram/pages/customer/home/home.js
miniprogram/pages/customer/home/home.wxml
miniprogram/pages/customer/home/home.wxss
TODO.md
```

Do not include:

```text
driver quick-quote
operator request detail
quote publish flow
payment
map tracking
app.json
tabBar
```
