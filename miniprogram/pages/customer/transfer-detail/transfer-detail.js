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
      const summary = result.request_summary || {};
      const assignedTransport = result.assigned_transport || {};
      const request = {
        request_id: result.request_id || requestId,
        pickup: summary.pickup || summary.driver_region || '待确认',
        dropoff: summary.dropoff || '待确认',
        pickup_time_text: summary.pickup_time_text || summary.service_date || '待确认',
        passengers: summary.passengers || '-',
        luggage: summary.luggage || '-',
        status: summary.status || '',
        cancel_reason_driver: summary.cancel_reason_driver || '',
        assigned_transport: summary.status === 'assigned' ? assignedTransport : null,
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
        hasPublishedQuotes: Boolean(result.has_published_quotes) && summary.status !== 'cancelled' && summary.status !== 'assigned',
        selectedQuoteId: selectedQuote ? selectedQuote.quote_id : '',
        selectedQuoteTitle: selectedQuote ? selectedQuote.public_title : '',
        customerNotice: selectedQuote ? '' : (result.customer_notice || ''),
        activityEvents: [],
        accessSource: result.access_source || '',
      });
      if (summary.status === 'assigned' || summary.status === 'cancelled') {
        this.stopStatusPolling();
      } else {
        this.startStatusPolling();
      }
    } catch (error) {
      if (!silent) wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false, refreshingDetail: false });
    }
  },

  async chooseQuote(e) {
    const quoteId = e.currentTarget.dataset.quoteId;
    if (!quoteId || this.data.choosingQuoteId) return;
    if (this.data.accessSource === 'temporary_invite') {
      wx.showToast({ title: '请先保存到我的 Farland 行程', icon: 'none' });
      return;
    }
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
