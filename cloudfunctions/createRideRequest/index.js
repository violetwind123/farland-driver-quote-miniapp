const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

async function getOperator() {
  const { OPENID } = cloud.getWXContext();
  const userRes = await db.collection('users').where({ openid: OPENID }).limit(1).get();
  const user = userRes.data[0];
  return user && user.status === 'active' && ['operator', 'super_admin'].includes(user.role) ? user : null;
}

function buildRequestNo() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `FR${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

exports.main = async (event) => {
  const user = await getOperator();
  if (!user) return { success: false, message: '无权限访问' };

  const {
    service_type,
    service_date,
    driver_region,
    task_description,
    quote_deadline,
    internal_note = '',
  } = event || {};
  if (!['transfer', 'charter'].includes(service_type)) {
    return { success: false, message: '服务类型无效' };
  }
  if (!service_date || !driver_region || !task_description || !quote_deadline) {
    return { success: false, message: '缺少必填字段' };
  }

  const now = new Date().toISOString();
  const data = {
    request_no: buildRequestNo(),
    service_type,
    service_date,
    driver_region,
    task_description,
    quote_deadline,
    internal_note,
    status: 'quoting',
    created_by: user._id,
    created_at: now,
    updated_at: now,
  };

  const created = await db.collection('ride_requests').add({ data });
  return { success: true, request_id: created._id, request_no: data.request_no };
};
