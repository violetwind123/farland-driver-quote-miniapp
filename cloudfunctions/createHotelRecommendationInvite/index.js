const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const { requireRole } = require('./auth');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const INVITES_COLLECTION = 'hotel_recommendation_invites';
const DEFAULT_EXPIRES_DAYS = 30;

function safeString(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function firstText(...values) {
  for (const value of values) {
    const text = safeString(value);
    if (text) return text;
  }
  return '';
}

function normalizeImagePath(value) {
  const text = safeString(value);
  if (/^https:\/\//i.test(text) || /^cloud:\/\//i.test(text)) return text.slice(0, 1000);
  if (/^\/assets\/images\/[A-Za-z0-9_.\/-]+$/.test(text)) return text;
  return '';
}

function normalizeTextArray(value, limit = 8) {
  const seen = new Set();
  return (Array.isArray(value) ? value : [])
    .map((item) => safeString(item).slice(0, 80))
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .slice(0, limit);
}

function normalizeImages(hotel = {}) {
  const raw = [
    ...(Array.isArray(hotel.images) ? hotel.images : []),
    hotel.image_url,
    hotel.image,
    hotel.photo_url,
    hotel.cover,
  ];
  const seen = new Set();
  return raw.map((item) => {
    if (item && typeof item === 'object') {
      return normalizeImagePath(item.url || item.image_url || item.src);
    }
    return normalizeImagePath(item);
  }).filter((item) => {
    if (!item || seen.has(item)) return false;
    seen.add(item);
    return true;
  }).slice(0, 8);
}

function normalizeHotelSnapshot(hotel = {}) {
  const name = firstText(hotel.name, hotel.displayName, hotel.hotel_name, hotel.name_en);
  if (!name) return null;
  const images = normalizeImages(hotel);
  const providerHotelId = firstText(
    hotel.provider_hotel_id,
    hotel.elong_hotel_id,
    hotel.providerHotelId,
    hotel.detailHotelId,
  );
  return {
    hotel_id: firstText(hotel.hotel_id, hotel.farland_hotel_id, providerHotelId, name).slice(0, 160),
    farland_hotel_id: firstText(hotel.farland_hotel_id).slice(0, 160),
    provider_hotel_id: providerHotelId.slice(0, 160),
    elong_hotel_id: providerHotelId.slice(0, 160),
    name: name.slice(0, 180),
    name_en: firstText(hotel.name_en, hotel.displayNameEn).slice(0, 180),
    address: firstText(hotel.address, hotel.displayAddress, hotel.hotel_address).slice(0, 500),
    full_address: firstText(hotel.full_address, hotel.displayAddress, hotel.address).slice(0, 500),
    hotel_city: firstText(hotel.hotel_city, hotel.city).slice(0, 100),
    hotel_state: firstText(hotel.hotel_state, hotel.state).slice(0, 100),
    postal_code: firstText(hotel.postal_code, hotel.zip).slice(0, 40),
    country: firstText(hotel.country).slice(0, 80),
    group: firstText(hotel.group).slice(0, 100),
    type: firstText(hotel.type).slice(0, 100),
    school_slug: firstText(hotel.school_slug).slice(0, 160),
    school_name: firstText(hotel.school_name, hotel.schoolName).slice(0, 180),
    school_name_zh: firstText(hotel.school_name_zh, hotel.schoolNameZh).slice(0, 180),
    distance: firstText(hotel.distance).slice(0, 80),
    drive_time: firstText(hotel.drive_time, hotel.driveTime).slice(0, 80),
    reason: firstText(hotel.reason, hotel.displayReason).slice(0, 600),
    source_type: firstText(hotel.source_type).slice(0, 120),
    price_band: firstText(hotel.price_band, hotel.referencePrice).slice(0, 100),
    verify_note: firstText(hotel.verify_note).slice(0, 300),
    transit_risk_level: firstText(hotel.transit_risk_level).slice(0, 40),
    transit_note: firstText(hotel.transit_note, hotel.transportNote).slice(0, 500),
    recommendation_label: firstText(hotel.recommendation_label).slice(0, 80),
    tags: normalizeTextArray(hotel.tags, 8),
    amenities: normalizeTextArray(hotel.amenities, 12),
    facilities: normalizeTextArray(hotel.facilities, 12),
    images,
    image_url: images[0] || '',
  };
}

function normalizeDate(value) {
  const text = safeString(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function normalizeCount(value, fallback, max) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1) return fallback;
  return Math.min(count, max);
}

function normalizeNights(value) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1) return 0;
  return Math.min(count, 90);
}

function normalizeSearch(search = {}) {
  return {
    check_in_date: normalizeDate(search.check_in_date),
    check_out_date: normalizeDate(search.check_out_date),
    rooms: normalizeCount(search.rooms, 1, 4),
    guests: normalizeCount(search.guests, 2, 8),
  };
}

function normalizeDisplay(display = {}) {
  return {
    title: firstText(display.title).slice(0, 220),
    subtitle: firstText(display.subtitle).slice(0, 220),
    search_meta: firstText(display.search_meta, display.searchMeta).slice(0, 160),
    display_check_in: firstText(display.display_check_in, display.displayCheckIn).slice(0, 40),
    display_check_out: firstText(display.display_check_out, display.displayCheckOut).slice(0, 40),
    nights: normalizeNights(display.nights),
  };
}

function buildInviteCode() {
  return `HR${crypto.randomBytes(10).toString('hex').toUpperCase()}`;
}

function buildHotelKey(hotel) {
  const source = [
    hotel.provider_hotel_id,
    hotel.farland_hotel_id,
    hotel.hotel_id,
    hotel.name,
    hotel.address,
  ].filter(Boolean).join('|').toLowerCase();
  return crypto.createHash('sha256').update(source).digest('hex').slice(0, 32);
}

function sharePath(inviteCode) {
  return `/pages/hotel/detail/detail?recommendation_code=${encodeURIComponent(inviteCode)}`;
}

function isActiveInvite(invite, now) {
  if (!invite || invite.status !== 'active') return false;
  const expires = new Date(invite.expires_at || '');
  return Number.isNaN(expires.getTime()) || expires.getTime() > now;
}

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (error) {
    // Collection already exists.
  }
}

exports.main = async (event = {}) => {
  const auth = await requireRole(cloud, db, ['operator', 'super_admin']);
  if (!auth.ok) {
    return { success: false, code: auth.code, error_code: 'FORBIDDEN', message: auth.message };
  }

  const hotel = normalizeHotelSnapshot(event.hotel || {});
  if (!hotel) {
    return { success: false, code: 422, error_code: 'HOTEL_REQUIRED', message: '请先选择要分享的酒店' };
  }

  const search = normalizeSearch(event.search || {});
  const display = normalizeDisplay(event.display || {});
  const hotelKey = buildHotelKey(hotel);
  const schoolSlug = firstText(event.school_slug, hotel.school_slug).slice(0, 160);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const expiresDays = Number(event.expires_in_days) > 0
    ? Math.min(Number(event.expires_in_days), 90)
    : DEFAULT_EXPIRES_DAYS;
  const expiresAt = new Date(now + expiresDays * 24 * 60 * 60 * 1000).toISOString();

  await ensureCollection(INVITES_COLLECTION);
  const existingRes = await db.collection(INVITES_COLLECTION)
    .where({ hotel_key: hotelKey })
    .limit(20)
    .get()
    .catch(() => ({ data: [] }));
  const existing = (existingRes.data || [])
    .filter((invite) => invite.created_by === auth.user._id)
    .filter((invite) => safeString(invite.school_slug) === schoolSlug)
    .filter((invite) => isActiveInvite(invite, now))
    .sort((a, b) => safeString(b.updated_at).localeCompare(safeString(a.updated_at)))[0];

  const shareTitle = `${hotel.name}｜Farland 酒店推荐`;
  if (existing) {
    await db.collection(INVITES_COLLECTION).doc(existing._id).update({
      data: {
        hotel_snapshot: hotel,
        search_snapshot: search,
        display_snapshot: display,
        hotel_name: hotel.name,
        school_slug: schoolSlug,
        share_title: shareTitle,
        share_image: hotel.image_url || '',
        expires_at: expiresAt,
        updated_at: nowIso,
      },
    });
    return {
      success: true,
      code: 0,
      reused: true,
      invite_code: existing.invite_code,
      share_path: sharePath(existing.invite_code),
      share_title: shareTitle,
      share_image: hotel.image_url || '',
      expires_at: expiresAt,
    };
  }

  const inviteCode = buildInviteCode();
  const inviteData = {
    invite_code: inviteCode,
    hotel_key: hotelKey,
    hotel_name: hotel.name,
    school_slug: schoolSlug,
    status: 'active',
    hotel_snapshot: hotel,
    search_snapshot: search,
    display_snapshot: display,
    share_title: shareTitle,
    share_image: hotel.image_url || '',
    expires_at: expiresAt,
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
      action: 'hotel_recommendation_invite_created',
      target_type: 'hotel_recommendation_invite',
      target_id: addRes._id,
      detail: {
        invite_code: inviteCode,
        hotel_name: hotel.name,
        provider_hotel_id: hotel.provider_hotel_id || '',
        school_slug: schoolSlug,
        expires_at: expiresAt,
      },
      created_at: nowIso,
    },
  }).catch(() => null);

  return {
    success: true,
    code: 0,
    reused: false,
    invite_code: inviteCode,
    share_path: sharePath(inviteCode),
    share_title: shareTitle,
    share_image: hotel.image_url || '',
    expires_at: expiresAt,
  };
};
