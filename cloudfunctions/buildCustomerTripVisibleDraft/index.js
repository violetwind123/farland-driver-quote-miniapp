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
    if (!day.hotel && day.item_type === 'hotel') codes.add('missing_hotel');

    const items = Array.isArray(day.timeline_items)
      ? day.timeline_items
      : (Array.isArray(day.items) ? day.items : []);
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

function normalizeDay(day, index) {
  const timelineSource = Array.isArray(day.timeline_items)
    ? day.timeline_items
    : (Array.isArray(day.items) ? day.items : []);
  return sanitizeCustomerObject({
    day_no: day.day_no || index + 1,
    date: day.date || '',
    weekday: day.weekday || '',
    title: day.title || `Day ${day.day_no || index + 1}`,
    city: day.city || '',
    summary: day.summary || '',
    displayed_start_time: day.displayed_start_time || '',
    estimated_departure_time: day.estimated_departure_time || '',
    warning_codes: Array.isArray(day.warning_codes) ? day.warning_codes : [],
    timeline_items: timelineSource.map(normalizeTimelineItem),
    hotel: day.hotel ? sanitizeCustomerObject(day.hotel) : null,
    transport_summary: day.transport_summary ? sanitizeCustomerObject(day.transport_summary) : null,
  });
}

function buildDraftSnapshot(trip) {
  const days = Array.isArray(trip.itinerary_days)
    ? trip.itinerary_days
    : (Array.isArray(trip.daily_itinerary) ? trip.daily_itinerary : []);
  return sanitizeCustomerObject({
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
