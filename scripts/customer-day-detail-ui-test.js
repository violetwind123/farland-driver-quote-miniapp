#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let pageConfig = null;
global.Page = (config) => {
  pageConfig = config;
};
require('../miniprogram/pages/customer/day-detail/day-detail');

function createPage() {
  return Object.assign({}, pageConfig, {
    data: JSON.parse(JSON.stringify(pageConfig.data)),
    setData(patch) {
      Object.assign(this.data, patch);
    },
  });
}

const wxmlPath = path.join(__dirname, '../miniprogram/pages/customer/day-detail/day-detail.wxml');
const wxml = fs.readFileSync(wxmlPath, 'utf8');
const wxss = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/customer/day-detail/day-detail.wxss'), 'utf8');
const swiperClose = wxml.indexOf('</swiper>');
const nodeStrip = wxml.indexOf('class="node-strip"');
assert(swiperClose >= 0 && nodeStrip > swiperClose, 'the fixed node strip must live outside swiper');
assert(!wxml.includes('<school-visit-card'), 'day detail must not embed the legacy full-height school card');
assert(!wxml.includes('hero-photo-flag'), 'do not claim a real photo when no image URL exists');
assert(wxml.includes('class="hero-credit"'), 'licensed hero images must render their attribution');
assert(!wxss.includes('font-family: var(--font-serif)'), 'day detail must use the shared sans-serif stack');
assert(wxss.includes('repeating-linear-gradient'), 'day detail base sheet must retain the shared subtle texture');

const page = createPage();
const school = page.normalizeSchoolVisitCard({
  card_id: '099-school-1',
  card_type: 'school_visit_card',
  title: 'Example Academy',
  display_snapshot: {
    name_en: 'Example Academy',
    name_zh: '示例学校',
    entity_type_text: '私立学校',
    location_text: 'Boston, MA',
    address: '1 School St, Boston, MA',
    intro_lines: ['学校介绍'],
    strengths: [{ title: '课程特色', desc: '跨学科课程' }],
  },
  time_snapshot: {
    arrival_time: '09:15',
    appointment_time: '09:30',
    end_time: '10:30',
  },
}, {});
assert.equal(school.heroTime, '09:30');
assert.deepEqual(school.aboutLines, ['学校介绍']);
assert.equal(school.highlights[0].title, '课程特色');
assert(school.practicalRows.some((row) => row.label === '地址'));
assert.equal(school.heroImageUrl, '');

const generic = page.normalizeFallbackDestinationCard({
  card_id: '099-lunch',
  type: 'meal',
  title: '午餐',
  time: '12:00',
  location: 'Boston',
  note: '已为客户预留午餐时间。',
}, {});
assert.equal(generic.primaryName, '午餐');
assert.deepEqual(generic.aboutLines, ['已为客户预留午餐时间']);
assert(generic.practicalRows.some((row) => row.label === '地点'));

const enrichedGeneric = page.normalizeFallbackDestinationCard({
  card_id: '099-airport-enriched',
  type: 'transfer',
  title: 'JFK Airport',
  display_snapshot: {
    name_zh: '纽约肯尼迪国际机场',
    address: 'JFK Airport Terminal 1, Jamaica, NY 11430',
    hero_image_url: 'cloud://test/customer-place-images/jfk.jpg',
    image_credit: 'Photo credit',
    strengths: [{ title: '航站楼复核', desc: '出发前再次核对。' }],
  },
}, {});
assert.equal(enrichedGeneric.heroImageUrl, 'cloud://test/customer-place-images/jfk.jpg');
assert.equal(enrichedGeneric.imageCredit, 'Photo credit');
assert(enrichedGeneric.practicalRows.some((row) => row.value.includes('Terminal 1')));
assert(!enrichedGeneric.practicalRows.some((row) => row.label === '地点'));
assert.equal(enrichedGeneric.highlights[0].desc, '出发前再次核对。');

assert.deepEqual(
  page.resolveKnownTrip091HotelDates(
    { title: 'Hyatt Regency Princeton' },
    {},
    null,
    { trip_no: '2026NBC_TEST' },
  ),
  {},
  'non-091 Hyatt hotels must never inherit 091 stay dates',
);
assert.deepEqual(
  page.resolveKnownTrip091HotelBookingInfo(
    { title: 'Hyatt Regency Princeton' },
    {},
    null,
    { trip_no: '2026NBC_TEST' },
  ),
  {},
  'non-091 Hyatt hotels must never inherit the 091 confirmation number',
);

const duplicateLabel = page.normalizeFallbackDestinationCard({
  card_id: '099-airport',
  title: 'JFK Airport',
  location: 'JFK Airport',
  display_snapshot: { name_zh: 'JFK Airport' },
}, {});
assert.equal(duplicateLabel.secondaryName, '');
assert.equal(duplicateLabel.heroSubtitle, '');

page.data.todayCard = { date: '2026-07-10' };
page.data.cards = [
  { card_id: 'a', title: 'A', chipTimeText: '09:00' },
  { card_id: 'b', title: 'B', chipTimeText: '10:00' },
];
page.selectNodeStripCard({ currentTarget: { dataset: { index: 1 } } });
assert.equal(page.data.currentIndex, 1);
assert.equal(page.data.currentCard.card_id, 'b');
assert.equal(page.data.nodeStrip[1].state, 'current');

console.log('customer-day-detail-ui-test: PASS');
