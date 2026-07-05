#!/usr/bin/env node
/**
 * Mobile itinerary route static check.
 *
 * Guards the P0 customer-trip surface contract:
 * - Legacy customer/home trip links redirect to the standalone mobile itinerary.
 * - Transfer quote links may still use customer/home and must not be redirected.
 * - The formal "My Trip" tab uses the standalone sheet-image viewer.
 * - Customer trip invites return and persist the mobile itinerary path.
 * - The mobile itinerary page must not reintroduce miniapp-rendered itinerary cards.
 *
 * No cloud calls, no production data.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const app = JSON.parse(read('miniprogram/app.json'));
const homeConfig = require(path.join(ROOT, 'miniprogram/pages/customer/home/home-page-config.js'));
const createInviteSource = read('cloudfunctions/createCustomerTripInvite/index.js');
const opsUpsertCustomerTripSource = read('cloudfunctions/opsUpsertCustomerTrip/index.js');
const mobileWxml = read('miniprogram/pages/customer/mobile-itinerary/mobile-itinerary.wxml');
const mobileJs = read('miniprogram/pages/customer/mobile-itinerary/mobile-itinerary.js');
const itineraryTabWxml = read('miniprogram/pages/customer/itinerary-tab/itinerary-tab.wxml');
const itineraryTabWxss = read('miniprogram/pages/customer/itinerary-tab/itinerary-tab.wxss');
const customTab = read('miniprogram/custom-tab-bar/index.js');
const operatorTripDetail = read('miniprogram/pages/operator/customer-trip-detail/customer-trip-detail.js');

let failed = 0;
function assert(cond, msg) {
  if (cond) {
    console.log(`  PASS ${msg}`);
  } else {
    console.error(`  FAIL ${msg}`);
    failed += 1;
  }
}

function withWxStubs(fn) {
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  const originalGetCurrentPages = global.getCurrentPages;
  const redirects = [];
  global.wx = {
    redirectTo({ url }) {
      redirects.push(url);
    },
  };
  global.getApp = () => ({ globalData: {} });
  global.getCurrentPages = () => [{ route: 'pages/customer/home/home' }];
  try {
    fn(redirects);
  } finally {
    global.wx = originalWx;
    global.getApp = originalGetApp;
    global.getCurrentPages = originalGetCurrentPages;
  }
}

function makeHomeContext(extra = {}) {
  return {
    ...homeConfig,
    data: {
      ...(homeConfig.data || {}),
      ...(extra.data || {}),
    },
    ...extra,
  };
}

console.log('mobile-itinerary-route-static-check');

assert(
  app.tabBar.list.some((item) => item.text === '我的行程' && item.pagePath === 'pages/customer/itinerary-tab/itinerary-tab'),
  'formal My Trip tab points to itinerary-tab',
);
assert(app.pages.includes('pages/customer/mobile-itinerary/mobile-itinerary'), 'mobile-itinerary page is registered');
assert(app.pages.includes('pages/customer/itinerary-tab/itinerary-tab'), 'itinerary-tab page is registered');
assert(!app.pages.includes('pages/operator/customer-trip-mobile-preview/customer-trip-mobile-preview'), 'old operator mobile preview wrapper is removed');
assert(itineraryTabWxml.trim() === '<include src="../mobile-itinerary/mobile-itinerary.wxml" />', 'itinerary-tab includes mobile itinerary WXML');
assert(itineraryTabWxss.includes('mobile-itinerary.wxss'), 'itinerary-tab imports mobile itinerary WXSS');
assert(customTab.includes("pagePath: '/pages/customer/itinerary-tab/itinerary-tab'"), 'custom tab routes My Trip to itinerary-tab');

withWxStubs((redirects) => {
  const ctx = makeHomeContext();
  const didRedirect = homeConfig.redirectLegacyCustomerHome.call(ctx, {
    trip_id: '2026NBC102',
    invite_code: 'INVITE',
  });
  assert(didRedirect, 'legacy customer/home trip invite redirects');
  assert(
    redirects[0] === '/pages/customer/mobile-itinerary/mobile-itinerary?trip_id=2026NBC102&invite_code=INVITE',
    'legacy trip invite redirects to mobile itinerary with query preserved',
  );
});

withWxStubs((redirects) => {
  const ctx = makeHomeContext();
  const didRedirect = homeConfig.redirectLegacyCustomerHome.call(ctx, {
    request_id: 'transfer-1',
    invite_code: 'INVITE',
  });
  assert(!didRedirect, 'transfer quote invite may remain on customer/home');
  assert(redirects.length === 0, 'transfer quote invite is not redirected');
});

const dateCtx = makeHomeContext({
  getTodayDateKey: () => '2026-07-05',
});
assert(
  homeConfig.resolveInitialTripDayNo.call(dateCtx, [
    { day_no: 1, date: '2026-07-05' },
    { day_no: 2, date: '2026-07-06' },
  ]) === 1,
  'formal tab selects today when a trip day matches today',
);
assert(
  homeConfig.resolveInitialTripDayNo.call(dateCtx, [
    { day_no: 1, date: '2026-07-04' },
    { day_no: 2, date: '2026-07-06' },
    { day_no: 3, date: '2026-07-08' },
  ]) === 2,
  'formal tab selects the next future day when today is between trip days',
);

assert(mobileWxml.includes('src="{{sheetUrl}}"'), 'mobile UI renders the web-generated itinerary sheet image');
assert(mobileWxml.includes('mode="widthFix"'), 'mobile sheet image keeps generated aspect ratio');
assert(mobileWxml.includes('bindtap="onPreview"'), 'mobile sheet supports previewing the real customer image');
assert(mobileWxml.includes('bindtap="onSave"'), 'mobile sheet supports saving the image');
assert(mobileWxml.includes('open-type="share"'), 'mobile sheet supports WeChat forwarding');
assert(!mobileWxml.includes('wx:elif="{{tripInviteTrip}}"'), 'mobile UI does not render old invite trip branch');
assert(!mobileWxml.includes('wx:elif="{{todayCard}}"'), 'mobile UI does not render old formal today-card branch');
assert(!mobileWxml.includes('mi-section-title">行程概览'), 'mobile UI does not render miniapp itinerary overview section');
assert(!mobileWxml.includes('mi-section-title">行程卡片'), 'mobile UI does not render miniapp itinerary card section');
assert(!mobileWxml.includes('联系顾问'), 'mobile UI waiting/error state has no advisor-contact fallback');
assert(mobileJs.includes('/pages/customer/mobile-itinerary/mobile-itinerary?trip_id='), 'mobile sheet share path stays on mobile itinerary');
assert(!mobileJs.includes('/pages/customer/home/home?trip_id='), 'mobile sheet share path never falls back to customer/home');
assert(operatorTripDetail.includes('/pages/customer/mobile-itinerary/mobile-itinerary?operator_mobile_preview=1'), 'operator preview opens mobile itinerary page');

assert(opsUpsertCustomerTripSource.includes('buildAutoPublishLifecycle'), 'web customer-trip sync has auto-publish lifecycle');
assert(opsUpsertCustomerTripSource.includes('published_snapshot: draftSnapshot'), 'web customer-trip sync writes the customer-visible snapshot');
assert(!opsUpsertCustomerTripSource.includes('Customer still sees the last published version until an operator republishes.'), 'web sync no longer preserves stale published customer version');
assert(!opsUpsertCustomerTripSource.includes("review_status: published && !discarded ? 'needs_review'"), 'web sync no longer forces published trips into needs_review');

assert(createInviteSource.includes('/pages/customer/mobile-itinerary/mobile-itinerary?trip_id='), 'createCustomerTripInvite returns mobile itinerary path');
assert(/share_path:\s*sharePath/.test(createInviteSource), 'createCustomerTripInvite persists share_path');
assert(/path:\s*sharePath/.test(createInviteSource), 'createCustomerTripInvite persists path');
assert(!createInviteSource.includes('/pages/customer/home/home?trip_id='), 'createCustomerTripInvite no longer emits customer/home trip path');
assert(!createInviteSource.includes("'official'"), 'createCustomerTripInvite no longer allows official rich-trip bypass');
assert(createInviteSource.includes("'itinerary_sheet'"), 'createCustomerTripInvite uses itinerary_sheet invite stage');

console.log(failed ? `\nFAILED: ${failed} assertion(s)` : '\nPASS: mobile itinerary routes are locked to the new UI');
process.exit(failed ? 1 : 0);
