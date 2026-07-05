const cloud = require('wx-server-sdk');
const { requireRole } = require('./lib/auth');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 8 态(§2);运营端列表可见全部态,客户端才过滤到 confirmed
const ALLOWED_STATUS = [
  'pending_query', 'available', 'submitted', 'awaiting_school',
  'confirmed', 'materials_needed', 'conflict', 'cancelled',
];

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
}
function normalizeText(value) {
  return safeString(value).trim().toLowerCase();
}
function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}
function toIso(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? safeString(value) : date.toISOString();
}
function maxIso(values) {
  const sorted = values.map(toIso).filter(Boolean).sort();
  return sorted.pop() || '';
}

// 分组日期:优先 confirmedSlot.date,回退 requestedSlots[0].date
function groupDate(booking) {
  const confirmed = isPlainObject(booking.confirmedSlot) ? safeString(booking.confirmedSlot.date).trim() : '';
  if (confirmed) return confirmed;
  const slots = Array.isArray(booking.requestedSlots) ? booking.requestedSlots : [];
  return slots.length ? safeString(slots[0] && slots[0].date).trim() : '';
}
// 组内排序键:confirmedSlot.start,回退 requestedSlots[0].time(§1 requestedSlots 项为 {date,time})
function startKey(booking) {
  const confirmed = isPlainObject(booking.confirmedSlot) ? safeString(booking.confirmedSlot.start).trim() : '';
  if (confirmed) return confirmed;
  const slots = Array.isArray(booking.requestedSlots) ? booking.requestedSlots : [];
  return slots.length ? safeString(slots[0] && slots[0].time).trim() : '';
}

function studentIds(booking) {
  const students = Array.isArray(booking.students) ? booking.students : [];
  return students.map((s) => safeString(s && s.id).trim()).filter(Boolean);
}

// 时间重叠(同 confirmedSlot.date 且 [start,end) 交叠)
function slotsOverlap(a, b) {
  const sa = isPlainObject(a.confirmedSlot) ? a.confirmedSlot : null;
  const sb = isPlainObject(b.confirmedSlot) ? b.confirmedSlot : null;
  if (!sa || !sb) return false;
  const da = safeString(sa.date).trim();
  const dbb = safeString(sb.date).trim();
  if (!da || da !== dbb) return false;
  const aStart = safeString(sa.start).trim();
  const aEnd = safeString(sa.end).trim();
  const bStart = safeString(sb.start).trim();
  const bEnd = safeString(sb.end).trim();
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  // 字符串时间(HH:mm)可直接比较;交叠 <=> aStart < bEnd && bStart < aEnd
  return aStart < bEnd && bStart < aEnd;
}

// 冲突判定:同学生 id 且 confirmedSlot 时间重叠 -> 两卡都标记
function computeConflicts(bookings) {
  const conflictMap = {};
  for (let i = 0; i < bookings.length; i += 1) {
    for (let j = i + 1; j < bookings.length; j += 1) {
      const a = bookings[i];
      const b = bookings[j];
      const idsA = studentIds(a);
      const idsB = studentIds(b);
      const shared = idsA.some((id) => idsB.includes(id));
      if (!shared) continue;
      if (!slotsOverlap(a, b)) continue;
      const idA = safeString(a._id).trim();
      const idB = safeString(b._id).trim();
      if (idA) conflictMap[idA] = idB;
      if (idB) conflictMap[idB] = idA;
    }
  }
  return conflictMap;
}

function materialsCount(booking) {
  const materials = Array.isArray(booking.materials) ? booking.materials : [];
  const total = materials.length;
  const missing = materials.filter((m) => m && m.status === 'missing').length;
  const submitted = materials.filter((m) => m && m.status === 'submitted').length;
  const verified = materials.filter((m) => m && m.status === 'verified').length;
  return { total, missing, submitted, verified };
}

function matchesSearch(booking, keyword) {
  if (!keyword) return true;
  const school = isPlainObject(booking.school) ? booking.school : {};
  const students = Array.isArray(booking.students) ? booking.students : [];
  const text = [
    school.nameCn, school.nameEn, school.city, school.campus,
    booking.external_visit_id,
    ...students.map((s) => (s ? s.name : '')),
  ].map(normalizeText).join(' ');
  return text.includes(keyword);
}

function matchesFilters(booking, filters) {
  if (!isPlainObject(filters)) return true;
  const school = isPlainObject(booking.school) ? booking.school : {};
  if (filters.school && normalizeText(school.nameCn).indexOf(normalizeText(filters.school)) === -1
      && normalizeText(school.nameEn).indexOf(normalizeText(filters.school)) === -1) {
    return false;
  }
  if (filters.city && normalizeText(school.city) !== normalizeText(filters.city)) return false;
  if (filters.date && groupDate(booking) !== safeString(filters.date).trim()) return false;
  if (filters.status && safeString(booking.status).trim() !== safeString(filters.status).trim()) return false;
  if (filters.student) {
    const students = Array.isArray(booking.students) ? booking.students : [];
    const hit = students.some((s) => s
      && (normalizeText(s.id) === normalizeText(filters.student)
        || normalizeText(s.name).indexOf(normalizeText(filters.student)) !== -1));
    if (!hit) return false;
  }
  return true;
}

async function loadBookingPool() {
  const ordered = await db.collection('visit_bookings')
    .orderBy('updated_at', 'desc')
    .limit(300)
    .get()
    .catch(() => null);
  if (ordered && ordered.data) return ordered.data;
  const fallback = await db.collection('visit_bookings')
    .limit(300)
    .get()
    .catch(() => ({ data: [] }));
  return fallback.data || [];
}

exports.main = async (event = {}) => {
  try {
    const auth = await requireRole(cloud, db, ['operator', 'super_admin']);
    if (!auth.ok) {
      return { success: false, code: auth.code || 403, error_code: 'FORBIDDEN', message: auth.message || '无权限访问' };
    }

    const keyword = normalizeText(event.search || '');
    const filters = isPlainObject(event.filters) ? event.filters : {};

    const pool = await loadBookingPool();
    const filtered = pool
      .filter((b) => matchesSearch(b, keyword))
      .filter((b) => matchesFilters(b, filters));

    // 冲突基于全量已筛选集合判定(同学生 + confirmedSlot 重叠)
    const conflictMap = computeConflicts(filtered);

    // 数据同步时间:全集最新 updated_at
    const dataSyncTime = maxIso(filtered.map((b) => b.updated_at || b.created_at));

    // 派生每条 booking 展示字段(运营看全量原始 doc + derived)
    const enriched = filtered.map((b) => {
      const id = safeString(b._id).trim();
      const derivedConflictWith = conflictMap[id] || safeString(b.conflictWith).trim() || null;
      return {
        ...b,
        _derived: {
          conflictWith: derivedConflictWith,
          hasConflict: Boolean(derivedConflictWith),
          materialsCount: materialsCount(b),
          groupDate: groupDate(b),
          startKey: startKey(b),
          statusKnown: ALLOWED_STATUS.includes(safeString(b.status).trim()),
        },
      };
    });

    // 按日期分组,组内按开始时间排序;已取消置组尾
    const groupsMap = {};
    enriched.forEach((b) => {
      const key = b._derived.groupDate || '未排期';
      if (!groupsMap[key]) groupsMap[key] = [];
      groupsMap[key].push(b);
    });
    const dayGroups = Object.keys(groupsMap)
      .sort((a, b) => a.localeCompare(b))
      .map((date) => {
        const items = groupsMap[date].slice().sort((a, b) => {
          const aCancelled = a.status === 'cancelled' ? 1 : 0;
          const bCancelled = b.status === 'cancelled' ? 1 : 0;
          if (aCancelled !== bCancelled) return aCancelled - bCancelled;
          return safeString(a._derived.startKey).localeCompare(safeString(b._derived.startKey));
        });
        const conflictCount = items.filter((it) => it._derived.hasConflict).length;
        return {
          date,
          count: items.length,
          conflictCount,
          items,
        };
      });

    return {
      success: true,
      code: 0,
      dayGroups,
      meta: {
        search: keyword,
        filters,
        count: enriched.length,
        dataSyncTime,
        source_collection: 'visit_bookings',
        // cursor 预留:当前一次性返回 300 上限,后续可加游标分页
        cursor: null,
      },
    };
  } catch (error) {
    console.error('[listOperatorVisitBookings] failed', error);
    return {
      success: false,
      code: 500,
      error_code: 'LIST_OPERATOR_VISIT_BOOKINGS_FAILED',
      message: '访校预约列表加载失败，请稍后重试',
      err_msg: error && error.errMsg ? error.errMsg : '',
    };
  }
};
