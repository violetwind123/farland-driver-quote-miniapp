const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const INVITES_COLLECTION = 'hotel_recommendation_invites';
const EVENTS_COLLECTION = 'hotel_recommendation_invite_events';

function safeString(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function safeDocId(value) {
  return safeString(value).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 200);
}

function publicHotel(hotel = {}) {
  return {
    hotel_id: safeString(hotel.hotel_id),
    farland_hotel_id: safeString(hotel.farland_hotel_id),
    provider_hotel_id: safeString(hotel.provider_hotel_id),
    elong_hotel_id: safeString(hotel.elong_hotel_id),
    name: safeString(hotel.name),
    name_en: safeString(hotel.name_en),
    address: safeString(hotel.address),
    full_address: safeString(hotel.full_address),
    hotel_city: safeString(hotel.hotel_city),
    hotel_state: safeString(hotel.hotel_state),
    postal_code: safeString(hotel.postal_code),
    country: safeString(hotel.country),
    group: safeString(hotel.group),
    type: safeString(hotel.type),
    school_slug: safeString(hotel.school_slug),
    school_name: safeString(hotel.school_name),
    school_name_zh: safeString(hotel.school_name_zh),
    distance: safeString(hotel.distance),
    drive_time: safeString(hotel.drive_time),
    reason: safeString(hotel.reason),
    source_type: safeString(hotel.source_type),
    price_band: safeString(hotel.price_band),
    verify_note: safeString(hotel.verify_note),
    transit_risk_level: safeString(hotel.transit_risk_level),
    transit_note: safeString(hotel.transit_note),
    recommendation_label: safeString(hotel.recommendation_label),
    tags: Array.isArray(hotel.tags) ? hotel.tags.map(safeString).filter(Boolean).slice(0, 8) : [],
    amenities: Array.isArray(hotel.amenities) ? hotel.amenities.map(safeString).filter(Boolean).slice(0, 12) : [],
    facilities: Array.isArray(hotel.facilities) ? hotel.facilities.map(safeString).filter(Boolean).slice(0, 12) : [],
    images: Array.isArray(hotel.images) ? hotel.images.map(safeString).filter(Boolean).slice(0, 8) : [],
    image_url: safeString(hotel.image_url),
  };
}

function publicSearch(search = {}) {
  return {
    check_in_date: safeString(search.check_in_date),
    check_out_date: safeString(search.check_out_date),
    rooms: Math.max(1, Math.min(Number(search.rooms) || 1, 4)),
    guests: Math.max(1, Math.min(Number(search.guests) || 2, 8)),
  };
}

function publicDisplay(display = {}) {
  const nights = Number(display.nights);
  return {
    title: safeString(display.title),
    subtitle: safeString(display.subtitle),
    search_meta: safeString(display.search_meta),
    display_check_in: safeString(display.display_check_in),
    display_check_out: safeString(display.display_check_out),
    nights: Number.isInteger(nights) && nights > 0 ? Math.min(nights, 90) : 0,
  };
}

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (error) {
    // Collection already exists.
  }
}

async function findInvite(inviteCode) {
  const code = safeString(inviteCode);
  if (!code) return null;
  const res = await db.collection(INVITES_COLLECTION)
    .where({ invite_code: code })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }));
  return (res.data && res.data[0]) || null;
}

function validateInvite(invite) {
  if (!invite) return { ok: false, error_code: 'INVITE_NOT_FOUND', message: '酒店推荐已失效或不存在' };
  if (invite.status !== 'active') return { ok: false, error_code: 'INVITE_INACTIVE', message: '酒店推荐已撤销或失效' };
  const expires = new Date(invite.expires_at || '');
  if (!Number.isNaN(expires.getTime()) && expires.getTime() < Date.now()) {
    return { ok: false, error_code: 'INVITE_EXPIRED', message: '酒店推荐已过期，请联系顾问重新发送' };
  }
  return { ok: true };
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  const inviteCode = safeString(event.recommendation_code || event.invite_code);
  const invite = await findInvite(inviteCode);
  const validation = validateInvite(invite);
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
      hotel_key: invite.hotel_key || '',
      school_slug: invite.school_slug || '',
      openid: OPENID || '',
      event: 'opened',
      created_at: openedAt,
      updated_at: openedAt,
    },
  }).catch(() => null);

  return {
    success: true,
    code: 0,
    recommendation_code: invite.invite_code || inviteCode,
    expires_at: invite.expires_at || '',
    hotel: publicHotel(invite.hotel_snapshot || {}),
    search: publicSearch(invite.search_snapshot || {}),
    display: publicDisplay(invite.display_snapshot || {}),
    share_title: safeString(invite.share_title),
    share_image: safeString(invite.share_image),
  };
};
