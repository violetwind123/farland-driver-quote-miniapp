# Mobile Itinerary New UI Acceptance

Last updated: 2026-07-05

## Goal

Lock the customer trip flow to the standalone mobile itinerary UI:

- Operator preview opens the mobile itinerary page.
- Customer trip share cards open the mobile itinerary page.
- The formal customer `我的行程` tab uses the new mobile itinerary UI.
- Transfer quote share cards may still use `pages/customer/home/home`.

## Current Code State

- Branch: `codex/091-customer-card-ui`
- Latest evidence commit: `4ef92c0 Add mobile itinerary route guard`
- Uploaded miniapp development version: `2026.7.5.5`
- CloudBase env used for verification: `cloud1-d3gmbz2bw024f051b`

## Required Routes

| Surface | Required page |
| --- | --- |
| Operator customer trip preview | `pages/customer/mobile-itinerary/mobile-itinerary?operator_mobile_preview=1` |
| Customer trip share card | `pages/customer/mobile-itinerary/mobile-itinerary?trip_id=...&invite_code=...` |
| Formal customer `我的行程` tab | `pages/customer/itinerary-tab/itinerary-tab` |
| Transfer quote invite | `pages/customer/home/home?request_id=...&invite_code=...` |

`pages/customer/itinerary-tab/itinerary-tab` includes the same WXML/WXSS as `pages/customer/mobile-itinerary/mobile-itinerary`.

## Local Verification

Run:

```bash
node scripts/mobile-itinerary-route-static-check.js
node scripts/web-trip-flow-static-check.js
node --check miniprogram/pages/customer/itinerary-tab/itinerary-tab.js
node --check miniprogram/pages/customer/mobile-itinerary/mobile-itinerary.js
node --check miniprogram/pages/customer/home/home-page-config.js
node --check cloudfunctions/createCustomerTripInvite/index.js
```

Expected:

- `mobile-itinerary-route-static-check` prints `PASS: mobile itinerary routes are locked to the new UI`.
- `web-trip-flow-static-check` prints `PASS: web source flows through build + customer view with no customer PII`.
- `node --check` exits cleanly.

## CloudBase Verification

Download and check the deployed invite function:

```bash
rm -rf /tmp/farland-cloudfunctions-verify/createCustomerTripInvite
mkdir -p /tmp/farland-cloudfunctions-verify/createCustomerTripInvite
/Applications/wechatwebdevtools.app/Contents/MacOS/cli cloud functions download \
  --project /Users/admin/farland-driver-quote-miniapp \
  --env cloud1-d3gmbz2bw024f051b \
  --name createCustomerTripInvite \
  --path /tmp/farland-cloudfunctions-verify/createCustomerTripInvite

rg -n "mobile-itinerary|customer/home|share_path|path:\\s*sharePath|buildTripSharePath" \
  /tmp/farland-cloudfunctions-verify/createCustomerTripInvite/index.js
```

Expected:

- `buildTripSharePath()` returns `/pages/customer/mobile-itinerary/mobile-itinerary?...`.
- Existing active invites are updated with `share_path: sharePath` and `path: sharePath`.
- Newly created invites persist `share_path: sharePath` and `path: sharePath`.
- No trip share path uses `/pages/customer/home/home?trip_id=...`.

## DevTools Runtime Verification

Verified path:

1. Open `pages/hotel/request/request`.
2. Tap bottom tab `我的行程`.
3. Confirm Page Path is `pages/customer/itinerary-tab/itinerary-tab`.
4. Confirm page title is `手机行程单`.

If the current test account has no published customer trip access, the page may show the waiting card:

```text
顾问正在核对行程安排
确认后将在这里显示手机版行程单。
```

That waiting card is still the new mobile itinerary UI. It is not the old `pages/customer/home/home` UI.

## Final Production/Experience Verification

After setting uploaded version `2026.7.5.5` as experience version or submitting it for production release:

1. In operator trip management, open trip `2026NBC102`.
2. Generate or reuse the customer trip share card.
3. Confirm the returned/copied path starts with:

```text
pages/customer/mobile-itinerary/mobile-itinerary
```

4. Open the share card on a real phone.
5. Confirm the customer sees the new mobile itinerary UI:

- `手机行程单`
- `行程概览`
- `每日安排`
- `行程卡片`

The customer should not land on the old `pages/customer/home/home` trip UI with `行程进度`.

## Known Boundary

`pages/customer/home/home` still exists for transfer quote invites. This is intentional. The guard script ensures only transfer quote invites remain on that page; customer trip share cards and customer trip previews use the mobile itinerary UI.
