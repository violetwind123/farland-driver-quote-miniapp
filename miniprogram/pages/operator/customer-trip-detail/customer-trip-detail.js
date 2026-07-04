const WARNING_TEXT = {
  flight_segment_detected: '检测到航班段，请核对航班信息',
  missing_hotel: '有行程日缺少酒店安排',
  missing_date: '有行程日缺少日期',
  departure_time_mismatch: '出发时间与展示时间不一致，请核对',
  missing_drive_time: '部分节点缺少车程时间',
  missing_distance: '部分节点缺少距离信息',
  arrival_after_start_time: '到达时间晚于预约开始时间，请核对',
  unpublished_trip: '行程尚未发布',
  preview_from_import_source: '预览内容来自导入源数据',
};

function translateWarning(code) {
  return WARNING_TEXT[code] || code;
}

function formatDateYMD(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}/${match[2]}/${match[3]}`;
  return text;
}

Page({
  data: {
    loading: true,
    refreshing: false,
    building: false,
    publishing: false,
    creatingInvite: false,
    openingCustomerView: false,
    tripId: '',
    error: '',
    reviewNote: '',
    preview: null,
    draftSnapshot: null,
    publishedSnapshot: null,
    activeSnapshotType: 'draft',
    activeSnapshot: null,
    activeSnapshotLabel: '新草稿',
    warningList: [],
    criticalWarningList: [],
    changedSections: [],
    hasDraft: false,
    hasPublished: false,
    stateText: '',
    stateHint: '',
    canPublish: false,
    invitePath: '',
    inviteCode: '',
    inviteExpiresAt: '',
    inviteReused: false,
    hotelInviteMap: {},
    activeHotelInvites: [],
    creatingHotelInviteKey: '',
    revokingHotelInviteKey: '',
    hotelShareKey: '',
    isTrip091: false,
    bizState: {},
    dayStatusText: '',
    dayCards: [],
    draftReviewOpen: false,
    draftReviewSection: 'overview',
    expandedDayNo: 0,
    dailyManagementOpen: false,
    advancedOpen: false,
    displayDateRange: '',
    displayDaysCount: 0,
    displayCityRoute: '',
    rawWarningCodes: [],
    rawCriticalWarningCodes: [],
    reviewStats: {},
    reviewInvites: {},
    creatingReviewDay: 0,
    reviewExpandedDayNo: 0,
    reviewShareDayNo: 0,
    ownership: null,
    ownershipEditing: false,
    ownershipSaving: false,
    ownershipSearchKeyword: '',
    ownershipSearchLoading: false,
    ownershipSearchResults: [],
    ownershipForm: {
      party_name: '',
      primary_customer_user_id: '',
      primary_customer_display_name: '',
      traveler_names_text: '',
    },
  },

  onLoad(options) {
    const tripId = decodeURIComponent(options.trip_id || options.external_trip_id || options.id || '');
    this.setData({ tripId });
    if (!tripId) {
      this.setData({
        loading: false,
        error: '缺少 trip_id，无法打开行程详情。',
      });
      return;
    }
    this.loadPreview();
  },

  onShow() {
    if (this.data.tripId && !this.data.loading) {
      this.loadPreview({ silent: true });
    }
  },

  async loadPreview(options = {}) {
    const silent = Boolean(options.silent);
    this.setData({
      loading: !silent,
      refreshing: silent,
      error: '',
    });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getOperatorTripPreview',
        data: { trip_id: this.data.tripId },
      });
      if (!result || !result.success) {
        this.setData({
          loading: false,
          refreshing: false,
          error: (result && result.message) || '行程加载失败',
        });
        return;
      }
      this.applyPreviewResult(result);
    } catch (error) {
      console.error('[customer-trip-detail] getOperatorTripPreview failed', error);
      const errMsg = (error && (error.errMsg || error.message)) || '未知错误';
      this.setData({
        loading: false,
        refreshing: false,
        error: `行程加载失败：${errMsg}`,
      });
    }
  },

  applyPreviewResult(result) {
    const draftSnapshot = this.normalizeSnapshot(result.draft_snapshot || null);
    const publishedSnapshot = this.normalizeSnapshot(result.published_snapshot || null);
    const hasDraft = Boolean(draftSnapshot);
    const hasPublished = Boolean(publishedSnapshot);
    const currentType = this.data.activeSnapshotType;
    const nextActiveType = currentType === 'published' && hasPublished
      ? 'published'
      : (hasDraft ? 'draft' : (hasPublished ? 'published' : 'draft'));
    const state = this.getStateCopy(result, hasDraft, hasPublished);
    const isTrip091 = this.isTrip091(result, draftSnapshot, publishedSnapshot);
    const nextActive = nextActiveType === 'draft' ? draftSnapshot : publishedSnapshot;
    const changedSections = (result.diff_summary && result.diff_summary.changed_sections) || [];
    const bizState = this.deriveBusinessState(result, hasDraft, hasPublished, changedSections);
    const ownership = this.normalizeOwnership(result.ownership || {});
    const ownershipFormPatch = this.data.ownershipEditing ? {} : {
      ownershipForm: this.buildOwnershipForm(ownership),
      ownershipSearchKeyword: '',
      ownershipSearchResults: [],
    };
    // 回带该行程 active 酒店分享卡,预填撤销入口(重进页面也能撤销历史链接);云端为唯一真源
    const activeHotelInvites = Array.isArray(result.active_hotel_invites) ? result.active_hotel_invites : [];
    this.setData({
      loading: false,
      refreshing: false,
      preview: result,
      ownership,
      draftSnapshot,
      publishedSnapshot,
      activeSnapshotType: nextActiveType,
      activeSnapshot: nextActive,
      activeSnapshotLabel: this.getSnapshotLabel(nextActiveType, result.published_version),
      warningList: (result.warning_codes || []).map(translateWarning),
      criticalWarningList: (result.critical_warning_codes || []).map(translateWarning),
      rawWarningCodes: result.warning_codes || [],
      rawCriticalWarningCodes: result.critical_warning_codes || [],
      changedSections,
      hasDraft,
      hasPublished,
      stateText: state.text,
      stateHint: state.hint,
      bizState,
      dayStatusText: this.getDayStatusText(bizState, nextActiveType),
      canPublish: hasDraft && !(result.critical_warning_codes || []).length,
      isTrip091,
      error: '',
      activeHotelInvites,
      hotelInviteMap: this.buildHotelInviteMap(nextActive, activeHotelInvites),
      ...this.deriveDisplayMeta(nextActive),
      ...ownershipFormPatch,
    });
    this.loadReviewOverview();
  },

  normalizeOwnership(ownership = {}) {
    const customer = ownership.customer || {};
    const travelerNames = Array.isArray(ownership.traveler_names)
      ? ownership.traveler_names.map((name) => String(name || '').trim()).filter(Boolean)
      : [];
    const primaryName = ownership.customer_display_name
      || customer.display_name
      || ownership.customer_name
      || customer.name
      || '';
    return {
      primary_customer_user_id: ownership.primary_customer_user_id || ownership.customer_user_id || '',
      customer_user_id: ownership.customer_user_id || ownership.primary_customer_user_id || '',
      customer_user_ids: Array.isArray(ownership.customer_user_ids) ? ownership.customer_user_ids : [],
      customer_profile_id: ownership.customer_profile_id || customer.customer_profile_id || '',
      party_name: ownership.party_name || '',
      traveler_names: travelerNames,
      traveler_names_display: travelerNames.length ? travelerNames.join(' / ') : '未填写',
      primary_customer_display_name: primaryName,
      customer_display_name: ownership.customer_display_name || customer.display_name || '',
      customer_name: ownership.customer_name || customer.name || '',
      customer_phone: ownership.customer_phone || '',
      customer_wechat_id: ownership.customer_wechat_id || '',
      ownership_updated_at: ownership.ownership_updated_at || '',
    };
  },

  buildOwnershipForm(ownership = {}) {
    return {
      party_name: ownership.party_name || '',
      primary_customer_user_id: ownership.primary_customer_user_id || '',
      primary_customer_display_name: ownership.primary_customer_display_name || '',
      traveler_names_text: Array.isArray(ownership.traveler_names) ? ownership.traveler_names.join('\n') : '',
    };
  },

  normalizeTravelerNamesText(text) {
    const seen = {};
    return String(text || '')
      .split(/[\n,，、/]+/)
      .map((name) => name.trim().slice(0, 30))
      .filter((name) => {
        if (!name || seen[name]) return false;
        seen[name] = true;
        return true;
      })
      .slice(0, 20);
  },

  // 评价相关调用统一用 canonical trip_id(预览结果里的),避免路由别名(trip_no/_id)查空
  getReviewTripId() {
    const preview = this.data.preview || {};
    return preview.trip_id || preview.external_trip_id || this.data.tripId;
  },

  // 每日评价:加载本行程的评价卡与提交汇总(静默,失败不打扰主流程)
  async loadReviewOverview() {
    if (!this.data.tripId) return;
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'listRideReviewsForOperator',
        data: { trip_id: this.getReviewTripId() },
      });
      if (!result || !result.success) return;
      const reviewStats = {};
      (result.day_summaries || []).forEach((summary) => {
        reviewStats[summary.day_no] = summary;
      });
      this.setData({
        reviewStats,
        reviewInvites: result.invites_by_day || {},
      });
    } catch (error) {
      // 评价云函数未部署/集合未建时静默降级,不影响行程管理主流程
      console.warn('[customer-trip-detail] loadReviewOverview failed (non-fatal)', error);
    }
  },

  async createDayReviewInvite(e) {
    const dayNo = Number(e.currentTarget.dataset.day || 0);
    if (!dayNo || this.data.creatingReviewDay) return;
    this.setData({ creatingReviewDay: dayNo });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'createRideReviewInvite',
        data: { trip_id: this.getReviewTripId(), day_no: dayNo },
      });
      if (!result || !result.success) {
        this.setData({ creatingReviewDay: 0 });
        wx.showToast({ title: (result && result.message) || '评价卡生成失败', icon: 'none' });
        return;
      }
      this.setData({
        creatingReviewDay: 0,
        [`reviewInvites.${dayNo}`]: {
          day_no: dayNo,
          invite_code: result.invite_code,
          share_path: result.share_path,
          expires_at: result.expires_at || '',
        },
      });
      wx.setClipboardData({
        data: result.share_path,
        success: () => wx.showToast({ title: '评价卡已生成，路径已复制', icon: 'success' }),
      });
    } catch (error) {
      console.error('[customer-trip-detail] createRideReviewInvite failed', error);
      this.setData({ creatingReviewDay: 0 });
      wx.showToast({ title: '评价卡生成失败', icon: 'none' });
    }
  },

  copyDayReviewPath(e) {
    const dayNo = Number(e.currentTarget.dataset.day || 0);
    const invite = this.data.reviewInvites[dayNo];
    if (!invite || !invite.share_path) {
      wx.showToast({ title: '请先生成评价卡', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: invite.share_path,
      success: () => wx.showToast({ title: '已复制评价卡路径', icon: 'success' }),
    });
  },

  getReviewInviteForDay(dayNo) {
    const normalizedDayNo = Number(dayNo || 0);
    return (this.data.reviewInvites || {})[normalizedDayNo] || null;
  },

  getPublishedDayForShare(dayNo) {
    const normalizedDayNo = Number(dayNo || 0);
    const snapshot = this.data.publishedSnapshot || {};
    const days = Array.isArray(snapshot.itinerary_days) ? snapshot.itinerary_days : [];
    return days.find((day, index) => Number(day.day_no || index + 1) === normalizedDayNo) || null;
  },

  buildDayReviewShare(dayNo) {
    const normalizedDayNo = Number(dayNo || 0);
    const invite = this.getReviewInviteForDay(normalizedDayNo);
    if (!invite || !invite.share_path) {
      wx.showToast({ title: '请先生成评价卡', icon: 'none' });
      return {
        title: 'Farland 每日服务评价',
        path: 'pages/customer/review-card/review-card',
      };
    }
    const publishedDay = this.getPublishedDayForShare(normalizedDayNo) || {};
    const cardDay = (this.data.dayCards || [])
      .find((day) => Number(day.day_no || 0) === normalizedDayNo) || {};
    const snapshot = this.data.publishedSnapshot || this.data.activeSnapshot || {};
    const titleBase = publishedDay.title
      || publishedDay.city
      || cardDay.title
      || snapshot.display_title
      || snapshot.title
      || 'Farland 行程';
    return {
      title: `Day ${normalizedDayNo} 服务评价｜${titleBase}`,
      path: String(invite.share_path || '').replace(/^\//, ''),
    };
  },

  onDayReviewShareTap(e) {
    const dayNo = Number(e.currentTarget.dataset.day || 0);
    if (!this.getReviewInviteForDay(dayNo)) {
      wx.showToast({ title: '请先生成评价卡', icon: 'none' });
      return;
    }
    this.setData({ reviewShareDayNo: dayNo });
  },

  toggleReviewFeedback(e) {
    const dayNo = Number(e.currentTarget.dataset.day || 0);
    this.setData({
      reviewExpandedDayNo: this.data.reviewExpandedDayNo === dayNo ? 0 : dayNo,
    });
  },

  startOwnershipEdit() {
    const ownership = this.data.ownership || this.normalizeOwnership({});
    this.setData({
      ownershipEditing: true,
      ownershipForm: this.buildOwnershipForm(ownership),
      ownershipSearchKeyword: ownership.primary_customer_display_name || '',
      ownershipSearchResults: [],
    });
  },

  cancelOwnershipEdit() {
    this.setData({
      ownershipEditing: false,
      ownershipSaving: false,
      ownershipSearchKeyword: '',
      ownershipSearchResults: [],
      ownershipForm: this.buildOwnershipForm(this.data.ownership || {}),
    });
  },

  onOwnershipPartyInput(e) {
    this.setData({ 'ownershipForm.party_name': e.detail.value || '' });
  },

  onOwnershipTravelerInput(e) {
    this.setData({ 'ownershipForm.traveler_names_text': e.detail.value || '' });
  },

  onOwnershipSearchInput(e) {
    this.setData({ ownershipSearchKeyword: e.detail.value || '' });
  },

  async searchOwnershipCustomers() {
    const keyword = String(this.data.ownershipSearchKeyword || '').trim();
    if (this.data.ownershipSearchLoading) return;
    this.setData({ ownershipSearchLoading: true });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'searchCustomersForOperator',
        data: { keyword, limit: 8 },
      });
      this.setData({
        ownershipSearchLoading: false,
        ownershipSearchResults: result && result.success ? (result.customers || []) : [],
      });
      if (!result || !result.success) {
        wx.showToast({ title: (result && result.message) || '客户搜索失败', icon: 'none' });
      }
    } catch (error) {
      console.error('[customer-trip-detail] search ownership customers failed', error);
      this.setData({ ownershipSearchLoading: false, ownershipSearchResults: [] });
      wx.showToast({ title: '客户搜索失败', icon: 'none' });
    }
  },

  selectOwnershipCustomer(e) {
    const index = Number(e.currentTarget.dataset.index || 0);
    const customer = this.data.ownershipSearchResults[index];
    if (!customer) return;
    this.setData({
      'ownershipForm.primary_customer_user_id': customer.user_id || customer.customer_user_id || '',
      'ownershipForm.primary_customer_display_name': customer.display_name || customer.name || 'Farland 客户',
      ownershipSearchKeyword: customer.display_name || customer.name || '',
      ownershipSearchResults: [],
    });
  },

  clearOwnershipPrimaryCustomer() {
    this.setData({
      'ownershipForm.primary_customer_user_id': '',
      'ownershipForm.primary_customer_display_name': '',
      ownershipSearchKeyword: '',
      ownershipSearchResults: [],
    });
  },

  async saveOwnership() {
    if (this.data.ownershipSaving) return;
    const form = this.data.ownershipForm || {};
    const primaryCustomerId = String(form.primary_customer_user_id || '').trim();
    const travelerNames = this.normalizeTravelerNamesText(form.traveler_names_text);
    this.setData({ ownershipSaving: true });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'updateOperatorTripOwnership',
        data: {
          trip_id: this.data.tripId,
          primary_customer_user_id: primaryCustomerId,
          customer_user_ids: primaryCustomerId ? [primaryCustomerId] : [],
          party_name: form.party_name || '',
          traveler_names: travelerNames,
        },
      });
      if (!result || !result.success) {
        this.setData({ ownershipSaving: false });
        wx.showToast({ title: (result && result.message) || '归属保存失败', icon: 'none' });
        return;
      }
      const ownership = this.normalizeOwnership(result.ownership || {});
      this.setData({
        ownershipSaving: false,
        ownershipEditing: false,
        ownership,
        ownershipForm: this.buildOwnershipForm(ownership),
        ownershipSearchKeyword: '',
        ownershipSearchResults: [],
      });
      wx.showToast({ title: '归属已保存', icon: 'success' });
      this.loadPreview({ silent: true });
    } catch (error) {
      console.error('[customer-trip-detail] update ownership failed', error);
      this.setData({ ownershipSaving: false });
      wx.showToast({ title: '归属保存失败', icon: 'none' });
    }
  },

  deriveBusinessState(result, hasDraft, hasPublished, changedSections = []) {
    const review = result.review_status || '';
    const visibility = result.visibility_status || '';
    const version = result.published_version || 0;
    const published = visibility === 'published' && hasPublished;
    const hasUnpublishedChanges = Array.isArray(changedSections) && changedSections.length > 0;
    if (review === 'discarded' || visibility === 'discarded' || result.status === 'discarded') {
      return {
        state_text: '行程已废弃',
        customer_seeing_text: published ? `当前发布版 v${version}` : '客户看不到此行程',
        next_step_text: '如需继续使用，请重新导入或恢复行程',
        flow_step: 0,
        day_status_text: '已废弃',
        draft_day_status_text: '已废弃',
      };
    }
    if (!hasDraft && !published) {
      return {
        state_text: '已导入，待生成草稿',
        customer_seeing_text: '客户看不到此行程',
        next_step_text: '生成客户可见草稿',
        flow_step: 1,
        day_status_text: '未发布',
        draft_day_status_text: '未发布',
      };
    }
    if (hasDraft && !published) {
      return {
        state_text: '草稿待审阅，尚未发布',
        customer_seeing_text: '等待页（暂无行程内容）',
        next_step_text: '审阅草稿 → 预览客户页面 → 发布',
        flow_step: 1,
        day_status_text: '草稿',
        draft_day_status_text: '草稿',
      };
    }
    if (published && review === 'approved' && hasUnpublishedChanges) {
      return {
        state_text: `已发布 v${version}，存在未发布的草稿改动`,
        customer_seeing_text: `客户仍看到当前发布版 v${version}`,
        next_step_text: '审阅草稿差异 → 重新发布',
        flow_step: 1,
        day_status_text: '待发布',
        draft_day_status_text: '待发布',
      };
    }
    if (published && review === 'approved') {
      return {
        state_text: `已发布 v${version}，内容已确认`,
        customer_seeing_text: `当前发布版 v${version}`,
        next_step_text: '生成 / 转发客户分享卡',
        flow_step: 3,
        day_status_text: '已发布',
        draft_day_status_text: '草稿',
      };
    }
    if (published && review === 'needs_review') {
      return {
        state_text: `已发布 v${version}，有新草稿待复核`,
        customer_seeing_text: `仍是上一版 v${version}（新草稿未发布）`,
        next_step_text: '审阅新草稿 → 重新发布',
        flow_step: 1,
        day_status_text: '待复核',
        draft_day_status_text: '待复核',
      };
    }
    const legacy = this.getStateCopy(result, hasDraft, hasPublished);
    return {
      state_text: legacy.text,
      customer_seeing_text: published ? `当前发布版 v${version}` : '等待页（暂无行程内容）',
      next_step_text: '状态异常，请联系开发核查',
      flow_step: 1,
      day_status_text: published ? '已发布' : '草稿',
      draft_day_status_text: published ? '草稿' : '草稿',
    };
  },

  getDayStatusText(bizState = {}, snapshotType = 'draft') {
    if (snapshotType === 'published') return '已发布';
    return bizState.draft_day_status_text || bizState.day_status_text || '草稿';
  },

  getSnapshotLabel(snapshotType = 'draft', publishedVersion = 0) {
    if (snapshotType === 'published') return `已发布 v${publishedVersion || 0}`;
    return '新草稿';
  },

  deriveDisplayMeta(snapshot) {
    if (!snapshot) {
      return {
        displayDateRange: '',
        displayDaysCount: 0,
        displayCityRoute: '',
        dayCards: [],
      };
    }
    const tripSummary = snapshot.trip_summary || {};
    const start = formatDateYMD(snapshot.start_at);
    const end = formatDateYMD(snapshot.end_at);
    let range = '';
    if (start && end) {
      range = `${start} - ${end}`;
    } else if (tripSummary.date_range_text) {
      range = tripSummary.date_range_text;
    } else if (snapshot.display_date_range) {
      range = String(snapshot.display_date_range).replace(/T[0-9:+\-.]+/g, '').trim();
    }
    const itineraryDays = Array.isArray(snapshot.itinerary_days) ? snapshot.itinerary_days : [];
    return {
      displayDateRange: range,
      displayDaysCount: tripSummary.days_count || itineraryDays.length || 0,
      displayCityRoute: tripSummary.city_route_text || '',
      dayCards: this.buildDayCards(snapshot),
    };
  },

  buildDayCards(snapshot) {
    const days = Array.isArray(snapshot.itinerary_days) ? snapshot.itinerary_days : [];
    if (!days.length) return [];
    const hotels = Array.isArray(snapshot.hotel_cards) ? snapshot.hotel_cards : [];
    const summaries = Array.isArray(snapshot.daily_summary_cards) ? snapshot.daily_summary_cards : [];
    return days.map((day, index) => {
      const dayNo = Number(day.day_no || index + 1);
      const summary = summaries.find((card) => Number(card.day_no || 0) === dayNo) || {};
      const hotel = hotels.find((item) => Number(item.linked_day_no || 0) === dayNo
        || (Array.isArray(item.linked_day_nos) && item.linked_day_nos.some((linkedDayNo) => Number(linkedDayNo) === dayNo)));
      const items = Array.isArray(day.timeline_items) ? day.timeline_items : [];
      const stops = items.slice(0, 3).map((node) => node.title).filter(Boolean).join(' / ');
      return {
        day_no: dayNo,
        date_text: formatDateYMD(day.date),
        weekday: day.weekday || '',
        title: day.title || day.city || `Day ${dayNo}`,
        stops,
        hotel_name: (hotel && (hotel.name || hotel.hotel_name)) || summary.hotel_badge || '',
        transport_badge: summary.transport_badge || '',
        departure: day.estimated_departure_time || day.displayed_start_time || '',
        timeline_items: items,
      };
    });
  },

  isTrip091(result, draftSnapshot, publishedSnapshot) {
    const candidates = [
      this.data.tripId,
      result && result.trip_id,
      result && result.external_trip_id,
      result && result.trip_no,
      result && result.display_trip_no,
      draftSnapshot && draftSnapshot.display_trip_no,
      draftSnapshot && draftSnapshot.trip_no,
      draftSnapshot && draftSnapshot.external_trip_id,
      publishedSnapshot && publishedSnapshot.display_trip_no,
      publishedSnapshot && publishedSnapshot.trip_no,
      publishedSnapshot && publishedSnapshot.external_trip_id,
    ].filter(Boolean).map((value) => String(value));
    return candidates.includes('2026XBC091')
      || candidates.includes('bf757c4c6a2054f800350a925147b32e');
  },

  getCurrentExternalTripId() {
    const preview = this.data.preview || {};
    const draftSnapshot = this.data.draftSnapshot || {};
    const publishedSnapshot = this.data.publishedSnapshot || {};
    return preview.external_trip_id
      || preview.trip_no
      || draftSnapshot.external_trip_id
      || draftSnapshot.trip_no
      || draftSnapshot.display_trip_no
      || publishedSnapshot.external_trip_id
      || publishedSnapshot.trip_no
      || publishedSnapshot.display_trip_no
      || '';
  },

  normalizeSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) || !Object.keys(snapshot).length) {
      return null;
    }
    const hero = snapshot.hero || {};
    const customer = snapshot.customer || {};
    const advisor = snapshot.advisor || {};
    const days = Array.isArray(snapshot.itinerary_days) ? snapshot.itinerary_days : [];
    const hotelCards = Array.isArray(snapshot.hotel_cards) && snapshot.hotel_cards.length
      ? snapshot.hotel_cards
      : (Array.isArray(snapshot.hotels) ? snapshot.hotels : []);
    const normalizedHotelCards = hotelCards.map((hotel, index) => ({
      ...hotel,
      hotel_index: index,
      share_key: this.getHotelShareKey(hotel, index),
    }));
    const flightCards = Array.isArray(snapshot.flight_cards) && snapshot.flight_cards.length
      ? snapshot.flight_cards
      : (Array.isArray(snapshot.flights) ? snapshot.flights : []);
    return {
      ...snapshot,
      snapshot_model_version: snapshot.snapshot_model_version || 1,
      display_title: hero.title || snapshot.title || 'Farland 行程',
      display_trip_no: hero.trip_no || snapshot.trip_no || snapshot.external_trip_id || snapshot.trip_id || '',
      display_date_range: hero.date_range || [snapshot.start_at || '', snapshot.end_at || ''].filter(Boolean).join(' - '),
      display_city: hero.city_summary || snapshot.city || '',
      display_customer: customer.display_name || customer.name || '',
      display_advisor: advisor.name || 'Farland Advisor',
      trip_summary: snapshot.trip_summary || null,
      daily_summary_cards: Array.isArray(snapshot.daily_summary_cards)
        ? snapshot.daily_summary_cards.map((card) => ({
          ...card,
          highlight_items: Array.isArray(card.highlight_items) ? card.highlight_items : [],
        }))
        : [],
      itinerary_days: days.map((day, index) => ({
        ...day,
        display_day_label: `Day ${day.day_no || index + 1}`,
        timeline_items: Array.isArray(day.timeline_items) ? day.timeline_items : [],
      })),
      hotel_cards: normalizedHotelCards,
      hotels: normalizedHotelCards,
      flight_cards: flightCards,
      flights: flightCards,
      transfers: Array.isArray(snapshot.transfers) ? snapshot.transfers : [],
      charter_services: Array.isArray(snapshot.charter_services) ? snapshot.charter_services : [],
      documents: Array.isArray(snapshot.documents) ? snapshot.documents : [],
    };
  },

  getHotelShareKey(hotel = {}, index = 0) {
    return String(
      hotel.hotel_id
      || hotel.card_id
      || hotel.id
      || [hotel.name || hotel.hotel_name || hotel.title || 'hotel', hotel.check_in_date || hotel.date || '', index].join('_'),
    ).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
  },

  // 把回带的 active 酒店 invite 映射到当前快照酒店卡的 share_key(与撤销按钮用的键一致)。
  // 匹配优先 hotel_id,兜底 hotel_index;只用卡自己的 share_key,保证一致。
  buildHotelInviteMap(snapshot, invites) {
    const map = {};
    const list = Array.isArray(invites) ? invites : [];
    const cards = snapshot && Array.isArray(snapshot.hotel_cards) ? snapshot.hotel_cards : [];
    if (!list.length || !cards.length) return map;
    list.forEach((invite) => {
      if (!invite || !invite.invite_code) return;
      const card = (invite.hotel_id && cards.find((c) => c && c.hotel_id && c.hotel_id === invite.hotel_id))
        || cards.find((c) => c && Number(c.hotel_index) === Number(invite.hotel_index));
      if (!card || !card.share_key) return;
      map[card.share_key] = {
        hotel_key: card.share_key,
        hotel_id: invite.hotel_id || card.hotel_id || '',
        hotel_name: invite.hotel_name || card.name || card.hotel_name || '',
        invite_code: invite.invite_code,
        share_path: invite.share_path || '',
        expires_at: invite.expires_at || '',
      };
    });
    return map;
  },

  getStateCopy(result, hasDraft, hasPublished) {
    const reviewStatus = result.review_status || '';
    const visibilityStatus = result.visibility_status || '';
    if (!hasDraft) {
      return {
        text: '已导入，待生成客户草稿',
        hint: '先生成客户可见草稿，系统会移除内部字段，再供运营预览。',
      };
    }
    if (visibilityStatus === 'published' && hasPublished && reviewStatus === 'approved') {
      return {
        text: '已发布',
        hint: `客户当前会看到已发布版本 v${result.published_version || 1}。如源数据变更，请重新生成草稿并发布。`,
      };
    }
    if (reviewStatus === 'needs_review') {
      return {
        text: '有新草稿待复核',
        hint: '客户仍会看到上一次发布版本。确认新草稿无误后再发布。',
      };
    }
    return {
      text: '客户草稿待审核',
      hint: '请预览下方客户视图，确认日期、酒店、航班、每日节点无误后发布。',
    };
  },

  selectSnapshot(e) {
    const type = e.currentTarget.dataset.type;
    if (type === 'published' && !this.data.publishedSnapshot) {
      wx.showToast({ title: '暂无已发布版本', icon: 'none' });
      return;
    }
    if (type === 'draft' && !this.data.draftSnapshot) {
      wx.showToast({ title: '请先生成草稿', icon: 'none' });
      return;
    }
    const nextActive = type === 'draft' ? this.data.draftSnapshot : this.data.publishedSnapshot;
    this.setData({
      activeSnapshotType: type,
      activeSnapshot: nextActive,
      activeSnapshotLabel: this.getSnapshotLabel(type, this.data.preview && this.data.preview.published_version),
      dayStatusText: this.getDayStatusText(this.data.bizState, type),
      // share_key 随快照重算,重建 invite 映射保证撤销按钮键一致
      hotelInviteMap: this.buildHotelInviteMap(nextActive, this.data.activeHotelInvites),
      ...this.deriveDisplayMeta(nextActive),
    });
  },

  toggleDraftReview() {
    if (!this.data.activeSnapshot) {
      wx.showToast({ title: '暂无可审阅内容', icon: 'none' });
      return;
    }
    this.setData({ draftReviewOpen: !this.data.draftReviewOpen });
  },

  selectDraftReviewSection(e) {
    const section = e.currentTarget.dataset.section || 'overview';
    this.setData({ draftReviewSection: section });
  },

  onReviewNoteInput(e) {
    this.setData({ reviewNote: e.detail.value || '' });
  },

  async buildDraft() {
    if (this.data.building || !this.data.tripId) return;
    this.setData({ building: true, error: '' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'buildCustomerTripVisibleDraft',
        data: { trip_id: this.data.tripId },
      });
      if (!result || !result.success) {
        this.setData({
          building: false,
          error: (result && result.message) || '生成客户草稿失败',
        });
        wx.showToast({ title: '生成失败', icon: 'none' });
        return;
      }
      wx.showToast({ title: '草稿已生成', icon: 'success' });
      this.setData({
        building: false,
        activeSnapshotType: 'draft',
        activeSnapshotLabel: this.getSnapshotLabel('draft', this.data.preview && this.data.preview.published_version),
      });
      this.loadPreview({ silent: true });
    } catch (error) {
      console.error('[customer-trip-detail] buildCustomerTripVisibleDraft failed', error);
      const errMsg = (error && (error.errMsg || error.message)) || '未知错误';
      this.setData({
        building: false,
        error: `生成客户草稿失败：${errMsg}`,
      });
      wx.showToast({ title: '生成失败', icon: 'none' });
    }
  },

  async publishTrip() {
    if (this.data.publishing) return;
    if (!this.data.hasDraft) {
      wx.showToast({ title: '请先生成草稿', icon: 'none' });
      return;
    }
    if (this.data.criticalWarningList.length) {
      wx.showToast({ title: '关键警告未处理', icon: 'none' });
      return;
    }
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '确认发布',
        content: '发布后，客户分享卡将读取该客户可见版本。请确认预览内容无误。',
        confirmText: '发布',
        success: (res) => resolve(res.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;

    this.setData({ publishing: true, error: '' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'publishCustomerTrip',
        data: {
          trip_id: this.data.tripId,
          review_note: this.data.reviewNote,
        },
      });
      if (!result || !result.success) {
        this.setData({
          publishing: false,
          error: (result && result.message) || '发布失败',
        });
        wx.showToast({ title: '发布失败', icon: 'none' });
        return;
      }
      wx.showToast({ title: '已发布', icon: 'success' });
      this.setData({
        publishing: false,
        activeSnapshotType: 'published',
        activeSnapshotLabel: this.getSnapshotLabel('published', (result && result.published_version) || (this.data.preview && this.data.preview.published_version)),
        invitePath: '',
        inviteCode: '',
        inviteExpiresAt: '',
        inviteReused: false,
      });
      this.loadPreview({ silent: true });
    } catch (error) {
      console.error('[customer-trip-detail] publishCustomerTrip failed', error);
      const errMsg = (error && (error.errMsg || error.message)) || '未知错误';
      this.setData({
        publishing: false,
        error: `发布失败：${errMsg}`,
      });
      wx.showToast({ title: '发布失败', icon: 'none' });
    }
  },

  async createTripInvite() {
    if (this.data.creatingInvite) return;
    const preview = this.data.preview || {};
    if (preview.visibility_status !== 'published' || !this.data.hasPublished) {
      wx.showToast({ title: '请先发布行程', icon: 'none' });
      return;
    }
    this.setData({ creatingInvite: true, error: '' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'createCustomerTripInvite',
        data: {
          trip_id: this.data.tripId,
          expires_in_days: 30,
        },
      });
      if (!result || !result.success) {
        this.setData({
          creatingInvite: false,
          error: (result && result.message) || '客户分享卡生成失败',
        });
        wx.showToast({ title: '生成失败', icon: 'none' });
        return;
      }
      this.setData({
        creatingInvite: false,
        invitePath: result.share_path || result.path || '',
        inviteCode: result.invite_code || '',
        inviteExpiresAt: result.expires_at || '',
        inviteReused: Boolean(result.reused),
      });
      wx.showToast({ title: result.reused ? '已复用分享卡' : '分享卡已生成', icon: 'success' });
    } catch (error) {
      console.error('[customer-trip-detail] createCustomerTripInvite failed', error);
      const errMsg = (error && (error.errMsg || error.message)) || '未知错误';
      this.setData({
        creatingInvite: false,
        error: `客户分享卡生成失败：${errMsg}`,
      });
      wx.showToast({ title: '生成失败', icon: 'none' });
    }
  },

  buildTripInviteShare() {
    const { invitePath, publishedSnapshot, activeSnapshot, preview, tripId } = this.data;
    if (!invitePath) {
      wx.showToast({ title: '请先准备分享卡', icon: 'none' });
      return {
        title: 'Farland 行程',
        path: 'pages/customer/home/home',
      };
    }
    const snapshot = publishedSnapshot || activeSnapshot || {};
    const titleBase = snapshot.display_title || snapshot.title || 'Farland 行程';
    const tripNo = snapshot.display_trip_no
      || snapshot.trip_no
      || (preview && (preview.external_trip_id || preview.trip_id))
      || tripId
      || '';
    return {
      title: tripNo ? `${titleBase}｜${tripNo}` : titleBase,
      path: invitePath.replace(/^\//, ''),
    };
  },

  onTripInviteShareTap() {
    if (!this.data.invitePath) {
      wx.showToast({ title: '请先准备分享卡', icon: 'none' });
    }
  },

  onShareAppMessage(options = {}) {
    const dataset = options.target && options.target.dataset ? options.target.dataset : {};
    if (dataset.shareType === 'review') {
      return this.buildDayReviewShare(dataset.day || this.data.reviewShareDayNo);
    }
    if (dataset.shareType === 'hotel') {
      return this.buildHotelInviteShare(dataset.hotelKey || this.data.hotelShareKey);
    }
    return this.buildTripInviteShare();
  },

  // 只读：走客户真实渲染链路（customer-trip-mobile-preview 复用客户 home 配置）。
  // 不创建 invite、不创建 customer_trip_access、不改 viewed 状态。
  // 未发布时 customer_share_preview 返回等待页，与客户真实所见一致。
  async openCustomerFacingPreview() {
    if (this.data.openingCustomerView) return;
    if (!this.data.tripId) {
      wx.showToast({ title: '缺少 trip_id', icon: 'none' });
      return;
    }
    this.setData({ openingCustomerView: true, error: '' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getOperatorCustomerHomePreview',
        data: {
          trip_id: this.data.tripId,
          preview_access_mode: 'temporary_guest',
        },
      });
      if (!result || !result.success || !result.customer_share_preview) {
        this.setData({ openingCustomerView: false });
        wx.showToast({ title: (result && result.message) || '客户预览加载失败', icon: 'none' });
        return;
      }
      const app = getApp();
      app.globalData.operatorCustomerSharePreview = {
        customer_share_preview: result.customer_share_preview,
        preview_meta: result.preview_meta || {},
        preview_customer: result.preview_customer || {},
      };
      delete app.globalData.operatorCustomerHomePreview;
      this.setData({ openingCustomerView: false });
      wx.navigateTo({
        url: '/pages/operator/customer-trip-mobile-preview/customer-trip-mobile-preview',
        fail: (error) => {
          console.error('[customer-trip-detail] open customer view failed', error);
          wx.showToast({ title: '客户页面打开失败', icon: 'none' });
        },
      });
    } catch (error) {
      console.error('[customer-trip-detail] getOperatorCustomerHomePreview failed', error);
      const errMsg = (error && (error.errMsg || error.message)) || '未知错误';
      this.setData({
        openingCustomerView: false,
        error: `客户预览加载失败：${errMsg}`,
      });
      wx.showToast({ title: '客户预览加载失败', icon: 'none' });
    }
  },

  refreshPreview() {
    this.loadPreview({ silent: true });
  },

  copyTripId() {
    if (!this.data.tripId) return;
    wx.setClipboardData({
      data: this.data.tripId,
      success: () => wx.showToast({ title: '已复制 trip_id', icon: 'success' }),
    });
  },

  copyInvitePath() {
    if (!this.data.invitePath) {
      wx.showToast({ title: '请先准备分享卡', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: this.data.invitePath,
      success: () => wx.showToast({ title: '已复制客户路径', icon: 'success' }),
    });
  },

  async createHotelInvite(e) {
    const dataset = (e.currentTarget && e.currentTarget.dataset) || {};
    const hotelKey = dataset.hotelKey || '';
    if (!hotelKey || this.data.creatingHotelInviteKey) return;
    this.setData({ creatingHotelInviteKey: hotelKey, error: '' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'createHotelOrderInvite',
        data: {
          trip_id: this.getReviewTripId(),
          hotel_id: dataset.hotelId || '',
          hotel_index: Number(dataset.hotelIndex || 0),
          expires_in_days: 30,
        },
      });
      if (!result || !result.success) {
        this.setData({ creatingHotelInviteKey: '' });
        wx.showToast({ title: (result && result.message) || '酒店分享生成失败', icon: 'none' });
        return;
      }
      this.setData({
        creatingHotelInviteKey: '',
        [`hotelInviteMap.${hotelKey}`]: {
          hotel_key: hotelKey,
          hotel_id: result.hotel_id || dataset.hotelId || '',
          hotel_name: result.hotel_name || '',
          invite_code: result.invite_code || '',
          share_path: result.share_path || result.path || '',
          expires_at: result.expires_at || '',
        },
      });
      wx.showToast({ title: result.reused ? '已复用酒店分享' : '酒店分享已生成', icon: 'success' });
    } catch (error) {
      console.error('[customer-trip-detail] createHotelOrderInvite failed', error);
      this.setData({ creatingHotelInviteKey: '' });
      wx.showToast({ title: '酒店分享生成失败', icon: 'none' });
    }
  },

  copyHotelInvitePath(e) {
    const hotelKey = e.currentTarget.dataset.hotelKey || '';
    const invite = (this.data.hotelInviteMap || {})[hotelKey];
    if (!invite || !invite.share_path) {
      wx.showToast({ title: '请先生成酒店分享', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: invite.share_path,
      success: () => wx.showToast({ title: '已复制酒店路径', icon: 'success' }),
    });
  },

  async revokeHotelInvite(e) {
    const hotelKey = (e.currentTarget && e.currentTarget.dataset.hotelKey) || '';
    const invite = (this.data.hotelInviteMap || {})[hotelKey];
    if (!invite || !invite.invite_code || this.data.revokingHotelInviteKey) {
      wx.showToast({ title: '暂无可撤销的分享卡', icon: 'none' });
      return;
    }
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '撤销分享卡',
        content: '撤销后，客户当前收到的酒店分享链接将无法再访问。确认撤销？',
        confirmText: '撤销',
        confirmColor: '#C4443A',
        success: (res) => resolve(res.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;
    this.setData({ revokingHotelInviteKey: hotelKey });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'createHotelOrderInvite',
        data: { action: 'revoke', invite_code: invite.invite_code },
      });
      if (!result || !result.success) {
        this.setData({ revokingHotelInviteKey: '' });
        wx.showToast({ title: (result && result.message) || '撤销失败', icon: 'none' });
        return;
      }
      // 清掉本地该酒店的 invite,按钮回到「生成酒店分享」,不再显示为 active
      const nextMap = { ...(this.data.hotelInviteMap || {}) };
      delete nextMap[hotelKey];
      this.setData({ revokingHotelInviteKey: '', hotelInviteMap: nextMap });
      wx.showToast({ title: '分享卡已撤销', icon: 'success' });
    } catch (error) {
      console.error('[customer-trip-detail] revokeHotelInvite failed', error);
      this.setData({ revokingHotelInviteKey: '' });
      wx.showToast({ title: '撤销失败', icon: 'none' });
    }
  },

  buildHotelInviteShare(hotelKey) {
    const invite = (this.data.hotelInviteMap || {})[hotelKey];
    if (!invite || !invite.share_path) {
      wx.showToast({ title: '请先生成酒店分享', icon: 'none' });
      return {
        title: 'Farland 酒店确认',
        path: 'pages/customer/hotel-detail/hotel-detail',
      };
    }
    const snapshot = this.data.publishedSnapshot || this.data.activeSnapshot || {};
    const hotel = (Array.isArray(snapshot.hotel_cards) ? snapshot.hotel_cards : [])
      .find((item) => item.share_key === hotelKey) || {};
    const title = `${invite.hotel_name || hotel.name || hotel.hotel_name || '酒店信息'}｜Farland 酒店确认`;
    return {
      title,
      path: String(invite.share_path || '').replace(/^\//, ''),
    };
  },

  onHotelInviteShareTap(e) {
    const hotelKey = e.currentTarget.dataset.hotelKey || '';
    if (!((this.data.hotelInviteMap || {})[hotelKey])) {
      wx.showToast({ title: '请先生成酒店分享', icon: 'none' });
      return;
    }
    this.setData({ hotelShareKey: hotelKey });
  },

  toggleAdvanced() {
    this.setData({ advancedOpen: !this.data.advancedOpen });
  },

  toggleDailyManagement() {
    this.setData({ dailyManagementOpen: !this.data.dailyManagementOpen });
  },

  toggleDayExpand(e) {
    const dayNo = Number(e.currentTarget.dataset.day || 0);
    this.setData({ expandedDayNo: this.data.expandedDayNo === dayNo ? 0 : dayNo });
  },

  scrollToReview() {
    if (!this.data.hasDraft) {
      wx.showToast({ title: '请先生成草稿', icon: 'none' });
      return;
    }
    if (this.data.activeSnapshotType !== 'draft' && this.data.draftSnapshot) {
      this.setData({
        activeSnapshotType: 'draft',
        activeSnapshot: this.data.draftSnapshot,
        activeSnapshotLabel: this.getSnapshotLabel('draft', this.data.preview && this.data.preview.published_version),
        dayStatusText: this.getDayStatusText(this.data.bizState, 'draft'),
        ...this.deriveDisplayMeta(this.data.draftSnapshot),
      });
    }
    this.setData({ draftReviewOpen: true, draftReviewSection: 'overview' });
    wx.pageScrollTo({ selector: '#draft-review', duration: 300, fail: () => {} });
  },

  backToTripManagement() {
    wx.navigateBack({
      fail: () => {
        wx.navigateTo({ url: '/pages/operator/trip-management/trip-management' });
      },
    });
  },
});
