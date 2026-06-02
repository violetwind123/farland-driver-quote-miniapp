const sampleHint = `{
  "schema_version": "1.0.0",
  "external_trip_id": "2026XBC091",
  "trip_type": "mixed",
  "title": "Farland School Visit Itinerary",
  "status": "active",
  "city": "Boston / Amherst / Providence",
  "country": "US",
  "timezone": "America/New_York",
  "start_at": "2026-06-05T00:00:00-04:00",
  "end_at": "2026-06-12T23:59:59-05:00",
  "customer": { "display_name": "王女士" },
  "source": { "source_type": "manual_json" },
  "advisor": { "name": "Farland Advisor" },
  "itinerary_days": [
    {
      "day_no": 1,
      "date": "2026-06-05",
      "weekday": "Fri",
      "title": "Boston / Amherst / Providence",
      "city": "Boston / Amherst / Providence",
      "estimated_departure_time": "08:10",
      "timeline_items": [
        {
          "item_id": "day1_depart_boston",
          "item_type": "departure",
          "title": "Depart Boston",
          "planned_start_time": "08:10",
          "location_name": "Boston"
        }
      ]
    }
  ],
  "hotels": [],
  "documents": []
}`;

Page({
  data: {
    jsonText: '',
    accessMode: 'none',
    accessId: '',
    accessType: 'profile',
    visibleUntil: '',
    customerSearchKeyword: '',
    customersLoading: false,
    customerOptions: [],
    customerPickerRange: [],
    selectedCustomerIndex: -1,
    selectedCustomer: null,
    dryRunLoading: false,
    applyLoading: false,
    preview: null,
    canApplyPreview: false,
    errors: [],
    sampleHint,
  },

  onLoad() {
    this.loadCustomerOptions();
  },

  onJsonInput(e) {
    this.setData({ jsonText: e.detail.value || '', preview: null, canApplyPreview: false, errors: [] });
  },

  onAccessModeChange(e) {
    const modes = ['none', 'customer_user_id', 'request_id'];
    const accessMode = modes[Number(e.detail.value)] || 'none';
    this.setData({
      accessMode,
      accessId: accessMode === 'customer_user_id' && this.data.selectedCustomer ? this.data.selectedCustomer.user_id : '',
      preview: null,
      canApplyPreview: false,
    });
    if (accessMode === 'customer_user_id' && !this.data.customerOptions.length) {
      this.loadCustomerOptions();
    }
  },

  onAccessIdInput(e) {
    this.setData({ accessId: e.detail.value || '', preview: null, canApplyPreview: false });
  },

  onAccessTypeChange(e) {
    const types = ['profile', 'trip_only'];
    this.setData({ accessType: types[Number(e.detail.value)] || 'profile', preview: null, canApplyPreview: false });
  },

  onVisibleUntilInput(e) {
    this.setData({ visibleUntil: e.detail.value || '', preview: null, canApplyPreview: false });
  },

  onCustomerSearchInput(e) {
    this.setData({ customerSearchKeyword: e.detail.value || '' });
  },

  async loadCustomerOptions(keyword = this.data.customerSearchKeyword) {
    this.setData({ customersLoading: true });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'searchCustomersForOperator',
        data: {
          keyword: String(keyword || '').trim(),
          limit: 50,
        },
      });
      if (!result || !result.success) {
        this.setData({ customersLoading: false });
        wx.showToast({ title: (result && result.message) || '客户加载失败', icon: 'none' });
        return;
      }
      const customers = result.customers || [];
      this.setData({
        customersLoading: false,
        customerOptions: customers,
        customerPickerRange: customers.map((customer) => {
          const contact = [customer.phone, customer.wechat_id].filter(Boolean).join(' / ');
          return contact ? `${customer.display_name || customer.name} · ${contact}` : (customer.display_name || customer.name || 'Farland 客户');
        }),
        selectedCustomerIndex: -1,
        selectedCustomer: null,
        accessId: this.data.accessMode === 'customer_user_id' ? '' : this.data.accessId,
        preview: null,
        canApplyPreview: false,
      });
    } catch (error) {
      this.setData({ customersLoading: false });
      wx.showToast({ title: '客户加载失败', icon: 'none' });
    }
  },

  searchCustomers() {
    this.loadCustomerOptions();
  },

  onCustomerPickerChange(e) {
    const index = Number(e.detail.value);
    const selectedCustomer = this.data.customerOptions[index] || null;
    this.setData({
      selectedCustomerIndex: selectedCustomer ? index : -1,
      selectedCustomer,
      accessId: selectedCustomer ? selectedCustomer.user_id : '',
      preview: null,
      canApplyPreview: false,
    });
  },

  fillSample() {
    this.setData({ jsonText: sampleHint, preview: null, canApplyPreview: false, errors: [] });
  },

  parseTripText() {
    const text = String(this.data.jsonText || '').trim();
    if (!text) {
      wx.showToast({ title: '请粘贴 JSON', icon: 'none' });
      return null;
    }
    try {
      return JSON.parse(text);
    } catch (error) {
      this.setData({ errors: ['JSON 格式无效，请检查逗号、引号和括号。'], preview: null, canApplyPreview: false });
      wx.showToast({ title: 'JSON 格式无效', icon: 'none' });
      return null;
    }
  },

  buildAccessPayload() {
    const { accessMode, accessId, accessType, visibleUntil } = this.data;
    if (accessMode === 'none') return {};
    const safeId = accessMode === 'customer_user_id'
      ? String((this.data.selectedCustomer && this.data.selectedCustomer.user_id) || accessId || '').trim()
      : String(accessId || '').trim();
    if (!safeId) {
      wx.showToast({ title: accessMode === 'customer_user_id' ? '请选择客户' : '请填写授权 ID', icon: 'none' });
      return null;
    }
    const access = {
      access_type: accessType,
    };
    if (accessMode === 'customer_user_id') access.customer_user_id = safeId;
    if (accessMode === 'request_id') access.request_id = safeId;
    if (accessType === 'trip_only' && visibleUntil) access.visible_until = visibleUntil;
    return access;
  },

  async callImport(dryRun) {
    const trip = this.parseTripText();
    if (!trip) return;
    const access = this.buildAccessPayload();
    if (access === null) return;

    this.setData({
      dryRunLoading: dryRun,
      applyLoading: !dryRun,
      errors: [],
    });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'importCustomerTripJSON',
        data: {
          trip,
          access,
          dry_run: dryRun,
        },
      });
      if (!result || !result.success) {
        this.setData({
          errors: (result && result.errors) || [(result && result.message) || '导入失败'],
          preview: null,
          canApplyPreview: false,
          dryRunLoading: false,
          applyLoading: false,
        });
        wx.showToast({ title: (result && result.message) || '导入失败', icon: 'none' });
        return;
      }
      this.setData({
        preview: this.normalizePreviewResult(result),
        canApplyPreview: this.canApplyResult(result),
        errors: [],
        dryRunLoading: false,
        applyLoading: false,
      });
      wx.showToast({ title: dryRun ? '预览完成' : '写入完成', icon: 'success' });
    } catch (error) {
      this.setData({
        errors: ['云函数调用失败，请确认 importCustomerTripJSON 已部署。'],
        canApplyPreview: false,
        dryRunLoading: false,
        applyLoading: false,
      });
      wx.showToast({ title: '调用失败', icon: 'none' });
    }
  },

  previewImport() {
    this.callImport(true);
  },

  canApplyResult(result) {
    if (!result || result.dry_run === false) return false;
    return Boolean(result.can_apply || result.preview_valid || result.valid);
  },

  normalizePreviewResult(result) {
    if (!result) return null;
    const normalized = result.normalized_preview || {};
    const preview = result.preview || {};
    return {
      ...result,
      display_trip_id: result.trip_id || normalized.trip_id || normalized.external_trip_id || result.external_trip_id || '',
      display_external_trip_id: result.external_trip_id || normalized.external_trip_id || '',
      display_title: normalized.title || preview.title || '',
      display_action: result.action || '',
      display_review_status: result.review_status || (result.review_seed && result.review_seed.review_status) || '',
      display_visibility_status: result.visibility_status || (result.review_seed && result.review_seed.visibility_status) || '',
      display_published_version: result.published_version !== undefined
        ? result.published_version
        : ((result.review_seed && result.review_seed.published_version) || 0),
      display_can_apply: this.canApplyResult(result),
      warningList: result.warning_codes || result.warnings || [],
      operationList: result.operations || [],
    };
  },

  async applyImport() {
    if (!this.data.preview || !this.data.canApplyPreview) {
      wx.showToast({ title: '请先预览导入', icon: 'none' });
      return;
    }
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '确认写入',
        content: '确认后将写入 customer_trips，并可能更新客户访问权限。',
        confirmText: '写入',
        success: (res) => resolve(res.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;
    this.callImport(false);
  },
});
