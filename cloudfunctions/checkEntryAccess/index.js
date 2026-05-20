const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { success: true, role: 'guest', status: 'guest' };
  }

  const userRes = await db.collection('users').where({ openid: OPENID }).limit(1).get();
  const user = userRes.data[0];
  if (user && user.role === 'operator' && user.status === 'active') {
    return {
      success: true,
      role: 'operator',
      status: 'active',
      home_path: '/pages/operator/dashboard/dashboard',
      operator: {
        name: user.name || '',
        wechat_remark: user.wechat_remark || '',
      },
    };
  }

  return { success: true, role: 'guest', status: 'guest' };
};
