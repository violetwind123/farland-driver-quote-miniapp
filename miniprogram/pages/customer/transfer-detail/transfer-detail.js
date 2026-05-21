Page({
  data: {
    loading: true,
    requestId: '',
    request: null,
    quotes: [],
    activityEvents: [],
  },

  onLoad(options) {
    const requestId = options && options.request_id ? options.request_id : '';
    this.setData({ requestId });
    this.loadTransferDetail(requestId);
  },

  async loadTransferDetail(requestId) {
    this.setData({ loading: true });
    try {
      const { result } = await wx.cloud.callFunction({ name: 'getCustomerHome' });
      if (!result || !result.success) {
        wx.showToast({ title: '加载失败', icon: 'none' });
        this.setData({ loading: false });
        return;
      }
      const requests = result.transfer_requests || [];
      const request = requests.find((item) => item.request_id === requestId) || requests[0] || null;
      if (!request) {
        this.setData({ loading: false, request: null, quotes: [], activityEvents: [] });
        return;
      }
      const quotes = (request.quotes || []).map((quote) => ({
        ...quote,
        feeRateText: `${Math.round((quote.farland_service_fee_rate || 0.1) * 100)}%`,
        includesText: (quote.includes || []).join(' / '),
        excludesText: (quote.excludes || []).join(' / '),
      }));
      this.setData({
        loading: false,
        request,
        quotes,
        activityEvents: request.activity_events || [],
      });
    } catch (error) {
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  chooseQuote(e) {
    const quoteId = e.currentTarget.dataset.quoteId;
    if (!quoteId) return;
    wx.showToast({ title: '已选择方案，等待 Farland 最终确认', icon: 'none' });
  },
});
