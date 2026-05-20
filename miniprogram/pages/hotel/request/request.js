Page({
  data: {
    logoReady: false,
    submitting: false,
    showAdvanced: false,
    heroSlides: [
      {
        image: '/assets/images/hotel-hero-01.svg',
        eyebrow: 'Farland Hotel',
        title: '静奢入住，从行程开始',
        desc: '围绕美国访校、家庭旅行与城市停留，匹配更合适的酒店方案。',
      },
      {
        image: '/assets/images/hotel-hero-02.svg',
        eyebrow: 'Curated Stays',
        title: '区域、品牌与动线，一次考虑',
        desc: '根据学校位置、出行节奏和家庭偏好，减少无效筛选。',
      },
      {
        image: '/assets/images/hotel-hero-03.svg',
        eyebrow: 'Premium Access',
        title: '礼遇与体验，同样重要',
        desc: 'Farland 顾问协助确认房型、入住体验与行程衔接。',
      },
    ],
    benefitItems: [
      {
        title: '酒店礼遇',
        desc: '顾问协助匹配房型与品牌偏好',
        icon: '/assets/icons/benefit-hotel.svg',
      },
      {
        title: '积分福利',
        desc: '会员权益与出行福利联动',
        icon: '/assets/icons/benefit-points.svg',
      },
      {
        title: '访校动线',
        desc: '基于学校与城市安排住宿区域',
        icon: '/assets/icons/benefit-campus.svg',
      },
      {
        title: '专属顾问',
        desc: '人工确认需求并跟进行程',
        icon: '/assets/icons/benefit-advisor.svg',
      },
    ],
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

  onLogoError() {
    this.setData({ logoReady: false });
  },

  toggleAdvanced() {
    this.setData({ showAdvanced: !this.data.showAdvanced });
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
        content: '酒店需求已提交，Farland 顾问将尽快联系您。',
        showCancel: false,
        success: () => wx.switchTab({ url: '/pages/customer/home/home' }),
      });
    } catch (error) {
      wx.showToast({ title: '提交失败', icon: 'none' });
      this.setData({ submitting: false });
    }
  },
});
