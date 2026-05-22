const sampleHint = `{
  "schema_version": "customer-trip-v1",
  "trip_id": "trip_boston_transfer_001",
  "trip_type": "transfer",
  "title": "Boston Airport Pickup",
  "city": "Boston",
  "date_start": "2026-06-03",
  "date_end": "2026-06-03",
  "status": "active",
  "customer": { "display_name": "王女士" },
  "advisor": { "name": "Farland Advisor" }
}`;

Page({
  data: {
    jsonText: '',
    accessMode: 'none',
    accessId: '',
    accessType: 'profile',
    visibleUntil: '',
    dryRunLoading: false,
    applyLoading: false,
    preview: null,
    errors: [],
    sampleHint,
  },

  onJsonInput(e) {
    this.setData({ jsonText: e.detail.value || '', preview: null, errors: [] });
  },

  onAccessModeChange(e) {
    const modes = ['none', 'customer_user_id', 'request_id'];
    this.setData({ accessMode: modes[Number(e.detail.value)] || 'none', preview: null });
  },

  onAccessIdInput(e) {
    this.setData({ accessId: e.detail.value || '', preview: null });
  },

  onAccessTypeChange(e) {
    const types = ['profile', 'trip_only'];
    this.setData({ accessType: types[Number(e.detail.value)] || 'profile', preview: null });
  },

  onVisibleUntilInput(e) {
    this.setData({ visibleUntil: e.detail.value || '', preview: null });
  },

  fillSample() {
    this.setData({ jsonText: sampleHint, preview: null, errors: [] });
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
      this.setData({ errors: ['JSON 格式无效，请检查逗号、引号和括号。'], preview: null });
      wx.showToast({ title: 'JSON 格式无效', icon: 'none' });
      return null;
    }
  },

  buildAccessPayload() {
    const { accessMode, accessId, accessType, visibleUntil } = this.data;
    if (accessMode === 'none') return {};
    const safeId = String(accessId || '').trim();
    if (!safeId) {
      wx.showToast({ title: '请填写授权 ID', icon: 'none' });
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
          dryRunLoading: false,
          applyLoading: false,
        });
        wx.showToast({ title: (result && result.message) || '导入失败', icon: 'none' });
        return;
      }
      this.setData({
        preview: result,
        errors: [],
        dryRunLoading: false,
        applyLoading: false,
      });
      wx.showToast({ title: dryRun ? '预览完成' : '写入完成', icon: 'success' });
    } catch (error) {
      this.setData({
        errors: ['云函数调用失败，请确认 importCustomerTripJSON 已部署。'],
        dryRunLoading: false,
        applyLoading: false,
      });
      wx.showToast({ title: '调用失败', icon: 'none' });
    }
  },

  previewImport() {
    this.callImport(true);
  },

  async applyImport() {
    if (!this.data.preview || !this.data.preview.valid) {
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
