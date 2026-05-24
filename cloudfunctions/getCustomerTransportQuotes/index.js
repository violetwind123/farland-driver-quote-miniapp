const cloud = require('wx-server-sdk');
const { getCaller, isOperator } = require('./lib/auth');
const { writeAuditLog } = require('./lib/audit');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const CUSTOMER_VISIBLE_STATUSES = ['published', 'viewed', 'selected', 'confirmed'];

function formatMoney(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
}

function toClientQuote(quote) {
  return {
    _id: quote._id,
    quote_id: quote._id,
    title: quote.title || '',
    public_title: quote.title || '',
    operator_explanation: quote.operator_explanation || '',
    included_items: quote.included_items || [],
    excluded_items: quote.excluded_items || [],
    includes: quote.included_items || [],
    excludes: quote.excluded_items || [],
    valid_until: quote.valid_until || '',
    valid_until_text: quote.valid_until || '',
    is_recommended: Boolean(quote.is_recommended),
    currency: quote.currency || 'USD',
    driver_quote_amount: formatMoney(quote.driver_quote_amount),
    farland_service_fee_rate: quote.farland_service_fee_rate || 0.1,
    farland_service_fee_amount: formatMoney(quote.farland_service_fee_amount),
    client_total: formatMoney(quote.client_total),
    client_visible_total: formatMoney(quote.client_total),
    vehicle_type_snapshot: quote.vehicle_type_snapshot || '',
    vehicle_model_snapshot: quote.vehicle_model_snapshot || '',
    vehicle_class: quote.vehicle_type_snapshot || '',
    capacity_text: `${quote.seats_snapshot || '-'} 人 / ${quote.luggage_capacity_snapshot || '-'} 件行李`,
    seats_snapshot: quote.seats_snapshot || 0,
    luggage_capacity_snapshot: quote.luggage_capacity_snapshot || 0,
    driver_profile_teaser: quote.driver_profile_teaser || '由 Farland 严选车队提供',
    quote_status: quote.quote_status,
    is_selected_by_customer: quote.quote_status === 'selected',
    selected_at: quote.selected_at || '',
  };
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

function isAssignedStatus(status) {
  return status === 'assigned' || status === 'confirmed';
}

function errorDetail(error) {
  if (!error) return {};
  return {
    message: error.message || '',
    errMsg: error.errMsg || '',
    code: error.code || '',
  };
}

async function getAssignedTransport(requestId, auditContext = {}) {
  let orderRes = { data: [] };
  let readError = null;
  try {
    orderRes = await db.collection('transport_orders')
      .where({ request_id: requestId, order_status: _.in(['assigned', 'confirmed']) })
      .orderBy('updated_at', 'desc')
      .limit(1)
      .get();
  } catch (error) {
    readError = error;
    await writeAuditLog(db, {
      actor_openid: auditContext.openid || '',
      actor_user_id: auditContext.user_id || '',
      actor_role: auditContext.role || 'customer',
      action: 'transport_orders_read_failed',
      target_type: 'ride_request',
      target_id: requestId,
      related_request_id: requestId,
      detail: errorDetail(error),
      created_at: auditContext.now || new Date().toISOString(),
    }).catch(() => null);
  }
  const transport = toAssignedTransport(orderRes.data[0]);
  if (!readError && !transport) {
    await writeAuditLog(db, {
      actor_openid: auditContext.openid || '',
      actor_user_id: auditContext.user_id || '',
      actor_role: auditContext.role || 'customer',
      action: 'transport_orders_missing_for_assigned_request',
      target_type: 'ride_request',
      target_id: requestId,
      related_request_id: requestId,
      detail: { request_status: auditContext.request_status || '' },
      created_at: auditContext.now || new Date().toISOString(),
    }).catch(() => null);
  }
  return transport;
}

async function getAssignedTransportFallback(request, auditContext = {}) {
  if (!request || !request.selected_driver_id) return null;
  const driverRes = await db.collection('drivers').doc(request.selected_driver_id).get().catch((error) => {
    writeAuditLog(db, {
      actor_openid: auditContext.openid || '',
      actor_user_id: auditContext.user_id || '',
      actor_role: auditContext.role || 'customer',
      action: 'assigned_driver_fallback_read_failed',
      target_type: 'ride_request',
      target_id: request._id || '',
      related_request_id: request._id || '',
      detail: { collection: 'drivers', error: errorDetail(error) },
      created_at: auditContext.now || new Date().toISOString(),
    }).catch(() => null);
    return null;
  });
  const driver = driverRes && driverRes.data ? driverRes.data : null;
  const vehicleId = request.selected_vehicle_id || (driver && driver.default_vehicle_id) || '';
  let vehicle = null;
  if (vehicleId) {
    const vehicleRes = await db.collection('vehicles').doc(vehicleId).get().catch((error) => {
      writeAuditLog(db, {
        actor_openid: auditContext.openid || '',
        actor_user_id: auditContext.user_id || '',
        actor_role: auditContext.role || 'customer',
        action: 'assigned_driver_fallback_read_failed',
        target_type: 'ride_request',
        target_id: request._id || '',
        related_request_id: request._id || '',
        detail: { collection: 'vehicles', error: errorDetail(error) },
        created_at: auditContext.now || new Date().toISOString(),
      }).catch(() => null);
      return null;
    });
    vehicle = vehicleRes && vehicleRes.data ? vehicleRes.data : null;
  }
  return toAssignedTransportFromDriverVehicle(driver, vehicle);
}

function toTime(value) {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function isInviteExpired(invite, now) {
  const expiresAt = toTime(invite && invite.expires_at);
  return Boolean(expiresAt && expiresAt < now.getTime());
}

function isValidAccess(access, now) {
  if (!access || access.status !== 'active') return false;
  const visibleUntil = toTime(access.visible_until);
  return !visibleUntil || visibleUntil >= now.getTime();
}

async function findCustomerTripAccess({ openid, user_id, request_id }) {
  const queries = [
    db.collection('customer_trip_access')
      .where({ request_id, openid })
      .limit(10)
      .get()
      .catch(() => ({ data: [] })),
    db.collection('customer_trip_access')
      .where({ request_id, customer_openid: openid })
      .limit(10)
      .get()
      .catch(() => ({ data: [] })),
  ];
  if (user_id) {
    queries.push(
      db.collection('customer_trip_access')
        .where({ request_id, user_id })
        .limit(10)
        .get()
        .catch(() => ({ data: [] })),
      db.collection('customer_trip_access')
        .where({ request_id, customer_user_id: user_id })
        .limit(10)
        .get()
        .catch(() => ({ data: [] })),
    );
  }
  const results = await Promise.all(queries);
  const seen = {};
  return results.flatMap((res) => res.data || []).filter((access) => {
    const key = access._id || `${access.openid || access.customer_openid}-${access.request_id}`;
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

async function verifyInviteAccess({ requestId, inviteCode, caller, operatorPreview }) {
  if (!inviteCode) {
    return { ok: false, code: 403, error_code: 'FORBIDDEN', message: '无权限查看该用车方案' };
  }

  const inviteRes = await db.collection('customer_invites')
    .where({ invite_code: inviteCode, request_id: requestId })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }));
  const invite = inviteRes.data[0];
  if (!invite) {
    return { ok: false, code: 403, error_code: 'INVALID_INVITE', message: '邀请链接无效' };
  }
  if (operatorPreview) {
    return { ok: true, invite };
  }
  if (isInviteExpired(invite, new Date()) || ['expired', 'revoked', 'cancelled'].includes(invite.status)) {
    return { ok: false, code: 403, error_code: 'INVITE_UNAVAILABLE', message: '邀请链接已失效' };
  }
  return { ok: true, source: 'temporary_invite', invite };
}

async function verifyCustomerAccess({ requestId, inviteCode, caller, request, now }) {
  const accessRows = await findCustomerTripAccess({
    openid: caller.openid,
    user_id: caller.user ? caller.user._id : '',
    request_id: requestId,
  });
  const validAccess = accessRows.find((access) => isValidAccess(access, now));
  if (validAccess) {
    return { ok: true, source: 'customer_trip_access', access: validAccess };
  }

  const blockingAccess = accessRows.find((access) => {
    if (!access || access.status !== 'active') return true;
    const visibleUntil = toTime(access.visible_until);
    return Boolean(visibleUntil && visibleUntil < now.getTime());
  });
  if (blockingAccess) {
    return {
      ok: false,
      code: 403,
      error_code: 'CUSTOMER_TRIP_ACCESS_EXPIRED',
      message: '该行程访问已失效',
    };
  }

  if (request.customer_openid === caller.openid) {
    return { ok: true, source: 'migration_request_owner' };
  }

  const inviteAccess = await verifyInviteAccess({
    requestId,
    inviteCode,
    caller,
    operatorPreview: false,
  });
  if (!inviteAccess.ok) {
    return inviteAccess;
  }
  return { ok: true, source: inviteAccess.source || 'temporary_invite', invite: inviteAccess.invite };
}

exports.main = async (event = {}) => {
  const { request_id, invite_code = '' } = event;
  if (!request_id) {
    return { success: false, code: 422, error_code: 'VALIDATION_ERROR', message: '缺少 request_id' };
  }

  const caller = await getCaller(cloud, db);
  if (!caller.openid) {
    return { success: false, code: 401, error_code: 'UNAUTHENTICATED', message: '无法识别用户身份' };
  }

  const requestRes = await db.collection('ride_requests').doc(request_id).get().catch(() => null);
  const request = requestRes && requestRes.data;
  if (!request) {
    return { success: false, code: 404, error_code: 'NOT_FOUND', message: '用车需求不存在' };
  }

  const operatorPreview = isOperator(caller.user);
  let accessSource = operatorPreview ? 'operator_preview' : '';
  let customerTripAccessId = '';
  if (!operatorPreview) {
    const customerAccess = await verifyCustomerAccess({
      requestId: request_id,
      inviteCode: invite_code,
      caller,
      request,
      now: new Date(),
    });
    if (!customerAccess.ok) {
      return {
        success: false,
        code: customerAccess.code,
        error_code: customerAccess.error_code,
        message: customerAccess.message,
      };
    }
    accessSource = customerAccess.source || '';
    customerTripAccessId = customerAccess.access ? customerAccess.access._id : '';
  }

  const quoteRes = await db.collection('customer_transport_quotes')
    .where({ request_id, quote_status: _.in(CUSTOMER_VISIBLE_STATUSES) })
    .orderBy('is_recommended', 'desc')
    .orderBy('updated_at', 'desc')
    .limit(3)
    .get();
  const rawQuotes = quoteRes.data || [];
  const quotes = rawQuotes.map(toClientQuote);
  const now = new Date().toISOString();

  await Promise.all(rawQuotes
    .filter((quote) => quote.quote_status === 'published' && !operatorPreview && accessSource !== 'temporary_invite')
    .map((quote) => db.collection('customer_transport_quotes').doc(quote._id).update({
      data: {
        quote_status: 'viewed',
        viewed_by_openid: caller.openid,
        viewed_at: quote.viewed_at || now,
        updated_at: now,
      },
    }).catch(() => null)));

  const auditContext = {
      openid: caller.openid,
      user_id: caller.user ? caller.user._id : '',
      role: caller.user ? caller.user.role : 'customer',
      request_status: request.status || '',
      now,
    };
  const assignedTransport = isAssignedStatus(request.status)
    ? (await getAssignedTransport(request_id, auditContext)) || await getAssignedTransportFallback(request, auditContext)
    : null;

  await writeAuditLog(db, {
    actor_openid: caller.openid,
    actor_user_id: caller.user ? caller.user._id : '',
    actor_role: caller.user ? caller.user.role : 'customer',
    action: 'customer_quotes_read',
    target_type: 'ride_request',
    target_id: request_id,
    related_request_id: request_id,
    detail: {
      quote_count: quotes.length,
      operator_preview: operatorPreview,
      access_source: accessSource,
      customer_trip_access_id: customerTripAccessId,
    },
    created_at: now,
  }).catch(() => null);

  return {
    success: true,
    code: 0,
    request_id,
    has_published_quotes: quotes.length > 0,
    access_source: accessSource,
    customer_trip_access_id: customerTripAccessId,
    request_summary: {
      request_no: request.request_no || '',
      service_date: request.service_date || '',
      service_type: request.service_type || '',
      driver_region: request.driver_region || '',
      task_description: request.task_description || '',
      status: request.status || '',
      cancel_reason_driver: request.cancel_reason_driver || '',
      cancelled_at: request.cancelled_at || '',
      pickup: request.pickup || request.pickup_location || '',
      dropoff: request.dropoff || request.dropoff_location || '',
      pickup_time_text: request.pickup_time_text || request.pickup_time || request.service_date || '',
      passengers: request.passengers || request.passenger_count || '',
      luggage: request.luggage || request.luggage_count || '',
      status_text: request.status === 'cancelled'
        ? '用车需求已取消'
        : (isAssignedStatus(request.status) ? '接送已预约' : (quotes.length ? '已收到优选用车方案' : 'Farland 正在为您确认用车方案')),
      ops_status_text: request.status === 'cancelled'
        ? (request.cancel_reason_driver || '该用车需求已取消，如需重新安排请联系 Farland 顾问。')
        : (isAssignedStatus(request.status) ? 'Farland 已完成最终确认。' : (quotes.length ? 'Farland 已为您筛选以下优选用车方案。' : 'Farland 正在为您确认用车方案。')),
      created_by_text: request.customer_name ? `${request.customer_name} 的用车需求` : 'Farland 顾问已记录该用车需求',
    },
    assigned_transport: assignedTransport,
    quotes,
  };
};
