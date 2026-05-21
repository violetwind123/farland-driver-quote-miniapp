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
  ]);

  return { success: true, code: 0, message: '已选择司机' };
};
