const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const INVITES_COLLECTION = 'hotel_order_invites';
const EVENTS_COLLECTION = 'hotel_order_invite_events';

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
}

function safeDocId(value) {
  return safeString(value).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 200);
}

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (error) {
    // Already exists.
  }
}

async function findInvite(inviteCode) {
  const code = safeString(inviteCode).trim();
  if (!code) return null;
  const res = await db.collection(INVITES_COLLECTION)
    .where({ invite_code: code })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }));
  return (res.data && res.data[0]) || null;
}

function validateInvite(invite, tripId, hotelId) {
  if (!invite) return { ok: false, error_code: 'INVITE_NOT_FOUND', message: '酒店分享卡不存在或已失效' };
  if (invite.status !== 'active') return { ok: false, error_code: 'INVITE_INACTIVE', message: '酒店分享卡已撤销或失效' };
  if (invite.expires_at) {
    const expires = new Date(invite.expires_at);
    if (!Number.isNaN(expires.getTime()) && expires.getTime() < Date.now()) {
      return { ok: false, error_code: 'INVITE_EXPIRED', message: '酒店分享卡已过期' };
    }
  }
  if (tripId && ![invite.trip_id, invite.external_trip_id, invite.trip_no].map(safeString).includes(tripId)) {
    return { ok: false, error_code: 'INVITE_TRIP_MISMATCH', message: '酒店分享卡与行程不匹配' };
  }
  if (hotelId && safeString(invite.hotel_id) !== hotelId) {
    return { ok: false, error_code: 'INVITE_HOTEL_MISMATCH', message: '酒店分享卡与酒店不匹配' };
  }
  return { ok: true };
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  const inviteCode = safeString(event.invite_code).trim();
  const tripId = safeString(event.trip_id).trim();
  const hotelId = safeString(event.hotel_id).trim();
  const invite = await findInvite(inviteCode);
  const validation = validateInvite(invite, tripId, hotelId);
  if (!validation.ok) {
    return { success: false, code: 403, error_code: validation.error_code, message: validation.message };
  }

  await ensureCollection(EVENTS_COLLECTION);
  const openedAt = new Date().toISOString();
  const eventDocId = safeDocId(`${invite._id || invite.invite_code}__${OPENID || 'anonymous'}__opened`);
  await db.collection(EVENTS_COLLECTION).doc(eventDocId).set({
    data: {
      invite_id: invite._id || '',
      invite_code: invite.invite_code,
      trip_id: invite.trip_id || '',
      hotel_id: invite.hotel_id || '',
      openid: OPENID || '',
      event: 'opened',
      created_at: openedAt,
    },
  }).catch(() => null);

  const hotel = invite.hotel_snapshot || {};
  return {
    success: true,
    code: 0,
    trip_id: invite.trip_id || '',
    trip_no: invite.trip_no || invite.external_trip_id || '',
    hotel_id: invite.hotel_id || '',
    invite_code: invite.invite_code || inviteCode,
    expires_at: invite.expires_at || '',
    hotel,
    share_title: `${hotel.name || hotel.hotel_name || invite.hotel_name || '酒店信息'}｜Farland 酒店确认`,
  };
};
