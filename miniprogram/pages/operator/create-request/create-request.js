const DEFAULT_FORM = {
  service_type: 'transfer',
  service_date: '',
  driver_region: '',
  task_description: '',
  deadline_date: '',
  deadline_time: '',
  internal_note: '',
};

const REGION_OPTIONS = ['纽约', '波士顿', '芝加哥', '康州', '洛杉矶', '旧金山', '华盛顿', '费城'];

Page({
  data: {
    form: { ...DEFAULT_FORM },
    regionOptions: REGION_OPTIONS,
    regionIndex: -1,
    taskDescriptionPlaceholder: '请粘贴 AI 整理后的司机可见任务描述。例如：“6月3日，客户需要在 Boston Marriott Cambridge 出发，安排全天包车访校。预计服务时间为 9:00-18:00，客户共4人，无大件行李。计划前往 Harvard、MIT、Boston College，车型希望为 Suburban 或同等级 SUV。请司机报价，并在备注中说明是否包含停车费、过路费、基础等待时间及超时费标准。”',
    submitting: false,
  },

  switchType(e) {
    this.setData({ 'form.service_type': e.currentTarget.dataset.type });
  },

  onInput(e) {
    this.setData({ [`form.${e.currentTarget.dataset.field}`]: e.detail.value });
  },

  onServiceDateChange(e) {
    this.setData({ 'form.service_date': e.detail.value });
  },

  onDeadlineDateChange(e) {
    this.setData({ 'form.deadline_date': e.detail.value });
  },

  onDeadlineTimeChange(e) {
    this.setData({ 'form.deadline_time': e.detail.value });
  },

  onRegionChange(e) {
    const regionIndex = Number(e.detail.value);
    this.setData({
      regionIndex,
      'form.driver_region': REGION_OPTIONS[regionIndex],
    });
  },

  async submit() {
    if (this.data.submitting) return;
    const { form } = this.data;
    const payload = {
      service_type: form.service_type,
      service_date: form.service_date,
      driver_region: form.driver_region,
      task_description: form.task_description,
      quote_deadline: form.deadline_date && form.deadline_time ? `${form.deadline_date} ${form.deadline_time}` : '',
      internal_note: form.internal_note,
    };
    if (!payload.service_type || !payload.service_date || !payload.driver_region || !payload.task_description || !payload.quote_deadline) {
      wx.showToast({ title: '请填写必填字段', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      const { result } = await wx.cloud.callFunction({ name: 'createRideRequest', data: payload });
      if (!result || !result.success) {
        wx.showToast({ title: (result && result.message) || '发布失败', icon: 'none' });
        this.setData({ submitting: false });
        return;
      }
      wx.showToast({ title: '发布成功', icon: 'success' });
      wx.redirectTo({ url: `/pages/operator/request-detail/request-detail?id=${result.request_id}` });
    } catch (error) {
      console.error('createRideRequest failed', error);
      wx.showToast({ title: error && error.errMsg ? error.errMsg : '发布失败', icon: 'none' });
      this.setData({ submitting: false });
    }
  },
});
