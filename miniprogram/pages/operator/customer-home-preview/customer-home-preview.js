Page({
  data: {
    loading: false,
    customerLoading: false,
    building: false,
    publishing: false,
    creatingInvite: false,
    tripId: '',
    requestId: '',
    previewMode: 'temporary_guest',
    keyword: '',
    customers: [],
    selectedCustomer: null,
    preview: null,
    customerHome: null,
    previewMeta: {
      customer_would_see: 'waiting',
      warnings: [],
      critical_warnings: [],
      unpublished: true,
    },
    previewCustomer: null,
    error: '',
    reviewNote: '',
    invitePath: '',
    inviteCode: '',
    inviteExpiresAt: '',
  },

  onLoad(options = {}) {
    this.setData({
      tripId: decodeURIComponent(options.trip_id || ''),
      requestId: decodeURIComponent(options.request_id || ''),
      previewMode: options.preview_access_mode === 'existing_customer' ? 'existing_customer' : 'temporary_guest',
    });
    this.loadCustomers();
    if (options.trip_id || options.request_id) {
      this.loadPreview();
    }
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value || '' });
  },

  onTripIdInput(e) {
    this.setData({
      tripId: e.detail.value || '',
      preview: null,
      customerHome: null,
      previewMeta: {
        customer_would_see: 'waiting',
        warnings: [],
        critical_warnings: [],
        unpublished: true,
      },
      invitePath: '',
    });
  },

  onReviewNoteInput(e) {
    this.setData({ reviewNote: e.detail.value || '' });
  },

  async loadCustomers() {
    this.setData({ customerLoading: true });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'searchCustomersForOperator',
        data: {
          keyword: this.data.keyword,
          limit: 50,
          mode: 'preview_selector',
        },
      });
      if (!result || !result.success) {
        this.setData({ customerLoading: false });
        wx.showToast({ title: (result && result.message) || '客户加载失败', icon: 'none' });
        return;
      }
      this.setData({
        customerLoading: false,
        customers: result.customers || [],
      });
    } catch (error) {
      console.error('[customer-home-preview] searchCustomersForOperator failed', error);
      this.setData({ customerLoading: false });
      wx.showToast({ title: '客户加载失败', icon: 'none' });
    }
  },

  searchCustomers() {
    this.loadCustomers();
  },

  selectTemporaryGuest() {
    this.setData({
      previewMode: 'temporary_guest',
      selectedCustomer: null,
      preview: null,
      customerHome: null,
      previewMeta: {
        customer_would_see: 'waiting',
        warnings: [],
        critical_warnings: [],
        unpublished: true,
      },
      invitePath: '',
    });
    if (this.data.tripId || this.data.requestId) this.loadPreview();
  },

  selectCustomer(e) {
    const userId = e.currentTarget.dataset.userId;
    const customer = (this.data.customers || []).find((item) => item.customer_user_id === userId || item.user_id === userId);
    if (!customer) return;
    this.setData({
      previewMode: 'existing_customer',
      selectedCustomer: customer,
      preview: null,
      customerHome: null,
      previewMeta: {
        customer_would_see: 'waiting',
        warnings: [],
        critical_warnings: [],
        unpublished: true,
      },
      invitePath: '',
    });
    this.loadPreview({ enterCustomerPage: true });
  },

  async loadPreview(options = {}) {
    const enterCustomerPage = Boolean(options.enterCustomerPage);
    const hasSelectedCustomer = this.data.previewMode === 'existing_customer' && this.data.selectedCustomer;
    if (!this.data.tripId && !this.data.requestId && !hasSelectedCustomer) {
      wx.showToast({ title: '请选择客户或输入 trip_id', icon: 'none' });
      return;
    }
    this.setData({ loading: true, error: '' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getOperatorCustomerHomePreview',
        data: {
          trip_id: this.data.tripId,
          request_id: this.data.requestId,
          customer_user_id: this.data.previewMode === 'existing_customer' && this.data.selectedCustomer
            ? this.data.selectedCustomer.customer_user_id
            : '',
          preview_access_mode: this.data.previewMode,
        },
      });
      if (!result || !result.success) {
        this.setData({
          loading: false,
          error: (result && result.message) || '预览加载失败',
        });
        wx.showToast({ title: '预览加载失败', icon: 'none' });
        return;
      }
      this.setData({
        loading: false,
        preview: result,
        customerHome: this.normalizeCustomerHome(result.customer_home || {}),
        previewMeta: result.preview_meta || {},
        previewCustomer: result.preview_customer || {},
        tripId: (result.preview_meta && result.preview_meta.trip_id) || this.data.tripId,
        invitePath: '',
        inviteCode: '',
        inviteExpiresAt: '',
      });
      if (enterCustomerPage) {
        this.openCustomerFacingPreview(result);
      }
    } catch (error) {
      console.error('[customer-home-preview] getOperatorCustomerHomePreview failed', error);
      const errMsg = (error && (error.errMsg || error.message)) || '未知错误';
      this.setData({
        loading: false,
        error: `预览加载失败：${errMsg}`,
      });
    }
  },

  normalizeCustomerHome(home) {
    return {
      profile: home.profile || {},
      today_itinerary: home.today_itinerary || null,
      daily_summary_cards: Array.isArray(home.daily_summary_cards)
        ? home.daily_summary_cards.map((card) => ({
          ...card,
          highlight_items: Array.isArray(card.highlight_items) ? card.highlight_items : [],
        }))
        : [],
      itinerary_days: Array.isArray(home.itinerary_days) ? home.itinerary_days : [],
      trip_overview: Array.isArray(home.trip_overview) ? home.trip_overview : [],
      transportation_appointments: Array.isArray(home.transportation_appointments) ? home.transportation_appointments : [],
      charter_services: Array.isArray(home.charter_services) ? home.charter_services : [],
      transfer_requests: Array.isArray(home.transfer_requests) ? home.transfer_requests : [],
      transport_orders: Array.isArray(home.transport_orders) ? home.transport_orders : [],
      hotel_requests: Array.isArray(home.hotel_requests) ? home.hotel_requests : [],
      flight_cards: Array.isArray(home.flight_cards) ? home.flight_cards : [],
      benefits: Array.isArray(home.benefits) ? home.benefits : [],
    };
  },

  openCustomerFacingPreview(previewResult) {
    const result = previewResult && (previewResult.customer_share_preview || previewResult.customer_home)
      ? previewResult
      : this.data.preview;
    if (!result || (!result.customer_share_preview && !result.customer_home)) {
      wx.showToast({ title: '请先生成预览', icon: 'none' });
      return;
    }
    const meta = result.preview_meta || {};
    const customerSharePreview = result.customer_share_preview || {
      trip_id: meta.trip_id || this.data.tripId || '',
      waiting: meta.customer_would_see !== 'published',
      message: 'Farland 顾问正在为您核对行程安排，确认后将在这里显示。',
      access_source: 'operator_preview',
      auto_saved: false,
      already_saved: false,
      can_save_to_profile: false,
      trip: null,
    };
    const app = getApp();
    app.globalData.operatorCustomerSharePreview = {
      customer_share_preview: customerSharePreview,
      preview_meta: meta,
      preview_customer: result.preview_customer || {},
    };
    app.globalData.operatorCustomerHomePreview = {
      customer_home: result.customer_home,
      preview_meta: meta,
      preview_customer: result.preview_customer || {},
      preview_access_mode: result.preview_access_mode || this.data.previewMode,
    };
    wx.switchTab({
      url: '/pages/customer/home/home',
      fail: (error) => {
        console.error('[customer-home-preview] open customer page failed', error);
        wx.showToast({ title: '客户页面打开失败', icon: 'none' });
      },
    });
  },

  async buildDraft() {
    if (!this.data.tripId) {
      wx.showToast({ title: '请输入 trip_id', icon: 'none' });
      return;
    }
    this.setData({ building: true, error: '' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'buildCustomerTripVisibleDraft',
        data: { trip_id: this.data.tripId },
      });
      if (!result || !result.success) {
        this.setData({ building: false, error: (result && result.message) || '生成草稿失败' });
        wx.showToast({ title: '生成失败', icon: 'none' });
        return;
      }
      this.setData({ building: false });
      wx.showToast({ title: '草稿已生成', icon: 'success' });
      this.loadPreview();
    } catch (error) {
      console.error('[customer-home-preview] build draft failed', error);
      const errMsg = (error && (error.errMsg || error.message)) || '未知错误';
      this.setData({ building: false, error: `生成草稿失败：${errMsg}` });
    }
  },

  async publishTrip() {
    if (!this.data.tripId) {
      wx.showToast({ title: '请输入 trip_id', icon: 'none' });
      return;
    }
    const criticalWarnings = (this.data.previewMeta && this.data.previewMeta.critical_warnings) || [];
    if (criticalWarnings.length) {
      wx.showToast({ title: '关键警告未处理', icon: 'none' });
      return;
    }
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '确认发布',
        content: '发布后客户分享卡将读取该版本。请确认预览内容无误。',
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
        this.setData({ publishing: false, error: (result && result.message) || '发布失败' });
        wx.showToast({ title: '发布失败', icon: 'none' });
        return;
      }
      this.setData({ publishing: false, invitePath: '', inviteCode: '', inviteExpiresAt: '' });
      wx.showToast({ title: '已发布', icon: 'success' });
      this.loadPreview();
    } catch (error) {
      console.error('[customer-home-preview] publish trip failed', error);
      const errMsg = (error && (error.errMsg || error.message)) || '未知错误';
      this.setData({ publishing: false, error: `发布失败：${errMsg}` });
    }
  },

  async createInvite() {
    if (!this.data.tripId) {
      wx.showToast({ title: '请输入 trip_id', icon: 'none' });
      return;
    }
    if (!this.data.previewMeta || this.data.previewMeta.customer_would_see !== 'published') {
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
        this.setData({ creatingInvite: false, error: (result && result.message) || '分享卡生成失败' });
        wx.showToast({ title: '生成失败', icon: 'none' });
        return;
      }
      this.setData({
        creatingInvite: false,
        invitePath: result.share_path || result.path || '',
        inviteCode: result.invite_code || '',
        inviteExpiresAt: result.expires_at || '',
      });
      wx.showToast({ title: result.reused ? '已复用分享卡' : '分享卡已生成', icon: 'success' });
    } catch (error) {
      console.error('[customer-home-preview] create invite failed', error);
      const errMsg = (error && (error.errMsg || error.message)) || '未知错误';
      this.setData({ creatingInvite: false, error: `分享卡生成失败：${errMsg}` });
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
});
