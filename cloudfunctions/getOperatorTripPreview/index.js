const cloud = require('wx-server-sdk');
const { requireRole } = require('./lib/auth');
const { writeAuditLog } = require('./lib/audit');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
}

// 与 createHotelOrderInvite.sharePath 保持一致的客户酒店分享路径
function hotelSharePath(tripId, hotelId, inviteCode) {
  return `/pages/customer/hotel-detail/hotel-detail?trip_id=${encodeURIComponent(tripId)}&hotel_id=${encodeURIComponent(hotelId)}&invite_code=${encodeURIComponent(inviteCode)}`;
}

// 回带该行程当前 active 的酒店分享卡(revoked/expired/cancelled 不回带),供运营页预填撤销入口。
// 仅运营读路径(requireRole 已门控),invite_code 不进客户侧数据面。
async function activeHotelInvitesForTrip(trip, canonicalTripId) {
  const ids = Array.from(new Set([
    trip.trip_id, trip.external_trip_id, trip.trip_no, trip._id, canonicalTripId,
  ].map((value) => safeString(value).trim()).filter(Boolean)));
  if (!ids.length) return [];
  const res = await db.collection('hotel_order_invites')
    .where({ trip_id: _.in(ids), status: 'active' })
    .limit(100)
    .get()
    .catch(() => ({ data: [] }));
  const nowMs = Date.now();
  return (res.data || [])
    .filter((invite) => {
      if (!invite || invite.status !== 'active') return false;
      if (!invite.expires_at) return true;
      const t = new Date(invite.expires_at).getTime();
      return Number.isNaN(t) || t > nowMs;
    })
    .map((invite) => ({
      hotel_id: safeString(invite.hotel_id),
      hotel_index: Number(invite.hotel_index || 0),
      hotel_name: safeString(invite.hotel_name),
      invite_code: safeString(invite.invite_code),
      share_path: hotelSharePath(canonicalTripId, safeString(invite.hotel_id), safeString(invite.invite_code)),
      expires_at: invite.expires_at || '',
    }));
}

async function findTrip(tripId) {
  const safeTripId = safeString(tripId).trim();
  if (!safeTripId) return null;
  const queries = [
    { trip_id: safeTripId },
    { external_trip_id: safeTripId },
    { trip_no: safeTripId },
  ];
  for (const query of queries) {
    const res = await db.collection('customer_trips')
      .where(query)
      .limit(1)
      .get()
      .catch(() => ({ data: [] }));
    if (res.data[0]) return res.data[0];
  }
  const byDoc = await db.collection('customer_trips').doc(safeTripId).get().catch(() => null);
  return byDoc && byDoc.data ? byDoc.data : null;
}

function hasObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
}

function firstText(...values) {
  for (const value of values) {
    const text = safeString(value).trim();
    if (text) return text;
  }
  return '';
}

function compactArray(items, mapper) {
  if (!Array.isArray(items)) return [];
  return items.map(mapper).filter(Boolean);
}

function compactPlainObject(value, allowedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return allowedKeys.reduce((acc, key) => {
    if (value[key] !== undefined && value[key] !== null && value[key] !== '') {
      acc[key] = value[key];
    }
    return acc;
  }, {});
}

function compactTimelineItem(item = {}, index = 0) {
  if (!item || typeof item !== 'object') return null;
  return compactPlainObject({
    ...item,
    item_id: item.item_id || item.card_id || item.id || `timeline_${index + 1}`,
    card_id: item.card_id || item.item_id || item.id || `timeline_${index + 1}`,
    sequence: item.sequence || index + 1,
    title: item.title || item.location_name || item.name || '行程节点',
    time: firstText(item.time, item.planned_start_time, item.planned_arrival_time, item.arrival_estimate),
    customer_note: firstText(item.customer_note, item.customer_visible_note, item.note),
  }, [
    'item_id',
    'card_id',
    'item_type',
    'card_type',
    'type',
    'sequence',
    'title',
    'subtitle',
    'location_name',
    'address',
    'time',
    'planned_start_time',
    'planned_arrival_time',
    'arrival_estimate',
    'departure_time',
    'drive_time_text',
    'distance_text',
    'traffic_text',
    'customer_note',
  ]);
}

function compactDailySummaryCard(card = {}, index = 0) {
  if (!card || typeof card !== 'object') return null;
  return {
    ...compactPlainObject({
      ...card,
      id: card.id || card.card_id || `day_summary_${card.day_no || index + 1}`,
      day_no: card.day_no || index + 1,
      title: card.title || card.city || '当日安排',
      start_time_text: firstText(card.start_time_text, card.estimated_departure_time, card.departure_time),
      highlight_items: Array.isArray(card.highlight_items) ? card.highlight_items.slice(0, 8) : [],
    }, [
      'id',
      'card_id',
      'day_no',
      'title',
      'date',
      'weekday',
      'city',
      'summary',
      'start_time_text',
      'hotel_badge',
      'transport_badge',
      'highlight_items',
    ]),
  };
}

function compactDay(day = {}, index = 0) {
  if (!day || typeof day !== 'object') return null;
  const rawItems = Array.isArray(day.timeline_items)
    ? day.timeline_items
    : (Array.isArray(day.items) ? day.items : []);
  return {
    ...compactPlainObject({
      ...day,
      day_no: day.day_no || index + 1,
      display_day_label: day.display_day_label || `Day ${day.day_no || index + 1}`,
      title: day.title || day.city || '当日安排',
      estimated_departure_time: firstText(
        day.estimated_departure_time_raw,
        day.estimated_departure_time,
        day.start_time_text,
        day.displayed_start_time,
      ),
    }, [
      'day_no',
      'display_day_label',
      'title',
      'city',
      'date',
      'weekday',
      'summary',
      'estimated_departure_time',
      'displayed_start_time',
      'start_time_text',
      'has_time_conflict',
    ]),
    timeline_items: compactArray(rawItems, compactTimelineItem),
  };
}

function compactHotelCard(hotel = {}, index = 0) {
  if (!hotel || typeof hotel !== 'object') return null;
  return compactPlainObject({
    ...hotel,
    hotel_id: hotel.hotel_id || hotel.card_id || hotel.id || `hotel_${index + 1}`,
    name: firstText(hotel.name, hotel.hotel_name, hotel.title, '酒店安排'),
    hotel_name: firstText(hotel.hotel_name, hotel.name, hotel.title, '酒店安排'),
  }, [
    'hotel_id',
    'card_id',
    'day_no',
    'linked_day_no',
    'linked_day_nos',
    'name',
    'hotel_name',
    'title',
    'date_text',
    'check_in_date',
    'check_out_date',
    'arrival_time',
    'address',
    'status_text',
    'room_summary',
    'confirmation_no',
  ]);
}

function compactFlightCard(flight = {}, index = 0) {
  if (!flight || typeof flight !== 'object') return null;
  return compactPlainObject({
    ...flight,
    flight_id: flight.flight_id || flight.card_id || flight.id || `flight_${index + 1}`,
  }, [
    'flight_id',
    'card_id',
    'flight_no',
    'flight_number',
    'title',
    'from',
    'to',
    'origin',
    'destination',
    'departure_airport',
    'arrival_airport',
    'departure_time',
    'depart_at',
    'arrival_time',
    'arrive_at',
    'aircraft',
  ]);
}

function compactTransfer(item = {}, index = 0) {
  if (!item || typeof item !== 'object') return null;
  return compactPlainObject({
    ...item,
    transfer_id: item.transfer_id || item.card_id || item.id || `transfer_${index + 1}`,
  }, [
    'transfer_id',
    'card_id',
    'title',
    'pickup',
    'dropoff',
    'origin',
    'destination',
    'time',
    'date',
  ]);
}

function compactCharterService(item = {}, index = 0) {
  if (!item || typeof item !== 'object') return null;
  return compactPlainObject({
    ...item,
    charter_id: item.charter_id || item.card_id || item.id || `charter_${index + 1}`,
  }, [
    'charter_id',
    'card_id',
    'title',
    'date_range_text',
    'service_area',
    'vehicle_class',
    'date',
  ]);
}

function compactSnapshotForOperatorPreview(snapshot) {
  if (!hasObject(snapshot)) return {};
  // Keep this allowlist aligned with customer-trip-detail.wxml bindings.
  const hero = hasObject(snapshot.hero) ? snapshot.hero : {};
  const customer = hasObject(snapshot.customer) ? snapshot.customer : {};
  const advisor = hasObject(snapshot.advisor) ? snapshot.advisor : {};
  const hotelCards = Array.isArray(snapshot.hotel_cards) && snapshot.hotel_cards.length
    ? snapshot.hotel_cards
    : (Array.isArray(snapshot.hotels) ? snapshot.hotels : []);
  const flightCards = Array.isArray(snapshot.flight_cards) && snapshot.flight_cards.length
    ? snapshot.flight_cards
    : (Array.isArray(snapshot.flights) ? snapshot.flights : []);

  return {
    snapshot_compacted: true,
    snapshot_model_version: snapshot.snapshot_model_version || 1,
    trip_id: snapshot.trip_id || '',
    external_trip_id: snapshot.external_trip_id || '',
    trip_no: snapshot.trip_no || snapshot.external_trip_id || '',
    title: snapshot.title || hero.title || '',
    city: snapshot.city || hero.city_summary || '',
    start_at: snapshot.start_at || '',
    end_at: snapshot.end_at || '',
    hero: compactPlainObject(hero, ['title', 'trip_no', 'date_range', 'city_summary']),
    customer: compactPlainObject(customer, ['display_name', 'name']),
    advisor: compactPlainObject(advisor, ['name']),
    trip_summary: hasObject(snapshot.trip_summary)
      ? compactPlainObject(snapshot.trip_summary, [
        'title',
        'date_range_text',
        'city_route_text',
        'days_count',
        'hotels_count',
        'flights_count',
        'transport_count',
        'next_day_label',
      ])
      : null,
    daily_summary_cards: compactArray(snapshot.daily_summary_cards, compactDailySummaryCard),
    itinerary_days: compactArray(snapshot.itinerary_days, compactDay),
    hotel_cards: compactArray(hotelCards, compactHotelCard),
    hotels: compactArray(hotelCards, compactHotelCard),
    flight_cards: compactArray(flightCards, compactFlightCard),
    flights: compactArray(flightCards, compactFlightCard),
    transfers: compactArray(snapshot.transfers, compactTransfer),
    charter_services: compactArray(snapshot.charter_services, compactCharterService),
    documents: [],
  };
}

function ownershipProjection(trip) {
  const customer = hasObject(trip.customer) ? trip.customer : {};
  return {
    primary_customer_user_id: trip.primary_customer_user_id || '',
    customer_user_id: trip.customer_user_id || trip.primary_customer_user_id || '',
    customer_user_ids: Array.isArray(trip.customer_user_ids) ? trip.customer_user_ids : [],
    customer_profile_id: trip.customer_profile_id || customer.customer_profile_id || '',
    party_name: trip.party_name || '',
    traveler_names: Array.isArray(trip.traveler_names) ? trip.traveler_names : [],
    customer: compactPlainObject(customer, ['customer_profile_id', 'display_name', 'name']),
    customer_display_name: trip.customer_display_name || customer.display_name || '',
    customer_name: trip.customer_name || customer.name || customer.display_name || '',
    customer_phone: trip.customer_phone || '',
    customer_wechat_id: trip.customer_wechat_id || '',
    ownership_updated_at: trip.ownership_updated_at || '',
    ownership_updated_by: trip.ownership_updated_by || '',
  };
}

function diffSummary(trip) {
  const hasPublishedVersion = Boolean(trip.published_version > 0 && hasObject(trip.published_snapshot));
  const draft = hasObject(trip.draft_snapshot) ? trip.draft_snapshot : {};
  const published = hasObject(trip.published_snapshot) ? trip.published_snapshot : {};
  const changedSections = [];

  ['itinerary_days', 'hotels', 'flights', 'transfers', 'charter_services', 'documents'].forEach((key) => {
    if (JSON.stringify(draft[key] || null) !== JSON.stringify(published[key] || null)) {
      changedSections.push(key);
    }
  });

  return {
    has_published_version: hasPublishedVersion,
    changed_sections: hasPublishedVersion ? changedSections : [],
  };
}

// itinerary_sheet:顶层字段(scheme 校验),运营页据此渲染 Layer-1 转发按钮/状态
const ITINERARY_SHEET_URL_SCHEMES = ['https:', 'cloud:'];
function normalizeItinerarySheet(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const url = String(value.png_url == null ? '' : value.png_url).trim();
  const m = /^([a-z][a-z0-9+.-]*:)/i.exec(url);
  if (!m || !ITINERARY_SHEET_URL_SCHEMES.includes(m[1].toLowerCase())) return null;
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : undefined);
  const out = {
    png_url: url,
    width: num(value.width),
    height: num(value.height),
    order_no: String(value.order_no == null ? '' : value.order_no).trim(),
    version: num(value.version),
  };
  Object.keys(out).forEach((k) => { if (out[k] === undefined || out[k] === '') delete out[k]; });
  return out;
}

exports.main = async (event = {}) => {
  const auth = await requireRole(cloud, db, ['operator', 'super_admin']);
  if (!auth.ok) {
    return { success: false, code: auth.code, error_code: 'FORBIDDEN', message: auth.message };
  }

  const tripId = safeString(event.trip_id || event.external_trip_id || event.trip_no).trim();
  if (!tripId) {
    return { success: false, code: 422, error_code: 'TRIP_ID_REQUIRED', message: '请提供 trip_id' };
  }

  const trip = await findTrip(tripId);
  if (!trip) {
    return { success: false, code: 404, error_code: 'TRIP_NOT_FOUND', message: '行程不存在' };
  }

  const canonicalTripId = trip.trip_id || trip.external_trip_id || tripId;
  const now = new Date().toISOString();
  await writeAuditLog(db, {
    actor_openid: auth.openid,
    actor_user_id: auth.user._id,
    actor_role: auth.user.role,
    action: 'customer_trip_preview_opened_operator',
    target_type: 'customer_trip',
    target_id: trip._id,
    detail: {
      trip_id: trip.trip_id || trip.external_trip_id || tripId,
      external_trip_id: trip.external_trip_id || '',
      review_status: trip.review_status || '',
      visibility_status: trip.visibility_status || '',
      published_version: trip.published_version || 0,
    },
    created_at: now,
  }).catch(() => null);

  return {
    success: true,
    code: 0,
    trip_id: trip.trip_id || trip.external_trip_id || tripId,
    external_trip_id: trip.external_trip_id || '',
    trip_no: trip.trip_no || '',
    review_status: trip.review_status || 'pending_review',
    visibility_status: trip.visibility_status || 'hidden',
    warning_codes: trip.warning_codes || [],
    critical_warning_codes: trip.critical_warning_codes || [],
    draft_snapshot: compactSnapshotForOperatorPreview(trip.draft_snapshot),
    published_snapshot: compactSnapshotForOperatorPreview(trip.published_snapshot),
    ownership: ownershipProjection(trip),
    published_version: trip.published_version || 0,
    diff_summary: diffSummary(trip),
    // Layer 1 手机版行程单状态:运营据此渲染"预览/转发"按钮(转发不需要发布)
    itinerary_sheet: normalizeItinerarySheet(trip.itinerary_sheet),
    sheet_status: normalizeItinerarySheet(trip.itinerary_sheet) ? 'ready' : 'generating',
    can_forward_sheet: Boolean(normalizeItinerarySheet(trip.itinerary_sheet)),
    active_hotel_invites: await activeHotelInvitesForTrip(trip, canonicalTripId),
  };
};
