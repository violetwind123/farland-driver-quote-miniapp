Page({
  data: {
    loading: true,
    refreshing: false,
    building: false,
    publishing: false,
    creatingInvite: false,
    tripId: '',
    error: '',
    reviewNote: '',
    preview: null,
    draftSnapshot: null,
    publishedSnapshot: null,
    activeSnapshotType: 'draft',
    activeSnapshot: null,
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
    this.setData({
      loading: false,
      refreshing: false,
      preview: result,
      draftSnapshot,
      publishedSnapshot,
      activeSnapshotType: nextActiveType,
      activeSnapshot: nextActiveType === 'draft' ? draftSnapshot : publishedSnapshot,
      warningList: result.warning_codes || [],
      criticalWarningList: result.critical_warning_codes || [],
      changedSections: (result.diff_summary && result.diff_summary.changed_sections) || [],
      hasDraft,
      hasPublished,
      stateText: state.text,
      stateHint: state.hint,
      canPublish: hasDraft && !(result.critical_warning_codes || []).length,
      error: '',
    });
  },

  normalizeSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) || !Object.keys(snapshot).length) {
      return null;
    }
    const hero = snapshot.hero || {};
    const customer = snapshot.customer || {};
    const advisor = snapshot.advisor || {};
    const days = Array.isArray(snapshot.itinerary_days) ? snapshot.itinerary_days : [];
    return {
      ...snapshot,
      display_title: hero.title || snapshot.title || 'Farland 行程',
      display_trip_no: hero.trip_no || snapshot.trip_no || snapshot.external_trip_id || snapshot.trip_id || '',
      display_date_range: hero.date_range || [snapshot.start_at || '', snapshot.end_at || ''].filter(Boolean).join(' - '),
      display_city: hero.city_summary || snapshot.city || '',
      display_customer: customer.display_name || customer.name || '',
      display_advisor: advisor.name || 'Farland Advisor',
      itinerary_days: days.map((day, index) => ({
        ...day,
        display_day_label: `Day ${day.day_no || index + 1}`,
        timeline_items: Array.isArray(day.timeline_items) ? day.timeline_items : [],
      })),
      hotels: Array.isArray(snapshot.hotels) ? snapshot.hotels : [],
      flights: Array.isArray(snapshot.flights) ? snapshot.flights : [],
      transfers: Array.isArray(snapshot.transfers) ? snapshot.transfers : [],
      charter_services: Array.isArray(snapshot.charter_services) ? snapshot.charter_services : [],
      documents: Array.isArray(snapshot.documents) ? snapshot.documents : [],
    };
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
    this.setData({
      activeSnapshotType: type,
      activeSnapshot: type === 'draft' ? this.data.draftSnapshot : this.data.publishedSnapshot,
    });
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
      this.setData({ building: false, activeSnapshotType: 'draft' });
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

  copyInvitePath() {
    if (!this.data.invitePath) {
      wx.showToast({ title: '请先生成分享卡', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: this.data.invitePath,
      success: () => wx.showToast({ title: '已复制客户路径', icon: 'success' }),
    });
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

  backToImport() {
    wx.navigateBack({
      fail: () => {
        wx.navigateTo({ url: '/pages/operator/customer-import/customer-import' });
      },
    });
  },
});
