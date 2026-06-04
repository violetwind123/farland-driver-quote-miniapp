const customerHomePageConfig = {
  data: {
    loading: true,
    profile: {},
    benefits: [],
    hotelRequests: [],
    transportationAppointments: [],
    customerSummaryBar: null,
    tripProgress: null,
    progressStrip: null,
    selectedTripDayNo: 0,
    todayCard: null,
    dailyCharter: null,
    todayDriverCard: null,
    todayHotelCard: null,
    todayItinerary: null,
    showHomeEmpty: false,
    showLegacyTransport: false,
    nextConfirmed: {},
    tripOverview: [],
    tripDayCards: [],
    flightCards: [],
    hotelCards: [],
    transferRequests: [],
    primaryTransfer: null,
    transportOrders: [],
    showTransferRequests: false,
    useHomePaneSwiper: false,
    homePaneIndex: 0,
    hasCharterHomeSurface: false,
    hasTemporaryTransportSurface: false,
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
    tripInviteMode: false,
    tripInviteId: '',
    tripInviteTrip: null,
    tripInviteWaiting: false,
    tripInviteMessage: '',
    tripInviteError: '',
    tripInviteAccessSource: '',
    tripInviteAutoSaved: false,
    tripInviteAlreadySaved: false,
    tripInviteCanSave: false,
    tripInviteSaveName: '',
    tripInviteShowSaveForm: false,
    tripInviteSaving: false,
    operatorCustomerPreviewMode: false,
    operatorCustomerPreviewMeta: null,
    operatorPreviewDays: [],
    operatorPreviewFlights: [],
    hideModules: {},
  },

  onLoad(options = {}) {
    const operatorCustomerSharePreview = this.consumeOperatorCustomerSharePreview();
    if (operatorCustomerSharePreview) {
      this.applyOperatorCustomerSharePreview(operatorCustomerSharePreview);
      return;
    }
    const preview = this.consumeOperatorPreview();
    const operatorCustomerPreview = options.operator_customer_preview === '1'
      ? this.consumeOperatorCustomerHomePreview()
      : null;
    const tripInviteId = this.decodeQueryValue(options.trip_id || options.external_trip_id || options.trip_no || '');
    const inviteCode = this.decodeQueryValue(options.invite_code || '');
    if (operatorCustomerPreview) {
      this.applyOperatorCustomerHomePreview(operatorCustomerPreview);
      return;
    }
    this.setData({
      tripInviteId,
      tripInviteMode: Boolean(tripInviteId),
      inviteCode,
      inviteRequestId: tripInviteId ? '' : (options.request_id || preview.requestId || ''),
      inviteMode: Boolean(!tripInviteId && options.invite_code && options.request_id),
      operatorPreview: Boolean(!tripInviteId && preview.requestId),
    });
    this.loadHome();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    const operatorCustomerSharePreview = this.consumeOperatorCustomerSharePreview();
    if (operatorCustomerSharePreview) {
      this.applyOperatorCustomerSharePreview(operatorCustomerSharePreview);
      return;
    }
    const operatorCustomerPreview = this.consumeOperatorCustomerHomePreview();
    if (operatorCustomerPreview) {
      this.applyOperatorCustomerHomePreview(operatorCustomerPreview);
      return;
    }
    const preview = this.consumeOperatorPreview();
    if (!this.data.tripInviteMode && preview.requestId && (preview.requestId !== this.data.inviteRequestId || !this.data.operatorPreview)) {
      this.setData({
        inviteCode: '',
        inviteRequestId: preview.requestId,
        inviteMode: false,
        operatorPreview: true,
        needsInviteClaim: false,
      });
      this.loadHome();
      return;
    }
    this.scrollToPendingCustomerHomeTarget();
  },

  decodeQueryValue(value) {
    const raw = String(value || '');
    if (!raw) return '';
    try {
      return decodeURIComponent(raw);
    } catch (error) {
      return raw;
    }
  },

  consumeOperatorPreview() {
    const app = getApp();
    const preview = app.globalData && app.globalData.customerHomePreview;
    if (!preview || !preview.requestId) return {};
    delete app.globalData.customerHomePreview;
    return preview;
  },

  consumeOperatorCustomerHomePreview() {
    const app = getApp();
    const preview = app.globalData && app.globalData.operatorCustomerHomePreview;
    if (!preview || !preview.customer_home) return null;
    delete app.globalData.operatorCustomerHomePreview;
    return preview;
  },

  consumeOperatorCustomerSharePreview() {
    const app = getApp();
    const preview = app.globalData && app.globalData.operatorCustomerSharePreview;
    if (!preview || !preview.customer_share_preview) return null;
    delete app.globalData.operatorCustomerSharePreview;
    delete app.globalData.operatorCustomerHomePreview;
    return preview;
  },

  consumeCustomerHomeScrollTarget() {
    const app = getApp();
    const target = app.globalData && app.globalData.customerHomeScrollTarget;
    if (!target) return '';
    delete app.globalData.customerHomeScrollTarget;
    return target;
  },

  scrollToPendingCustomerHomeTarget() {
    const target = this.consumeCustomerHomeScrollTarget();
    if (!target) return;
    this.scrollToCustomerHomeSection(target);
  },

  scrollToCustomerHomeSection(target) {
    if (!target) return;
    setTimeout(() => {
      wx.pageScrollTo({
        selector: `#${target}`,
        duration: 300,
        fail: () => {
          wx.showToast({ title: '暂无更多信息', icon: 'none' });
        },
      });
    }, 180);
  },

  async loadHome() {
    this.setData({ loading: true, selectedTripDayNo: 0 });
    try {
      if (this.data.tripInviteMode && this.data.tripInviteId) {
        await this.loadTripInviteHome();
        return;
      }

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
          hideModules: {},
          hotelRequests: [],
          transportationAppointments: [],
          customerSummaryBar: null,
          tripProgress: null,
          progressStrip: null,
          selectedTripDayNo: 0,
          todayCard: null,
          dailyCharter: null,
          todayDriverCard: null,
          todayHotelCard: null,
          todayItinerary: null,
          showHomeEmpty: false,
          showLegacyTransport: Boolean(invitedTransfer),
          operatorCustomerPreviewMode: false,
          operatorCustomerPreviewMeta: null,
          operatorPreviewDays: [],
          operatorPreviewFlights: [],
          nextConfirmed: {
            title: invitedTransfer ? invitedTransfer.title : '用车方案准备中',
            date: invitedTransfer ? invitedTransfer.pickup_time_text : '',
            time: '',
            city: invitedTransfer ? invitedTransfer.pickup : '',
          },
          tripOverview: [],
          tripDayCards: [],
          flightCards: [],
          hotelCards: [],
          transferRequests: invitedTransfer ? [invitedTransfer] : [],
          primaryTransfer: invitedTransfer || null,
          transportOrders: [],
          showTransferRequests: Boolean(invitedTransfer),
          useHomePaneSwiper: false,
          homePaneIndex: 0,
          hasCharterHomeSurface: false,
          hasTemporaryTransportSurface: Boolean(invitedTransfer),
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
          hideModules: {},
          hotelRequests: [],
          transportationAppointments: [],
          customerSummaryBar: null,
          tripProgress: null,
          progressStrip: null,
          todayCard: null,
          dailyCharter: null,
          todayDriverCard: null,
          todayHotelCard: null,
          todayItinerary: null,
          showHomeEmpty: false,
          showLegacyTransport: Boolean(invitedTransfer),
          operatorCustomerPreviewMode: false,
          operatorCustomerPreviewMeta: null,
          operatorPreviewDays: [],
          operatorPreviewFlights: [],
          nextConfirmed: {
            title: invitedTransfer ? invitedTransfer.title : '暂无可查看行程',
            date: invitedTransfer ? invitedTransfer.pickup_time_text : '',
            time: '',
            city: invitedTransfer ? invitedTransfer.pickup : '',
          },
          tripOverview: [],
          tripDayCards: [],
          flightCards: [],
          hotelCards: [],
          transferRequests: invitedTransfer ? [invitedTransfer] : [],
          primaryTransfer: invitedTransfer || null,
          transportOrders: [],
          showTransferRequests: Boolean(invitedTransfer),
          useHomePaneSwiper: false,
          homePaneIndex: 0,
          hasCharterHomeSurface: false,
          hasTemporaryTransportSurface: Boolean(invitedTransfer),
          charterServices: [],
          advisorPhone: '',
          currentBindMode: 'temporary_invite',
          showProfileUpgrade: Boolean(invitedTransfer),
        });
        return;
      }
      const hideModules = result.hide_modules || {};
      const customerSummaryBar = this.normalizeCustomerSummaryBar(result);
      const tripProgress = this.normalizeDailyProgress(result.trip_progress || result.progress_strip || null, result);
      const progressStrip = tripProgress;
      const dailyCharter = this.normalizeDailyCharter(result.daily_charter || null);
      const todayCard = this.normalizeTodayCard((dailyCharter && dailyCharter.today_card) || result.today_card || null);
      const hasCharterContract = Boolean(result.daily_charter || result.today_driver_card || result.hide_modules);
      const todayDriverCard = hasCharterContract
        ? this.normalizeTodayDriverCard(result.today_driver_card || null)
        : this.buildTodayDriverCard(todayCard);
      const todayHotelCard = this.normalizeTodayHotelCard(result.today_hotel_card || null) || this.buildTodayHotelCard(todayCard);
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
      const tripDayCards = this.normalizeHomeDayCards(result.daily_summary_cards || [], result.itinerary_days || []);
      const flightCards = this.normalizeHomeFlightCards(result.flight_cards || []);
      const transferRequests = (result.transfer_requests || [])
        .filter((request) => (request.service_type || 'transfer') !== 'charter')
        .map((request) => ({
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
      const transportOrders = (result.transport_orders || [])
        .filter((order) => (order.service_type || 'transfer') !== 'charter' && !/包车/.test(order.title || ''))
        .map((order) => ({
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
      );
      const showHomeEmpty = !todayCard
        && !todayItinerary
        && !tripOverview.length
        && !tripDayCards.length
        && !flightCards.length
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
      const hasCharterHomeSurface = Boolean(!showHomeEmpty && (
        tripProgress
        || todayDriverCard
        || todayCard
        || todayItinerary
        || todayHotelCard
        || tripDayCards.length
        || flightCards.length
      ));
      const hasTemporaryTransportSurface = Boolean(mergedTransferRequests.length || transportOrders.length);
      const useHomePaneSwiper = hasCharterHomeSurface && hasTemporaryTransportSurface;
      this.cacheTripDetailContext(tripDayCards, {
        trip_id: tripOverview[0] ? (tripOverview[0].trip_id || '') : '',
        trip_no: tripOverview[0] ? (tripOverview[0].trip_no || '') : '',
        overview: tripOverview[0] || {},
      });
      this.setData({
        loading: false,
        needsInviteClaim: false,
        profile: result.profile || {},
        currentBindMode: result.bind_mode || '',
        showProfileUpgrade: this.data.inviteMode && result.bind_mode !== 'farland_profile',
        showProfileUpgradeForm: this.data.showProfileUpgradeForm && result.bind_mode !== 'farland_profile',
        benefits: hideModules.benefits ? [] : (result.benefits || []),
        topBenefits: hideModules.benefits ? [] : (result.benefits || []).slice(0, 2),
        hideModules,
        hotelRequests: result.hotel_requests || [],
        transportationAppointments: result.transportation_appointments || [],
        customerSummaryBar,
        tripProgress,
        progressStrip,
        selectedTripDayNo: (tripProgress && (tripProgress.selected_day_no || tripProgress.current_day_no)) || 0,
        todayCard,
        dailyCharter,
        todayDriverCard,
        todayHotelCard,
        todayItinerary,
        showHomeEmpty,
        showLegacyTransport: !hideModules.legacy_transport && !todayCard && !showHomeEmpty && hasTransport,
        operatorCustomerPreviewMode: false,
        operatorCustomerPreviewMeta: null,
        operatorPreviewDays: [],
        operatorPreviewFlights: [],
        nextConfirmed,
        tripOverview,
        tripDayCards,
        flightCards,
        hotelCards,
        transferRequests: mergedTransferRequests,
        primaryTransfer: mergedTransferRequests[0] || null,
        transportOrders,
        showTransferRequests: Boolean(mergedTransferRequests.length || transportOrders.length),
        useHomePaneSwiper,
        homePaneIndex: useHomePaneSwiper ? Math.min(Number(this.data.homePaneIndex || 0), 1) : 0,
        hasCharterHomeSurface,
        hasTemporaryTransportSurface,
        charterServices: result.charter_services || [],
        advisorPhone: hideModules.advisor_panel
          ? ''
          : ((todayCard && todayCard.advisor && todayCard.advisor.phone)
            || (todayItinerary && todayItinerary.farland_contact ? todayItinerary.farland_contact.phone : '')),
      });
      this.scrollToPendingCustomerHomeTarget();
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

  onHomePaneChange(e) {
    const current = Number(e.detail && e.detail.current ? e.detail.current : 0);
    this.setData({ homePaneIndex: current });
  },

  switchHomePane(e) {
    const index = Number(e.currentTarget.dataset.index || 0);
    this.setData({ homePaneIndex: index });
  },

  toDateKey(value) {
    const text = String(value || '');
    const match = text.match(/\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : '';
  },

  getTodayDateKey() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  },

  resolveInitialTripDayNo(days, preferredDayNo = 0) {
    const sourceDays = (Array.isArray(days) ? days : [])
      .map((day, index) => ({
        dayNo: Number(day.dayNo || day.day_no || index + 1),
        dateKey: this.toDateKey(day.date),
      }))
      .filter((day) => day.dayNo);
    if (!sourceDays.length) return 0;

    const preferred = Number(preferredDayNo || 0);
    if (preferred && sourceDays.some((day) => day.dayNo === preferred)) return preferred;

    const todayKey = this.getTodayDateKey();
    const today = sourceDays.find((day) => day.dateKey && day.dateKey === todayKey);
    if (today) return today.dayNo;
    const next = sourceDays.find((day) => day.dateKey && day.dateKey > todayKey);
    if (next) return next.dayNo;
    return sourceDays[sourceDays.length - 1].dayNo;
  },

  decorateTripProgressNodes(nodes, selectedDayNo = 0, currentDayNo = 0) {
    const todayKey = this.getTodayDateKey();
    const selected = Number(selectedDayNo || 0);
    const current = Number(currentDayNo || 0);
    return (Array.isArray(nodes) ? nodes : []).map((node, index) => {
      const dayNo = Number(node.day_no || node.dayNo || index + 1);
      const dateKey = this.toDateKey(node.date);
      const isPast = Boolean(dateKey && todayKey && dateKey < todayKey);
      const isToday = Boolean(dateKey && todayKey && dateKey === todayKey);
      const isSelected = Boolean(selected && dayNo === selected);
      const rawStatus = ['completed', 'current', 'upcoming'].includes(node.status) ? node.status : 'upcoming';
      const isCurrentDay = isToday || Boolean(current && dayNo === current);
      const status = isPast ? 'completed' : (isCurrentDay ? 'current' : (rawStatus === 'completed' ? 'completed' : 'upcoming'));
      return {
        ...node,
        day_no: dayNo,
        status,
        isPast,
        isToday,
        isSelected,
        selected: isSelected,
        selectable: true,
        statusText: isSelected
          ? '已选择'
          : (isPast ? '已过去' : (isToday ? '今天' : (status === 'current' ? '当前' : (status === 'completed' ? '已完成' : '待前往')))),
      };
    });
  },

  normalizeCustomerSummaryBar(result = {}) {
    const bar = result.customer_summary_bar || {};
    const profile = result.profile || {};
    const overview = (result.trip_overview || [])[0] || {};
    const todayCard = result.today_card || {};
    const dayCount = overview.days_count
      || (Array.isArray(result.itinerary_days) ? result.itinerary_days.length : 0)
      || (Array.isArray(result.daily_summary_cards) ? result.daily_summary_cards.length : 0);
    const tripSummaryText = bar.trip_summary_text
      || overview.summary_text
      || (dayCount ? `${dayCount}天行程` : '');
    return {
      visible: bar.visible !== false,
      customer_display_name: bar.customer_display_name || profile.name || result.customer_name || 'Farland 客户',
      trip_no: bar.trip_no || todayCard.trip_no || overview.trip_no || overview.external_trip_id || '',
      date_range_text: bar.date_range_text || overview.date_range_text || '',
      trip_summary_text: tripSummaryText,
      thank_you_text: bar.thank_you_text || '感谢您使用 Farland 的服务',
      sync_status_text: bar.sync_status_text || '行程已同步',
      communication_note: bar.communication_note || '后续沟通请以客户群为准',
    };
  },

  normalizeDailyProgress(strip, result = {}) {
    const sourceNodes = strip && Array.isArray(strip.nodes) ? strip.nodes : [];
    let nodes = sourceNodes.map((node, index) => ({
      ...node,
      node_id: node.node_id || node.id || `day_${node.day_no || index + 1}`,
      type: node.type || 'trip_day',
      day_no: Number(node.day_no || index + 1),
      label: node.label || `Day ${node.day_no || index + 1}`,
      date: node.date || '',
      weekday: node.weekday || '',
      location_summary: node.location_summary || node.city || node.summary || '',
      status: ['completed', 'current', 'upcoming'].includes(node.status) ? node.status : 'upcoming',
    })).filter((node) => node.label && (node.location_summary || node.day_no));

    if (nodes.length < 2) {
      const dayDetails = Array.isArray(result.itinerary_days) ? result.itinerary_days : [];
      const summaryCards = Array.isArray(result.daily_summary_cards) ? result.daily_summary_cards : [];
      const sourceDays = dayDetails.length ? dayDetails : summaryCards;
      nodes = sourceDays.map((day, index) => {
        const dayNo = Number(day.day_no || index + 1);
        const locationSummary = day.location_summary || day.city || day.city_summary || day.route_label || day.title || '';
        return {
          node_id: `day_${dayNo}`,
          type: 'trip_day',
          day_no: dayNo,
          label: `Day ${dayNo}`,
          date: day.date || '',
          weekday: day.weekday || '',
          location_summary: String(locationSummary || '').replace(/^Day\s+\d+\s*[:：-]?\s*/i, ''),
          status: 'upcoming',
        };
      }).filter((node) => node.day_no && node.location_summary);
    }

    if (nodes.length < 2) return null;
    const currentDayNo = Number((strip && strip.current_day_no) || (result.today_card && result.today_card.day_no) || nodes[0].day_no);
    const selectedDayNo = this.resolveInitialTripDayNo(nodes, this.data.selectedTripDayNo || currentDayNo);
    let currentIndex = nodes.findIndex((node) => Number(node.day_no || 0) === currentDayNo);
    if (currentIndex < 0) currentIndex = 0;
    nodes = nodes.map((node, index) => ({
      ...node,
      status: index < currentIndex ? 'completed' : (index === currentIndex ? 'current' : 'upcoming'),
      statusText: index < currentIndex ? '已完成' : (index === currentIndex ? '当前' : '待前往'),
      location_summary: node.location_summary || '行程同步中',
    }));
    nodes = this.decorateTripProgressNodes(nodes, selectedDayNo, currentDayNo);
    return {
      ...(strip || {}),
      visible: true,
      mode: 'daily_nodes',
      current_day_no: currentDayNo,
      selected_day_no: selectedDayNo,
      actual_current_day_no: currentDayNo,
      current_node_id: (nodes.find((node) => Number(node.day_no || 0) === Number(currentDayNo)) || nodes[currentIndex]).node_id,
      nodes,
    };
  },

  normalizeProgressStrip(strip) {
    if (!strip || !Array.isArray(strip.nodes) || !strip.nodes.length) return null;
    const nodes = strip.nodes.map((node, index) => ({
      ...node,
      node_id: node.node_id || `${node.label || 'node'}-${index}`,
      label: node.label || '',
      status: ['completed', 'current', 'upcoming'].includes(node.status) ? node.status : 'upcoming',
      statusText: node.status === 'current' ? '当前' : (node.status === 'completed' ? '已完成' : '待前往'),
    })).filter((node) => node.label);
    if (!nodes.length) return null;
    return {
      ...strip,
      nodes,
    };
  },

  normalizeDailyCharter(charter) {
    if (!charter || !charter.visible) return null;
    return {
      ...charter,
      destination_cards: Array.isArray(charter.destination_cards) ? charter.destination_cards : [],
      today_card: charter.today_card || null,
    };
  },

  normalizeTodayDriverCard(card) {
    if (!card || !card.visible) return null;
    const isAssigned = card.status === 'assigned';
    const driver = isAssigned
      ? this.normalizeAssignedDriver({
          name: card.driver_name,
          phone: card.driver_phone,
          vehicle_model: card.vehicle_summary,
        })
      : null;
    return {
      title: '今日司机',
      statusText: isAssigned ? '已分配司机' : '司机信息待同步',
      statusClass: isAssigned ? 'confirmed' : 'pending',
      departureTime: this.formatDisplayTime(card.departure_time || '') || '待确认',
      vehicleSummary: card.vehicle_summary || '车辆待确认',
      partySummary: card.party_summary || '',
      driver,
      helperText: isAssigned ? '' : (card.helper_text || '司机信息将在出发前同步。'),
      requestId: card.request_id || '',
      actionLabel: isAssigned ? (card.cta_label || '查看用车详情') : '',
      actionType: isAssigned ? 'detail' : 'none',
    };
  },

  buildPublishedTripTodayDriverCard(todayDay, snapshot = {}) {
    if (!todayDay) return null;
    const summary = todayDay.transportSummary || {};
    const explicit = snapshot.today_driver_card || snapshot.todayDriverCard || {};
    const rawDriver = explicit.driver
      || explicit.assigned_transport
      || summary.driver
      || summary.assigned_transport
      || {
        name: explicit.driver_name || summary.driver_name || '',
        phone: explicit.driver_phone || summary.driver_phone || '',
        vehicle_model: explicit.vehicle_model || summary.vehicle_model || explicit.vehicle_summary || summary.vehicle_summary || '',
        vehicle_type: explicit.vehicle_type || summary.vehicle_type || summary.vehicle_class || '',
        plate_number: explicit.plate_number || summary.plate_number || '',
      };
    const driver = this.normalizeAssignedDriver(rawDriver);
    const driverVisibility = explicit.driver_visibility || summary.driver_visibility || (driver && (driver.name || driver.phone) ? 'assigned' : 'pending');
    const isAssigned = driverVisibility === 'assigned' && driver;
    return {
      title: '当日用车',
      statusText: isAssigned ? '已分配司机' : (explicit.status_text || summary.status_text || '司机信息待同步'),
      statusClass: isAssigned ? 'confirmed' : 'pending',
      departureTime: this.formatDisplayTime(explicit.departure_time || summary.departure_time || summary.depart_time || todayDay.startTime || '') || '待确认',
      vehicleSummary: explicit.vehicle_summary
        || summary.vehicle_summary
        || summary.vehicle_model
        || summary.vehicle_class
        || todayDay.transportBadge
        || (driver ? driver.vehicleText : '')
        || '车辆待确认',
      partySummary: explicit.party_summary || summary.party_summary || '',
      driver: isAssigned ? driver : null,
      helperText: isAssigned ? '' : (explicit.helper_text || summary.helper_text || '司机信息确认后会同步到这里；如需调整请在客户群沟通。'),
      requestId: explicit.request_id || summary.request_id || '',
      actionLabel: isAssigned ? (explicit.cta_label || summary.cta_label || '') : '',
      actionType: isAssigned ? 'detail' : 'none',
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
      routeStops: destinationCards.slice(0, 3).map((item) => ({
        id: item.card_id,
        time: item.time,
        title: item.title,
      })),
      nodeCount: destinationCards.length,
      extraNodeCount: Math.max(0, destinationCards.length - 3),
      hotel,
      advisor: card.advisor || {},
      driver: driverAssigned ? normalizedDriver : null,
      driverPendingText: driverAssigned ? '' : '司机信息将在 Farland 完成确认后同步。',
    };
  },

  buildTodayDriverCard(todayCard) {
    if (!todayCard) return null;
    const driver = todayCard.driver || null;
    const isAssigned = Boolean(driver);
    const shouldOpenTransfer = Boolean(todayCard.assigned_request_id && todayCard.service_type !== 'charter');
    return {
      title: todayCard.service_type === 'transfer' ? '今日接送安排' : '今日司机与车辆',
      statusText: isAssigned ? '已分配司机' : (todayCard.transportStatusText || '司机信息待同步'),
      statusClass: isAssigned ? 'confirmed' : 'pending',
      departureTime: todayCard.serviceWindowText || todayCard.depart_time || '待确认',
      vehicleSummary: todayCard.vehicle_summary || '车辆待确认',
      partySummary: todayCard.party_summary || '',
      driver,
      helperText: isAssigned ? '' : (todayCard.driverPendingText || '司机信息确认后会同步到这里；如需调整请在客户群沟通。'),
      requestId: todayCard.assigned_request_id || '',
      actionLabel: isAssigned ? (shouldOpenTransfer ? '查看接送详情' : '查看用车详情') : '',
      actionType: isAssigned ? (shouldOpenTransfer ? 'transfer' : 'detail') : 'none',
    };
  },

  normalizeTodayHotelCard(card) {
    if (!card || card.visible === false) return null;
    const metaParts = [card.group, card.brand, card.star_rating ? `${card.star_rating}星` : ''].filter(Boolean);
    return {
      ...card,
      visible: true,
      hotel_id: card.hotel_id || card.id || '',
      name: card.name || card.hotel_name || '当晚住宿',
      metaText: metaParts.join(' · '),
      arrivalText: card.arrival_time ? `预计 ${this.formatDisplayTime(card.arrival_time)} 抵达` : '抵达时间待同步',
      dateText: card.date_text || [card.check_in_date || '', card.check_out_date || ''].filter(Boolean).join(' - '),
      roomSummary: card.room_summary || card.room_type || '',
      statusText: card.status_text || '已同步',
      note: card.note || '完整酒店信息将由 Farland 顾问同步。',
    };
  },

  buildTodayHotelCard(todayCard) {
    if (!todayCard || !todayCard.hotel) return null;
    const hotel = todayCard.hotel;
    const metaParts = [hotel.group, hotel.brand, hotel.star_rating ? `${hotel.star_rating}星` : ''].filter(Boolean);
    return {
      visible: true,
      hotel_id: hotel.hotel_id || hotel.id || '',
      name: hotel.name || hotel.hotel_name || '当晚住宿',
      group: hotel.group || '',
      brand: hotel.brand || '',
      star_rating: hotel.star_rating || '',
      metaText: metaParts.join(' · '),
      city: hotel.city || '',
      address: hotel.address || '',
      check_in_date: hotel.check_in_date || hotel.date || todayCard.date || '',
      check_out_date: hotel.check_out_date || '',
      dateText: hotel.date_text || [hotel.check_in_date || hotel.date || todayCard.date || '', hotel.check_out_date || ''].filter(Boolean).join(' - '),
      arrival_time: hotel.arrival_time || '',
      arrivalText: hotel.arrival_time ? `预计 ${hotel.arrival_time} 抵达` : '抵达时间待同步',
      roomSummary: hotel.room_summary || hotel.room_type || '',
      statusText: hotel.status_text || '已同步',
      note: hotel.note || hotel.customer_note || '完整酒店信息将由 Farland 顾问同步。',
    };
  },

  normalizeTodayItinerary(itinerary) {
    if (!itinerary) return null;
    const items = Array.isArray(itinerary.items) && itinerary.items.length
      ? itinerary.items
      : (Array.isArray(itinerary.timeline_items) ? itinerary.timeline_items : []);
    return {
      ...itinerary,
      items: items.map((item) => ({
        ...item,
        time: this.formatDisplayTime(item.time || item.planned_start_time || item.planned_arrival_time || ''),
        description: item.description || [item.location_name || item.location || '', item.drive_time_text || item.drive_time || '', item.distance_text || item.distance || ''].filter(Boolean).join(' · '),
      })),
    };
  },

  normalizeHomeFlightCards(flights) {
    return (Array.isArray(flights) ? flights : []).map((flight, index) => ({
      id: flight.flight_id || flight.id || `${flight.flight_no || flight.flight_number || 'flight'}-${index}`,
      title: flight.flight_no || flight.flight_number || flight.title || '航班安排',
      route: flight.route || [flight.from || flight.origin || flight.departure_airport || '', flight.to || flight.destination || flight.arrival_airport || ''].filter(Boolean).join(' → '),
      timeText: [
        this.formatDisplayTime(flight.departure_time || flight.depart_at || ''),
        this.formatDisplayTime(flight.arrival_time || flight.arrive_at || ''),
      ].filter(Boolean).join(' - '),
      aircraft: flight.aircraft || '',
      note: flight.customer_note || flight.note || '',
    }));
  },

  normalizeHomeDayCards(summaryCards, itineraryDays) {
    const dayDetails = Array.isArray(itineraryDays) ? itineraryDays : [];
    const cards = Array.isArray(summaryCards) && summaryCards.length
      ? summaryCards
      : dayDetails.map((day, index) => ({
        id: day.id || `day_${day.day_no || index + 1}`,
        day_no: day.day_no || index + 1,
        date: day.date || '',
        weekday: day.weekday || '',
        title: day.title || `Day ${day.day_no || index + 1}`,
        city: day.city || '',
        start_time_text: day.start_time_text || day.estimated_departure_time || day.displayed_start_time || '',
        hotel_badge: day.hotel ? (day.hotel.name || day.hotel.hotel_name || '') : '',
        transport_badge: day.transport_summary ? (day.transport_summary.title || day.transport_summary.vehicle_summary || '') : '',
        highlight_items: (day.timeline_items || []).map((item) => item.title).filter(Boolean).slice(0, 2),
        item_count: (day.timeline_items || []).length,
        clickable: true,
      }));
    return cards.map((card, index) => {
      const detail = dayDetails.find((day) => Number(day.day_no || 0) === Number(card.day_no || index + 1)) || {};
      const normalizedDetail = this.normalizePublishedTripDay({
        ...detail,
        summary_card: card,
      }, index);
      return {
        ...normalizedDetail,
        id: card.id || normalizedDetail.id,
        dayNo: card.day_no || normalizedDetail.dayNo,
        date: card.date || normalizedDetail.date,
        weekday: card.weekday || normalizedDetail.weekday,
        title: card.title || normalizedDetail.title,
        city: card.city || normalizedDetail.city,
        startTime: this.formatDisplayTime(card.start_time_text || normalizedDetail.startTime || ''),
        hotelBadge: card.hotel_badge || normalizedDetail.hotelBadge,
        transportBadge: card.transport_badge || normalizedDetail.transportBadge,
        highlightItems: Array.isArray(card.highlight_items) ? card.highlight_items : normalizedDetail.highlightItems,
        itemCount: card.item_count || normalizedDetail.timelineItems.length,
        clickable: card.clickable !== false,
      };
    });
  },

  buildTodayCardFromTripDay(day, context = {}) {
    if (!day) return null;
    const overview = context.overview || {};
    const tripNo = context.trip_no || overview.trip_no || (this.data.tripInviteTrip && this.data.tripInviteTrip.displayTripNo) || '';
    const tripId = context.trip_id || overview.trip_id || this.data.tripInviteId || '';
    const dayNo = Number(day.dayNo || day.day_no || 1);
    const routeStops = (day.timelineItems || []).slice(0, 3).map((item, index) => ({
      id: item.id || `${dayNo}-${index}`,
      time: item.time || '',
      title: item.title || '行程节点',
    }));
    const timelineItems = (day.timelineItems || []).map((item, index) => ({
      id: item.id || `${dayNo}-${index}`,
      item_id: item.id || `${dayNo}-${index}`,
      type: item.type || item.item_type || 'custom',
      time: item.time || '',
      title: item.title || '行程节点',
      location: item.location || item.location_name || '',
      route: item.route || '',
      drive_time: item.driveText || item.drive_time_text || '',
      distance: item.distanceText || item.distance_text || '',
      traffic_level: item.trafficText || item.traffic_text || '',
      note: item.note || item.customer_note || '',
      arrival_estimate: item.arrival_estimate || '',
      next_stop: item.next_stop || '',
      latitude: item.latitude || item.lat || item.map_latitude || '',
      longitude: item.longitude || item.lng || item.map_longitude || '',
      map_url: item.map_url || '',
    }));
    return {
      trip_id: tripId,
      trip_no: tripNo,
      day_no: dayNo,
      dayNo,
      dayLabel: tripNo ? `Trip ${tripNo} · Day ${dayNo}` : `Day ${dayNo}`,
      date: day.date || '',
      weekday: day.weekday || '',
      dateRouteText: [day.weekday || '', day.date || '', day.city || overview.city_summary || overview.city_route_text || ''].filter(Boolean).join(' · '),
      status_text: day.hasTimeConflict ? '待复核' : '已确认',
      title: day.title || `Day ${dayNo}`,
      city: day.city || overview.city_summary || overview.city_route_text || '',
      city_summary: day.city || overview.city_summary || overview.city_route_text || '',
      sectionTitle: `Day ${dayNo} 行程概览`,
      service_type: day.transportSummary && day.transportSummary.service_type ? day.transportSummary.service_type : 'charter',
      startTime: day.startTime || '',
      depart_time: day.startTime || '',
      service_window: day.startTime ? { label: `${day.startTime} 出发` } : null,
      vehicle_summary: day.transportBadge || (day.transportSummary && (day.transportSummary.vehicle_summary || day.transportSummary.vehicle_class)) || '车辆待确认',
      party_summary: day.transportSummary && day.transportSummary.party_summary ? day.transportSummary.party_summary : '',
      transport_summary: day.transportSummary || (day.transportBadge ? { title: day.transportBadge } : null),
      driver_visibility: 'pending',
      routeStops,
      timeline_items: timelineItems,
      destination_cards: timelineItems.map((item, index) => ({
        ...item,
        card_id: item.card_id || item.id || `${dayNo}-${index}`,
        sequence: index + 1,
        chipLabel: `${item.time || ''} ${item.title || ''}`.trim(),
      })),
      nodeCount: (day.timelineItems || []).length,
      extraNodeCount: Math.max(0, (day.timelineItems || []).length - 3),
      hotel: day.hotel ? {
        ...day.hotel,
        name: day.hotel.name || day.hotel.hotel_name || day.hotel.title || day.hotelBadge || '酒店安排',
      } : (day.hotelBadge ? { name: day.hotelBadge, arrival_time: '', address: '' } : null),
      advisor: context.advisor || {},
    };
  },

  findHotelForTripDay(day, hotels) {
    if (!day) return null;
    if (day.hotel) {
      return {
        ...day.hotel,
        name: day.hotel.name || day.hotel.hotel_name || day.hotel.title || day.hotelBadge || '酒店安排',
        linkedDayNo: Number(day.hotel.linked_day_no || day.dayNo || day.day_no || 0),
      };
    }
    const dayNo = Number(day.dayNo || day.day_no || 0);
    const sourceHotels = Array.isArray(hotels) ? hotels : [];
    return sourceHotels.find((hotel) => Number(hotel.linkedDayNo || hotel.linked_day_no || hotel.day_no || 0) === dayNo)
      || null;
  },

  buildTodayItineraryFromTripDay(day, overview = {}) {
    if (!day) return null;
    return {
      date: [day.weekday || '', day.date || ''].filter(Boolean).join(' · '),
      city: day.city || overview.city_summary || overview.city_route_text || '',
      title: day.title || `Day ${day.dayNo || day.day_no || 1}`,
      summary: day.summary || (day.startTime ? `预计出发：${day.startTime}` : ''),
      items: (day.timelineItems || []).map((item) => ({
        time: item.time || '',
        title: item.title || '行程节点',
        description: [item.location || '', item.driveText || '', item.trafficText || '', item.note || ''].filter(Boolean).join(' · '),
      })),
      farland_contact: {
        name: 'Farland 顾问',
        phone: this.data.advisorPhone || '',
      },
      driver_visibility: 'pending',
    };
  },

  buildSelectedHomeDayState(dayNo) {
    const sourceDays = this.data.tripDayCards && this.data.tripDayCards.length
      ? this.data.tripDayCards
      : (this.data.operatorPreviewDays || []);
    const selectedDayNo = this.resolveInitialTripDayNo(sourceDays, dayNo);
    const selectedDay = sourceDays.find((day) => Number(day.dayNo || day.day_no || 0) === selectedDayNo) || sourceDays[0] || null;
    const overview = (this.data.tripOverview || [])[0] || {};
    const tripProgress = this.data.tripProgress || this.data.progressStrip || null;
    const actualCurrentDayNo = Number(
      (tripProgress && (tripProgress.actual_current_day_no || tripProgress.actualCurrentDayNo || tripProgress.current_day_no))
      || this.resolveInitialTripDayNo(sourceDays),
    );
    const nodes = tripProgress && Array.isArray(tripProgress.nodes)
      ? this.decorateTripProgressNodes(tripProgress.nodes, selectedDayNo, actualCurrentDayNo)
      : [];
    const nextProgress = tripProgress ? {
      ...tripProgress,
      current_day_no: actualCurrentDayNo,
      selected_day_no: selectedDayNo,
      actual_current_day_no: actualCurrentDayNo,
      current_node_id: (nodes.find((node) => Number(node.day_no || 0) === actualCurrentDayNo) || nodes[0] || {}).node_id || '',
      nodes,
    } : null;
    const todayCard = selectedDay ? this.buildTodayCardFromTripDay(selectedDay, {
      trip_id: overview.trip_id || this.data.tripInviteId || '',
      trip_no: overview.trip_no || '',
      overview,
    }) : this.data.todayCard;
    const todayDriverCard = selectedDay ? this.buildPublishedTripTodayDriverCard(selectedDay, {}) : this.data.todayDriverCard;
    if (todayDriverCard && selectedDayNo) {
      todayDriverCard.title = `Day ${selectedDayNo} 用车`;
      todayDriverCard.sectionTitle = `Day ${selectedDayNo} 用车`;
    }
    const selectedHotel = this.findHotelForTripDay(selectedDay, this.data.hotelCards || []);
    const todayHotelCard = selectedHotel ? this.normalizeTodayHotelCard({
      ...selectedHotel,
      visible: true,
      hotel_id: selectedHotel.hotel_id || selectedHotel.id,
      sectionTitle: `Day ${selectedDayNo} 住宿`,
    }) : null;
    return {
      selectedTripDayNo: selectedDayNo,
      tripProgress: nextProgress,
      progressStrip: nextProgress,
      todayCard,
      todayDriverCard,
      todayHotelCard,
      todayItinerary: selectedDay ? this.buildTodayItineraryFromTripDay(selectedDay, overview) : this.data.todayItinerary,
    };
  },

  selectTripProgressDay(e) {
    const dayNo = Number(e.currentTarget.dataset.dayNo || 0);
    const source = e.currentTarget.dataset.source || 'home';
    if (!dayNo) return;

    if (source === 'invite') {
      const trip = this.data.tripInviteTrip;
      if (!trip || !Array.isArray(trip.days) || !trip.days.length) return;
      this.setData({
        tripInviteTrip: this.applySelectedDayToPublishedTrip(trip, dayNo),
        selectedTripDayNo: dayNo,
      });
      return;
    }

    const nextState = this.buildSelectedHomeDayState(dayNo);
    if (!nextState || !nextState.selectedTripDayNo) return;
    this.setData(nextState);
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

  async loadTripInviteHome() {
    this.setData({
      loading: true,
      tripInviteError: '',
      tripInviteWaiting: false,
      tripInviteMessage: '',
      operatorCustomerPreviewMode: false,
      operatorCustomerPreviewMeta: null,
      operatorPreviewDays: [],
      operatorPreviewFlights: [],
    });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getCustomerTripByInvite',
        data: {
          trip_id: this.data.tripInviteId,
          invite_code: this.data.inviteCode,
        },
      });

      if (!result || !result.success) {
        this.setData({
          loading: false,
          tripInviteTrip: null,
          tripInviteWaiting: false,
          tripInviteError: (result && result.message) || '该行程链接无效或已失效，请联系 Farland 顾问。',
          tripInviteCanSave: false,
        });
        return;
      }

      if (result.waiting) {
        this.setData({
          loading: false,
          tripInviteTrip: null,
          tripInviteWaiting: true,
          tripInviteMessage: result.message || 'Farland 顾问正在为您核对行程安排，确认后将在这里显示。',
          tripInviteError: '',
          tripInviteAccessSource: result.access_source || '',
          tripInviteAutoSaved: Boolean(result.auto_saved),
          tripInviteAlreadySaved: Boolean(result.already_saved),
          tripInviteCanSave: false,
          selectedTripDayNo: 0,
          needsInviteClaim: false,
        });
        return;
      }

      const trip = this.normalizePublishedTrip(result.trip || {});
      this.cacheTripDetailContext(trip.days, {
        trip_id: this.data.tripInviteId,
        trip_no: trip.displayTripNo,
        overview: {
          trip_id: this.data.tripInviteId,
          trip_no: trip.displayTripNo,
          city_summary: trip.displayCity,
        },
      });
      this.setData({
        loading: false,
        tripInviteTrip: trip,
        tripInviteWaiting: false,
        tripInviteMessage: '',
        tripInviteError: '',
        tripInviteAccessSource: result.access_source || '',
        tripInviteAutoSaved: Boolean(result.auto_saved),
        tripInviteAlreadySaved: Boolean(result.already_saved),
        tripInviteCanSave: Boolean(result.can_save_to_profile),
        selectedTripDayNo: trip.selectedDayNo || 0,
        tripInviteShowSaveForm: false,
        needsInviteClaim: false,
        profile: {
          name: trip.displayCustomer || 'Farland 行程',
          member_level: result.auto_saved || result.already_saved ? '已同步' : '临时查看',
          points_balance: 0,
          subtitle: result.auto_saved || result.already_saved
            ? '已同步到我的 Farland 行程'
            : 'Farland 顾问已为您整理本次行程',
        },
        advisorPhone: trip.advisorPhone || '',
      });
      this.scrollToPendingCustomerHomeTarget();
    } catch (error) {
      console.error('[customer-home] getCustomerTripByInvite failed', error);
      this.setData({
        loading: false,
        tripInviteTrip: null,
        tripInviteWaiting: false,
        tripInviteError: '该行程链接无效或已失效，请联系 Farland 顾问。',
        tripInviteCanSave: false,
      });
    }
  },

  applySelectedDayToPublishedTrip(trip, preferredDayNo = 0) {
    if (!trip || !Array.isArray(trip.days) || !trip.days.length) return trip;
    const selectedDayNo = this.resolveInitialTripDayNo(trip.days, preferredDayNo || trip.selectedDayNo || 0);
    const actualCurrentDayNo = Number(
      trip.actualCurrentDayNo
      || trip.actual_current_day_no
      || this.resolveInitialTripDayNo(trip.days),
    );
    const selectedDay = trip.days.find((day) => Number(day.dayNo || day.day_no || 0) === selectedDayNo) || trip.days[0] || null;
    const overview = {
      trip_id: trip.trip_id || trip.external_trip_id || this.data.tripInviteId || '',
      trip_no: trip.displayTripNo || trip.trip_no || '',
      city_summary: trip.displayCity || trip.city || '',
    };
    const progressNodes = this.decorateTripProgressNodes(
      trip.progressNodes || [],
      selectedDayNo,
      actualCurrentDayNo,
    );
    const todayDriverCard = selectedDay ? this.buildPublishedTripTodayDriverCard(selectedDay, trip) : null;
    if (todayDriverCard) {
      todayDriverCard.title = `Day ${selectedDayNo} 用车`;
      todayDriverCard.sectionTitle = `Day ${selectedDayNo} 用车`;
    }
    const selectedHotel = this.findHotelForTripDay(selectedDay, trip.hotels || []);
    const todayHotelCard = selectedHotel ? this.normalizeTodayHotelCard({
      ...selectedHotel,
      visible: true,
      hotel_id: selectedHotel.hotel_id || selectedHotel.id,
      sectionTitle: `Day ${selectedDayNo} 住宿`,
    }) : null;

    return {
      ...trip,
      selectedDayNo,
      selected_day_no: selectedDayNo,
      currentDayNo: actualCurrentDayNo,
      actualCurrentDayNo,
      progressNodes,
      todayDriverCard,
      todayOverviewCard: selectedDay ? this.buildTodayCardFromTripDay(selectedDay, overview) : null,
      todayHotelCard,
    };
  },

  normalizePublishedTrip(snapshot) {
    const hero = snapshot.hero || {};
    const customer = snapshot.customer || {};
    const advisor = snapshot.advisor || {};
    const tripSummary = snapshot.trip_summary || {};
    const dailySummaryCards = Array.isArray(snapshot.daily_summary_cards) ? snapshot.daily_summary_cards : [];
    const daysSource = Array.isArray(snapshot.itinerary_days)
      ? snapshot.itinerary_days
      : (Array.isArray(snapshot.days) ? snapshot.days : []);
    const hotelsSource = [
      ...(Array.isArray(snapshot.hotel_cards) ? snapshot.hotel_cards : []),
      ...(Array.isArray(snapshot.hotels) ? snapshot.hotels : []),
      ...(Array.isArray(snapshot.hotel_requests) ? snapshot.hotel_requests : []),
      ...daysSource.map((day, index) => {
        if (!day || !day.hotel) return null;
        return {
          ...day.hotel,
          check_in_date: day.hotel.check_in_date || day.hotel.date || day.date || '',
          linked_day_no: day.hotel.linked_day_no || day.day_no || index + 1,
          city: day.hotel.city || day.city || '',
        };
      }).filter(Boolean),
    ];
    const flightsSource = [
      ...(Array.isArray(snapshot.flight_cards) ? snapshot.flight_cards : []),
      ...(Array.isArray(snapshot.flights) ? snapshot.flights : []),
    ];
    daysSource.forEach((day) => {
      const timelineItems = Array.isArray(day.timeline_items)
        ? day.timeline_items
        : (Array.isArray(day.items) ? day.items : []);
      timelineItems.forEach((item) => {
        const itemType = item.item_type || item.type || '';
        const title = String(item.title || '');
        const routeText = String(item.route || `${item.from || item.origin || item.departure_airport || ''} → ${item.to || item.destination || item.arrival_airport || ''}`);
        const hasFlightSignal = itemType === 'flight'
          || item.flight_no
          || item.flight_number
          || /\b[A-Z]{2}\d{2,4}\b/.test(title)
          || /\b[A-Z]{3}\s*(?:->|→|-)\s*[A-Z]{3}\b/.test(routeText || title);
        if (!hasFlightSignal) return;
        flightsSource.push({
          ...item,
          day_no: item.day_no || day.day_no || 0,
          route: item.route || title,
        });
      });
    });
    const transportSource = this.normalizePublishedTransport(snapshot);
    const days = this.normalizeHomeDayCards(dailySummaryCards, daysSource);
    const hotelSeen = {};
    const hotels = hotelsSource.map((hotel, index) => {
      const name = hotel.hotel_name || hotel.name || hotel.title || '';
      const key = [name, hotel.check_in_date || hotel.date || '', hotel.linked_day_no || hotel.day_no || ''].join('|');
      if (!name && !hotel.address) return null;
      if (hotelSeen[key]) return null;
      hotelSeen[key] = true;
      return {
        id: hotel.hotel_id || hotel.id || `${name || 'hotel'}-${index}`,
        name: name || '酒店安排',
        city: hotel.city || '',
        linkedDayNo: Number(hotel.linked_day_no || hotel.day_no || 0),
        dateText: hotel.date_text || [hotel.check_in_date || hotel.date || '', hotel.check_out_date || ''].filter(Boolean).join(' - '),
        check_in_date: hotel.check_in_date || hotel.date || '',
        check_out_date: hotel.check_out_date || '',
        arrival_time: hotel.arrival_time || '',
        group: hotel.group || hotel.hotel_group || hotel.chain || '',
        brand: hotel.brand || hotel.hotel_brand || '',
        star_rating: hotel.star_rating || hotel.stars || '',
        room_summary: hotel.room_summary || hotel.room_type || '',
        confirmation_no: hotel.confirmation_no || hotel.confirmation_number || '',
        status_text: hotel.status_text || '已同步',
        address: hotel.address || '',
        note: [
          hotel.arrival_time ? `预计抵达：${this.formatDisplayTime(hotel.arrival_time)}` : '',
          hotel.room_type || '',
          hotel.status_text || '',
          hotel.customer_note || hotel.note || '',
        ].filter(Boolean).join(' · '),
      };
    }).filter(Boolean);
    const flightSeen = {};
    const flights = flightsSource.map((flight, index) => {
      const flightText = String(flight.flight_no || flight.flight_number || flight.title || '');
      const flightMatch = flightText.match(/\b[A-Z]{2}\d{2,4}\b/);
      const routeText = String(flight.route || flight.title || '');
      const routeMatch = routeText.match(/\b([A-Z]{3})\s*(?:->|→|-)\s*([A-Z]{3})\b/);
      const from = flight.departure_airport || flight.from || flight.origin || (routeMatch ? routeMatch[1] : '');
      const to = flight.arrival_airport || flight.to || flight.destination || (routeMatch ? routeMatch[2] : '');
      const flightNo = flight.flight_no || flight.flight_number || (flightMatch ? flightMatch[0] : '');
      if (!flightNo && !from && !to) return null;
      const key = [flightNo, flight.day_no || '', from, to, flight.departure_time || flight.depart_at || ''].join('|');
      if (flightSeen[key]) return null;
      flightSeen[key] = true;
      return {
        id: flight.flight_id || flight.id || `${flightNo || 'flight'}-${index}`,
        flightNo: flightNo || '航班',
        route: flight.route || [from, to].filter(Boolean).join(' → '),
        timeText: [this.formatDisplayTime(flight.departure_time || flight.depart_at || ''), this.formatDisplayTime(flight.arrival_time || flight.arrive_at || '')].filter(Boolean).join(' - '),
        note: flight.customer_note || flight.note || '',
      };
    }).filter(Boolean);
    const initialDayNo = this.resolveInitialTripDayNo(days);
    const progressNodes = this.decorateTripProgressNodes(days.map((day, index) => ({
      node_id: `day_${day.dayNo || index + 1}`,
      type: 'trip_day',
      day_no: day.dayNo || index + 1,
      label: `Day ${day.dayNo || index + 1}`,
      date: day.date || '',
      weekday: day.weekday || '',
      location_summary: day.city || day.title || '行程同步中',
      status: Number(day.dayNo || index + 1) === initialDayNo ? 'current' : 'upcoming',
      statusText: Number(day.dayNo || index + 1) === initialDayNo ? '当前' : '待前往',
    })), initialDayNo, initialDayNo);

    return this.applySelectedDayToPublishedTrip({
      ...snapshot,
      displayTitle: hero.title || snapshot.title || 'Farland 行程',
      displayTripNo: hero.trip_no || snapshot.trip_no || snapshot.external_trip_id || snapshot.trip_id || '',
      displayDateRange: hero.date_range || tripSummary.date_range_text || [snapshot.start_at || snapshot.date_start || '', snapshot.end_at || snapshot.date_end || ''].filter(Boolean).join(' - '),
      displayCity: hero.city_summary || tripSummary.city_route_text || snapshot.city || '',
      displaySummary: snapshot.summary || hero.summary || [
        tripSummary.days_count ? `${tripSummary.days_count} 天行程` : '',
        tripSummary.hotels_count ? `${tripSummary.hotels_count} 晚住宿` : '',
        tripSummary.flights_count ? `${tripSummary.flights_count} 段航班` : '',
      ].filter(Boolean).join(' · '),
      summaryMetrics: [
        tripSummary.days_count ? { label: '天数', value: tripSummary.days_count } : null,
        tripSummary.hotels_count ? { label: '酒店', value: tripSummary.hotels_count } : null,
        tripSummary.flights_count ? { label: '航班', value: tripSummary.flights_count } : null,
        tripSummary.transport_count ? { label: '交通', value: tripSummary.transport_count } : null,
      ].filter(Boolean),
      nextDayLabel: tripSummary.next_day_label || '',
      displayCustomer: customer.display_name || customer.name || '',
      advisorName: advisor.name || 'Farland 顾问',
      advisorPhone: advisor.phone || '',
      advisorNote: advisor.note || snapshot.advisor_note || '',
      days,
      selectedDayNo: initialDayNo,
      currentDayNo: initialDayNo,
      actualCurrentDayNo: initialDayNo,
      progressNodes,
      todayDriverCard: null,
      todayOverviewCard: null,
      todayHotelCard: null,
      hotels,
      flights,
      transports: transportSource,
      hasDays: Boolean(days.length),
      hasHotels: Boolean(hotels.length),
      hasFlights: Boolean(flights.length),
      hasTransports: Boolean(transportSource.length),
    }, initialDayNo);
  },

  applyOperatorCustomerSharePreview(previewPayload) {
    const sharePreview = previewPayload.customer_share_preview || {};
    const meta = {
      ...(previewPayload.preview_meta || {}),
      customer_would_see: sharePreview.waiting ? 'waiting' : 'published',
    };
    const previewCustomer = previewPayload.preview_customer || {};
    const tripId = sharePreview.trip_id || meta.trip_id || '';
    const waitingMessage = sharePreview.message || 'Farland 顾问正在为您核对行程安排，确认后将在这里显示。';
    const commonState = {
      loading: false,
      tripInviteMode: true,
      tripInviteId: tripId,
      inviteCode: '',
      inviteRequestId: '',
      inviteMode: false,
      operatorPreview: false,
      needsInviteClaim: false,
      claimingTemporaryAccess: false,
      currentBindMode: '',
      showProfileUpgrade: false,
      showProfileUpgradeForm: false,
      tripInviteAccessSource: sharePreview.access_source || 'operator_preview',
      tripInviteAutoSaved: false,
      tripInviteAlreadySaved: false,
      tripInviteCanSave: false,
      tripInviteShowSaveForm: false,
      tripInviteSaveName: '',
      tripInviteSaving: false,
      operatorCustomerPreviewMode: true,
      operatorCustomerPreviewMeta: meta,
      operatorPreviewDays: [],
      operatorPreviewFlights: [],
      showHomeEmpty: false,
      showLegacyTransport: false,
      hotelRequests: [],
      transportationAppointments: [],
      customerSummaryBar: null,
      tripProgress: null,
      progressStrip: null,
      selectedTripDayNo: 0,
      todayCard: null,
      dailyCharter: null,
      todayDriverCard: null,
      todayHotelCard: null,
      todayItinerary: null,
      nextConfirmed: {},
      tripOverview: [],
      tripDayCards: [],
      flightCards: [],
      hotelCards: [],
      transferRequests: [],
      primaryTransfer: null,
      transportOrders: [],
      showTransferRequests: false,
      charterServices: [],
      benefits: [],
      topBenefits: [],
      hideModules: {},
    };

    if (sharePreview.waiting || !sharePreview.trip) {
      this.setData({
        ...commonState,
        tripInviteTrip: null,
        tripInviteWaiting: true,
        tripInviteMessage: waitingMessage,
        tripInviteError: '',
        profile: {
          name: previewCustomer.display_name || '客户分享卡预览',
          member_level: '运营预览',
          points_balance: 0,
          subtitle: '当前页面模拟客户打开分享卡后的等待状态。',
        },
        advisorPhone: '',
      });
      return;
    }

    const trip = this.normalizePublishedTrip(sharePreview.trip || {});
    this.cacheTripDetailContext(trip.days, {
      trip_id: tripId,
      trip_no: trip.displayTripNo,
      overview: {
        trip_id: tripId,
        trip_no: trip.displayTripNo,
        city_summary: trip.displayCity,
      },
    });
    this.setData({
      ...commonState,
      tripInviteTrip: trip,
      tripInviteWaiting: false,
      tripInviteMessage: '',
      tripInviteError: '',
      profile: {
        name: trip.displayCustomer || previewCustomer.display_name || '客户分享卡预览',
        member_level: '运营预览',
        points_balance: 0,
        subtitle: '当前页面模拟客户打开分享卡后的真实显示效果。',
      },
      selectedTripDayNo: trip.selectedDayNo || 0,
      advisorPhone: trip.advisorPhone || '',
    });
    this.scrollToPendingCustomerHomeTarget();
  },

  applyOperatorCustomerHomePreview(previewPayload) {
    const home = previewPayload.customer_home || {};
    const meta = previewPayload.preview_meta || {};
    const previewCustomer = previewPayload.preview_customer || {};
    const previewHome = this.normalizeOperatorCustomerHomePreview(home, meta, previewCustomer);
    this.setData({
      loading: false,
      tripInviteMode: false,
      tripInviteId: meta.trip_id || '',
      tripInviteTrip: null,
      tripInviteWaiting: false,
      tripInviteMessage: '',
      tripInviteError: '',
      tripInviteCanSave: false,
      tripInviteAutoSaved: false,
      tripInviteAlreadySaved: Boolean(previewCustomer.is_registered),
      operatorCustomerPreviewMode: true,
      operatorCustomerPreviewMeta: meta,
      needsInviteClaim: false,
      inviteMode: false,
      operatorPreview: false,
      showProfileUpgrade: false,
      showProfileUpgradeForm: false,
      currentBindMode: 'farland_profile',
      profile: previewHome.profile,
      benefits: previewHome.benefits,
      topBenefits: previewHome.topBenefits,
      hotelRequests: previewHome.hotelRequests,
      transportationAppointments: previewHome.transportationAppointments,
      customerSummaryBar: previewHome.customerSummaryBar,
      tripProgress: previewHome.tripProgress,
      progressStrip: previewHome.progressStrip,
      selectedTripDayNo: previewHome.selectedDayNo || 0,
      todayCard: previewHome.todayCard,
      dailyCharter: null,
      todayDriverCard: previewHome.todayDriverCard,
      todayHotelCard: previewHome.todayHotelCard,
      todayItinerary: previewHome.todayItinerary,
      hideModules: {},
      showHomeEmpty: !previewHome.hasContent,
      showLegacyTransport: previewHome.hasTransport,
      nextConfirmed: previewHome.nextConfirmed,
      tripOverview: previewHome.tripOverview,
      tripDayCards: previewHome.operatorPreviewDays,
      flightCards: previewHome.operatorPreviewFlights,
      hotelCards: previewHome.hotelCards,
      transferRequests: previewHome.transferRequests,
      primaryTransfer: previewHome.transferRequests[0] || null,
      transportOrders: previewHome.transportOrders,
      showTransferRequests: Boolean(previewHome.transferRequests.length || previewHome.transportOrders.length),
      charterServices: previewHome.charterServices,
      operatorPreviewDays: previewHome.operatorPreviewDays,
      operatorPreviewFlights: previewHome.operatorPreviewFlights,
      advisorPhone: previewHome.advisorPhone || '',
    });
    this.cacheTripDetailContext(previewHome.operatorPreviewDays, {
      trip_id: meta.trip_id || '',
      trip_no: (previewHome.tripOverview[0] && previewHome.tripOverview[0].trip_no) || '',
      overview: previewHome.tripOverview[0] || {},
    });
  },

  normalizeOperatorCustomerHomePreview(home, meta, previewCustomer) {
    const profileSource = home.profile || {};
    const overview = (home.trip_overview || [])[0] || home.trip_summary || {};
    const dailySummaryCards = Array.isArray(home.daily_summary_cards) ? home.daily_summary_cards : [];
    const operatorPreviewDays = (Array.isArray(home.itinerary_days) ? home.itinerary_days : [])
      .map((day, index) => {
        const normalizedDay = this.normalizePublishedTripDay(day, index);
        const summary = dailySummaryCards.find((card) => Number(card.day_no || 0) === Number(normalizedDay.dayNo || 0)) || {};
        return {
          ...normalizedDay,
          title: summary.title || normalizedDay.title,
          city: summary.city || normalizedDay.city,
          startTime: this.formatDisplayTime(summary.start_time_text || normalizedDay.startTime || ''),
          hotelBadge: summary.hotel_badge || normalizedDay.hotelBadge,
          transportBadge: summary.transport_badge || normalizedDay.transportBadge,
          highlightItems: summary.highlight_items || normalizedDay.highlightItems,
        };
      });
    if (!operatorPreviewDays.length && dailySummaryCards.length) {
      dailySummaryCards.forEach((summary, index) => {
        operatorPreviewDays.push({
          id: summary.id || `summary-day-${summary.day_no || index + 1}`,
          dayNo: summary.day_no || index + 1,
          date: summary.date || '',
          weekday: summary.weekday || '',
          title: summary.title || `Day ${summary.day_no || index + 1}`,
          city: summary.city || '',
          summary: '',
          startTime: this.formatDisplayTime(summary.start_time_text || ''),
          hotelBadge: summary.hotel_badge || '',
          transportBadge: summary.transport_badge || '',
          highlightItems: summary.highlight_items || [],
          timelineItems: (summary.highlight_items || []).map((title, itemIndex) => ({
            id: `${summary.id || summary.day_no || index}-${itemIndex}`,
            time: itemIndex === 0 ? this.formatDisplayTime(summary.start_time_text || '') : '',
            title,
            location: '',
            note: '',
            driveText: '',
            trafficText: '',
          })),
        });
      });
    }
    const operatorPreviewFlights = (Array.isArray(home.flight_cards) ? home.flight_cards : [])
      .map((flight, index) => ({
        id: flight.flight_id || flight.id || `${flight.flight_no || flight.flight_number || 'flight'}-${index}`,
        title: flight.flight_no || flight.flight_number || flight.title || '航班安排',
        route: flight.route || [flight.departure_airport || flight.from || '', flight.arrival_airport || flight.to || ''].filter(Boolean).join(' → '),
        timeText: [
          this.formatDisplayTime(flight.departure_time || flight.depart_at || ''),
          this.formatDisplayTime(flight.arrival_time || flight.arrive_at || ''),
        ].filter(Boolean).join(' - '),
        note: flight.customer_note || flight.note || '',
      }));
    const hotelCards = (Array.isArray(home.hotel_requests) ? home.hotel_requests : []).map((hotel, index) => ({
      ...hotel,
      id: hotel.hotel_id || hotel.id || `${hotel.hotel_name || hotel.name || 'hotel'}-${index}`,
      displayName: hotel.hotel_name || hotel.name || hotel.title || '酒店安排',
      statusText: hotel.status_text || '已同步',
      statusClass: 'confirmed',
      check_in_date: hotel.check_in_date || hotel.date || '',
      check_out_date: hotel.check_out_date || '',
      subline: hotel.address || hotel.customer_note || hotel.note || hotel.room_type || '酒店详情由 Farland 顾问确认。',
    }));
    const transferRequests = [
      ...(Array.isArray(home.transportation_appointments) ? home.transportation_appointments : []),
      ...(Array.isArray(home.transfer_requests) ? home.transfer_requests : []),
    ].map((request, index) => ({
      ...request,
      request_id: request.request_id || request.transfer_id || `preview-transfer-${index}`,
      title: request.title || (request.service_type === 'charter' ? '包车安排' : '接送安排'),
      pickup_time_text: this.formatDisplayTime(request.pickup_time_text || request.pickup_time || request.service_date || ''),
      created_by_text: request.created_by_text || 'Farland 顾问',
      status_text: request.status_text || '运营预览',
      status: request.status || 'pending',
      statusClass: request.status === 'assigned' || request.status === 'confirmed' ? 'confirmed' : 'pending',
      pickup: request.pickup || request.pickup_location || '',
      dropoff: request.dropoff || request.dropoff_location || '',
      quoteCount: 0,
      quotes: [],
    }));
    const transportOrders = (Array.isArray(home.transport_orders) ? home.transport_orders : []).map((order, index) => ({
      ...order,
      order_id: order.transport_order_id || order.order_id || order.request_id || `preview-order-${index}`,
      title: order.title || '已确认用车',
      pickup_time_text: this.formatDisplayTime(order.pickup_time_text || order.pickup_time || ''),
      status_text: order.status_text || (order.order_status === 'assigned' ? '已分配司机' : '用车待确认'),
      statusClass: order.order_status === 'assigned' ? 'confirmed' : 'pending',
      vehicle_class: order.vehicle_class || order.vehicle_model || order.vehicle_type || '',
      driver: order.driver || this.normalizeAssignedDriver(order),
    }));
    const charterServices = (Array.isArray(home.charter_services) ? home.charter_services : []).map((charter, index) => ({
      ...charter,
      charter_id: charter.charter_id || charter.id || `preview-charter-${index}`,
      title: charter.title || '包车服务',
      date_range_text: charter.date_range_text || charter.date || '',
      vehicle_class: charter.vehicle_class || charter.vehicle_summary || '',
      status_text: charter.status_text || '运营预览',
      service_area: charter.service_area || charter.route || charter.city || '',
      continuity_text: charter.continuity_text || charter.customer_note || charter.note || '',
    }));
    const actualCurrentDayNo = this.resolveInitialTripDayNo(operatorPreviewDays);
    const selectedDayNo = actualCurrentDayNo;
    const today = operatorPreviewDays.find((day) => Number(day.dayNo || day.day_no || 0) === selectedDayNo) || operatorPreviewDays[0] || null;
    const advisorName = profileSource.advisor_name || 'Farland 顾问';
    const profileName = previewCustomer.display_name
      || profileSource.display_name
      || overview.title
      || 'Farland 客户';
    const todayItinerary = today ? {
      date: [today.weekday, today.date].filter(Boolean).join(' · '),
      city: today.city || overview.city_summary || '',
      title: today.title,
      summary: today.summary || (today.startTime ? `预计出发：${today.startTime}` : ''),
      items: today.timelineItems.map((item) => ({
        time: item.time,
        title: item.title,
        description: [item.location, item.driveText, item.trafficText, item.note].filter(Boolean).join(' · '),
      })),
      farland_contact: {
        name: advisorName,
        phone: profileSource.advisor_phone || '',
      },
      driver_visibility: 'pending',
    } : null;
    const tripOverview = (dailySummaryCards.length ? dailySummaryCards : operatorPreviewDays).map((day) => ({
      day: day.dayNo || day.day_no,
      title: day.title,
      date: [day.weekday, day.date].filter(Boolean).join(' · '),
      city: day.city || '',
      summary: [
        day.summary || (day.startTime || day.start_time_text ? `预计出发：${day.startTime || this.formatDisplayTime(day.start_time_text || '')}` : ''),
        day.hotelBadge || day.hotel_badge ? `酒店：${day.hotelBadge || day.hotel_badge}` : '',
        day.transportBadge || day.transport_badge ? `用车：${day.transportBadge || day.transport_badge}` : '',
      ].filter(Boolean).join(' · '),
      statusText: meta.customer_would_see === 'published' ? '已发布' : '运营预览',
      statusClass: meta.customer_would_see === 'published' ? 'confirmed' : 'pending',
    }));
    const progressNodes = this.decorateTripProgressNodes(operatorPreviewDays.map((day, index) => ({
      node_id: `preview-day-${day.dayNo || index + 1}`,
      type: 'trip_day',
      day_no: day.dayNo || index + 1,
      label: `Day ${day.dayNo || index + 1}`,
      date: day.date || '',
      weekday: day.weekday || '',
      location_summary: day.city || day.title || '行程同步中',
      status: Number(day.dayNo || index + 1) === actualCurrentDayNo ? 'current' : 'upcoming',
      statusText: Number(day.dayNo || index + 1) === actualCurrentDayNo ? '当前' : '待前往',
    })), selectedDayNo, actualCurrentDayNo);
    const tripProgress = progressNodes.length > 1 ? {
      visible: true,
      mode: 'daily_nodes',
      current_day_no: actualCurrentDayNo || progressNodes[0].day_no || 1,
      selected_day_no: selectedDayNo || progressNodes[0].day_no || 1,
      actual_current_day_no: actualCurrentDayNo || progressNodes[0].day_no || 1,
      current_node_id: (progressNodes.find((node) => Number(node.day_no || 0) === actualCurrentDayNo) || progressNodes[0]).node_id,
      nodes: progressNodes,
    } : null;
    const customerSummaryBar = {
      visible: true,
      customer_display_name: profileName,
      trip_no: overview.trip_no || '',
      date_range_text: overview.date_range_text || '',
      trip_summary_text: overview.days_count ? `${overview.days_count}天行程` : '',
      thank_you_text: '感谢您使用 Farland 的服务',
      sync_status_text: meta.customer_would_see === 'published' ? '行程已同步' : '行程同步中',
      communication_note: '后续沟通请以客户群为准',
    };
    const hasTransport = Boolean(transferRequests.length || transportOrders.length || charterServices.length);
    const hasContent = Boolean(
      operatorPreviewDays.length
      || operatorPreviewFlights.length
      || hotelCards.length
      || hasTransport
      || tripOverview.length
    );
    const selectedTodayCard = today ? this.buildTodayCardFromTripDay(today, {
      trip_id: meta.trip_id || overview.trip_id || '',
      trip_no: overview.trip_no || '',
      overview,
      advisor: { name: advisorName, phone: profileSource.advisor_phone || '' },
    }) : null;
    const selectedDriverCard = today ? this.buildPublishedTripTodayDriverCard(today, {}) : null;
    if (selectedDriverCard) {
      selectedDriverCard.title = `Day ${selectedDayNo} 用车`;
      selectedDriverCard.sectionTitle = `Day ${selectedDayNo} 用车`;
    }
    const selectedHotel = this.findHotelForTripDay(today, hotelCards);
    const selectedHotelCard = selectedHotel ? this.normalizeTodayHotelCard({
      ...selectedHotel,
      visible: true,
      hotel_id: selectedHotel.hotel_id || selectedHotel.id,
      sectionTitle: `Day ${selectedDayNo} 住宿`,
    }) : null;
    const firstNode = today && today.timelineItems[0] ? today.timelineItems[0] : null;
    const benefits = Array.isArray(home.benefits) ? home.benefits : [];

    return {
      profile: {
        name: profileName,
        member_level: meta.operator_draft_preview ? '运营草稿预览' : '客户视图预览',
        points_balance: 0,
        subtitle: meta.operator_draft_preview
          ? '该页面仅供运营核对，不会推送给客户。'
          : meta.customer_would_see === 'published'
          ? '当前为已发布客户版本预览，不会写入客户档案。'
          : '当前为客户真实页面预览，不会写入客户档案。',
      },
      benefits,
      topBenefits: benefits.slice(0, 2),
      hotelRequests: home.hotel_requests || [],
      transportationAppointments: home.transportation_appointments || [],
      customerSummaryBar,
      tripProgress,
      progressStrip: tripProgress,
      selectedDayNo,
      todayCard: selectedTodayCard,
      todayDriverCard: selectedDriverCard,
      todayHotelCard: selectedHotelCard,
      todayItinerary,
      nextConfirmed: today ? {
        title: firstNode ? firstNode.title : today.title,
        date: [today.weekday, today.date].filter(Boolean).join(' · '),
        time: firstNode ? firstNode.time : today.startTime,
        city: firstNode ? firstNode.location : today.city,
      } : {
        title: overview.title || 'Farland 行程预览',
        date: overview.date_range_text || '',
        time: '',
        city: overview.city_summary || '',
      },
      tripOverview,
      hotelCards,
      transferRequests,
      transportOrders,
      charterServices,
      operatorPreviewDays,
      operatorPreviewFlights,
      hasTransport,
      hasContent,
      advisorPhone: profileSource.advisor_phone || '',
    };
  },

  normalizeCustomerHomePreviewTrip(home, meta, previewCustomer) {
    const overview = (home.trip_overview || [])[0] || {};
    const profile = home.profile || {};
    const snapshot = {
      title: overview.title || 'Farland 行程',
      trip_id: meta.trip_id || overview.trip_id || '',
      trip_no: overview.trip_no || '',
      start_at: overview.date_range_text || '',
      city: overview.city_summary || '',
      summary: overview.status_text || '',
      customer: {
        display_name: previewCustomer.display_name || profile.display_name || '',
      },
      advisor: {
        name: profile.advisor_name || 'Farland 顾问',
      },
      hero: {
        title: overview.title || 'Farland 行程',
        trip_no: overview.trip_no || '',
        date_range: overview.date_range_text || '',
        city_summary: overview.city_summary || '',
      },
      itinerary_days: Array.isArray(home.itinerary_days) ? home.itinerary_days : [],
      hotels: Array.isArray(home.hotel_requests) ? home.hotel_requests : [],
      flights: Array.isArray(home.flight_cards) ? home.flight_cards : [],
      transfers: Array.isArray(home.transfer_requests) ? home.transfer_requests : [],
      charter_services: Array.isArray(home.charter_services) ? home.charter_services : [],
    };
    const trip = this.normalizePublishedTrip(snapshot);
    const transportOrders = Array.isArray(home.transport_orders) ? home.transport_orders : [];
    const assignedTransports = transportOrders.map((order, index) => ({
      id: order.transport_order_id || order.request_id || `assigned-${index}`,
      title: order.driver_name ? `已分配司机：${order.driver_name}` : '已确认用车',
      meta: [order.vehicle_model || order.vehicle_type || '', order.plate_number || ''].filter(Boolean).join(' · '),
      note: order.driver_phone ? `电话：${order.driver_phone}` : '司机信息待同步',
    }));
    trip.transports = [...assignedTransports, ...trip.transports];
    trip.hasTransports = Boolean(trip.transports.length);
    return trip;
  },

  normalizePublishedTripDay(day, index) {
    const summaryCard = day.summary_card || {};
    const itemsSource = Array.isArray(day.timeline_items)
      ? day.timeline_items
      : (Array.isArray(day.items) ? day.items : []);
    const hotelName = summaryCard.hotel_badge
      || (day.hotel ? (day.hotel.name || day.hotel.hotel_name || day.hotel.title || '') : '');
    const transportBadge = summaryCard.transport_badge
      || (day.transport_summary ? (day.transport_summary.title || day.transport_summary.vehicle_summary || day.transport_summary.vehicle_class || '') : '');
    return {
      id: day.day_id || day.id || `day-${day.day_no || index + 1}`,
      dayNo: day.day_no || index + 1,
      date: day.date || '',
      weekday: day.weekday || '',
      title: summaryCard.title || day.title || `Day ${day.day_no || index + 1}`,
      city: summaryCard.city || day.city || '',
      summary: day.summary || '',
      startTime: this.formatDisplayTime(summaryCard.start_time_text || day.start_time_text || day.estimated_departure_time || day.displayed_start_time || day.start_time || ''),
      hotel: day.hotel || null,
      hotelBadge: hotelName,
      transportSummary: day.transport_summary || null,
      transportBadge,
      highlightItems: summaryCard.highlight_items || [],
      hasTimeConflict: Boolean(summaryCard.has_time_conflict || day.has_time_conflict),
      timelineItems: itemsSource.map((item, itemIndex) => ({
        id: item.item_id || item.id || `${day.day_no || index + 1}-${itemIndex}`,
        type: item.item_type || item.type || 'custom',
        item_type: item.item_type || item.type || 'custom',
        time: this.formatDisplayTime(item.time || item.planned_start_time || item.planned_arrival_time || ''),
        title: item.title || '行程节点',
        location: item.location_name || item.location || '',
        route: item.route || [item.from || item.origin || item.departure_airport || '', item.to || item.destination || item.arrival_airport || ''].filter(Boolean).join(' → '),
        note: item.customer_note || item.note || item.description || '',
        driveText: [item.drive_time_text || item.drive_time || '', item.distance_text || item.distance || ''].filter(Boolean).join(' · '),
        distanceText: item.distance_text || item.distance || '',
        trafficText: item.traffic_text || item.traffic_level || '',
        arrival_estimate: this.formatDisplayTime(item.arrival_estimate || item.estimated_arrival_time || item.planned_arrival_time || ''),
        next_stop: item.next_stop || item.next_location || '',
        latitude: item.latitude || item.lat || item.map_latitude || '',
        longitude: item.longitude || item.lng || item.map_longitude || '',
        map_url: item.map_url || '',
      })),
    };
  },

  normalizePublishedTransport(snapshot) {
    const transportItems = [];
    const summary = snapshot.transport_summary;
    if (summary && !Array.isArray(summary)) {
      transportItems.push({
        id: summary.transport_id || summary.id || 'transport-summary',
        title: summary.title || summary.service_type || '用车安排',
        meta: [summary.date || '', summary.depart_time || summary.pickup_time || '', summary.vehicle_summary || summary.vehicle_class || ''].filter(Boolean).join(' · '),
        note: summary.status_text || summary.customer_note || summary.note || '',
      });
    }
    if (Array.isArray(summary)) {
      summary.forEach((item, index) => {
        transportItems.push({
          id: item.transport_id || item.id || `transport-${index}`,
          title: item.title || item.service_type || '用车安排',
          meta: [item.date || '', item.depart_time || item.pickup_time || '', item.vehicle_summary || item.vehicle_class || ''].filter(Boolean).join(' · '),
          note: item.status_text || item.customer_note || item.note || '',
        });
      });
    }
    const charterServices = Array.isArray(snapshot.charter_services) ? snapshot.charter_services : [];
    const transfers = Array.isArray(snapshot.transfers) ? snapshot.transfers : [];
    charterServices.forEach((item, index) => {
      transportItems.push({
        id: item.charter_id || item.id || `charter-${index}`,
        title: item.title || '包车服务',
        meta: [item.date_range_text || item.date || '', item.vehicle_class || item.vehicle_summary || '', item.service_area || ''].filter(Boolean).join(' · '),
        note: item.continuity_text || item.status_text || item.customer_note || item.note || '',
      });
    });
    transfers.forEach((item, index) => {
      transportItems.push({
        id: item.request_id || item.transfer_id || item.id || `transfer-${index}`,
        title: item.title || '接送安排',
        meta: [item.pickup || '', item.dropoff || ''].filter(Boolean).join(' → '),
        note: [this.formatDisplayTime(item.pickup_time_text || item.pickup_time || ''), item.status_text || ''].filter(Boolean).join(' · '),
      });
    });
    return transportItems;
  },

  openTripInviteSaveForm() {
    this.setData({ tripInviteShowSaveForm: true });
  },

  onTripInviteSaveNameInput(e) {
    this.setData({ tripInviteSaveName: e.detail.value || '' });
  },

  async saveTripInviteToProfile() {
    const displayName = String(this.data.tripInviteSaveName || '').trim();
    if (!displayName) {
      wx.showToast({ title: '请填写称呼', icon: 'none' });
      return;
    }
    if (this.data.tripInviteSaving) return;

    this.setData({ tripInviteSaving: true });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'saveCustomerTripToProfile',
        data: {
          trip_id: this.data.tripInviteId,
          invite_code: this.data.inviteCode,
          display_name: displayName,
        },
      });
      if (!result || !result.success) {
        this.setData({ tripInviteSaving: false });
        wx.showToast({ title: (result && result.message) || '保存失败', icon: 'none' });
        return;
      }
      wx.showToast({ title: '已保存', icon: 'success' });
      this.setData({
        tripInviteSaving: false,
        tripInviteCanSave: false,
        tripInviteAlreadySaved: true,
        tripInviteAccessSource: result.access_source || 'customer_trip_access',
        tripInviteShowSaveForm: false,
        tripInviteSaveName: '',
        profile: {
          ...(this.data.profile || {}),
          name: result.display_name || displayName,
          member_level: '已同步',
          subtitle: '已同步到我的 Farland 行程',
        },
      });
    } catch (error) {
      console.error('[customer-home] saveCustomerTripToProfile failed', error);
      this.setData({ tripInviteSaving: false });
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
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
      const result = await this.claimInvite('farland_profile', '', { auto_claim: true });
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

  async claimInvite(bindMode, displayName = '', extraData = {}) {
    const { inviteCode, inviteRequestId } = this.data;
    const { result } = await wx.cloud.callFunction({
      name: 'claimCustomerInvite',
      data: {
        request_id: inviteRequestId,
        invite_code: inviteCode,
        bind_mode: bindMode,
        display_name: displayName,
        ...extraData,
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

  openHotelDetail() {
    const hotelCard = this.data.todayHotelCard;
    if (!hotelCard) {
      wx.showToast({ title: '暂无酒店信息', icon: 'none' });
      return;
    }
    const app = getApp();
    if (app.globalData) {
      app.globalData.customerHotelDetail = hotelCard;
    }
    try {
      wx.setStorageSync('customerHotelDetail', hotelCard);
    } catch (error) {
      console.warn('[customer-home] cache hotel detail failed', error);
    }
    wx.navigateTo({ url: '/pages/customer/hotel-detail/hotel-detail' });
  },

  openTripInviteHotelDetail() {
    const hotelCard = this.data.tripInviteTrip && this.data.tripInviteTrip.todayHotelCard;
    if (!hotelCard) {
      wx.showToast({ title: '暂无酒店信息', icon: 'none' });
      return;
    }
    const app = getApp();
    if (app.globalData) {
      app.globalData.customerHotelDetail = hotelCard;
    }
    try {
      wx.setStorageSync('customerHotelDetail', hotelCard);
    } catch (error) {
      console.warn('[customer-home] cache invite hotel detail failed', error);
    }
    wx.navigateTo({ url: '/pages/customer/hotel-detail/hotel-detail' });
  },

  cacheTripDetailContext(days, context = {}) {
    const sourceDays = Array.isArray(days) ? days : [];
    const cards = sourceDays.map((day) => this.buildTripDayDetailCard(day, context)).filter(Boolean);
    if (!cards.length) return;
    const firstCard = cards[0] || {};
    const payload = {
      trip_id: context.trip_id || firstCard.trip_id || '',
      trip_no: context.trip_no || firstCard.trip_no || '',
      cards,
      updated_at: Date.now(),
    };
    const app = getApp();
    if (app.globalData) {
      app.globalData.customerTripDetailContext = payload;
    }
    try {
      wx.setStorageSync('customerTripDetailContext', payload);
    } catch (error) {
      console.warn('[customer-home] cacheTripDetailContext failed', error);
    }
  },

  buildTripDayDetailCard(day, context = {}) {
    if (!day) return null;
    const overview = context.overview || (this.data.tripOverview || [])[0] || {};
    const dayNo = day.dayNo || day.day_no || 1;
    return {
      trip_id: context.trip_id || this.data.tripInviteId || overview.trip_id || '',
      trip_no: context.trip_no || overview.trip_no || (this.data.tripInviteTrip && this.data.tripInviteTrip.displayTripNo) || '',
      day_no: dayNo,
      date: day.date || '',
      weekday: day.weekday || '',
      city_summary: day.city || overview.city_summary || overview.city_route_text || '',
      title: day.title || `Day ${dayNo}`,
      status_text: '已确认',
      service_type: day.transportBadge ? 'charter' : 'itinerary',
      service_window: day.startTime ? { label: `${day.startTime} 出发` } : null,
      depart_time: day.startTime || '',
      vehicle_summary: day.transportBadge || '',
      party_summary: '',
      driver_visibility: 'pending',
      timeline_items: (day.timelineItems || []).map((item, index) => ({
        id: item.id || `${dayNo}-${index}`,
        item_id: item.id || `${dayNo}-${index}`,
        type: item.type || item.item_type || 'custom',
        time: item.time || '',
        title: item.title || '行程节点',
        location: item.location || item.location_name || '',
        route: item.route || '',
        drive_time: item.driveText || item.drive_time_text || '',
        distance: item.distanceText || item.distance_text || '',
        traffic_level: item.trafficText || item.traffic_text || '',
        note: item.note || item.customer_note || '',
        arrival_estimate: item.arrival_estimate || '',
        next_stop: item.next_stop || '',
        latitude: item.latitude || item.lat || item.map_latitude || '',
        longitude: item.longitude || item.lng || item.map_longitude || '',
        map_url: item.map_url || '',
      })),
      transport_summary: day.transportSummary || (day.transportBadge ? { title: day.transportBadge } : null),
      hotel: day.hotel ? {
        name: day.hotel.name || day.hotel.hotel_name || day.hotel.title || day.hotelBadge || '酒店安排',
        arrival_time: day.hotel.arrival_time || day.hotel.planned_arrival_time || '',
        address: day.hotel.address || '',
      } : (day.hotelBadge ? { name: day.hotelBadge, arrival_time: '', address: '' } : null),
    };
  },

  openTripDayDetail(e) {
    const dayNo = Number(e.currentTarget.dataset.dayNo || 0);
    const source = e.currentTarget.dataset.source || '';
    const candidates = source === 'invite'
      ? ((this.data.tripInviteTrip && this.data.tripInviteTrip.days) || [])
      : (this.data.tripDayCards || this.data.operatorPreviewDays || []);
    const day = candidates.find((item) => Number(item.dayNo || item.day_no || 0) === dayNo) || candidates[0] || null;
    const detailCard = this.buildTripDayDetailCard(day);
    if (!detailCard) {
      wx.showToast({ title: '暂无当日详情', icon: 'none' });
      return;
    }
    const app = getApp();
    app.globalData.todayCardDetail = detailCard;
    wx.setStorageSync('todayCardDetail', detailCard);
    wx.navigateTo({
      url: `/pages/customer/day-detail/day-detail?trip_id=${encodeURIComponent(detailCard.trip_id || '')}&day_no=${detailCard.day_no}`,
    });
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
};

module.exports = customerHomePageConfig;
