const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function isOperatorRole(user) {
  return user && user.status === 'active' && ['operator', 'super_admin'].includes(user.role);
}

function isDriverRole(user) {
  return user && user.status === 'active' && (user.role === 'driver' || !!user.driver_id);
}

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { success: true, role: 'guest', status: 'guest' };
  }

  const userRes = await db.collection('users').where({ openid: OPENID }).limit(1).get();
  const user = userRes.data[0];
  if (isOperatorRole(user)) {
    return {
      success: true,
      role: user.role,
      status: 'active',
      home_path: '/pages/operator/dashboard/dashboard',
      operator: {
        name: user.name || '',
        wechat_remark: user.wechat_remark || '',
      },
    };
  }

  if (isDriverRole(user)) {
    return {
      success: true,
      role: 'driver',
      status: 'active',
      home_path: '/pages/driver/home/home',
      driver: {
        driver_id: user.driver_id || '',
        name: user.name || '',
      },
    };
  }

  return { success: true, role: 'guest', status: 'guest' };
};
