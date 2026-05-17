const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const REQUEST_ALLOWED = ['draft', 'quoting', 'quoted'];

function isExpired(expiresAt) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

exports.main = async (event) => {
  const {
    token,
    quote_price,
    currency = 'USD',
    quote_note = '',
    price_type,
    included_hours,
    overtime_rate,
  } = event || {};

  if (!token) return { success: false, message: '报价链接无效' };
  const price = Number(quote_price);
  if (Number.isNaN(price) || price <= 0) return { success: false, message: '报价金额必须大于0' };

  const inviteRes = await db.collection('quote_invites').where({ token }).limit(1).get();
  const invite = inviteRes.data[0];
  if (!invite || invite.status === 'cancelled') return { success: false, message: '该报价链接已失效' };

  if (isExpired(invite.expires_at)) {
    await db.collection('quote_invites').doc(invite._id).update({ data: { status: 'expired', updated_at: new Date().toISOString() } });
    return { success: false, message: '该报价链接已失效' };
  }

  const reqRes = await db.collection('ride_requests').doc(invite.request_id).get().catch(() => null);
  const request = reqRes && reqRes.data;
  if (!request || !REQUEST_ALLOWED.includes(request.status)) return { success: false, message: '当前订单状态不可报价' };

  const now = new Date().toISOString();
  const quoteRes = await db.collection('driver_quotes').where({ invite_token: token }).limit(1).get();
  const existing = quoteRes.data[0];

  const baseData = {
    request_id: invite.request_id,
    quote_invite_id: invite._id,
    invite_token: token,
    service_type: request.service_type,
    driver_id: invite.driver_id || '',
    driver_name: invite.driver_name,
    driver_phone: invite.driver_phone,
    quote_price: price,
    currency: currency || 'USD',
    quote_note,
    price_type: price_type || '',
    included_hours: included_hours || null,
    overtime_rate: overtime_rate || '',
    updated_at: now,
  };

  if (!existing) {
    await db.collection('driver_quotes').add({
      data: {
        ...baseData,
        quote_status: 'submitted',
        is_selected: false,
        selected_at: '',
        submitted_at: now,
      },
    });
  } else {
    await db.collection('driver_quotes').doc(existing._id).update({
      data: {
        ...baseData,
        quote_status: existing.quote_status === 'selected' ? 'selected' : 'updated',
      },
    });
  }

  await db.collection('quote_invites').doc(invite._id).update({
    data: {
      status: 'submitted',
      submitted_at: now,
      updated_at: now,
    },
  });

  return { success: true, message: '报价已提交，Farland 运营会再与您确认。' };
};
