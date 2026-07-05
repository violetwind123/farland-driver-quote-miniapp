const cloud = require('wx-server-sdk');
const { requireRole } = require('./lib/auth');
const { writeAuditLog } = require('./lib/audit');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
}

function hasObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
}

function generateInviteCode() {
  const time = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `FT${time}${random}`;
}

function isActiveInvite(invite, now) {
  if (!invite || invite.status !== 'active') return false;
  const expiresAt = invite.expires_at instanceof Date ? invite.expires_at : new Date(invite.expires_at);
  return !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() >= now.getTime();
}

function normalizeBindMode(value) {
  if (value === 'farland_profile' || value === 'profile') return 'farland_profile';
  if (value === 'trip_only') return 'trip_only';
  return 'farland_profile';
}

function toIso(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

async function findTrip(tripId) {
  const safeTripId = safeString(tripId).trim();
  if (!safeTripId) return null;
  const queries = [
    { trip_id: safeTripId },
    { external_trip_id: safeTripId },
    { trip_no: safeTripId },
  ];
  for (const query of queries) {
    const res = await db.collection('customer_trips')
      .where(query)
      .limit(1)
      .get()
      .catch(() => ({ data: [] }));
    if (res.data[0]) return res.data[0];
  }
  const byDoc = await db.collection('customer_trips').doc(safeTripId).get().catch(() => null);
  return byDoc && byDoc.data ? byDoc.data : null;
}

async function loadCustomer(customerUserId) {
  const safeCustomerUserId = safeString(customerUserId).trim();
  if (!safeCustomerUserId) return null;
  const userRes = await db.collection('users').doc(safeCustomerUserId).get().catch(() => null);
  const user = userRes && userRes.data;
  if (!user || user.role !== 'customer' || user.status !== 'active') return null;
  return user;
}

function buildIntendedCustomerFields({ customer, bindMode, visibleUntil, nowIso }) {
  if (!customer) return {};
  const displayName = customer.display_name || customer.name || '';
  return {
    intended_customer_user_id: customer._id || '',
    intended_customer_name: displayName,
    intended_customer_display_name: displayName,
    intended_customer_profile_id: customer.customer_profile_id || '',
    intended_bind_mode: bindMode,
    intended_visible_until: visibleUntil || '',
    intended_customer_source: 'operator_share_card',
    intended_customer_updated_at: nowIso,
  };
}

// 客户分享主路径 = customer/home;home 按 stage 判定显示手机行程单草稿入口 or 正式行程 UI,
// 同一链接在正式发布后自动升级。mobile-itinerary 仅作图片查看子页,不作分享主入口。
function buildTripSharePath(canonicalTripId, inviteCode) {
  return `/pages/customer/home/home?trip_id=${encodeURIComponent(canonicalTripId)}&invite_code=${encodeURIComponent(inviteCode)}`;
}

// itinerary_sheet:顶层字段,持久 URL(https/cloud)才算已生成
function itinerarySheetReady(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const url = safeString(value.png_url).trim();
  const m = /^([a-z][a-z0-9+.-]*:)/i.exec(url);
  return Boolean(m && ['https:', 'cloud:'].includes(m[1].toLowerCase()));
}

exports.main = async (event = {}) => {
  try {
    const auth = await requireRole(cloud, db, ['operator', 'super_admin']);
    if (!auth.ok) {
      return { success: false, code: auth.code, error_code: 'FORBIDDEN', message: auth.message };
    }

    const tripId = safeString(event.trip_id || event.external_trip_id || event.trip_no).trim();
    if (!tripId) {
      return { success: false, code: 422, error_code: 'TRIP_ID_REQUIRED', message: '请提供 trip_id' };
    }

    const trip = await findTrip(tripId);
    if (!trip) {
      return { success: false, code: 404, error_code: 'TRIP_NOT_FOUND', message: '行程不存在' };
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const canonicalTripId = trip.trip_id || trip.external_trip_id || tripId;
    const effectiveTrip = trip;

    // 两层可转发规则:已正式发布 → official invite;否则有手机版行程单图 → sheet_draft invite;都没有 → 拒
    const isOfficialReady = effectiveTrip.visibility_status === 'published'
      && effectiveTrip.review_status === 'approved'
      && hasObject(effectiveTrip.published_snapshot);
    const inviteStage = isOfficialReady
      ? 'official'
      : (itinerarySheetReady(effectiveTrip.itinerary_sheet) ? 'sheet_draft' : '');
    if (!inviteStage) {
      return {
        success: false,
        code: 409,
        error_code: 'ITINERARY_NOT_READY',
        message: '手机版行程单尚未生成，无法转发',
        trip_id: canonicalTripId,
      };
    }

    const safeDays = Math.max(1, Math.min(Number(event.expires_in_days || 30), 90));
    const expiresAt = new Date(now.getTime() + safeDays * 24 * 60 * 60 * 1000);
    const customerUserId = safeString(event.customer_user_id || event.user_id).trim();
    const customer = customerUserId ? await loadCustomer(customerUserId) : null;
    if (customerUserId && !customer) {
      return {
        success: false,
        code: 404,
        error_code: 'CUSTOMER_NOT_FOUND',
        message: '客户不存在或不可绑定',
        trip_id: canonicalTripId,
      };
    }
    const bindMode = normalizeBindMode(event.bind_mode || event.access_type || 'farland_profile');
    const visibleUntil = bindMode === 'trip_only'
      ? (toIso(event.visible_until) || expiresAt.toISOString())
      : toIso(event.visible_until);
    const existingRes = await db.collection('customer_trip_invites')
      .where({ trip_id: canonicalTripId, status: 'active' })
      .limit(10)
      .get()
      .catch(() => ({ data: [] }));
    const existingInvite = (existingRes.data || [])
      .filter((invite) => isActiveInvite(invite, now))
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0];
    if (existingInvite) {
      const sharePath = buildTripSharePath(canonicalTripId, existingInvite.invite_code);
      const intendedFields = buildIntendedCustomerFields({ customer, bindMode, visibleUntil, nowIso });
      await db.collection('customer_trip_invites').doc(existingInvite._id).update({
        data: {
          share_path: sharePath,
          path: sharePath,
          ...intendedFields,
          updated_at: nowIso,
        },
      });
      if (Object.keys(intendedFields).length) {
        await writeAuditLog(db, {
          actor_openid: auth.openid,
          actor_user_id: auth.user._id,
          actor_role: auth.user.role,
          action: 'customer_trip_invite_intended_customer_updated',
          target_type: 'customer_trip_invite',
          target_id: existingInvite._id,
          detail: {
            trip_id: canonicalTripId,
            customer_user_id: customer._id,
            invite_id: existingInvite._id,
            invite_code: existingInvite.invite_code || '',
            reused_invite: true,
            bind_mode: bindMode,
          },
          created_at: nowIso,
        }).catch(() => null);
      }
      return {
        success: true,
        code: 0,
        trip_id: canonicalTripId,
        invite_id: existingInvite._id,
        invite_code: existingInvite.invite_code,
        share_path: sharePath,
        path: sharePath,
        expires_at: existingInvite.expires_at instanceof Date ? existingInvite.expires_at.toISOString() : existingInvite.expires_at,
        reused: true,
        stage: inviteStage,
        customer_bound: false,
        customer_trip_access_id: '',
        access_reused: false,
        intended_customer_user_id: customer ? customer._id : (existingInvite.intended_customer_user_id || ''),
        intended_customer_name: customer ? (customer.display_name || customer.name || '') : (existingInvite.intended_customer_name || ''),
      };
    }

    let inviteCode = generateInviteCode();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const existingCodeRes = await db.collection('customer_trip_invites')
        .where({ invite_code: inviteCode })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
      if (!existingCodeRes.data.length) break;
      inviteCode = generateInviteCode();
    }

    const sharePath = buildTripSharePath(canonicalTripId, inviteCode);
    const inviteData = {
      invite_code: inviteCode,
      trip_id: canonicalTripId,
      external_trip_id: effectiveTrip.external_trip_id || canonicalTripId,
      trip_no: effectiveTrip.trip_no || effectiveTrip.external_trip_id || canonicalTripId,
      share_path: sharePath,
      path: sharePath,
      status: 'active',
      stage: inviteStage,
      visibility_status_snapshot: effectiveTrip.visibility_status || '',
      published_version_snapshot: effectiveTrip.published_version || 0,
      expires_at: expiresAt,
      created_by: auth.user._id,
      created_by_openid: auth.openid,
      created_at: nowIso,
      updated_at: nowIso,
      ...buildIntendedCustomerFields({ customer, bindMode, visibleUntil, nowIso }),
    };
    const addRes = await db.collection('customer_trip_invites').add({ data: inviteData });

    await writeAuditLog(db, {
      actor_openid: auth.openid,
      actor_user_id: auth.user._id,
      actor_role: auth.user.role,
      action: 'customer_trip_invite_created',
      target_type: 'customer_trip_invite',
      target_id: addRes._id,
      detail: {
        trip_id: canonicalTripId,
        external_trip_id: effectiveTrip.external_trip_id || '',
        invite_code: inviteCode,
        expires_at: expiresAt.toISOString(),
        published_version: effectiveTrip.published_version || 0,
        customer_user_id: customer ? customer._id : '',
        intended_customer_user_id: customer ? customer._id : '',
        intended_customer_name: customer ? (customer.display_name || customer.name || '') : '',
        customer_trip_access_id: '',
        customer_bound: false,
        bind_mode: customer ? bindMode : '',
      },
      created_at: nowIso,
    }).catch(() => null);

    return {
      success: true,
      code: 0,
      trip_id: canonicalTripId,
      invite_id: addRes._id,
      invite_code: inviteCode,
      share_path: sharePath,
      path: sharePath,
      expires_at: expiresAt.toISOString(),
      reused: false,
      stage: inviteStage,
      customer_bound: false,
      customer_trip_access_id: '',
      access_reused: false,
      intended_customer_user_id: customer ? customer._id : '',
      intended_customer_name: customer ? (customer.display_name || customer.name || '') : '',
    };
  } catch (error) {
    console.error('[createCustomerTripInvite] failed', error);
    return {
      success: false,
      code: 500,
      error_code: 'CREATE_CUSTOMER_TRIP_INVITE_FAILED',
      message: error && error.message ? error.message : '客户行程分享卡生成失败',
      err_msg: error && error.errMsg ? error.errMsg : '',
    };
  }
};
