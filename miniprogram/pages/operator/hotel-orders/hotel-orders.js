const TABS = [
  { key: 'pending_payment', label: '待付款' },
  { key: 'paid', label: '已付款' },
  { key: 'all', label: '全部' },
];

Page({
  data: {
    loading: true,
    actingId: '',
    activeTab: 'pending_payment',
    tabs: TABS,
    orders: [],
  },

  onLoad(options = {}) {
    this.setData({ activeTab: options.tab || 'pending_payment' });
    this.loadOrders();
  },

  onPullDownRefresh() {
    this.loadOrders().finally(() => wx.stopPullDownRefresh());
  },

  async loadOrders() {
    this.setData({ loading: true });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'manageManualHotelOrders',
        data: {
          action: 'list',
          tab: this.data.activeTab,
        },
      });
      if (!result || !result.success) {
        wx.showToast({ title: (result && result.message) || '加载失败', icon: 'none' });
        this.setData({ loading: false });
        return;
      }
      const orders = (result.orders || []).map((order) => this.normalizeOrder(order));
      this.setData({ loading: false, orders });
    } catch (error) {
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  normalizeOrder(order = {}) {
    const stayParts = [order.check_in_date, order.check_out_date].filter(Boolean);
    const metaParts = [
      stayParts.length ? stayParts.join(' - ') : '',
      `${order.rooms || 1}间`,
      order.guests_count ? `${order.guests_count}人` : '',
    ].filter(Boolean);
    return {
      ...order,
      stayText: metaParts.join(' · '),
      contactText: [order.contact_name, order.contact_mobile].filter(Boolean).join(' · ') || '联系人待补充',
      roomText: [order.room_name, order.rate_plan_name].filter(Boolean).join(' · '),
      can_confirm_paid: order.payment_status === 'manual_payment_pending',
      statusClass: order.payment_status === 'manual_payment_confirmed' ? 'paid' : 'pending',
      paidNote: order.paid_confirmed_at ? `付款已确认 · ${order.paid_confirmed_at}` : '付款已确认',
    };
  },

  onTabTap(e) {
    const key = e.currentTarget.dataset.key;
    if (!key || key === this.data.activeTab) return;
    this.setData({ activeTab: key });
    this.loadOrders();
  },

  confirmPaid(e) {
    const orderId = e.currentTarget.dataset.id;
    const order = this.data.orders.find((item) => item._id === orderId);
    if (!order || !order.can_confirm_paid) return;
    wx.showModal({
      title: '确认已付款',
      content: `确认 ${order.order_no || '该酒店订单'} 已收到手动付款？确认后不会自动创建供应商订单。`,
      confirmText: '确认付款',
      success: async (res) => {
        if (!res.confirm) return;
        await this.doConfirmPaid(orderId);
      },
    });
  },

  async doConfirmPaid(orderId) {
    this.setData({ actingId: orderId });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'manageManualHotelOrders',
        data: {
          action: 'confirm_paid',
          order_id: orderId,
        },
      });
      if (!result || !result.success) {
        wx.showToast({ title: (result && result.message) || '确认失败', icon: 'none' });
        this.setData({ actingId: '' });
        return;
      }
      wx.showToast({ title: '已确认付款', icon: 'success' });
      this.setData({ actingId: '' });
      this.loadOrders();
    } catch (error) {
      wx.showToast({ title: '确认失败', icon: 'none' });
      this.setData({ actingId: '' });
    }
  },
});
