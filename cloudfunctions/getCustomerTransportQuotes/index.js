const cloud = require('wx-server-sdk');
const { getCaller, isOperator } = require('./lib/auth');
const { writeAuditLog } = require('./lib/audit');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

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
    driver_name_snapshot: quote.driver_name_snapshot || '',
    driver_profile_teaser: quote.driver_name_snapshot ? `${quote.driver_name_snapshot}｜Farland 已审核` : 'Farland 已审核司机方案',
    quote_status: quote.quote_status,
    is_selected_by_customer: quote.quote_status === 'selected',
    selected_at: quote.selected_at || '',
  };
}

async function getAssignedTransport(requestId) {
  const quoteRes = await db.collection('driver_quotes')
    .where({ request_id: requestId, quote_status: 'selected' })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }));
  const quote = quoteRes.data[0];
  if (!quote) return null;
  return {
    driver_name: quote.driver_name_snapshot || '',
    driver_phone: quote.driver_phone_snapshot || '',
    vehicle_type: quote.vehicle_type_snapshot || '',
    vehicle_model: quote.vehicle_model_snapshot || '',
    seats: quote.seats_snapshot || 0,
    luggage_capacity: quote.luggage_capacity_snapshot || 0,
    plate_number: quote.plate_number_snapshot || '',
    currency: quote.currency || 'USD',
    quote_price: quote.quote_price || '',
  };
}

async function claimInviteIfNeeded({ requestId, inviteCode, caller, request }) {
  if (!inviteCode) return { ok: true, request };

  const inviteRes = await db.collection('customer_invites')
    .where({ invite_code: inviteCode, request_id: requestId })
    .limit(1)
    .get();
  const invite = inviteRes.data[0];
  if (!invite) {
    return { ok: false, code: 403, error_code: 'INVALID_INVITE', message: '邀请链接无效' };
  }

  if (isOperator(caller.user)) {
    return { ok: true, request };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  if (invite.status === 'claimed') {
    if (invite.claimed_openid !== caller.openid && !isOperator(caller.user)) {
      return { ok: false, code: 403, error_code: 'INVITE_ALREADY_CLAIMED', message: '该邀请已绑定其他微信' };
    }
    if (invite.claimed_openid === caller.openid && !request.customer_openid) {
      await db.collection('ride_requests').doc(requestId).update({
        data: {
          customer_openid: caller.openid,
          customer_name: request.customer_name || invite.customer_name || '',
          customer_phone: request.customer_phone || invite.customer_phone || '',
          updated_at: nowIso,
        },
      }).catch(() => null);
      return {
        ok: true,
        request: {
          ...request,
          customer_openid: caller.openid,
          customer_name: request.customer_name || invite.customer_name || '',
          customer_phone: request.customer_phone || invite.customer_phone || '',
        },
      };
    }
    return { ok: true, request };
  }

  if (invite.status !== 'unused') {
    return { ok: false, code: 403, error_code: 'INVITE_UNAVAILABLE', message: '邀请链接已失效' };
  }

  const expiresAt = invite.expires_at instanceof Date ? invite.expires_at : new Date(invite.expires_at);
  if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < now.getTime()) {
    await db.collection('customer_invites').doc(invite._id).update({
      data: {
        status: 'expired',
        updated_at: nowIso,
      },
    }).catch(() => null);
    return { ok: false, code: 403, error_code: 'INVITE_EXPIRED', message: '邀请链接已过期' };
  }

  const userRes = await db.collection('users').where({ openid: caller.openid }).limit(1).get();
  const existingUser = userRes.data[0];
  let userId = existingUser ? existingUser._id : '';
  if (!existingUser) {
    const created = await db.collection('users').add({
      data: {
        openid: caller.openid,
        role: 'customer',
        status: 'active',
        name: invite.customer_name || '',
        phone: invite.customer_phone || '',
        customer_invite_id: invite._id,
        created_at: nowIso,
        updated_at: nowIso,
      },
    });
    userId = created._id;
  } else if (existingUser.role === 'guest' || existingUser.role === 'customer' || !existingUser.role) {
    await db.collection('users').doc(existingUser._id).update({
      data: {
        role: 'customer',
        status: 'active',
        name: existingUser.name || invite.customer_name || '',
        phone: existingUser.phone || invite.customer_phone || '',
        customer_invite_id: existingUser.customer_invite_id || invite._id,
        updated_at: nowIso,
      },
    }).catch(() => null);
  }

  await Promise.all([
    db.collection('customer_invites').doc(invite._id).update({
      data: {
        status: 'claimed',
        claimed_openid: caller.openid,
        claimed_user_id: userId,
        claimed_at: nowIso,
        updated_at: nowIso,
      },
    }),
    db.collection('ride_requests').doc(requestId).update({
      data: {
        customer_openid: caller.openid,
        customer_name: request.customer_name || invite.customer_name || '',
        customer_phone: request.customer_phone || invite.customer_phone || '',
        updated_at: nowIso,
      },
    }).catch(() => null),
  ]);

  await writeAuditLog(db, {
    actor_openid: caller.openid,
    actor_user_id: userId,
    actor_role: 'customer',
    action: 'customer_invite_claimed',
    target_type: 'customer_invite',
    target_id: invite._id,
    related_request_id: requestId,
    detail: {
      invite_code: inviteCode,
    },
    created_at: nowIso,
  }).catch(() => null);

  return {
    ok: true,
    request: {
      ...request,
      customer_openid: caller.openid,
      customer_name: request.customer_name || invite.customer_name || '',
      customer_phone: request.customer_phone || invite.customer_phone || '',
    },
  };
}

exports.main = async (event = {}) => {
  const { request_id, invite_code } = event;
  if (!request_id) {
    return { success: false, code: 422, error_code: 'VALIDATION_ERROR', message: '缺少 request_id' };
  }

  const caller = await getCaller(cloud, db);
  if (!caller.openid) {
    return { success: false, code: 401, error_code: 'UNAUTHENTICATED', message: '无法识别用户身份' };
  }

  const requestRes = await db.collection('ride_requests').doc(request_id).get().catch(() => null);
  let request = requestRes && requestRes.data;
  if (!request) {
    return { success: false, code: 404, error_code: 'NOT_FOUND', message: '报价单不存在' };
  }

  const operatorPreview = isOperator(caller.user);
  const inviteResult = await claimInviteIfNeeded({
    requestId: request_id,
    inviteCode: invite_code,
    caller,
    request,
  });
  if (!inviteResult.ok) {
    return {
      success: false,
      code: inviteResult.code,
      error_code: inviteResult.error_code,
      message: inviteResult.message,
    };
  }
  request = inviteResult.request;

  if (request.customer_openid && request.customer_openid !== caller.openid && !operatorPreview) {
    return { success: false, code: 403, error_code: 'FORBIDDEN', message: '无权限查看该用车方案' };
  }
  if (!request.customer_openid && !operatorPreview) {
    return { success: false, code: 403, error_code: 'FORBIDDEN', message: '该用车方案暂未绑定客户访问权限' };
  }

  const quoteRes = await db.collection('customer_transport_quotes')
    .where({ request_id, quote_status: _.in(['published', 'selected']) })
    .orderBy('is_recommended', 'desc')
    .orderBy('updated_at', 'desc')
    .limit(3)
    .get();
  const quotes = (quoteRes.data || []).map(toClientQuote);
  const cancelledRes = await db.collection('customer_transport_quotes')
    .where({ request_id, quote_status: 'cancelled' })
    .orderBy('updated_at', 'desc')
    .limit(3)
    .get()
    .catch(() => ({ data: [] }));
  const customerNoticeQuote = (cancelledRes.data || []).find((quote) => {
    return quote.customer_action_required === 'reselect_driver' || quote.customer_notice;
  });
  const assignedTransport = request.status === 'assigned'
    ? await getAssignedTransport(request_id)
    : null;
  const now = new Date().toISOString();

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
        : (request.status === 'assigned' ? '已确认司机' : (request.status_text || 'Farland 正在为您确认用车方案')),
      ops_status_text: request.status === 'cancelled'
        ? (request.cancel_reason_driver || '该用车需求已取消，如需重新安排请联系 Farland 顾问。')
        : (request.status === 'assigned' ? 'Farland 已确认司机接单，以下为司机与车辆信息。' : (request.ops_status_text || 'Farland 正在为您确认用车方案')),
      created_by_text: request.customer_name ? `${request.customer_name} 的用车需求` : 'Farland 顾问已记录该用车需求',
    },
    assigned_transport: assignedTransport,
    customer_notice: customerNoticeQuote ? customerNoticeQuote.customer_notice : '',
    customer_action_required: customerNoticeQuote ? customerNoticeQuote.customer_action_required : '',
    quotes,
  };
};
