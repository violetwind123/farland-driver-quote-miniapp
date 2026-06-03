const cloud = require('wx-server-sdk');
const { requireRole } = require('./lib/auth');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const INTERNAL_KEYS = new Set([
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
  'audit_logs',
  'cost',
  'driver_cost',
  'margin',
  'supplier_note',
  'supplier_notes',
  'supplier_private_note',
  'supplier_private_notes',
]);

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeCustomerObject(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeCustomerObject).filter((item) => item !== undefined);
  }
  if (!isObject(value)) return value;
  return Object.keys(value).reduce((acc, key) => {
    if (INTERNAL_KEYS.has(key)) return acc;
    const sanitized = sanitizeCustomerObject(value[key]);
    if (sanitized !== undefined) acc[key] = sanitized;
    return acc;
  }, {});
}

function maskOpenid(openid) {
  const value = safeString(openid);
  if (!value) return '';
  if (value.length <= 10) return `${value.slice(0, 3)}...${value.slice(-2)}`;
  return `${value.slice(0, 5)}...${value.slice(-4)}`;
}

function toTime(value) {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
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

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
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

function deriveHotelCards(snapshot) {
  const cards = new Map();
  const days = Array.isArray(snapshot.itinerary_days) ? snapshot.itinerary_days : [];
  days.forEach((day, index) => {
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
  const topLevelHotels = Array.isArray(snapshot.hotel_cards) && snapshot.hotel_cards.length
    ? snapshot.hotel_cards
    : (Array.isArray(snapshot.hotels) ? snapshot.hotels : []);
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

function buildDailySummaryCards(snapshot, hotelCards) {
  const days = Array.isArray(snapshot.itinerary_days) ? snapshot.itinerary_days : [];
  return days.map((day, index) => {
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
      start_time_text: day.start_time_text || day.estimated_departure_time || day.displayed_start_time || '',
      displayed_start_time_raw: day.displayed_start_time_raw || '',
      estimated_departure_time_raw: day.estimated_departure_time_raw || '',
      has_time_conflict: Boolean(day.has_time_conflict),
      hotel_badge: hotelCard ? (hotelCard.name || hotelCard.hotel_name || '') : '',
      transport_badge: buildTransportBadge(day.transport_summary),
      highlight_items: highlights,
    });
  });
}

function buildTripSummary(snapshot, trip, hotelCards) {
  const days = Array.isArray(snapshot.itinerary_days) ? snapshot.itinerary_days : [];
  const flights = Array.isArray(snapshot.flights) ? snapshot.flights : [];
  const transfers = Array.isArray(snapshot.transfers) ? snapshot.transfers : [];
  const charterServices = Array.isArray(snapshot.charter_services) ? snapshot.charter_services : [];
  const firstDay = days[0] || null;
  const lastHotel = hotelCards[hotelCards.length - 1] || null;
  return sanitizeCustomerObject({
    trip_id: snapshot.trip_id || (trip && (trip.trip_id || trip.external_trip_id)) || '',
    trip_no: snapshot.trip_no || (trip && (trip.trip_no || trip.external_trip_id || trip.trip_id)) || '',
    title: snapshot.title || (trip && trip.title) || 'Farland 行程',
    date_range_text: buildDateText(snapshot.start_at || (trip && (trip.start_at || trip.date_start)) || '', snapshot.end_at || (trip && (trip.end_at || trip.date_end)) || ''),
    city_route_text: unique(days.map((day) => day.city)).join(' → ') || snapshot.city || (trip && trip.city) || '',
    days_count: days.length,
    hotels_count: hotelCards.length,
    flights_count: flights.length,
    transport_count: transfers.length + charterServices.length,
    next_day_label: firstDay ? `Day ${firstDay.day_no || 1}: ${firstDay.title || firstDay.city || ''}` : '',
    last_hotel_name: lastHotel ? (lastHotel.name || lastHotel.hotel_name || '') : '',
  });
}

function ensureSnapshotV2(snapshot, trip) {
  if (!isObject(snapshot) || !Object.keys(snapshot).length) return null;
  const days = Array.isArray(snapshot.itinerary_days)
    ? snapshot.itinerary_days.map(normalizeDay)
    : [];
  const normalized = {
    ...snapshot,
    itinerary_days: days,
  };
  const hotelCards = Array.isArray(snapshot.hotel_cards) && snapshot.hotel_cards.length
    ? snapshot.hotel_cards.map((hotel, index) => normalizeTopLevelHotel(hotel, index)).filter(Boolean)
    : deriveHotelCards(normalized);
  const dailySummaryCards = Array.isArray(snapshot.daily_summary_cards) && snapshot.daily_summary_cards.length
    ? snapshot.daily_summary_cards
    : buildDailySummaryCards(normalized, hotelCards);
  const tripSummary = isObject(snapshot.trip_summary)
    ? snapshot.trip_summary
    : buildTripSummary(normalized, trip, hotelCards);
  return sanitizeCustomerObject({
    ...normalized,
    snapshot_model_version: 2,
    trip_summary: tripSummary,
    daily_summary_cards: dailySummaryCards,
    hotel_cards: hotelCards,
    hotels: hotelCards,
  });
}

function buildOperatorDraftSnapshot(trip) {
  if (!trip) return null;
  const days = Array.isArray(trip.itinerary_days)
    ? trip.itinerary_days
    : (Array.isArray(trip.daily_itinerary) ? trip.daily_itinerary : []);
  const hasSourceContent = days.length
    || (Array.isArray(trip.hotels) && trip.hotels.length)
    || (Array.isArray(trip.hotel_requests) && trip.hotel_requests.length)
    || (Array.isArray(trip.flights) && trip.flights.length)
    || (Array.isArray(trip.charter_services) && trip.charter_services.length)
    || (Array.isArray(trip.transfers) && trip.transfers.length)
    || isObject(trip.charter)
    || isObject(trip.transfer);
  if (!hasSourceContent) return null;
  return ensureSnapshotV2(sanitizeCustomerObject({
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
    itinerary_days: days.map(normalizeDay),
    hotels: sanitizeCustomerObject(trip.hotels || trip.hotel_requests || []),
    flights: sanitizeCustomerObject(trip.flights || []),
    transfers: sanitizeCustomerObject(trip.transfers || (trip.transfer ? [trip.transfer] : [])),
    charter_services: sanitizeCustomerObject(trip.charter_services || (trip.charter ? [trip.charter] : [])),
    documents: sanitizeCustomerObject((trip.documents || []).filter((doc) => doc.visible_to_customer !== false)),
  }), trip);
}

function hasSnapshot(snapshot) {
  return isObject(snapshot) && Object.keys(snapshot).length > 0;
}

function getOperatorPreviewSnapshot(trip, isPublished) {
  if (!trip) return null;
  if (isPublished && hasSnapshot(trip.published_snapshot)) return trip.published_snapshot;
  if (hasSnapshot(trip.draft_snapshot)) return trip.draft_snapshot;
  return buildOperatorDraftSnapshot(trip);
}

async function findTrip(tripId) {
  if (!tripId) return null;
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

async function loadCustomer(customerUserId) {
  if (!customerUserId) return null;
  const userRes = await db.collection('users').doc(customerUserId).get().catch(() => null);
  const user = userRes && userRes.data;
  if (!user || user.role !== 'customer' || user.status !== 'active') return null;
  return user;
}

async function loadRequest(requestId) {
  if (!requestId) return null;
  const res = await db.collection('ride_requests').doc(requestId).get().catch(() => null);
  return res && res.data ? res.data : null;
}

function isActiveAccess(access) {
  if (!access || access.status !== 'active') return false;
  const visibleUntil = toTime(access.visible_until);
  return !visibleUntil || visibleUntil >= Date.now();
}

async function findCustomerAccessRows(customer) {
  if (!customer) return [];
  const queries = [
    db.collection('customer_trip_access')
      .where({ customer_user_id: customer._id, status: 'active' })
      .limit(20)
      .get()
      .catch(() => ({ data: [] })),
    db.collection('customer_trip_access')
      .where({ user_id: customer._id, status: 'active' })
      .limit(20)
      .get()
      .catch(() => ({ data: [] })),
  ];
  if (customer.openid) {
    queries.push(
      db.collection('customer_trip_access')
        .where({ customer_openid: customer.openid, status: 'active' })
        .limit(20)
        .get()
        .catch(() => ({ data: [] })),
      db.collection('customer_trip_access')
        .where({ openid: customer.openid, status: 'active' })
        .limit(20)
        .get()
        .catch(() => ({ data: [] })),
    );
  }
  const results = await Promise.all(queries);
  const seen = {};
  return results.flatMap((res) => res.data || []).filter((access) => {
    const key = access._id || `${access.trip_id}:${access.customer_user_id || access.user_id || access.customer_openid || access.openid}`;
    if (seen[key] || !isActiveAccess(access)) return false;
    seen[key] = true;
    return Boolean(access.trip_id);
  });
}

async function findCustomerDefaultTrip(customer) {
  const accessRows = await findCustomerAccessRows(customer);
  const tripIds = Array.from(new Set(accessRows.map((access) => access.trip_id).filter(Boolean)));
  const trips = [];
  for (const tripId of tripIds) {
    const trip = await findTrip(tripId);
    if (trip) trips.push(trip);
  }
  trips.sort((a, b) => {
    const aPublished = a.visibility_status === 'published' ? 1 : 0;
    const bPublished = b.visibility_status === 'published' ? 1 : 0;
    if (aPublished !== bPublished) return bPublished - aPublished;
    const aEnd = toTime(a.end_at || a.date_end || '');
    const bEnd = toTime(b.end_at || b.date_end || '');
    const aActive = !aEnd || aEnd >= Date.now() ? 1 : 0;
    const bActive = !bEnd || bEnd >= Date.now() ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    const aUpdated = toTime(a.last_operator_previewed_at || a.updated_at || a.imported_at || a.created_at || a.start_at || '');
    const bUpdated = toTime(b.last_operator_previewed_at || b.updated_at || b.imported_at || b.created_at || b.start_at || '');
    return bUpdated - aUpdated;
  });
  return trips[0] || null;
}

async function loadAssignedTransport(requestId) {
  if (!requestId) return { assigned_transport: null, transport_order_health: null };
  const orderRes = await db.collection('transport_orders').doc(requestId).get().catch(() => null);
  const order = orderRes && orderRes.data ? orderRes.data : null;
  if (!order) {
    return {
      assigned_transport: null,
      transport_order_health: {
        exists: false,
        complete: false,
        source: 'none',
        missing_fields: ['transport_orders'],
        warning_code: 'TRANSPORT_ORDER_MISSING',
        warning_text: '未找到正式执行快照',
      },
    };
  }
  const requiredFields = ['driver_name', 'driver_phone', 'vehicle_model'];
  const missingFields = requiredFields.filter((key) => !order[key]);
  return {
    assigned_transport: {
      transport_order_id: order._id || requestId,
      request_id: order.request_id || requestId,
      order_status: order.order_status || '',
      driver_name: order.driver_name || '',
      driver_phone: order.driver_phone || '',
      vehicle_type: order.vehicle_type || '',
      vehicle_model: order.vehicle_model || '',
      seats: order.seats || 0,
      luggage_capacity: order.luggage_capacity || 0,
      plate_number: order.plate_number || '',
      service_date: order.service_date || '',
      pickup: order.pickup || '',
      dropoff: order.dropoff || '',
      assigned_at: order.assigned_at || '',
      updated_at: order.updated_at || '',
    },
    transport_order_health: {
      exists: true,
      complete: missingFields.length === 0,
      source: 'transport_orders',
      missing_fields: missingFields,
      warning_code: missingFields.length ? 'TRANSPORT_ORDER_INCOMPLETE' : '',
      warning_text: missingFields.length ? '正式执行快照缺少司机或车辆字段' : '',
    },
  };
}

function normalizeSnapshot(snapshot) {
  if (!isObject(snapshot) || !Object.keys(snapshot).length) return null;
  const normalizedSnapshot = ensureSnapshotV2(snapshot, null) || snapshot;
  const hero = snapshot.hero || {};
  const customer = snapshot.customer || {};
  const advisor = snapshot.advisor || {};
  const days = Array.isArray(normalizedSnapshot.itinerary_days) ? normalizedSnapshot.itinerary_days : [];
  const hotels = Array.isArray(normalizedSnapshot.hotel_cards) ? normalizedSnapshot.hotel_cards : [];
  const transfers = Array.isArray(normalizedSnapshot.transfers) ? normalizedSnapshot.transfers : [];
  const charters = Array.isArray(normalizedSnapshot.charter_services) ? normalizedSnapshot.charter_services : [];
  const benefits = Array.isArray(normalizedSnapshot.benefits) ? normalizedSnapshot.benefits : [];
  return {
    ...normalizedSnapshot,
    display_title: hero.title || snapshot.title || 'Farland 行程',
    display_trip_no: hero.trip_no || snapshot.trip_no || snapshot.external_trip_id || snapshot.trip_id || '',
    display_date_range: hero.date_range || [snapshot.start_at || '', snapshot.end_at || ''].filter(Boolean).join(' - '),
    display_city: hero.city_summary || snapshot.city || '',
    display_customer: customer.display_name || customer.name || '',
    display_advisor: advisor.name || 'Farland Advisor',
    itinerary_days: days,
    hotels,
    hotel_cards: hotels,
    daily_summary_cards: normalizedSnapshot.daily_summary_cards || [],
    trip_summary: normalizedSnapshot.trip_summary || null,
    transfers,
    charter_services: charters,
    benefits,
  };
}

function firstUpcomingDay(snapshot, now = new Date()) {
  if (!snapshot || !Array.isArray(snapshot.itinerary_days) || !snapshot.itinerary_days.length) return null;
  const today = now.toISOString().slice(0, 10);
  const sorted = snapshot.itinerary_days.slice().sort((a, b) => safeString(a.date).localeCompare(safeString(b.date)));
  return sorted.find((day) => day.date && day.date >= today) || sorted[0] || null;
}

function buildTripOverview(snapshot, trip) {
  if (!snapshot) return [];
  if (snapshot.trip_summary) {
    return [{
      ...snapshot.trip_summary,
      title: snapshot.trip_summary.title || snapshot.display_title || 'Farland 行程',
      trip_no: snapshot.trip_summary.trip_no || snapshot.display_trip_no || '',
      date_range_text: snapshot.trip_summary.date_range_text || snapshot.display_date_range || '',
      city_summary: snapshot.trip_summary.city_route_text || snapshot.display_city || '',
      status_text: trip.visibility_status === 'published' ? '已发布' : '运营预览中',
    }];
  }
  return [{
    trip_id: snapshot.trip_id || trip.trip_id || trip.external_trip_id || '',
    trip_no: snapshot.display_trip_no || trip.trip_no || '',
    title: snapshot.display_title || trip.title || 'Farland 行程',
    date_range_text: snapshot.display_date_range || '',
    city_summary: snapshot.display_city || '',
    status_text: trip.visibility_status === 'published' ? '已发布' : '运营预览中',
  }];
}

function buildWaitingHome(trip, customer) {
  return {
    profile: {
      display_name: customer ? (customer.display_name || customer.name || 'Farland 客户') : 'Temporary Guest',
      preview_only: true,
    },
    today_itinerary: null,
    itinerary_days: [],
    trip_overview: [{
      trip_id: trip ? (trip.trip_id || trip.external_trip_id || '') : '',
      trip_no: trip ? (trip.trip_no || trip.external_trip_id || '') : '',
      title: trip ? (trip.title || 'Farland 行程') : 'Farland 行程',
      status_text: '待发布',
      waiting_message: 'Farland 顾问正在为您核对行程安排，确认后将在这里显示。',
    }],
    transportation_appointments: [],
    charter_services: [],
    transfer_requests: [],
    transport_orders: [],
    hotel_requests: [],
    benefits: [],
  };
}

function buildCustomerHome({ snapshot, trip, customer, request, assignedTransport }) {
  if (!snapshot) return buildWaitingHome(trip, customer);
  const today = firstUpcomingDay(snapshot);
  return {
    profile: {
      display_name: customer
        ? (customer.display_name || customer.name || snapshot.display_customer || 'Farland 客户')
        : (snapshot.display_customer || 'Temporary Guest'),
      advisor_name: snapshot.display_advisor || 'Farland Advisor',
      preview_only: true,
    },
    today_itinerary: today,
    daily_summary_cards: snapshot.daily_summary_cards || [],
    itinerary_days: snapshot.itinerary_days || [],
    trip_overview: buildTripOverview(snapshot, trip),
    transportation_appointments: request ? [{
      request_id: request._id || '',
      service_type: request.service_type || '',
      service_date: request.service_date || '',
      pickup: request.pickup || request.pickup_location || '',
      dropoff: request.dropoff || request.dropoff_location || '',
      status: request.status || '',
    }] : [],
    charter_services: snapshot.charter_services || [],
    transfer_requests: snapshot.transfers || [],
    transport_orders: assignedTransport ? [assignedTransport] : [],
    hotel_requests: snapshot.hotel_cards || snapshot.hotels || [],
    flight_cards: Array.isArray(snapshot.flights) ? snapshot.flights : [],
    benefits: snapshot.benefits || [],
    links: [],
  };
}

exports.main = async (event = {}) => {
  const auth = await requireRole(cloud, db, ['operator', 'super_admin']);
  if (!auth.ok) {
    return { success: false, code: auth.code, error_code: 'FORBIDDEN', message: auth.message };
  }

  const previewAccessMode = safeString(event.preview_access_mode || (event.customer_user_id ? 'existing_customer' : 'temporary_guest'));
  const tripId = safeString(event.trip_id || event.external_trip_id || event.trip_no).trim();
  const requestId = safeString(event.request_id).trim();
  const customerUserId = safeString(event.customer_user_id).trim();

  let customer = null;
  if (previewAccessMode === 'existing_customer' && customerUserId) {
    customer = await loadCustomer(customerUserId);
    if (!customer) {
      return { success: false, code: 404, error_code: 'CUSTOMER_NOT_FOUND', message: '客户不存在或不可预览' };
    }
  }

  let trip = await findTrip(tripId);
  if (tripId && !trip) {
    return { success: false, code: 404, error_code: 'TRIP_NOT_FOUND', message: '行程不存在' };
  }
  if (!trip && customer) {
    trip = await findCustomerDefaultTrip(customer);
  }
  const request = await loadRequest(requestId);
  const { assigned_transport: assignedTransport, transport_order_health: transportOrderHealth } = await loadAssignedTransport(requestId);

  const isPublished = Boolean(trip && trip.visibility_status === 'published' && hasSnapshot(trip.published_snapshot));
  const rawSnapshot = getOperatorPreviewSnapshot(trip, isPublished);
  const snapshot = normalizeSnapshot(rawSnapshot);
  const warnings = Array.isArray(trip && trip.warning_codes) ? trip.warning_codes.slice() : [];
  const criticalWarnings = Array.isArray(trip && trip.critical_warning_codes) ? trip.critical_warning_codes.slice() : [];
  if (trip && !isPublished) warnings.push('unpublished_trip');
  if (trip && !isPublished && !hasSnapshot(trip.draft_snapshot) && snapshot) warnings.push('preview_from_import_source');
  if (transportOrderHealth && transportOrderHealth.warning_code) warnings.push(transportOrderHealth.warning_code);

  return {
    success: true,
    code: 0,
    operator_preview: true,
    preview_access_mode: previewAccessMode === 'existing_customer' ? 'existing_customer' : 'temporary_guest',
    preview_customer: customer ? {
      customer_user_id: customer._id,
      display_name: customer.display_name || customer.name || 'Farland 客户',
      wechat_id: customer.wechat_id || '',
      openid_display: maskOpenid(customer.openid),
      is_registered: true,
    } : {
      customer_user_id: '',
      display_name: 'Temporary Guest',
      wechat_id: '',
      openid_display: '',
      is_registered: false,
    },
    customer_home: buildCustomerHome({
      snapshot,
      trip,
      customer,
      request,
      assignedTransport,
    }),
    preview_meta: {
      trip_id: trip ? (trip.trip_id || trip.external_trip_id || tripId) : tripId,
      request_id: requestId,
      review_status: trip ? (trip.review_status || 'pending_review') : '',
      visibility_status: trip ? (trip.visibility_status || 'hidden') : '',
      published_version: trip ? (trip.published_version || 0) : 0,
      customer_would_see: isPublished ? 'published' : 'waiting',
      warnings: Array.from(new Set(warnings)),
      critical_warnings: criticalWarnings,
      unpublished: Boolean(trip && !isPublished),
      assigned_transport_source: assignedTransport ? 'transport_orders' : 'none',
      transport_order_health: transportOrderHealth,
    },
  };
};
