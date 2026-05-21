const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

async function getOperator() {
  const { OPENID } = cloud.getWXContext();
  const userRes = await db.collection('users').where({ openid: OPENID }).limit(1).get();
  const user = userRes.data[0];
  return user && user.status === 'active' && ['operator', 'super_admin'].includes(user.role) ? user : null;
}

exports.main = async (event = {}) => {
  const user = await getOperator();
  if (!user) return { success: false, message: '无权限访问' };
  if (!event.request_id) return { success: false, message: '缺少 request_id' };

  const requestRes = await db.collection('ride_requests').doc(event.request_id).get().catch(() => null);
  if (!requestRes || !requestRes.data) return { success: false, message: '报价单不存在' };

  const [inviteRes, quoteRes, customerQuoteRes] = await Promise.all([
    db.collection('quote_invites').where({ request_id: event.request_id }).orderBy('created_at', 'desc').get(),
    db.collection('driver_quotes').where({ request_id: event.request_id }).orderBy('updated_at', 'desc').get(),
    db.collection('customer_transport_quotes').where({ request_id: event.request_id }).limit(50).get().catch(() => ({ data: [] })),
  ]);
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
      request_no: requestRes.data.request_no,
      service_type: requestRes.data.service_type,
      service_date: requestRes.data.service_date,
      driver_region: requestRes.data.driver_region,
      task_description: requestRes.data.task_description,
      quote_deadline: requestRes.data.quote_deadline,
      internal_note: requestRes.data.internal_note || '',
      status: requestRes.data.status,
      cancel_reason_type: requestRes.data.cancel_reason_type || '',
      cancel_reason_driver: requestRes.data.cancel_reason_driver || '',
      cancel_reason_internal: requestRes.data.cancel_reason_internal || '',
      cancelled_by: requestRes.data.cancelled_by || '',
      cancelled_at: requestRes.data.cancelled_at || '',
      created_at: requestRes.data.created_at,
      updated_at: requestRes.data.updated_at,
    },
    invites: inviteRes.data,
    quotes,
  };
};
