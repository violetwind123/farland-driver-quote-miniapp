const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

async function getOperator() {
  const { OPENID } = cloud.getWXContext();
  const userRes = await db.collection('users').where({ openid: OPENID }).limit(1).get();
  const user = userRes.data[0];
  return user && user.status === 'active' && ['operator', 'super_admin'].includes(user.role) ? user : null;
}

function toTransportOrderData({ request, quote, operator, now }) {
  return {
    request_id: request._id,
    request_no: request.request_no || '',
    customer_name: request.customer_name || '',
    customer_openid: request.customer_openid || '',
    customer_user_id: request.customer_user_id || '',
    quote_id: quote._id,
    driver_quote_id: quote._id,
    customer_quote_id: request.customer_selected_quote_id || '',
    driver_id: quote.driver_id || '',
    vehicle_id: quote.vehicle_id || '',
    order_status: 'assigned',
    driver_name: quote.driver_name_snapshot || '',
    driver_phone: quote.driver_phone_snapshot || '',
    vehicle_type: quote.vehicle_type_snapshot || '',
    vehicle_model: quote.vehicle_model_snapshot || '',
    seats: quote.seats_snapshot || 0,
    luggage_capacity: quote.luggage_capacity_snapshot || 0,
    plate_number: quote.plate_number_snapshot || '',
    pickup: request.pickup || request.pickup_location || '',
    dropoff: request.dropoff || request.dropoff_location || '',
    pickup_time_text: request.pickup_time_text || request.pickup_time || request.service_date || '',
    service_date: request.service_date || '',
    service_type: request.service_type || '',
    assigned_at: now,
    assigned_by: operator._id || '',
    assigned_by_openid: operator.openid || '',
    updated_at: now,
  };
}

async function saveTransportOrder(data, now) {
  const existingRes = await db.collection('transport_orders')
    .where({ request_id: data.request_id })
    .orderBy('updated_at', 'desc')
    .limit(1)
    .get()
    .catch(() => ({ data: [] }));
  const existing = existingRes.data && existingRes.data[0];
  if (existing) {
    return db.collection('transport_orders').doc(existing._id).update({
      data,
    });
  }
  return db.collection('transport_orders').add({
    data: {
      ...data,
      created_at: now,
    },
  });
}

exports.main = async (event = {}) => {
  const operator = await getOperator();
  if (!operator) return { success: false, code: 403, message: '无权限访问' };
  const { request_id, quote_id } = event;
  if (!request_id || !quote_id) return { success: false, code: 400, message: '参数不完整' };

  const quoteRes = await db.collection('driver_quotes').doc(quote_id).get().catch(() => null);
  const quote = quoteRes && quoteRes.data;
  if (!quote || quote.request_id !== request_id) return { success: false, code: 404, message: '报价不存在' };
  if (quote.quote_status === 'rejected') return { success: false, code: 400, message: '该报价已标记为未选中，不能选择' };

  const requestRes = await db.collection('ride_requests').doc(request_id).get().catch(() => null);
  const request = requestRes && requestRes.data;
  if (!request) return { success: false, code: 404, message: '报价单不存在' };
  if (request.status === 'cancelled') {
    return { success: false, code: 410, message: '当前报价单已取消，不能选择司机' };
  }
  if (!['quoting', 'quoted'].includes(request.status)) {
    return { success: false, code: 410, message: '当前报价单状态不能选择司机' };
  }

  const now = new Date().toISOString();
  const otherQuotesRes = await db.collection('driver_quotes').where({ request_id }).get();
  const transportOrderData = toTransportOrderData({ request, quote, operator, now });

  await Promise.all([
    db.collection('driver_quotes').doc(quote_id).update({
      data: {
        quote_status: 'selected',
        selected_at: now,
        updated_at: now,
      },
    }),
    ...otherQuotesRes.data.filter((item) => item._id !== quote_id).map((item) => db.collection('driver_quotes').doc(item._id).update({
      data: {
        quote_status: 'rejected',
        updated_at: now,
      },
    })),
    db.collection('ride_requests').doc(request_id).update({
      data: {
        status: 'assigned',
        selected_quote_id: quote_id,
        selected_driver_id: quote.driver_id,
        selected_vehicle_id: quote.vehicle_id,
        updated_at: now,
      },
    }),
    saveTransportOrder(transportOrderData, now),
  ]);

  return { success: true, code: 0, message: '已选择司机' };
};
