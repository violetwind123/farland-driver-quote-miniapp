Page({
  data: {
    loading: true,
    profile: {},
    benefits: [],
    hotelRequests: [],
    transportationAppointments: [],
    todayCard: null,
    todayItinerary: null,
    showHomeEmpty: false,
    showLegacyTransport: false,
    nextConfirmed: {},
    tripOverview: [],
    hotelCards: [],
    transferRequests: [],
    primaryTransfer: null,
    transportOrders: [],
    charterServices: [],
    topBenefits: [],
    advisorPhone: '',
    advisorQrPath: '/assets/images/advisor-wechat-qr.jpg',
    showAdvisorQr: false,
    inviteCode: '',
    inviteRequestId: '',
    inviteMode: false,
    operatorPreview: false,
    needsInviteClaim: false,
    claimingTemporaryAccess: false,
    currentBindMode: '',
    profileUpgradeName: '',
    showProfileUpgrade: false,
    showProfileUpgradeForm: false,
    claimDisplayName: '',
    claimSubmitting: false,
    autoClaimingInvite: false,
    autoClaimedInviteKey: '',
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
          todayCard: null,
          todayItinerary: null,
          showHomeEmpty: false,
          showLegacyTransport: Boolean(invitedTransfer),
          nextConfirmed: {
            title: invitedTransfer ? invitedTransfer.title : '用车方案准备中',
            date: invitedTransfer ? invitedTransfer.pickup_time_text : '',
            time: '',
            city: invitedTransfer ? invitedTransfer.pickup : '',
          },
          tripOverview: [],
          hotelCards: [],
          transferRequests: invitedTransfer ? [invitedTransfer] : [],
          primaryTransfer: invitedTransfer || null,
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
        const autoClaimed = await this.tryAutoClaimInviteForProfile(result);
        if (autoClaimed) return;
        const invitedTransfer = await this.loadInvitedTransferIfNeeded();
        this.setData({
          loading: false,
          needsInviteClaim: false,
          profile: {
            name: '临时客户',
            member_level: '本次行程查看',
            points_balance: 0,
            subtitle: 'Farland 顾问已为您同步本次行程',
          },
          benefits: [],
          topBenefits: [],
          hotelRequests: [],
          transportationAppointments: [],
          todayCard: null,
          todayItinerary: null,
          showHomeEmpty: false,
          showLegacyTransport: Boolean(invitedTransfer),
          nextConfirmed: {
            title: invitedTransfer ? invitedTransfer.title : '暂无可查看行程',
            date: invitedTransfer ? invitedTransfer.pickup_time_text : '',
            time: '',
            city: invitedTransfer ? invitedTransfer.pickup : '',
          },
          tripOverview: [],
          hotelCards: [],
          transferRequests: invitedTransfer ? [invitedTransfer] : [],
          primaryTransfer: invitedTransfer || null,
          transportOrders: [],
          charterServices: [],
          advisorPhone: '',
          currentBindMode: 'temporary_invite',
          showProfileUpgrade: Boolean(invitedTransfer),
        });
        return;
      }
      const todayCard = this.normalizeTodayCard(result.today_card || null);
      const todayItinerary = this.normalizeTodayItinerary(result.today_itinerary || null);
      const tripOverview = (result.trip_overview || []).map((item) => ({
        ...item,
        statusText: item.status === 'pending' ? 'Farland 确认中' : '已确认',
        statusClass: item.status === 'pending' ? 'pending' : 'confirmed',
      }));
      const hotelCards = (result.hotel_requests || []).map((item, index) => ({
        ...item,
        id: item._id || `${item.city || 'hotel'}-${index}`,
        displayName: item.hotel_name || item.city || '酒店需求',
        statusText: item.status === 'confirmed' ? '已确认' : 'Farland 确认中',
        statusClass: item.status === 'confirmed' ? 'confirmed' : 'pending',
        subline: item.hotel_name
          ? `${item.room_type || '房型待确认'}`
          : 'Farland 顾问正在确认酒店与房型',
      }));
      const transferRequests = (result.transfer_requests || []).map((request) => ({
        ...request,
        pickup_time_text: this.formatDisplayTime(request.pickup_time_text || request.service_date || ''),
        quoteCount: (request.quotes || []).length,
        statusClass: request.status === 'assigned' || request.status === 'confirmed'
          ? 'confirmed'
          : (request.status === 'quoted' ? 'quoted' : 'pending'),
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
        pickup_time_text: this.formatDisplayTime(order.pickup_time_text || order.pickup_time || ''),
        statusClass: order.order_status === 'assigned' ? 'confirmed' : 'pending',
      }));
      const invitedTransfer = await this.loadInvitedTransferIfNeeded();
      const mergedTransferRequests = invitedTransfer
        ? [invitedTransfer, ...transferRequests.filter((item) => item.request_id !== invitedTransfer.request_id)]
        : transferRequests;
      const hasTransport = Boolean(
        mergedTransferRequests.length
        || transportOrders.length
        || (result.charter_services || []).length,
      );
      const showHomeEmpty = !todayCard
        && !todayItinerary
        && !tripOverview.length
        && !hasTransport
        && !hotelCards.length;
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
        currentBindMode: result.bind_mode || '',
        showProfileUpgrade: this.data.inviteMode && result.bind_mode !== 'farland_profile',
        showProfileUpgradeForm: this.data.showProfileUpgradeForm && result.bind_mode !== 'farland_profile',
        benefits: result.benefits || [],
        topBenefits: (result.benefits || []).slice(0, 2),
        hotelRequests: result.hotel_requests || [],
        transportationAppointments: result.transportation_appointments || [],
        todayCard,
        todayItinerary,
        showHomeEmpty,
        showLegacyTransport: !todayCard && !showHomeEmpty && hasTransport,
        nextConfirmed,
        tripOverview,
        hotelCards,
        transferRequests: mergedTransferRequests,
        primaryTransfer: mergedTransferRequests[0] || null,
        transportOrders,
        charterServices: result.charter_services || [],
        advisorPhone: (todayCard && todayCard.advisor && todayCard.advisor.phone)
          || (todayItinerary && todayItinerary.farland_contact ? todayItinerary.farland_contact.phone : ''),
      });
    } catch (error) {
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  normalizeAssignedDriver(source) {
    if (!source) return null;
    const driverName = source.name || source.driver_name || source.display_name || '';
    const phone = source.phone || source.driver_phone || '';
    const vehicleModel = source.vehicle_model || '';
    const vehicleType = source.vehicle_type || source.vehicle_class || '';
    const plateNumber = source.plate_number || '';
    if (!driverName && !phone && !vehicleModel && !vehicleType && !plateNumber) return null;
    return {
      name: driverName,
      phone,
      vehicle_model: vehicleModel,
      vehicle_type: vehicleType,
      plate_number: plateNumber,
      meeting_point: source.meeting_point || '',
      vehicleText: vehicleModel || vehicleType || '车辆待确认',
      detailLine: [
        driverName ? `司机：${driverName}` : '',
        vehicleModel || vehicleType ? `车辆：${vehicleModel || vehicleType}` : '',
        phone ? `电话：${phone}` : '',
      ].filter(Boolean).join(' · '),
    };
  },

  normalizeTodayCard(card) {
    if (!card) return null;
    const driverVisibility = card.driver_visibility === 'assigned' ? 'assigned' : 'pending';
    const normalizedDriver = this.normalizeAssignedDriver(card.driver || card.assigned_transport || null);
    const driverAssigned = driverVisibility === 'assigned' && normalizedDriver;
    const timelineItems = (card.timeline_items || []).map((item, index) => {
      const time = this.formatDisplayTime(item.time || '');
      return {
        ...item,
        time,
        id: item.id || `${item.time || 'time'}-${index}`,
        meta: [item.location, item.route, item.drive_time].filter(Boolean).join(' · '),
        noteText: [item.traffic_level ? `Traffic: ${item.traffic_level}` : '', item.note].filter(Boolean).join(' · '),
      };
    });
    const destinationCards = (card.destination_cards && card.destination_cards.length ? card.destination_cards : timelineItems).map((item, index) => {
      const time = this.formatDisplayTime(item.time || '');
      const arrivalEstimate = this.formatDisplayTime(item.arrival_estimate || '');
      return {
        ...item,
        time,
        arrival_estimate: arrivalEstimate,
        card_id: item.card_id || item.id || `${item.time || 'node'}-${index}`,
        sequence: item.sequence || index + 1,
        chipLabel: `${time || ''} ${item.title || ''}`.trim(),
      };
    });
    const serviceWindowText = this.formatDisplayTime(
      (card.service_window && card.service_window.label) || card.service_window || card.depart_time || '',
    );
    const hotel = card.hotel
      ? {
          ...card.hotel,
          arrival_time: this.formatDisplayTime(card.hotel.arrival_time || ''),
        }
      : null;
    return {
      ...card,
      driver_visibility: driverVisibility,
      dayLabel: `Trip ${card.trip_no || card.trip_id || ''} · Day ${card.day_no || ''}`,
      dateRouteText: `${card.weekday || ''}${card.date ? ` · ${card.date}` : ''}${card.city_summary ? ` · ${card.city_summary}` : ''}`,
      timeline_items: timelineItems,
      destination_cards: destinationCards,
      serviceWindowText,
      transportTitle: (card.transport_summary && card.transport_summary.title) || (card.service_type === 'charter' ? '今日包车服务' : '今日接送安排'),
      transportStatusText: driverAssigned
        ? '已分配司机'
        : ((card.transport_summary && card.transport_summary.status_text) || '车辆已确认，司机信息待同步'),
      routeStops: destinationCards.map((item) => ({
        id: item.card_id,
        time: item.time,
        title: item.title,
      })),
      hotel,
      advisor: card.advisor || {},
      driver: driverAssigned ? normalizedDriver : null,
      driverPendingText: driverAssigned ? '' : '司机信息将在 Farland 完成确认后同步。',
    };
  },

  normalizeTodayItinerary(itinerary) {
    if (!itinerary) return null;
    return {
      ...itinerary,
      items: (itinerary.items || []).map((item) => ({
        ...item,
        time: this.formatDisplayTime(item.time || ''),
      })),
    };
  },

  formatDisplayTime(value) {
    if (!value && value !== 0) return '';
    return String(value)
      .replace(/\b(1[0-2]|0?[1-9]):([0-5]\d)\s*(AM|PM)\b/gi, (match, hour, minute, period) => {
        let hour24 = Number(hour);
        const normalizedPeriod = String(period).toUpperCase();
        if (normalizedPeriod === 'PM' && hour24 !== 12) hour24 += 12;
        if (normalizedPeriod === 'AM' && hour24 === 12) hour24 = 0;
        return `${String(hour24).padStart(2, '0')}:${minute}`;
      })
      .replace(/(上午|下午)\s*(1[0-2]|0?[1-9]):([0-5]\d)/g, (match, period, hour, minute) => {
        let hour24 = Number(hour);
        if (period === '下午' && hour24 !== 12) hour24 += 12;
        if (period === '上午' && hour24 === 12) hour24 = 0;
        return `${String(hour24).padStart(2, '0')}:${minute}`;
      });
  },

  selectClaimBindType(e) {
    const bindType = e.currentTarget.dataset.bindType || 'trip_only';
    this.setData({ currentBindMode: bindType });
  },

  onClaimNameInput(e) {
    this.setData({ claimDisplayName: e.detail.value || '' });
  },

  onProfileUpgradeNameInput(e) {
    this.setData({ profileUpgradeName: e.detail.value || '' });
  },

  openProfileUpgradeForm() {
    this.setData({ showProfileUpgradeForm: true });
  },

  async tryAutoClaimInviteForProfile(homeResult) {
    if (!homeResult || homeResult.bind_mode !== 'farland_profile') return false;
    const { inviteCode, inviteRequestId, autoClaimingInvite, autoClaimedInviteKey } = this.data;
    if (!inviteCode || !inviteRequestId || autoClaimingInvite) return false;

    const inviteKey = `${inviteRequestId}:${inviteCode}`;
    if (autoClaimedInviteKey === inviteKey) return false;

    this.setData({
      autoClaimingInvite: true,
      autoClaimedInviteKey: inviteKey,
    });

    try {
      const result = await this.claimInvite('farland_profile');
      this.setData({ autoClaimingInvite: false });
      if (!result || !result.success) {
        if (result && result.error_code && result.error_code !== 'DISPLAY_NAME_REQUIRED') {
          wx.showToast({ title: result.message || '行程同步失败', icon: 'none' });
        }
        return false;
      }

      wx.showToast({ title: '已同步行程', icon: 'success' });
      this.loadHome();
      return true;
    } catch (error) {
      this.setData({ autoClaimingInvite: false });
      return false;
    }
  },

  async registerCustomerProfile() {
    if (this.data.currentBindMode === 'farland_profile') {
      wx.showToast({ title: '已绑定当前微信', icon: 'none' });
      return;
    }
    if (this.data.inviteMode && this.data.inviteCode && this.data.inviteRequestId) {
      this.setData({
        showProfileUpgrade: true,
        showProfileUpgradeForm: true,
      });
      return;
    }
    try {
      const profileName = this.data.profile && this.data.profile.name;
      const displayName = profileName && profileName !== '欢迎使用 Farland' ? profileName : 'Farland 客户';
      const result = await this.claimInvite('farland_profile', displayName);
      if (!result || !result.success) {
        wx.showToast({ title: (result && result.message) || '注册失败', icon: 'none' });
        return;
      }
      wx.showToast({ title: '已绑定当前微信', icon: 'success' });
      this.loadHome();
    } catch (error) {
      wx.showToast({ title: '注册失败', icon: 'none' });
    }
  },

  async claimInvite(bindMode, displayName = '') {
    const { inviteCode, inviteRequestId } = this.data;
    const { result } = await wx.cloud.callFunction({
      name: 'claimCustomerInvite',
      data: {
        request_id: inviteRequestId,
        invite_code: inviteCode,
        bind_mode: bindMode,
        display_name: displayName,
      },
    });
    return result;
  },

  claimTemporaryAccess() {
    this.loadHome();
  },

  async submitInviteClaim() {
    const { profileUpgradeName } = this.data;
    const safeName = String(profileUpgradeName || '').trim();
    if (!safeName) {
      wx.showToast({ title: '请填写称呼', icon: 'none' });
      return;
    }
    this.setData({ claimSubmitting: true });
    try {
      const result = await this.claimInvite('farland_profile', safeName);
      if (!result || !result.success) {
        wx.showToast({ title: (result && result.message) || '保存失败', icon: 'none' });
        this.setData({ claimSubmitting: false });
        return;
      }
      wx.showToast({ title: '已保存', icon: 'success' });
      this.setData({
        claimSubmitting: false,
        showProfileUpgrade: false,
        showProfileUpgradeForm: false,
        currentBindMode: result.bind_mode || 'farland_profile',
      });
      this.loadHome();
    } catch (error) {
      wx.showToast({ title: '保存失败', icon: 'none' });
      this.setData({ claimSubmitting: false });
    }
  },

  async submitLegacyInviteClaim() {
    const { claimDisplayName } = this.data;
    const safeName = String(claimDisplayName || '').trim();
    if (!safeName) {
      wx.showToast({ title: '请填写称呼', icon: 'none' });
      return;
    }
    this.setData({ claimSubmitting: true });
    try {
      const result = await this.claimInvite('farland_profile', safeName);
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
      pickup_time_text: this.formatDisplayTime(summary.pickup_time_text || summary.service_date || '待确认'),
      passengers: summary.passengers || '-',
      luggage: summary.luggage || '-',
      status: summary.status || (result.has_published_quotes ? 'quoted' : 'sourcing'),
      status_text: summary.status_text || (result.has_published_quotes ? '已收到优选用车方案' : 'Farland 确认中'),
      ops_status_text: summary.ops_status_text || (result.has_published_quotes
        ? 'Farland 已为您筛选以下优选用车方案。'
        : 'Farland 正在为您确认用车方案。'),
      quoteCount: quotes.length,
      statusClass: summary.status === 'cancelled'
        ? 'cancelled'
        : (summary.status === 'assigned' || summary.status === 'confirmed' ? 'confirmed' : (result.has_published_quotes ? 'quoted' : 'pending')),
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
    this.setData({ showAdvisorQr: true });
  },

  closeAdvisorQr() {
    this.setData({ showAdvisorQr: false });
  },

  previewAdvisorQr() {
    wx.previewImage({
      urls: [this.data.advisorQrPath],
      current: this.data.advisorQrPath,
    });
  },

  noop() {},

  openTodayDetail() {
    const todayCard = this.data.todayCard;
    if (!todayCard) {
      wx.showToast({ title: '暂无今日行程', icon: 'none' });
      return;
    }
    const app = getApp();
    app.globalData.todayCardDetail = todayCard;
    wx.setStorageSync('todayCardDetail', todayCard);
    wx.navigateTo({ url: '/pages/customer/day-detail/day-detail' });
  },

  viewFullTripPlaceholder() {
    wx.showToast({ title: '完整行程即将开放', icon: 'none' });
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
