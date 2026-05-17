const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const ALLOWED_REQUEST_STATUSES = ['draft', 'quoting'];

exports.main = async (event, context) => {
  const { request_id, driver_name, driver_phone, driver_wechat = '', expires_at } = event || {};
  const wxContext = cloud.getWXContext();

  if (!request_id || !driver_name || !driver_phone || !expires_at) {
    return { success: false, message: '参数不完整' };
  }

  const requestRes = await db.collection('ride_requests').doc(request_id).get().catch(() => null);
  if (!requestRes || !requestRes.data) return { success: false, message: '用车需求不存在' };
  if (!ALLOWED_REQUEST_STATUSES.includes(requestRes.data.status)) return { success: false, message: '当前订单状态不可报价' };

  let token = '';
  for (let i = 0; i < 5; i += 1) {
    token = `qq_${crypto.randomBytes(8).toString('hex')}`;
    const exists = await db.collection('quote_invites').where({ token }).limit(1).get();
    if (!exists.data.length) break;
  }

  const now = new Date().toISOString();
  await db.collection('quote_invites').add({
    data: {
      request_id,
      token,
      driver_id: '',
      driver_name,
      driver_phone,
      driver_wechat,
      invite_channel: 'wechat',
      status: 'sent',
      expires_at,
      viewed_at: '',
      submitted_at: '',
      created_by: wxContext.OPENID || '',
      created_at: now,
      updated_at: now,
    },
  });

  return {
    success: true,
    token,
    share_path: `/pages/driver/quick-quote/quick-quote?token=${token}`,
  };
};
