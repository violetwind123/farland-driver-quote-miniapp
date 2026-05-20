Page({
  data: {
    loading: true,
    driverRegionSummary: [],
  },

  onLoad() {
    this.loadDriverSummary();
  },

  onPullDownRefresh() {
    this.loadDriverSummary().finally(() => wx.stopPullDownRefresh());
  },

  async loadDriverSummary() {
    this.setData({ loading: true });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getOperatorRequests',
        data: { mode: 'driver_summary' },
      });
      if (!result || !result.success) {
        wx.showToast({ title: (result && result.message) || '加载失败', icon: 'none' });
        this.setData({ loading: false });
        return;
      }
      this.setData({
        loading: false,
        driverRegionSummary: result.driver_region_summary || [],
      });
    } catch (error) {
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  openRegion(e) {
    const region = e.currentTarget.dataset.region;
    wx.navigateTo({ url: `/pages/operator/drivers-by-region/drivers-by-region?region=${encodeURIComponent(region)}` });
  },
});
