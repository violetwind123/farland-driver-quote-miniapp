const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function isVisible(access, now) {
  if (!access || access.status !== 'active') return false;
  if (!access.visible_until) return true;
  const visibleUntil = access.visible_until instanceof Date ? access.visible_until : new Date(access.visible_until);
  return Number.isNaN(visibleUntil.getTime()) || visibleUntil.getTime() >= now.getTime();
}

function emptyHome(user) {
  return {
    success: true,
    access_status: 'empty',
    profile: {
      name: user && user.name ? user.name : '欢迎使用 Farland',
      member_level: '',
      points_balance: 0,
      subtitle: '请通过 Farland 顾问发送的行程卡片查看您的专属安排',
    },
    today_itinerary: null,
    trip_overview: [],
    transportation_appointments: [],
    charter_services: [],
    transfer_requests: [],
    transport_orders: [],
    hotel_requests: [],
    benefits: [],
  };
}

function statusClass(status, hasQuotes) {
  if (status === 'cancelled') return 'cancelled';
  if (status === 'assigned' || status === 'confirmed') return 'confirmed';
  if (hasQuotes) return 'quoted';
  return 'pending';
}

function statusText(status, hasQuotes) {
  if (status === 'cancelled') return '用车需求已取消';
  if (status === 'assigned' || status === 'confirmed') return '接送已预约';
  if (hasQuotes) return '已收到优选用车方案';
  return 'Farland 正在为您确认用车方案';
}

function toTransferRequest(request, quotes) {
  const hasQuotes = quotes.length > 0;
  return {
    request_id: request._id,
    title: request.request_no ? `用车方案 ${request.request_no}` : 'Farland 用车方案',
    created_by_text: request.customer_name ? `${request.customer_name} 的用车需求` : '由 Farland 顾问为您安排',
    pickup: request.pickup || request.pickup_location || request.driver_region || '待确认',
    dropoff: request.dropoff || request.dropoff_location || '待确认',
    pickup_time_text: request.pickup_time_text || request.pickup_time || request.service_date || '待确认',
    passengers: request.passengers || request.passenger_count || '-',
    luggage: request.luggage || request.luggage_count || '-',
    status: request.status || '',
    status_text: statusText(request.status, hasQuotes),
    ops_status_text: hasQuotes ? 'Farland 已为您筛选优选用车方案。' : 'Farland 正在为您确认用车方案。',
    quoteCount: quotes.length,
    statusClass: statusClass(request.status, hasQuotes),
    quotes,
    assigned_transport: null,
    cancel_reason_driver: request.cancel_reason_driver || '',
  };
}

function toClientQuote(quote) {
  return {
    quote_id: quote._id,
    public_title: quote.title || 'Farland 用车方案',
    suitable_for: quote.operator_explanation || '',
    vehicle_class: quote.vehicle_type_snapshot || '',
    capacity_text: `${quote.seats_snapshot || '-'} 人 / ${quote.luggage_capacity_snapshot || '-'} 件行李`,
    driver_profile_teaser: quote.driver_profile_teaser || '由 Farland 严选车队提供',
    includes: quote.included_items || [],
    excludes: quote.excluded_items || [],
    valid_until_text: quote.valid_until || '',
    driver_quote_amount: quote.driver_quote_amount,
    farland_service_fee_rate: quote.farland_service_fee_rate || 0.1,
    farland_service_fee_amount: quote.farland_service_fee_amount,
    client_visible_total: quote.client_total,
    currency: quote.currency || 'USD',
    is_recommended: Boolean(quote.is_recommended),
    status: quote.quote_status,
  };
}

function normalizeTripOverview(trips) {
  return trips.map((trip, index) => ({
    day: index + 1,
    date: trip.date_start || '',
    city: trip.city || '',
    title: trip.title || 'Farland 行程',
    status: trip.status === 'active' ? 'confirmed' : (trip.status || 'pending'),
    summary: trip.summary || '',
  }));
}

function collectTripData(trips) {
  const firstTrip = trips[0] || null;
  const daily = trips.reduce((acc, trip) => acc.concat(trip.daily_itinerary || []), []);
  const hotelRequests = trips.reduce((acc, trip) => acc.concat(trip.hotel_requests || []), []);
  const charterServices = trips.reduce((acc, trip) => acc.concat(trip.charter_services || []), []);
  const benefits = trips.reduce((acc, trip) => acc.concat(trip.benefits || []), []);
  return {
    today_itinerary: daily[0] || null,
    trip_overview: normalizeTripOverview(trips),
    hotel_requests: hotelRequests,
    charter_services: charterServices,
    benefits,
    advisor: firstTrip && firstTrip.advisor ? firstTrip.advisor : null,
  };
}

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { success: false, code: 401, error_code: 'UNAUTHENTICATED', message: '无法识别用户身份' };
  }

  const [userRes, accessRes, inviteRes, directRequestRes] = await Promise.all([
    db.collection('users').where({ openid: OPENID }).limit(1).get().catch(() => ({ data: [] })),
    db.collection('customer_trip_access').where({ customer_openid: OPENID }).limit(50).get().catch(() => ({ data: [] })),
    db.collection('customer_invites').where({ claimed_openid: OPENID, status: 'claimed' }).limit(20).get().catch(() => ({ data: [] })),
    db.collection('ride_requests').where({ customer_openid: OPENID }).limit(20).get().catch(() => ({ data: [] })),
  ]);

  const user = userRes.data[0] || null;
  const now = new Date();
  const allAccess = accessRes.data || [];
  const allAccessRequestIds = new Set(allAccess.map((access) => access.request_id).filter(Boolean));
  const activeAccess = allAccess.filter((access) => isVisible(access, now));
  const expiredAccess = allAccess.filter((access) => access.status === 'active' && !isVisible(access, now));
  await Promise.all(expiredAccess.map((access) => {
    return db.collection('customer_trip_access').doc(access._id).update({
      data: {
        status: 'expired',
        updated_at: now.toISOString(),
      },
    }).catch(() => null);
  }));

  const invites = inviteRes.data || [];
  const directRequests = directRequestRes.data || [];
  const hasProfile = Boolean(user && user.role === 'customer' && user.status === 'active')
    || activeAccess.some((access) => access.access_type === 'profile')
    || invites.some((invite) => invite.bind_type !== 'trip_only');
  const tripOnlyRequestIds = invites
    .filter((invite) => invite.bind_type === 'trip_only' && !allAccessRequestIds.has(invite.request_id))
    .map((invite) => invite.request_id);
  const accessRequestIds = activeAccess.map((access) => access.request_id);
  const profileRequestIds = hasProfile
    ? directRequests.filter((request) => !allAccessRequestIds.has(request._id)).map((request) => request._id)
    : [];
  const visibleRequestIds = unique([...accessRequestIds, ...profileRequestIds, ...tripOnlyRequestIds]);
  const visibleTripIds = unique(activeAccess.map((access) => access.trip_id));

  if (!visibleRequestIds.length && !visibleTripIds.length) {
    return emptyHome(user);
  }

  let customerTrips = [];
  if (visibleTripIds.length) {
    const tripRes = await db.collection('customer_trips')
      .where({ trip_id: _.in(visibleTripIds), status: _.in(['active', 'completed']) })
      .limit(20)
      .get()
      .catch(() => ({ data: [] }));
    customerTrips = tripRes.data || [];
  }

  const requestMap = new Map(directRequests.map((request) => [request._id, request]));
  const missingIds = visibleRequestIds.filter((id) => !requestMap.has(id));
  if (missingIds.length) {
    const missingRes = await db.collection('ride_requests')
      .where({ _id: _.in(missingIds) })
      .limit(20)
      .get()
      .catch(() => ({ data: [] }));
    (missingRes.data || []).forEach((request) => requestMap.set(request._id, request));
  }

  const requests = visibleRequestIds.map((id) => requestMap.get(id)).filter(Boolean);
  const quoteRes = visibleRequestIds.length
    ? await db.collection('customer_transport_quotes')
      .where({ request_id: _.in(visibleRequestIds), quote_status: _.in(['published', 'viewed', 'selected', 'confirmed']) })
      .orderBy('is_recommended', 'desc')
      .orderBy('updated_at', 'desc')
      .limit(60)
      .get()
      .catch(() => ({ data: [] }))
    : { data: [] };
  const quotesByRequest = (quoteRes.data || []).reduce((acc, quote) => {
    if (!acc[quote.request_id]) acc[quote.request_id] = [];
    if (acc[quote.request_id].length < 3) acc[quote.request_id].push(toClientQuote(quote));
    return acc;
  }, {});

  const transferRequests = requests
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
    .map((request) => toTransferRequest(request, quotesByRequest[request._id] || []));
  const firstInvite = invites[0] || {};
  const firstTrip = customerTrips[0] || {};
  const displayName = (user && user.name)
    || (firstTrip.customer && firstTrip.customer.display_name)
    || firstInvite.display_name
    || firstInvite.customer_name
    || (requests[0] && requests[0].customer_name)
    || 'Farland 客户';
  const tripOnly = activeAccess.length ? !activeAccess.some((access) => access.access_type === 'profile') : !hasProfile;
  const tripData = collectTripData(customerTrips);

  return {
    success: true,
    access_status: tripOnly ? 'trip_only' : 'profile',
    profile: {
      name: displayName,
      member_level: tripOnly ? '本次行程查看' : 'Farland Signature',
      points_balance: tripOnly ? 0 : 3280,
      subtitle: tripOnly ? 'Farland 顾问已为您同步本次行程与报价' : '您的行程与报价已由 Farland 顾问同步',
    },
    today_itinerary: tripData.today_itinerary,
    trip_overview: tripData.trip_overview,
    transportation_appointments: [],
    charter_services: tripData.charter_services,
    transfer_requests: transferRequests,
    transport_orders: [],
    hotel_requests: tripData.hotel_requests,
    benefits: tripData.benefits.length ? tripData.benefits : (tripOnly ? [] : [
      {
        title: '机场接送礼遇',
        description: '指定城市机场接送服务可享 Farland 会员权益',
      },
      {
        title: '酒店预订礼遇',
        description: '顾问协助筛选校园周边与高端品牌酒店方案',
      },
    ]),
  };
};
