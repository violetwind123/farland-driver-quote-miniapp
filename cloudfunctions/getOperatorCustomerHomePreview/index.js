const cloud = require('wx-server-sdk');
const { requireRole } = require('./lib/auth');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
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
  const hero = snapshot.hero || {};
  const customer = snapshot.customer || {};
  const advisor = snapshot.advisor || {};
  const days = Array.isArray(snapshot.itinerary_days) ? snapshot.itinerary_days : [];
  const hotels = Array.isArray(snapshot.hotels) ? snapshot.hotels : [];
  const transfers = Array.isArray(snapshot.transfers) ? snapshot.transfers : [];
  const charters = Array.isArray(snapshot.charter_services) ? snapshot.charter_services : [];
  const benefits = Array.isArray(snapshot.benefits) ? snapshot.benefits : [];
  return {
    ...snapshot,
    display_title: hero.title || snapshot.title || 'Farland 行程',
    display_trip_no: hero.trip_no || snapshot.trip_no || snapshot.external_trip_id || snapshot.trip_id || '',
    display_date_range: hero.date_range || [snapshot.start_at || '', snapshot.end_at || ''].filter(Boolean).join(' - '),
    display_city: hero.city_summary || snapshot.city || '',
    display_customer: customer.display_name || customer.name || '',
    display_advisor: advisor.name || 'Farland Advisor',
    itinerary_days: days,
    hotels,
    transfers,
    charter_services: charters,
    benefits,
  };
}

function firstUpcomingDay(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.itinerary_days) || !snapshot.itinerary_days.length) return null;
  return snapshot.itinerary_days[0];
}

function buildTripOverview(snapshot, trip) {
  if (!snapshot) return [];
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
    hotel_requests: snapshot.hotels || [],
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

  const isPublished = Boolean(trip && trip.visibility_status === 'published' && isObject(trip.published_snapshot) && Object.keys(trip.published_snapshot).length);
  const rawSnapshot = isPublished ? trip.published_snapshot : (trip && isObject(trip.draft_snapshot) ? trip.draft_snapshot : null);
  const snapshot = normalizeSnapshot(rawSnapshot);
  const warnings = Array.isArray(trip && trip.warning_codes) ? trip.warning_codes.slice() : [];
  const criticalWarnings = Array.isArray(trip && trip.critical_warning_codes) ? trip.critical_warning_codes.slice() : [];
  if (trip && !isPublished) warnings.push('unpublished_trip');
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
