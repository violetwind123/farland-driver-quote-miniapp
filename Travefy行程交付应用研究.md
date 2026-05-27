# Travefy Trip Plans App Research for Farland

## Executive Summary

Travefy’s Trip Plans app is best understood as an **itinerary-delivery layer for advisor-led travel**, not as an operations-heavy transport product. Its strongest relevance to Farland is the way it turns a web-built itinerary into a traveler-facing, mobile-first “single source of truth” with day-by-day structure, embedded documents, chat, offline access, and automatic updates after publishing. Its weakest relevance is that it does **not** appear to model transport execution deeply: the product emphasizes access, visibility, and communication states far more than operational states such as driver assignment, vehicle swap, standby timing, or backup dispatch. citeturn20view2turn7view6turn18view2turn17view0

For Farland, the key takeaway is not “copy Travefy’s UI,” but “copy Travefy’s product split.” In Travefy, a **proposal** is the pre-approval layer and an **itinerary** is the live post-approval layer; travelers only get the app, PDFs, overview map, and flight updates on the itinerary side. That separation is directly useful for Farland: the **10% fee and quote comparison** should live in the request/quote flow, while the **daily charter card** should behave like the live itinerary layer—clean, current, operational, and reassuring. citeturn19view2turn23view4

Travefy’s best borrowable patterns for Farland are these: a web-first invite that can hand off into an app; a day-first structure with a lightweight trip shell and deeper event detail; an “Info & Documents” concept for supporting material; advisor contact embedded inside the trip itself; controlled visibility through scoped links and traveler-specific access; and analytics that tell operations whether clients have actually opened the trip. The biggest gaps Farland must fill itself are explicit service states, rider-safe visibility rules for transport, and backup/driver-change coordination copy. citeturn14view0turn7view7turn23view3turn17view0

## Product Positioning, Users, and Commercial Packaging

Travefy positions itself as travel software for **travel agents, agencies, tour operators, DMCs/on-sites, and tourism organizations**, with Trip Plans as the client-facing mobile app and Travefy Pro as the advisor-facing mobile app. The public Trip Plans pages emphasize that clients use the app to view itineraries before and during the trip, while advisors use Travefy Pro to manage trips, tasks, and client communication. citeturn19view4turn8view7turn20view2turn19view1

That split matters for Farland. Trip Plans is not meant to let travelers “build” or “dispatch” anything. It is designed to **consume** an already-structured service package. Even Travefy’s own copy frames the app as a way to “view their itinerary,” “access documents,” “chat,” and “receive updates,” rather than as a booking engine or live transport-control console. citeturn20view0turn7view0turn18view2

Travefy also makes a subtle branding choice that is highly relevant to Farland: the standard client app is described as **intentionally unbranded**, so advisors can market it as part of their own service; enterprise customers can go further and buy fully white-labeled iOS and Android apps, domain masking, and API-driven itinerary automation. That is a useful signal that a high-touch concierge product does not need loud platform branding on every surface. citeturn20view2turn14view4

Public packaging is relatively transparent. Travefy’s current pricing page lists **Core at $39/month billed annually** and **Premium at $59/month billed annually**, and both are positioned as including the itinerary builder and mobile apps; it also advertises an Agency plan and a discounted New Travel Agent Program at **$25/month**. Separate enterprise/API pricing exists for white-label and automated itinerary creation, including a published API access fee and a separate document-delivery package. One caveat: a July 2025 help article says the advisor-side Travefy Pro app is available only on “Plus and Enterprise,” which suggests either older plan naming or a help-center lag behind the public pricing page. citeturn19view4turn19view5turn19view3turn19view0

From a Farland planning perspective, the most relevant commercial analogy is not the plan price itself but Travefy’s handling of **planning fees**. Travefy’s Stripe integration is explicitly for consulting/planning fees and explicitly **not** for trip bookings or reservations. That is a strong conceptual precedent for Farland’s “driver quote + 10% service fee” model: pricing/fee collection is one layer; the live itinerary is another. citeturn23view4

## Workflow, Publishing, Updates, and Visibility Rules

Travefy’s workflow is web-first. The advisor builds the itinerary in the web builder, then shares it either as a **web link**, an **app link**, or an **email itinerary invite**. The shared itinerary can be opened in a browser immediately, and from that browser view the traveler can choose to download the app or download a PDF if those permissions are enabled. citeturn14view0turn8view4turn8view5turn8view8

The app handoff is handled through a guided invite flow. Travelers open the hotel/trip email or URL in a browser, tap **App / View in App**, then use a “magic link” to move the itinerary into the Trip Plans app. Travefy explicitly recommends this order—**do not download the app first**—because the browser itinerary is the main entry point. That is a very strong pattern for Farland if it wants a low-friction “ops publishes -> client opens live trip” experience without forcing a heavy account-first onboarding flow. citeturn14view2turn8view6turn14view3turn20view0

Once published, Travefy’s online itinerary updates in real time. The help center states that if the advisor changes a shared itinerary or proposal, the online version automatically reflects those changes when the traveler refreshes or reopens the view. The marketing page for Trip Plans also says that changes to the trip “update automatically.” This is exactly the behavior Farland should emulate for daily charter cards, especially when pickup windows, school order, or driver details change. citeturn7view6turn20view2

Where Travefy gets especially sophisticated is **visibility scoping**. A shared link can be tied to the current selected itinerary view, and there is also a **Full Detailed Itinerary (All Travelers)** link that exposes everything intended for all travelers. In classic editing mode, the “main itinerary” link only shows untagged events, while tagged events remain limited; hidden events remain hidden. Travefy also warns that the full-detailed view may expose sensitive information such as **prices and confirmation numbers**. That is one of the best precedents for Farland’s client-visibility model: the platform should deliberately control what is client-visible, not simply dump internal operations data into the front end. citeturn14view0

Travefy’s identity rules are useful, but also somewhat inconsistent across docs. One official traveler page says a trip is automatically saved to the phone the first time it loads and that a free account is needed for chat or flight notifications; another support article says most clients **do not** need an account initially, except for private/tagged itineraries, chat, or viewing multiple itineraries; yet the Trip Plans product page also says travelers are asked to sign up for a free account so their specific trip can be shown and chat enabled. The lesson for Farland is not that Travefy is wrong, but that identity policy should be made simpler and more explicit than theirs. citeturn20view0turn14view2turn8view3turn20view2

Notifications and operational follow-up are tightly integrated. Trip Plans and Travefy Pro can send push notifications for **flight changes** and **new chat messages**; if the traveler does not have the app, flight updates fall back to email. Travefy now also supports scheduled trip invites and scheduled trip chat messages, so advisors can time communications around key trip events. On top of that, advisors can see whether clients opened the itinerary email, downloaded the app, and how many total views a trip generated across web, mobile, embedded views, and generated PDFs. citeturn7view9turn19view6turn7view7turn23view3

For Farland, this is important: Travefy treats **publishing** as an operational step, not just a design step. The advisor can invite, observe whether the traveler opened the trip, message through the itinerary itself, and monitor usage. That pattern is much closer to Farland’s advisor-led student transport product than a pure booking widget is. citeturn23view3turn19view1turn7view8

## UI Patterns, Day Cards, and Mobile-Web Behavior

At the UI level, Travefy consistently presents the trip as a **cover-photo shell with day-by-day drilldown**. Official app descriptions and store listings describe a summary of the trip with event counts by day, followed by detailed information for each event on each day, plus quick access to phone numbers, navigation, and advisor chat. That suggests a hierarchy of **trip header -> day list -> event detail**, which is highly relevant to Farland’s charter-day card. citeturn18view2turn7view3turn20view0

From official marketing screenshots and app-store imagery, the client UI appears to use a **hero trip header**, a visible **offline toggle**, an **advisor identity/contact block**, an **Information & Documents** section, and then a stacked list of day rows and event markers. The important design pattern here is not visual decoration; it is the way operational context lives near the top of the trip, while detailed movements stay nested under days and events. For Farland, this supports the idea that a “Today’s Charter Service” card should sit **above** the day timeline rather than being buried as one more timeline row. citeturn15image0turn15image1turn15image2turn15image9

iturn15image0turn15image1turn15image2turn15image9

Another strong pattern is that Travefy treats documents as part of the itinerary, not as an external file cabinet. Official copy repeatedly highlights access to documents, vouchers, and confirmations; PDF export can include attachments; and the API model includes an **Info & Documents** concept as supplemental content rather than a normal day event. That maps cleanly to Farland’s need for school confirmations, pickup instructions, hotel confirmations, or vehicle notes that support a charter day without becoming timeline stops. citeturn20view0turn7view10turn17view0turn6search8

The app is clearly stronger on **access states** than on **execution states**. Travefy publicly exposes states such as proposal vs itinerary, visible vs hidden, selected view vs full-detailed view, chat enabled/disabled, and app/account availability. What it does not publicly surface, at least in the materials reviewed, is a robust transport-style state machine like “vehicle confirmed,” “driver pending,” “backup assigned,” or “standby active.” For Farland, that is the central opportunity: borrow the presentation model, but add an explicit service-status layer Travefy does not have. citeturn19view2turn14view0turn21search4

Mobile and web roles are deliberately different. The **browser itinerary** is the default entry point and supports proposals and itineraries, real-time update visibility, web chat, and PDF/app access. The **Trip Plans app** is for traveler-facing itinerary consumption, offline access, push updates, and chat. The **Travefy Pro app** is for advisors to monitor trips, tasks, analytics, and send messages, but not to edit itineraries. That separation is important for Farland because it means your student/parent-facing experience can stay simple while operations retain a more capable internal surface. citeturn7view6turn7view8turn19view0turn19view1

## Integrations, Data Model Hints, and Key Gaps

Travefy’s public docs confirm several useful integration patterns. It supports a **Trip Overview Map** for itineraries, uses address-based places to populate map activity, allows advisors to attach a **Google Maps route link** directly to an event so a traveler can open directions, and supports PDF export with itinerary attachments. Those integrations are not deeply dynamic, but they are practical and delivery-oriented. citeturn23view2turn23view1turn7view10turn8view9

Offline mode is real, but imperfect in a way Farland should learn from. Travefy says travelers can toggle offline mode at the top of the trip; however, the help center warns that **not all images and maps may download instantly**, and recommends opening each day and attachment while online so details are cached. For Farland, that argues for treating driver phone, pickup instructions, school address, and hotel name as “must-cache” structured fields rather than relying on linked documents alone. citeturn23view0

On the data-model side, Travefy’s public API definitions are revealing. The core hierarchy is **Trip -> TripDays -> TripEvents -> TripIdeas**, and “Info & Documents” is modeled through an `isSupplemental` parameter rather than as a standard day. There are also system-level concepts such as `IsProposal` and `IsArchived`. For Farland, the main lesson is to resist flattening everything into one object: a charter day should have **day-level service data**, **segment-level movement data**, and **supplemental document/info data** as separate layers. citeturn17view0

The biggest gap I found is around **calendar integration**. In the sources reviewed, Travefy publicly documents maps, static overview maps, browser/app handoff, PDFs, attachments, and day/event structure, but I did not find clear public documentation for a native Apple/Google calendar sync. In fact, one App Store review explicitly suggested adding a calendar view, which implies that date-based itinerary navigation is stronger than any explicit calendar module in the current product. For Farland, that means you should not over-index on a literal calendar widget unless your transport use case truly needs one. citeturn23view1turn23view2turn18view3

Third-party reviews broadly support Travefy’s value proposition but also reinforce its limits. Capterra reviewers praise the drag-and-drop builder and polished client-facing itineraries, but complain about limited layout flexibility; TrustRadius reviewers call it user-friendly and time-saving, while asking for better voucher support, a condensed PDF, and more customization; Software Advice shows a 4.5 overall rating with especially solid ease-of-use and support. Some of these reviews are incentivized, so they should be used directionally rather than as hard proof, but the pattern is consistent: Travefy is strong at presentation and workflow speed, weaker at deeper customization and more specialized operational artifacts. citeturn10view0turn10view1turn10view2

## Farland Adaptation Blueprint

Travefy’s strongest lesson for Farland is structural: **keep the day card focused on “what is live today,” not on how the service was sold**. Put quote details and the 10% Farland fee in the request/quote layer; once service is confirmed, the daily charter card should behave like a live itinerary surface.

### UI and Copy Recommendations

The daily charter card should borrow Travefy’s “trip shell + day detail” logic, but add explicit transport states that Travefy does not carry. Recommended copy and layout:

| Goal | Recommended pattern for Farland | Example copy |
|---|---|---|
| Day-level reassurance | Put a dedicated charter card above the timeline | **Today’s Charter Service** |
| Operational state | Use a single primary status pill | **Driver Pending** / **Driver Assigned** / **Updated** |
| Service window | Show time span and included hours in the first row | `09:00–19:00 · 10 hours` |
| Scope clarity | Show vehicle class and service area on the second row | `Large SUV · Boston / Cambridge school visits` |
| Backup clarity | Always show a short backup statement | `If the assigned driver changes, Farland will coordinate a same-class replacement.` |
| Timeline split | Keep movements below the charter card | `09:00 Hotel departure → Harvard` |
| Documents | Use a separate info/doc strip | `Visit confirmation · Hotel details · Pickup note` |
| Advisor contact | Keep it inside the day view, not a separate help center | `Message Farland Advisor` |

Recommended status labels for Farland, adapted from Travefy’s visibility-first model but extended for transport operations:

- `Planning`
- `Confirmed`
- `Driver Pending`
- `Driver Assigned`
- `Updated`
- `In Service`
- `Completed`

### Suggested Schema

This schema adapts Travefy’s **TripDays / TripEvents / supplemental docs** model to a charter-first student transport day.

| Object | Field | Type | Purpose |
|---|---|---:|---|
| `daily_charter` | `daily_charter_id` | string | Stable ID for the day-level charter service |
| `daily_charter` | `trip_id` | string | Parent trip |
| `daily_charter` | `day_id` | string | Parent day |
| `daily_charter` | `publish_state` | enum | `draft`, `published`, `archived` |
| `daily_charter` | `service_state` | enum | `planning`, `confirmed`, `driver_pending`, `driver_assigned`, `updated`, `in_service`, `completed` |
| `daily_charter` | `client_visibility` | enum | `client_visible`, `ops_only`, `hidden` |
| `daily_charter` | `title` | string | Usually “Today’s Charter Service” |
| `daily_charter` | `date_local` | date | Day anchor |
| `daily_charter` | `city_label` | string | `Boston` |
| `daily_charter` | `service_window_start` | time | Start time |
| `daily_charter` | `service_window_end` | time | End time |
| `daily_charter` | `included_hours` | number | Hours included |
| `daily_charter` | `vehicle_class` | string | `Large SUV` |
| `daily_charter` | `vehicle_hint` | string | `Chevrolet Suburban or similar` |
| `daily_charter` | `service_area` | string | `Boston / Cambridge school visits` |
| `daily_charter` | `driver_display_name` | string/null | Only if assigned and visible |
| `daily_charter` | `driver_phone_visible` | boolean | Controls exposure |
| `daily_charter` | `backup_policy_short` | string | Client-facing backup message |
| `daily_charter` | `ops_note_internal` | text | Hidden from client |
| `daily_charter` | `document_refs` | array | Linked docs for the day |
| `daily_charter` | `last_updated_at` | datetime | Freshness |
| `segment` | `segment_id` | string | Stable ID for movement/standby row |
| `segment` | `day_id` | string | Parent day |
| `segment` | `sort_order` | integer | Timeline ordering |
| `segment` | `segment_type` | enum | `depart`, `arrive`, `visit`, `standby`, `transfer`, `return` |
| `segment` | `planned_time_local` | time | Time shown to client |
| `segment` | `title` | string | `Hotel departure` |
| `segment` | `from_label` | string | Origin |
| `segment` | `to_label` | string | Destination |
| `segment` | `note_client` | text | Public execution note |
| `segment` | `note_ops` | text | Hidden ops note |
| `segment` | `map_url` | string/null | Optional route/location link |
| `segment` | `visibility` | enum | `visible`, `hidden`, `ops_only` |

### Mockup Wireframe

```text
┌──────────────────────────────────────────────┐
│ Boston School Visit                         │
│ Tue, Jun 3 · Boston                         │
│ School visits, hotel departure, campus stops│
├──────────────────────────────────────────────┤
│ TODAY'S CHARTER SERVICE         [Driver Pending]
│ 09:00–19:00 · 10 hours                         │
│ Large SUV · Boston / Cambridge                │
│ Vehicle confirmed. Driver details to follow.  │
│ If the assigned driver changes, Farland will  │
│ coordinate a same-class replacement.          │
│ [Visit confirmation] [Hotel details] [Pickup] │
├──────────────────────────────────────────────┤
│ 09:00  Hotel departure                        │
│        Marriott Cambridge → Harvard           │
│        Driver arrives at hotel lobby          │
│                                              │
│ 11:30  Standby                               │
│        Harvard area                           │
│        Driver remains nearby                  │
│                                              │
│ 14:00  Transfer                              │
│        Harvard → MIT                          │
│        Timing may flex with visit flow        │
│                                              │
│ 17:30  Return to hotel                       │
│        MIT → Marriott Cambridge               │
├──────────────────────────────────────────────┤
│ Message Farland Advisor   View Documents      │
└──────────────────────────────────────────────┘
```

### Actionable Takeaways for Farland

- **Keep itinerary-first architecture.** Travefy works because the live trip is the center of gravity, not the booking widget. Farland should do the same for student transport.
- **Separate quote/approval from live service.** Travefy’s proposal-vs-itinerary split is the clearest product lesson for Farland’s quote/fee vs daily charter layers. citeturn19view2turn23view4
- **Use web-first publishing, then app handoff.** The browser invite plus “View in App” flow is lower-friction than forcing account-first onboarding. citeturn14view2turn8view6
- **Treat the charter card as a day-level service layer.** Do not bury it as a normal timeline item.
- **Adopt scoped visibility.** Travefy’s selected-view vs full-detailed sharing is a strong precedent for Farland’s client-visible vs ops-visible transport data. citeturn14view0
- **Create an Info & Documents strip.** Travefy’s supplemental document concept is the right model for confirmations, school notes, and pickup instructions. citeturn17view0turn7view10
- **Embed advisor contact in the day view.** Travefy’s chat is trip-native, not generic customer support. Farland should say “Message Farland Advisor,” not “Contact Customer Service.” citeturn7view8turn20view0
- **Cache critical transport data for offline use.** Travefy warns that maps/images may not all preload offline; Farland should keep driver-safe essentials in structured text fields, not only attachments. citeturn23view0
- **Add transport statuses Travefy lacks.** Travefy is excellent at delivery states, but Farland needs execution states such as driver pending, assigned, updated, backup coordinated.
- **Keep the 10% fee out of the live charter card.** Follow Travefy’s pattern of separating itinerary delivery from professional/planning fee handling. citeturn23view4
- **Track viewer engagement internally.** Travefy’s view analytics are a strong model for Farland operations to know whether parents/students have actually seen the updated day plan. citeturn23view3
- **Keep branding subtle.** Travefy’s deliberately low-brand client app supports the advisor’s relationship; Farland should favor calm trust over loud platform identity. citeturn20view2

Overall, Travefy is an excellent reference for **publishing logic, day-based structure, document embedding, advisor messaging, and visibility control**. It is not a complete reference for transport execution. Farland should borrow Travefy’s itinerary grammar, then layer on the operational states and backup-assurance language that student charter transport requires. citeturn20view2turn17view0turn14view0