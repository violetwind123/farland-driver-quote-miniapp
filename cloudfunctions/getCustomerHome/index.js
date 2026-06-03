const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function formatMoney(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
}

function toTime(value) {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function normalizeBindMode(access) {
  if (!access) return 'trip_only';
  if (access.bind_mode === 'farland_profile' || access.access_type === 'profile') return 'farland_profile';
  if (access.bind_mode === 'trip_only' || access.access_type === 'trip_only') return 'trip_only';
  return 'trip_only';
}

function normalizeInviteBindMode(invite) {
  if (!invite) return 'trip_only';
  if (invite.claimed_bind_mode === 'farland_profile' || invite.bind_mode === 'farland_profile' || invite.bind_type === 'profile') {
    return 'farland_profile';
  }
  if (invite.claimed_bind_mode === 'trip_only' || invite.bind_mode === 'trip_only' || invite.bind_type === 'trip_only') {
    return 'trip_only';
  }
  return 'trip_only';
}

function isExpiredAccess(access, now) {
  if (!access || access.status !== 'active') return false;
  if (normalizeBindMode(access) !== 'trip_only') return false;
  const visibleUntil = toTime(access.visible_until);
  return Boolean(visibleUntil && visibleUntil < now.getTime());
}

function isVisibleAccess(access, now) {
  if (!access || access.status !== 'active') return false;
  const bindMode = normalizeBindMode(access);
  if (bindMode === 'farland_profile') return true;
  const visibleUntil = toTime(access.visible_until);
  if (!visibleUntil) {
    // TODO(P2 migration): trip_only should always have visible_until after claimCustomerInvite is fully deployed.
    return true;
  }
  return visibleUntil >= now.getTime();
}

function hasData(value) {
  if (!value) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function sanitizeCustomerObject(value) {
  const blockedKeys = new Set([
    'driver_quotes',
    'driver_cost',
    'margin',
    'internal_note',
    'internal_notes',
    'operator_internal_note',
    'supplier_note',
    'supplier_notes',
    'supplier_private_note',
    'supplier_private_notes',
    'raw_quote_pool',
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
    'cost',
    'openid',
    'customer_openid',
    'customer_user_id',
    'user_id',
  ]);
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeCustomerObject(item));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.keys(value).reduce((acc, key) => {
    if (!blockedKeys.has(key)) {
      acc[key] = sanitizeCustomerObject(value[key]);
    }
    return acc;
  }, {});
}

function emptyHome(user) {
  const hasCustomerProfile = Boolean(user && user.role === 'customer' && user.status === 'active');
  return {
    success: true,
    access_status: 'empty',
    bind_mode: hasCustomerProfile ? 'farland_profile' : '',
    profile: {
      name: user && user.name ? user.name : '欢迎使用 Farland',
      member_level: hasCustomerProfile ? 'Farland Signature' : '',
      points_balance: 0,
      subtitle: '请通过 Farland 顾问发送的行程卡片查看您的专属安排',
    },
    today_card: null,
    today_itinerary: null,
    trip_overview: [],
    daily_summary_cards: [],
    itinerary_days: [],
    flight_cards: [],
    transportation_appointments: [],
    charter_services: [],
    transfer_requests: [],
    transport_orders: [],
    hotel_requests: [],
    benefits: [],
  };
}

function buildMockTodayCard() {
  return {
    trip_id: 'trip_2026xbc091',
    trip_no: '2026XBC091',
    day_id: '2026XBC091_2026-06-05',
    day_no: 1,
    date: '2026-06-05',
    weekday: 'Fri',
    timezone: 'America/New_York',
    city_summary: 'Boston → Amherst → Providence',
    title: 'Day 1: Boston, Amherst, Providence',
    status: 'driver_pending',
    status_text: '顾问已确认',
    last_updated_at: '2026-05-26T12:00:00-04:00',
    change_summary: '',
    service_type: 'charter',
    service_summary: '今日包车服务',
    service_window: {
      start_time: '08:10',
      end_time: '',
      label: '08:10 出发',
    },
    depart_time: '08:10',
    vehicle_summary: 'Toyota Sienna 或同级',
    party_summary: '6人 · 3件行李',
    advisor: {
      name: 'Farland Advisor',
      phone: '',
      contact_label: '联系顾问',
    },
    driver_visibility: 'pending',
    driver: null,
    timeline_items: [
      {
        time: '08:10',
        title: 'Depart Boston',
        location: 'Boston',
        route: 'Boston → Amherst',
        drive_time: '',
        traffic_level: 'Good',
        note: '',
      },
      {
        time: '10:00',
        title: 'Amherst College',
        location: 'Amherst College',
        route: '',
        drive_time: '',
        traffic_level: '',
        note: '',
      },
      {
        time: '13:40',
        title: 'Arrive at hotel',
        location: 'Renaissance Providence Downtown Hotel',
        route: 'Amherst → Providence',
        drive_time: '',
        traffic_level: '',
        note: '',
      },
    ],
    destination_cards: [
      {
        card_id: '091_day1_depart_boston',
        type: 'departure',
        sequence: 1,
        time: '08:10',
        title: 'Depart Boston',
        location: 'Boston',
        route: 'Boston → Amherst College',
        drive_time: '1h 40m',
        distance: '92.8 mi',
        traffic_level: 'Good',
        segment_status: 'upcoming',
        note: 'Depart for Amherst College',
        next_stop: 'Amherst College',
      },
      {
        card_id: '091_day1_amherst_college',
        type: 'school_visit',
        sequence: 2,
        time: '10:00',
        arrival_estimate: '09:50',
        title: 'Amherst College',
        location: 'Amherst College',
        route: 'Boston → Amherst College',
        drive_time: '1h 40m',
        distance: '92.8 mi',
        traffic_level: 'Good',
        segment_status: 'upcoming',
        note: 'Campus visit',
        next_stop: 'Renaissance Providence Downtown Hotel',
      },
      {
        card_id: '091_day1_hotel',
        type: 'hotel_arrival',
        sequence: 3,
        time: '13:40',
        title: 'Renaissance Providence Downtown Hotel',
        location: 'Renaissance Providence Downtown Hotel',
        route: 'Amherst College → Providence',
        drive_time: '1h 40m',
        distance: '86.4 mi',
        traffic_level: 'Good',
        segment_status: 'upcoming',
        note: 'Today’s hotel / end point',
        next_stop: '',
      },
    ],
    transport_summary: {
      type: 'charter',
      title: '今日包车服务',
      status_text: '车辆已确认，司机信息待同步',
      action_label: '查看用车安排',
    },
    hotel: {
      name: 'Renaissance Providence Downtown Hotel',
      arrival_time: '13:40',
      address: '',
    },
    next_day_teaser: 'Tomorrow: Brown University + Yale University',
    documents: [],
    actions: [
      { type: 'contact_advisor', label: 'Contact advisor' },
      { type: 'view_full_trip', label: 'View full trip' },
    ],
  };
}

function buildMockProgressStrip() {
  return {
    current_node_id: 'amherst',
    nodes: [
      { node_id: 'arrival', type: 'flight_arrival', label: 'Arrival', status: 'completed' },
      { node_id: 'boston', type: 'center_city', label: 'Boston', status: 'completed' },
      { node_id: 'amherst', type: 'center_city', label: 'Amherst', status: 'current' },
      { node_id: 'providence', type: 'center_city', label: 'Providence', status: 'upcoming' },
      { node_id: 'new_haven', type: 'center_city', label: 'New Haven', status: 'upcoming' },
      { node_id: 'new_york', type: 'center_city', label: 'New York', status: 'upcoming' },
      { node_id: 'philadelphia', type: 'center_city', label: 'Philadelphia', status: 'upcoming' },
      { node_id: 'dc', type: 'center_city', label: 'DC', status: 'upcoming' },
      { node_id: 'return', type: 'flight_departure', label: 'Return', status: 'upcoming' },
    ],
  };
}

function statusClass(status, hasQuotes) {
  if (status === 'cancelled') return 'cancelled';
  if (status === 'assigned' || status === 'confirmed') return 'confirmed';
  if (hasQuotes) return 'quoted';
  return 'pending';
}

function statusText(status, hasQuotes) {
  if (status === 'cancelled') return '用车需求已取消';
  if (status === 'assigned' || status === 'confirmed') return '接送已预约';
  if (hasQuotes) return '已收到优选用车方案';
  return 'Farland 正在为您确认用车方案';
}

function toAssignedTransport(order) {
  if (!order) return null;
  const driver = order.driver || {};
  return {
    driver_name: order.driver_name || driver.display_name || driver.name || '',
    driver_phone: order.driver_phone || driver.phone || '',
    vehicle_type: order.vehicle_type || order.vehicle_class || driver.vehicle_type || '',
    vehicle_model: order.vehicle_model || driver.vehicle_model || '',
    seats: order.seats || driver.seats || 0,
    luggage_capacity: order.luggage_capacity || driver.luggage_capacity || 0,
    plate_number: order.plate_number || driver.plate_number || '',
    meeting_point: order.meeting_point || driver.meeting_point || '',
  };
}

function toAssignedTransportFromDriverVehicle(driver, vehicle) {
  if (!driver && !vehicle) return null;
  return {
    driver_name: driver ? (driver.display_name || driver.name || '') : '',
    driver_phone: driver ? (driver.phone || '') : '',
    vehicle_type: vehicle ? (vehicle.vehicle_type || vehicle.vehicle_class || '') : '',
    vehicle_model: vehicle ? (vehicle.vehicle_model || '') : '',
    seats: vehicle ? (vehicle.seats || 0) : 0,
    luggage_capacity: vehicle ? (vehicle.luggage_capacity || 0) : 0,
    plate_number: vehicle ? (vehicle.plate_number || '') : '',
    meeting_point: vehicle ? (vehicle.meeting_point || '') : '',
  };
}

function hasAssignedTransportDetails(transport) {
  if (!transport) return false;
  return Boolean(
    transport.driver_name
    || transport.driver_phone
    || transport.vehicle_type
    || transport.vehicle_model
    || transport.plate_number,
  );
}

function hasCompleteAssignedTransport(transport) {
  if (!transport) return false;
  return Boolean(
    (transport.driver_name || transport.driver_phone)
    && (transport.vehicle_model || transport.vehicle_type),
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
    seats: base.seats || fill.seats || 0,
    luggage_capacity: base.luggage_capacity || fill.luggage_capacity || 0,
    plate_number: base.plate_number || fill.plate_number || '',
    meeting_point: base.meeting_point || fill.meeting_point || '',
  };
}

function errorDetail(error) {
  if (!error) return {};
  return {
    message: error.message || '',
    errMsg: error.errMsg || '',
    code: error.code || '',
  };
}

async function writeAuditLog(data) {
  return db.collection('audit_logs').add({
    data: {
      ...data,
      created_at: data.created_at || new Date().toISOString(),
    },
  }).catch(() => null);
}

async function getAssignedTransportSnapshot(requestId, auditContext = {}) {
  let primaryTransport = null;
  let readError = null;

  try {
    const orderDoc = await db.collection('transport_orders').doc(requestId).get();
    const order = orderDoc && orderDoc.data;
    primaryTransport = toAssignedTransport(order && ['assigned', 'confirmed'].includes(order.order_status) ? order : null);
    if (hasCompleteAssignedTransport(primaryTransport)) {
      return { transport: primaryTransport, source: 'transport_orders' };
    }
  } catch (error) {
    readError = error;
    await writeAuditLog({
      actor_openid: auditContext.openid || '',
      actor_user_id: auditContext.user_id || '',
      actor_role: auditContext.role || 'customer',
      action: 'transport_orders_read_failed',
      target_type: 'ride_request',
      target_id: requestId,
      related_request_id: requestId,
      detail: {
        read_mode: 'doc',
        error: errorDetail(error),
      },
      created_at: auditContext.now || new Date().toISOString(),
    });
  }

  try {
    const orderRes = await db.collection('transport_orders')
      .where({ request_id: requestId, order_status: _.in(['assigned', 'confirmed']) })
      .orderBy('updated_at', 'desc')
      .limit(1)
      .get();
    const legacyTransport = toAssignedTransport(orderRes.data[0]);
    if (hasCompleteAssignedTransport(legacyTransport)) {
      return { transport: legacyTransport, source: 'transport_orders' };
    }
    primaryTransport = mergeAssignedTransport(primaryTransport, legacyTransport);
  } catch (error) {
    readError = error;
    await writeAuditLog({
      actor_openid: auditContext.openid || '',
      actor_user_id: auditContext.user_id || '',
      actor_role: auditContext.role || 'customer',
      action: 'transport_orders_read_failed',
      target_type: 'ride_request',
      target_id: requestId,
      related_request_id: requestId,
      detail: {
        read_mode: 'legacy_query',
        error: errorDetail(error),
      },
      created_at: auditContext.now || new Date().toISOString(),
    });
  }

  if (!readError && !hasAssignedTransportDetails(primaryTransport)) {
    await writeAuditLog({
      actor_openid: auditContext.openid || '',
      actor_user_id: auditContext.user_id || '',
      actor_role: auditContext.role || 'customer',
      action: 'transport_orders_missing_for_assigned_request',
      target_type: 'ride_request',
      target_id: requestId,
      related_request_id: requestId,
      detail: { request_status: auditContext.request_status || '' },
      created_at: auditContext.now || new Date().toISOString(),
    });
  }

  return {
    transport: hasAssignedTransportDetails(primaryTransport) ? primaryTransport : null,
    source: hasAssignedTransportDetails(primaryTransport) ? 'transport_orders' : 'none',
  };
}

async function getAssignedTransportFallback(request, auditContext = {}) {
  if (!request || !request.selected_driver_id) return null;
  const driverRes = await db.collection('drivers').doc(request.selected_driver_id).get().catch((error) => {
    writeAuditLog({
      actor_openid: auditContext.openid || '',
      actor_user_id: auditContext.user_id || '',
      actor_role: auditContext.role || 'customer',
      action: 'assigned_driver_fallback_read_failed',
      target_type: 'ride_request',
      target_id: request._id || '',
      related_request_id: request._id || '',
      detail: { collection: 'drivers', error: errorDetail(error) },
      created_at: auditContext.now || new Date().toISOString(),
    });
    return null;
  });
  const driver = driverRes && driverRes.data ? driverRes.data : null;
  const vehicleId = request.selected_vehicle_id || (driver && driver.default_vehicle_id) || '';
  let vehicle = null;
  if (vehicleId) {
    const vehicleRes = await db.collection('vehicles').doc(vehicleId).get().catch((error) => {
      writeAuditLog({
        actor_openid: auditContext.openid || '',
        actor_user_id: auditContext.user_id || '',
        actor_role: auditContext.role || 'customer',
        action: 'assigned_driver_fallback_read_failed',
        target_type: 'ride_request',
        target_id: request._id || '',
        related_request_id: request._id || '',
        detail: { collection: 'vehicles', error: errorDetail(error) },
        created_at: auditContext.now || new Date().toISOString(),
      });
      return null;
    });
    vehicle = vehicleRes && vehicleRes.data ? vehicleRes.data : null;
  }
  return toAssignedTransportFromDriverVehicle(driver, vehicle);
}

function toTransferRequest(request, quotes, assignedTransport = null, assignedTransportSource = 'none') {
  const hasQuotes = quotes.length > 0;
  return {
    request_id: request._id,
    service_type: request.service_type || 'transfer',
    title: request.request_no ? `用车方案 ${request.request_no}` : 'Farland 用车方案',
    created_by_text: request.customer_name ? `${request.customer_name} 的用车需求` : '由 Farland 顾问为您安排',
    pickup: request.pickup || request.pickup_location || request.driver_region || '待确认',
    dropoff: request.dropoff || request.dropoff_location || '待确认',
    pickup_time_text: request.pickup_time_text || request.pickup_time || request.service_date || '待确认',
    passengers: request.passengers || request.passenger_count || '-',
    luggage: request.luggage || request.luggage_count || '-',
    status: request.status || '',
    status_text: statusText(request.status, hasQuotes),
    ops_status_text: hasQuotes ? 'Farland 已为您筛选优选用车方案。' : 'Farland 正在为您确认用车方案。',
    quoteCount: quotes.length,
    statusClass: statusClass(request.status, hasQuotes),
    quotes,
    assigned_transport: assignedTransport,
    assigned_transport_source: assignedTransportSource,
    cancel_reason_driver: request.cancel_reason_driver || '',
  };
}

function toDriverDisplay(assignedTransport) {
  if (!hasAssignedTransportDetails(assignedTransport)) return null;
  return {
    name: assignedTransport.driver_name || '',
    phone: assignedTransport.driver_phone || '',
    vehicle_type: assignedTransport.vehicle_type || '',
    vehicle_model: assignedTransport.vehicle_model || assignedTransport.vehicle_type || '',
    seats: assignedTransport.seats || 0,
    luggage_capacity: assignedTransport.luggage_capacity || 0,
    plate_number: assignedTransport.plate_number || '',
    meeting_point: assignedTransport.meeting_point || '',
  };
}

function partySummaryFromTransfer(transfer) {
  const passengers = transfer.passengers && transfer.passengers !== '-' ? `${transfer.passengers}人` : '';
  const luggage = transfer.luggage && transfer.luggage !== '-' ? `${transfer.luggage}件行李` : '';
  return [passengers, luggage].filter(Boolean).join(' · ');
}

function applyAssignedTransportToTodayCard(card, transfer) {
  if (!transfer || !hasAssignedTransportDetails(transfer.assigned_transport)) return card;
  const driver = toDriverDisplay(transfer.assigned_transport);
  const isCharter = transfer.service_type === 'charter';
  const serviceTitle = isCharter ? '今日包车服务' : '今日接送安排';
  const vehicleSummary = driver.vehicle_model || driver.vehicle_type || card.vehicle_summary;
  const serviceWindowLabel = transfer.pickup_time_text && transfer.pickup_time_text !== '待确认'
    ? `${transfer.pickup_time_text} 出发`
    : ((card.service_window && card.service_window.label) || card.depart_time || '');
  return {
    ...card,
    status: 'driver_assigned',
    status_text: '已分配司机',
    service_type: isCharter ? 'charter' : 'transfer',
    service_summary: serviceTitle,
    service_window: {
      ...(card.service_window || {}),
      start_time: transfer.pickup_time_text || (card.service_window && card.service_window.start_time) || '',
      label: serviceWindowLabel,
    },
    depart_time: transfer.pickup_time_text || card.depart_time,
    vehicle_summary: vehicleSummary,
    party_summary: partySummaryFromTransfer(transfer) || card.party_summary,
    driver_visibility: 'assigned',
    driver,
    assigned_request_id: transfer.request_id,
    assigned_transport: transfer.assigned_transport,
    assigned_transport_source: transfer.assigned_transport_source || 'none',
    transport_summary: {
      ...(card.transport_summary || {}),
      type: isCharter ? 'charter' : 'transfer',
      title: serviceTitle,
      status_text: '已分配司机',
      action_label: isCharter ? '查看用车安排' : '查看接送详情',
    },
  };
}

function toTransportOrderSummary(transfer) {
  if (!transfer || !hasAssignedTransportDetails(transfer.assigned_transport)) return null;
  const driver = toDriverDisplay(transfer.assigned_transport);
  return {
    order_id: `${transfer.request_id}-assigned`,
    request_id: transfer.request_id,
    title: transfer.service_type === 'charter' ? '今日包车服务' : '今日接送安排',
    status_text: '已分配司机',
    order_status: 'assigned',
    pickup: transfer.pickup || '',
    dropoff: transfer.dropoff || '',
    pickup_time_text: transfer.pickup_time_text || '',
    vehicle_class: driver.vehicle_model || driver.vehicle_type || '',
    assigned_transport_source: transfer.assigned_transport_source || 'none',
    driver,
  };
}

function toClientQuote(quote) {
  return {
    quote_id: quote._id,
    public_title: quote.title || 'Farland 用车方案',
    suitable_for: quote.operator_explanation || '',
    vehicle_class: quote.vehicle_type_snapshot || '',
    capacity_text: `${quote.seats_snapshot || '-'} 人 / ${quote.luggage_capacity_snapshot || '-'} 件行李`,
    driver_profile_teaser: quote.driver_profile_teaser || '由 Farland 严选车队提供',
    includes: quote.included_items || [],
    excludes: quote.excluded_items || [],
    valid_until_text: quote.valid_until || '',
    driver_quote_amount: formatMoney(quote.driver_quote_amount),
    farland_service_fee_rate: quote.farland_service_fee_rate || 0.1,
    farland_service_fee_amount: formatMoney(quote.farland_service_fee_amount),
    client_visible_total: formatMoney(quote.client_total),
    currency: quote.currency || 'USD',
    is_recommended: Boolean(quote.is_recommended),
    status: quote.quote_status,
  };
}

function normalizeTripOverview(trips) {
  return trips.map((trip, index) => ({
    day: index + 1,
    date: trip.start_at || trip.date_start || '',
    city: trip.city || '',
    title: trip.title || 'Farland 行程',
    status: trip.status === 'active' ? 'confirmed' : (trip.status || 'pending'),
    summary: trip.summary || '',
  }));
}

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
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

function parseFlightRoute(value) {
  const text = safeString(value);
  const match = text.match(/\b([A-Z]{3})\s*(?:->|→|-)\s*([A-Z]{3})\b/);
  return match ? { from: match[1], to: match[2] } : {};
}

function normalizeSnapshotTimelineItem(item, index) {
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

function normalizeSnapshotDayHotel(hotel, day, index) {
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

function normalizeSnapshotDay(day, index) {
  const timelineSource = Array.isArray(day.timeline_items)
    ? day.timeline_items
    : (Array.isArray(day.items) ? day.items : []);
  const timelineItems = timelineSource.map(normalizeSnapshotTimelineItem);
  const hotelItem = timelineItems.find((item) => {
    const type = item.item_type || item.type || '';
    return type === 'hotel' || /酒店|hotel/i.test(item.title || '');
  });
  const hotel = normalizeSnapshotDayHotel(day.hotel, day, index)
    || (hotelItem ? normalizeSnapshotDayHotel({
      hotel_id: hotelItem.linked_entity_id || hotelItem.item_id,
      name: hotelItem.title,
      address: hotelItem.address || hotelItem.location_name,
      arrival_time: hotelItem.time || hotelItem.planned_arrival_time,
      customer_note: hotelItem.customer_note,
    }, day, index) : null);
  const displayedRaw = firstText([day.displayed_start_time_raw, day.displayed_start_time, day.start_time]);
  const estimatedRaw = firstText([day.estimated_departure_time_raw, day.estimated_departure_time, day.depart_time]);
  const startTimeText = firstText([day.start_time_text, day.estimated_departure_time, day.estimated_departure_time_raw, day.displayed_start_time, day.displayed_start_time_raw, day.start_time]);
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

function normalizeSnapshotHotel(hotel, index) {
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

function upsertSnapshotHotelCard(map, card) {
  if (!card || (!card.name && !card.address)) return;
  const key = [
    card.name || card.hotel_name || '',
    card.check_in_date || card.date || '',
    card.linked_day_no || '',
  ].join('|');
  map.set(key, {
    ...(map.get(key) || {}),
    ...card,
    id: card.id || card.hotel_id || makeId('hotel', key, map.size),
  });
}

function deriveSnapshotHotelCards(snapshot) {
  const cards = new Map();
  const days = Array.isArray(snapshot.itinerary_days) ? snapshot.itinerary_days : [];
  days.forEach((day, index) => {
    if (!day.hotel) return;
    upsertSnapshotHotelCard(cards, normalizeSnapshotHotel({
      ...day.hotel,
      linked_day_no: day.hotel.linked_day_no || day.day_no || index + 1,
      check_in_date: day.hotel.check_in_date || day.hotel.date || day.date || '',
    }, cards.size));
  });
  [
    ...(Array.isArray(snapshot.hotel_cards) ? snapshot.hotel_cards : []),
    ...(Array.isArray(snapshot.hotels) ? snapshot.hotels : []),
    ...(Array.isArray(snapshot.hotel_requests) ? snapshot.hotel_requests : []),
  ].forEach((hotel) => upsertSnapshotHotelCard(cards, normalizeSnapshotHotel(hotel, cards.size)));
  return Array.from(cards.values()).sort((a, b) => Number(a.linked_day_no || 0) - Number(b.linked_day_no || 0));
}

function normalizeSnapshotFlight(flight, index, dayNo = 0) {
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

function deriveSnapshotFlightCards(snapshot) {
  const cards = [];
  [
    ...(Array.isArray(snapshot.flight_cards) ? snapshot.flight_cards : []),
    ...(Array.isArray(snapshot.flights) ? snapshot.flights : []),
  ].forEach((flight) => {
    const card = normalizeSnapshotFlight(flight, cards.length, flight.day_no || 0);
    if (card) cards.push(card);
  });
  (Array.isArray(snapshot.itinerary_days) ? snapshot.itinerary_days : []).forEach((day) => {
    (day.timeline_items || []).forEach((item) => {
      const itemType = item.item_type || item.type || '';
      const title = safeString(item.title);
      const route = safeString(item.route || `${item.from || ''} → ${item.to || ''}`);
      if (itemType !== 'flight' && !item.flight_no && !item.flight_number && !/\b[A-Z]{2}\d{2,4}\b/.test(title) && !/\b[A-Z]{3}\s*(?:->|→|-)\s*[A-Z]{3}\b/.test(route || title)) return;
      const card = normalizeSnapshotFlight({ ...item, route: item.route || title }, cards.length, day.day_no);
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

function snapshotTransportBadge(transportSummary) {
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

function deriveSnapshotDailyCards(snapshot, hotelCards) {
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
      transport_badge: snapshotTransportBadge(day.transport_summary),
      highlight_items: highlights,
      item_count: (day.timeline_items || []).length,
      clickable: true,
    });
  });
}

function buildSnapshotTripSummary(snapshot, hotelCards, flightCards) {
  const days = Array.isArray(snapshot.itinerary_days) ? snapshot.itinerary_days : [];
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

function normalizePublishedTripSnapshot(trip) {
  if (!trip || trip.visibility_status !== 'published' || !trip.published_snapshot || !Object.keys(trip.published_snapshot).length) return null;
  const snapshot = sanitizeCustomerObject(trip.published_snapshot || {});
  const days = Array.isArray(snapshot.itinerary_days)
    ? snapshot.itinerary_days.map(normalizeSnapshotDay)
    : [];
  const normalized = {
    ...snapshot,
    itinerary_days: days,
  };
  const hotelCards = Array.isArray(snapshot.hotel_cards) && snapshot.hotel_cards.length
    ? snapshot.hotel_cards.map((hotel, index) => normalizeSnapshotHotel(hotel, index)).filter(Boolean)
    : deriveSnapshotHotelCards(normalized);
  const flightCards = Array.isArray(snapshot.flight_cards) && snapshot.flight_cards.length
    ? snapshot.flight_cards.map((flight, index) => normalizeSnapshotFlight(flight, index)).filter(Boolean)
    : deriveSnapshotFlightCards(normalized);
  const dailyCards = Array.isArray(snapshot.daily_summary_cards) && snapshot.daily_summary_cards.length
    ? snapshot.daily_summary_cards
    : deriveSnapshotDailyCards(normalized, hotelCards);
  const tripSummary = snapshot.trip_summary || buildSnapshotTripSummary(normalized, hotelCards, flightCards);
  return sanitizeCustomerObject({
    ...normalized,
    snapshot_model_version: 2,
    trip_summary: tripSummary,
    daily_summary_cards: dailyCards,
    hotel_cards: hotelCards,
    flight_cards: flightCards,
    hotels: hotelCards,
  });
}

function buildWaitingTripOverview(trips) {
  return trips.map((trip) => ({
    trip_id: trip.trip_id || trip.external_trip_id || trip._id || '',
    trip_no: trip.trip_no || trip.external_trip_id || trip.trip_id || '',
    title: trip.title || 'Farland 行程',
    status_text: '待发布',
    waiting_message: 'Farland 顾问正在为您核对行程安排，确认后将在这里显示。',
  }));
}

function collectTripData(trips) {
  const snapshots = trips.map(normalizePublishedTripSnapshot).filter(Boolean);
  const firstSnapshot = snapshots[0] || null;
  const firstTrip = trips[0] || null;
  const daily = snapshots.reduce((acc, snapshot) => acc.concat(snapshot.itinerary_days || []), []);
  const dailySummaryCards = snapshots.reduce((acc, snapshot) => acc.concat(snapshot.daily_summary_cards || []), []);
  const hotelRequests = snapshots.reduce((acc, snapshot) => acc.concat(snapshot.hotel_cards || []), []);
  const flightCards = snapshots.reduce((acc, snapshot) => acc.concat(snapshot.flight_cards || []), []);
  const transferRequests = snapshots.reduce((acc, snapshot) => acc.concat(snapshot.transfers || []), []);
  const charterServices = snapshots.reduce((acc, snapshot) => acc.concat(snapshot.charter_services || []), []);
  const benefits = snapshots.reduce((acc, snapshot) => acc.concat(snapshot.benefits || []), []);
  return {
    today_itinerary: daily[0] || null,
    itinerary_days: daily,
    daily_summary_cards: dailySummaryCards,
    trip_overview: snapshots.length
      ? snapshots.map((snapshot) => snapshot.trip_summary || buildSnapshotTripSummary(snapshot, snapshot.hotel_cards || [], snapshot.flight_cards || []))
      : buildWaitingTripOverview(trips),
    hotel_requests: hotelRequests,
    flight_cards: flightCards,
    transfer_requests: transferRequests,
    charter_services: charterServices,
    benefits,
    advisor: firstSnapshot && firstSnapshot.advisor ? firstSnapshot.advisor : (firstTrip && firstTrip.advisor ? firstTrip.advisor : null),
    has_published_trip: Boolean(snapshots.length),
  };
}

async function findCustomerTripAccess({ openid, userId }) {
  const queries = [
    db.collection('customer_trip_access').where({ openid }).limit(50).get().catch(() => ({ data: [] })),
    db.collection('customer_trip_access').where({ customer_openid: openid }).limit(50).get().catch(() => ({ data: [] })),
  ];
  if (userId) {
    queries.push(
      db.collection('customer_trip_access').where({ user_id: userId }).limit(50).get().catch(() => ({ data: [] })),
      db.collection('customer_trip_access').where({ customer_user_id: userId }).limit(50).get().catch(() => ({ data: [] })),
    );
  }
  const results = await Promise.all(queries);
  const seen = {};
  return results.flatMap((res) => res.data || []).filter((access) => {
    const key = access._id || `${access.openid || access.customer_openid}-${access.request_id}-${access.trip_id}`;
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

async function getCustomerTripsByIds(tripIds) {
  if (!tripIds.length) return [];
  const [byIdRes, byTripIdRes] = await Promise.all([
    db.collection('customer_trips')
      .where({ _id: _.in(tripIds), status: _.in(['active', 'completed']) })
      .limit(20)
      .get()
      .catch(() => ({ data: [] })),
    db.collection('customer_trips')
      .where({ trip_id: _.in(tripIds), status: _.in(['active', 'completed']) })
      .limit(20)
      .get()
      .catch(() => ({ data: [] })),
  ]);
  const seen = {};
  return [...(byIdRes.data || []), ...(byTripIdRes.data || [])].filter((trip) => {
    const key = trip._id || trip.trip_id;
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { success: false, code: 401, error_code: 'UNAUTHENTICATED', message: '无法识别用户身份' };
  }

  const userRes = await db.collection('users').where({ openid: OPENID }).limit(1).get().catch(() => ({ data: [] }));
  const user = userRes.data[0] || null;

  const [accessRes, inviteRes, directRequestRes] = await Promise.all([
    findCustomerTripAccess({ openid: OPENID, userId: user ? user._id : '' }).then((data) => ({ data })),
    db.collection('customer_invites').where({ claimed_openid: OPENID, status: 'claimed' }).limit(20).get().catch(() => ({ data: [] })),
    db.collection('ride_requests').where({ customer_openid: OPENID }).limit(20).get().catch(() => ({ data: [] })),
  ]);

  const now = new Date();
  const allAccess = accessRes.data || [];
  const allAccessRequestIds = new Set(allAccess.map((access) => access.request_id).filter(Boolean));
  const activeAccess = allAccess.filter((access) => isVisibleAccess(access, now));
  const expiredAccess = allAccess.filter((access) => isExpiredAccess(access, now));
  await Promise.all(expiredAccess.map((access) => {
    return db.collection('customer_trip_access').doc(access._id).update({
      data: {
        status: 'expired',
        updated_at: now.toISOString(),
      },
    }).catch(() => null);
  }));

  const invites = inviteRes.data || [];
  const directRequests = directRequestRes.data || [];
  const hasProfile = Boolean(user && user.role === 'customer' && user.status === 'active')
    || activeAccess.some((access) => normalizeBindMode(access) === 'farland_profile')
    || invites.some((invite) => normalizeInviteBindMode(invite) === 'farland_profile');
  const tripOnlyRequestIds = invites
    .filter((invite) => normalizeInviteBindMode(invite) === 'trip_only' && !allAccessRequestIds.has(invite.request_id))
    .map((invite) => invite.request_id);
  const accessRequestIds = activeAccess.map((access) => access.request_id);
  const profileRequestIds = hasProfile
    ? directRequests.filter((request) => !allAccessRequestIds.has(request._id)).map((request) => request._id)
    : [];
  const visibleRequestIds = unique([...accessRequestIds, ...profileRequestIds, ...tripOnlyRequestIds]);
  const visibleTripIds = unique(activeAccess.map((access) => access.trip_id));

  if (!visibleRequestIds.length && !visibleTripIds.length) {
    return emptyHome(user);
  }

  let customerTrips = [];
  if (visibleTripIds.length) {
    customerTrips = await getCustomerTripsByIds(visibleTripIds);
  }

  const requestMap = new Map(directRequests.map((request) => [request._id, request]));
  const missingIds = visibleRequestIds.filter((id) => !requestMap.has(id));
  if (missingIds.length) {
    const missingRes = await db.collection('ride_requests')
      .where({ _id: _.in(missingIds) })
      .limit(20)
      .get()
      .catch(() => ({ data: [] }));
    (missingRes.data || []).forEach((request) => requestMap.set(request._id, request));
  }

  const requests = visibleRequestIds.map((id) => requestMap.get(id)).filter(Boolean);
  const quoteRes = visibleRequestIds.length
    ? await db.collection('customer_transport_quotes')
      .where({ request_id: _.in(visibleRequestIds), quote_status: _.in(['published', 'viewed', 'selected', 'confirmed']) })
      .orderBy('is_recommended', 'desc')
      .orderBy('updated_at', 'desc')
      .limit(60)
      .get()
      .catch(() => ({ data: [] }))
    : { data: [] };
  const quotesByRequest = (quoteRes.data || []).reduce((acc, quote) => {
    if (!acc[quote.request_id]) acc[quote.request_id] = [];
    if (acc[quote.request_id].length < 3) acc[quote.request_id].push(toClientQuote(quote));
    return acc;
  }, {});
  const assignedRequestIds = requests
    .filter((request) => request.status === 'assigned' || request.status === 'confirmed')
    .map((request) => request._id);
  const requestById = requests.reduce((acc, request) => {
    acc[request._id] = request;
    return acc;
  }, {});
  const assignedTransportByRequest = {};
  const assignedTransportSourceByRequest = {};
  await Promise.all(assignedRequestIds.map(async (requestId) => {
    const request = requestById[requestId];
    const snapshotResult = await getAssignedTransportSnapshot(requestId, {
      openid: OPENID,
      user_id: user ? user._id : '',
      role: user ? user.role : 'customer',
      request_status: request ? request.status : '',
      now: now.toISOString(),
    });
    let assignedTransport = snapshotResult.transport;
    let assignedTransportSource = hasCompleteAssignedTransport(assignedTransport)
      ? snapshotResult.source
      : 'none';
    const fallback = hasCompleteAssignedTransport(assignedTransport)
      ? null
      : await getAssignedTransportFallback(requestById[requestId], {
        openid: OPENID,
        user_id: user ? user._id : '',
        role: user ? user.role : 'customer',
        now: now.toISOString(),
      });
    const merged = mergeAssignedTransport(assignedTransport, fallback);
    if (hasAssignedTransportDetails(merged)) {
      assignedTransportByRequest[requestId] = merged;
      if (hasCompleteAssignedTransport(assignedTransport)) {
        assignedTransportSourceByRequest[requestId] = assignedTransportSource;
      } else if (hasAssignedTransportDetails(fallback)) {
        assignedTransportSourceByRequest[requestId] = 'fallback_driver_vehicle';
      } else {
        assignedTransportSourceByRequest[requestId] = snapshotResult.source;
      }
    } else {
      assignedTransportSourceByRequest[requestId] = 'none';
    }
  }));
  const missingAssignedRequestIds = assignedRequestIds.filter((requestId) => !hasAssignedTransportDetails(assignedTransportByRequest[requestId]));
  if (missingAssignedRequestIds.length && assignedRequestIds.length) {
    await writeAuditLog({
      actor_openid: OPENID,
      actor_user_id: user ? user._id : '',
      actor_role: user ? user.role : 'customer',
      action: 'transport_orders_missing_for_assigned_request',
      target_type: 'customer_home',
      target_id: OPENID,
      detail: {
        request_ids: missingAssignedRequestIds,
      },
      created_at: now.toISOString(),
    });
  }

  const transferRequests = requests
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
    .map((request) => toTransferRequest(
      request,
      quotesByRequest[request._id] || [],
      assignedTransportByRequest[request._id] || null,
      assignedTransportSourceByRequest[request._id] || 'none',
    ));
  const snapshotTransferRequests = (tripData.transfer_requests || []).map((request, index) => ({
    ...request,
    request_id: request.request_id || request.transfer_id || request.id || `trip-transfer-${index}`,
    title: request.title || '接送安排',
    created_by_text: request.created_by_text || 'Farland 顾问',
    status_text: request.status_text || '已同步',
    status: request.status || 'confirmed',
    statusClass: request.statusClass || 'confirmed',
    quotes: [],
  }));
  const visibleTransferRequests = [
    ...snapshotTransferRequests,
    ...transferRequests.filter((request) => {
      return !snapshotTransferRequests.some((item) => item.request_id === request.request_id);
    }),
  ];
  const primaryAssignedTransfer = transferRequests.find((request) => {
    return (request.status === 'assigned' || request.status === 'confirmed')
      && hasAssignedTransportDetails(request.assigned_transport);
  });
  const transportOrderSummaries = transferRequests
    .map(toTransportOrderSummary)
    .filter(Boolean);
  const firstInvite = invites[0] || {};
  const firstTrip = customerTrips[0] || {};
  const displayName = (user && user.name)
    || (firstTrip.customer && firstTrip.customer.display_name)
    || firstInvite.display_name
    || firstInvite.customer_name
    || (requests[0] && requests[0].customer_name)
    || 'Farland 客户';
  const tripOnly = activeAccess.length ? !activeAccess.some((access) => normalizeBindMode(access) === 'farland_profile') : !hasProfile;
  const tripData = collectTripData(customerTrips);

  return {
    success: true,
    access_status: tripOnly ? 'trip_only' : 'profile',
    bind_mode: tripOnly ? 'trip_only' : 'farland_profile',
    profile: {
      name: displayName,
      member_level: tripOnly ? '本次行程查看' : 'Farland Signature',
      points_balance: tripOnly ? 0 : 3280,
      subtitle: tripOnly ? 'Farland 顾问已为您同步本次行程与报价' : '您的行程与报价已由 Farland 顾问同步',
    },
    progress_strip: buildMockProgressStrip(),
    today_card: applyAssignedTransportToTodayCard(buildMockTodayCard(), primaryAssignedTransfer),
    today_itinerary: tripData.today_itinerary,
    trip_overview: tripData.trip_overview,
    daily_summary_cards: tripData.daily_summary_cards,
    itinerary_days: tripData.itinerary_days,
    transportation_appointments: [],
    charter_services: tripData.charter_services,
    transfer_requests: visibleTransferRequests,
    transport_orders: transportOrderSummaries,
    hotel_requests: tripData.hotel_requests,
    flight_cards: tripData.flight_cards,
    benefits: tripData.benefits.length ? tripData.benefits : (tripOnly ? [] : [
      {
        title: '机场接送礼遇',
        description: '指定城市机场接送服务可享 Farland 会员权益',
      },
      {
        title: '酒店预订礼遇',
        description: '顾问协助筛选校园周边与高端品牌酒店方案',
      },
    ]),
  };
};
