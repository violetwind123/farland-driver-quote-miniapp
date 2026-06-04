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
    shareMode: 'driver',
    customerInvitePath: '',
    customerInviteCode: '',
    customerInviteExpiresAt: '',
    creatingCustomerInvite: false,
    customerInviteError: '',
    assignedCustomer: null,
    showCustomerAssignPanel: false,
    customerSearchKeyword: '',
    customerSearchResults: [],
    customerSearching: false,
    selectedCustomer: null,
    assignmentNote: '',
    assigningCustomer: false,
    selectingQuoteId: '',
    reviewingQuoteId: '',
    publishingCustomerQuotes: false,
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
    statusText: '',
    statusClass: '',
    quoteCount: 0,
    selectedQuote: null,
    transportOrder: null,
    transportOrderHealth: null,
    repairingTransportOrder: false,
    nextActionText: '',
    deadlineRiskText: '',
    refreshingDetail: false,
  },

  onLoad(options) {
    this.setData({ requestId: options.id || '' });
    if (wx.showShareMenu) {
      wx.showShareMenu({ menus: ['shareAppMessage'] });
    }
    this.loadDetail();
  },

  onShow() {
    if (this.data.requestId && !this.data.loading) {
      this.loadDetail({ silent: true });
    }
    this.startDetailPolling();
  },

  onHide() {
    this.stopDetailPolling();
  },

  onUnload() {
    this.stopDetailPolling();
  },

  startDetailPolling() {
    this.stopDetailPolling();
    this.detailPollTimer = setInterval(() => {
      if (!this.data.requestId || this.data.loading || this.data.reviewingQuoteId || this.data.selectingQuoteId || this.data.repairingTransportOrder || this.data.cancelling) return;
      this.loadDetail({ silent: true });
    }, 8000);
  },

  stopDetailPolling() {
    if (this.detailPollTimer) {
      clearInterval(this.detailPollTimer);
      this.detailPollTimer = null;
    }
  },

  async loadDetail(options = {}) {
    const silent = Boolean(options.silent);
    if (silent) this.setData({ refreshingDetail: true });
    const { result } = await wx.cloud.callFunction({
      name: 'getRequestDetail',
      data: { request_id: this.data.requestId },
    });
    if (!result || !result.success) {
      if (!silent) wx.showToast({ title: (result && result.message) || '加载失败', icon: 'none' });
      if (silent) this.setData({ refreshingDetail: false });
      return;
    }
    const canShareInvite = !['cancelled', 'completed'].includes(result.request.status);
    const invite = canShareInvite && result.invites ? result.invites[0] : null;
    const request = {
      ...result.request,
      cancel_reason_type_text: this.getCancelReasonLabel(result.request.cancel_reason_type),
    };
    const quotes = result.quotes || [];
    const selectedQuote = quotes.find((quote) => quote.quote_status === 'selected' || quote._id === request.selected_quote_id) || null;
    const transportOrderHealth = this.formatTransportOrderHealth(result.transport_order_health);
    this.setData({
      loading: false,
      request,
      assignedCustomer: result.assigned_customer || null,
      transportOrder: result.transport_order || null,
      transportOrderHealth,
      invites: result.invites || [],
      quotes,
      token: invite ? invite.token : '',
      sharePath: invite ? `/pages/driver/quick-quote/quick-quote?token=${invite.token}` : '',
      inviteError: '',
      statusText: this.getStatusLabel(request.status),
      statusClass: this.getStatusClass(request.status),
      quoteCount: quotes.length,
      selectedQuote,
      nextActionText: this.getNextActionText(request, quotes, invite),
      deadlineRiskText: this.getDeadlineRiskText(request),
      refreshingDetail: false,
    });
    if (!invite && ['quoting', 'quoted'].includes(result.request.status)) {
      this.ensureQuoteInvite(result.request.quote_deadline);
    }
    if (canShareInvite) {
      this.createCustomerInvite({ silent: true });
    }
  },

  refreshDetail() {
    this.loadDetail({ silent: true });
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

  async createCustomerInvite(options = {}) {
    const silent = Boolean(options.silent);
    if (this.data.creatingCustomerInvite) return;

    this.setData({ creatingCustomerInvite: true, customerInviteError: '' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'createCustomerInvite',
        data: {
          request_id: this.data.requestId,
          customer_name: this.data.request.customer_name || 'Farland Customer',
          customer_phone: '',
        },
      });
      if (!result || !result.success) {
        this.setData({
          creatingCustomerInvite: false,
          customerInviteError: (result && result.message) || '客户链接生成失败',
        });
        return;
      }
      const invitePath = result.invite_link || result.path || '';
      this.setData({
        creatingCustomerInvite: false,
        customerInvitePath: invitePath,
        customerInviteCode: result.invite_code || '',
        customerInviteExpiresAt: result.expires_at || '',
        customerInviteError: '',
      });
      if (!silent) wx.showToast({ title: '客户邀请已准备', icon: 'success' });
      return invitePath;
    } catch (error) {
      console.error('createCustomerInvite failed', error);
      const rawMessage = (error && (error.errMsg || error.message)) || '客户链接生成失败';
      const message = rawMessage.replace('cloud.callFunction:fail ', '');
      this.setData({
        creatingCustomerInvite: false,
        customerInviteError: message.length > 60 ? '客户链接生成失败，请查看控制台' : message,
      });
      return '';
    }
  },

  async onCreateCustomerInviteTap() {
    const invitePath = await this.createCustomerInvite();
    if (invitePath) {
      this.setData({ shareMode: 'customer' });
    }
  },

  copyCustomerInvitePath() {
    if (!this.data.customerInvitePath) {
      wx.showToast({ title: '客户邀请还未准备好', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: this.data.customerInvitePath,
      success: () => {
        wx.showToast({ title: '已复制客户路径', icon: 'success' });
      },
      fail: () => {
        wx.showToast({ title: '复制失败', icon: 'none' });
      },
    });
  },

  openCustomerAssignPanel() {
    this.setData({
      showCustomerAssignPanel: true,
      customerSearchKeyword: '',
      customerSearchResults: [],
      selectedCustomer: null,
      assignmentNote: '',
    });
  },

  closeCustomerAssignPanel() {
    if (this.data.assigningCustomer) return;
    this.setData({
      showCustomerAssignPanel: false,
      customerSearchKeyword: '',
      customerSearchResults: [],
      selectedCustomer: null,
      assignmentNote: '',
    });
  },

  onCustomerSearchInput(e) {
    this.setData({ customerSearchKeyword: e.detail.value || '' });
  },

  onAssignmentNoteInput(e) {
    this.setData({ assignmentNote: e.detail.value || '' });
  },

  async searchCustomersForAssignment() {
    if (this.data.customerSearching) return;
    this.setData({ customerSearching: true, selectedCustomer: null });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'searchCustomersForOperator',
        data: {
          keyword: this.data.customerSearchKeyword,
          limit: 20,
        },
      });
      if (!result || !result.success) {
        wx.showToast({ title: (result && result.message) || '搜索失败', icon: 'none' });
        this.setData({ customerSearching: false });
        return;
      }
      this.setData({
        customerSearching: false,
        customerSearchResults: result.customers || [],
      });
    } catch (error) {
      wx.showToast({ title: '搜索失败', icon: 'none' });
      this.setData({ customerSearching: false });
    }
  },

  selectCustomerForAssignment(e) {
    const userId = e.currentTarget.dataset.userId;
    const selectedCustomer = (this.data.customerSearchResults || []).find((customer) => customer.user_id === userId);
    if (!selectedCustomer) return;
    this.setData({ selectedCustomer });
  },

  async confirmAssignCustomer() {
    const { selectedCustomer, assignedCustomer } = this.data;
    if (!selectedCustomer || !selectedCustomer.user_id || this.data.assigningCustomer) {
      wx.showToast({ title: '请选择客户', icon: 'none' });
      return;
    }
    const isReplacing = assignedCustomer && assignedCustomer.user_id && assignedCustomer.user_id !== selectedCustomer.user_id;
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: isReplacing ? '更换客户' : '分配客户',
        content: `确认将该用车单同步到「${selectedCustomer.display_name || selectedCustomer.name}」的 Farland 行程吗？`,
        confirmText: '确认分配',
        success: (res) => resolve(res.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;

    this.setData({ assigningCustomer: true });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'assignCustomerToRideRequest',
        data: {
          request_id: this.data.requestId,
          customer_user_id: selectedCustomer.user_id,
          assignment_note: this.data.assignmentNote,
        },
      });
      if (!result || !result.success) {
        wx.showToast({ title: (result && result.message) || '分配失败', icon: 'none' });
        this.setData({ assigningCustomer: false });
        return;
      }
      wx.showToast({ title: '已分配客户', icon: 'success' });
      this.setData({
        assigningCustomer: false,
        showCustomerAssignPanel: false,
        selectedCustomer: null,
        customerSearchResults: [],
        customerSearchKeyword: '',
        assignmentNote: '',
      });
      this.loadDetail();
    } catch (error) {
      wx.showToast({ title: '分配失败', icon: 'none' });
      this.setData({ assigningCustomer: false });
    }
  },

  viewAssignedCustomerTrip() {
    wx.showToast({ title: '客户行程已同步，可在客户端查看', icon: 'none' });
  },

  async prepareCustomerShare() {
    if (this.data.creatingCustomerInvite) return;
    this.setData({ shareMode: 'customer' });
    if (!this.data.customerInvitePath) {
      await this.createCustomerInvite();
    }
  },

  prepareDriverShare() {
    this.setData({ shareMode: 'driver' });
  },

  previewCustomerHome() {
    const app = getApp();
    app.globalData.customerHomePreview = {
      requestId: this.data.requestId,
      from: 'operator',
    };
    wx.navigateTo({ url: '/pages/customer/home-preview/home-preview' });
  },

  onCustomerShareTap() {
    this.prepareCustomerShare();
  },

  onDriverShareTap() {
    this.prepareDriverShare();
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

  getStatusClass(status) {
    const classes = {
      quoting: 'status-quoting',
      quoted: 'status-quoting',
      assigned: 'status-assigned',
      completed: 'status-completed',
      cancelled: 'status-cancelled',
      submitted: 'status-quoting',
      updated: 'status-quoting',
      selected: 'status-assigned',
      rejected: 'status-cancelled',
    };
    return classes[status] || 'status-default';
  },

  getNextActionText(request, quotes, invite) {
    if (!request || !request.status) return '加载报价单信息';
    if (request.status === 'cancelled') return '报价单已取消，保留历史报价用于记录。';
    if (request.status === 'completed') return '服务已完成。';
    if (request.status === 'assigned') return '已选择司机，可复制报价汇总或继续跟进后续服务。';
    if (quotes && quotes.length) return '已有司机报价，请比较报价并选择司机。';
    if (invite) return '报价邀请已生成，请转发给司机群等待报价。';
    return '正在准备报价邀请，稍后可转发给司机。';
  },

  getDeadlineRiskText(request) {
    if (!request || !request.quote_deadline || !['quoting', 'quoted'].includes(request.status)) return '';
    const deadline = new Date(String(request.quote_deadline).replace(' ', 'T'));
    const diff = deadline.getTime() - Date.now();
    if (Number.isNaN(diff)) return '';
    if (diff < 0) return '报价已过截止时间';
    if (diff <= 24 * 60 * 60 * 1000) return '24 小时内截止';
    return '';
  },

  formatTransportOrderHealth(health) {
    if (!health) return null;
    const missingLabels = Array.isArray(health.missing_field_labels) && health.missing_field_labels.length
      ? health.missing_field_labels
      : (Array.isArray(health.missing_fields) ? health.missing_fields : []);
    const complete = Boolean(health.exists && health.complete);
    let statusText = '执行快照待确认';
    if (health.warning_code === 'TRANSPORT_ORDER_MISSING') statusText = '执行快照缺失';
    if (health.warning_code === 'TRANSPORT_ORDER_INCOMPLETE') statusText = '执行快照不完整';
    if (health.warning_code === 'TRANSPORT_ORDER_READ_FAILED') statusText = '执行快照读取失败';
    if (complete) statusText = '执行快照正常';
    const sourceTextMap = {
      transport_orders: 'transport_orders',
      fallback_driver_vehicle: 'fallback_driver_vehicle',
      none: '未创建',
      read_failed: '读取失败',
    };
    return {
      ...health,
      complete,
      can_repair: Boolean(health.can_repair),
      status_text: statusText,
      source_text: sourceTextMap[health.source] || health.source || '-',
      missing_fields_text: missingLabels.join('、'),
      panel_class: complete ? 'healthy' : 'unhealthy',
      detail_text: complete
        ? '客户侧将读取正式司机与车辆快照。'
        : (health.can_repair ? '可使用已选司机报价重建 transport_orders 快照。' : '请先确认司机或刷新后重试。'),
    };
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

  buildCustomerQuotePayload(quote) {
    const vehicleText = [quote.vehicle_type_snapshot, quote.vehicle_model_snapshot].filter(Boolean).join(' · ');
    const title = `${quote.driver_name_snapshot || 'Farland 司机'}${vehicleText ? `｜${vehicleText}` : ''}`;
    const explanation = [
      'Farland 已审核该司机报价。',
      quote.quote_note ? `司机备注：${quote.quote_note}` : '',
    ].filter(Boolean).join('\n');

    return {
      request_id: this.data.requestId,
      driver_quote_id: quote._id,
      title,
      operator_explanation: explanation,
      included_items: ['基础接送服务', 'Farland 顾问协调', '司机与车辆信息核验'],
      excluded_items: ['临时加点', '超时等待', '停车费/过路费如实际发生'],
      valid_until: this.data.request.quote_deadline || '',
      is_recommended: false,
    };
  },

  async approveAndPublishQuote(e) {
    const quoteId = e.currentTarget.dataset.id;
    const quote = (this.data.quotes || []).find((item) => item._id === quoteId);
    if (!quote || this.data.reviewingQuoteId || this.data.publishingCustomerQuotes) return;

    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '✅ 报送客户',
        content: '确认审核通过该司机报价，并发布给客户查看吗？客户将看到司机报价、Farland 服务费 10% 和预计总价。',
        confirmText: '报送',
        success: (res) => resolve(res.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;

    this.setData({ reviewingQuoteId: quoteId, publishingCustomerQuotes: true });
    try {
      const reviewRes = await wx.cloud.callFunction({
        name: 'reviewDriverQuote',
        data: {
          request_id: this.data.requestId,
          driver_quote_id: quoteId,
          action: 'approve',
          review_note: '审核通过并报送客户',
        },
      });
      if (!reviewRes.result || !reviewRes.result.success) {
        wx.showToast({ title: (reviewRes.result && reviewRes.result.message) || '审核失败', icon: 'none' });
        this.setData({ reviewingQuoteId: '', publishingCustomerQuotes: false });
        return;
      }

      const draftRes = await wx.cloud.callFunction({
        name: 'createCustomerQuoteDraft',
        data: this.buildCustomerQuotePayload(quote),
      });
      if (!draftRes.result || !draftRes.result.success) {
        wx.showToast({ title: (draftRes.result && draftRes.result.message) || '客户报价生成失败', icon: 'none' });
        this.setData({ reviewingQuoteId: '', publishingCustomerQuotes: false });
        return;
      }

      const publishRes = await wx.cloud.callFunction({
        name: 'publishCustomerQuotesBatch',
        data: { request_id: this.data.requestId },
      });
      if (!publishRes.result || !publishRes.result.success) {
        wx.showToast({ title: (publishRes.result && publishRes.result.message) || '发布失败', icon: 'none' });
        this.setData({ reviewingQuoteId: '', publishingCustomerQuotes: false });
        return;
      }

      wx.showToast({ title: '已报送客户', icon: 'success' });
      this.setData({ reviewingQuoteId: '', publishingCustomerQuotes: false });
      this.loadDetail();
    } catch (error) {
      console.error('approveAndPublishQuote failed', error);
      wx.showToast({ title: '报送失败', icon: 'none' });
      this.setData({ reviewingQuoteId: '', publishingCustomerQuotes: false });
    }
  },

  async rejectDriverQuote(e) {
    const quoteId = e.currentTarget.dataset.id;
    if (!quoteId || this.data.reviewingQuoteId) return;
    const quote = (this.data.quotes || []).find((item) => item._id === quoteId);
    const isCustomerSelected = Boolean(quote && quote.customer_selected);
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: isCustomerSelected ? '❌ 司机拒绝' : '❌ 拒绝报价',
        content: isCustomerSelected
          ? '确认该司机无法接单吗？该客户报价会从客户侧移除，客户刷新后可重新选择其他司机。'
          : '确认将该报价标记为运营未采纳吗？该操作不会通知司机。',
        confirmText: '拒绝',
        success: (res) => resolve(res.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;

    this.setData({ reviewingQuoteId: quoteId });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'reviewDriverQuote',
        data: {
          request_id: this.data.requestId,
          driver_quote_id: quoteId,
          action: 'reject',
          rejection_reason: isCustomerSelected ? '司机确认无法接单' : '运营未采纳该报价',
        },
      });
      if (!result || !result.success) {
        wx.showToast({ title: (result && result.message) || '拒绝失败', icon: 'none' });
        this.setData({ reviewingQuoteId: '' });
        return;
      }
      wx.showToast({ title: '已拒绝', icon: 'success' });
      this.setData({ reviewingQuoteId: '' });
      this.loadDetail();
    } catch (error) {
      console.error('rejectDriverQuote failed', error);
      wx.showToast({ title: '拒绝失败', icon: 'none' });
      this.setData({ reviewingQuoteId: '' });
    }
  },

  declineDriverAfterCustomerSelected(e) {
    return this.rejectDriverQuote(e);
  },

  buildDriverShare() {
    const { request, token } = this.data;
    if (['cancelled', 'completed'].includes(request.status)) {
      return {
        title: 'Farland 报价邀请',
        path: 'pages/driver/quick-quote/quick-quote?token=invalid',
      };
    }
    if (!token) {
      wx.showToast({ title: '报价邀请还未准备好，请稍后再试', icon: 'none' });
      return {
        title: 'Farland 报价邀请',
        path: 'pages/driver/quick-quote/quick-quote?token=invalid',
      };
    }
    return {
      title: `【Farland 报价】${request.service_date || ''} ${request.driver_region || ''}`,
      path: `pages/driver/quick-quote/quick-quote?token=${token}`,
    };
  },

  buildCustomerShare() {
    const { request, customerInvitePath } = this.data;
    if (!customerInvitePath) {
      wx.showToast({ title: '客户邀请还未准备好，请稍后再试', icon: 'none' });
      return {
        title: 'Farland 用车方案',
        path: 'pages/hotel/request/request',
      };
    }
    return {
      title: `Farland 我的行程${request.service_date ? `｜${request.service_date}` : ''}`,
      path: customerInvitePath.replace(/^\//, ''),
    };
  },

  onShareAppMessage() {
    if (this.data.shareMode === 'customer') {
      return this.buildCustomerShare();
    }
    return this.buildDriverShare();
  },

  async repairTransportOrder() {
    const health = this.data.transportOrderHealth || {};
    const selectedQuote = this.data.selectedQuote || {};
    const quoteId = health.repair_quote_id || selectedQuote._id || '';
    if (!quoteId || this.data.repairingTransportOrder) {
      wx.showToast({ title: '缺少可修复的已选报价', icon: 'none' });
      return;
    }
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '修复执行快照',
        content: '将使用已选司机报价重新写入 transport_orders 执行快照，不会更换司机。',
        confirmText: '修复',
        success: (res) => resolve(res.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;

    this.setData({ repairingTransportOrder: true });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'selectDriverQuote',
        data: {
          request_id: this.data.requestId,
          quote_id: quoteId,
        },
      });
      if (!result || !result.success) {
        const message = result
          ? `${result.message || '修复失败'}${result.failed_step ? `\n步骤：${result.failed_step}` : ''}${result.error_code ? `\n错误码：${result.error_code}` : ''}`
          : '修复失败：云函数无返回';
        wx.showModal({
          title: '修复执行快照失败',
          content: message,
          showCancel: false,
        });
        this.setData({ repairingTransportOrder: false });
        return;
      }
      wx.showToast({ title: result.repaired ? '已修复快照' : '快照已确认', icon: 'success' });
      this.setData({ repairingTransportOrder: false });
      this.loadDetail();
    } catch (error) {
      console.error('repairTransportOrder failed', error);
      wx.showModal({
        title: '修复执行快照失败',
        content: (error && (error.errMsg || error.message)) || '请检查云函数部署和控制台日志',
        showCancel: false,
      });
      this.setData({ repairingTransportOrder: false });
    }
  },

  async selectQuote(e) {
    const quoteId = e.currentTarget.dataset.id;
    if (!quoteId || this.data.selectingQuoteId) return;
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '✅ 确认司机',
        content: '确认选择该司机吗？选择后其他报价将标记为未选中。',
        confirmText: '确认',
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
        const message = result
          ? `${result.message || '选择失败'}${result.failed_step ? `\n步骤：${result.failed_step}` : ''}${result.error_code ? `\n错误码：${result.error_code}` : ''}`
          : '选择失败：云函数无返回';
        wx.showModal({
          title: '确认司机失败',
          content: message,
          showCancel: false,
        });
        this.setData({ selectingQuoteId: '' });
        return;
      }
      wx.showToast({ title: '已选择司机', icon: 'success' });
      this.setData({ selectingQuoteId: '' });
      this.loadDetail();
    } catch (error) {
      console.error('selectDriverQuote call failed', error);
      wx.showModal({
        title: '确认司机调用失败',
        content: (error && (error.errMsg || error.message)) || '选择失败，请检查云函数部署和控制台日志',
        showCancel: false,
      });
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
