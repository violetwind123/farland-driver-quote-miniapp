const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// web 写入的 status 枚举 → 客户端展示文案 + theme 状态标 class
// bookable 可预约 → success-soft(绿) | limited 名额紧张 → warn-soft(琥珀) | advance_required 需提前预约 → pending(蓝)
const STATUS_MAP = {
  bookable: { statusText: '可预约', statusClass: 'success-soft' },
  limited: { statusText: '名额紧张', statusClass: 'warn-soft' },
  advance_required: { statusText: '需提前预约', statusClass: 'pending' },
};

function text(value) {
  return value == null ? '' : String(value).trim();
}
function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

// 仅投影白名单 date 字段(iso/label),丢弃 quota/portal token 等
function projectDates(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((d) => {
      if (!isPlainObject(d)) return null;
      return { iso: text(d.iso), label: text(d.label) };
    })
    .filter((d) => d && (d.iso || d.label));
}

// 显式白名单投影:绝不 spread 原始 DB doc
function projectSchool(doc, tripDayMap) {
  const status = STATUS_MAP[text(doc.status)] || { statusText: '待查询', statusClass: 'neutral' };
  const slug = text(doc.school_slug);
  const durationMin = Number(doc.duration_min || 0);
  const durationText = durationMin > 0 ? `约 ${durationMin} 分钟` : text(doc.duration_text);
  const tripDay = tripDayMap && Object.prototype.hasOwnProperty.call(tripDayMap, slug)
    ? tripDayMap[slug]
    : null;
  return {
    slug,
    name: text(doc.name),
    nameEn: text(doc.name_en),
    location: text(doc.location),
    statusText: status.statusText,
    statusClass: status.statusClass,
    visitType: text(doc.visit_type),
    durationText,
    dates: projectDates(doc.dates),
    tripDay: typeof tripDay === 'number' ? tripDay : null,
  };
}

// 解析调用者当前活动行程的 school_slug → itinerary day index 映射(仅取 day 序号,绝不取司机身份)
async function resolveTripDayMap(OPENID) {
  const map = {};
  try {
    const tripRes = await db.collection('customer_trips')
      .where({ customer_openid: OPENID, visibility_status: 'visible' })
      .orderBy('updated_at', 'desc')
      .limit(1)
      .get()
      .catch(() => ({ data: [] }));
    const trip = tripRes.data && tripRes.data[0];
    if (!trip) return map;
    const days = Array.isArray(trip.published_snapshot && trip.published_snapshot.itinerary_days)
      ? trip.published_snapshot.itinerary_days
      : (Array.isArray(trip.itinerary_days) ? trip.itinerary_days : []);
    days.forEach((day, idx) => {
      const dayNo = Number(day && day.day_index) || (idx + 1);
      const visits = Array.isArray(day && day.visits) ? day.visits
        : (Array.isArray(day && day.schools) ? day.schools : []);
      visits.forEach((v) => {
        const slug = text(v && (v.school_slug || v.slug));
        if (slug && !Object.prototype.hasOwnProperty.call(map, slug)) map[slug] = dayNo;
      });
    });
  } catch (err) {
    return map;
  }
  return map;
}

exports.main = async (event = {}) => {
  // OPENID 门控:拒绝匿名读取
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { success: false, code: 401, error_code: 'UNAUTHENTICATED', schools: [] };
  }

  try {
    const filter = text(event.filter) || 'trip';
    const keyword = text(event.keyword);
    const schoolSlug = text(event.school_slug);

    const _ = db.command;
    const where = {};
    if (schoolSlug) where.school_slug = schoolSlug;
    // 服务端标记过滤;'trip' 依赖行程交集(下方处理),其余是记录布尔标
    if (filter === 'ivy') where.is_ivy = true;
    if (filter === 'info') where.has_info_session = true;

    let res = await db.collection('visit_bookable_dates')
      .where(where)
      .limit(100)
      .get()
      .catch(() => ({ data: [] }));

    let docs = Array.isArray(res.data) ? res.data : [];

    // tripDay 联动:解析调用者行程;失败或缺失时 tripDay 置 null,绝不阻塞列表渲染
    let tripDayMap = {};
    try {
      tripDayMap = await resolveTripDayMap(OPENID);
    } catch (err) {
      tripDayMap = {};
    }

    // 'trip' 过滤:与行程学校集合求交集
    if (filter === 'trip') {
      const tripSlugs = Object.keys(tripDayMap);
      if (tripSlugs.length) {
        docs = docs.filter((d) => tripSlugs.includes(text(d.school_slug)));
      }
    }

    // keyword 服务端过滤(name / name_en / location)
    if (keyword) {
      const kw = keyword.toLowerCase();
      docs = docs.filter((d) => {
        const hay = `${text(d.name)} ${text(d.name_en)} ${text(d.location)}`.toLowerCase();
        return hay.includes(kw);
      });
    }

    const schools = docs.map((d) => projectSchool(d, tripDayMap));

    // sync_label:优先记录级 sync_label,回退最近 synced_at
    let syncLabel = '';
    docs.forEach((d) => { if (!syncLabel && text(d.sync_label)) syncLabel = text(d.sync_label); });

    return { success: true, sync_label: syncLabel, schools };
  } catch (error) {
    // fail-closed:任何错误返回空列表,页面降级为空态 + 顾问兜底条
    return { success: false, schools: [] };
  }
};
