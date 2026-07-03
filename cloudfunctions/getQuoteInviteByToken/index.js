const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function isExpired(expiresAt) {
  return expiresAt && new Date(expiresAt).getTime() < Date.now();
}

function toTime(value) {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function isQuoteFromCurrentRound(quote, invite, request) {
  if (!quote) return false;
  if (quote.token && invite.token && quote.token === invite.token) return true;
  const reopenedAt = toTime(request.reopened_at);
  if (!reopenedAt) return true;
  const quoteTime = toTime(quote.resubmitted_at || quote.updated_at || quote.submitted_at || quote.created_at);
  return Boolean(quoteTime && quoteTime >= reopenedAt);
}

exports.main = async (event = {}) => {
  const { token } = event;
  const { OPENID } = cloud.getWXContext();
  if (!token) return { success: false, code: 400, message: '缺少 token', msg: '缺少 token' };

  const inviteRes = await db.collection('quote_invites').where({ token }).limit(1).get();
  const invite = inviteRes.data[0];
  if (!invite) return { success: false, code: 404, message: '报价链接无效', msg: '报价链接无效' };
  const requestRes = await db.collection('ride_requests').doc(invite.request_id).get().catch(() => null);
  const request = requestRes && requestRes.data;
  if (!request) {
    return { success: false, code: 410, message: '当前报价单不可查看', msg: '当前报价单不可查看' };
  }
  if (invite.status === 'cancelled' || request.status === 'cancelled') {
    return {
      success: false,
      code: 410,
      status: 'cancelled',
      message: '本报价单已取消',
      msg: '本报价单已取消',
      cancel_reason_type: request.cancel_reason_type || '',
      cancel_reason_driver: request.cancel_reason_driver || '本报价单已取消，如有疑问，请联系 Farland 运营。',
    };
  }
  if (!['quoting', 'quoted', 'assigned'].includes(request.status)) {
    return { success: false, code: 410, message: '当前报价单不可查看', msg: '当前报价单不可查看' };
  }

  if (isExpired(invite.expires_at) && request.status !== 'assigned') {
    await db.collection('quote_invites').doc(invite._id).update({
      data: { status: 'expired', updated_at: new Date().toISOString() },
    });
    return { success: false, code: 410, message: '报价已截止', msg: '报价已截止' };
  }

  if (invite.status === 'sent') {
    await db.collection('quote_invites').doc(invite._id).update({
      data: { status: 'viewed', updated_at: new Date().toISOString() },
    });
  }

  const userRes = await db.collection('users').where({ openid: OPENID }).limit(1).get();
  const user = userRes.data[0];
  let driver = null;
  let vehicle = null;
  let driverStatus = 'unregistered';
  if (user && user.driver_id) {
    const driverRes = await db.collection('drivers').doc(user.driver_id).get().catch(() => null);
    driver = driverRes && driverRes.data;
    if (driver) {
      driverStatus = 'registered_no_vehicle';
      if (driver.default_vehicle_id) {
        const vehicleRes = await db.collection('vehicles').doc(driver.default_vehicle_id).get().catch(() => null);
        vehicle = vehicleRes && vehicleRes.data;
        if (vehicle) driverStatus = 'registered_with_vehicle';
      }
    }
  }

  const existingRes = user && user.driver_id ? await db.collection('driver_quotes').where({
    request_id: invite.request_id,
    driver_id: user.driver_id,
  }).limit(1).get() : { data: [] };
  const existingQuote = isQuoteFromCurrentRound(existingRes.data[0], invite, request) ? existingRes.data[0] : null;

  return {
    success: true,
    code: 0,
    invite: {
      token: invite.token,
      status: invite.status,
      expires_at: invite.expires_at,
    },
    request: {
      _id: request._id,
      request_no: request.request_no,
      service_type: request.service_type,
      service_type_label: request.service_type_label || '',
      task_title: request.task_title || '',
      service_date: request.service_date,
      driver_region: request.driver_region,
      task_description: request.task_description,
      route_text: request.route_text || [request.pickup || request.pickup_location || '', request.dropoff || request.dropoff_location || ''].filter(Boolean).join(' -> '),
      time_summary: request.time_summary || '',
      flight_summary: request.flight_summary || '',
      execution_note: request.dispatch_note || request.special_requests || '',
      pickup: request.pickup || request.pickup_location || '',
      dropoff: request.dropoff || request.dropoff_location || '',
      pickup_time_text: request.pickup_time_text || request.pickup_time || '',
      estimated_drive_time: request.estimated_drive_time || '',
      estimated_distance: request.estimated_distance || '',
      flight_no: request.flight_no || '',
      terminal: request.terminal || '',
      scheduled_flight_time: request.scheduled_flight_time || '',
      driver_arrive_time: request.driver_arrive_time || '',
      quote_deadline: request.quote_deadline,
      status: request.status,
    },
    driver_status: driverStatus,
    driver: driver ? {
      _id: driver._id,
      name: driver.name,
      phone: driver.phone,
      service_region: driver.service_region,
    } : null,
    vehicle: vehicle ? {
      _id: vehicle._id,
      vehicle_type: vehicle.vehicle_type,
      vehicle_model: vehicle.vehicle_model,
      seats: vehicle.seats,
      luggage_capacity: vehicle.luggage_capacity,
      plate_number: vehicle.plate_number,
    } : null,
    is_registered: driverStatus === 'registered_with_vehicle',
    existing_quote: existingQuote ? {
      quote_price: existingQuote.quote_price,
      currency: existingQuote.currency,
      quote_note: existingQuote.quote_note,
      quote_status: existingQuote.quote_status,
      updated_at: existingQuote.updated_at,
    } : null,
  };
};
