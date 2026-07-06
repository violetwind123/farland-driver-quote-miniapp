const WARNING_TEXT = {
  flight_segment_detected: '检测到航班段，请核对航班信息',
  missing_hotel: '有行程日缺少酒店安排',
  missing_date: '有行程日缺少日期',
  departure_time_mismatch: '出发时间与展示时间不一致，请核对',
  missing_drive_time: '部分节点缺少车程时间',
  missing_distance: '部分节点缺少距离信息',
  arrival_after_start_time: '到达时间晚于预约开始时间，请核对',
  unpublished_trip: '行程尚未同步到客户可见版本',
  preview_from_source_data: '预览内容来自网页端同步源数据',
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
    creatingInvite: false,
    previewingDraft: false,
    releasing: false,
    tripId: '',
    error: '',
    preview: null,
    draftSnapshot: null,
    publishedSnapshot: null,
    activeSnapshotType: 'draft',
    activeSnapshot: null,
    activeSnapshotLabel: '最新同步版',
    warningList: [],
    criticalWarningList: [],
    changedSections: [],
    hasDraft: false,
    hasPublished: false,
    canForwardSheet: false,
    stateText: '',
    stateHint: '',
    invitePath: '',
    inviteCode: '',
    inviteExpiresAt: '',
    inviteReused: false,
    hotelInviteMap: {},
    activeHotelInvites: [],
    creatingHotelInviteKey: '',
    revokingHotelInviteKey: '',
    hotelShareKey: '',
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
      : (hasPublished && result.review_status === 'approved' ? 'published' : (hasDraft ? 'draft' : (hasPublished ? 'published' : 'draft')));
    const state = this.getStateCopy(result, hasDraft, hasPublished);
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
      canForwardSheet: Boolean(result.can_forward_sheet),
      stateText: state.text,
      stateHint: state.hint,
      bizState,
      dayStatusText: this.getDayStatusText(bizState, nextActiveType),
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
    const sheetReady = Boolean(result.can_forward_sheet);
    if (review === 'discarded' || visibility === 'discarded' || result.status === 'discarded') {
      return {
        state_text: '行程已废弃',
        customer_seeing_text: '客户不能查看手机版行程单',
        next_step_text: '如需继续使用，请从网页端重新同步并重新推送客户',
        flow_step: 0,
        day_status_text: '已废弃',
        draft_day_status_text: '已废弃',
      };
    }
    if (result.customer_official_released === true) {
      return {
        state_text: `正式行程已发布 v${version || 1}`,
        customer_seeing_text: '客户看到正式行程卡片（第二层）',
        next_step_text: '如客户线下需改动，可在下方「收回正式行程」退回手机行程单图',
        flow_step: 2,
        day_status_text: '已发布',
        draft_day_status_text: '已发布',
      };
    }
    if (sheetReady) {
      return {
        state_text: '手机版行程单已生成',
        customer_seeing_text: '客户会看到手机版行程单（第一层）',
        next_step_text: '预览客户界面并转发；客户线下确认后在下方发布正式行程',
        flow_step: 1,
        day_status_text: '已生成',
        draft_day_status_text: '已生成',
      };
    }
    if (!hasDraft && !published) {
      return {
        state_text: '等待网页端生成手机行程单',
        customer_seeing_text: '客户看不到此行程',
        next_step_text: '在网站后台点击「推送客户 Push」',
        flow_step: 1,
        day_status_text: '待同步',
        draft_day_status_text: '待同步',
      };
    }
    if (hasDraft && !published) {
      return {
        state_text: '行程数据已同步，等待手机行程单图片',
        customer_seeing_text: '客户暂时看不到手机版行程单',
        next_step_text: '从网页端生成并推送手机行程单',
        flow_step: 1,
        day_status_text: '待同步',
        draft_day_status_text: '最新同步',
      };
    }
    if (published && review === 'approved' && hasUnpublishedChanges) {
      return {
        state_text: `行程版本 v${version}，等待手机行程单图片`,
        customer_seeing_text: '客户暂时看不到新版手机行程单',
        next_step_text: '从网页端重新推送客户',
        flow_step: 1,
        day_status_text: '待生成',
        draft_day_status_text: '最新同步',
      };
    }
    if (published && review === 'approved') {
      return {
        state_text: `行程版本 v${version}，等待手机行程单图片`,
        customer_seeing_text: '客户暂时看不到手机行程单图片',
        next_step_text: '在网站后台点击「推送客户 Push」',
        flow_step: 1,
        day_status_text: '待生成',
        draft_day_status_text: '待生成',
      };
    }
    if (published && review === 'needs_review') {
      return {
        state_text: `行程版本 v${version}，有同步内容待核对`,
        customer_seeing_text: '客户暂时看不到新版手机行程单',
        next_step_text: '核对后从网页端重新推送客户',
        flow_step: 1,
        day_status_text: '待生成',
        draft_day_status_text: '已同步',
      };
    }
    const legacy = this.getStateCopy(result, hasDraft, hasPublished);
    return {
      state_text: legacy.text,
      customer_seeing_text: published ? `当前客户版 v${version}` : '等待页（暂无行程内容）',
      next_step_text: '状态异常，请核查网页推送链路',
      flow_step: 1,
      day_status_text: published ? '客户版' : '待同步',
      draft_day_status_text: '最新同步',
    };
  },

  getDayStatusText(bizState = {}, snapshotType = 'draft') {
    if (snapshotType === 'published') return '客户版';
    return bizState.draft_day_status_text || bizState.day_status_text || '最新同步';
  },

  getSnapshotLabel(snapshotType = 'draft', publishedVersion = 0) {
    if (snapshotType === 'published') return `当前客户版 v${publishedVersion || 0}`;
    return '最新同步版';
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
        text: '等待网页端行程同步',
        hint: '网页同步结构化行程后，客户版会自动启用手机版行程。',
      };
    }
    if (visibilityStatus === 'published' && hasPublished && reviewStatus === 'approved') {
      return {
        text: '客户版已启用，可直接转发',
        hint: `客户当前会看到版本 v${result.published_version || 1}。网页重新同步后会自动启用最新版。`,
      };
    }
    if (reviewStatus === 'needs_review') {
      return {
        text: '有历史同步内容待启用',
        hint: '请预览手机版行程并手动启用，启用后客户会看到更新后的行程卡片。',
      };
    }
    return {
      text: '等待客户版启用',
      hint: '请确认网页同步成功；必要时手动启用客户行程。',
    };
  },

  selectSnapshot(e) {
    const type = e.currentTarget.dataset.type;
    if (type === 'published' && !this.data.publishedSnapshot) {
      wx.showToast({ title: '暂无当前客户版', icon: 'none' });
      return;
    }
    if (type === 'draft' && !this.data.draftSnapshot) {
      wx.showToast({ title: '暂无最新同步内容', icon: 'none' });
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
      wx.showToast({ title: '暂无可核对内容', icon: 'none' });
      return;
    }
    this.setData({ draftReviewOpen: !this.data.draftReviewOpen });
  },

  selectDraftReviewSection(e) {
    const section = e.currentTarget.dataset.section || 'overview';
    this.setData({ draftReviewSection: section });
  },

  async createTripInvite() {
    if (this.data.creatingInvite) return;
    if (!this.data.canForwardSheet) {
      wx.showToast({ title: '手机版行程单尚未生成，无法转发', icon: 'none' });
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
          error: (result && result.message) || '客户分享链接生成失败',
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
      wx.showToast({ title: result.reused ? '已复用行程单' : '行程单已准备', icon: 'success' });
      this.loadPreview({ silent: true });
    } catch (error) {
      console.error('[customer-trip-detail] createCustomerTripInvite failed', error);
      const errMsg = (error && (error.errMsg || error.message)) || '未知错误';
      this.setData({
        creatingInvite: false,
        error: `客户分享链接生成失败：${errMsg}`,
      });
      wx.showToast({ title: '生成失败', icon: 'none' });
    }
  },

  // 第二层 · 发布正式行程:翻 customer_official_released → 客户从第一层手机行程单图升级到正式行程卡片。
  async releaseOfficialTrip() {
    if (this.data.releasing) return;
    if (!this.data.tripId) {
      wx.showToast({ title: '缺少 trip_id', icon: 'none' });
      return;
    }
    this.setData({ releasing: true });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'publishCustomerTrip',
        data: { trip_id: this.data.tripId },
      });
      if (!result || !result.success) {
        wx.showToast({ title: (result && result.message) || '发布失败', icon: 'none' });
        this.setData({ releasing: false });
        return;
      }
      wx.showToast({ title: '已发布，客户可见正式行程', icon: 'success' });
      this.setData({ releasing: false });
      this.loadPreview({ silent: true });
    } catch (error) {
      console.error('[customer-trip-detail] releaseOfficialTrip failed', error);
      wx.showToast({ title: '发布失败', icon: 'none' });
      this.setData({ releasing: false });
    }
  },

  // 第二层 · 收回正式行程:release=false → 客户回落到第一层手机行程单图(内容不动)。
  async unreleaseOfficialTrip() {
    if (this.data.releasing) return;
    if (!this.data.tripId) {
      wx.showToast({ title: '缺少 trip_id', icon: 'none' });
      return;
    }
    this.setData({ releasing: true });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'publishCustomerTrip',
        data: { trip_id: this.data.tripId, release: false },
      });
      if (!result || !result.success) {
        wx.showToast({ title: (result && result.message) || '收回失败', icon: 'none' });
        this.setData({ releasing: false });
        return;
      }
      wx.showToast({ title: '已收回，客户回到行程单草稿', icon: 'success' });
      this.setData({ releasing: false });
      this.loadPreview({ silent: true });
    } catch (error) {
      console.error('[customer-trip-detail] unreleaseOfficialTrip failed', error);
      wx.showToast({ title: '收回失败', icon: 'none' });
      this.setData({ releasing: false });
    }
  },

  previewMobileItineraryDraft() {
    if (this.data.previewingDraft) return;
    if (!this.data.tripId) {
      wx.showToast({ title: '缺少 trip_id', icon: 'none' });
      return;
    }
    if (!this.data.canForwardSheet) {
      wx.showToast({ title: '手机版行程单尚未生成', icon: 'none' });
      return;
    }
    const sheet = this.data.preview && this.data.preview.itinerary_sheet;
    if (!sheet || !sheet.png_url) {
      wx.showToast({ title: '手机版行程单图片缺失', icon: 'none' });
      return;
    }
    this.setData({ previewingDraft: true, error: '' });
    try {
      const app = getApp();
      app.globalData.operatorMobileItineraryDraftPreview = {
        itinerary_sheet: sheet,
        trip_id: this.data.preview.trip_id || this.data.tripId,
        external_trip_id: this.data.preview.external_trip_id || '',
        trip_no: this.data.preview.trip_no || '',
        preview_meta: {
          operator_draft_preview: true,
        },
      };
      delete app.globalData.operatorCustomerHomePreview;
      delete app.globalData.operatorCustomerSharePreview;
      this.setData({ previewingDraft: false });
      wx.navigateTo({
        url: '/pages/customer/mobile-itinerary/mobile-itinerary?operator_mobile_preview=1',
        fail: (error) => {
          console.error('[customer-trip-detail] open mobile itinerary draft failed', error);
          wx.showToast({ title: '行程预览打开失败', icon: 'none' });
        },
      });
    } catch (error) {
      console.error('[customer-trip-detail] previewMobileItineraryDraft failed', error);
      const errMsg = (error && (error.errMsg || error.message)) || '未知错误';
      this.setData({
        previewingDraft: false,
        error: `行程预览加载失败：${errMsg}`,
      });
      wx.showToast({ title: '行程预览加载失败', icon: 'none' });
    }
  },

  buildTripInviteShare() {
    const { invitePath, publishedSnapshot, activeSnapshot, preview, tripId } = this.data;
    if (!invitePath) {
      wx.showToast({ title: '请先准备行程单', icon: 'none' });
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
      wx.showToast({ title: '请先准备行程单', icon: 'none' });
    }
  },

  openMobileItineraryPreview() {
    const invitePath = String(this.data.invitePath || '').trim();
    if (!invitePath) {
      wx.showToast({ title: '请先准备行程单', icon: 'none' });
      return;
    }
    const url = invitePath.startsWith('/') ? invitePath : `/${invitePath}`;
    wx.navigateTo({
      url,
      fail: (error) => {
        console.error('[customer-trip-detail] open mobile itinerary preview failed', error);
        wx.showToast({ title: '手机版行程单打开失败', icon: 'none' });
      },
    });
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
      wx.showToast({ title: '暂无可核对内容', icon: 'none' });
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
