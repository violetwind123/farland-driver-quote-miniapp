#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const config = require('../miniprogram/pages/customer/home/home-page-config');

const page = Object.assign({}, config);

assert.equal(page.formatDisplayDateRange('2026-07-11 - 2026-07-25'), '7月11日 - 7月25日');
assert.equal(page.formatDisplayDateRange('2026-12-31 - 2027-01-02'), '2026年12月31日 - 2027年1月2日');
assert.equal(page.formatDayHeaderDate('2026-07-11', 'Sat'), '7月11日 周六');

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

const stats = page.buildDayTravelStats([{
  connectorTravelMeta: {
    drive_time_text: '1小时19分钟',
    distance_text: '64.8mi',
  },
}]);
assert.equal(stats.driveText, '1h19min');
assert.equal(stats.distanceText, '64.8 英里');

const wxml = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/customer/home/home.wxml'), 'utf8');
const wxss = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/customer/home/home.wxss'), 'utf8');
assert(wxml.includes("operator-preview-active"), 'operator preview must reserve its own toolbar space');
assert(wxml.includes("operatorInvitePreview && !sheetInlineOpen"), 'inline sheet must keep its own unobstructed toolbar');
const exitRule = (wxss.match(/\.op-preview-exit\s*\{([^}]*)\}/) || [])[1] || '';
assert(/top:\s*0;/.test(exitRule), 'operator exit must be a top toolbar');
assert(!/(?:^|\s)bottom:/.test(exitRule), 'operator exit must not cover the bottom service card');

console.log('customer-home-3a-ui-test: PASS');
