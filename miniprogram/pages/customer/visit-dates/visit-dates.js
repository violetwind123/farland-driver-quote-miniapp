Page({
  data: {
    loading: true,
    syncLabel: '',
    filters: [
      { key: 'trip', label: '美东 · 本次行程', active: true },
      { key: 'ivy', label: '常春藤', active: false },
      { key: 'info', label: '有 Info Session', active: false },
      { key: 'fav', label: '已收藏', active: false },
    ],
    schools: [],
    keyword: '',
  },

  onLoad() {
    this.fetchDates();
  },

  activeFilterKey() {
    const active = this.data.filters.find((f) => f.active);
    return active ? active.key : 'trip';
  },

  fetchDates() {
    this.setData({ loading: true });
    wx.cloud.callFunction({
      name: 'getBookableVisitDates',
      data: { filter: this.activeFilterKey(), keyword: this.data.keyword },
    }).then((res) => {
      if (!res.result || !res.result.success) {
        this.setData({ loading: false, schools: [] });
        return;
      }
      this.setData({
        loading: false,
        syncLabel: res.result.sync_label || '',
        schools: res.result.schools || [],
      });
    }).catch(() => {
      this.setData({ loading: false, schools: [] });
    });
  },

  onFilterTap(e) {
    const key = e.currentTarget.dataset.key;
    const filters = this.data.filters.map((f) => ({ ...f, active: f.key === key }));
    this.setData({ filters });
    this.fetchDates();
  },

  onSearchInput(e) {
    const keyword = e.detail.value || '';
    this.setData({ keyword });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => {
      this.fetchDates();
    }, 350);
  },

  onMoreDates() {
    wx.showToast({ title: '更多日期请顾问代查', icon: 'none' });
  },

  onRemindMe() {
    wx.showToast({ title: '已记录，可约时提醒您', icon: 'none' });
  },

  onAdvisorProxy(e) {
    const slug = e.currentTarget.dataset.slug || '';
    wx.showModal({
      title: '顾问代约',
      content: '顾问将协助确认官方可约日期并代为预约，无需在线支付。',
      confirmText: '确认提交',
      success: (r) => {
        if (!r.confirm) return;
        wx.cloud.callFunction({
          name: 'createVisitBookingIntent',
          data: { school_slug: slug, note: this.data.keyword || '' },
        }).then((res) => {
          wx.showToast({
            title: res.result && res.result.success ? '已提交，顾问将跟进' : '提交失败',
            icon: 'none',
          });
        }).catch(() => {
          wx.showToast({ title: '提交失败', icon: 'none' });
        });
      },
    });
  },
});
