const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

async function requireRole(cloudSdk, database, roles) {
  const { OPENID } = cloudSdk.getWXContext();
  if (!OPENID) return { ok: false, code: 401, message: '无法识别用户身份' };

  const userRes = await database.collection('users').where({ openid: OPENID }).limit(1).get();
  const user = userRes.data[0];
  if (!user || user.status !== 'active' || !roles.includes(user.role)) {
    return { ok: false, code: 403, message: '无权限访问' };
  }
  return { ok: true, openid: OPENID, user };
}

// §2 8 态
const ALLOWED_STATUS = [
  'pending_query', 'available', 'submitted', 'awaiting_school',
  'confirmed', 'materials_needed', 'conflict', 'cancelled',
];

// mini-program dispatch 只写运营生命周期字段,NOT web-authoritative source 字段
// (external_visit_id / school / visitType / requestedSlots 等 web 源字段不由动作改)
const ACTIONS = [
  'submit', 'mark_awaiting_school', 'upload_confirmation',
  'mark_materials_needed', 'mark_materials_complete',
  'reschedule', 'status_change', 'cancel',
];

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
}
function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}
function createError(errorCode, message, code) {
  const error = new Error(message || errorCode);
  error.error_code = errorCode;
  error.code = code || 400;
  return error;
}

async function findBooking(visitId) {
  const id = safeString(visitId).trim();
  if (!id) return null;
  const byDoc = await db.collection('visit_bookings').doc(id).get().catch(() => null);
  if (byDoc && byDoc.data) return { doc: byDoc.data, _id: byDoc.data._id || id };
  const byExternal = await db.collection('visit_bookings')
    .where({ external_visit_id: id })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }));
  const row = byExternal.data[0];
  return row ? { doc: row, _id: row._id } : null;
}

// §2 合法流转:待查询→可预约→已提交→学校待确认→已确认;任意态→已取消;
// 已确认可叠加"需补材料";materials_complete 回到 confirmed。
// action -> { requireFrom?: [statuses], to: nextStatus, guard? }
function resolveTransition(action, current, payload) {
  const from = safeString(current).trim();
  switch (action) {
    case 'submit': {
      // 可预约 -> 已提交(备选时段 <=2 + students)
      const slots = Array.isArray(payload.requestedSlots) ? payload.requestedSlots : [];
      if (slots.length > 2) throw createError('TOO_MANY_SLOTS', '备选时段上限 2 个', 400);
      if (!Array.isArray(payload.students) || !payload.students.length) {
        throw createError('STUDENTS_REQUIRED', '提交预约需选择学生', 400);
      }
      if (!['available', 'pending_query', 'submitted'].includes(from)) {
        throw createError('ILLEGAL_TRANSITION', `不能从 ${from} 提交预约`, 409);
      }
      return {
        to: 'submitted',
        set: {
          requestedSlots: slots,
          students: payload.students,
          schoolNote: safeString(payload.schoolNote || payload.note),
        },
        toast: '已提交 · 状态更新为已提交',
      };
    }
    case 'mark_awaiting_school': {
      if (from !== 'submitted') throw createError('ILLEGAL_TRANSITION', `不能从 ${from} 标记学校待确认`, 409);
      return { to: 'awaiting_school', set: {}, toast: '已提交 · 状态更新为学校待确认' };
    }
    case 'upload_confirmation': {
      // 学校待确认 -> 已确认;必须带 confirmation 文件 + 确认号 + confirmedSlot
      const fileID = safeString(payload.confirmation && payload.confirmation.fileID);
      const fileUrl = safeString(payload.confirmation && payload.confirmation.fileUrl);
      const confirmationNo = safeString(payload.confirmation && payload.confirmation.confirmationNo);
      if (!fileID && !fileUrl) throw createError('CONFIRMATION_FILE_REQUIRED', '上传确认需确认函文件', 400);
      if (!confirmationNo) throw createError('CONFIRMATION_NO_REQUIRED', '上传确认需确认号', 400);
      if (!isPlainObject(payload.confirmedSlot) || !safeString(payload.confirmedSlot.date).trim()) {
        throw createError('CONFIRMED_SLOT_REQUIRED', '上传确认需确认时段', 400);
      }
      if (!['awaiting_school', 'submitted'].includes(from)) {
        throw createError('ILLEGAL_TRANSITION', `不能从 ${from} 上传确认`, 409);
      }
      return {
        to: 'confirmed',
        set: {
          confirmedSlot: payload.confirmedSlot,
          confirmation: {
            fileID: fileID || undefined,
            fileUrl: fileUrl || undefined,
            confirmationNo,
          },
        },
        stampConfirmation: true,
        toast: '已上传确认 · 状态更新为已确认',
      };
    }
    case 'mark_materials_needed': {
      // 需补材料可叠加在已确认上(§2);不覆盖已确认主态语义,但 status 设为 materials_needed
      if (!['confirmed', 'materials_needed'].includes(from)) {
        throw createError('ILLEGAL_TRANSITION', `不能从 ${from} 标记需补材料`, 409);
      }
      const materials = Array.isArray(payload.materials) ? payload.materials : undefined;
      return {
        to: 'materials_needed',
        set: materials ? { materials } : {},
        toast: '已标记 · 需补材料',
      };
    }
    case 'mark_materials_complete': {
      if (from !== 'materials_needed') throw createError('ILLEGAL_TRANSITION', `不能从 ${from} 标记材料齐`, 409);
      const materials = Array.isArray(payload.materials) ? payload.materials : undefined;
      return {
        to: 'confirmed',
        set: materials ? { materials } : {},
        toast: '已标记 · 材料齐全，回到已确认',
      };
    }
    case 'reschedule': {
      // 已确认 / 时间冲突 -> 已确认(用新的 confirmedSlot 覆盖)。
      // 只改运营生命周期的 confirmedSlot,不动 web 源字段;需带日期。
      if (!isPlainObject(payload.confirmedSlot) || !safeString(payload.confirmedSlot.date).trim()) {
        throw createError('CONFIRMED_SLOT_REQUIRED', '改期需新的确认时段', 400);
      }
      if (!['confirmed', 'conflict'].includes(from)) {
        throw createError('ILLEGAL_TRANSITION', `不能从 ${from} 改期`, 409);
      }
      return {
        to: 'confirmed',
        set: { confirmedSlot: payload.confirmedSlot },
        toast: '已改期 · 状态更新为已确认',
      };
    }
    case 'status_change': {
      // 通用状态变更(如 待查询->可预约、标记不可约 等次动作)
      const to = safeString(payload.status).trim();
      if (!ALLOWED_STATUS.includes(to)) throw createError('VALIDATION_ERROR', `status 非法:${to}`, 400);
      if (to === 'cancelled') throw createError('USE_CANCEL_ACTION', '取消请使用 cancel 动作(需理由)', 400);
      if (to === 'confirmed') throw createError('USE_UPLOAD_ACTION', '置为已确认请使用 upload_confirmation', 400);
      return { to, set: {}, toast: `状态更新为 ${to}` };
    }
    case 'cancel': {
      // 任意态 -> 已取消;必填理由
      const reason = safeString(payload.reason).trim();
      if (!reason) throw createError('CANCEL_REASON_REQUIRED', '取消必填理由', 400);
      if (from === 'cancelled') throw createError('ILLEGAL_TRANSITION', '已取消不可再取消', 409);
      return { to: 'cancelled', set: { cancelReason: reason }, toast: '已取消' };
    }
    default:
      throw createError('UNKNOWN_ACTION', `未知动作:${action}`, 400);
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
    const action = safeString(event.action).trim();
    const payload = isPlainObject(event.payload) ? event.payload : {};

    if (!visitId) {
      return { success: false, code: 422, error_code: 'VISIT_ID_REQUIRED', message: '请提供 visit_id' };
    }
    if (!ACTIONS.includes(action)) {
      return { success: false, code: 400, error_code: 'UNKNOWN_ACTION', message: `未知动作:${action}` };
    }

    const found = await findBooking(visitId);
    if (!found) {
      return { success: false, code: 404, error_code: 'VISIT_NOT_FOUND', message: '访校预约不存在' };
    }
    const booking = found.doc;
    const docId = found._id;
    const current = safeString(booking.status).trim();

    // 解析并校验流转(非法态直接抛错)
    const transition = resolveTransition(action, current, payload);

    const actor = auth.user ? auth.user._id : (auth.openid || 'operator');
    const nowIso = new Date().toISOString();
    const timelineEntry = { ts: nowIso, actor, action };

    // 组装更新:仅运营生命周期字段 + status + timeline push,不动 web 源字段
    const setData = {
      status: transition.to,
      updated_at: nowIso,
      updated_by: 'operator_dispatch',
    };
    Object.keys(transition.set || {}).forEach((key) => {
      if (transition.set[key] !== undefined) setData[key] = transition.set[key];
    });
    if (transition.stampConfirmation && isPlainObject(setData.confirmation)) {
      setData.confirmation = {
        ...setData.confirmation,
        uploadedBy: actor,
        uploadedAt: nowIso,
      };
    }

    await db.collection('visit_bookings').doc(docId).update({
      data: {
        ...setData,
        timeline: _.push([timelineEntry]),
      },
    });

    await writeAuditLog({
      actor_openid: auth.openid || '',
      actor_user_id: auth.user ? auth.user._id : '',
      actor_role: auth.user ? (auth.user.role || '') : 'operator',
      action: `visit_booking_action_${action}`,
      target_type: 'visit_booking',
      target_id: docId,
      detail: {
        external_visit_id: booking.external_visit_id || '',
        from_status: current,
        to_status: transition.to,
        visit_action: action,
      },
      created_at: nowIso,
    });

    return {
      success: true,
      code: 0,
      visit_id: docId,
      action,
      from_status: current,
      status: transition.to,
      toast: transition.toast,
    };
  } catch (error) {
    return {
      success: false,
      code: error.code || 500,
      error_code: error.error_code || 'OPS_VISIT_BOOKING_ACTION_FAILED',
      message: error.message || '访校预约动作执行失败',
    };
  }
};
