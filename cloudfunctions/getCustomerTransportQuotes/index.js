const cloud = require('wx-server-sdk');
const { getCaller, isOperator } = require('./lib/auth');
const { writeAuditLog } = require('./lib/audit');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const CUSTOMER_VISIBLE_STATUSES = ['published', 'viewed', 'selected', 'confirmed'];

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
    driver_quote_amount: quote.driver_quote_amount,
    farland_service_fee_rate: quote.farland_service_fee_rate || 0.1,
    farland_service_fee_amount: quote.farland_service_fee_amount,
    client_total: quote.client_total,
    client_visible_total: quote.client_total,
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

async function getAssignedTransport(requestId) {
  const orderRes = await db.collection('transport_orders')
    .where({ request_id: requestId, order_status: _.in(['assigned', 'confirmed']) })
    .orderBy('updated_at', 'desc')
    .limit(1)
    .get()
    .catch(() => ({ data: [] }));
  return toAssignedTransport(orderRes.data[0]);
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
  if (invite.status !== 'claimed') {
    return { ok: false, code: 428, error_code: 'INVITE_NOT_CLAIMED', message: '请先确认查看方式' };
  }
  if (invite.claimed_openid !== caller.openid) {
    return { ok: false, code: 403, error_code: 'INVITE_ALREADY_CLAIMED', message: '该邀请已绑定其他微信' };
  }
  return { ok: true, invite };
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
  if (!operatorPreview && request.customer_openid !== caller.openid) {
    const inviteAccess = await verifyInviteAccess({
      requestId: request_id,
      inviteCode: invite_code,
      caller,
      operatorPreview,
    });
    if (!inviteAccess.ok) {
      return {
        success: false,
        code: inviteAccess.code,
        error_code: inviteAccess.error_code,
        message: inviteAccess.message,
      };
    }
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
    .filter((quote) => quote.quote_status === 'published' && !operatorPreview)
    .map((quote) => db.collection('customer_transport_quotes').doc(quote._id).update({
      data: {
        quote_status: 'viewed',
        viewed_by_openid: caller.openid,
        viewed_at: quote.viewed_at || now,
        updated_at: now,
      },
    }).catch(() => null)));

  const assignedTransport = request.status === 'assigned'
    ? await getAssignedTransport(request_id)
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
    },
    created_at: now,
  }).catch(() => null);

  return {
    success: true,
    code: 0,
    request_id,
    has_published_quotes: quotes.length > 0,
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
        : (request.status === 'assigned' ? '接送已预约' : (quotes.length ? '已收到优选用车方案' : 'Farland 正在为您确认用车方案')),
      ops_status_text: request.status === 'cancelled'
        ? (request.cancel_reason_driver || '该用车需求已取消，如需重新安排请联系 Farland 顾问。')
        : (request.status === 'assigned' ? 'Farland 已完成最终确认。' : (quotes.length ? 'Farland 已为您筛选以下优选用车方案。' : 'Farland 正在为您确认用车方案。')),
      created_by_text: request.customer_name ? `${request.customer_name} 的用车需求` : 'Farland 顾问已记录该用车需求',
    },
    assigned_transport: assignedTransport,
    quotes,
  };
};
