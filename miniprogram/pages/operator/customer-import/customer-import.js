const sampleHint = `{
  "schema_version": "1.0.0",
  "external_trip_id": "2026FEEDEMO01",
  "trip_type": "mixed",
  "title": "Farland Multi-Day Fee Itinerary",
  "status": "active",
  "city": "Boston / Cambridge / Amherst",
  "country": "US",
  "timezone": "America/New_York",
  "start_at": "2026-06-05T00:00:00-04:00",
  "end_at": "2026-06-07T23:59:59-04:00",
  "summary": "3 天访校与用车安排。费用以每日服务项列明，最终以顾问确认版本为准。",
  "customer": { "display_name": "测试客户" },
  "source": { "source_type": "manual_json" },
  "advisor": { "name": "Farland Advisor" },
  "itinerary_days": [
    {
      "day_no": 1,
      "date": "2026-06-05",
      "weekday": "Fri",
      "title": "Boston 抵达与市区接送",
      "city": "Boston",
      "summary": "抵达 Boston 后完成机场接机、酒店入住与当日晚间市区用车。",
      "estimated_departure_time": "14:20",
      "transport_summary": {
        "service_type": "airport_transfer",
        "status_text": "待运营确认",
        "driver_visibility": "hidden_until_confirmed",
        "customer_note": "Day 1 预计费用：USD 480，包含机场接机和市区短途用车。"
      },
      "timeline_items": [
        {
          "item_id": "day1_arrive_bos",
          "item_type": "arrival",
          "title": "Boston Logan Airport 接机",
          "planned_start_time": "14:20",
          "planned_end_time": "15:10",
          "location_name": "Boston Logan International Airport",
          "drive_time_text": "约 35 分钟",
          "distance_text": "约 8 miles",
          "traffic_text": "Moderate",
          "customer_note": "当日接机费用：USD 260。司机信息将在确认后显示。"
        },
        {
          "item_id": "day1_hotel_checkin",
          "item_type": "hotel",
          "title": "酒店入住",
          "planned_start_time": "15:30",
          "location_name": "The Kendall Hotel",
          "drive_time_text": "约 20 分钟",
          "distance_text": "约 5 miles",
          "traffic_text": "Good",
          "customer_note": "当晚住宿费用：USD 260，税费以酒店最终确认单为准。",
          "address": "350 Main St, Cambridge, MA 02142"
        },
        {
          "item_id": "day1_evening_transfer",
          "item_type": "transfer",
          "title": "Cambridge 晚间短途用车",
          "planned_start_time": "18:00",
          "planned_end_time": "20:00",
          "location_name": "Cambridge",
          "drive_time_text": "约 2 小时服务时长",
          "distance_text": "市区内短途",
          "traffic_text": "Moderate",
          "customer_note": "晚间短途用车费用：USD 220。"
        }
      ],
      "hotel": {
        "name": "The Kendall Hotel",
        "city": "Cambridge",
        "check_in_date": "2026-06-05",
        "check_out_date": "2026-06-07",
        "address": "350 Main St, Cambridge, MA 02142",
        "room_type": "Standard Room",
        "status_text": "待确认",
        "customer_visible_note": "2 晚住宿预计费用：USD 520，税费以酒店最终确认单为准。"
      }
    },
    {
      "day_no": 2,
      "date": "2026-06-06",
      "weekday": "Sat",
      "title": "Boston / Cambridge 校园访问",
      "city": "Boston / Cambridge",
      "summary": "全天校园访问与顾问协调，含酒店往返接送。",
      "estimated_departure_time": "08:30",
      "transport_summary": {
        "service_type": "charter",
        "status_text": "待运营确认",
        "driver_visibility": "hidden_until_confirmed",
        "customer_note": "Day 2 预计费用：USD 720，包含 8 小时包车与顾问协调。"
      },
      "timeline_items": [
        {
          "item_id": "day2_hotel_pickup",
          "item_type": "pickup",
          "title": "酒店出发",
          "planned_start_time": "08:30",
          "location_name": "The Kendall Hotel",
          "drive_time_text": "约 20 分钟",
          "distance_text": "约 4 miles",
          "traffic_text": "Good",
          "customer_note": "已计入当日包车费用。"
        },
        {
          "item_id": "day2_campus_visit",
          "item_type": "visit",
          "title": "校园访问与顾问陪同",
          "planned_start_time": "09:30",
          "planned_end_time": "15:30",
          "location_name": "Boston / Cambridge",
          "drive_time_text": "约 6 小时服务时长",
          "distance_text": "市区内多点",
          "traffic_text": "Moderate",
          "customer_note": "校园访问与协调费用：USD 720。"
        },
        {
          "item_id": "day2_return_hotel",
          "item_type": "dropoff",
          "title": "返回酒店",
          "planned_start_time": "16:00",
          "location_name": "The Kendall Hotel",
          "drive_time_text": "约 25 分钟",
          "distance_text": "约 6 miles",
          "traffic_text": "Heavy",
          "customer_note": "如超出 8 小时服务范围，额外时长需运营确认。"
        }
      ],
      "hotel": {
        "name": "The Kendall Hotel",
        "city": "Cambridge",
        "check_in_date": "2026-06-05",
        "check_out_date": "2026-06-07",
        "address": "350 Main St, Cambridge, MA 02142",
        "room_type": "Standard Room",
        "status_text": "待确认",
        "customer_visible_note": "第 2 晚住宿已计入酒店合计预计费用 USD 520。"
      }
    },
    {
      "day_no": 3,
      "date": "2026-06-07",
      "weekday": "Sun",
      "title": "Amherst 访校与返程",
      "city": "Cambridge / Amherst",
      "summary": "从 Cambridge 前往 Amherst 访校，结束后返回 Boston。",
      "estimated_departure_time": "07:45",
      "transport_summary": {
        "service_type": "intercity_charter",
        "status_text": "待运营确认",
        "driver_visibility": "hidden_until_confirmed",
        "customer_note": "Day 3 预计费用：USD 880，包含跨城往返用车。"
      },
      "timeline_items": [
        {
          "item_id": "day3_depart_cambridge",
          "item_type": "departure",
          "title": "Cambridge 酒店出发",
          "planned_start_time": "07:45",
          "location_name": "The Kendall Hotel",
          "drive_time_text": "约 1 小时 45 分钟",
          "distance_text": "约 95 miles",
          "traffic_text": "Moderate",
          "customer_note": "跨城用车费用已计入 Day 3 预计费用。"
        },
        {
          "item_id": "day3_amherst_visit",
          "item_type": "visit",
          "title": "Amherst 校园访问",
          "planned_start_time": "10:00",
          "planned_end_time": "13:30",
          "location_name": "Amherst, MA",
          "drive_time_text": "约 3.5 小时停留",
          "distance_text": "校园周边",
          "traffic_text": "Good",
          "customer_note": "顾问协调与现场等待费用：USD 320。"
        },
        {
          "item_id": "day3_return_boston",
          "item_type": "dropoff",
          "title": "返回 Boston",
          "planned_start_time": "14:00",
          "planned_end_time": "16:10",
          "location_name": "Boston",
          "drive_time_text": "约 2 小时 10 分钟",
          "distance_text": "约 100 miles",
          "traffic_text": "Heavy",
          "customer_note": "跨城返程用车费用：USD 560。"
        }
      ]
    }
  ],
  "hotels": [
    {
      "hotel_id": "kendall_cambridge",
      "name": "The Kendall Hotel",
      "city": "Cambridge",
      "check_in_date": "2026-06-05",
      "check_out_date": "2026-06-07",
      "address": "350 Main St, Cambridge, MA 02142",
      "room_type": "Standard Room",
      "status_text": "待确认",
      "customer_visible_note": "2 晚住宿预计费用：USD 520，税费以酒店最终确认单为准。"
    }
  ],
  "documents": [
    {
      "document_id": "fee_summary",
      "title": "多天费用说明",
      "document_type": "fee_note",
      "status_text": "示例",
      "visible_to_customer": true,
      "customer_visible_note": "示例总计：Day 1 USD 480 + Day 2 USD 720 + Day 3 USD 880 + 酒店 USD 520。最终金额以顾问确认版本为准。"
    }
  ]
}`;

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
}

function normalizeBindMode(value) {
  return value === 'trip_only' ? 'trip_only' : 'farland_profile';
}

Page({
  data: {
    jsonText: '',
    importStage: 'editing',
    dryRunLoading: false,
    applyLoading: false,
    previewLoading: false,
    deliveryLoading: false,
    discardLoading: false,
    preview: null,
    canApplyPreview: false,
    errors: [],
    draftTripId: '',
    draftPreviewReady: false,
    draftPreviewMeta: null,
    reviewNote: '',
    customerSearchKeyword: '',
    customersLoading: false,
    customerOptions: [],
    customerPickerRange: [],
    selectedCustomerIndex: -1,
    selectedCustomer: null,
    bindMode: 'farland_profile',
    visibleUntil: '',
    sharePath: '',
    inviteCode: '',
    inviteExpiresAt: '',
    customerTripAccessId: '',
    customerBound: false,
    accessReused: false,
    sampleHint,
  },

  onLoad() {
    this.loadCustomerOptions();
  },

  onJsonInput(e) {
    this.setData({
      jsonText: e.detail.value || '',
      importStage: 'editing',
      preview: null,
      canApplyPreview: false,
      errors: [],
      draftTripId: '',
      draftPreviewReady: false,
      draftPreviewMeta: null,
      sharePath: '',
      inviteCode: '',
      inviteExpiresAt: '',
      customerTripAccessId: '',
      customerBound: false,
      accessReused: false,
    });
  },

  onReviewNoteInput(e) {
    this.setData({ reviewNote: e.detail.value || '' });
  },

  onVisibleUntilInput(e) {
    this.setData({ visibleUntil: e.detail.value || '' });
  },

  onBindModeChange(e) {
    const modes = ['trip_only', 'farland_profile'];
    this.setData({ bindMode: normalizeBindMode(modes[Number(e.detail.value)] || 'farland_profile') });
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
          keyword: safeString(keyword).trim(),
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
    });
  },

  fillSample() {
    this.setData({
      jsonText: sampleHint,
      importStage: 'editing',
      preview: null,
      canApplyPreview: false,
      errors: [],
      draftTripId: '',
      draftPreviewReady: false,
      draftPreviewMeta: null,
      sharePath: '',
      inviteCode: '',
      customerTripAccessId: '',
    });
  },

  parseTripText() {
    const text = safeString(this.data.jsonText).trim();
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

  formatImportErrors(result) {
    if (!result) return ['导入失败：云函数无返回结果'];
    const errors = Array.isArray(result.errors) && result.errors.length ? result.errors : [];
    const detail = result.error_message || result.err_msg || result.error_code || '';
    if (errors.length) {
      return detail ? errors.concat([`错误信息：${detail}`]) : errors;
    }
    const message = result.message || '导入失败';
    return detail ? [`${message}：${detail}`] : [message];
  },

  canApplyResult(result) {
    if (!result || result.dry_run === false) return false;
    return Boolean(result.can_apply || result.preview_valid || result.valid);
  },

  normalizePreviewResult(result) {
    if (!result) return null;
    const normalized = result.normalized_preview || {};
    const preview = result.preview || {};
    const meta = result.preview_meta || {};
    const warningList = result.warning_codes || result.warnings || meta.warnings || [];
    const criticalWarningList = result.critical_warning_codes || meta.critical_warnings || [];
    return {
      ...result,
      display_trip_id: result.trip_id || normalized.trip_id || normalized.external_trip_id || result.external_trip_id || '',
      display_external_trip_id: result.external_trip_id || normalized.external_trip_id || '',
      display_title: normalized.title || preview.title || '',
      display_action: result.action || '',
      display_review_status: result.review_status || meta.review_status || (result.review_seed && result.review_seed.review_status) || '',
      display_visibility_status: result.visibility_status || meta.visibility_status || (result.review_seed && result.review_seed.visibility_status) || '',
      display_published_version: result.published_version !== undefined
        ? result.published_version
        : (meta.published_version !== undefined ? meta.published_version : ((result.review_seed && result.review_seed.published_version) || 0)),
      display_can_apply: this.canApplyResult(result),
      display_day_count: preview.day_count || normalized.day_count || 0,
      display_hotel_count: preview.hotel_count || normalized.hotel_count || 0,
      display_flight_count: preview.flight_count || normalized.flight_count || 0,
      can_open_detail: result.dry_run === false && Boolean(result.trip_id || normalized.trip_id || normalized.external_trip_id || result.external_trip_id || result.customer_trip_id),
      warningList,
      criticalWarningList,
      operationList: result.operations || [],
    };
  },

  async callImport(dryRun) {
    const trip = this.parseTripText();
    if (!trip) return null;

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
          dry_run: dryRun,
        },
      });
      if (!result || !result.success) {
        this.setData({
          errors: this.formatImportErrors(result),
          preview: null,
          canApplyPreview: false,
          dryRunLoading: false,
          applyLoading: false,
        });
        wx.showToast({ title: (result && result.message) || '导入失败', icon: 'none' });
        return null;
      }
      if (dryRun) {
        this.setData({
          importStage: 'previewed',
          preview: this.normalizePreviewResult(result),
          canApplyPreview: this.canApplyResult(result),
          errors: [],
          dryRunLoading: false,
          applyLoading: false,
        });
        wx.showToast({ title: '预览完成', icon: 'success' });
        return result;
      }
      return result;
    } catch (error) {
      const errMsg = (error && (error.errMsg || error.message)) || '未知错误';
      console.error('[customer-import] importCustomerTripJSON call failed', error);
      this.setData({
        errors: [
          `云函数调用失败：${errMsg}`,
          '请确认 importCustomerTripJSON 已部署到当前云环境，并查看云函数日志。',
        ],
        canApplyPreview: false,
        dryRunLoading: false,
        applyLoading: false,
      });
      wx.showToast({ title: '调用失败', icon: 'none' });
      return null;
    }
  },

  previewImport() {
    this.callImport(true);
  },

  async applyImport() {
    if (!this.data.preview || !this.data.canApplyPreview) {
      wx.showToast({ title: '请先预览导入', icon: 'none' });
      return;
    }
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '确认写入',
        content: '确认后将写入行程并生成客户界面预览，暂不会发布给客户。',
        confirmText: '写入',
        success: (res) => resolve(res.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;

    const importResult = await this.callImport(false);
    if (!importResult) return;
    const tripId = importResult.trip_id || importResult.external_trip_id || importResult.customer_trip_id || '';
    if (!tripId) {
      this.setData({
        errors: ['写入成功，但云函数未返回 trip_id，不能生成客户界面预览。'],
        dryRunLoading: false,
        applyLoading: false,
      });
      return;
    }

    try {
      const { result: draftResult } = await wx.cloud.callFunction({
        name: 'buildCustomerTripVisibleDraft',
        data: { trip_id: tripId },
      });
      if (!draftResult || !draftResult.success) {
        this.setData({
          errors: [(draftResult && draftResult.message) || '客户界面预览生成失败'],
          dryRunLoading: false,
          applyLoading: false,
        });
        wx.showToast({ title: '生成预览失败', icon: 'none' });
        return;
      }
      const previewPayload = await this.loadOperatorCustomerPreview(tripId);
      const previewMeta = (previewPayload && previewPayload.preview_meta) || {};
      this.setData({
        importStage: 'draft_ready',
        draftTripId: draftResult.trip_id || tripId,
        draftPreviewReady: true,
        draftPreviewMeta: previewMeta,
        preview: this.normalizePreviewResult({
          ...importResult,
          ...draftResult,
          preview_meta: previewMeta,
          dry_run: false,
        }),
        canApplyPreview: false,
        errors: [],
        dryRunLoading: false,
        applyLoading: false,
        sharePath: '',
        inviteCode: '',
        customerTripAccessId: '',
        customerBound: false,
        accessReused: false,
      });
      wx.showToast({ title: '客户界面预览已生成', icon: 'success' });
    } catch (error) {
      const errMsg = (error && (error.errMsg || error.message)) || '未知错误';
      console.error('[customer-import] buildCustomerTripVisibleDraft failed', error);
      this.setData({
        errors: [`客户界面预览生成失败：${errMsg}`],
        dryRunLoading: false,
        applyLoading: false,
      });
      wx.showToast({ title: '生成预览失败', icon: 'none' });
    }
  },

  async loadOperatorCustomerPreview(tripId) {
    const { result } = await wx.cloud.callFunction({
      name: 'getOperatorCustomerHomePreview',
      data: {
        trip_id: tripId,
        preview_access_mode: 'temporary_guest',
      },
    });
    if (!result || !result.success) {
      throw new Error((result && result.message) || '客户界面预览加载失败');
    }
    return result;
  },

  async openDraftCustomerPreviewFromImport() {
    const tripId = this.data.draftTripId;
    if (!tripId || !this.data.draftPreviewReady) {
      wx.showToast({ title: '请先生成客户界面预览', icon: 'none' });
      return;
    }
    this.setData({ previewLoading: true });
    try {
      const result = await this.loadOperatorCustomerPreview(tripId);
      if (!result.customer_home) {
        wx.showToast({ title: '预览数据为空', icon: 'none' });
        this.setData({ previewLoading: false });
        return;
      }
      const app = getApp();
      app.globalData.operatorCustomerHomePreview = {
        customer_home: result.customer_home,
        preview_meta: {
          ...(result.preview_meta || {}),
          operator_draft_preview: true,
        },
        preview_customer: result.preview_customer || {},
      };
      delete app.globalData.operatorCustomerSharePreview;
      this.setData({ previewLoading: false });
      wx.navigateTo({
        url: '/pages/operator/customer-trip-mobile-preview/customer-trip-mobile-preview?operator_customer_preview=1',
        fail: (error) => {
          console.error('[customer-import] open mobile preview failed', error);
          wx.showToast({ title: '客户界面打开失败', icon: 'none' });
        },
      });
    } catch (error) {
      const errMsg = (error && (error.errMsg || error.message)) || '未知错误';
      this.setData({ previewLoading: false, errors: [`客户界面打开失败：${errMsg}`] });
      wx.showToast({ title: '客户界面打开失败', icon: 'none' });
    }
  },

  async discardDraftAndReimport() {
    const tripId = this.data.draftTripId;
    if (!tripId) {
      this.resetImportState();
      return;
    }
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '重新录入',
        content: '仅未发布、未绑定、未生成有效分享卡的草稿可以清除。确认重新录入？',
        confirmText: '重新录入',
        confirmColor: '#D94A4A',
        success: (res) => resolve(res.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;

    this.setData({ discardLoading: true, errors: [] });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'discardCustomerTripDraft',
        data: { trip_id: tripId },
      });
      if (!result || !result.success) {
        this.setData({
          discardLoading: false,
          errors: [(result && result.message) || '已发布或已绑定行程不能直接清除，请创建新版本'],
        });
        wx.showToast({ title: (result && result.message) || '不能清除', icon: 'none' });
        return;
      }
      this.resetImportState();
      wx.showToast({ title: '已清除草稿', icon: 'success' });
    } catch (error) {
      const errMsg = (error && (error.errMsg || error.message)) || '未知错误';
      this.setData({ discardLoading: false, errors: [`重新录入失败：${errMsg}`] });
      wx.showToast({ title: '重新录入失败', icon: 'none' });
    }
  },

  resetImportState() {
    this.setData({
      jsonText: '',
      importStage: 'editing',
      preview: null,
      canApplyPreview: false,
      errors: [],
      draftTripId: '',
      draftPreviewReady: false,
      draftPreviewMeta: null,
      reviewNote: '',
      selectedCustomerIndex: -1,
      selectedCustomer: null,
      visibleUntil: '',
      sharePath: '',
      inviteCode: '',
      inviteExpiresAt: '',
      customerTripAccessId: '',
      customerBound: false,
      accessReused: false,
      discardLoading: false,
    });
  },

  async deliverTripToCustomer() {
    const tripId = this.data.draftTripId;
    const selectedCustomer = this.data.selectedCustomer;
    if (!tripId || !this.data.draftPreviewReady) {
      wx.showToast({ title: '请先生成客户界面预览', icon: 'none' });
      return;
    }
    if (!selectedCustomer) {
      wx.showToast({ title: '请选择客户', icon: 'none' });
      return;
    }
    const criticalWarnings = (this.data.preview && this.data.preview.criticalWarningList) || [];
    if (criticalWarnings.length) {
      wx.showToast({ title: '存在关键警告，不能发布', icon: 'none' });
      return;
    }
    this.setData({ deliveryLoading: true, errors: [] });
    try {
      const { result: publishResult } = await wx.cloud.callFunction({
        name: 'publishCustomerTrip',
        data: {
          trip_id: tripId,
          review_note: this.data.reviewNote,
        },
      });
      if (!publishResult || !publishResult.success) {
        this.setData({
          deliveryLoading: false,
          errors: [(publishResult && publishResult.message) || '发布失败'],
        });
        wx.showToast({ title: (publishResult && publishResult.message) || '发布失败', icon: 'none' });
        return;
      }
      const customerUserId = selectedCustomer.customer_user_id || selectedCustomer.user_id;
      const { result: inviteResult } = await wx.cloud.callFunction({
        name: 'createCustomerTripInvite',
        data: {
          trip_id: publishResult.trip_id || tripId,
          customer_user_id: customerUserId,
          bind_mode: this.data.bindMode,
          visible_until: this.data.visibleUntil,
          expires_in_days: 30,
        },
      });
      if (!inviteResult || !inviteResult.success) {
        this.setData({
          deliveryLoading: false,
          errors: [(inviteResult && inviteResult.message) || '分享链接生成失败'],
        });
        wx.showToast({ title: (inviteResult && inviteResult.message) || '分享失败', icon: 'none' });
        return;
      }
      this.setData({
        importStage: 'delivered',
        deliveryLoading: false,
        sharePath: inviteResult.share_path || inviteResult.path || '',
        inviteCode: inviteResult.invite_code || '',
        inviteExpiresAt: inviteResult.expires_at || '',
        customerTripAccessId: inviteResult.customer_trip_access_id || '',
        customerBound: Boolean(inviteResult.customer_bound),
        accessReused: Boolean(inviteResult.access_reused),
      });
      wx.showToast({ title: '分享链接已生成', icon: 'success' });
    } catch (error) {
      const errMsg = (error && (error.errMsg || error.message)) || '未知错误';
      this.setData({ deliveryLoading: false, errors: [`交付失败：${errMsg}`] });
      wx.showToast({ title: '交付失败', icon: 'none' });
    }
  },

  copySharePath() {
    if (!this.data.sharePath) {
      wx.showToast({ title: '暂无客户路径', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: this.data.sharePath,
      success: () => wx.showToast({ title: '已复制客户路径', icon: 'success' }),
    });
  },
});
