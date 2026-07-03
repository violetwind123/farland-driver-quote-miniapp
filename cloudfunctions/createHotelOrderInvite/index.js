const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const { requireRole } = require('./auth');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const INVITES_COLLECTION = 'hotel_order_invites';
const DEFAULT_EXPIRES_DAYS = 30;

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
}

function firstText(...values) {
  for (const value of values) {
    const text = safeString(value).trim();
    if (text) return text;
  }
  return '';
}

function makeSafeId(value, fallback) {
  return firstText(value).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || fallback;
}

function buildInviteCode() {
  return `HO${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
}

async function generateUniqueInviteCode() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = buildInviteCode();
    const existing = await db.collection(INVITES_COLLECTION)
      .where({ invite_code: code })
      .limit(1)
      .get()
      .catch(() => ({ data: [] }));
    if (!existing.data || !existing.data.length) return code;
  }
  return `HO${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
}

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (error) {
    // Already exists.
  }
}

async function findTrip(tripId) {
  const safeTripId = safeString(tripId).trim();
  if (!safeTripId) return null;
  for (const field of ['trip_id', 'external_trip_id', 'trip_no']) {
    const res = await db.collection('customer_trips')
      .where({ [field]: safeTripId })
      .limit(1)
      .get()
      .catch(() => ({ data: [] }));
    if (res.data && res.data.length) return res.data[0];
  }
  const byDoc = await db.collection('customer_trips').doc(safeTripId).get().catch(() => null);
  return byDoc && byDoc.data ? byDoc.data : null;
}

function normalizeHotel(hotel = {}, index = 0) {
  const name = firstText(hotel.name, hotel.hotel_name, hotel.title);
  const address = firstText(hotel.address);
  if (!name && !address) return null;
  const hotelId = makeSafeId(firstText(hotel.hotel_id, hotel.card_id, hotel.id, name, address), `hotel_${index + 1}`);
  return {
    hotel_id: hotelId,
    card_id: firstText(hotel.card_id, hotel.id, hotelId),
    name: name || '酒店安排',
    hotel_name: name || '酒店安排',
    city: firstText(hotel.city),
    date_text: firstText(hotel.date_text),
    check_in_date: firstText(hotel.check_in_date, hotel.checkInDate, hotel.date),
    check_out_date: firstText(hotel.check_out_date, hotel.checkOutDate),
    arrival_time: firstText(hotel.arrival_time),
    address,
    room_summary: firstText(hotel.room_summary, hotel.roomSummary, hotel.room_type),
    room_type: firstText(hotel.room_type, hotel.room_summary, hotel.roomSummary),
    confirmation_no: firstText(hotel.confirmation_no, hotel.confirmationNo, hotel.confirmation_number, hotel.booking_reference),
    confirmation_number: firstText(hotel.confirmation_number, hotel.confirmation_no, hotel.confirmationNo, hotel.booking_reference),
    guest_name: firstText(hotel.guest_name, hotel.check_in_name, hotel.primary_guest_name),
    check_in_name: firstText(hotel.check_in_name, hotel.guest_name, hotel.primary_guest_name),
    booking_source: firstText(hotel.booking_source, hotel.source),
    status_text: firstText(hotel.status_text, hotel.statusText, hotel.status) || '已确认',
    note: firstText(hotel.customer_note, hotel.customer_visible_note, hotel.note),
    linked_day_no: Number(hotel.linked_day_no || hotel.day_no || 0),
  };
}

function hotelsFromSnapshot(snapshot = {}) {
  const days = Array.isArray(snapshot.itinerary_days) ? snapshot.itinerary_days : [];
  const hotels = [
    ...(Array.isArray(snapshot.hotel_cards) ? snapshot.hotel_cards : []),
    ...(Array.isArray(snapshot.hotels) ? snapshot.hotels : []),
    ...(Array.isArray(snapshot.hotel_requests) ? snapshot.hotel_requests : []),
    ...days.map((day, index) => {
      if (!day || !day.hotel) return null;
      return {
        ...day.hotel,
        check_in_date: day.hotel.check_in_date || day.hotel.date || day.date || '',
        linked_day_no: day.hotel.linked_day_no || day.day_no || index + 1,
        city: day.hotel.city || day.city || '',
      };
    }).filter(Boolean),
  ];

  const seen = new Set();
  return hotels.map(normalizeHotel).filter((hotel) => {
    if (!hotel) return false;
    const key = [
      hotel.hotel_id,
      hotel.name,
      hotel.check_in_date,
      hotel.check_out_date,
      hotel.linked_day_no,
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hotelMatches(hotel, event, index) {
  const requestedId = firstText(event.hotel_id, event.card_id, event.id);
  const requestedIndex = Number(event.hotel_index);
  if (requestedId) {
    return [hotel.hotel_id, hotel.card_id, hotel.id, hotel.name, hotel.hotel_name]
      .map((value) => safeString(value).trim())
      .includes(requestedId);
  }
  if (Number.isInteger(requestedIndex) && requestedIndex >= 0) return index === requestedIndex;
  return false;
}

function isActiveInvite(invite, now) {
  if (!invite || invite.status !== 'active') return false;
  if (!invite.expires_at) return true;
  const expires = new Date(invite.expires_at);
  return Number.isNaN(expires.getTime()) || expires.getTime() > now;
}

function sharePath(tripId, hotelId, inviteCode) {
  return `/pages/customer/hotel-detail/hotel-detail?trip_id=${encodeURIComponent(tripId)}&hotel_id=${encodeURIComponent(hotelId)}&invite_code=${encodeURIComponent(inviteCode)}`;
}

exports.main = async (event = {}) => {
  const auth = await requireRole(cloud, db, ['operator', 'super_admin']);
  if (!auth.ok) {
    return { success: false, code: auth.code, error_code: 'FORBIDDEN', message: auth.message };
  }

  // 撤销:运营可停用某张酒店分享卡(getHotelOrderByInvite 对 status!=='active' 一律拒)
  if (safeString(event.action).trim() === 'revoke') {
    const revokeCode = firstText(event.invite_code);
    if (!revokeCode) {
      return { success: false, code: 422, error_code: 'INVITE_CODE_REQUIRED', message: '请提供要撤销的 invite_code' };
    }
    const revokeRes = await db.collection(INVITES_COLLECTION)
      .where({ invite_code: revokeCode })
      .limit(1)
      .get()
      .catch(() => ({ data: [] }));
    const target = revokeRes.data && revokeRes.data[0];
    if (!target) {
      return { success: false, code: 404, error_code: 'INVITE_NOT_FOUND', message: '酒店分享卡不存在' };
    }
    const revokeIso = new Date().toISOString();
    await db.collection(INVITES_COLLECTION).doc(target._id).update({
      data: { status: 'revoked', revoked_at: revokeIso, revoked_by: auth.user._id, updated_at: revokeIso },
    });
    await db.collection('audit_logs').add({
      data: {
        actor_openid: auth.openid,
        actor_user_id: auth.user._id,
        actor_role: auth.user.role,
        action: 'hotel_order_invite_revoked',
        target_type: 'hotel_order_invite',
        target_id: target._id,
        detail: { invite_code: revokeCode, trip_id: target.trip_id || '', hotel_id: target.hotel_id || '' },
        created_at: revokeIso,
      },
    }).catch(() => null);
    return { success: true, code: 0, revoked: true, invite_code: revokeCode };
  }

  const tripId = firstText(event.trip_id, event.external_trip_id, event.trip_no);
  if (!tripId) {
    return { success: false, code: 422, error_code: 'TRIP_ID_REQUIRED', message: '请提供 trip_id' };
  }

  const trip = await findTrip(tripId);
  if (!trip) {
    return { success: false, code: 404, error_code: 'TRIP_NOT_FOUND', message: '行程不存在' };
  }
  if (trip.visibility_status !== 'published' || !trip.published_snapshot || !Object.keys(trip.published_snapshot).length) {
    return { success: false, code: 409, error_code: 'TRIP_NOT_PUBLISHED', message: '请先发布客户可见行程，再生成酒店分享卡' };
  }

  const canonicalTripId = trip.trip_id || trip.external_trip_id || tripId;
  const hotels = hotelsFromSnapshot(trip.published_snapshot);
  const hotelIndex = hotels.findIndex((hotel, index) => hotelMatches(hotel, event, index));
  const hotel = hotelIndex >= 0 ? hotels[hotelIndex] : null;
  if (!hotel) {
    return { success: false, code: 404, error_code: 'HOTEL_NOT_FOUND', message: '未找到已发布酒店信息' };
  }

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const expiresDays = Number(event.expires_in_days) > 0 ? Math.min(Number(event.expires_in_days), 90) : DEFAULT_EXPIRES_DAYS;
  await ensureCollection(INVITES_COLLECTION);

  const existingRes = await db.collection(INVITES_COLLECTION)
    .where({ trip_id: canonicalTripId, hotel_id: hotel.hotel_id, status: 'active' })
    .limit(10)
    .get()
    .catch(() => ({ data: [] }));
  const existing = (existingRes.data || [])
    .filter((invite) => isActiveInvite(invite, now))
    .sort((a, b) => safeString(b.created_at).localeCompare(safeString(a.created_at)))[0];
  if (existing) {
    // 行程已重新发布(版本变化)时,刷新复用 invite 的酒店快照,避免继续分享过期的酒店信息
    const currentVersion = trip.published_version || 0;
    if (Number(existing.published_version_snapshot || 0) !== Number(currentVersion)) {
      await db.collection(INVITES_COLLECTION).doc(existing._id).update({
        data: {
          hotel_snapshot: hotel,
          hotel_name: hotel.name || hotel.hotel_name || existing.hotel_name || '',
          published_version_snapshot: currentVersion,
          updated_at: nowIso,
        },
      }).catch(() => null);
    }
    return {
      success: true,
      code: 0,
      reused: true,
      trip_id: canonicalTripId,
      hotel_id: hotel.hotel_id,
      hotel_name: hotel.name || hotel.hotel_name || '',
      invite_id: existing._id,
      invite_code: existing.invite_code,
      share_path: sharePath(canonicalTripId, hotel.hotel_id, existing.invite_code),
      path: sharePath(canonicalTripId, hotel.hotel_id, existing.invite_code),
      expires_at: existing.expires_at || '',
    };
  }

  const inviteCode = await generateUniqueInviteCode();
  const expiresAt = new Date(now + expiresDays * 24 * 60 * 60 * 1000).toISOString();
  const inviteData = {
    invite_code: inviteCode,
    trip_id: canonicalTripId,
    external_trip_id: trip.external_trip_id || canonicalTripId,
    trip_no: trip.trip_no || trip.external_trip_id || canonicalTripId,
    hotel_id: hotel.hotel_id,
    hotel_index: hotelIndex,
    hotel_name: hotel.name || hotel.hotel_name || '',
    status: 'active',
    expires_at: expiresAt,
    hotel_snapshot: hotel,
    published_version_snapshot: trip.published_version || 0,
    created_by: auth.user._id,
    created_by_openid: auth.openid,
    created_at: nowIso,
    updated_at: nowIso,
  };
  const addRes = await db.collection(INVITES_COLLECTION).add({ data: inviteData });

  await db.collection('audit_logs').add({
    data: {
      actor_openid: auth.openid,
      actor_user_id: auth.user._id,
      actor_role: auth.user.role,
      action: 'hotel_order_invite_created',
      target_type: 'hotel_order_invite',
      target_id: addRes._id,
      detail: {
        trip_id: canonicalTripId,
        hotel_id: hotel.hotel_id,
        hotel_name: hotel.name || hotel.hotel_name || '',
        invite_code: inviteCode,
        expires_at: expiresAt,
      },
      created_at: nowIso,
    },
  }).catch(() => null);

  return {
    success: true,
    code: 0,
    reused: false,
    trip_id: canonicalTripId,
    hotel_id: hotel.hotel_id,
    hotel_name: hotel.name || hotel.hotel_name || '',
    invite_id: addRes._id,
    invite_code: inviteCode,
    share_path: sharePath(canonicalTripId, hotel.hotel_id, inviteCode),
    path: sharePath(canonicalTripId, hotel.hotel_id, inviteCode),
    expires_at: expiresAt,
  };
};
