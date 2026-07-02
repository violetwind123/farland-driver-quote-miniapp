const TAG_OPTIONS = [
  '守时准点',
  '驾驶平稳',
  '车内整洁',
  '沟通顺畅',
  '安排合理',
  '服务热情',
  '等待较久',
  '行程偏紧',
  '有待改进',
];

Page({
  data: {
    loading: true,
    error: '',
    submitted: false,
    submitting: false,
    tripId: '',
    dayNo: 0,
    inviteCode: '',
    context: null,
    rating: 0,
    ratingLabels: ['很不满意', '不满意', '一般', '满意', '非常满意'],
    stars: [1, 2, 3, 4, 5],
    tagOptions: TAG_OPTIONS,
    selectedTags: [],
    text: '',
    myReview: null,
  },

  onLoad(options = {}) {
    const tripId = decodeURIComponent(options.trip_id || '');
    const dayNo = Number(options.day_no || 0);
    const inviteCode = decodeURIComponent(options.invite_code || '');
    this.setData({ tripId, dayNo, inviteCode });
    if (!inviteCode) {
      this.setData({ loading: false, error: '缺少评价卡信息，请通过群里的评价卡链接打开。' });
      return;
    }
    this.loadContext();
  },

  async loadContext() {
    this.setData({ loading: true, error: '' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getRideReviewContext',
        data: {
          invite_code: this.data.inviteCode,
          trip_id: this.data.tripId,
          day_no: this.data.dayNo,
        },
      });
      if (!result || !result.success) {
        this.setData({
          loading: false,
          error: (result && result.message) || '评价卡加载失败',
        });
        return;
      }
      this.setData({
        loading: false,
        context: result.context || null,
        tripId: result.trip_id || this.data.tripId,
        dayNo: result.day_no || this.data.dayNo,
        submitted: Boolean(result.already_submitted),
        myReview: result.my_review || null,
      });
      if (wx.showShareMenu) {
        wx.showShareMenu({ menus: ['shareAppMessage'] });
      }
    } catch (error) {
      console.error('[review-card] getRideReviewContext failed', error);
      const errMsg = (error && (error.errMsg || error.message)) || '未知错误';
      this.setData({ loading: false, error: `评价卡加载失败：${errMsg}` });
    }
  },

  selectRating(e) {
    const value = Number(e.currentTarget.dataset.value || 0);
    if (value >= 1 && value <= 5) {
      this.setData({ rating: value });
    }
  },

  toggleTag(e) {
    const tag = e.currentTarget.dataset.tag;
    if (!tag) return;
    const selected = this.data.selectedTags.slice();
    const index = selected.indexOf(tag);
    if (index >= 0) {
      selected.splice(index, 1);
    } else if (selected.length < 10) {
      selected.push(tag);
    }
    this.setData({ selectedTags: selected });
  },

  onTextInput(e) {
    this.setData({ text: e.detail.value || '' });
  },

  async submitReview() {
    if (this.data.submitting || this.data.submitted) return;
    if (!this.data.rating) {
      wx.showToast({ title: '请先选择评分', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'submitRideReview',
        data: {
          invite_code: this.data.inviteCode,
          rating: this.data.rating,
          tags: this.data.selectedTags,
          text: this.data.text,
        },
      });
      if (!result || !result.success) {
        this.setData({ submitting: false });
        wx.showToast({ title: (result && result.message) || '提交失败', icon: 'none' });
        return;
      }
      this.setData({
        submitting: false,
        submitted: true,
        myReview: result.my_review || {
          rating: this.data.rating,
          tags: this.data.selectedTags,
          text: this.data.text,
        },
      });
      wx.showToast({ title: '已收到您的反馈', icon: 'success' });
    } catch (error) {
      console.error('[review-card] submitRideReview failed', error);
      const errMsg = (error && (error.errMsg || error.message)) || '未知错误';
      this.setData({ submitting: false });
      wx.showToast({ title: `提交失败：${errMsg}`, icon: 'none' });
    }
  },

  buildReviewShare() {
    const context = this.data.context || {};
    const dayNo = Number(this.data.dayNo || 0);
    const tripId = this.data.tripId || context.trip_id || '';
    const inviteCode = this.data.inviteCode || '';
    const titleBase = context.day_title || context.trip_title || 'Farland 行程';
    const path = `/pages/customer/review-card/review-card?trip_id=${encodeURIComponent(tripId)}&day_no=${dayNo}&invite_code=${encodeURIComponent(inviteCode)}`;
    return {
      title: `Day ${dayNo || ''} 服务评价｜${titleBase}`,
      path: path.replace(/^\//, ''),
    };
  },

  onShareAppMessage() {
    return this.buildReviewShare();
  },
});
