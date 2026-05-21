const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const ACTIVE_REQUEST_STATUSES = ['quoting', 'quoted'];
const VEHICLE_TYPES = ['sedan', 'suv', 'suburban', 'van', 'sprinter', 'transit', 'bus', 'other'];

async function getOperator() {
  const { OPENID } = cloud.getWXContext();
  const userRes = await db.collection('users').where({ openid: OPENID }).limit(1).get();
  const user = userRes.data[0];
  return user && user.status === 'active' && ['operator', 'super_admin'].includes(user.role) ? user : null;
}

function isWithin24Hours(value) {
  if (!value) return false;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return false;
  const now = Date.now();
  return time >= now && time <= now + 24 * 60 * 60 * 1000;
}

function getDashboardTag(status, quoteCount, quoteDeadline) {
  if (status === 'assigned') return 'assigned';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'quoting') {
    if (quoteCount > 0) return 'pending_selection';
    if (isWithin24Hours(quoteDeadline)) return 'expiring_soon';
    if (quoteCount === 0) return 'no_quote';
  }
  return 'quoting';
}

function previewText(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > 80 ? `${text.slice(0, 80)}...` : text;
}

function emptySummary() {
  return {
    quoting_count: 0,
    pending_selection_count: 0,
    assigned_count: 0,
    cancelled_count: 0,
    no_quote_count: 0,
    expiring_soon_count: 0,
  };
}

async function buildRegionSummary() {
  const [driverRes, vehicleRes] = await Promise.all([
    db.collection('drivers').where({ status: 'active' }).limit(1000).get(),
    db.collection('vehicles').limit(1000).get(),
  ]);
  const vehicleMap = {};
  vehicleRes.data.forEach((vehicle) => {
    vehicleMap[vehicle._id] = vehicle;
  });
  const regionMap = {};

  driverRes.data.forEach((driver) => {
    const region = driver.service_region || '未设置';
    if (!regionMap[region]) {
      regionMap[region] = {
        region,
        driver_count: 0,
        vehicle_count: 0,
        vehicle_type_counts: {},
      };
      VEHICLE_TYPES.forEach((type) => {
        regionMap[region].vehicle_type_counts[type] = 0;
      });
    }
    regionMap[region].driver_count += 1;

    if (driver.default_vehicle_id) {
      const vehicle = vehicleMap[driver.default_vehicle_id];
      if (vehicle) {
        const vehicleType = vehicle.vehicle_type || 'other';
        regionMap[region].vehicle_count += 1;
        regionMap[region].vehicle_type_counts[vehicleType] = (regionMap[region].vehicle_type_counts[vehicleType] || 0) + 1;
      }
    }
  });

  return Object.values(regionMap).sort((a, b) => b.driver_count - a.driver_count);
}

async function decorateRequest(request) {
  const [inviteRes, quoteRes] = await Promise.all([
    db.collection('quote_invites').where({ request_id: request._id }).count(),
    db.collection('driver_quotes').where({ request_id: request._id }).count(),
  ]);
  const quoteCount = quoteRes.total;
  const dashboardTag = getDashboardTag(request.status, quoteCount, request.quote_deadline);
  return {
    _id: request._id,
    request_no: request.request_no,
    service_type: request.service_type,
    service_date: request.service_date,
    driver_region: request.driver_region,
    task_description_preview: previewText(request.task_description),
    quote_deadline: request.quote_deadline,
    status: request.status,
    quote_count: quoteCount,
    invite_count: inviteRes.total,
    dashboard_tag: dashboardTag,
    selected_quote_id: request.selected_quote_id || '',
    selected_driver_id: request.selected_driver_id || '',
    selected_vehicle_id: request.selected_vehicle_id || '',
    created_at: request.created_at,
    updated_at: request.updated_at,
  };
}

async function buildSummary() {
  const summary = emptySummary();
  const [quotingRes, assignedRes, cancelledRes] = await Promise.all([
    db.collection('ride_requests').where({ status: _.in(ACTIVE_REQUEST_STATUSES) }).count(),
    db.collection('ride_requests').where({ status: 'assigned' }).count(),
    db.collection('ride_requests').where({ status: 'cancelled' }).count(),
  ]);
  summary.quoting_count = quotingRes.total;
  summary.assigned_count = assignedRes.total;
  summary.cancelled_count = cancelledRes.total;

  const activeRes = await db.collection('ride_requests')
    .where({ status: _.in(ACTIVE_REQUEST_STATUSES) })
    .orderBy('created_at', 'desc')
    .limit(100)
    .get();
  await Promise.all(activeRes.data.map(async (request) => {
    const quoteRes = await db.collection('driver_quotes').where({ request_id: request._id }).count();
    const dashboardTag = getDashboardTag(request.status, quoteRes.total, request.quote_deadline);
    if (dashboardTag === 'pending_selection') summary.pending_selection_count += 1;
    if (dashboardTag === 'expiring_soon') summary.expiring_soon_count += 1;
    if (dashboardTag === 'no_quote') summary.no_quote_count += 1;
  }));

  return summary;
}

async function buildRequestList(tab) {
  let query = db.collection('ride_requests');
  if (tab === 'quoting' || tab === 'pending_selection') {
    query = query.where({ status: _.in(ACTIVE_REQUEST_STATUSES) });
  } else if (tab === 'assigned') {
    query = query.where({ status: 'assigned' });
  } else if (tab === 'cancelled') {
    query = query.where({ status: 'cancelled' });
  }

  const requestRes = await query.orderBy('created_at', 'desc').limit(50).get();
  let requests = await Promise.all(requestRes.data.map(decorateRequest));
  if (tab === 'pending_selection') {
    requests = requests.filter((request) => request.dashboard_tag === 'pending_selection');
  }
  return requests;
}

exports.main = async (event = {}) => {
  try {
    const user = await getOperator();
    if (!user) return { success: false, message: '无权限访问' };

    const mode = event.mode || 'summary';
    if (mode === 'summary') {
      return {
        success: true,
        summary: await buildSummary(),
      };
    }

    if (mode === 'requests') {
      return {
        success: true,
        requests: await buildRequestList(event.tab || 'all'),
      };
    }

    if (mode === 'driver_summary') {
      return {
        success: true,
        driver_region_summary: await buildRegionSummary(),
      };
    }

    return { success: false, message: '未知加载模式' };
  } catch (error) {
    return { success: false, message: '运营控制台加载失败，请稍后重试' };
  }
};
