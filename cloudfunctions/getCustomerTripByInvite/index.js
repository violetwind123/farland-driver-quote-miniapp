const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const BLOCKED_SNAPSHOT_KEYS = new Set([
  'openid',
  'customer_openid',
  'customer_user_id',
  'user_id',
  'draft_snapshot',
  'raw_imported_json',
  'raw_json',
  'raw_parse_note',
  'raw_parse_notes',
  'source_raw_text',
  'source_pdf_text',
  'ai_warnings',
  'warning_codes',
  'critical_warning_codes',
  'operator_note',
  'operator_notes',
  'internal_note',
  'internal_notes',
  'operator_internal_note',
  'supplier_note',
  'supplier_notes',
  'supplier_private_note',
  'supplier_private_notes',
  'driver_quotes',
  'driver_quote',
  'raw_quote_pool',
  'cost',
  'driver_cost',
  'margin',
  'audit_logs',
]);

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeCustomerObject(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeCustomerObject).filter((item) => item !== undefined);
  }
  if (!isPlainObject(value)) return value;
  return Object.keys(value).reduce((acc, key) => {
    if (BLOCKED_SNAPSHOT_KEYS.has(key)) return acc;
    const sanitized = sanitizeCustomerObject(value[key]);
    if (sanitized !== undefined) acc[key] = sanitized;
    return acc;
  }, {});
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

function parseFlightRoute(value) {
  const text = safeString(value);
  const match = text.match(/\b([A-Z]{3})\s*(?:->|→|-)\s*([A-Z]{3})\b/);
  return match ? { from: match[1], to: match[2] } : {};
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
    card_id: item.card_id || item.item_id || item.id || `${itemType}_${index + 1}`,
    card_type: item.card_type || item.cardType || itemType,
    sequence: item.sequence || index + 1,
    total_count: item.total_count || undefined,
    entity_ref: item.entity_ref || item.entityRef || null,
    display_snapshot: item.display_snapshot || item.displaySnapshot || null,
    time_snapshot: item.time_snapshot || item.timeSnapshot || null,
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
    route: item.route || '',
    flight_no: item.flight_no || item.flight_number || '',
    flight_number: item.flight_number || item.flight_no || '',
    from: item.from || item.origin || item.departure_airport || '',
    to: item.to || item.destination || item.arrival_airport || '',
    departure_time: item.departure_time || item.depart_at || item.planned_start_time || '',
    arrival_time: item.arrival_time || item.arrive_at || item.planned_arrival_time || '',
    aircraft: item.aircraft || '',
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
    ...day,
    day_no: day.day_no || index + 1,
    title: day.title || `Day ${day.day_no || index + 1}`,
    displayed_start_time_raw: displayedRaw,
    estimated_departure_time_raw: estimatedRaw,
    start_time_text: startTimeText,
    has_time_conflict: Boolean(displayedRaw && estimatedRaw && displayedRaw !== estimatedRaw),
    timeline_items: timelineItems,
    hotel,
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
  const topLevelHotels = [
    ...(Array.isArray(snapshot.hotel_cards) ? snapshot.hotel_cards : []),
    ...(Array.isArray(snapshot.hotels) ? snapshot.hotels : []),
    ...(Array.isArray(snapshot.hotel_requests) ? snapshot.hotel_requests : []),
  ];
  topLevelHotels.forEach((hotel, index) => upsertHotelCard(cards, normalizeTopLevelHotel(hotel, index)));
  return Array.from(cards.values()).sort((a, b) => {
    const dayDiff = Number(a.linked_day_no || 0) - Number(b.linked_day_no || 0);
    if (dayDiff) return dayDiff;
    return safeString(a.check_in_date).localeCompare(safeString(b.check_in_date));
  });
}

function normalizeFlightCard(flight, index, dayNo = 0) {
  if (!flight) return null;
  const route = parseFlightRoute(flight.route || flight.title || '');
  const flightMatch = safeString(flight.title).match(/\b[A-Z]{2}\d{2,4}\b/);
  const flightNo = firstText([flight.flight_no, flight.flight_number, flightMatch ? flightMatch[0] : '']);
  const from = firstText([flight.from, flight.origin, flight.departure_airport, route.from]);
  const to = firstText([flight.to, flight.destination, flight.arrival_airport, route.to]);
  if (!flightNo && !from && !to) return null;
  return sanitizeCustomerObject({
    id: flight.flight_id || flight.id || makeId('flight', `${flightNo}-${from}-${to}`, index),
    flight_id: flight.flight_id || flight.id || makeId('flight', `${flightNo}-${from}-${to}`, index),
    day_no: flight.day_no || dayNo || 0,
    flight_no: flightNo || '航班',
    from,
    to,
    departure_time: flight.departure_time || flight.depart_at || flight.planned_start_time || flight.time || '',
    arrival_time: flight.arrival_time || flight.arrive_at || flight.planned_arrival_time || '',
    aircraft: flight.aircraft || '',
    note: flight.customer_note || flight.customer_visible_note || flight.note || '',
  });
}

function deriveFlightCards(snapshot) {
  const cards = [];
  const topLevelFlights = [
    ...(Array.isArray(snapshot.flight_cards) ? snapshot.flight_cards : []),
    ...(Array.isArray(snapshot.flights) ? snapshot.flights : []),
  ];
  topLevelFlights.forEach((flight) => {
    const card = normalizeFlightCard(flight, cards.length, flight.day_no || 0);
    if (card) cards.push(card);
  });
  const days = Array.isArray(snapshot.itinerary_days) ? snapshot.itinerary_days : [];
  days.forEach((day) => {
    (day.timeline_items || []).forEach((item) => {
      const itemType = item.item_type || item.type || '';
      const title = safeString(item.title);
      const route = safeString(item.route || `${item.from || ''} → ${item.to || ''}`);
      if (itemType !== 'flight' && !item.flight_no && !item.flight_number && !/\b[A-Z]{2}\d{2,4}\b/.test(title) && !/\b[A-Z]{3}\s*(?:->|→|-)\s*[A-Z]{3}\b/.test(route || title)) return;
      const card = normalizeFlightCard({ ...item, route: item.route || title }, cards.length, day.day_no);
      if (card) cards.push(card);
    });
  });
  const seen = new Set();
  return cards.filter((card) => {
    const key = [card.flight_no, card.day_no, card.from, card.to, card.departure_time].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
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
      item_count: (day.timeline_items || []).length,
      clickable: true,
    });
  });
}

function buildTripSummary(snapshot) {
  const days = Array.isArray(snapshot.itinerary_days) ? snapshot.itinerary_days : [];
  const hotelCards = Array.isArray(snapshot.hotel_cards) ? snapshot.hotel_cards : [];
  const flightCards = Array.isArray(snapshot.flight_cards) ? snapshot.flight_cards : (Array.isArray(snapshot.flights) ? snapshot.flights : []);
  const transfers = Array.isArray(snapshot.transfers) ? snapshot.transfers : [];
  const charterServices = Array.isArray(snapshot.charter_services) ? snapshot.charter_services : [];
  const firstDay = days[0] || null;
  const lastHotel = hotelCards[hotelCards.length - 1] || null;
  return sanitizeCustomerObject({
    trip_id: snapshot.trip_id || snapshot.external_trip_id || '',
    external_trip_id: snapshot.external_trip_id || snapshot.trip_id || '',
    trip_no: snapshot.trip_no || snapshot.external_trip_id || snapshot.trip_id || '',
    title: snapshot.title || 'Farland 行程',
    date_range_text: buildDateText(snapshot.start_at || snapshot.date_start || '', snapshot.end_at || snapshot.date_end || ''),
    city_route_text: unique(days.map((day) => day.city)).join(' → ') || snapshot.city || '',
    days_count: days.length,
    hotels_count: hotelCards.length,
    flights_count: flightCards.length,
    transport_count: transfers.length + charterServices.length,
    next_day_label: firstDay ? `Day ${firstDay.day_no || 1}: ${firstDay.title || firstDay.city || ''}` : '',
    last_hotel_name: lastHotel ? (lastHotel.name || lastHotel.hotel_name || '') : '',
  });
}

function toAssignedTransport(order) {
  if (!order) return null;
  const driver = order.driver || {};
  return {
    driver_name: order.driver_name || driver.display_name || driver.name || '',
    driver_phone: order.driver_phone || driver.phone || '',
    vehicle_type: order.vehicle_type || order.vehicle_class || driver.vehicle_type || '',
    vehicle_model: order.vehicle_model || driver.vehicle_model || '',
    vehicle_color: order.vehicle_color || driver.vehicle_color || '',
    seats: order.seats || driver.seats || 0,
    luggage_capacity: order.luggage_capacity || driver.luggage_capacity || 0,
    plate_number: order.plate_number || driver.plate_number || '',
    meeting_point: order.meeting_point || order.pickup || driver.meeting_point || '',
    pickup: order.pickup || order.meeting_point || driver.meeting_point || '',
    pickup_time_text: order.pickup_time_text || order.pickup_time || order.service_date || '',
    service_date: order.service_date || '',
    request_id: order.request_id || '',
  };
}

function hasAssignedTransportDetails(transport) {
  if (!transport) return false;
  return Boolean(
    transport.driver_name
    || transport.driver_phone
    || transport.vehicle_type
    || transport.vehicle_model
    || transport.plate_number
  );
}

function hasCompleteAssignedTransport(transport) {
  if (!transport) return false;
  return Boolean(
    (transport.driver_name || transport.driver_phone)
    && (transport.vehicle_model || transport.vehicle_type)
  );
}

function mergeAssignedTransport(primary, fallback) {
  if (!primary && !fallback) return null;
  const base = primary || {};
  const fill = fallback || {};
  return {
    driver_name: base.driver_name || fill.driver_name || '',
    driver_phone: base.driver_phone || fill.driver_phone || '',
    vehicle_type: base.vehicle_type || fill.vehicle_type || '',
    vehicle_model: base.vehicle_model || fill.vehicle_model || '',
    vehicle_color: base.vehicle_color || fill.vehicle_color || '',
    seats: base.seats || fill.seats || 0,
    luggage_capacity: base.luggage_capacity || fill.luggage_capacity || 0,
    plate_number: base.plate_number || fill.plate_number || '',
    meeting_point: base.meeting_point || fill.meeting_point || '',
    pickup: base.pickup || fill.pickup || '',
    pickup_time_text: base.pickup_time_text || fill.pickup_time_text || '',
    service_date: base.service_date || fill.service_date || '',
    request_id: base.request_id || fill.request_id || '',
  };
}

function toCustomerDriver(transport) {
  if (!hasAssignedTransportDetails(transport)) return null;
  return {
    name: transport.driver_name || '',
    phone: transport.driver_phone || '',
    vehicle_type: transport.vehicle_type || '',
    vehicle_model: transport.vehicle_model || transport.vehicle_type || '',
    vehicle_color: transport.vehicle_color || '',
    seats: transport.seats || 0,
    luggage_capacity: transport.luggage_capacity || 0,
    plate_number: transport.plate_number || '',
    meeting_point: transport.meeting_point || transport.pickup || '',
  };
}

function applyAssignedTransportToDay(day, transport) {
  const driver = toCustomerDriver(transport);
  if (!day || !driver) return day;
  const existing = day.transport_summary || {};
  return {
    ...day,
    transport_summary: sanitizeCustomerObject({
      ...existing,
      service_type: existing.service_type || existing.type || 'charter',
      type: existing.type || existing.service_type || 'charter',
      title: existing.title || '今日包车服务',
      status_text: '已分配司机',
      driver_visibility: 'assigned',
      driver,
      assigned_transport: driver,
      assigned_transport_source: 'transport_orders',
      request_id: transport.request_id || existing.request_id || '',
      pickup: existing.pickup || existing.pickup_address || transport.pickup || transport.meeting_point || '',
      pickup_address: existing.pickup_address || existing.pickup || transport.pickup || transport.meeting_point || '',
      pickup_time: existing.pickup_time || transport.pickup_time_text || '',
      depart_time: existing.depart_time || transport.pickup_time_text || '',
      service_window_label: existing.service_window_label || (transport.pickup_time_text ? `${transport.pickup_time_text} 出发` : ''),
      vehicle_summary: existing.vehicle_summary || [driver.vehicle_model || driver.vehicle_type || '', driver.vehicle_color || ''].filter(Boolean).join(' · '),
      vehicle_model: driver.vehicle_model || '',
      vehicle_type: driver.vehicle_type || '',
      vehicle_color: driver.vehicle_color || '',
      plate_number: driver.plate_number || '',
    }),
  };
}

function transportMatchesDay(transport, day) {
  const serviceDate = safeString(transport && transport.service_date).slice(0, 10);
  const dayDate = safeString(day && day.date).slice(0, 10);
  return Boolean(serviceDate && dayDate && serviceDate === dayDate);
}

async function getAssignedTransportFromOrder(requestId) {
  let primaryTransport = null;
  const byDoc = await db.collection('transport_orders').doc(requestId).get().catch(() => null);
  const docOrder = byDoc && byDoc.data;
  if (docOrder && ['assigned', 'confirmed'].includes(docOrder.order_status)) {
    primaryTransport = toAssignedTransport(docOrder);
    if (hasCompleteAssignedTransport(primaryTransport)) return primaryTransport;
  }

  const queryRes = await db.collection('transport_orders')
    .where({ request_id: requestId, order_status: _.in(['assigned', 'confirmed']) })
    .limit(20)
    .get()
    .catch(() => ({ data: [] }));
  const latestOrder = (queryRes.data || [])
    .sort((a, b) => safeString(b.updated_at).localeCompare(safeString(a.updated_at)))[0];
  return mergeAssignedTransport(primaryTransport, toAssignedTransport(latestOrder));
}

async function queryAssignedCharterRequests(field, tripIds) {
  if (!tripIds.length) return [];
  const res = await db.collection('ride_requests')
    .where({
      [field]: _.in(tripIds),
      service_type: 'charter',
      status: _.in(['assigned', 'confirmed']),
    })
    .limit(20)
    .get()
    .catch(() => ({ data: [] }));
  return (res.data || []).sort((a, b) => safeString(b.updated_at).localeCompare(safeString(a.updated_at)));
}

async function queryAssignedCharterOrders(field, tripIds) {
  if (!tripIds.length) return [];
  const res = await db.collection('transport_orders')
    .where({
      [field]: _.in(tripIds),
      service_type: 'charter',
      order_status: _.in(['assigned', 'confirmed']),
    })
    .limit(20)
    .get()
    .catch(() => ({ data: [] }));
  return (res.data || [])
    .sort((a, b) => safeString(b.updated_at).localeCompare(safeString(a.updated_at)))
    .map(toAssignedTransport)
    .filter(hasAssignedTransportDetails);
}

async function findAssignedCharterTransports(tripIds) {
  const safeTripIds = Array.from(new Set((tripIds || []).map((id) => safeString(id).trim()).filter(Boolean)));
  if (!safeTripIds.length) return [];
  const requestResults = await Promise.all([
    queryAssignedCharterRequests('trip_id', safeTripIds),
    queryAssignedCharterRequests('external_trip_id', safeTripIds),
    queryAssignedCharterRequests('trip_no', safeTripIds),
  ]);
  const seenRequests = new Set();
  const requests = requestResults.flat().filter((request) => {
    const requestId = request._id || request.request_id || '';
    if (!requestId || seenRequests.has(requestId)) return false;
    seenRequests.add(requestId);
    return true;
  });
  const fromRequests = await Promise.all(requests.map(async (request) => {
    const requestId = request._id || request.request_id || '';
    const orderTransport = await getAssignedTransportFromOrder(requestId);
    return mergeAssignedTransport(orderTransport, {
      request_id: requestId,
      pickup: request.pickup || request.pickup_location || '',
      pickup_time_text: request.pickup_time_text || request.pickup_time || request.service_date || '',
      service_date: request.service_date || '',
    });
  }));

  const orderResults = await Promise.all([
    queryAssignedCharterOrders('trip_id', safeTripIds),
    queryAssignedCharterOrders('external_trip_id', safeTripIds),
    queryAssignedCharterOrders('trip_no', safeTripIds),
  ]);
  const seenKeys = new Set();
  return [...fromRequests, ...orderResults.flat()]
    .filter(hasAssignedTransportDetails)
    .filter((transport) => {
      const key = [
        transport.request_id || '',
        transport.driver_name || '',
        transport.driver_phone || '',
        transport.vehicle_model || '',
        transport.plate_number || '',
        transport.service_date || '',
      ].join('|');
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });
}

function applyAssignedCharterTransport(snapshot, transports) {
  if (!isPlainObject(snapshot) || !Array.isArray(snapshot.itinerary_days) || !transports.length) return snapshot;
  const completeTransports = transports.filter(hasCompleteAssignedTransport);
  const usableTransports = completeTransports.length ? completeTransports : transports;
  const allDaysTransport = usableTransports.length === 1 ? usableTransports[0] : null;
  const itineraryDays = snapshot.itinerary_days.map((day) => {
    const matchingTransport = usableTransports.find((transport) => transportMatchesDay(transport, day)) || allDaysTransport;
    return matchingTransport ? applyAssignedTransportToDay(day, matchingTransport) : day;
  });
  const firstAssignedDay = itineraryDays.find((day) => {
    return day && day.transport_summary && day.transport_summary.driver_visibility === 'assigned';
  });
  if (!firstAssignedDay) return snapshot;
  return sanitizeCustomerObject({
    ...snapshot,
    itinerary_days: itineraryDays,
    today_driver_card: firstAssignedDay ? {
      ...(snapshot.today_driver_card || {}),
      visible: true,
      day_no: firstAssignedDay.day_no || 0,
      date: firstAssignedDay.date || '',
      ...(firstAssignedDay.transport_summary || {}),
      status: 'assigned',
      status_text: '已分配司机',
    } : snapshot.today_driver_card,
    transport_projection_source: 'transport_orders',
  });
}

function normalizePublishedSnapshot(rawSnapshot) {
  const snapshot = sanitizeCustomerObject(rawSnapshot || {});
  if (!isPlainObject(snapshot) || !Object.keys(snapshot).length) return {};
  const days = Array.isArray(snapshot.itinerary_days)
    ? snapshot.itinerary_days.map(normalizeDay)
    : (Array.isArray(snapshot.days) ? snapshot.days.map(normalizeDay) : []);
  const normalized = {
    ...snapshot,
    itinerary_days: days,
  };
  const hotelCards = Array.isArray(snapshot.hotel_cards) && snapshot.hotel_cards.length
    ? snapshot.hotel_cards.map((hotel, index) => normalizeTopLevelHotel(hotel, index)).filter(Boolean)
    : deriveHotelCards(normalized);
  const flightCards = Array.isArray(snapshot.flight_cards) && snapshot.flight_cards.length
    ? snapshot.flight_cards.map((flight, index) => normalizeFlightCard(flight, index)).filter(Boolean)
    : deriveFlightCards(normalized);
  const dailySummaryCards = Array.isArray(snapshot.daily_summary_cards) && snapshot.daily_summary_cards.length
    ? snapshot.daily_summary_cards
    : buildDailySummaryCards(normalized, hotelCards);
  const tripSummary = isPlainObject(snapshot.trip_summary)
    ? snapshot.trip_summary
    : buildTripSummary({ ...normalized, hotel_cards: hotelCards, flight_cards: flightCards });
  return sanitizeCustomerObject({
    ...normalized,
    snapshot_model_version: 2,
    trip_summary: tripSummary,
    daily_summary_cards: dailySummaryCards,
    hotel_cards: hotelCards,
    flight_cards: flightCards,
    hotels: hotelCards,
  });
}

function toTime(value) {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function isVisibleAccess(access, now) {
  if (!access || access.status !== 'active') return false;
  const bindMode = access.bind_mode || access.access_type || '';
  if (bindMode === 'farland_profile' || bindMode === 'profile') return true;
  const visibleUntil = toTime(access.visible_until);
  return !visibleUntil || visibleUntil >= now.getTime();
}

function isBlockedRole(user) {
  return Boolean(user && ['operator', 'super_admin', 'driver'].includes(user.role));
}

function canonicalTripId(trip, fallback = '') {
  return safeString(trip && (trip.trip_id || trip.external_trip_id || trip.trip_no || fallback)).trim();
}

function tripIdCandidates(trip, fallback = '') {
  return Array.from(new Set([
    safeString(fallback).trim(),
    safeString(trip && trip.trip_id).trim(),
    safeString(trip && trip.external_trip_id).trim(),
    safeString(trip && trip.trip_no).trim(),
    safeString(trip && trip._id).trim(),
  ].filter(Boolean)));
}

function hasPublishedSnapshot(trip) {
  return Boolean(
    trip
    && trip.visibility_status === 'published'
    && isPlainObject(trip.published_snapshot)
    && Object.keys(trip.published_snapshot).length
  );
}

function isInviteUsable(invite, now) {
  if (!invite) return false;
  if (invite.status !== 'active') return false;
  const expiresAt = toTime(invite.expires_at);
  return !expiresAt || expiresAt >= now.getTime();
}

async function writeAuditLog(data) {
  return db.collection('audit_logs').add({ data }).catch(() => null);
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

async function findUserByOpenid(openid) {
  if (!openid) return null;
  const res = await db.collection('users')
    .where({ openid })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }));
  return res.data[0] || null;
}

async function findInvite({ inviteCode, tripIds }) {
  const safeCode = safeString(inviteCode).trim();
  if (!safeCode) return null;
  const res = await db.collection('customer_trip_invites')
    .where({ invite_code: safeCode })
    .limit(5)
    .get()
    .catch(() => ({ data: [] }));
  const allowed = new Set(tripIds.filter(Boolean));
  return (res.data || []).find((invite) => {
    return allowed.has(safeString(invite.trip_id).trim())
      || allowed.has(safeString(invite.external_trip_id).trim())
      || allowed.has(safeString(invite.trip_no).trim());
  }) || null;
}

async function findActiveAccess({ tripIds, openid, userId, now }) {
  const queries = [];
  tripIds.forEach((tripId) => {
    if (openid) {
      queries.push(db.collection('customer_trip_access').where({ trip_id: tripId, openid, status: 'active' }).limit(1).get().catch(() => ({ data: [] })));
      queries.push(db.collection('customer_trip_access').where({ trip_id: tripId, customer_openid: openid, status: 'active' }).limit(1).get().catch(() => ({ data: [] })));
    }
    if (userId) {
      queries.push(db.collection('customer_trip_access').where({ trip_id: tripId, user_id: userId, status: 'active' }).limit(1).get().catch(() => ({ data: [] })));
      queries.push(db.collection('customer_trip_access').where({ trip_id: tripId, customer_user_id: userId, status: 'active' }).limit(1).get().catch(() => ({ data: [] })));
    }
  });
  if (!queries.length) return null;
  const results = await Promise.all(queries);
  const records = results.flatMap((res) => res.data || []);
  return records.find((access) => isVisibleAccess(access, now)) || null;
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { success: false, code: 401, error_code: 'UNAUTHENTICATED', message: '无法识别用户身份' };
  }

  const inputTripId = safeString(event.trip_id || event.external_trip_id || event.trip_no).trim();
  const inviteCode = safeString(event.invite_code).trim();
  if (!inputTripId) {
    return { success: false, code: 422, error_code: 'TRIP_ID_REQUIRED', message: '请提供 trip_id' };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const [trip, user] = await Promise.all([
    findTrip(inputTripId),
    findUserByOpenid(OPENID),
  ]);

  if (!trip) {
    return { success: false, code: 404, error_code: 'TRIP_NOT_FOUND', message: '行程不存在' };
  }

  const tripId = canonicalTripId(trip, inputTripId);
  const tripIds = tripIdCandidates(trip, inputTripId);
  const blockedRole = isBlockedRole(user);
  const activeAccess = await findActiveAccess({
    tripIds,
    openid: OPENID,
    userId: user ? user._id : '',
    now,
  });
  const invite = await findInvite({ inviteCode, tripIds });
  const hasValidInvite = isInviteUsable(invite, now);

  if (!activeAccess && !hasValidInvite) {
    if (invite && invite.status !== 'active') {
      return { success: false, code: 403, error_code: 'INVITE_UNAVAILABLE', message: '行程链接已失效' };
    }
    if (invite && toTime(invite.expires_at) && toTime(invite.expires_at) < now.getTime()) {
      return { success: false, code: 403, error_code: 'INVITE_UNAVAILABLE', message: '行程链接已失效' };
    }
    return { success: false, code: 403, error_code: 'INVALID_INVITE', message: '行程链接无效' };
  }

  if (!hasPublishedSnapshot(trip)) {
    await writeAuditLog({
      actor_openid: OPENID,
      actor_user_id: user ? user._id : '',
      actor_role: user ? (user.role || '') : 'temporary_guest',
      action: 'customer_trip_waiting_viewed',
      target_type: 'customer_trip',
      target_id: trip._id || tripId,
      detail: {
        trip_id: tripId,
        access_source: activeAccess ? 'customer_trip_access' : 'temporary_invite',
        invite_id: invite ? invite._id : '',
      },
      created_at: nowIso,
    });
    return {
      success: true,
      code: 0,
      trip_id: tripId,
      waiting: true,
      access_source: activeAccess ? 'customer_trip_access' : 'temporary_invite',
      auto_saved: false,
      already_saved: Boolean(activeAccess),
      can_save_to_profile: false,
      message: 'Farland 顾问正在为您核对行程安排，确认后将在这里显示。',
    };
  }

  const alreadySaved = Boolean(activeAccess);
  const accessSource = activeAccess ? 'customer_trip_access' : 'temporary_invite';

  await writeAuditLog({
    actor_openid: OPENID,
    actor_user_id: user ? user._id : '',
    actor_role: user ? (user.role || '') : 'temporary_guest',
    action: 'customer_trip_invite_opened',
    target_type: 'customer_trip',
    target_id: trip._id || tripId,
    detail: {
      trip_id: tripId,
      invite_id: invite ? invite._id : '',
      access_source: accessSource,
      auto_saved: false,
      already_saved: alreadySaved,
    },
    created_at: nowIso,
  });

  return {
    success: true,
    code: 0,
    trip_id: tripId,
    waiting: false,
    access_source: accessSource,
    auto_saved: false,
    already_saved: alreadySaved,
    can_save_to_profile: Boolean(hasValidInvite && !alreadySaved && !blockedRole),
    trip: applyAssignedCharterTransport(
      normalizePublishedSnapshot(trip.published_snapshot),
      await findAssignedCharterTransports(tripIds),
    ),
  };
};
