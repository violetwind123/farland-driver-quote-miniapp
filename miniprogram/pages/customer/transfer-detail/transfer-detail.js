Page({
  data: {
    loading: true,
    requestId: '',
    inviteCode: '',
    request: null,
    quotes: [],
    activityEvents: [],
    hasPublishedQuotes: false,
    selectedQuoteId: '',
    selectedQuoteTitle: '',
    customerNotice: '',
    refreshingDetail: false,
    choosingQuoteId: '',
    accessSource: '',
    showProfileSave: false,
    showProfileSaveForm: false,
    profileSaveName: '',
    profileSaving: false,
    autoSavingInvite: false,
    autoSavedInviteKey: '',
  },

  onLoad(options) {
    const requestId = options && options.request_id ? options.request_id : '';
    const inviteCode = options && options.invite_code ? options.invite_code : '';
    this.setData({ requestId, inviteCode });
    this.loadTransferDetail(requestId, inviteCode);
  },

  onShow() {
    if (this.data.requestId && !this.data.loading) {
      this.loadTransferDetail(this.data.requestId, this.data.inviteCode, { silent: true });
    }
    this.startStatusPolling();
  },

  onHide() {
    this.stopStatusPolling();
  },

  onUnload() {
    this.stopStatusPolling();
  },

  startStatusPolling() {
    this.stopStatusPolling();
    this.statusPollTimer = setInterval(() => {
      if (!this.data.requestId || this.data.loading || this.data.refreshingDetail) return;
      const status = this.data.request && this.data.request.status;
      if (status === 'assigned' || status === 'cancelled') {
        this.stopStatusPolling();
        return;
      }
      this.loadTransferDetail(this.data.requestId, this.data.inviteCode, { silent: true });
    }, 7000);
  },

  stopStatusPolling() {
    if (this.statusPollTimer) {
      clearInterval(this.statusPollTimer);
      this.statusPollTimer = null;
    }
  },

  refreshStatus() {
    this.loadTransferDetail(this.data.requestId, this.data.inviteCode, { silent: true });
  },

  async loadTransferDetail(requestId, inviteCode = '', options = {}) {
    const silent = Boolean(options.silent);
    if (!requestId) {
      this.setData({ loading: false, refreshingDetail: false, request: null, quotes: [], activityEvents: [], hasPublishedQuotes: false });
      return;
    }

    if (silent) {
      this.setData({ refreshingDetail: true });
    } else {
      this.setData({ loading: true });
    }
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getCustomerTransportQuotes',
        data: {
          request_id: requestId,
          invite_code: inviteCode,
        },
      });
      if (!result || !result.success) {
        if (!silent) wx.showToast({ title: (result && result.message) || '加载失败', icon: 'none' });
        this.setData({ loading: false, refreshingDetail: false });
        return;
      }
      if (inviteCode && result.access_source === 'temporary_invite') {
        const autoSaved = await this.tryAutoSaveForRegisteredCustomer(requestId, inviteCode);
        if (autoSaved) return;
      }
      const summary = result.request_summary || {};
      const assignedTransport = result.assigned_transport || {};
      const isAssignedStatus = summary.status === 'assigned' || summary.status === 'confirmed';
      const request = {
        request_id: result.request_id || requestId,
        service_type: summary.service_type || '',
        service_type_label: summary.service_type_label || '',
        task_title: summary.task_title || '',
        pickup: summary.pickup || summary.driver_region || '待确认',
        dropoff: summary.dropoff || '待确认',
        pickup_time_text: this.formatDisplayTime(summary.pickup_time_text || summary.service_date || '待确认'),
        route_text: summary.route_text || [summary.pickup || '', summary.dropoff || ''].filter(Boolean).join(' → '),
        time_summary: summary.time_summary || '',
        flight_summary: summary.flight_summary || '',
        task_description: summary.task_description || '',
        execution_note: summary.execution_note || '',
        estimated_drive_time: summary.estimated_drive_time || '',
        estimated_distance: summary.estimated_distance || '',
        flight_no: summary.flight_no || '',
        terminal: summary.terminal || '',
        scheduled_flight_time: summary.scheduled_flight_time || '',
        driver_arrive_time: summary.driver_arrive_time || '',
        passengers: summary.passengers || '-',
        luggage: summary.luggage || '-',
        status: summary.status || '',
        is_assigned_status: isAssignedStatus,
        cancel_reason_driver: summary.cancel_reason_driver || '',
        assigned_transport: isAssignedStatus ? assignedTransport : null,
        status_text: summary.status_text || 'Farland 正在为您确认用车方案',
        ops_status_text: summary.ops_status_text || (result.has_published_quotes
          ? 'Farland 已为您发布用车方案。'
          : 'Farland 正在为您确认用车方案。'),
        created_by_text: summary.created_by_text || 'Farland 顾问已记录该用车需求',
      };
      const quotes = (result.quotes || []).map((quote) => ({
        ...quote,
        quote_id: quote.quote_id || quote._id,
        public_title: quote.public_title || quote.title || 'Farland 用车方案',
        suitable_for: quote.operator_explanation || '',
        feeRateText: `${Math.round((quote.farland_service_fee_rate || 0.1) * 100)}%`,
        includesText: (quote.includes || quote.included_items || []).join(' / '),
        excludesText: (quote.excludes || quote.excluded_items || []).join(' / '),
      }));
      const selectedQuote = quotes.find((quote) => quote.is_selected_by_customer || quote.quote_status === 'selected');
      this.setData({
        loading: false,
        refreshingDetail: false,
        request,
        quotes,
        hasPublishedQuotes: Boolean(result.has_published_quotes) && summary.status !== 'cancelled' && !isAssignedStatus,
        selectedQuoteId: selectedQuote ? selectedQuote.quote_id : '',
        selectedQuoteTitle: selectedQuote ? selectedQuote.public_title : '',
        customerNotice: selectedQuote ? '' : (result.customer_notice || ''),
        activityEvents: [],
        accessSource: result.access_source || '',
        showProfileSave: Boolean(inviteCode && result.access_source === 'temporary_invite'),
      });
      if (isAssignedStatus || summary.status === 'cancelled') {
        this.stopStatusPolling();
      } else {
        this.startStatusPolling();
      }
    } catch (error) {
      if (!silent) wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false, refreshingDetail: false });
    }
  },

  openProfileSaveForm() {
    this.setData({ showProfileSaveForm: true });
  },

  async tryAutoSaveForRegisteredCustomer(requestId, inviteCode) {
    const { autoSavingInvite, autoSavedInviteKey } = this.data;
    if (!requestId || !inviteCode || autoSavingInvite) return false;
    const inviteKey = `${requestId}:${inviteCode}`;
    if (autoSavedInviteKey === inviteKey) return false;

    this.setData({
      autoSavingInvite: true,
      autoSavedInviteKey: inviteKey,
    });

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'claimCustomerInvite',
        data: {
          request_id: requestId,
          invite_code: inviteCode,
          bind_mode: 'farland_profile',
          auto_claim: true,
        },
      });
      this.setData({ autoSavingInvite: false });
      if (!result || !result.success) {
        return false;
      }

      wx.showToast({ title: '已同步行程', icon: 'success' });
      this.loadTransferDetail(requestId, inviteCode, { silent: true });
      return true;
    } catch (error) {
      this.setData({ autoSavingInvite: false });
      return false;
    }
  },

  formatDisplayTime(value) {
    if (!value && value !== 0) return '';
    return String(value)
      .replace(/\b(1[0-2]|0?[1-9]):([0-5]\d)\s*(AM|PM)\b/gi, (match, hour, minute, period) => {
        let hour24 = Number(hour);
        const normalizedPeriod = String(period).toUpperCase();
        if (normalizedPeriod === 'PM' && hour24 !== 12) hour24 += 12;
        if (normalizedPeriod === 'AM' && hour24 === 12) hour24 = 0;
        return `${String(hour24).padStart(2, '0')}:${minute}`;
      })
      .replace(/(上午|下午)\s*(1[0-2]|0?[1-9]):([0-5]\d)/g, (match, period, hour, minute) => {
        let hour24 = Number(hour);
        if (period === '下午' && hour24 !== 12) hour24 += 12;
        if (period === '上午' && hour24 === 12) hour24 = 0;
        return `${String(hour24).padStart(2, '0')}:${minute}`;
      });
  },

  onProfileSaveNameInput(e) {
    this.setData({ profileSaveName: e.detail.value || '' });
  },

  async saveToFarlandProfile() {
    const safeName = String(this.data.profileSaveName || '').trim();
    if (!safeName) {
      wx.showToast({ title: '请填写称呼', icon: 'none' });
      return;
    }
    if (!this.data.requestId || !this.data.inviteCode || this.data.profileSaving) return;

    this.setData({ profileSaving: true });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'claimCustomerInvite',
        data: {
          request_id: this.data.requestId,
          invite_code: this.data.inviteCode,
          bind_mode: 'farland_profile',
          display_name: safeName,
        },
      });
      if (!result || !result.success) {
        wx.showToast({ title: (result && result.message) || '保存失败', icon: 'none' });
        this.setData({ profileSaving: false });
        return;
      }
      wx.showToast({ title: '已保存', icon: 'success' });
      this.setData({
        profileSaving: false,
        showProfileSave: false,
        showProfileSaveForm: false,
      });
      this.loadTransferDetail(this.data.requestId, this.data.inviteCode, { silent: true });
    } catch (error) {
      wx.showToast({ title: '保存失败', icon: 'none' });
      this.setData({ profileSaving: false });
    }
  },

  async chooseQuote(e) {
    const quoteId = e.currentTarget.dataset.quoteId;
    if (!quoteId || this.data.choosingQuoteId) return;
    const quote = (this.data.quotes || []).find((item) => item.quote_id === quoteId || item._id === quoteId);
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '选择用车方案',
        content: `确认选择${quote ? `「${quote.public_title}」` : '该方案'}吗？Farland 顾问会继续为您确认后续安排。`,
        confirmText: '选择',
        success: (res) => resolve(res.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;

    this.setData({ choosingQuoteId: quoteId });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'selectCustomerQuote',
        data: {
          request_id: this.data.requestId,
          customer_quote_id: quoteId,
          invite_code: this.data.inviteCode,
        },
      });
      if (!result || !result.success) {
        wx.showToast({ title: (result && result.message) || '选择失败', icon: 'none' });
        this.setData({ choosingQuoteId: '' });
        return;
      }
      wx.showToast({ title: '已选择方案', icon: 'success' });
      this.setData({
        choosingQuoteId: '',
        selectedQuoteId: quoteId,
        selectedQuoteTitle: quote ? quote.public_title : '该方案',
      });
      this.loadTransferDetail(this.data.requestId, this.data.inviteCode, { silent: true });
    } catch (error) {
      wx.showToast({ title: '选择失败', icon: 'none' });
      this.setData({ choosingQuoteId: '' });
    }
  },
});
