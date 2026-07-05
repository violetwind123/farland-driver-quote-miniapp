const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function text(value) {
  return value == null ? '' : String(value).trim();
}

// 顾问代约意向落库(advisor-proxy):无在线支付路径。
// OPENID 门控:拒绝匿名写入(createHotelRequest 无鉴权,此处必须加,勿复制其无鉴权形态)。
// 客户端联系方式(phone/wechat/email)一律不接收、不落库 —— 顾问从 OPENID 绑定的客户档案侧解析联系方式。
exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { success: false, code: 401, error_code: 'UNAUTHENTICATED', message: '无法识别用户身份' };
  }

  const now = new Date().toISOString();
  const data = {
    customer_openid: OPENID,
    school_slug: text(event.school_slug),
    requested_date_iso: text(event.requested_date_iso),
    note: String(event.note == null ? '' : event.note).slice(0, 500),
    status: 'new',
    channel: 'advisor_proxy',
    online_pay: false,
    created_at: now,
    updated_at: now,
  };

  try {
    const addRes = await db.collection('visit_booking_intents').add({ data });
    return { success: true, intent_id: addRes._id };
  } catch (error) {
    return { success: false, message: '提交失败' };
  }
};
