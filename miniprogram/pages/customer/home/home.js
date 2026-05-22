Page({
  data: {
    loading: true,
    profile: {},
    benefits: [],
    hotelRequests: [],
    transportationAppointments: [],
    todayItinerary: null,
    nextConfirmed: {},
    tripOverview: [],
    hotelCards: [],
    transferRequests: [],
    transportOrders: [],
    charterServices: [],
    topBenefits: [],
    advisorPhone: '',
    inviteCode: '',
    inviteRequestId: '',
    inviteMode: false,
    operatorPreview: false,
    needsInviteClaim: false,
    claimBindType: 'profile',
    claimDisplayName: '',
    claimSubmitting: false,
  },

  onLoad(options = {}) {
    const preview = this.consumeOperatorPreview();
    this.setData({
      inviteCode: options.invite_code || '',
      inviteRequestId: options.request_id || preview.requestId || '',
      inviteMode: Boolean(options.invite_code && options.request_id),
      operatorPreview: Boolean(preview.requestId),
    });
    this.loadHome();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    const preview = this.consumeOperatorPreview();
    if (preview.requestId && (preview.requestId !== this.data.inviteRequestId || !this.data.operatorPreview)) {
      this.setData({
        inviteCode: '',
        inviteRequestId: preview.requestId,
        inviteMode: false,
        operatorPreview: true,
        needsInviteClaim: false,
      });
      this.loadHome();
    }
  },

  consumeOperatorPreview() {
    const app = getApp();
    const preview = app.globalData && app.globalData.customerHomePreview;
    if (!preview || !preview.requestId) return {};
    delete app.globalData.customerHomePreview;
    return preview;
  },

  async loadHome() {
    this.setData({ loading: true });
    try {
      if (this.data.operatorPreview && this.data.inviteRequestId) {
        const invitedTransfer = await this.loadInvitedTransferIfNeeded();
        this.setData({
          loading: false,
          needsInviteClaim: false,
          profile: {
            name: '客户主页预览',
            member_level: '运营预览',
            points_balance: 0,
            subtitle: '当前为运营预览，客户不会看到返回运营中心入口',
          },
          benefits: [],
          topBenefits: [],
          hotelRequests: [],
          transportationAppointments: [],
          todayItinerary: null,
          nextConfirmed: {
            title: invitedTransfer ? invitedTransfer.title : '用车方案确认中',
            date: invitedTransfer ? invitedTransfer.pickup_time_text : '',
            time: '',
            city: invitedTransfer ? invitedTransfer.pickup : '',
          },
          tripOverview: [],
          hotelCards: [],
          transferRequests: invitedTransfer ? [invitedTransfer] : [],
          transportOrders: [],
          charterServices: [],
          advisorPhone: '',
        });
        return;
      }

      const { result } = await wx.cloud.callFunction({ name: 'getCustomerHome' });
      if (!result || !result.success) {
        wx.showToast({ title: '加载失败', icon: 'none' });
        this.setData({ loading: false });
        return;
      }
      if (this.data.inviteMode && result.access_status === 'empty') {
        this.setData({
          loading: false,
          needsInviteClaim: true,
          profile: {},
          transferRequests: [],
          transportOrders: [],
          charterServices: [],
          nextConfirmed: {},
        });
        return;
      }
      const todayItinerary = result.today_itinerary || null;
      const tripOverview = (result.trip_overview || []).map((item) => ({
        ...item,
        statusText: item.status === 'pending' ? '顾问确认中' : '已确认',
        statusClass: item.status === 'pending' ? 'pending' : 'confirmed',
      }));
      const hotelCards = (result.hotel_requests || []).map((item, index) => ({
        ...item,
        id: item._id || `${item.city || 'hotel'}-${index}`,
        displayName: item.hotel_name || item.city || '酒店需求',
        statusText: item.status === 'confirmed' ? '已确认' : '顾问确认中',
        statusClass: item.status === 'confirmed' ? 'confirmed' : 'pending',
        subline: item.hotel_name
          ? `${item.room_type || '房型待确认'}`
          : 'Farland 顾问正在确认酒店与房型',
      }));
      const transferRequests = (result.transfer_requests || []).map((request) => ({
        ...request,
        quoteCount: (request.quotes || []).length,
        statusClass: request.status === 'quoted' ? 'quoted' : 'pending',
        quotes: (request.quotes || []).map((quote) => ({
          ...quote,
          feeRateText: `${Math.round((quote.farland_service_fee_rate || 0.1) * 100)}%`,
          recommendationText: quote.is_recommended ? '推荐' : '',
          includesText: (quote.includes || []).join(' / '),
          excludesText: (quote.excludes || []).join(' / '),
        })),
      }));
      const transportOrders = (result.transport_orders || []).map((order) => ({
        ...order,
        statusClass: order.order_status === 'assigned' ? 'confirmed' : 'pending',
      }));
      const invitedTransfer = await this.loadInvitedTransferIfNeeded();
      const mergedTransferRequests = invitedTransfer
        ? [invitedTransfer, ...transferRequests.filter((item) => item.request_id !== invitedTransfer.request_id)]
        : transferRequests;
      const nextConfirmed = todayItinerary
        ? {
            title: todayItinerary.title,
            date: todayItinerary.date,
            time: todayItinerary.items && todayItinerary.items[0] ? todayItinerary.items[0].time : '',
            city: todayItinerary.city,
          }
        : {
            title: tripOverview[0] ? tripOverview[0].title : '暂无确认行程',
            date: tripOverview[0] ? tripOverview[0].date : '',
            time: '',
            city: tripOverview[0] ? tripOverview[0].city : '',
          };
      this.setData({
        loading: false,
        needsInviteClaim: false,
        profile: result.profile || {},
        benefits: result.benefits || [],
        topBenefits: (result.benefits || []).slice(0, 2),
        hotelRequests: result.hotel_requests || [],
        transportationAppointments: result.transportation_appointments || [],
        todayItinerary,
        nextConfirmed,
        tripOverview,
        hotelCards,
        transferRequests: mergedTransferRequests,
        transportOrders,
        charterServices: result.charter_services || [],
        advisorPhone: todayItinerary && todayItinerary.farland_contact ? todayItinerary.farland_contact.phone : '',
      });
    } catch (error) {
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  selectClaimBindType(e) {
    const bindType = e.currentTarget.dataset.bindType || 'profile';
    this.setData({ claimBindType: bindType });
  },

  onClaimNameInput(e) {
    this.setData({ claimDisplayName: e.detail.value || '' });
  },

  async submitInviteClaim() {
    const { inviteCode, inviteRequestId, claimBindType, claimDisplayName } = this.data;
    const safeName = String(claimDisplayName || '').trim();
    if (!safeName) {
      wx.showToast({ title: '请填写称呼', icon: 'none' });
      return;
    }
    this.setData({ claimSubmitting: true });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'claimCustomerInvite',
        data: {
          request_id: inviteRequestId,
          invite_code: inviteCode,
          bind_type: claimBindType,
          display_name: safeName,
        },
      });
      if (!result || !result.success) {
        wx.showToast({ title: (result && result.message) || '确认失败', icon: 'none' });
        this.setData({ claimSubmitting: false });
        return;
      }
      this.setData({ claimSubmitting: false, needsInviteClaim: false });
      this.loadHome();
    } catch (error) {
      wx.showToast({ title: '确认失败', icon: 'none' });
      this.setData({ claimSubmitting: false });
    }
  },

  async loadInvitedTransferIfNeeded() {
    const { inviteCode, inviteRequestId } = this.data;
    if (!inviteRequestId) return null;

    const { result } = await wx.cloud.callFunction({
      name: 'getCustomerTransportQuotes',
      data: {
        request_id: inviteRequestId,
        invite_code: inviteCode,
      },
    });
    if (!result || !result.success) {
      wx.showToast({ title: (result && result.message) || '客户邀请无效', icon: 'none' });
      return null;
    }
    const summary = result.request_summary || {};
    const quotes = (result.quotes || []).map((quote) => ({
      ...quote,
      quote_id: quote.quote_id || quote._id,
      public_title: quote.public_title || quote.title || 'Farland 用车方案',
      suitable_for: quote.operator_explanation || '',
      feeRateText: `${Math.round((quote.farland_service_fee_rate || 0.1) * 100)}%`,
      recommendationText: quote.is_recommended ? '推荐' : '',
      includesText: (quote.includes || quote.included_items || []).join(' / '),
      excludesText: (quote.excludes || quote.excluded_items || []).join(' / '),
    }));
    return {
      request_id: result.request_id || inviteRequestId,
      title: summary.request_no ? `用车方案 ${summary.request_no}` : 'Farland 用车方案',
      created_by_text: summary.created_by_text || '由 Farland 顾问为您安排',
      pickup: summary.pickup || summary.driver_region || '待确认',
      dropoff: summary.dropoff || '待确认',
      pickup_time_text: summary.pickup_time_text || summary.service_date || '待确认',
      passengers: summary.passengers || '-',
      luggage: summary.luggage || '-',
      status: summary.status || (result.has_published_quotes ? 'quoted' : 'sourcing'),
      status_text: summary.status_text || (result.has_published_quotes ? '已收到优选用车方案' : '确认中'),
      ops_status_text: summary.ops_status_text || (result.has_published_quotes
        ? 'Farland 已为您筛选以下优选用车方案。'
        : 'Farland 正在为您确认用车方案。'),
      quoteCount: quotes.length,
      statusClass: summary.status === 'cancelled'
        ? 'cancelled'
        : (summary.status === 'assigned' ? 'confirmed' : (result.has_published_quotes ? 'quoted' : 'pending')),
      quotes,
      assigned_transport: result.assigned_transport || null,
      cancel_reason_driver: summary.cancel_reason_driver || '',
    };
  },

  goHotelRequest() {
    wx.switchTab({ url: '/pages/hotel/request/request' });
  },

  goBenefits() {
    wx.navigateTo({ url: '/pages/customer/benefits/benefits' });
  },

  backToOperatorCenter() {
    this.setData({ operatorPreview: false });
    wx.navigateTo({ url: '/pages/operator/dashboard/dashboard' });
  },

  callDriver() {
    const phone = this.data.todayItinerary && this.data.todayItinerary.driver
      ? this.data.todayItinerary.driver.phone
      : '';
    if (!phone) {
      wx.showToast({ title: '暂无司机电话', icon: 'none' });
      return;
    }
    wx.makePhoneCall({ phoneNumber: phone.replace(/[^\d+]/g, '') });
  },

  contactAdvisor() {
    const phone = this.data.advisorPhone;
    if (!phone) {
      wx.showToast({ title: '暂无顾问电话', icon: 'none' });
      return;
    }
    wx.makePhoneCall({ phoneNumber: phone.replace(/[^\d+]/g, '') });
  },

  chooseQuote(e) {
    const quoteId = e.currentTarget.dataset.quoteId;
    if (!quoteId) return;
    wx.showToast({ title: '请进入用车详情查看方案', icon: 'none' });
  },

  viewTransferDetail(e) {
    const requestId = e.currentTarget.dataset.requestId;
    if (!requestId) return;
    const query = this.data.inviteRequestId === requestId && this.data.inviteCode
      ? `request_id=${requestId}&invite_code=${this.data.inviteCode}`
      : `request_id=${requestId}`;
    wx.navigateTo({
      url: `/pages/customer/transfer-detail/transfer-detail?${query}`,
    });
  },
});
