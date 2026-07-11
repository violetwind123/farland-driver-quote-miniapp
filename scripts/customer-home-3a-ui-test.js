#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const config = require('../miniprogram/pages/customer/home/home-page-config');

const page = Object.assign({}, config);

assert.equal(page.formatDisplayDateRange('2026-07-11 - 2026-07-25'), '7月11日 - 7月25日');
assert.equal(page.formatDisplayDateRange('2026-12-31 - 2027-01-02'), '2026年12月31日 - 2027年1月2日');
assert.equal(page.formatDayHeaderDate('2026-07-11', 'Sat'), '7月11日 周六');
assert.equal(page.formatTrafficText('Moderate', 'moderate'), '适中');
assert.equal(page.formatTrafficText('车流适中', 'moderate'), '适中');
assert.equal(page.formatTrafficText('始终', 'moderate'), '适中');
assert.equal(page.getTravelModeLabel('drive'), '车程');
assert.equal(page.formatDriveTimeMeta('0:00'), '');
assert.equal(page.formatDriveTimeMeta('0 min'), '');
assert.equal(page.formatTrafficText('Traffic-aware estimate', 'unknown'), '');
assert.equal(
  page.normalizeRouteLegMeta({ drive_time_text: '0:00', traffic_text: 'Traffic-aware estimate' }).travelMeta.hasContent,
  false,
  'zero-duration placeholder travel metadata must not render a customer chip',
);

const normalized = page.normalizeTodayCard({
  trip_id: '2026NBC099_TEST',
  day_no: 1,
  date: '2026-07-11',
  weekday: 'Sat',
  destination_cards: [
    {
      card_id: 'd1-airport',
      card_type: 'transfer',
      time: '12:00',
      title: 'JFK Airport',
      location: 'JFK Airport',
    },
  ],
});

assert.equal(normalized.departureTime, '12:00', 'day header should fall back to the first itinerary node time');
assert.equal(normalized.routeStops.length, 1, 'fallback display time must not synthesize a duplicate departure node');
assert.equal(normalized.fullNodes[0].subtitle, '', 'identical title and subtitle should render once');

const publishedCard = page.buildTodayCardFromTripDay({
  dayNo: 1,
  date: '2026-07-11',
  weekday: 'Sat',
  timelineItems: [
    {
      id: 'd1-airport',
      time: '12:00',
      title: 'JFK Airport',
      location: 'JFK Airport',
    },
  ],
}, {
  trip_id: '2026NBC099_TEST',
  trip_no: '2026NBC099_TEST',
  overview: {},
});
assert.equal(publishedCard.departureTime, '12:00', 'published invite card should use the same first-node fallback');
assert.equal(publishedCard.routeStops.length, 1, 'published invite fallback must not duplicate the first node');
assert.equal(publishedCard.fullNodes[0].subtitle, '', 'published invite card should suppress duplicate location text');

const ordered = page.normalizeTodayCard({
  trip_id: 'ORDER-TEST',
  day_no: 2,
  date: '2026-07-12',
  estimated_departure_time: '13:23',
  destination_cards: [
    { card_id: 'lunch', card_type: 'meal', time: '12:00', title: '午餐 Lunch' },
    { card_id: 'school', card_type: 'school_visit_card', time: '14:00', title: 'Ding Music Hall' },
  ],
});
assert.deepEqual(
  ordered.routeStops.map((item) => item.title),
  ['午餐 Lunch', '上车出发', 'Ding Music Hall'],
  'departure marker must be inserted chronologically when a customer node occurs earlier',
);
assert.deepEqual(
  ordered.displayRouteStops.map((item) => item.cap),
  ['用餐', '出发', '到达'],
  'a meal before vehicle service must not be mislabeled as departure',
);

const orderedPublished = page.buildTodayCardFromTripDay({
  dayNo: 2,
  date: '2026-07-12',
  estimatedDepartureTime: '13:23',
  timelineItems: [
    { id: 'lunch', time: '12:00', title: '午餐 Lunch' },
    { id: 'school', time: '14:00', title: 'Ding Music Hall' },
  ],
}, {
  trip_id: 'ORDER-TEST',
  trip_no: 'ORDER-TEST',
  overview: {},
});
assert.deepEqual(
  orderedPublished.routeStops.map((item) => item.title),
  ['午餐 Lunch', '上车出发', 'Ding Music Hall'],
  'published invite cards must use the same chronological departure placement',
);
assert.deepEqual(orderedPublished.displayRouteStops.map((item) => item.cap), ['用餐', '出发', '到达']);

const detailPayload = page.buildTripDayDetailCard({
  dayNo: 1,
  timelineItems: [{
    id: 'airport',
    item_type: 'transfer',
    title: 'JFK Airport',
    ui_flags: { show_route: false, show_travel_meta: true },
    travel_snapshot: { drive_time_text: '5分钟' },
  }],
}, { trip_id: 'ORDER-TEST', trip_no: 'ORDER-TEST', overview: {} });
assert.deepEqual(detailPayload.timeline_items[0].ui_flags, { show_route: false, show_travel_meta: true });
assert.equal(detailPayload.timeline_items[0].travel_snapshot.drive_time_text, '5分钟');
assert.equal(detailPayload.timeline_items[0].item_type, 'transfer');

const stats = page.buildDayTravelStats([{
  connectorTravelMeta: {
    drive_time_text: '1小时19分钟',
    distance_text: '64.8mi',
  },
}]);
assert.equal(stats.driveText, '1h19min');
assert.equal(stats.distanceText, '64.8 英里');

const hotelCandidates = [
  {
    id: 'hotel_stay_princeton',
    name: 'Hyatt Regency Princeton',
    linkedDayNo: 1,
    check_in_date: '2026-07-11',
    check_out_date: '2026-07-13',
  },
  {
    id: 'd2_hyatt_regency_princeton',
    name: 'Hyatt Regency Princeton',
    linkedDayNo: 2,
    check_in_date: '2026-07-12',
    check_out_date: '',
  },
  {
    id: 'hotel_stay_times_square',
    name: 'Hyatt Centric Times Square',
    linkedDayNo: 3,
    check_in_date: '2026-07-13',
    check_out_date: '2026-07-15',
  },
];
const dayOneHotel = page.findHotelForTripDay({
  dayNo: 1,
  date: '2026-07-11',
  hotel: {
    id: 'd1_hyatt_regency_princeton',
    name: 'Hyatt Regency Princeton',
    check_in_date: '2026-07-11',
  },
}, hotelCandidates);
const dayTwoHotel = page.findHotelForTripDay({
  dayNo: 2,
  date: '2026-07-12',
  hotel: hotelCandidates[1],
}, hotelCandidates);
assert.equal(dayOneHotel.id, 'hotel_stay_princeton', 'complete hotel stay must beat the timeline-derived hotel on check-in day');
assert.equal(dayTwoHotel.id, 'hotel_stay_princeton', 'complete hotel stay must cover following nights before checkout');
assert.equal(page.normalizeTodayHotelCard(dayTwoHotel).checkOutDate, '2026-07-13', 'hotel detail must retain the checkout date');

const wxml = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/customer/home/home.wxml'), 'utf8');
const wxss = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/customer/home/home.wxss'), 'utf8');
assert.equal((wxml.match(/class="segment-mode-label"/g) || []).length, 3, 'all three itinerary render paths must use the text travel-mode label');
assert(!wxml.includes('segment-mode-icon'), 'itinerary travel metadata must not render the old CSS vehicle icon');
assert(!wxss.includes('font-family: var(--font-serif)'), 'formal trip UI must use the shared sans-serif stack');
assert(wxss.includes('repeating-linear-gradient'), 'formal trip hero must retain the shared subtle texture');
assert(wxml.includes("operator-preview-active"), 'operator preview must reserve its own toolbar space');
assert(wxml.includes("operatorInvitePreview && !sheetInlineOpen"), 'inline sheet must keep its own unobstructed toolbar');
const exitRule = (wxss.match(/\.op-preview-exit\s*\{([^}]*)\}/) || [])[1] || '';
assert(/top:\s*0;/.test(exitRule), 'operator exit must be a top toolbar');
assert(!/(?:^|\s)bottom:/.test(exitRule), 'operator exit must not cover the bottom service card');

console.log('customer-home-3a-ui-test: PASS');
