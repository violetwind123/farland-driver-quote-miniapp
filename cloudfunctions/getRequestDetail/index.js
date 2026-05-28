const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

async function getOperator() {
  const { OPENID } = cloud.getWXContext();
  const userRes = await db.collection('users').where({ openid: OPENID }).limit(1).get();
  const user = userRes.data[0];
  return user && user.status === 'active' && ['operator', 'super_admin'].includes(user.role) ? user : null;
}

function toAssignedCustomer(request, customer) {
  const displayName = customer
    ? (customer.display_name || customer.name || request.customer_name || '')
    : (request.customer_name || '');
  const userId = request.customer_user_id || (customer && customer._id) || '';
  if (!displayName && !userId && !request.customer_profile_id) return null;
  return {
    user_id: userId,
    display_name: displayName,
    name: customer ? (customer.name || customer.display_name || '') : (request.customer_name || ''),
    phone: customer ? (customer.phone || '') : '',
    wechat_id: customer ? (customer.wechat_id || '') : '',
    customer_profile_id: request.customer_profile_id || (customer && customer.customer_profile_id) || '',
    customer_status: customer ? (customer.customer_status || customer.status || '') : '',
    assigned_at: request.customer_assigned_at || '',
  };
}

exports.main = async (event = {}) => {
  const user = await getOperator();
  if (!user) return { success: false, message: '无权限访问' };
  if (!event.request_id) return { success: false, message: '缺少 request_id' };

  const requestRes = await db.collection('ride_requests').doc(event.request_id).get().catch(() => null);
  if (!requestRes || !requestRes.data) return { success: false, message: '报价单不存在' };
  const request = requestRes.data;

  const [inviteRes, quoteRes, customerQuoteRes, customerRes] = await Promise.all([
    db.collection('quote_invites').where({ request_id: event.request_id }).orderBy('created_at', 'desc').get(),
    db.collection('driver_quotes').where({ request_id: event.request_id }).orderBy('updated_at', 'desc').get(),
    db.collection('customer_transport_quotes').where({ request_id: event.request_id }).limit(50).get().catch(() => ({ data: [] })),
    request.customer_user_id
      ? db.collection('users').doc(request.customer_user_id).get().catch(() => null)
      : Promise.resolve(null),
  ]);
  const assignedCustomer = toAssignedCustomer(request, customerRes && customerRes.data);
  const customerQuoteMap = {};
  (customerQuoteRes.data || []).forEach((quote) => {
    if (quote.source_driver_quote_id) customerQuoteMap[quote.source_driver_quote_id] = quote;
  });
  const quotes = quoteRes.data.map((quote) => {
    const customerQuote = customerQuoteMap[quote._id];
    return {
      ...quote,
      customer_quote_id: customerQuote ? customerQuote._id : '',
      customer_quote_status: customerQuote ? customerQuote.quote_status : '',
      customer_selected_at: customerQuote ? customerQuote.selected_at || '' : '',
      customer_selected: customerQuote ? customerQuote.quote_status === 'selected' : false,
    };
  });

  return {
    success: true,
    request: {
      request_no: request.request_no,
      service_type: request.service_type,
      service_date: request.service_date,
      driver_region: request.driver_region,
      task_description: request.task_description,
      quote_deadline: request.quote_deadline,
      internal_note: request.internal_note || '',
      status: request.status,
      customer_user_id: request.customer_user_id || '',
      customer_name: request.customer_name || '',
      customer_profile_id: request.customer_profile_id || '',
      customer_assigned_at: request.customer_assigned_at || '',
      cancel_reason_type: request.cancel_reason_type || '',
      cancel_reason_driver: request.cancel_reason_driver || '',
      cancel_reason_internal: request.cancel_reason_internal || '',
      cancelled_by: request.cancelled_by || '',
      cancelled_at: request.cancelled_at || '',
      created_at: request.created_at,
      updated_at: request.updated_at,
    },
    assigned_customer: assignedCustomer,
    invites: inviteRes.data,
    quotes,
  };
};
