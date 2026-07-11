#!/usr/bin/env node

const assert = require('assert');
const {
  CONTENT_ENRICHMENT_VERSION,
  enrichHotels,
  enrichItineraryDays,
  enrichTimelineItem,
} = require('../cloudfunctions/opsUpsertCustomerTrip/customerPlaceProfiles');

const sourceItems = [
  { item_id: 'meal', item_type: 'meal', title: '午餐 Lunch' },
  { item_id: 'airport-arrival', item_type: 'transfer', title: 'JFK Airport' },
  {
    item_id: 'hotel-princeton',
    item_type: 'hotel',
    title: 'Hyatt Regency Princeton',
    planned_arrival_time: '01:19',
    customer_note: '抵达后前往酒店，预计次日约 01:20 抵店。',
  },
  { item_id: 'peddie-arrival', item_type: 'school_visit', title: 'Ding Music Hall（The Peddie School）' },
  { item_id: 'tdap', item_type: 'school_visit', title: 'Tdap Booster 接种诊所（待确认）' },
  { item_id: 'princeton', item_type: 'school_visit', title: 'Princeton University' },
  { item_id: 'palmer', item_type: 'school_visit', title: 'Palmer Square' },
  { item_id: 'hotel-nyc', item_type: 'hotel', title: 'Hyatt Centric Times Square New York' },
  { item_id: 'met', item_type: 'school_visit', title: 'The Metropolitan Museum of Art' },
  { item_id: 'park', item_type: 'school_visit', title: 'Central Park' },
  { item_id: 'morgan', item_type: 'school_visit', title: 'Morgan Library & Museum' },
  { item_id: 'moma', item_type: 'school_visit', title: 'MoMA' },
  { item_id: 'airport-departure', item_type: 'school_visit', title: 'JFK Airport 送机(OZ223)' },
  { item_id: 'peddie-departure', item_type: 'school_visit', title: '夏校离校 - 学校接学生（Ding Music Hall / The Peddie School）' },
];

const days = enrichItineraryDays([{
  day_no: 1,
  estimated_departure_time: '10:00',
  timeline_items: sourceItems.map((item) => (
    item.item_id === 'airport-arrival' ? { ...item, time: '23:00' } : item
  )),
}]);
assert.equal(days[0].content_enrichment_version, CONTENT_ENRICHMENT_VERSION);
assert.equal(days[0].timeline_items.length, sourceItems.length);

days[0].timeline_items.forEach((item) => {
  assert(item.entity_ref && item.entity_ref.profile_id, `${item.title} should match a place profile`);
  assert(/^cloud:\/\//.test(item.hero_image_url), `${item.title} should have a persistent CloudBase image`);
  assert(item.display_snapshot && item.display_snapshot.hero_image_url === item.hero_image_url);
  assert(Array.isArray(item.display_snapshot.intro_lines) && item.display_snapshot.intro_lines.length >= 2);
  assert(Array.isArray(item.display_snapshot.strengths) && item.display_snapshot.strengths.length >= 2);
  assert(item.display_snapshot.image_credit && item.display_snapshot.image_license);
});

const byId = Object.fromEntries(days[0].timeline_items.map((item) => [item.item_id, item]));
assert.equal(byId.princeton.card_type, 'school_visit_card');
assert.equal(byId.met.card_type, 'museum_card');
assert.equal(byId.moma.card_type, 'museum_card');
assert.equal(byId.park.card_type, 'landmark_card');
assert.equal(byId.palmer.card_type, 'landmark_card');
assert.equal(byId.tdap.card_type, 'meeting_card');
assert.equal(byId['airport-arrival'].card_type, 'transfer');
assert.equal(byId['hotel-princeton'].card_type, 'hotel_arrival_card');
assert.equal(byId['hotel-princeton'].time, '次日 01:19');
assert.equal(byId.tdap.display_snapshot.address, 'Princeton, NJ 一带（诊所名称与地址待确认）');
assert(byId['hotel-nyc'].display_snapshot.image_credit.includes('非酒店外观'));

const hotels = enrichHotels([
  { hotel_id: 'h1', name: 'Hyatt Regency Princeton', city: '102 Carnegie Center Princeton' },
  { hotel_id: 'h2', name: 'Hyatt Centric Times Square New York' },
]);
assert.equal(hotels[0].address, '102 Carnegie Center, Princeton, NJ 08540');
assert.equal(hotels[0].city, 'Princeton');
assert.equal(hotels[1].address, '135 W 45th St, New York, NY 10036');
assert(/^cloud:\/\//.test(hotels[0].hero_image_url));

const unknown = { item_id: 'unknown', item_type: 'activity', title: 'Unconfirmed Place' };
assert.deepEqual(enrichTimelineItem(unknown), unknown, 'unknown places must remain web-authored and unmodified');

const lateArrivalDay = enrichItineraryDays([{
  day_no: 1,
  estimated_departure_time: '22:35',
  timeline_items: [
    { item_id: 'default-lunch', item_type: 'meal', title: '午餐 Lunch', time: '12:00' },
    { item_id: 'airport', item_type: 'transfer', title: 'JFK Airport', time: '23:00' },
    { item_id: 'hotel', item_type: 'hotel', title: 'Hyatt Regency Princeton', planned_arrival_time: '01:19' },
  ],
}])[0];
assert.deepEqual(lateArrivalDay.timeline_items.map((item) => item.item_id), ['airport', 'hotel']);
assert.equal(lateArrivalDay.timeline_items[1].time, '次日 01:19');

const placeholderTravel = enrichTimelineItem({
  item_id: 'peddie-placeholder-travel',
  item_type: 'school_visit',
  title: 'The Peddie School',
  drive_time_text: '0:00',
  traffic_text: 'Traffic-aware estimate',
});
assert.equal(placeholderTravel.drive_time_text, '');
assert.equal(placeholderTravel.traffic_text, '');
assert.equal(placeholderTravel.travel_snapshot.drive_time_text, '');
assert.equal(placeholderTravel.travel_snapshot.traffic_text, '');
assert.equal(placeholderTravel.travel_snapshot.source_drive_time_text, '0:00');

const serialized = JSON.stringify({ days, hotels });
['driver_name', 'driver_phone', 'plate_number', 'cost', 'supplier_id'].forEach((key) => {
  assert(!serialized.includes(`"${key}"`), `${key} must not enter customer content`);
});

console.log('customer-place-profiles-test: PASS');
