const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function isExpired(expiresAt) {
  return expiresAt && new Date(expiresAt).getTime() < Date.now();
}

async function getOperator() {
  const { OPENID } = cloud.getWXContext();
  const userRes = await db.collection('users').where({ openid: OPENID }).limit(1).get();
  const user = userRes.data[0];
  return user && user.status === 'active' && user.role === 'operator' ? user : null;
}

exports.main = async (event = {}) => {
  const operator = await getOperator();
  if (!operator) return { success: false, message: '无权限访问' };
  const { request_id, expires_at } = event;
  if (!request_id || !expires_at) return { success: false, message: '参数不完整' };

  const requestRes = await db.collection('ride_requests').doc(request_id).get().catch(() => null);
  if (!requestRes || !requestRes.data) return { success: false, message: '报价单不存在' };
  if (requestRes.data.status === 'cancelled') {
    return { success: false, code: 410, message: '当前报价单已取消，不能生成报价邀请' };
  }
  if (!['quoting', 'quoted'].includes(requestRes.data.status)) {
    return { success: false, code: 410, message: '当前报价单状态不能生成报价邀请' };
  }

  const existingRes = await db.collection('quote_invites').where({ request_id }).orderBy('created_at', 'desc').limit(10).get();
  const existing = existingRes.data.find((item) => !['cancelled', 'expired'].includes(item.status) && !isExpired(item.expires_at));
  if (existing) {
    return {
      success: true,
      code: 0,
      token: existing.token,
      share_path: `pages/driver/quick-quote/quick-quote?token=${existing.token}`,
    };
  }

  const token = `q_${crypto.randomBytes(8).toString('hex')}`;
  const now = new Date().toISOString();
  await db.collection('quote_invites').add({
    data: {
      request_id,
      token,
      invite_type: 'group',
      driver_id: '',
      driver_region: requestRes.data.driver_region,
      status: 'sent',
      expires_at,
      created_by: operator._id,
      created_at: now,
      updated_at: now,
    },
  });

  return {
    success: true,
    code: 0,
    token,
    share_path: `pages/driver/quick-quote/quick-quote?token=${token}`,
  };
};
