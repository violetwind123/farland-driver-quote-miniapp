const cloud = require('wx-server-sdk');
const { requireRole } = require('./lib/auth');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
}
function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

async function findBooking(visitId) {
  const id = safeString(visitId).trim();
  if (!id) return null;
  // 主键 _id 优先,回退 external_visit_id
  const byDoc = await db.collection('visit_bookings').doc(id).get().catch(() => null);
  if (byDoc && byDoc.data) return byDoc.data;
  const byExternal = await db.collection('visit_bookings')
    .where({ external_visit_id: id })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }));
  return byExternal.data[0] || null;
}

// NET-NEW(仓库无先例):解析 confirmation.fileID -> tempFileURL,失败优雅回退(返回不含 fileUrl 的 confirmation)
async function resolveConfirmationFileUrl(confirmation) {
  if (!isPlainObject(confirmation)) return confirmation;
  const fileID = safeString(confirmation.fileID).trim();
  // 已有 fileUrl(web 侧写入)且无 fileID 时,原样返回
  if (!fileID) return confirmation;
  try {
    const result = await cloud.getTempFileURL({ fileList: [fileID] });
    const entry = result && Array.isArray(result.fileList) ? result.fileList[0] : null;
    if (entry && (entry.status === 0 || entry.status === undefined) && entry.tempFileURL) {
      return { ...confirmation, fileUrl: entry.tempFileURL, fileUrlResolved: true };
    }
    // status 非 0 或无 tempFileURL:优雅回退,保留已有 fileUrl(若有)
    return { ...confirmation, fileUrlResolved: false };
  } catch (error) {
    // getTempFileURL 抛错:优雅回退,不阻断详情
    return { ...confirmation, fileUrlResolved: false };
  }
}

async function writeAuditLog(data) {
  return db.collection('audit_logs').add({ data }).catch(() => null);
}

exports.main = async (event = {}) => {
  try {
    const auth = await requireRole(cloud, db, ['operator', 'super_admin']);
    if (!auth.ok) {
      return { success: false, code: auth.code || 403, error_code: 'FORBIDDEN', message: auth.message || '无权限访问' };
    }

    const visitId = safeString(event.visit_id).trim();
    if (!visitId) {
      return { success: false, code: 422, error_code: 'VISIT_ID_REQUIRED', message: '请提供 visit_id' };
    }

    const booking = await findBooking(visitId);
    if (!booking) {
      return { success: false, code: 404, error_code: 'VISIT_NOT_FOUND', message: '访校预约不存在' };
    }

    // 运营授权:返回完整 VisitBooking,含所有内部块(visitOffice/contactPerson/advisorNotes/materials/timeline)
    // 仅在运营端 .card-internal 内渲染
    const confirmation = await resolveConfirmationFileUrl(booking.confirmation);
    const fullVisit = { ...booking, confirmation };

    const nowIso = new Date().toISOString();
    await writeAuditLog({
      actor_openid: auth.openid || '',
      actor_user_id: auth.user ? auth.user._id : '',
      actor_role: auth.user ? (auth.user.role || '') : 'operator',
      action: 'visit_booking_detail_opened_operator',
      target_type: 'visit_booking',
      target_id: booking._id || visitId,
      detail: {
        external_visit_id: booking.external_visit_id || '',
        status: booking.status || '',
      },
      created_at: nowIso,
    });

    return {
      success: true,
      code: 0,
      visit: fullVisit,
      meta: {
        source_collection: 'visit_bookings',
        confirmation_file_resolved: isPlainObject(confirmation) ? Boolean(confirmation.fileUrlResolved) : false,
      },
    };
  } catch (error) {
    console.error('[getOperatorVisitBookingDetail] failed', error);
    return {
      success: false,
      code: 500,
      error_code: 'GET_OPERATOR_VISIT_BOOKING_DETAIL_FAILED',
      message: '访校预约详情加载失败，请稍后重试',
      err_msg: error && error.errMsg ? error.errMsg : '',
    };
  }
};
