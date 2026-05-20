const REQUEST_TABS = [
  { key: 'all', label: '全部' },
  { key: 'quoting', label: '报价中' },
  { key: 'pending_selection', label: '待选择' },
  { key: 'assigned', label: '已选择' },
  { key: 'cancelled', label: '已取消' },
];

Page({
  data: {
    loading: true,
    tabs: REQUEST_TABS,
    activeTab: 'all',
    requests: [],
  },

  onLoad(options) {
    this.setData({ activeTab: options.tab || 'all' });
    this.loadRequests();
  },

  onPullDownRefresh() {
    this.loadRequests().finally(() => wx.stopPullDownRefresh());
  },

  getStatusText(status) {
    const map = {
      quoting: '报价中',
      quoted: '报价中',
      assigned: '已选择',
      cancelled: '已取消',
      completed: '已完成',
    };
    return map[status] || status || '-';
  },

  getTagText(tag) {
    const map = {
      pending_selection: '待选择',
      expiring_soon: '即将截止',
      no_quote: '暂无报价',
      assigned: '已选择',
      cancelled: '已取消',
      quoting: '报价中',
    };
    return map[tag] || tag || '-';
  },

  async loadRequests() {
    this.setData({ loading: true });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getOperatorRequests',
        data: {
          mode: 'requests',
          tab: this.data.activeTab,
        },
      });
      if (!result || !result.success) {
        wx.showToast({ title: (result && result.message) || '加载失败', icon: 'none' });
        this.setData({ loading: false });
        return;
      }
      const requests = (result.requests || []).map((request) => ({
        ...request,
        service_type_text: request.service_type === 'transfer' ? '接送 / 转场' : '包车 / 多日用车',
        status_text: this.getStatusText(request.status),
        dashboard_tag_text: this.getTagText(request.dashboard_tag),
      }));
      this.setData({ loading: false, requests });
    } catch (error) {
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  onTabTap(e) {
    this.setData({ activeTab: e.currentTarget.dataset.key });
    this.loadRequests();
  },

  openDetail(e) {
    wx.navigateTo({ url: `/pages/operator/request-detail/request-detail?id=${e.currentTarget.dataset.id}` });
  },
});
