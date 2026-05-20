Page({
  data: {
    loading: true,
    requestId: '',
    request: {},
    invites: [],
    quotes: [],
    token: '',
    sharePath: '',
    creatingInvite: false,
    inviteError: '',
    selectingQuoteId: '',
    showCancelForm: false,
    cancelling: false,
    cancelReasonTypes: [
      { label: '客户取消', value: 'customer_cancelled' },
      { label: '客户行程变更', value: 'customer_changed_plan' },
      { label: '时间/地点信息变更，需要重新发单', value: 'request_info_changed' },
      { label: '车型需求变更，需要重新询价', value: 'vehicle_requirement_changed' },
      { label: '报价过高，暂不继续', value: 'price_too_high' },
      { label: '已线下处理', value: 'handled_offline' },
      { label: '重复创建', value: 'duplicate_request' },
      { label: '测试订单', value: 'test_request' },
      { label: '其他', value: 'other' },
    ],
    cancelReasonIndex: -1,
    cancelReasonType: '',
    cancelReasonDriver: '',
    cancelReasonInternal: '',
  },

  onLoad(options) {
    this.setData({ requestId: options.id || '' });
    if (wx.showShareMenu) {
      wx.showShareMenu({ menus: ['shareAppMessage'] });
    }
    this.loadDetail();
  },

  async loadDetail() {
    const { result } = await wx.cloud.callFunction({
      name: 'getRequestDetail',
      data: { request_id: this.data.requestId },
    });
    if (!result || !result.success) {
      wx.showToast({ title: (result && result.message) || '加载失败', icon: 'none' });
      return;
    }
    const canShareInvite = !['cancelled', 'completed'].includes(result.request.status);
    const invite = canShareInvite && result.invites ? result.invites[0] : null;
    this.setData({
      loading: false,
      request: {
        ...result.request,
        cancel_reason_type_text: this.getCancelReasonLabel(result.request.cancel_reason_type),
      },
      invites: result.invites || [],
      quotes: result.quotes || [],
      token: invite ? invite.token : '',
      sharePath: invite ? `/pages/driver/quick-quote/quick-quote?token=${invite.token}` : '',
      inviteError: '',
    });
    if (!invite && ['quoting', 'quoted'].includes(result.request.status)) {
      this.ensureQuoteInvite(result.request.quote_deadline);
    }
  },

  async ensureQuoteInvite(expiresAt) {
    if (this.data.creatingInvite) return;
    this.setData({ creatingInvite: true });
    const { result } = await wx.cloud.callFunction({
      name: 'createQuoteInvite',
      data: {
        request_id: this.data.requestId,
        expires_at: expiresAt,
      },
    });
    if (!result || !result.success) {
      this.setData({
        creatingInvite: false,
        inviteError: (result && result.message) || '报价邀请准备失败',
      });
      return;
    }
    this.setData({
      token: result.token,
      sharePath: result.share_path,
      creatingInvite: false,
      inviteError: '',
    });
  },

  onRetryCreateInvite() {
    this.ensureQuoteInvite(this.data.request.quote_deadline);
  },

  getCancelReasonLabel(type) {
    const found = this.data.cancelReasonTypes.find((item) => item.value === type);
    return found ? found.label : type || '-';
  },

  getServiceTypeLabel(type) {
    if (type === 'transfer') return '接送 / 转场';
    if (type === 'charter') return '包车 / 多日用车';
    return type || '-';
  },

  getStatusLabel(status) {
    const labels = {
      quoting: '报价中',
      quoted: '已报价',
      assigned: '已选择',
      completed: '已完成',
      cancelled: '已取消',
      submitted: '已提交',
      updated: '已更新',
      selected: '已选择',
      rejected: '未选中',
    };
    return labels[status] || status || '-';
  },

  formatSummaryValue(value) {
    if (value === undefined || value === null || value === '') return '-';
    return value;
  },

  buildQuoteSummary() {
    const { request, quotes } = this.data;
    const selectedQuote = (quotes || []).find((quote) => {
      return quote.quote_status === 'selected' || quote._id === request.selected_quote_id;
    });
    const lines = [
      '【Farland 司机报价汇总】',
      `订单编号：${this.formatSummaryValue(request.request_no)}`,
      `服务类型：${this.getServiceTypeLabel(request.service_type)}`,
      `服务日期：${this.formatSummaryValue(request.service_date)}`,
      `司机区域：${this.formatSummaryValue(request.driver_region)}`,
      `状态：${this.getStatusLabel(request.status)}`,
      `报价截止：${this.formatSummaryValue(request.quote_deadline)}`,
      '',
      '【任务描述】',
      this.formatSummaryValue(request.task_description),
    ];

    if (selectedQuote) {
      lines.push(
        '',
        '【已选择司机】',
        `${this.formatSummaryValue(selectedQuote.driver_name_snapshot)}｜${this.formatSummaryValue(selectedQuote.vehicle_model_snapshot)}｜${this.formatSummaryValue(selectedQuote.currency)} ${this.formatSummaryValue(selectedQuote.quote_price)}`
      );
    }

    if (request.status === 'cancelled') {
      lines.push(
        '',
        '【取消信息】',
        `取消原因：${this.formatSummaryValue(request.cancel_reason_type_text || this.getCancelReasonLabel(request.cancel_reason_type))}`,
        `司机可见说明：${this.formatSummaryValue(request.cancel_reason_driver)}`,
        `内部备注：${this.formatSummaryValue(request.cancel_reason_internal)}`,
        `取消时间：${this.formatSummaryValue(request.cancelled_at)}`
      );
    }

    lines.push('', '【司机报价】');
    if (!quotes || !quotes.length) {
      lines.push('暂无司机报价');
      return lines.join('\n');
    }

    quotes.forEach((quote, index) => {
      lines.push(
        `${index + 1}. ${this.formatSummaryValue(quote.driver_name_snapshot)}｜${this.formatSummaryValue(quote.driver_phone_snapshot)}`,
        `车辆：${this.formatSummaryValue(quote.vehicle_type_snapshot)}｜${this.formatSummaryValue(quote.vehicle_model_snapshot)}｜${this.formatSummaryValue(quote.seats_snapshot)}座｜行李${this.formatSummaryValue(quote.luggage_capacity_snapshot)}`,
        `报价：${this.formatSummaryValue(quote.currency)} ${this.formatSummaryValue(quote.quote_price)}`,
        `备注：${this.formatSummaryValue(quote.quote_note)}`,
        `状态：${this.getStatusLabel(quote.quote_status)}`,
        `提交/更新：${this.formatSummaryValue(quote.submitted_at)} / ${this.formatSummaryValue(quote.updated_at)}`
      );
      if (index < quotes.length - 1) lines.push('');
    });

    return lines.join('\n');
  },

  copyQuoteSummary() {
    const data = this.buildQuoteSummary();
    wx.setClipboardData({
      data,
      success: () => {
        wx.showToast({ title: '已复制报价汇总', icon: 'success' });
      },
      fail: () => {
        wx.showToast({ title: '复制失败', icon: 'none' });
      },
    });
  },

  onShareAppMessage() {
    const { request, token } = this.data;
    if (['cancelled', 'completed'].includes(request.status)) {
      return {
        title: 'Farland 报价邀请',
        path: 'pages/operator/dashboard/dashboard',
      };
    }
    if (!token) {
      wx.showToast({ title: '请先生成报价邀请', icon: 'none' });
      return {
        title: 'Farland 报价邀请',
        path: 'pages/operator/dashboard/dashboard',
      };
    }
    return {
      title: `【Farland 报价】${request.service_date || ''} ${request.driver_region || ''}`,
      path: `pages/driver/quick-quote/quick-quote?token=${token}`,
    };
  },

  async selectQuote(e) {
    const quoteId = e.currentTarget.dataset.id;
    if (!quoteId || this.data.selectingQuoteId) return;
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '确认选择司机',
        content: '确认选择该司机吗？选择后其他报价将标记为未选中。',
        confirmText: '确认选择',
        success: (res) => resolve(res.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;
    this.setData({ selectingQuoteId: quoteId });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'selectDriverQuote',
        data: {
          request_id: this.data.requestId,
          quote_id: quoteId,
        },
      });
      if (!result || !result.success) {
        wx.showToast({ title: (result && result.message) || '选择失败', icon: 'none' });
        this.setData({ selectingQuoteId: '' });
        return;
      }
      wx.showToast({ title: '已选择司机', icon: 'success' });
      this.setData({ selectingQuoteId: '' });
      this.loadDetail();
    } catch (error) {
      wx.showToast({ title: '选择失败', icon: 'none' });
      this.setData({ selectingQuoteId: '' });
    }
  },

  openCancelForm() {
    this.setData({
      showCancelForm: true,
      cancelReasonIndex: -1,
      cancelReasonType: '',
      cancelReasonDriver: '客户行程调整，本次报价取消。后续如需重新报价，Farland 会另行通知。',
      cancelReasonInternal: '',
    });
  },

  closeCancelForm() {
    if (this.data.cancelling) return;
    this.setData({ showCancelForm: false });
  },

  onCancelReasonChange(e) {
    const cancelReasonIndex = Number(e.detail.value);
    const selected = this.data.cancelReasonTypes[cancelReasonIndex];
    this.setData({
      cancelReasonIndex,
      cancelReasonType: selected ? selected.value : '',
    });
  },

  onCancelInput(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },

  async submitCancelRequest() {
    const {
      requestId,
      cancelReasonType,
      cancelReasonDriver,
      cancelReasonInternal,
      cancelling,
    } = this.data;
    if (cancelling) return;
    if (!cancelReasonType) {
      wx.showToast({ title: '请选择取消原因', icon: 'none' });
      return;
    }
    if (!cancelReasonDriver || !cancelReasonDriver.trim()) {
      wx.showToast({ title: '请填写司机可见说明', icon: 'none' });
      return;
    }

    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '确认取消报价单',
        content: '取消后司机将无法继续报价，已有报价会保留。确认取消吗？',
        confirmText: '确认取消',
        success: (res) => resolve(res.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;

    this.setData({ cancelling: true });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'cancelRideRequest',
        data: {
          request_id: requestId,
          cancel_reason_type: cancelReasonType,
          cancel_reason_driver: cancelReasonDriver,
          cancel_reason_internal: cancelReasonInternal || '',
        },
      });
      if (!result || !result.success) {
        wx.showToast({ title: (result && result.message) || '取消失败', icon: 'none' });
        this.setData({ cancelling: false });
        return;
      }
      wx.showToast({ title: '已取消', icon: 'success' });
      const cancelledRequest = result.request || {};
      this.setData({
        cancelling: false,
        showCancelForm: false,
        token: '',
        sharePath: '',
        request: {
          ...this.data.request,
          status: 'cancelled',
          cancel_reason_type: cancelledRequest.cancel_reason_type || cancelReasonType,
          cancel_reason_type_text: this.getCancelReasonLabel(cancelledRequest.cancel_reason_type || cancelReasonType),
          cancel_reason_driver: cancelledRequest.cancel_reason_driver || cancelReasonDriver,
          cancel_reason_internal: cancelledRequest.cancel_reason_internal || cancelReasonInternal || '',
          cancelled_by: cancelledRequest.cancelled_by || '',
          cancelled_at: cancelledRequest.cancelled_at || '',
        },
      });
      this.loadDetail();
    } catch (error) {
      console.error('cancelRideRequest failed', error);
      const message = error && error.errMsg ? error.errMsg.replace('cloud.callFunction:fail ', '') : '取消失败';
      wx.showToast({ title: message.length > 18 ? '取消失败，请看控制台' : message, icon: 'none' });
      this.setData({ cancelling: false });
    }
  },
});
