// R5-5c 运营访校预约详情
// 读:getOperatorVisitBookingDetail(event{visit_id}) -> {success, visit, meta}
// 写:opsVisitBookingAction(event{visit_id,action,payload}) -> {success, toast, status}
// 组件:visit-action-drawer(5e,emit-only)承接 submit/upload-confirm/mark-materials/query-date/save-draft/close
//
// 091/PII:内部块(visitOffice/contactPerson/advisorNotes/timeline)仅在 isInternalView 且 .card-internal 内渲染;
// 状态标颜色只由本地 STATE_MAP 派生,绝不使用服务器下发的 color 字段。

// §2 8 态 -> 状态标(theme.wxss:157-200)。仅本地映射,绝不读服务器 color。
const STATE_MAP = {
  pending_query: { text: '待查询', chip: 'neutral' },
  available: { text: '可预约', chip: 'success-soft' },
  submitted: { text: '已提交', chip: 'pending' },
  awaiting_school: { text: '学校待确认', chip: 'warn-soft' },
  confirmed: { text: '已确认', chip: 'confirmed-solid' },
  materials_needed: { text: '需补材料', chip: 'warn-soft' },
  conflict: { text: '时间冲突', chip: 'danger-soft' },
  cancelled: { text: '已取消', chip: 'neutral' },
};

const VISIT_TYPE_MAP = {
  campus_tour: 'Campus Tour',
  tour_plus_info: 'Tour + Info',
  info_session: 'Info Session',
  interview: 'Interview',
};

// §5 状态×动作矩阵 -> 底部动作栏按钮集合。
// primary 走 drawer(需表单),secondary 走直接 opsVisitBookingAction 或本地。
// kind: 'drawer' 打开抽屉;'action' 直接调 opsVisitBookingAction;'cancel' 走取消理由流程。
const ACTION_MATRIX = {
  pending_query: {
    primary: [{ key: 'query', label: '查询日期', kind: 'drawer', cls: 'cta-primary' }],
    secondary: [{ key: 'cancel', label: '取消', kind: 'cancel', cls: 'cta-danger-ghost' }],
  },
  available: {
    primary: [{ key: 'submit', label: '提交预约', kind: 'drawer', cls: 'cta-primary' }],
    secondary: [{ key: 'cancel', label: '取消', kind: 'cancel', cls: 'cta-danger-ghost' }],
  },
  submitted: {
    primary: [{ key: 'upload', label: '上传确认', kind: 'drawer', cls: 'cta-primary' }],
    secondary: [
      { key: 'awaiting_school', label: '标记待确认', kind: 'mark_awaiting_school', cls: 'cta-ghost' },
      { key: 'cancel', label: '取消', kind: 'cancel', cls: 'cta-danger-ghost' },
    ],
  },
  awaiting_school: {
    primary: [{ key: 'upload', label: '上传确认', kind: 'drawer', cls: 'cta-primary' }],
    secondary: [{ key: 'cancel', label: '取消', kind: 'cancel', cls: 'cta-danger-ghost' }],
  },
  confirmed: {
    primary: [{ key: 'materials_needed', label: '标记需补材料', kind: 'mark_materials_needed', cls: 'cta-primary' }],
    secondary: [
      { key: 'reschedule', label: '改期', kind: 'drawer', cls: 'cta-ghost' },
      { key: 'cancel', label: '取消', kind: 'cancel', cls: 'cta-danger-ghost' },
    ],
  },
  materials_needed: {
    primary: [{ key: 'materials', label: '标记材料齐全', kind: 'drawer', cls: 'cta-primary' }],
    secondary: [{ key: 'cancel', label: '取消', kind: 'cancel', cls: 'cta-danger-ghost' }],
  },
  conflict: {
    primary: [{ key: 'reschedule', label: '改期处理', kind: 'drawer', cls: 'cta-primary' }],
    secondary: [{ key: 'cancel', label: '取消', kind: 'cancel', cls: 'cta-danger-ghost' }],
  },
  cancelled: {
    primary: [],
    secondary: [],
  },
};

const MATERIAL_STATE_LABEL = {
  verified: '已核验',
  submitted: '已提交',
  missing: '缺失',
};

function s(value) {
  return value === undefined || value === null ? '' : String(value);
}
function isObj(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function formatDateText(value) {
  const text = s(value).trim();
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}/${m[2]}/${m[3]}` : text;
}

function formatDateTimeText(value) {
  const text = s(value).trim();
  if (!text) return '';
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return text;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

Page({
  data: {
    loading: true,
    error: '',
    bookingId: '',
    booking: null,
    isInternalView: false,

    // 头部派生
    schoolNameCn: '',
    schoolNameEn: '',
    statusText: '',
    statusChipClass: 'neutral',
    bigTime: '',
    bigTimeSub: '',
    studentChipText: '',
    tripChipText: '',
    visitTypeLabel: '',

    // 确认信息
    hasConfirmation: false,
    confirmation: null,
    confirmationUploadedText: '',

    // 集合点 / 到达
    meetingPoint: null,
    canNavigate: false,
    arriveByText: '',
    rainReminder: '',

    // 材料
    materials: [],
    materialsDoneCount: 0,
    materialsTotal: 0,

    // 内部块
    visitOffice: null,
    contactPerson: null,
    advisorNotes: '',
    timelineLatest: [],
    timelineTotal: 0,

    // 动作栏
    primaryActions: [],
    secondaryActions: [],

    // 抽屉
    drawerVisible: false,
    drawerBooking: {},
    drawerInitialSeg: 'submit',

    // 反馈
    submitting: false,
    toast: { show: false, text: '' },
  },

  onLoad(query) {
    const bookingId = decodeURIComponent(s(query && (query.visit_id || query.id || query.bookingId)) || '');
    this.setData({ bookingId });
    if (!bookingId) {
      this.setData({ loading: false, error: '缺少 visit_id，无法打开预约详情。' });
      return;
    }
    this.loadBooking();
  },

  onShow() {
    if (this.data.bookingId && !this.data.loading) {
      this.loadBooking({ silent: true });
    }
  },

  async loadBooking(options = {}) {
    const silent = Boolean(options.silent);
    if (!silent) this.setData({ loading: true, error: '' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getOperatorVisitBookingDetail',
        data: { visit_id: this.data.bookingId },
      });
      if (!result || !result.success || !result.visit) {
        this.setData({ loading: false, error: (result && result.message) || '预约详情加载失败' });
        return;
      }
      this.applyBooking(result);
    } catch (error) {
      console.error('[visit-booking-detail] getOperatorVisitBookingDetail failed', error);
      const errMsg = (error && (error.errMsg || error.message)) || '未知错误';
      this.setData({ loading: false, error: `预约详情加载失败：${errMsg}` });
    }
  },

  applyBooking(result) {
    const visit = result.visit || {};
    // 读 CF 已按运营角色 gate,成功返回即代表运营态;内部块随之可渲染。
    // 若服务器显式下发 isInternalView 则以其为准(不弱化 gate)。
    const isInternalView = typeof visit.isInternalView === 'boolean'
      ? visit.isInternalView
      : (typeof result.isInternalView === 'boolean' ? result.isInternalView : true);

    const school = isObj(visit.school) ? visit.school : {};
    const status = s(visit.status).trim();
    const stateView = STATE_MAP[status] || { text: status || '未知', chip: 'neutral' };

    const slot = isObj(visit.confirmedSlot) ? visit.confirmedSlot : {};
    const start = s(slot.start).trim();
    const end = s(slot.end).trim();
    const weekday = s(slot.weekday).trim();
    const dateText = formatDateText(slot.date);
    const bigTime = start ? `${start}` : (dateText || '待确认');
    const visitTypeLabel = VISIT_TYPE_MAP[s(visit.visitType).trim()] || s(visit.visitType).trim();
    const bigSubParts = [];
    if (end) bigSubParts.push(`– ${end}`);
    if (dateText) bigSubParts.push(dateText);
    if (weekday) bigSubParts.push(weekday);
    if (visitTypeLabel) bigSubParts.push(visitTypeLabel);

    // 学生 chip:运营端可见姓名/年级(非客户面);仅取首个学生展示
    const students = Array.isArray(visit.students) ? visit.students : [];
    const firstStudent = students[0] || {};
    const studentChipText = firstStudent.name
      ? `学生 ${firstStudent.name}${firstStudent.grade ? ` · ${firstStudent.grade}` : ''}${students.length > 1 ? ` +${students.length - 1}` : ''}`
      : '';
    const dayNo = visit.dayNo || (isObj(visit.trip) ? visit.trip.dayNo : '');
    const tripChipText = dayNo ? `行程 Day ${dayNo}` : '';

    // 确认信息
    const confirmation = isObj(visit.confirmation) ? visit.confirmation : null;
    const hasConfirmation = Boolean(confirmation && confirmation.fileUrl);
    const confirmationUploadedText = confirmation
      ? [
        confirmation.uploadedBy ? `${confirmation.uploadedBy} 上传` : '',
        formatDateTimeText(confirmation.uploadedAt),
      ].filter(Boolean).join(' · ')
      : '';

    // 集合点 / 到达
    const meetingPoint = isObj(visit.meetingPoint) ? visit.meetingPoint : null;
    const lat = meetingPoint ? Number(meetingPoint.lat) : NaN;
    const lng = meetingPoint ? Number(meetingPoint.lng) : NaN;
    const canNavigate = Boolean(meetingPoint) && Number.isFinite(lat) && Number.isFinite(lng);

    const arrival = isObj(visit.arrival) ? visit.arrival : {};
    const arriveEarly = arrival.arriveEarlyMin;
    const arriveByText = (arriveEarly || arriveEarly === 0)
      ? `提前 ${arriveEarly} 分钟${arrival.arriveByText ? ` · ${arrival.arriveByText}` : ''}`
      : (s(arrival.arriveByText).trim() || '按确认时间到达');

    // 天气雨雪 -> 到达行追加提醒(§7 联动),仅用天气码,不涉 PII
    const weather = isObj(visit.weather) ? visit.weather : {};
    const wcond = s(weather.condition || weather.cond || weather.type).toLowerCase();
    const rainReminder = (wcond.indexOf('rain') !== -1 || wcond.indexOf('snow') !== -1 || wcond.indexOf('雨') !== -1 || wcond.indexOf('雪') !== -1)
      ? '（预报有雨雪，请预留额外时间）'
      : '';

    // 材料
    const materials = (Array.isArray(visit.materials) ? visit.materials : []).map((m) => {
      const mStatus = s(m && m.status).trim() || 'missing';
      return {
        name: s(m && m.name).trim(),
        status: ['verified', 'submitted', 'missing'].indexOf(mStatus) !== -1 ? mStatus : 'missing',
        statusLabel: MATERIAL_STATE_LABEL[mStatus] || mStatus,
        dueText: mStatus === 'missing' ? s(m && m.dueText).trim() : '',
      };
    });
    const materialsDoneCount = materials.filter((m) => m.status !== 'missing').length;

    // 内部块(仅 isInternalView 时才组织数据)
    const timeline = Array.isArray(visit.timeline) ? visit.timeline : [];
    const timelineLatest = timeline
      .slice(-2)
      .reverse()
      .map((t) => {
        const when = formatDateTimeText(t && (t.ts || t.at));
        const action = s(t && t.action).trim();
        const actor = s(t && t.actor).trim();
        return [when, action, actor].filter(Boolean).join(' · ');
      });

    this.setData({
      loading: false,
      error: '',
      booking: visit,
      isInternalView,
      schoolNameCn: s(school.nameCn).trim() || s(school.name).trim() || '未命名学校',
      schoolNameEn: [s(school.nameEn).trim(), s(school.city).trim()].filter(Boolean).join(' · '),
      statusText: stateView.text,
      statusChipClass: stateView.chip,
      bigTime,
      bigTimeSub: bigSubParts.join(' '),
      studentChipText,
      tripChipText,
      visitTypeLabel,
      hasConfirmation,
      confirmation,
      confirmationUploadedText,
      meetingPoint,
      canNavigate,
      arriveByText,
      rainReminder,
      materials,
      materialsDoneCount,
      materialsTotal: materials.length,
      visitOffice: isInternalView && isObj(visit.visitOffice) ? visit.visitOffice : null,
      contactPerson: isInternalView && isObj(visit.contactPerson) ? visit.contactPerson : null,
      advisorNotes: isInternalView ? s(visit.advisorNotes).trim() : '',
      timelineLatest: isInternalView ? timelineLatest : [],
      timelineTotal: timeline.length,
      ...this.buildActions(status),
      drawerBooking: this.buildDrawerBooking(visit, stateView),
    });
  },

  // §5 矩阵 -> 底部动作栏
  buildActions(status) {
    const entry = ACTION_MATRIX[status] || { primary: [], secondary: [] };
    return {
      primaryActions: entry.primary || [],
      secondaryActions: entry.secondary || [],
    };
  },

  // 组织传给 5e 抽屉的白名单 booking(运营态但仅所需字段;不塞客户 PII/内部备注)
  buildDrawerBooking(visit, stateView) {
    const school = isObj(visit.school) ? visit.school : {};
    const requested = Array.isArray(visit.requestedSlots) ? visit.requestedSlots : [];
    const slots = requested.map((r, i) => ({
      key: s(r && (r.key || r.id)) || `slot_${i}`,
      dateText: formatDateText(r && r.date),
      dateRaw: s(r && r.date).trim(),
      time: s(r && r.time).trim(),
      selected: Boolean(r && r.selected),
    }));
    const students = (Array.isArray(visit.students) ? visit.students : []).map((st) => ({
      id: s(st && st.id).trim(),
      name: s(st && st.name).trim(),
      grade: s(st && st.grade).trim(),
    }));
    const materials = (Array.isArray(visit.materials) ? visit.materials : []).map((m) => ({
      name: s(m && m.name).trim(),
      required: Boolean(m && m.required),
      status: s(m && m.status).trim() || 'missing',
    }));
    const confirmation = isObj(visit.confirmation) ? visit.confirmation : {};
    return {
      id: s(visit._id || visit.external_visit_id || this.data.bookingId),
      school: { nameCn: s(school.nameCn).trim(), nameEn: s(school.nameEn).trim() },
      status: s(visit.status).trim(),
      statusText: stateView.text,
      slots,
      students,
      materials,
      confirmation: { confirmationNo: s(confirmation.confirmationNo).trim() },
    };
  },

  // ---------- 集合点交互 ----------
  onCopyAddress() {
    const mp = this.data.meetingPoint || {};
    const addr = s(mp.addressEn).trim() || s(mp.name).trim();
    if (!addr) {
      wx.showToast({ title: '暂无地址', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: addr,
      success: () => wx.showToast({ title: '地址已复制', icon: 'success' }),
    });
  },

  onNavigate() {
    const mp = this.data.meetingPoint || {};
    const lat = Number(mp.lat);
    const lng = Number(mp.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      wx.showToast({ title: '暂无导航坐标', icon: 'none' });
      return;
    }
    wx.openLocation({
      latitude: lat,
      longitude: lng,
      name: s(mp.name).trim() || '集合点',
      address: s(mp.addressEn).trim(),
      scale: 16,
      fail: () => wx.showToast({ title: '导航打开失败', icon: 'none' }),
    });
  },

  // ---------- 确认函查看 ----------
  onViewConfirmation() {
    const confirmation = this.data.confirmation || {};
    const fileUrl = s(confirmation.fileUrl).trim();
    if (!fileUrl) {
      wx.showToast({ title: '暂无确认函', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '打开中', mask: true });
    wx.downloadFile({
      url: fileUrl,
      success: (res) => {
        wx.hideLoading();
        if (res.statusCode !== 200 || !res.tempFilePath) {
          wx.showToast({ title: '确认函加载失败', icon: 'none' });
          return;
        }
        wx.openDocument({
          filePath: res.tempFilePath,
          showMenu: true,
          fail: () => wx.showToast({ title: '文档打开失败', icon: 'none' }),
        });
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '确认函下载失败', icon: 'none' });
      },
    });
  },

  onCopyConfirmationNo() {
    const no = s((this.data.confirmation || {}).confirmationNo).trim();
    if (!no) {
      wx.showToast({ title: '暂无确认号', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: no,
      success: () => wx.showToast({ title: '确认号已复制', icon: 'success' }),
    });
  },

  // ---------- 内部时间线 ----------
  onViewTimeline() {
    const timeline = Array.isArray(this.data.booking && this.data.booking.timeline)
      ? this.data.booking.timeline : [];
    if (!timeline.length) {
      wx.showToast({ title: '暂无时间线', icon: 'none' });
      return;
    }
    const content = timeline
      .slice()
      .reverse()
      .map((t) => {
        const when = formatDateTimeText(t && (t.ts || t.at));
        return `${when} · ${s(t && t.action).trim()} · ${s(t && t.actor).trim()}`;
      })
      .join('\n');
    wx.showModal({ title: `时间线（${timeline.length} 条）`, content, showCancel: false, confirmText: '关闭' });
  },

  // ---------- 底部动作栏派发 ----------
  onActionTap(e) {
    if (this.data.submitting) return;
    const kind = s(e.currentTarget.dataset.kind).trim();
    const key = s(e.currentTarget.dataset.key).trim();
    if (!kind) return;
    if (kind === 'drawer') {
      this.openDrawer(key);
      return;
    }
    if (kind === 'cancel') {
      this.startCancel();
      return;
    }
    // 直接流转动作(无需表单):mark_materials_needed / mark_awaiting_school
    this.dispatchAction(kind, {}, { requireConfirm: key === 'materials_needed' });
  },

  // 由触发动作 key 决定抽屉初始面板(seg intent),避免每次都落在 'submit'。
  openDrawer(actionKey) {
    const SEG_BY_KEY = {
      query: 'query',
      submit: 'submit',
      upload: 'upload',
      materials: 'materials',
      materials_needed: 'materials',
      reschedule: 'reschedule',
    };
    const seg = SEG_BY_KEY[s(actionKey).trim()] || 'submit';
    this.setData({ drawerInitialSeg: seg, drawerVisible: true });
  },

  onDrawerClose() {
    this.setData({ drawerVisible: false });
  },

  // 取消:必填理由(opsVisitBookingAction cancel 要求 reason)
  startCancel() {
    wx.showModal({
      title: '取消预约',
      editable: true,
      placeholderText: '请填写取消理由（必填）',
      confirmText: '确认取消',
      confirmColor: '#B4463C',
      success: (res) => {
        if (!res.confirm) return;
        const reason = s(res.content).trim();
        if (!reason) {
          wx.showToast({ title: '取消需填写理由', icon: 'none' });
          return;
        }
        this.dispatchAction('cancel', { reason });
      },
    });
  },

  // ---------- 抽屉 emit -> opsVisitBookingAction ----------
  onDrawerSubmit(e) {
    const detail = (e && e.detail) || {};
    this.dispatchAction('submit', {
      requestedSlots: this.slotKeysToSlots(detail.slotKeys),
      students: this.studentIdsToStudents(detail.studentIds),
      schoolNote: s(detail.note).trim(),
    });
  },

  async onDrawerUploadConfirm(e) {
    if (this.data.submitting) return;
    const detail = (e && e.detail) || {};
    const confirmationNo = s(detail.confirmationNo).trim();
    const filePath = s(detail.filePath).trim();
    const confirmedSlot = isObj(detail.confirmedSlot) ? detail.confirmedSlot : {};
    // backend hard-requires (fileID||fileUrl) AND confirmedSlot.date
    if (!confirmationNo) {
      wx.showToast({ title: '请填写确认号', icon: 'none' });
      return;
    }
    if (!filePath) {
      wx.showToast({ title: '请选择确认函文件', icon: 'none' });
      return;
    }
    if (!isObj(confirmedSlot) || !s(confirmedSlot.date).trim()) {
      wx.showToast({ title: '请选择确认时段', icon: 'none' });
      return;
    }

    // 上传确认函到云存储(storage,非 db 写);写库仍只经 opsVisitBookingAction。
    this.setData({ submitting: true });
    wx.showLoading({ title: '上传中', mask: true });
    let fileID = '';
    try {
      const ext = (filePath.match(/\.[a-zA-Z0-9]+$/) || [''])[0];
      const cloudPath = `visit_confirmations/${this.data.bookingId || 'visit'}_${Date.now()}${ext}`;
      const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath });
      fileID = s(uploadRes && uploadRes.fileID).trim();
    } catch (error) {
      console.error('[visit-booking-detail] uploadFile failed', error);
    }
    wx.hideLoading();
    if (!fileID) {
      this.setData({ submitting: false });
      wx.showToast({ title: '确认函上传失败', icon: 'none' });
      return;
    }
    // 换取临时 URL 供后续查看(失败不阻断:backend 有 fileID 即可)
    let fileUrl = '';
    try {
      const urlRes = await wx.cloud.getTempFileURL({ fileList: [fileID] });
      const first = urlRes && Array.isArray(urlRes.fileList) ? urlRes.fileList[0] : null;
      fileUrl = first ? s(first.tempFileURL).trim() : '';
    } catch (error) {
      fileUrl = '';
    }
    // 释放 submitting,交给 dispatchAction 重新接管
    this.setData({ submitting: false });
    this.dispatchAction('upload_confirmation', {
      confirmation: {
        confirmationNo,
        fileID,
        fileUrl: fileUrl || undefined,
      },
      confirmedSlot,
    });
  },

  onDrawerReschedule(e) {
    const detail = (e && e.detail) || {};
    const confirmedSlot = isObj(detail.confirmedSlot) ? detail.confirmedSlot : {};
    if (!s(confirmedSlot.date).trim()) {
      wx.showToast({ title: '请选择新的确认时段', icon: 'none' });
      return;
    }
    this.dispatchAction('reschedule', { confirmedSlot });
  },

  onDrawerMarkMaterials(e) {
    const detail = (e && e.detail) || {};
    const materials = Array.isArray(detail.materials) ? detail.materials : undefined;
    // 抽屉的"标记材料"用于把 materials_needed 标回齐全;confirmed 态叠加需补材料走动作栏。
    const action = this.data.booking && this.data.booking.status === 'materials_needed'
      ? 'mark_materials_complete'
      : 'mark_materials_needed';
    this.dispatchAction(action, materials ? { materials } : {});
  },

  onDrawerQueryDate(e) {
    const detail = (e && e.detail) || {};
    // 查询日期 = 通用状态推进到"可预约"
    this.dispatchAction('status_change', { status: s(detail.status).trim() || 'available' });
  },

  onDrawerSaveDraft() {
    // 存草稿为本地/前端语义,无对应服务器动作;仅关闭抽屉并提示。
    this.setData({ drawerVisible: false });
    wx.showToast({ title: '已存草稿', icon: 'none' });
  },

  slotKeysToSlots(slotKeys) {
    const keys = Array.isArray(slotKeys) ? slotKeys : [];
    const source = (this.data.drawerBooking && Array.isArray(this.data.drawerBooking.slots))
      ? this.data.drawerBooking.slots : [];
    const bySelected = keys.length
      ? source.filter((sl) => keys.indexOf(sl.key) !== -1)
      : source.filter((sl) => sl.selected);
    return bySelected.map((sl) => ({ date: sl.dateRaw || sl.dateText, time: sl.time }));
  },

  studentIdsToStudents(studentIds) {
    const ids = Array.isArray(studentIds) ? studentIds : [];
    const source = (this.data.drawerBooking && Array.isArray(this.data.drawerBooking.students))
      ? this.data.drawerBooking.students : [];
    const picked = ids.length ? source.filter((st) => ids.indexOf(st.id) !== -1) : source;
    return picked.map((st) => ({ id: st.id, name: st.name, grade: st.grade }));
  },

  // ---------- 统一写入:opsVisitBookingAction ----------
  async dispatchAction(action, payload, options = {}) {
    if (this.data.submitting) return;
    if (options.requireConfirm) {
      const ok = await new Promise((resolve) => {
        wx.showModal({
          title: '确认操作',
          content: '确认执行该状态变更？',
          success: (res) => resolve(res.confirm),
          fail: () => resolve(false),
        });
      });
      if (!ok) return;
    }
    this.setData({ submitting: true });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'opsVisitBookingAction',
        data: { visit_id: this.data.bookingId, action, payload: payload || {} },
      });
      if (!result || !result.success) {
        this.setData({ submitting: false });
        wx.showToast({ title: (result && result.message) || '操作失败', icon: 'none' });
        return;
      }
      this.setData({ submitting: false, drawerVisible: false });
      const toastText = s(result.toast).trim() || '已更新';
      this.showToast(toastText);
      this.loadBooking({ silent: true });
    } catch (error) {
      console.error('[visit-booking-detail] opsVisitBookingAction failed', error);
      this.setData({ submitting: false });
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  showToast(text) {
    this.setData({ toast: { show: true, text } });
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.setData({ 'toast.show': false });
    }, 2200);
  },

  onUnload() {
    if (this._toastTimer) clearTimeout(this._toastTimer);
  },
});
