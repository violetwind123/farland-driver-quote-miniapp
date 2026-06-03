const cloud = require('wx-server-sdk');
const { requireRole } = require('./lib/auth');
const { writeAuditLog } = require('./lib/audit');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const INTERNAL_KEYS = [
  'openid',
  'customer_openid',
  'customer_user_id',
  'user_id',
  'driver_quotes',
  'driver_quote',
  'internal_note',
  'internal_notes',
  'operator_note',
  'operator_notes',
  'operator_internal_note',
  'raw_parse_note',
  'raw_parse_notes',
  'source_raw_text',
  'source_pdf_text',
  'source_hash',
  'warning_codes',
  'critical_warning_codes',
  'audit_logs',
  'cost',
  'driver_cost',
  'margin',
  'supplier_note',
  'supplier_notes',
  'supplier_private_note',
  'supplier_private_notes',
];

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
}

function sanitizeCustomerObject(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeCustomerObject).filter((item) => item !== undefined);
  }
  if (!isPlainObject(value)) return value;

  return Object.keys(value).reduce((acc, key) => {
    if (INTERNAL_KEYS.includes(key)) return acc;
    const sanitized = sanitizeCustomerObject(value[key]);
    if (sanitized !== undefined) acc[key] = sanitized;
    return acc;
  }, {});
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function firstText(values) {
  for (const value of values) {
    const text = safeString(value).trim();
    if (text) return text;
  }
  return '';
}

function makeId(prefix, value, index) {
  return firstText([value]).replace(/[^a-zA-Z0-9_-]/g, '_') || `${prefix}_${index + 1}`;
}

function buildDateText(start, end) {
  return [start || '', end || ''].filter(Boolean).join(' - ');
}

function normalizeHotelStatus(status) {
  const value = safeString(status).trim();
  if (value === 'confirmed') return '已确认';
  if (value === 'cancelled') return '已取消';
  if (value === 'pending') return 'Farland 确认中';
  return value || 'Planned stay';
}

function findWarningCodes(trip) {
  const codes = new Set(Array.isArray(trip.warning_codes) ? trip.warning_codes : []);
  const days = Array.isArray(trip.itinerary_days)
    ? trip.itinerary_days
    : (Array.isArray(trip.daily_itinerary) ? trip.daily_itinerary : []);

  days.forEach((day) => {
    if (!day.date) codes.add('missing_date');
    const displayed = day.displayed_start_time || day.displayed_start_time_raw || day.start_time || '';
    const estimated = day.estimated_departure_time || day.estimated_departure_time_raw || day.depart_time || '';
    if (displayed && estimated && displayed !== estimated) codes.add('departure_time_mismatch');

    const items = Array.isArray(day.timeline_items)
      ? day.timeline_items
      : (Array.isArray(day.items) ? day.items : []);
    const hasHotelItem = items.some((item) => item.item_type === 'hotel' || item.type === 'hotel');
    if (day.hotel_required && !day.hotel && !hasHotelItem) codes.add('missing_hotel');
    items.forEach((item) => {
      const itemType = item.item_type || item.type || '';
      if (itemType === 'flight' || item.flight_no || item.flight_number) codes.add('flight_segment_detected');
      if ((item.route || item.location_name) && !item.drive_time_text && !item.drive_time) codes.add('missing_drive_time');
      if ((item.route || item.location_name) && !item.distance_text && !item.distance) codes.add('missing_distance');
    });
  });

  if (Array.isArray(trip.flights) && trip.flights.length) codes.add('flight_segment_detected');
  return Array.from(codes);
}

function normalizeTimelineItem(item, index) {
  const itemType = item.item_type || item.type || 'other';
  return sanitizeCustomerObject({
    item_id: item.item_id || item.id || `${itemType}_${index + 1}`,
    item_type: itemType,
    type: itemType,
    title: item.title || '行程节点',
    time: item.time || item.planned_start_time || item.planned_arrival_time || '',
    planned_arrival_time: item.planned_arrival_time || '',
    planned_start_time: item.planned_start_time || item.time || '',
    planned_end_time: item.planned_end_time || '',
    drive_time_text: item.drive_time_text || item.drive_time || '',
    distance_text: item.distance_text || item.distance || '',
    traffic_text: item.traffic_text || item.traffic_level || '',
    location_name: item.location_name || item.location || '',
    address: item.address || '',
    customer_note: item.customer_note || item.customer_visible_note || item.note || item.description || '',
    linked_entity_type: item.linked_entity_type || '',
    linked_entity_id: item.linked_entity_id || '',
  });
}

function normalizeDayHotel(hotel, day, index) {
  if (!hotel) return null;
  const name = firstText([hotel.name, hotel.hotel_name, hotel.title, hotel.location_name]);
  const address = firstText([hotel.address]);
  if (!name && !address) return null;
  const dayNo = day.day_no || index + 1;
  return sanitizeCustomerObject({
    hotel_id: hotel.hotel_id || hotel.id || `day_${dayNo}_hotel`,
    name: name || '酒店安排',
    hotel_name: name || '酒店安排',
    city: hotel.city || day.city || '',
    date: hotel.date || day.date || '',
    check_in_date: hotel.check_in_date || day.date || '',
    check_out_date: hotel.check_out_date || '',
    arrival_time: hotel.arrival_time || hotel.planned_arrival_time || hotel.time || '',
    address,
    room_type: hotel.room_type || '',
    status_text: hotel.status_text || normalizeHotelStatus(hotel.status),
    customer_note: hotel.customer_note || hotel.customer_visible_note || hotel.note || '',
    linked_day_no: dayNo,
  });
}

function normalizeDay(day, index) {
  const timelineSource = Array.isArray(day.timeline_items)
    ? day.timeline_items
    : (Array.isArray(day.items) ? day.items : []);
  const timelineItems = timelineSource.map(normalizeTimelineItem);
  const hotelItem = timelineItems.find((item) => {
    const type = item.item_type || item.type || '';
    return type === 'hotel' || /酒店|hotel/i.test(item.title || '');
  });
  const hotel = normalizeDayHotel(day.hotel, day, index)
    || (hotelItem ? normalizeDayHotel({
      hotel_id: hotelItem.linked_entity_id || hotelItem.item_id,
      name: hotelItem.title,
      address: hotelItem.address || hotelItem.location_name,
      arrival_time: hotelItem.time || hotelItem.planned_arrival_time,
      customer_note: hotelItem.customer_note,
    }, day, index) : null);
  const displayedRaw = firstText([day.displayed_start_time_raw, day.displayed_start_time, day.start_time]);
  const estimatedRaw = firstText([day.estimated_departure_time_raw, day.estimated_departure_time, day.depart_time]);
  const startTimeText = firstText([day.estimated_departure_time, day.estimated_departure_time_raw, day.displayed_start_time, day.displayed_start_time_raw, day.start_time]);
  return sanitizeCustomerObject({
    day_no: day.day_no || index + 1,
    date: day.date || '',
    weekday: day.weekday || '',
    title: day.title || `Day ${day.day_no || index + 1}`,
    city: day.city || '',
    summary: day.summary || '',
    displayed_start_time: day.displayed_start_time || '',
    estimated_departure_time: day.estimated_departure_time || '',
    displayed_start_time_raw: displayedRaw,
    estimated_departure_time_raw: estimatedRaw,
    start_time_text: startTimeText,
    has_time_conflict: Boolean(displayedRaw && estimatedRaw && displayedRaw !== estimatedRaw),
    warning_codes: Array.isArray(day.warning_codes) ? day.warning_codes : [],
    timeline_items: timelineItems,
    hotel,
    transport_summary: day.transport_summary ? sanitizeCustomerObject(day.transport_summary) : null,
  });
}

function normalizeTopLevelHotel(hotel, index) {
  const name = firstText([hotel.name, hotel.hotel_name, hotel.title]);
  const address = firstText([hotel.address]);
  if (!name && !address) return null;
  return sanitizeCustomerObject({
    id: hotel.hotel_id || hotel.id || makeId('hotel', name || address, index),
    hotel_id: hotel.hotel_id || hotel.id || makeId('hotel', name || address, index),
    name: name || '酒店安排',
    hotel_name: name || '酒店安排',
    city: hotel.city || '',
    check_in_date: hotel.check_in_date || hotel.date || '',
    check_out_date: hotel.check_out_date || '',
    date_text: hotel.date_text || buildDateText(hotel.check_in_date || hotel.date || '', hotel.check_out_date || ''),
    arrival_time: hotel.arrival_time || '',
    address,
    room_type: hotel.room_type || '',
    status_text: hotel.status_text || normalizeHotelStatus(hotel.status),
    note: hotel.customer_note || hotel.customer_visible_note || hotel.note || '',
    linked_day_no: hotel.linked_day_no || hotel.day_no || 0,
  });
}

function upsertHotelCard(map, card) {
  if (!card || (!card.name && !card.address)) return;
  const key = [
    card.name || card.hotel_name || '',
    card.check_in_date || card.date || '',
    card.check_out_date || '',
    card.linked_day_no || '',
  ].join('|');
  map.set(key, {
    ...(map.get(key) || {}),
    ...card,
    id: card.id || card.hotel_id || makeId('hotel', key, map.size),
  });
}

function deriveHotelCards(trip, normalizedDays) {
  const cards = new Map();
  normalizedDays.forEach((day, index) => {
    const hotel = day.hotel;
    if (!hotel) return;
    upsertHotelCard(cards, sanitizeCustomerObject({
      id: hotel.hotel_id || hotel.id || `day_${day.day_no || index + 1}_hotel`,
      hotel_id: hotel.hotel_id || hotel.id || `day_${day.day_no || index + 1}_hotel`,
      name: hotel.name || hotel.hotel_name || '酒店安排',
      hotel_name: hotel.name || hotel.hotel_name || '酒店安排',
      city: hotel.city || day.city || '',
      check_in_date: hotel.check_in_date || hotel.date || day.date || '',
      check_out_date: hotel.check_out_date || '',
      date_text: hotel.date_text || buildDateText(hotel.check_in_date || hotel.date || day.date || '', hotel.check_out_date || ''),
      arrival_time: hotel.arrival_time || '',
      address: hotel.address || '',
      room_type: hotel.room_type || '',
      status_text: hotel.status_text || 'Planned stay',
      note: hotel.customer_note || hotel.note || '',
      linked_day_no: hotel.linked_day_no || day.day_no || index + 1,
    }));
  });
  const topLevelHotels = Array.isArray(trip.hotels)
    ? trip.hotels
    : (Array.isArray(trip.hotel_requests) ? trip.hotel_requests : []);
  topLevelHotels.forEach((hotel, index) => {
    upsertHotelCard(cards, normalizeTopLevelHotel(hotel, index));
  });
  return Array.from(cards.values()).sort((a, b) => {
    const dayDiff = Number(a.linked_day_no || 0) - Number(b.linked_day_no || 0);
    if (dayDiff) return dayDiff;
    return safeString(a.check_in_date).localeCompare(safeString(b.check_in_date));
  });
}

function buildTransportBadge(transportSummary) {
  if (!transportSummary) return '';
  if (typeof transportSummary === 'string') return transportSummary;
  return firstText([
    transportSummary.title,
    transportSummary.service_type === 'charter' ? '包车服务' : '',
    transportSummary.service_type === 'transfer' ? '接送安排' : '',
    transportSummary.vehicle_summary,
    transportSummary.vehicle_class,
  ]);
}

function buildDailySummaryCards(normalizedDays, hotelCards) {
  return normalizedDays.map((day, index) => {
    const dayNo = day.day_no || index + 1;
    const hotelCard = hotelCards.find((hotel) => Number(hotel.linked_day_no || 0) === Number(dayNo));
    const highlights = (day.timeline_items || []).map((item) => item.title).filter(Boolean).slice(0, 2);
    return sanitizeCustomerObject({
      id: `day_${dayNo}`,
      day_no: dayNo,
      date: day.date || '',
      weekday: day.weekday || '',
      title: day.title || `Day ${dayNo}`,
      city: day.city || '',
      start_time_text: day.start_time_text || '',
      displayed_start_time_raw: day.displayed_start_time_raw || '',
      estimated_departure_time_raw: day.estimated_departure_time_raw || '',
      has_time_conflict: Boolean(day.has_time_conflict),
      hotel_badge: hotelCard ? (hotelCard.name || hotelCard.hotel_name || '') : '',
      transport_badge: buildTransportBadge(day.transport_summary),
      highlight_items: highlights,
    });
  });
}

function buildTripSummary({ trip, normalizedDays, hotelCards, flights, transfers, charterServices }) {
  const title = trip.title || 'Farland 行程';
  const cityRoute = unique(normalizedDays.map((day) => day.city)).join(' → ') || trip.city || '';
  const firstDay = normalizedDays[0] || null;
  const nextDayLabel = firstDay ? `Day ${firstDay.day_no || 1}: ${firstDay.title || firstDay.city || ''}` : '';
  const lastHotel = hotelCards[hotelCards.length - 1] || null;
  return sanitizeCustomerObject({
    trip_id: trip.trip_id || trip.external_trip_id || '',
    trip_no: trip.trip_no || trip.external_trip_id || trip.trip_id || '',
    title,
    date_range_text: buildDateText(trip.start_at || trip.date_start || '', trip.end_at || trip.date_end || ''),
    city_route_text: cityRoute,
    days_count: normalizedDays.length,
    hotels_count: hotelCards.length,
    flights_count: flights.length,
    transport_count: transfers.length + charterServices.length,
    next_day_label: nextDayLabel,
    last_hotel_name: lastHotel ? (lastHotel.name || lastHotel.hotel_name || '') : '',
  });
}

function buildDraftSnapshot(trip) {
  const days = Array.isArray(trip.itinerary_days)
    ? trip.itinerary_days
    : (Array.isArray(trip.daily_itinerary) ? trip.daily_itinerary : []);
  const normalizedDays = days.map(normalizeDay);
  const flights = sanitizeCustomerObject(trip.flights || []);
  const transfers = sanitizeCustomerObject(trip.transfers || (trip.transfer ? [trip.transfer] : []));
  const charterServices = sanitizeCustomerObject(trip.charter_services || (trip.charter ? [trip.charter] : []));
  const hotelCards = deriveHotelCards(trip, normalizedDays);
  const dailySummaryCards = buildDailySummaryCards(normalizedDays, hotelCards);
  const tripSummary = buildTripSummary({
    trip,
    normalizedDays,
    hotelCards,
    flights,
    transfers,
    charterServices,
  });
  return sanitizeCustomerObject({
    snapshot_model_version: 2,
    trip_id: trip.trip_id || trip.external_trip_id || '',
    external_trip_id: trip.external_trip_id || trip.trip_id || '',
    trip_no: trip.trip_no || trip.external_trip_id || trip.trip_id || '',
    title: trip.title || 'Farland 行程',
    trip_type: trip.trip_type || '',
    status: trip.status || '',
    city: trip.city || '',
    country: trip.country || '',
    timezone: trip.timezone || '',
    start_at: trip.start_at || trip.date_start || '',
    end_at: trip.end_at || trip.date_end || '',
    summary: trip.summary || '',
    customer: sanitizeCustomerObject(trip.customer || {}),
    advisor: sanitizeCustomerObject(trip.advisor || {}),
    hero: {
      title: trip.title || 'Farland 行程',
      trip_no: trip.trip_no || trip.external_trip_id || trip.trip_id || '',
      date_range: [trip.start_at || trip.date_start || '', trip.end_at || trip.date_end || ''].filter(Boolean).join(' - '),
      city_summary: trip.city || '',
    },
    trip_summary: tripSummary,
    daily_summary_cards: dailySummaryCards,
    hotel_cards: hotelCards,
    itinerary_days: normalizedDays,
    hotels: hotelCards,
    flights,
    transfers,
    charter_services: charterServices,
    documents: sanitizeCustomerObject((trip.documents || []).filter((doc) => doc.visible_to_customer !== false)),
  });
}

async function findTrip(tripId) {
  const queries = [
    { trip_id: tripId },
    { external_trip_id: tripId },
    { trip_no: tripId },
  ];
  for (const query of queries) {
    const res = await db.collection('customer_trips')
      .where(query)
      .limit(1)
      .get()
      .catch(() => ({ data: [] }));
    if (res.data[0]) return res.data[0];
  }
  return null;
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

  const now = new Date().toISOString();
  const warningCodes = unique(findWarningCodes(trip));
  const criticalWarningCodes = Array.isArray(trip.critical_warning_codes) ? trip.critical_warning_codes : [];
  const draftSnapshot = buildDraftSnapshot(trip);
  const canonicalTripId = trip.trip_id || trip.external_trip_id || tripId;
  const nextReviewStatus = trip.published_version > 0 ? 'needs_review' : 'pending_review';

  await db.collection('customer_trips').doc(trip._id).update({
    data: {
      trip_id: canonicalTripId,
      external_trip_id: trip.external_trip_id || canonicalTripId,
      draft_snapshot: draftSnapshot,
      warning_codes: warningCodes,
      critical_warning_codes: criticalWarningCodes,
      review_status: nextReviewStatus,
      visibility_status: trip.visibility_status || 'hidden',
      updated_by: auth.user._id,
      updated_by_openid: auth.openid,
      updated_at: now,
    },
  });

  await writeAuditLog(db, {
    actor_openid: auth.openid,
    actor_user_id: auth.user._id,
    actor_role: auth.user.role,
    action: 'customer_trip_visible_draft_built',
    target_type: 'customer_trip',
    target_id: trip._id,
    detail: {
      trip_id: canonicalTripId,
      external_trip_id: trip.external_trip_id || '',
      warning_codes: warningCodes,
      critical_warning_codes: criticalWarningCodes,
    },
    created_at: now,
  }).catch(() => null);

  return {
    success: true,
    code: 0,
    trip_id: canonicalTripId,
    external_trip_id: trip.external_trip_id || canonicalTripId,
    review_status: nextReviewStatus,
    visibility_status: trip.visibility_status || 'hidden',
    warning_codes: warningCodes,
    critical_warning_codes: criticalWarningCodes,
    draft_snapshot: draftSnapshot,
  };
};
