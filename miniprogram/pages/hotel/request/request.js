Page({
  data: {
    submitting: false,
    form: {
      city: '',
      check_in_date: '',
      check_out_date: '',
      rooms: '1',
      guests: '2',
      hotel_level: '',
      budget_range: '',
      location_preference: '',
      special_requests: '',
      customer_name: '',
      contact: '',
    },
  },

  onLoad(options) {
    const token = options && options.token;
    if (token) {
      wx.redirectTo({
        url: `/pages/driver/quick-quote/quick-quote?token=${token}`,
      });
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onDateChange(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  async submitRequest() {
    const { form, submitting } = this.data;
    if (submitting) return;
    if (!form.city || !form.check_in_date || !form.check_out_date || !form.customer_name || !form.contact) {
      wx.showToast({ title: '请填写必填信息', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'createHotelRequest',
        data: form,
      });
      if (!result || !result.success) {
        wx.showToast({ title: (result && result.message) || '提交失败', icon: 'none' });
        this.setData({ submitting: false });
        return;
      }
      wx.showModal({
        title: '已提交',
        content: '酒店需求已提交，Farland 顾问将联系您。',
        showCancel: false,
        success: () => wx.switchTab({ url: '/pages/customer/home/home' }),
      });
    } catch (error) {
      wx.showToast({ title: '提交失败', icon: 'none' });
      this.setData({ submitting: false });
    }
  },
});
