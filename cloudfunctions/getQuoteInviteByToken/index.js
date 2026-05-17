const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const REQUEST_ALLOWED = ['draft', 'quoting', 'quoted'];

function isExpired(expiresAt) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

exports.main = async (event) => {
  const { token } = event || {};
  if (!token) return { success: false, message: '该报价链接已失效' };

  const inviteRes = await db.collection('quote_invites').where({ token }).limit(1).get();
  const invite = inviteRes.data[0];
  if (!invite || invite.status === 'cancelled') return { success: false, message: '该报价链接已失效' };

  if (isExpired(invite.expires_at)) {
    await db.collection('quote_invites').doc(invite._id).update({ data: { status: 'expired', updated_at: new Date().toISOString() } });
    return { success: false, message: '该报价链接已失效' };
  }

  const reqRes = await db.collection('ride_requests').doc(invite.request_id).get().catch(() => null);
  const request = reqRes && reqRes.data;
  if (!request || !REQUEST_ALLOWED.includes(request.status)) return { success: false, message: '该报价链接已失效' };

  let currentStatus = invite.status;
  if (invite.status === 'sent') {
    const now = new Date().toISOString();
    await db.collection('quote_invites').doc(invite._id).update({ data: { status: 'viewed', viewed_at: now, updated_at: now } });
    currentStatus = 'viewed';
  }

  const quoteRes = await db.collection('driver_quotes').where({ invite_token: token }).limit(1).get();
  const existing = quoteRes.data[0] || null;

  return {
    success: true,
    invite: {
      driver_name: invite.driver_name,
      status: currentStatus,
      expires_at: invite.expires_at,
    },
    request: {
      request_no: request.request_no,
      service_type: request.service_type,
      service_subtype: request.service_subtype,
      pickup_date: request.pickup_date,
      pickup_time: request.pickup_time,
      pickup_location: request.pickup_location,
      dropoff_location: request.dropoff_location,
      stops: request.stops || [],
      passengers: request.passengers,
      luggage_count: request.luggage_count,
      vehicle_requirement: request.vehicle_requirement,
      language_requirement: request.language_requirement,
      sign_required: request.sign_required,
      child_seat_required: request.child_seat_required,
      airport_transfer: request.airport_transfer,
      flight_no: request.flight_no,
      flight_time: request.flight_time,
      service_city: request.service_city,
      service_area: request.service_area,
      start_time: request.start_time,
      end_time: request.end_time,
      estimated_hours: request.estimated_hours,
      itinerary_summary: request.itinerary_summary,
      special_requests: request.special_requests,
      quote_deadline: request.quote_deadline,
    },
    existing_quote: existing ? {
      quote_price: existing.quote_price,
      currency: existing.currency,
      quote_note: existing.quote_note,
      quote_status: existing.quote_status,
      price_type: existing.price_type,
      included_hours: existing.included_hours,
      overtime_rate: existing.overtime_rate,
    } : null,
  };
};
