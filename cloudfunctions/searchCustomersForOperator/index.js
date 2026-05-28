const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

async function getOperator() {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return null;
  const userRes = await db.collection('users').where({ openid: OPENID }).limit(1).get();
  const user = userRes.data[0];
  return user && user.status === 'active' && ['operator', 'super_admin'].includes(user.role) ? user : null;
}

function includesKeyword(user, keyword) {
  if (!keyword) return true;
  const normalized = String(keyword).trim().toLowerCase();
  return [
    user.display_name,
    user.name,
    user.phone,
    user.wechat_id,
    user.customer_profile_id,
  ].some((value) => String(value || '').toLowerCase().includes(normalized));
}

function toCustomerListItem(user) {
  return {
    user_id: user._id,
    display_name: user.display_name || user.name || 'Farland 客户',
    name: user.name || user.display_name || '',
    phone: user.phone || '',
    wechat_id: user.wechat_id || '',
    customer_profile_id: user.customer_profile_id || '',
    customer_status: user.customer_status || user.status || '',
    latest_trip_at: user.latest_trip_at || user.last_customer_seen_at || user.updated_at || '',
  };
}

exports.main = async (event = {}) => {
  const operator = await getOperator();
  if (!operator) {
    return { success: false, code: 403, error_code: 'FORBIDDEN', message: '无权限访问' };
  }

  const keyword = String(event.keyword || '').trim();
  const limit = Math.min(Math.max(Number(event.limit || 20), 1), 50);
  const userRes = await db.collection('users')
    .where({ role: 'customer', status: 'active' })
    .limit(100)
    .get()
    .catch(() => ({ data: [] }));

  const customers = (userRes.data || [])
    .filter((user) => includesKeyword(user, keyword))
    .slice(0, limit)
    .map(toCustomerListItem);

  return {
    success: true,
    code: 0,
    customers,
  };
};
