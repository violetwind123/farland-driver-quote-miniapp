Page({
  data: {
    loading: true,
    summary: {},
  },

  onShow() {
    const app = getApp();
    const cached = app.globalData && app.globalData.preload && app.globalData.preload.operatorDashboard;
    if (cached) {
      this.setData({
        loading: false,
        summary: cached.summary || {},
      });
      delete app.globalData.preload.operatorDashboard;
      this.loadDashboard({ silent: true });
      return;
    }
    this.loadDashboard();
  },

  async loadDashboard(options = {}) {
    const silent = Boolean(options.silent);
    if (!silent) this.setData({ loading: true });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getOperatorRequests',
        data: { mode: 'summary' },
      });
      if (!result || !result.success) {
        wx.showToast({ title: (result && result.message) || '加载失败', icon: 'none' });
        if (!silent) this.setData({ loading: false });
        return;
      }
      this.setData({
        loading: false,
        summary: result.summary || {},
      });
    } catch (error) {
      wx.showToast({ title: '加载失败', icon: 'none' });
      if (!silent) this.setData({ loading: false });
    }
  },

  openRequestHall(e) {
    const tab = e.currentTarget.dataset.tab || 'all';
    wx.navigateTo({ url: `/pages/operator/request-hall/request-hall?tab=${tab}` });
  },

  openDriverSummary() {
    wx.navigateTo({ url: '/pages/operator/driver-summary/driver-summary' });
  },

  openHotelRequest() {
    wx.switchTab({ url: '/pages/hotel/request/request' });
  },

  openCustomerImport() {
    wx.navigateTo({ url: '/pages/operator/customer-import/customer-import' });
  },

  openCustomerInviteRequests() {
    wx.navigateTo({ url: '/pages/operator/request-hall/request-hall?tab=all' });
  },

  goCreate() {
    wx.navigateTo({ url: '/pages/operator/create-request/create-request' });
  },
});
