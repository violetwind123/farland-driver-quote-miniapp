const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const ORDERS_COLLECTION = 'hotel_orders';

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
}

function text(value) {
  return safeString(value).trim();
}

async function requireRole(roles) {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, code: 401, message: '无法识别用户身份' };
  const userRes = await db.collection('users').where({ openid: OPENID }).limit(1).get();
  const user = userRes.data[0];
  if (!user || user.status !== 'active' || !roles.includes(user.role)) {
    return { ok: false, code: 403, message: '无权限访问' };
  }
  return { ok: true, openid: OPENID, user };
}

function statusText(order) {
  if (order.payment_status === 'manual_payment_confirmed') return '已确认付款';
  if (order.payment_status === 'manual_payment_pending') return '待手动付款';
  return order.payment_status || order.status || '待处理';
}

function normalizeOrder(order = {}) {
  return {
    _id: order._id,
    order_no: order.order_no || '',
    status: order.status || '',
    status_text: statusText(order),
    payment_status: order.payment_status || '',
    payment_method: order.payment_method || 'manual',
    supplier_order_status: order.supplier_order_status || '',
    supplier_order_id: order.supplier_order_id || '',
    hotel_name: order.hotel_name || '酒店订单',
    hotel_name_en: order.hotel_name_en || '',
    hotel_address: order.hotel_address || '',
    room_name: order.room_name || '',
    rate_plan_name: order.rate_plan_name || '',
    check_in_date: order.check_in_date || '',
    check_out_date: order.check_out_date || '',
    rooms: order.rooms || 1,
    guests_count: order.guests_count || 0,
    contact_name: order.contact && order.contact.name ? order.contact.name : '',
    contact_mobile: order.contact && order.contact.mobile ? order.contact.mobile : '',
    contact_email: order.contact && order.contact.email ? order.contact.email : '',
    payable_text: order.payable_text || '',
    currency: order.currency || '',
    payable_total: order.payable_total || 0,
    preview_id: order.preview_id || '',
    created_at: order.created_at || '',
    updated_at: order.updated_at || '',
    paid_confirmed_at: order.paid_confirmed_at || '',
    paid_confirmed_by_name: order.paid_confirmed_by_name || '',
  };
}

async function listOrders(tab) {
  let query = db.collection(ORDERS_COLLECTION);
  if (tab === 'pending_payment') {
    query = query.where({ payment_status: 'manual_payment_pending' });
  } else if (tab === 'paid') {
    query = query.where({ payment_status: 'manual_payment_confirmed' });
  }
  const res = await query.limit(100).get().catch(() => ({ data: [] }));
  const orders = (res.data || [])
    .filter((order) => {
      if (tab === 'pending_payment') return order.payment_status === 'manual_payment_pending';
      if (tab === 'paid') return order.payment_status === 'manual_payment_confirmed';
      return true;
    })
    .sort((a, b) => text(b.created_at).localeCompare(text(a.created_at)))
    .map(normalizeOrder);
  return orders;
}

async function confirmPaid(event, auth) {
  const orderId = text(event.order_id || event.id);
  if (!orderId) return { success: false, code: 422, error_code: 'ORDER_ID_REQUIRED', message: '请提供订单 ID' };

  const doc = await db.collection(ORDERS_COLLECTION).doc(orderId).get().catch(() => null);
  const order = doc && doc.data;
  if (!order) return { success: false, code: 404, error_code: 'ORDER_NOT_FOUND', message: '订单不存在' };

  if (order.payment_status === 'manual_payment_confirmed') {
    return {
      success: true,
      code: 0,
      reused: true,
      order: normalizeOrder(order),
      message: '该订单已确认付款',
    };
  }

  if (order.payment_method !== 'manual') {
    return { success: false, code: 409, error_code: 'PAYMENT_METHOD_NOT_MANUAL', message: '该订单不是手动支付订单' };
  }

  const now = new Date().toISOString();
  const updateData = {
    status: 'payment_confirmed',
    payment_status: 'manual_payment_confirmed',
    supplier_order_status: order.supplier_order_status || 'not_created',
    paid_confirmed_at: now,
    paid_confirmed_by: auth.user._id,
    paid_confirmed_by_openid: auth.openid,
    paid_confirmed_by_name: auth.user.name || auth.user.nickname || '',
    updated_at: now,
  };
  await db.collection(ORDERS_COLLECTION).doc(orderId).update({ data: updateData });
  await db.collection('audit_logs').add({
    data: {
      actor_openid: auth.openid,
      actor_user_id: auth.user._id,
      actor_role: auth.user.role,
      action: 'hotel_manual_payment_confirmed',
      target_type: 'hotel_order',
      target_id: orderId,
      detail: {
        order_no: order.order_no || '',
        hotel_name: order.hotel_name || '',
        payable_text: order.payable_text || '',
        supplier_order_status: updateData.supplier_order_status,
      },
      created_at: now,
    },
  }).catch(() => null);

  return {
    success: true,
    code: 0,
    reused: false,
    order: normalizeOrder({ ...order, ...updateData, _id: orderId }),
    message: '已确认付款，下一步可由运营创建供应商订单',
  };
}

exports.main = async (event = {}) => {
  const auth = await requireRole(['operator', 'super_admin']);
  if (!auth.ok) {
    return { success: false, code: auth.code, error_code: 'FORBIDDEN', message: auth.message };
  }

  const action = text(event.action || event.mode || 'list');
  if (action === 'list') {
    return {
      success: true,
      code: 0,
      orders: await listOrders(text(event.tab || 'pending_payment')),
    };
  }
  if (action === 'confirm_paid') {
    return confirmPaid(event, auth);
  }
  return {
    success: false,
    code: 422,
    error_code: 'UNSUPPORTED_ACTION',
    message: '不支持的酒店订单操作',
  };
};
