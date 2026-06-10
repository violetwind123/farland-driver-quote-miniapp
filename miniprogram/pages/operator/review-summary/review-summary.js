Page({
  data: {
    loading: true,
    refreshing: false,
    error: '',
    overall: { count: 0, avg_rating: 0, low_count: 0 },
    driverSummaries: [],
    tripSummaries: [],
    unattributed: { count: 0, avg_rating: 0, low_count: 0 },
    followUps: [],
    truncated: false,
    expandedDriverId: '',
  },

  onLoad() {
    this.loadSummaries();
  },

  onPullDownRefresh() {
    this.loadSummaries({ silent: true }).finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  async loadSummaries(options = {}) {
    const silent = Boolean(options.silent);
    this.setData({ loading: !silent, refreshing: silent, error: '' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'listDriverReviewSummaries',
        data: {},
      });
      if (!result || !result.success) {
        this.setData({
          loading: false,
          refreshing: false,
          error: (result && result.message) || '评价汇总加载失败',
        });
        return;
      }
      this.setData({
        loading: false,
        refreshing: false,
        overall: result.overall || { count: 0, avg_rating: 0, low_count: 0 },
        driverSummaries: result.driver_summaries || [],
        tripSummaries: result.trip_summaries || [],
        unattributed: result.unattributed || { count: 0, avg_rating: 0, low_count: 0 },
        followUps: result.follow_ups || [],
        truncated: Boolean(result.truncated),
      });
    } catch (error) {
      console.error('[review-summary] listDriverReviewSummaries failed', error);
      const errMsg = (error && (error.errMsg || error.message)) || '未知错误';
      this.setData({
        loading: false,
        refreshing: false,
        error: `评价汇总加载失败：${errMsg}`,
      });
    }
  },

  refresh() {
    this.loadSummaries({ silent: true });
  },

  toggleDriver(e) {
    const driverId = e.currentTarget.dataset.driver || '';
    this.setData({
      expandedDriverId: this.data.expandedDriverId === driverId ? '' : driverId,
    });
  },

  openTrip(e) {
    const tripId = e.currentTarget.dataset.trip || '';
    if (!tripId) return;
    wx.navigateTo({
      url: `/pages/operator/customer-trip-detail/customer-trip-detail?trip_id=${encodeURIComponent(tripId)}`,
    });
  },
});
