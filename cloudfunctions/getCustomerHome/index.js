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
  return {
    success: true,
    access_status: 'empty',
    profile: {
      name: user && user.name ? user.name : '欢迎使用 Farland',
      member_level: '',
      points_balance: 0,
      subtitle: '请通过 Farland 顾问发送的行程卡片查看您的专属安排',
    },
    today_card: null,
    today_itinerary: null,
    trip_overview: [],
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
      start_time: '8:10 AM',
      end_time: '',
      label: '8:10 AM departure',
    },
    depart_time: '8:10 AM',
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
        time: '8:10 AM',
        title: 'Depart Boston',
        location: 'Boston',
        route: 'Boston → Amherst',
        drive_time: '',
        traffic_level: 'Good',
        note: '',
      },
      {
        time: '10:00 AM',
        title: 'Amherst College',
        location: 'Amherst College',
        route: '',
        drive_time: '',
        traffic_level: '',
        note: '',
      },
      {
        time: '1:40 PM',
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
        time: '8:10 AM',
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
        time: '10:00 AM',
        arrival_estimate: '9:50 AM',
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
        time: '1:40 PM',
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
      arrival_time: '1:40 PM',
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

function toTransferRequest(request, quotes, assignedTransport = null) {
  const hasQuotes = quotes.length > 0;
  return {
    request_id: request._id,
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
    cancel_reason_driver: request.cancel_reason_driver || '',
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

function collectTripData(trips) {
  const firstTrip = trips[0] || null;
  const daily = trips.reduce((acc, trip) => acc.concat(sanitizeCustomerObject(trip.itinerary_days || trip.daily_itinerary || [])), []);
  const hotelRequests = trips.reduce((acc, trip) => acc.concat(sanitizeCustomerObject(trip.hotels || trip.hotel_requests || [])), []);
  const charterServices = trips.reduce((acc, trip) => {
    if (Array.isArray(trip.charter_services) && trip.charter_services.length) {
      return acc.concat(sanitizeCustomerObject(trip.charter_services));
    }
    if (hasData(trip.charter)) {
      return acc.concat(sanitizeCustomerObject(Array.isArray(trip.charter) ? trip.charter : [trip.charter]));
    }
    return acc;
  }, []);
  const benefits = trips.reduce((acc, trip) => acc.concat(sanitizeCustomerObject(trip.benefits || [])), []);
  return {
    today_itinerary: daily[0] || null,
    trip_overview: normalizeTripOverview(trips),
    hotel_requests: hotelRequests,
    charter_services: charterServices,
    benefits,
    advisor: firstTrip && firstTrip.advisor ? firstTrip.advisor : null,
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
  let orderRes = { data: [] };
  if (assignedRequestIds.length) {
    try {
      orderRes = await db.collection('transport_orders')
        .where({ request_id: _.in(assignedRequestIds), order_status: _.in(['assigned', 'confirmed']) })
        .orderBy('updated_at', 'desc')
        .limit(50)
        .get();
    } catch (error) {
      await writeAuditLog({
        actor_openid: OPENID,
        actor_user_id: user ? user._id : '',
        actor_role: user ? user.role : 'customer',
        action: 'transport_orders_read_failed',
        target_type: 'customer_home',
        target_id: OPENID,
        detail: {
          request_ids: assignedRequestIds,
          error: errorDetail(error),
        },
        created_at: now.toISOString(),
      });
    }
  }
  const assignedTransportByRequest = (orderRes.data || []).reduce((acc, order) => {
    if (!acc[order.request_id]) acc[order.request_id] = toAssignedTransport(order);
    return acc;
  }, {});
  const requestById = requests.reduce((acc, request) => {
    acc[request._id] = request;
    return acc;
  }, {});
  await Promise.all(assignedRequestIds.map(async (requestId) => {
    if (assignedTransportByRequest[requestId]) return;
    const fallback = await getAssignedTransportFallback(requestById[requestId], {
      openid: OPENID,
      user_id: user ? user._id : '',
      role: user ? user.role : 'customer',
      now: now.toISOString(),
    });
    if (fallback) assignedTransportByRequest[requestId] = fallback;
  }));
  const missingAssignedRequestIds = assignedRequestIds.filter((requestId) => !assignedTransportByRequest[requestId]);
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
    .map((request) => toTransferRequest(request, quotesByRequest[request._id] || [], assignedTransportByRequest[request._id] || null));
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
    today_card: buildMockTodayCard(),
    today_itinerary: tripData.today_itinerary,
    trip_overview: tripData.trip_overview,
    transportation_appointments: [],
    charter_services: tripData.charter_services,
    transfer_requests: transferRequests,
    transport_orders: [],
    hotel_requests: tripData.hotel_requests,
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
