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
    summary: {},
    todo: {
      pending_selection: [],
      expiring_soon: [],
      no_quote: [],
    },
    driverRegionSummary: [],
    requests: [],
    filteredRequests: [],
    tabs: REQUEST_TABS,
    activeTab: 'all',
  },

  onShow() {
    this.loadDashboard();
  },

  async loadDashboard() {
    this.setData({ loading: true });
    try {
      const { result } = await wx.cloud.callFunction({ name: 'getOperatorRequests' });
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
      const todo = result.todo || {};
      this.setData({
        loading: false,
        summary: result.summary || {},
        todo: {
          pending_selection: this.decorateTodo(todo.pending_selection || []),
          expiring_soon: this.decorateTodo(todo.expiring_soon || []),
          no_quote: this.decorateTodo(todo.no_quote || []),
        },
        driverRegionSummary: result.driver_region_summary || [],
        requests,
      });
      this.applyTabFilter(this.data.activeTab);
    } catch (error) {
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  decorateTodo(items) {
    return items.map((item) => ({
      ...item,
      service_type_text: item.service_type === 'transfer' ? '接送 / 转场' : '包车 / 多日用车',
    }));
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

  onTabTap(e) {
    this.applyTabFilter(e.currentTarget.dataset.key);
  },

  onSummaryTap(e) {
    const tabKey = e.currentTarget.dataset.tab;
    this.applyTabFilter(tabKey);
    wx.pageScrollTo({
      selector: '#request-list',
      duration: 200,
    });
  },

  applyTabFilter(tabKey) {
    const requests = this.data.requests || [];
    let filtered = requests;
    if (tabKey === 'quoting') {
      filtered = requests.filter((item) => ['quoting', 'quoted'].includes(item.status));
    } else if (tabKey === 'pending_selection') {
      filtered = requests.filter((item) => item.dashboard_tag === 'pending_selection');
    } else if (tabKey === 'assigned') {
      filtered = requests.filter((item) => item.status === 'assigned');
    } else if (tabKey === 'cancelled') {
      filtered = requests.filter((item) => item.status === 'cancelled');
    }
    this.setData({ activeTab: tabKey, filteredRequests: filtered });
  },

  goCreate() {
    wx.navigateTo({ url: '/pages/operator/create-request/create-request' });
  },

  openDetail(e) {
    wx.navigateTo({ url: `/pages/operator/request-detail/request-detail?id=${e.currentTarget.dataset.id}` });
  },

  openRegion(e) {
    const region = e.currentTarget.dataset.region;
    wx.navigateTo({ url: `/pages/operator/drivers-by-region/drivers-by-region?region=${encodeURIComponent(region)}` });
  },
});
