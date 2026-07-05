const customerHomePageConfig = {
  data: {
    loading: true,
    loadingCustomerName: '刘女士',
    profile: {},
    benefits: [],
    hotelRequests: [],
    transportationAppointments: [],
    customerSummaryBar: null,
    tripProgress: null,
    progressStrip: null,
    currentProgressSummary: null,
    progressAxisScrollLeft: 0,
    inviteProgressAxisScrollLeft: 0,
    homeDaySwipeStyle: '',
    inviteDaySwipeStyle: '',
    selectedTripDayNo: 0,
    todayOverviewExpanded: false,
    inviteTodayOverviewExpanded: false,
    todayCard: null,
    dailyCharter: null,
    todayDriverCard: null,
    todayHotelCard: null,
    visitCards: [],
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
    tripInviteEntry: '',
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
    operatorDraftPreviewPayload: null,
    operatorPreviewDays: [],
    operatorPreviewFlights: [],
    hideModules: {},
    phoneDateKey: '',
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
    const tripInviteEntry = this.decodeQueryValue(options.entry || options.open || '');
    if (operatorCustomerPreview) {
      this.applyOperatorCustomerHomePreview(operatorCustomerPreview);
      return;
    }
    this.setData({
      tripInviteId,
      tripInviteEntry,
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
    this.refreshPhoneLocalTripDaySelection();
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
    this.setData({
      loading: true,
      selectedTripDayNo: 0,
      todayOverviewExpanded: false,
      inviteTodayOverviewExpanded: false,
    });
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
          visitCards: [],
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
          visitCards: [],
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
      const customerSummaryBar = this.normalizeCustomerSummaryBar(result);
      const tripProgress = this.normalizeDailyProgress(result.trip_progress || result.progress_strip || null, result);
      const progressStrip = tripProgress;
      const currentProgressSummary = this.buildCurrentProgressSummary(tripProgress);
      const selectedTripDayNo = (tripProgress && (tripProgress.selected_day_no || tripProgress.current_day_no))
        || this.resolveInitialTripDayNo(tripDayCards);
      const selectedTripDay = tripDayCards.find((day) => Number(day.dayNo || day.day_no || 0) === Number(selectedTripDayNo))
        || tripDayCards[0]
        || null;
      const activeTripOverview = tripOverview[0] || {};
      const phoneLocalTodayCard = selectedTripDay ? this.buildTodayCardFromTripDay(selectedTripDay, {
        trip_id: activeTripOverview.trip_id || '',
        trip_no: activeTripOverview.trip_no || '',
        overview: activeTripOverview,
      }) : null;
      const serverDailyCharter = this.normalizeDailyCharter(result.daily_charter || null);
      const todayCard = this.normalizeTodayCard(
        phoneLocalTodayCard
        || (serverDailyCharter && serverDailyCharter.today_card)
        || result.today_card
        || null,
      );
      const dailyCharter = todayCard ? this.normalizeDailyCharter({
        ...(serverDailyCharter || {}),
        visible: true,
        service_type: todayCard.service_type || 'charter',
        service_window_label: todayCard.serviceWindowText || todayCard.depart_time || '',
        vehicle_summary: todayCard.vehicle_summary || '',
        party_summary: todayCard.party_summary || '',
        driver_visibility: todayCard.driver_visibility || 'pending',
        driver: todayCard.driver || null,
        destination_cards: todayCard.destination_cards || [],
        today_card: todayCard,
      }) : serverDailyCharter;
      const hasCharterContract = Boolean(result.daily_charter || result.today_driver_card || result.hide_modules || selectedTripDay);
      let todayDriverCard = selectedTripDay
        ? this.buildPublishedTripTodayDriverCard(selectedTripDay, {})
        : (hasCharterContract
          ? this.normalizeTodayDriverCard(result.today_driver_card || null)
          : this.buildTodayDriverCard(todayCard));
      const selectedHotel = this.findHotelForTripDay(selectedTripDay, hotelCards);
      const todayHotelCard = selectedHotel ? this.normalizeTodayHotelCard({
        ...selectedHotel,
        visible: true,
        hotel_id: selectedHotel.hotel_id || selectedHotel.id,
        sectionTitle: '今晚住宿',
      }) : (this.normalizeTodayHotelCard(result.today_hotel_card || null) || this.buildTodayHotelCard(todayCard));
      const todayItinerary = selectedTripDay
        ? this.buildTodayItineraryFromTripDay(selectedTripDay, activeTripOverview)
        : this.normalizeTodayItinerary(result.today_itinerary || null);
      const visitCards = this.normalizeCustomerVisitCards(result.visit_cards || []);
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
        currentProgressSummary,
        selectedTripDayNo,
        todayOverviewExpanded: false,
        inviteTodayOverviewExpanded: false,
        phoneDateKey: this.getTodayDateKey(),
        todayCard,
        dailyCharter,
        todayDriverCard,
        todayHotelCard,
        visitCards,
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
      }, () => {
        this.centerProgressAxisDay(selectedTripDayNo, 'home');
        this.scrollToPendingCustomerHomeTarget();
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
    const vehicleColor = source.vehicle_color || '';
    const vehicleType = source.vehicle_type || source.vehicle_class || '';
    const plateNumber = source.plate_number || '';
    if (!driverName && !phone && !vehicleModel && !vehicleType && !vehicleColor && !plateNumber) return null;
    const vehicleMainText = [vehicleModel || vehicleType, vehicleColor].filter(Boolean).join(' · ');
    const vehicleText = [vehicleMainText, plateNumber].filter(Boolean).join(' · ') || '车辆待确认';
    return {
      name: driverName,
      phone,
      vehicle_model: vehicleModel,
      vehicle_color: vehicleColor,
      vehicle_type: vehicleType,
      plate_number: plateNumber,
      meeting_point: source.meeting_point || '',
      vehicleMainText,
      vehicleText,
      detailLine: [
        driverName ? `司机：${driverName}` : '',
        vehicleText ? `车辆：${vehicleText}` : '',
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

  refreshPhoneLocalTripDaySelection() {
    const phoneDateKey = this.getTodayDateKey();
    if (this.data.phoneDateKey === phoneDateKey) return;

    if (this.data.tripInviteMode && this.data.tripInviteTrip && Array.isArray(this.data.tripInviteTrip.days) && this.data.tripInviteTrip.days.length) {
      const trip = this.applySelectedDayToPublishedTrip(this.data.tripInviteTrip, 0);
      this.setData({
        ...this.buildTripInviteSurfaceState(trip),
        phoneDateKey,
        tripInviteTrip: trip,
        selectedTripDayNo: trip.selectedDayNo || trip.selected_day_no || 0,
        inviteTodayOverviewExpanded: false,
      }, () => {
        this.centerProgressAxisDay(trip.selectedDayNo || trip.selected_day_no || 0, 'invite');
      });
      return;
    }

    const hasTripDays = Array.isArray(this.data.tripDayCards) && this.data.tripDayCards.length;
    if (hasTripDays) {
      const nextState = this.buildSelectedHomeDayState(0);
      this.setData({
        ...nextState,
        phoneDateKey,
        todayOverviewExpanded: false,
      }, () => {
        this.centerProgressAxisDay(nextState.selectedTripDayNo || 0, 'home');
      });
      return;
    }

    this.setData({ phoneDateKey });
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
        short_location: node.short_location || node.shortLocation || this.getShortProgressLocation(node),
        departure_time: this.resolveDayDepartureTime(node),
        statusText: isSelected
          ? '已选择'
          : (isPast ? '已过去' : (isToday ? '今天' : (status === 'current' ? '当前' : (status === 'completed' ? '已完成' : '待前往')))),
      };
    });
  },

  getShortProgressLocation(node = {}) {
    const text = String(node.location_summary || node.city || '').trim();
    const first = text
      .split(/[\/→,，]/)
      .map((item) => item.trim())
      .filter(Boolean)[0];
    return first || '行程';
  },

  resolveDayDepartureTime(day = {}, fallback = {}) {
    const serviceWindow = fallback.service_window || fallback.serviceWindow || day.service_window || day.serviceWindow || {};
    return this.extractTimeForDisplay(
      day.estimated_departure_time_raw
        || day.estimatedDepartureTimeRaw
        || fallback.estimated_departure_time_raw
        || fallback.estimatedDepartureTimeRaw
        || day.estimated_departure_time
        || day.estimatedDepartureTime
        || fallback.estimated_departure_time
        || fallback.estimatedDepartureTime
        || day.start_time_text
        || fallback.start_time_text
        || day.departure_time
        || day.depart_time
        || day.pickup_time
        || fallback.depart_time
        || fallback.departure_time
        || fallback.pickup_time
        || fallback.service_window_label
        || fallback.serviceWindowText
        || serviceWindow.label
        || serviceWindow.start_time
        || day.startTime
        || day.start_time
        || '',
    );
  },

  buildCurrentProgressSummary(progress) {
    if (!progress || !Array.isArray(progress.nodes) || !progress.nodes.length) return null;
    const selectedDayNo = Number(progress.selected_day_no || progress.selectedDayNo || 0);
    const currentDayNo = Number(progress.current_day_no || progress.actual_current_day_no || progress.currentDayNo || 0);
    const node = progress.nodes.find((item) => Number(item.day_no || item.dayNo || 0) === selectedDayNo)
      || progress.nodes.find((item) => item.status === 'current')
      || progress.nodes.find((item) => Number(item.day_no || item.dayNo || 0) === currentDayNo)
      || progress.nodes[0];
    if (!node) return null;
    const departureTime = this.resolveDayDepartureTime(node);
    return {
      label: node.label || `Day ${node.day_no || ''}`.trim(),
      metaText: [node.label || `Day ${node.day_no || ''}`.trim(), node.weekday || '', node.date || ''].filter(Boolean).join(' · '),
      routeText: node.location_summary || node.city || '行程同步中',
      departureText: departureTime ? `预计出发 ${departureTime}` : '',
    };
  },

  buildOverviewSubtitle(dayNo = 0, weekday = '', date = '') {
    const dayLabel = Number(dayNo || 0) ? `Day ${Number(dayNo)}` : '';
    const secondaryLabel = weekday || date || '';
    return [dayLabel, secondaryLabel].filter(Boolean).join(' · ') || '当日行程';
  },

  buildDaySectionCopy(dayNo = 0, date = '', todayTitle = '今日行程概览', dateSuffix = '行程概览') {
    const dateKey = this.toDateKey(date);
    const isPhoneToday = Boolean(dateKey && dateKey === this.getTodayDateKey());
    if (isPhoneToday) {
      return {
        isPhoneToday: true,
        sectionKicker: 'TODAY',
        sectionTitle: todayTitle,
      };
    }
    return {
      isPhoneToday: false,
      sectionKicker: dayNo ? `DAY ${dayNo}` : 'DATE',
      sectionTitle: dateKey ? `${dateKey} ${dateSuffix}` : `Day ${dayNo || ''} ${dateSuffix}`.trim(),
    };
  },

  escapeRegExp(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  },

  isPlaceholderCustomerName(name = '') {
    const text = String(name || '').trim();
    if (!text) return true;
    return [
      '王女士',
      '张先生',
      '李女士',
      'Farland 客户',
      '客户',
      '游客',
      '称呼',
    ].includes(text);
  },

  normalizeCustomerDisplayName(name = '') {
    const text = String(name || '').trim();
    return this.isPlaceholderCustomerName(text) ? '' : text;
  },

  resolveDefaultCustomerNameForTrip(tripNo = '') {
    const text = String(tripNo || '').trim().toUpperCase();
    return text === '2026XBC091' ? '刘女士' : '';
  },

  buildCompactTripTitle(title = '', customerName = '', tripNo = '') {
    const rawTitle = String(title || '').trim() || 'Farland 行程';
    const cleanCustomerName = this.normalizeCustomerDisplayName(customerName);
    const cleanTripNo = String(tripNo || '').trim();
    const strippedTitle = cleanTripNo
      ? rawTitle.replace(new RegExp(`^${this.escapeRegExp(cleanTripNo)}\\s*[·\\-]?\\s*`, 'i'), '').trim()
      : rawTitle;
    if (cleanCustomerName && strippedTitle && !strippedTitle.includes(cleanCustomerName)) {
      return `${cleanCustomerName}的${strippedTitle}`;
    }
    return rawTitle;
  },

  normalizeCustomerSummaryBar(result = {}) {
    const bar = result.customer_summary_bar || {};
    const profile = result.profile || {};
    const overview = (result.trip_overview || [])[0] || {};
    const todayCard = result.today_card || {};
    const tripNo = bar.trip_no || todayCard.trip_no || overview.trip_no || overview.external_trip_id || '';
    const customerName = this.normalizeCustomerDisplayName(bar.customer_display_name || profile.name || result.customer_name || '')
      || this.resolveDefaultCustomerNameForTrip(tripNo);
    const dayCount = overview.days_count
      || (Array.isArray(result.itinerary_days) ? result.itinerary_days.length : 0)
      || (Array.isArray(result.daily_summary_cards) ? result.daily_summary_cards.length : 0);
    const tripSummaryText = bar.trip_summary_text
      || overview.summary_text
      || (dayCount ? `${dayCount}天行程` : '');
    return {
      visible: bar.visible !== false,
      customer_display_name: customerName || 'Farland 客户',
      trip_no: tripNo,
      date_range_text: bar.date_range_text || overview.date_range_text || '',
      display_title: this.buildCompactTripTitle(
        bar.trip_title || overview.title || overview.trip_title || todayCard.trip_title || `${bar.trip_no || todayCard.trip_no || overview.trip_no || overview.external_trip_id || ''} Farland 行程`,
        customerName,
        tripNo,
      ),
      display_meta: [
        tripNo,
        bar.date_range_text || overview.date_range_text || '',
      ].filter(Boolean).join(' · '),
      city_route_text: bar.city_route_text || overview.city_route_text || overview.city_summary || todayCard.city_route_text || todayCard.city_summary || '',
      trip_summary_text: tripSummaryText,
      thank_you_text: bar.thank_you_text || '感谢您使用 Farland 的服务',
      sync_status_text: bar.sync_status_text || '已同步',
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
          departure_time: this.resolveDayDepartureTime(day),
          status: 'upcoming',
        };
      }).filter((node) => node.day_no && node.location_summary);
    }

    if (nodes.length < 2) return null;
    const fallbackCurrentDayNo = Number((strip && strip.current_day_no) || (result.today_card && result.today_card.day_no) || nodes[0].day_no);
    const currentDayNo = this.resolveInitialTripDayNo(nodes) || fallbackCurrentDayNo;
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
      current_summary: this.buildCurrentProgressSummary({ nodes, selected_day_no: selectedDayNo, current_day_no: currentDayNo }),
    };
  },

  normalizeProgressStrip(strip) {
    if (!strip || !Array.isArray(strip.nodes) || !strip.nodes.length) return null;
    const nodes = strip.nodes.map((node, index) => ({
      ...node,
      node_id: node.node_id || `${node.label || 'node'}-${index}`,
      label: node.label || '',
      status: ['completed', 'current', 'upcoming'].includes(node.status) ? node.status : 'upcoming',
      short_location: node.short_location || node.shortLocation || this.getShortProgressLocation(node),
      departure_time: this.resolveDayDepartureTime(node),
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
          vehicle_model: card.vehicle_model || card.vehicle_summary,
          vehicle_color: card.vehicle_color || '',
          plate_number: card.plate_number || '',
        })
      : null;
    const departureTime = this.resolveDayDepartureTime(card, card) || '待确认';
    const vehicleSummary = card.vehicle_summary || '车辆待确认';
    const serviceLines = this.buildVehicleServiceLines({ departureTime, vehicleSummary, driver });
    const pickup = card.pickup || card.pickup_address || '';
    const dayCopy = this.buildDaySectionCopy(card.day_no || card.dayNo || 0, card.date || '', '今日用车', '用车');
    return {
      title: dayCopy.sectionTitle,
      sectionKicker: dayCopy.sectionKicker,
      sectionTitle: dayCopy.sectionTitle,
      statusText: isAssigned ? '' : '司机信息待同步',
      statusClass: isAssigned ? 'confirmed' : 'pending',
      departureTime,
      vehicleSummary,
      serviceSummaryLine: serviceLines.serviceSummaryLine,
      departureLine: serviceLines.departureLine,
      driverLine: serviceLines.driverLine,
      vehicleLine: serviceLines.vehicleLine,
      plateLine: serviceLines.plateLine,
      pickupLine: this.formatPickupLine(pickup),
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
    const hasDayTransportSummary = Boolean(summary && Object.keys(summary).length);
    // The snapshot-level today_driver_card represents the initially selected day.
    // When the customer taps Day 2/Day 3, selected-day transport_summary must win.
    const explicit = snapshot.today_driver_card || snapshot.todayDriverCard || {};
    const rawDriver = summary.driver
      || summary.assigned_transport
      || explicit.driver
      || explicit.assigned_transport
      || {
        name: summary.driver_name || explicit.driver_name || '',
        phone: summary.driver_phone || explicit.driver_phone || '',
        vehicle_model: summary.vehicle_model || summary.vehicle_summary || explicit.vehicle_model || explicit.vehicle_summary || '',
        vehicle_color: summary.vehicle_color || explicit.vehicle_color || '',
        vehicle_type: summary.vehicle_type || summary.vehicle_class || explicit.vehicle_type || '',
        plate_number: summary.plate_number || explicit.plate_number || '',
      };
    const driver = this.normalizeAssignedDriver(rawDriver);
    const driverVisibility = summary.driver_visibility || explicit.driver_visibility || (driver && (driver.name || driver.phone) ? 'assigned' : 'pending');
    const isAssigned = driverVisibility === 'assigned' && driver;
    const departureTime = this.resolveDayDepartureTime(todayDay, {
      ...explicit,
      ...summary,
      depart_time: summary.depart_time || summary.pickup_time || explicit.depart_time || '',
      departure_time: summary.departure_time || explicit.departure_time || '',
      service_window_label: summary.service_window_label || summary.serviceWindowText || explicit.service_window_label || explicit.serviceWindowText || '',
    }) || '待确认';
    const vehicleSummary = summary.vehicle_summary
      || summary.vehicle_model
      || summary.vehicle_class
      || explicit.vehicle_summary
      || explicit.vehicle_model
      || todayDay.transportBadge
      || (driver ? driver.vehicleText : '')
      || '车辆待确认';
    const serviceLines = this.buildVehicleServiceLines({ departureTime, vehicleSummary, driver: isAssigned ? driver : null });
    const pickup = summary.pickup
      || summary.pickup_address
      || (hasDayTransportSummary ? '' : (explicit.pickup || explicit.pickup_address || ''));
    const dayCopy = this.buildDaySectionCopy(todayDay.dayNo || todayDay.day_no || 0, todayDay.date || '', '今日用车', '用车');
    return {
      title: dayCopy.sectionTitle,
      sectionKicker: dayCopy.sectionKicker,
      sectionTitle: dayCopy.sectionTitle,
      statusText: isAssigned ? '' : (summary.status_text || explicit.status_text || '司机信息待同步'),
      statusClass: isAssigned ? 'confirmed' : 'pending',
      departureTime,
      vehicleSummary,
      serviceSummaryLine: serviceLines.serviceSummaryLine,
      departureLine: serviceLines.departureLine,
      driverLine: serviceLines.driverLine,
      vehicleLine: serviceLines.vehicleLine,
      plateLine: serviceLines.plateLine,
      pickupLine: this.formatPickupLine(pickup),
      partySummary: summary.party_summary || explicit.party_summary || '',
      driver: isAssigned ? driver : null,
      helperText: isAssigned ? '' : (summary.helper_text || explicit.helper_text || '司机信息确认后会同步到这里；如需调整请在客户群沟通。'),
      requestId: summary.request_id || explicit.request_id || '',
      actionLabel: isAssigned ? (summary.cta_label || explicit.cta_label || '') : '',
      actionType: isAssigned ? 'detail' : 'none',
    };
  },

  extractTimeForDisplay(value) {
    const text = this.formatDisplayTime(value || '');
    const match = String(text).match(/\b([01]?\d|2[0-3]):[0-5]\d\b/);
    return match ? match[0] : String(text).replace(/\s*出发\s*$/, '');
  },

  buildVehicleServiceLines({ departureTime = '', vehicleSummary = '', driver = null } = {}) {
    const departure = this.extractTimeForDisplay(departureTime || '');
    const vehicle = vehicleSummary || '车辆待确认';
    const departureLine = departure && departure !== '待确认' ? `${departure} 出发` : '出发时间待确认';
    const driverLine = driver && (driver.name || driver.phone)
      ? [
          driver.name ? `司机：${driver.name}` : '',
          driver.phone || '',
        ].filter(Boolean).join(' · ')
      : '';
    const vehicleMain = driver
      ? (driver.vehicleMainText || [driver.vehicle_model || driver.vehicle_type || '', driver.vehicle_color || ''].filter(Boolean).join(' · ') || vehicle)
      : vehicle;
    const vehicleLine = driver ? (vehicleMain ? `车辆：${vehicleMain}` : '') : vehicle;
    const plateLine = driver && driver.plate_number ? `车牌：${driver.plate_number}` : '';
    const serviceSummaryLine = [
      departure && departure !== '待确认' ? `${departure} 出发` : '',
      vehicle,
    ].filter(Boolean).join(' · ') || vehicle;
    return { serviceSummaryLine, departureLine, driverLine, vehicleLine, plateLine };
  },

  formatPickupLine(value = '') {
    const pickup = String(value || '')
      .replace(/^\s*上车点\s*[:：]\s*/u, '')
      .trim();
    return pickup ? `上车点：${pickup}` : '';
  },

  formatDriveTimeMeta(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^(约|大约)/.test(raw) || /(分钟|小时|服务)/.test(raw)) return raw;

    const hourMinute = raw.match(/^(\d{1,2}):([0-5]\d)$/);
    if (hourMinute) {
      const hours = Number(hourMinute[1]);
      const minutes = Number(hourMinute[2]);
      if (hours && minutes) return `约${hours}小时${minutes}分钟`;
      if (hours) return `约${hours}小时`;
      if (minutes) return `约${minutes}分钟`;
    }

    const minutesOnly = raw.match(/^(\d+(?:\.\d+)?)\s*(min|mins|minute|minutes)$/i);
    if (minutesOnly) return `约${Number(minutesOnly[1])}分钟`;

    return /^约/.test(raw) ? raw : `约${raw}`;
  },

  formatDistanceMeta(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const mileMatch = raw.match(/^(\d+(?:\.\d+)?)\s*(mi|mile|miles)$/i);
    if (!mileMatch) return raw.replace(/\s*miles?\b/i, 'mi');
    const miles = Number(mileMatch[1]);
    const display = Number.isFinite(miles)
      ? String(Math.round(miles * 10) / 10).replace(/\.0$/, '')
      : mileMatch[1];
    return `${display}mi`;
  },

  normalizeTrafficLevel(value) {
    const text = String(value || '').trim().toLowerCase();
    if (!text) return 'unknown';
    if (/walk|walking|foot|pedestrian|步行|徒步/.test(text)) return 'walk';
    if (/good|smooth|light|clear|顺畅|良好/.test(text)) return 'good';
    if (/moderate|medium|normal|适中|一般/.test(text)) return 'moderate';
    if (/heavy|congest|busy|slow|拥堵|缓慢/.test(text)) return 'heavy';
    return 'unknown';
  },

  formatTrafficText(value, level) {
    const raw = String(value || '').trim();
    if (raw) {
      if (/^(walk|walking|foot|pedestrian)$/i.test(raw) || raw === '步行') return '步行';
      if (/^good$/i.test(raw)) return '通畅';
      if (/^moderate$/i.test(raw)) return '车流适中';
      if (/^heavy$/i.test(raw)) return '拥堵';
      if (/^unknown$/i.test(raw)) return '';
      return raw;
    }
    if (level === 'good') return '通畅';
    if (level === 'moderate') return '车流适中';
    if (level === 'heavy') return '拥堵';
    if (level === 'walk') return '步行';
    return '';
  },

  normalizeTravelMode(item = {}, explicitMeta = {}, formattedMeta = {}) {
    const explicitMode = String(
      explicitMeta.mode
        || explicitMeta.travel_mode
        || explicitMeta.transport_mode
        || explicitMeta.segment_mode
        || item.mode
        || item.travel_mode
        || item.transport_mode
        || item.segment_mode
        || '',
    ).trim().toLowerCase();

    if (/walk|walking|foot|pedestrian|步行|徒步/.test(explicitMode)) return 'walk';
    if (/flight|plane|airplane|fly|航班|飞机|飞行/.test(explicitMode)) return 'flight';
    if (/drive|driving|car|vehicle|charter|transfer|shuttle|van|包车|用车|接送|开车|车辆/.test(explicitMode)) return 'drive';

    const raw = [
      item.item_type,
      item.card_type,
      item.type,
      item.service_type,
      item.title,
      item.route,
      item.location_name,
      item.location,
      explicitMeta.type,
      explicitMeta.mode_text,
      explicitMeta.transport_mode_text,
    ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean).join(' ');

    if (/walk|walking|foot|pedestrian|步行|徒步/.test(raw)) return 'walk';

    const hasGroundSignal = Boolean(
      formattedMeta.driveText
        || formattedMeta.distanceText
        || formattedMeta.trafficText
        || item.drive_time_text
        || item.drive_time
        || item.distance_text
        || item.distance
        || item.traffic_text
        || item.traffic_level
        || explicitMeta.drive_time_text
        || explicitMeta.distance_text
        || explicitMeta.traffic_text,
    );

    if (!hasGroundSignal && (
      item.flight_no
        || item.flight_number
        || explicitMeta.flight_no
        || explicitMeta.flight_number
        || /\b[A-Z]{2}\d{2,4}\b/.test(raw)
        || /flight|plane|airplane|航班|飞机|飞行/.test(raw)
    )) {
      return 'flight';
    }

    return 'drive';
  },

  getTravelModeLabel(mode) {
    if (mode === 'walk') return '步行';
    if (mode === 'flight') return '飞行';
    return '开车';
  },

  getTravelModeIcon(mode) {
    if (mode === 'walk') return '步行';
    if (mode === 'flight') return '飞行';
    return '车程';
  },

  get091RouteMetaOverride(item = {}) {
    const cardId = String(item.card_id || item.cardId || item.item_id || item.id || '').trim();
    const routeCheckId = String(item.route_check_id || item.routeCheckId || '').trim();
    const routeOverrides = {
      '091_day7_white_house': {
        routeIds: ['day7_monuments'],
        drive_time_text: '0:16',
        distance_text: '3.4mi',
        source_drive_time_text: '0:25',
        source_distance_text: '3mi',
        traffic_text: 'Heavy',
        maps_duration_text: '16 min',
        maps_distance_text: '3.4 mi',
        maps_route_text: 'Massachusetts Ave NW',
      },
      '091_day7_lincoln_memorial': {
        routeIds: ['day7_white_house_to_lincoln_walk', 'day7_white_house_to_lincoln_drive'],
        drive_time_text: '0:12',
        distance_text: '1.5mi',
        source_drive_time_text: '0:25',
        source_distance_text: '1.2mi',
        traffic_text: 'Heavy',
        maps_duration_text: '12 min',
        maps_distance_text: '1.5 mi',
        maps_route_text: 'Constitution Ave NW',
      },
      '091_day7_us_capitol': {
        routeIds: ['day7_lincoln_to_us_capitol_walk', 'day7_lincoln_to_us_capitol_drive'],
        drive_time_text: '0:15',
        distance_text: '2.8mi',
        source_drive_time_text: '0:50',
        source_distance_text: '2.5mi',
        traffic_text: 'Heavy',
        maps_duration_text: '15 min',
        maps_distance_text: '2.8 mi',
        maps_route_text: 'Constitution Ave NW and Pennsylvania Ave NW',
      },
      '091_day7_capitol_hill': {
        routeIds: ['day7_us_capitol_to_capitol_hill_walk', 'day7_us_capitol_to_capitol_hill_drive'],
        drive_time_text: '0:05',
        distance_text: '0.2mi',
        source_drive_time_text: '0:05',
        source_distance_text: '0.2mi',
        traffic_text: 'Moderate',
        maps_duration_text: '5 min',
        maps_distance_text: '0.2 mi',
        maps_route_text: 'U.S. Capitol → Capitol Hill',
      },
      '091_day7_library_of_congress': {
        routeIds: ['day7_capitol_hill_to_library_walk', 'day7_capitol_hill_to_library_drive'],
        drive_time_text: '0:06',
        distance_text: '0.3mi',
        source_drive_time_text: '0:06',
        source_distance_text: '0.3mi',
        traffic_text: 'Moderate',
        maps_duration_text: '6 min',
        maps_distance_text: '0.3 mi',
        maps_route_text: 'Capitol Hill → Library of Congress',
      },
      '091_day7_supreme_court_exterior': {
        routeIds: ['day7_library_to_supreme_walk', 'day7_library_to_supreme_drive'],
        drive_time_text: '0:04',
        distance_text: '0.2mi',
        source_drive_time_text: '0:04',
        source_distance_text: '0.2mi',
        traffic_text: 'Moderate',
        maps_duration_text: '4 min',
        maps_distance_text: '0.2 mi',
        maps_route_text: 'Library of Congress → Supreme Court exterior',
      },
      '091_day7_glover_georgetown': {
        routeIds: ['day7_hotel'],
        drive_time_text: '0:23',
        distance_text: '6.4mi',
        source_drive_time_text: '0:30',
        source_distance_text: '5.1mi',
        traffic_text: 'Heavy',
        maps_duration_text: '23 min',
        maps_distance_text: '6.4 mi',
        maps_route_text: 'Independence Ave SE and Rock Creek and Potomac Pkwy NW',
      },
    };
    const override = routeOverrides[cardId]
      || Object.values(routeOverrides).find((route) => route.routeIds.includes(routeCheckId));
    if (override) {
      return {
        ...override,
        routeIds: undefined,
        traffic_level: 'maps_current',
        transport_mode: 'drive',
        travel_mode: 'drive',
        mode: 'drive',
      };
    }
    return null;
  },

  normalizeRouteLegMeta(item = {}) {
    const explicitMeta = {
      ...(item.travelMeta || item.travel_meta || item.travel_snapshot || item.travelSnapshot || {}),
      ...(this.get091RouteMetaOverride(item) || {}),
    };
    const driveText = this.formatDriveTimeMeta(item.driveText || item.drive_time_text || item.drive_time || explicitMeta.drive_time_text || explicitMeta.maps_duration_text || '');
    const distanceText = this.formatDistanceMeta(item.distanceText || item.distance_text || item.distance || explicitMeta.distance_text || explicitMeta.maps_distance_text || '');
    const rawTrafficText = explicitMeta.traffic_text || explicitMeta.traffic_level || item.trafficText || item.traffic_text || item.traffic_level || '';
    const trafficLevel = this.normalizeTrafficLevel(rawTrafficText);
    const trafficText = this.formatTrafficText(rawTrafficText, trafficLevel);
    const iconType = this.normalizeTravelMode(item, explicitMeta, { driveText, distanceText, trafficText });
    const pieces = [];
    if (driveText) pieces.push(driveText);
    if (distanceText && !String(driveText).includes(String(distanceText))) pieces.push(distanceText);
    if (trafficText) pieces.push(trafficText);
    const travelMeta = {
      icon_type: iconType,
      icon_label: this.getTravelModeLabel(iconType),
      icon_text: this.getTravelModeIcon(iconType),
      mode: iconType,
      transport_mode: iconType,
      drive_time_text: driveText,
      distance_text: distanceText,
      traffic_text: trafficText,
      traffic_level: trafficText ? trafficLevel : 'unknown',
      hasContent: Boolean(driveText || distanceText || trafficText),
    };
    return {
      driveText,
      distanceText,
      trafficText,
      trafficLevel,
      travelMeta,
      travel_meta: travelMeta,
      legMeta: pieces.join(' · '),
    };
  },

  shouldExposeTravelMeta(item = {}) {
    const flags = item.ui_flags || item.uiFlags || {};
    if (Object.prototype.hasOwnProperty.call(flags, 'show_travel_meta')) {
      return flags.show_travel_meta === true;
    }
    const type = String(item.card_type || item.cardType || item.type || item.item_type || '').trim();
    const structuredTypes = [
      'school_visit_card',
      'landmark_card',
      'museum_card',
      'meeting_card',
      'flight_card',
      'hotel_arrival_card',
      'custom_activity_card',
      'school_visit',
      'landmark',
      'museum',
      'meeting',
      'flight',
      'hotel_arrival',
    ];
    if (structuredTypes.includes(type) && (item.travel_snapshot || item.travelSnapshot)) return false;
    return true;
  },

  getConnectorTravelMeta(item = {}, previousItem = null) {
    if (!item) return null;
    const currentGroup = item.parent_group_id || item.parentGroupId || '';
    const previousGroup = previousItem ? (previousItem.parent_group_id || previousItem.parentGroupId || '') : '';
    const currentRouteCheck = item.route_check_id || item.routeCheckId || '';
    const previousRouteCheck = previousItem ? (previousItem.route_check_id || previousItem.routeCheckId || '') : '';
    if (currentGroup && previousGroup && currentGroup === previousGroup && currentRouteCheck === previousRouteCheck) return null;
    const meta = item.travelMeta || item.travel_meta || null;
    if (!meta || !meta.hasContent) return null;
    const mode = meta.icon_type || meta.mode || meta.transport_mode || 'drive';
    return {
      ...meta,
      icon_type: mode,
      icon_label: meta.icon_label || this.getTravelModeLabel(mode),
      icon_text: meta.icon_text || this.getTravelModeIcon(mode),
    };
  },

  buildOverviewNodeSet(routeStops = [], context = {}) {
    const fullNodes = (Array.isArray(routeStops) ? routeStops : [])
      .map((node, index) => ({
        ...node,
        id: node.id || `overview-node-${index}`,
        summaryNode: false,
      }));
    if (!fullNodes.length) {
      return {
        fullNodes: [],
        summaryNodes: [],
        displayRouteStops: [],
        overviewCanExpand: false,
        overviewCollapsed: false,
        overviewExpandLabel: '',
        overviewCollapseLabel: '收起',
      };
    }

    const nodeCount = Number(context.nodeCount || 0)
      || fullNodes.filter((node) => !this.isDepartureOverviewNode(node)).length
      || fullNodes.length;
    const hasGroupedTourNodes = fullNodes.some((node) => this.getOverviewNodeGroupKey(node));
    const shouldCollapse = fullNodes.length > 4 && (hasGroupedTourNodes || nodeCount > 4);
    const summaryNodes = shouldCollapse
      ? this.buildOverviewSummaryNodes(fullNodes, context)
      : fullNodes;
    const displaySummaryNodes = summaryNodes && summaryNodes.length
      ? summaryNodes
      : fullNodes.slice(0, 4).map((node) => this.buildOverviewSummarySingleNode(node, context));
    const overviewCanExpand = shouldCollapse && displaySummaryNodes.length < fullNodes.length;

    return {
      fullNodes,
      summaryNodes: displaySummaryNodes,
      displayRouteStops: overviewCanExpand ? displaySummaryNodes : fullNodes,
      overviewCanExpand,
      overviewCollapsed: overviewCanExpand,
      overviewExpandLabel: `展开全部 ${nodeCount} 个节点`,
      overviewCollapseLabel: '收起',
    };
  },

  buildOverviewSummaryNodes(routeStops = [], context = {}) {
    const summaryNodes = [];
    let index = 0;
    while (index < routeStops.length) {
      const node = routeStops[index];
      const groupKey = this.getOverviewNodeGroupKey(node);
      if (!groupKey) {
        summaryNodes.push(this.buildOverviewSummarySingleNode(node, context));
        index += 1;
        continue;
      }

      const groupNodes = [];
      while (index < routeStops.length && this.getOverviewNodeGroupKey(routeStops[index]) === groupKey) {
        groupNodes.push(routeStops[index]);
        index += 1;
      }
      summaryNodes.push(groupNodes.length > 1
        ? this.buildOverviewGroupNode(groupNodes, context)
        : this.buildOverviewSummarySingleNode(groupNodes[0], context));
    }

    const deduped = this.dedupeOverviewSummaryNodes(summaryNodes);
    if (deduped.length && deduped.length < routeStops.length) return deduped;
    return this.buildFallbackOverviewSummaryNodes(routeStops, context);
  },

  buildFallbackOverviewSummaryNodes(routeStops = [], context = {}) {
    const picked = [];
    const pushNode = (node) => {
      if (!node) return;
      const id = node.id || node.card_id || node.cardId || `${node.time || ''}-${node.title || ''}`;
      if (picked.some((item) => (item.id || item.card_id || item.cardId) === id)) return;
      picked.push(node);
    };
    const firstDeparture = routeStops.find((node) => this.isDepartureOverviewNode(node));
    pushNode(firstDeparture);
    routeStops
      .filter((node) => !this.isDepartureOverviewNode(node) && !this.isHotelOverviewNode(node))
      .slice(0, firstDeparture ? 2 : 3)
      .forEach(pushNode);
    const lastHotel = [...routeStops].reverse().find((node) => this.isHotelOverviewNode(node));
    pushNode(lastHotel || routeStops[routeStops.length - 1]);
    return picked.map((node) => this.buildOverviewSummarySingleNode(node, context));
  },

  dedupeOverviewSummaryNodes(nodes = []) {
    const seen = {};
    return (Array.isArray(nodes) ? nodes : []).filter((node, index) => {
      if (!node) return false;
      const key = node.id || node.card_id || node.cardId || `${node.time || ''}-${node.title || ''}-${index}`;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  },

  buildOverviewSummarySingleNode(node = {}, context = {}) {
    const summaryNode = {
      ...node,
      summaryNode: true,
      connectorTravelMeta: null,
      connector_travel_meta: null,
    };

    if (this.isDepartureOverviewNode(node)) {
      return {
        ...summaryNode,
        id: node.id || `${context.dayNo || 'day'}-summary-departure`,
        title: '上车出发',
        subtitle: this.shortenOverviewPlace(node.pickupAddress || node.pickup_address || node.subtitle || '', node.title || ''),
      };
    }

    if (this.isHotelOverviewNode(node)) {
      return {
        ...summaryNode,
        id: node.id || `${context.dayNo || 'day'}-summary-hotel`,
        title: '返回酒店',
        subtitle: this.shortenOverviewPlace(node.title || node.subtitle || '', node.subtitle || ''),
      };
    }

    return {
      ...summaryNode,
      title: this.getOverviewNodeDisplayName(node) || node.title || '行程节点',
      subtitle: this.shortenOverviewPlace(node.subtitle || node.location || node.location_name || '', ''),
    };
  },

  buildOverviewGroupNode(groupNodes = [], context = {}) {
    const first = groupNodes[0] || {};
    const groupKey = this.getOverviewNodeGroupKey(first);
    return {
      id: groupKey || `${context.dayNo || 'day'}-overview-group-${first.sequence || first.time || groupNodes.length}`,
      time: first.time || '',
      title: this.getOverviewGroupTitle(groupKey, groupNodes, context),
      subtitle: this.getOverviewGroupSubtitle(groupNodes),
      type: 'city_tour_group',
      item_type: 'city_tour_group',
      summaryNode: true,
      childCount: groupNodes.length,
      childItems: groupNodes,
      connectorTravelMeta: null,
      connector_travel_meta: null,
    };
  },

  getOverviewNodeGroupKey(node = {}) {
    if (!node || this.isDepartureOverviewNode(node) || this.isHotelOverviewNode(node)) return '';
    const groupKey = node.parent_group_id || node.parentGroupId || '';
    if (!groupKey || /^hotel_/i.test(groupKey) || /^stay_/i.test(groupKey)) return '';
    const type = String(node.card_type || node.cardType || node.type || node.item_type || '').toLowerCase();
    if (type && !/(landmark|museum|activity|custom|city|tour)/.test(type)) return '';
    return groupKey;
  },

  isDepartureOverviewNode(node = {}) {
    return Boolean(node && (node.isDeparture || node.type === 'departure' || node.item_type === 'departure' || node.title === '上车出发'));
  },

  isHotelOverviewNode(node = {}) {
    if (!node) return false;
    const type = String(node.card_type || node.cardType || node.type || node.item_type || '').toLowerCase();
    if (/(hotel|lodging|stay)/.test(type)) return true;
    if (node.hotel_stay_id || node.stay_id) return true;
    return /酒店|hotel/i.test(String(node.title || ''));
  },

  getOverviewGroupTitle(groupKey = '', groupNodes = [], context = {}) {
    const normalizedKey = String(groupKey || '').toLowerCase();
    if (normalizedKey === 'day7_monuments_group') return 'Washington DC 地标参观';
    if (normalizedKey === 'day7_capitol_hill_group') return 'Capitol Hill 外景参观';
    if (normalizedKey === 'day3_midtown_group') return '纽约 Midtown 城市参观';
    if (normalizedKey === 'day3_park_group') return '纽约市区轻松活动';
    if (normalizedKey === 'day3_uptown_museum_group') return '纽约上城公园与博物馆';
    if (normalizedKey === 'day3_midtown_lunch_group') return '纽约 Midtown 地标与午餐';
    if (normalizedKey === 'day3_downtown_brooklyn_group') return '纽约下城与布鲁克林观景';
    if (normalizedKey === 'day6_museum_group') return 'Smithsonian 博物馆参观';
    const first = groupNodes[0] || {};
    const groupTitle = first.parent_group_title || first.parentGroupTitle || '';
    if (/museum/i.test(first.card_type || first.cardType || first.type || '')) return '博物馆参观';
    if (groupTitle) return `${this.shortenOverviewPlace(groupTitle, '')} 参观`;
    const city = context.city || context.city_summary || '';
    return city ? `${this.shortenOverviewPlace(city, '')} 城市参观` : '城市参观';
  },

  getOverviewGroupSubtitle(groupNodes = []) {
    return (Array.isArray(groupNodes) ? groupNodes : [])
      .map((node) => this.getOverviewNodeDisplayName(node))
      .filter(Boolean)
      .join(' / ');
  },

  getOverviewNodeDisplayName(node = {}) {
    const snapshot = node.display_snapshot || node.displaySnapshot || {};
    const raw = snapshot.zh_name
      || snapshot.chinese_name
      || snapshot.name_zh
      || snapshot.title_zh
      || node.zh_title
      || node.chinese_title
      || node.title
      || node.location
      || node.location_name
      || '';
    const text = String(raw || '').trim();
    const key = text.toLowerCase();
    const knownNames = {
      'the white house': '白宫',
      'white house': '白宫',
      'u.s. capitol': '美国国会大厦',
      'us capitol': '美国国会大厦',
      'united states capitol': '美国国会大厦',
      '国会大厦': '美国国会大厦',
      'lincoln memorial': '林肯纪念堂',
      'capitol hill': '国会山',
      'library of congress': '国会图书馆',
      'supreme court exterior': '最高法院外景',
      'supreme court of the united states': '最高法院外景',
      'times square': '时代广场',
      'rockefeller center': '洛克菲勒中心',
      'fifth avenue': '第五大道',
      'central park': '中央公园',
      'bryant park': '布莱恩特公园',
      'metropolitan museum of art': '大都会艺术博物馆',
      'the metropolitan museum of art': '大都会艺术博物馆',
      'empire state building': '帝国大厦',
      'lunch': '午餐',
      'statue of liberty view (battery park)': '自由女神像远眺（炮台公园）',
      'statue of liberty view': '自由女神像远眺',
      'battery park': '炮台公园',
      'wall street': '华尔街',
      'brooklyn bridge': '布鲁克林大桥',
      'dumbo / brooklyn bridge park': 'DUMBO / 布鲁克林大桥公园',
      'dumbo': 'DUMBO',
      'national museum of natural history': '国家自然历史博物馆',
      'national air and space museum': '国家航空航天博物馆',
    };
    return knownNames[key] || text;
  },

  shortenOverviewPlace(value = '', fallback = '') {
    const text = String(value || fallback || '').replace(/^上车点[:：]\s*/, '').trim();
    if (!text) return '';
    const first = text
      .split(/[，,]/)
      .map((item) => item.trim())
      .filter(Boolean)[0];
    return first || text;
  },

  getDayPickupText(day = {}) {
    const summary = day.transportSummary || day.transport_summary || day.transport || {};
    return day.pickupAddress
      || day.pickup_address
      || day.pickup
      || summary.pickup_address
      || summary.pickup
      || '';
  },

  normalizeTodayCard(card) {
    if (!card) return null;
    const driverVisibility = card.driver_visibility === 'assigned' ? 'assigned' : 'pending';
    const normalizedDriver = this.normalizeAssignedDriver(card.driver || card.assigned_transport || null);
    const driverAssigned = driverVisibility === 'assigned' && normalizedDriver;
    const timelineItems = (card.timeline_items || []).map((item, index) => {
      const time = this.formatDisplayTime(item.time || '');
      const routeLeg = this.normalizeRouteLegMeta(item);
      return {
        ...item,
        ...routeLeg,
        time,
        id: item.id || `${item.time || 'time'}-${index}`,
        meta: [item.location, item.route, routeLeg.legMeta].filter(Boolean).join(' · '),
        noteText: [item.note].filter(Boolean).join(' · '),
      };
    });
    const destinationCards = (card.destination_cards && card.destination_cards.length ? card.destination_cards : timelineItems).map((item, index) => {
      const time = this.formatDisplayTime(item.time || '');
      const arrivalEstimate = this.formatDisplayTime(item.arrival_estimate || '');
      const routeLeg = this.normalizeRouteLegMeta(item);
      return {
        ...item,
        ...routeLeg,
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
    const departureTime = this.extractTimeForDisplay(
      card.estimated_departure_time_raw
        || card.estimatedDepartureTimeRaw
        || card.estimated_departure_time
        || card.estimatedDepartureTime
        || card.start_time_text
        || card.depart_time
        || (card.service_window && card.service_window.label)
        || card.service_window
        || card.departureTime
        || '',
    );
    const daySectionCopy = this.buildDaySectionCopy(card.day_no || card.dayNo || 0, card.date || '');
    const hotel = card.hotel
      ? {
          ...card.hotel,
          arrival_time: this.formatDisplayTime(card.hotel.arrival_time || ''),
        }
      : null;
    const pickupText = this.getDayPickupText(card);
    const departureRouteStops = pickupText || departureTime || serviceWindowText ? [{
      id: `${card.day_no || card.dayNo || 'today'}-departure`,
      time: departureTime || serviceWindowText || '',
      title: '上车出发',
      subtitle: this.formatPickupLine(pickupText) || '预计出发',
      pickupAddress: pickupText,
      isDeparture: true,
    }] : [];
    const routeStops = [
      ...departureRouteStops,
      ...destinationCards,
    ].map((item, index, visibleItems) => {
      const nextItem = visibleItems[index + 1] || null;
      const connectorTravelMeta = this.getConnectorTravelMeta(nextItem, item);
      return {
        id: item.card_id || item.id,
        card_id: item.card_id || item.id,
        card_type: item.card_type || item.cardType || item.type || item.item_type || '',
        type: item.type || item.item_type || item.card_type || '',
        item_type: item.item_type || item.type || item.card_type || '',
        day_no: item.day_no || item.dayNo || card.day_no || card.dayNo || 0,
        sequence: item.sequence || 0,
        parent_group_id: item.parent_group_id || item.parentGroupId || '',
        parent_group_title: item.parent_group_title || item.parentGroupTitle || '',
        group_sequence: item.group_sequence || item.groupSequence || 0,
        display_snapshot: item.display_snapshot || item.displaySnapshot || null,
        time_snapshot: item.time_snapshot || item.timeSnapshot || null,
        travel_snapshot: item.travel_snapshot || item.travelSnapshot || null,
        route_check_id: item.route_check_id || item.routeCheckId || '',
        hotel_stay_id: item.hotel_stay_id || item.stay_id || '',
        time: item.time,
        title: item.title,
        subtitle: item.subtitle || item.location || item.location_name || item.city || '',
        location: item.location || item.location_name || '',
        location_name: item.location_name || item.location || '',
        pickupAddress: item.pickupAddress || '',
        isDeparture: Boolean(item.isDeparture),
        legMeta: item.legMeta || '',
        travelMeta: item.travelMeta || item.travel_meta || null,
        travel_meta: item.travel_meta || item.travelMeta || null,
        connectorTravelMeta,
        connector_travel_meta: connectorTravelMeta,
        driveText: item.driveText || '',
        distanceText: item.distanceText || '',
        trafficText: item.trafficText || '',
        trafficLevel: item.trafficLevel || 'unknown',
      };
    });
    const overviewNodeSet = this.buildOverviewNodeSet(routeStops, {
      dayNo: card.day_no || card.dayNo || 0,
      city: card.city_summary || card.city || '',
      nodeCount: destinationCards.length,
    });
    return {
      ...card,
      driver_visibility: driverVisibility,
      dayLabel: `Trip ${card.trip_no || card.trip_id || ''} · Day ${card.day_no || ''}`,
      isPhoneToday: daySectionCopy.isPhoneToday,
      sectionKicker: daySectionCopy.isPhoneToday ? (card.sectionKicker || card.section_kicker || daySectionCopy.sectionKicker) : daySectionCopy.sectionKicker,
      sectionTitle: daySectionCopy.isPhoneToday ? (card.sectionTitle || card.section_title || daySectionCopy.sectionTitle) : daySectionCopy.sectionTitle,
      dateRouteText: `${card.weekday || ''}${card.date ? ` · ${card.date}` : ''}${card.city_summary ? ` · ${card.city_summary}` : ''}`,
      overviewSubtitle: this.buildOverviewSubtitle(card.day_no || card.dayNo || 0, card.weekday || '', card.date || ''),
      timeline_items: timelineItems,
      destination_cards: destinationCards,
      serviceWindowText,
      departureTime,
      estimated_departure_time_raw: card.estimated_departure_time_raw || card.estimatedDepartureTimeRaw || '',
      estimated_departure_time: card.estimated_departure_time || card.estimatedDepartureTime || departureTime || '',
      startTime: departureTime || card.startTime || card.start_time_text || '',
      transportTitle: (card.transport_summary && card.transport_summary.title) || (card.service_type === 'charter' ? '今日包车服务' : '今日接送安排'),
      transportStatusText: driverAssigned
        ? ''
        : ((card.transport_summary && card.transport_summary.status_text) || '车辆已确认，司机信息待同步'),
      routeStops,
      ...overviewNodeSet,
      nodeCount: destinationCards.length,
      extraNodeCount: 0,
      hotel,
      advisor: card.advisor || {},
      driver: driverAssigned ? normalizedDriver : null,
      driverPendingText: driverAssigned ? '' : '司机信息将在 Farland 完成确认后同步。',
      trustStatusText: card.status_text || '',
      updatedAtText: (() => {
        if (!card.last_updated_at) return '';
        const clock = this.extractTimeForDisplay(card.last_updated_at);
        return /\d{1,2}:\d{2}/.test(clock) ? `更新于 ${clock}` : '';
      })(),
      changeSummaryText: card.change_summary || '',
      serviceWindowLine: [card.vehicle_summary, card.party_summary].filter(Boolean).join(' · '),
      nextDayTeaserText: card.next_day_teaser || '',
      contactAdvisorLabel: (card.advisor && card.advisor.contact_label) || '联系顾问',
    };
  },

  buildTodayDriverCard(todayCard) {
    if (!todayCard) return null;
    const driver = todayCard.driver || null;
    const isAssigned = Boolean(driver);
    const shouldOpenTransfer = Boolean(todayCard.assigned_request_id && todayCard.service_type !== 'charter');
    const departureTime = this.extractTimeForDisplay(
      todayCard.estimated_departure_time_raw
        || todayCard.estimatedDepartureTimeRaw
        || todayCard.estimated_departure_time
        || todayCard.estimatedDepartureTime
        || todayCard.start_time_text
        || todayCard.depart_time
        || todayCard.serviceWindowText
        || todayCard.departureTime
        || '',
    ) || '待确认';
    const vehicleSummary = todayCard.vehicle_summary || '车辆待确认';
    const serviceLines = this.buildVehicleServiceLines({ departureTime, vehicleSummary, driver });
    const dayCopy = this.buildDaySectionCopy(todayCard.day_no || todayCard.dayNo || 0, todayCard.date || '', '今日用车', '用车');
    return {
      title: dayCopy.sectionTitle,
      sectionKicker: dayCopy.sectionKicker,
      sectionTitle: dayCopy.sectionTitle,
      statusText: isAssigned ? '' : (todayCard.transportStatusText || '司机信息待同步'),
      statusClass: isAssigned ? 'confirmed' : 'pending',
      departureTime,
      vehicleSummary,
      serviceSummaryLine: serviceLines.serviceSummaryLine,
      departureLine: serviceLines.departureLine,
      driverLine: serviceLines.driverLine,
      vehicleLine: serviceLines.vehicleLine,
      plateLine: serviceLines.plateLine,
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
    const dates = this.resolveHotelStayDates(card);
    const roomSummary = this.resolveHotelRoomSummary(card);
    const confirmationNo = this.resolveHotelConfirmationNo(card);
    const confirmationDisplay = this.isEmptyHotelBookingInfo(confirmationNo) ? '无酒店预订信息' : confirmationNo;
    const dateText = card.date_text
      || card.dateText
      || [dates.checkInDate, dates.checkOutDate].filter(Boolean).join(' - ');
    const hotelDetailItems = this.buildHotelSummaryDetailItems({
      checkInDate: dates.checkInDate,
      checkOutDate: dates.checkOutDate,
      roomSummary,
      confirmationNo: confirmationDisplay,
    });
    return {
      ...card,
      visible: true,
      sectionTitle: '今晚住宿',
      hotel_id: card.hotel_id || card.id || '',
      name: card.name || card.hotel_name || '今晚住宿',
      metaText: metaParts.join(' · '),
      arrivalText: card.arrival_time ? `预计入住：${this.formatDisplayTime(card.arrival_time)}` : '',
      checkInDate: dates.checkInDate || '',
      checkOutDate: dates.checkOutDate || '',
      dateText,
      roomSummary,
      confirmationNo: confirmationDisplay,
      hotelDetailItems,
      statusText: card.status_text || '已同步',
      note: card.note || '完整酒店信息将由 Farland 顾问同步。',
    };
  },

  buildTodayHotelCard(todayCard) {
    if (!todayCard || !todayCard.hotel) return null;
    const hotel = todayCard.hotel;
    const metaParts = [hotel.group, hotel.brand, hotel.star_rating ? `${hotel.star_rating}星` : ''].filter(Boolean);
    const dates = this.resolveHotelStayDates({
      ...hotel,
      date: hotel.date || todayCard.date || '',
    });
    const roomSummary = this.resolveHotelRoomSummary(hotel);
    const confirmationNo = this.resolveHotelConfirmationNo(hotel);
    const confirmationDisplay = this.isEmptyHotelBookingInfo(confirmationNo) ? '无酒店预订信息' : confirmationNo;
    const dateText = hotel.date_text
      || [dates.checkInDate, dates.checkOutDate].filter(Boolean).join(' - ');
    const hotelDetailItems = this.buildHotelSummaryDetailItems({
      checkInDate: dates.checkInDate,
      checkOutDate: dates.checkOutDate,
      roomSummary,
      confirmationNo: confirmationDisplay,
    });
    return {
      visible: true,
      sectionTitle: '今晚住宿',
      hotel_id: hotel.hotel_id || hotel.id || '',
      name: hotel.name || hotel.hotel_name || '今晚住宿',
      group: hotel.group || '',
      brand: hotel.brand || '',
      star_rating: hotel.star_rating || '',
      metaText: metaParts.join(' · '),
      city: hotel.city || '',
      address: hotel.address || '',
      check_in_date: dates.checkInDate || '',
      check_out_date: dates.checkOutDate || '',
      checkInDate: dates.checkInDate || '',
      checkOutDate: dates.checkOutDate || '',
      dateText,
      arrival_time: this.formatDisplayTime(hotel.arrival_time || ''),
      arrivalText: hotel.arrival_time ? `预计入住：${this.formatDisplayTime(hotel.arrival_time)}` : '',
      roomSummary,
      confirmationNo: confirmationDisplay,
      confirmation_no: hotel.confirmation_no || hotel.confirmation_number || '',
      hotelDetailItems,
      statusText: hotel.status_text || '已同步',
      note: hotel.note || hotel.customer_note || '完整酒店信息将由 Farland 顾问同步。',
    };
  },

  buildHotelSummaryDetailItems(hotel = {}) {
    const roomSummary = hotel.roomSummary || hotel.room_summary || hotel.room_type || '无酒店预订信息';
    const confirmationNo = hotel.confirmationNo || hotel.confirmation_no || hotel.confirmation_number || '无酒店预订信息';
    const roomMuted = this.isEmptyHotelBookingInfo(roomSummary);
    const confirmationMuted = this.isEmptyHotelBookingInfo(confirmationNo);
    return [
      { label: '入住日期', value: hotel.checkInDate || hotel.check_in_date || '待同步' },
      { label: '退房日期', value: hotel.checkOutDate || hotel.check_out_date || '待同步' },
      { label: '房型', value: roomMuted ? '无酒店预订信息' : roomSummary, muted: roomMuted },
      { label: '确认号', value: confirmationMuted ? '无酒店预订信息' : confirmationNo, muted: confirmationMuted },
    ];
  },

  resolveHotelStayDates(hotel = {}) {
    const dateText = hotel.date_text || hotel.dateText || '';
    const isoDates = String(dateText || '').match(/\d{4}-\d{2}-\d{2}/g) || [];
    const splitDates = isoDates.length
      ? isoDates
      : String(dateText || '')
        .split(/\s+(?:-|–|—|至|到)\s+/)
        .map((item) => item.trim())
        .filter(Boolean);
    const fallbackDates = this.resolveKnownTrip091HotelDates(hotel);
    const rangedCheckInDate = splitDates.length > 1 ? splitDates[0] : '';
    const singleCheckInDate = splitDates.length === 1 ? splitDates[0] : '';
    return {
      checkInDate: hotel.check_in_date || hotel.checkInDate || rangedCheckInDate || fallbackDates.checkInDate || hotel.date || singleCheckInDate || '',
      checkOutDate: hotel.check_out_date || hotel.checkOutDate || splitDates[1] || fallbackDates.checkOutDate || '',
    };
  },

  // 091 兜底仅在酒店确属 091 时生效(stay_/091_ 前缀 id 或 trip_no 2026XBC091);
  // 否则任意 elong 酒店名字含 hyatt/kop 就会被注入 091 写死的日期/确认号。C4 将整体删除。
  isTrip091HotelContext(hotel = {}) {
    const tripNo = String(hotel.trip_no || hotel.external_trip_id || '');
    if (tripNo === '2026XBC091') return true;
    const idKey = String(hotel.card_id || hotel.stay_id || hotel.hotel_stay_id || '');
    return idKey.indexOf('091_') === 0 || idKey.indexOf('stay_') === 0;
  },

  resolveKnownTrip091HotelDates(hotel = {}) {
    if (!this.isTrip091HotelContext(hotel)) return {};
    const key = [
      hotel.stay_id,
      hotel.hotel_stay_id,
      hotel.hotel_id,
      hotel.id,
      hotel.name,
      hotel.hotel_name,
      hotel.title,
      hotel.metaText,
    ].filter(Boolean).join(' ').toLowerCase();
    if (!key) return {};
    if (key.includes('renaissance') || key.includes('providence')) {
      return { checkInDate: '2026-06-05', checkOutDate: '2026-06-06' };
    }
    if (key.includes('hilton') || key.includes('wallingford')) {
      return { checkInDate: '2026-06-06', checkOutDate: '2026-06-07' };
    }
    if (key.includes('riu') || key.includes('manhattan times square')) {
      return { checkInDate: '2026-06-07', checkOutDate: '2026-06-09' };
    }
    if (key.includes('hyatt') || key.includes('king of prussia') || key.includes('kop')) {
      return { checkInDate: '2026-06-09', checkOutDate: '2026-06-10' };
    }
    if (key.includes('glover') || key.includes('georgetown')) {
      return { checkInDate: '2026-06-10', checkOutDate: '2026-06-12' };
    }
    if (key.includes('study') || key.includes('university of chicago')) {
      return { checkInDate: '2026-06-12', checkOutDate: '2026-06-13' };
    }
    return {};
  },

  resolveKnownTrip091HotelBookingInfo(hotel = {}) {
    if (!this.isTrip091HotelContext(hotel)) return {};
    const key = [
      hotel.stay_id,
      hotel.hotel_stay_id,
      hotel.hotel_id,
      hotel.id,
      hotel.name,
      hotel.hotel_name,
      hotel.title,
      hotel.metaText,
    ].filter(Boolean).join(' ').toLowerCase();
    if (key.includes('stay_hyatt_kop_day5')
      || key.includes('hyatt')
      || key.includes('king of prussia')
      || key.includes('kop')) {
      return {
        roomSummary: 'Guestroom Double Queen',
        confirmationNo: '#660610',
      };
    }
    return {};
  },

  resolveHotelRoomSummary(hotel = {}) {
    const knownBooking = this.resolveKnownTrip091HotelBookingInfo(hotel);
    const value = hotel.roomSummary || hotel.room_summary || hotel.room_type || '';
    if (this.isEmptyHotelBookingInfo(value)) {
      return knownBooking.roomSummary || '无酒店预订信息';
    }
    return value || knownBooking.roomSummary || '无酒店预订信息';
  },

  resolveHotelConfirmationNo(hotel = {}) {
    const knownBooking = this.resolveKnownTrip091HotelBookingInfo(hotel);
    const value = hotel.confirmationNo || hotel.confirmation_no || hotel.confirmation_number || '';
    if (this.isEmptyHotelBookingInfo(value)) return knownBooking.confirmationNo || '无酒店预订信息';
    return value;
  },

  isEmptyHotelBookingInfo(value = '') {
    const text = String(value || '').trim();
    return !text || text === '待同步' || text === '自行预定' || text === '酒店自行预定' || text === '无酒店预订信息';
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
        start_time_text: day.estimated_departure_time_raw || day.estimated_departure_time || day.start_time_text || day.start_time || '',
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
        startTime: this.resolveDayDepartureTime(normalizedDetail, card) || normalizedDetail.startTime || '',
        estimatedDepartureTimeRaw: normalizedDetail.estimatedDepartureTimeRaw || card.estimated_departure_time_raw || '',
        estimatedDepartureTime: normalizedDetail.estimatedDepartureTime || card.estimated_departure_time || '',
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
    const transportSummary = day.transportSummary || day.transport_summary || {};
    const assignedDriver = this.normalizeAssignedDriver(
      transportSummary.driver
        || transportSummary.assigned_transport
        || {
          name: transportSummary.driver_name || '',
          phone: transportSummary.driver_phone || '',
          vehicle_model: transportSummary.vehicle_model || '',
          vehicle_color: transportSummary.vehicle_color || '',
          vehicle_type: transportSummary.vehicle_type || transportSummary.vehicle_class || '',
          plate_number: transportSummary.plate_number || '',
        },
    );
    const driverVisibility = transportSummary.driver_visibility
      || (assignedDriver && (assignedDriver.name || assignedDriver.phone) ? 'assigned' : 'pending');
    const isDriverAssigned = driverVisibility === 'assigned' && assignedDriver;
    const rawTimelineItems = day.timelineItems || [];
    const routeStopSource = rawTimelineItems.map((item, index) => ({
      ...item,
      ...this.normalizeRouteLegMeta(item),
      id: item.id || `${dayNo}-${index}`,
      time: item.time || '',
      title: item.title || '行程节点',
      subtitle: item.location || item.location_name || item.city || '',
    }));
    const pickupText = this.getDayPickupText(day);
    const departureTime = this.resolveDayDepartureTime(day);
    const departureRouteStops = pickupText || departureTime ? [{
      id: `${dayNo}-departure`,
      time: departureTime,
      title: '上车出发',
      subtitle: this.formatPickupLine(pickupText) || '预计出发',
      pickupAddress: pickupText,
      isDeparture: true,
    }] : [];
    const visibleRouteStops = [
      ...departureRouteStops,
      ...routeStopSource,
    ];
    const routeStops = visibleRouteStops.map((item, index) => {
      const nextItem = visibleRouteStops[index + 1] || null;
      const connectorTravelMeta = this.getConnectorTravelMeta(nextItem, item);
      return {
        ...item,
        connectorTravelMeta,
        connector_travel_meta: connectorTravelMeta,
      };
    });
    const overviewNodeSet = this.buildOverviewNodeSet(routeStops, {
      dayNo,
      city: day.city || overview.city_summary || overview.city_route_text || '',
      nodeCount: rawTimelineItems.length,
    });
    const timelineItems = rawTimelineItems.map((item, index) => ({
      ...this.normalizeRouteLegMeta(item),
      card_id: item.card_id || item.id || `${dayNo}-${index}`,
      card_type: item.card_type || item.cardType || item.type || item.item_type || 'custom',
      sequence: item.sequence || index + 1,
      total_count: item.total_count || (day.timelineItems || []).length,
      parent_group_id: item.parent_group_id || item.parentGroupId || '',
      parent_group_title: item.parent_group_title || item.parentGroupTitle || '',
      group_sequence: item.group_sequence || item.groupSequence || 0,
      entity_ref: item.entity_ref || item.entityRef || null,
      display_snapshot: item.display_snapshot || item.displaySnapshot || null,
      time_snapshot: item.time_snapshot || item.timeSnapshot || null,
      travel_snapshot: item.travel_snapshot || item.travelSnapshot || null,
      route_check_id: item.route_check_id || item.routeCheckId || '',
      ui_flags: item.ui_flags || item.uiFlags || null,
      hotel_stay_id: item.hotel_stay_id || item.stay_id || '',
      id: item.id || `${dayNo}-${index}`,
      item_id: item.id || `${dayNo}-${index}`,
      type: item.type || item.item_type || 'custom',
      time: item.time || '',
      title: item.title || '行程节点',
      location: item.location || item.location_name || '',
      route: item.route || '',
      drive_time: item.driveText || item.drive_time_text || (item.travel_snapshot && item.travel_snapshot.drive_time_text) || '',
      distance: item.distanceText || item.distance_text || (item.travel_snapshot && item.travel_snapshot.distance_text) || '',
      traffic_level: item.trafficText || item.traffic_text || (item.travel_snapshot && item.travel_snapshot.traffic_text) || '',
      note: item.note || item.customer_note || '',
      arrival_estimate: item.arrival_estimate || '',
      next_stop: item.next_stop || '',
      latitude: item.latitude || item.lat || item.map_latitude || '',
      longitude: item.longitude || item.lng || item.map_longitude || '',
      map_url: item.map_url || '',
    }));
    const daySectionCopy = this.buildDaySectionCopy(dayNo, day.date || '');
    const cardStatusText = day.hasTimeConflict ? '待复核' : '已确认';
    const cardVehicleSummary = day.transportBadge || transportSummary.vehicle_summary || transportSummary.vehicle_class || '车辆待确认';
    const cardPartySummary = transportSummary.party_summary || '';
    const cardAdvisor = context.advisor || {};
    const lastUpdatedAtRaw = day.last_updated_at || day.lastUpdatedAt || overview.last_updated_at || overview.lastUpdatedAt || '';
    return {
      trip_id: tripId,
      trip_no: tripNo,
      day_no: dayNo,
      dayNo,
      dayLabel: tripNo ? `Trip ${tripNo} · Day ${dayNo}` : `Day ${dayNo}`,
      date: day.date || '',
      weekday: day.weekday || '',
      dateRouteText: [day.weekday || '', day.date || '', day.city || overview.city_summary || overview.city_route_text || ''].filter(Boolean).join(' · '),
      overviewSubtitle: this.buildOverviewSubtitle(dayNo, day.weekday || '', day.date || ''),
      status_text: day.hasTimeConflict ? '待复核' : '已确认',
      title: day.title || `Day ${dayNo}`,
      city: day.city || overview.city_summary || overview.city_route_text || '',
      city_summary: day.city || overview.city_summary || overview.city_route_text || '',
      isPhoneToday: daySectionCopy.isPhoneToday,
      sectionKicker: daySectionCopy.sectionKicker,
      sectionTitle: daySectionCopy.sectionTitle,
      service_type: transportSummary.service_type || transportSummary.type || 'charter',
      startTime: departureTime || day.startTime || '',
      departureTime,
      estimated_departure_time_raw: day.estimatedDepartureTimeRaw || day.estimated_departure_time_raw || '',
      estimated_departure_time: day.estimatedDepartureTime || day.estimated_departure_time || departureTime || '',
      depart_time: departureTime || day.startTime || '',
      service_window: departureTime ? { label: `${departureTime} 出发` } : null,
      vehicle_summary: day.transportBadge || transportSummary.vehicle_summary || transportSummary.vehicle_class || '车辆待确认',
      party_summary: transportSummary.party_summary || '',
      transport_summary: transportSummary && Object.keys(transportSummary).length ? transportSummary : (day.transportBadge ? { title: day.transportBadge } : null),
      driver_visibility: isDriverAssigned ? 'assigned' : 'pending',
      driver: isDriverAssigned ? assignedDriver : null,
      assigned_transport: isDriverAssigned ? assignedDriver : null,
      routeStops,
      ...overviewNodeSet,
      timeline_items: timelineItems,
      destination_cards: timelineItems.map((item, index) => ({
        ...item,
        card_id: item.card_id || item.id || `${dayNo}-${index}`,
        sequence: index + 1,
        chipLabel: `${item.time || ''} ${item.title || ''}`.trim(),
      })),
      nodeCount: rawTimelineItems.length,
      extraNodeCount: 0,
      hotel: day.hotel ? {
        ...day.hotel,
        name: day.hotel.name || day.hotel.hotel_name || day.hotel.title || day.hotelBadge || '酒店安排',
      } : (day.hotelBadge ? { name: day.hotelBadge, arrival_time: '', address: '' } : null),
      advisor: cardAdvisor,
      trustStatusText: cardStatusText || '',
      updatedAtText: (() => {
        if (!lastUpdatedAtRaw) return '';
        const clock = this.extractTimeForDisplay(lastUpdatedAtRaw);
        return /\d{1,2}:\d{2}/.test(clock) ? `更新于 ${clock}` : '';
      })(),
      changeSummaryText: day.change_summary || day.changeSummary || '',
      serviceWindowLine: [cardVehicleSummary, cardPartySummary].filter(Boolean).join(' · '),
      nextDayTeaserText: day.next_day_teaser || day.nextDayTeaser || '',
      contactAdvisorLabel: (cardAdvisor && cardAdvisor.contact_label) || '联系顾问',
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
    const transportSummary = day.transportSummary || day.transport_summary || {};
    const assignedDriver = this.normalizeAssignedDriver(
      transportSummary.driver
        || transportSummary.assigned_transport
        || {
          name: transportSummary.driver_name || '',
          phone: transportSummary.driver_phone || '',
          vehicle_model: transportSummary.vehicle_model || '',
          vehicle_color: transportSummary.vehicle_color || '',
          vehicle_type: transportSummary.vehicle_type || transportSummary.vehicle_class || '',
          plate_number: transportSummary.plate_number || '',
        },
    );
    const driverVisibility = transportSummary.driver_visibility
      || (assignedDriver && (assignedDriver.name || assignedDriver.phone) ? 'assigned' : 'pending');
    const isDriverAssigned = driverVisibility === 'assigned' && assignedDriver;
    return {
      date: [day.weekday || '', day.date || ''].filter(Boolean).join(' · '),
      city: day.city || overview.city_summary || overview.city_route_text || '',
      title: day.title || `Day ${day.dayNo || day.day_no || 1}`,
      summary: day.summary || (day.startTime ? `预计出发：${day.startTime}` : ''),
      items: (day.timelineItems || []).map((item) => ({
        time: item.time || '',
        title: item.title || '行程节点',
        description: [item.location || '', item.route || '', item.driveText || '', item.distanceText || '', item.trafficText || '', item.note || ''].filter(Boolean).join(' · '),
      })),
      farland_contact: {
        name: 'Farland 顾问',
        phone: this.data.advisorPhone || '',
      },
      driver_visibility: isDriverAssigned ? 'assigned' : 'pending',
      driver: isDriverAssigned ? {
        ...assignedDriver,
        vehicle: assignedDriver.vehicleText,
      } : null,
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
    let nodes = tripProgress && Array.isArray(tripProgress.nodes)
      ? this.decorateTripProgressNodes(tripProgress.nodes, selectedDayNo, actualCurrentDayNo)
      : [];
    nodes = nodes.map((node) => {
      const matchedDay = sourceDays.find((day) => Number(day.dayNo || day.day_no || 0) === Number(node.day_no || node.dayNo || 0));
      if (!matchedDay) return node;
      return {
        ...node,
        location_summary: node.location_summary || matchedDay.locationSummary || matchedDay.location_summary || matchedDay.routeLabel || matchedDay.route_label || '',
        departure_time: node.departure_time || this.resolveDayDepartureTime(matchedDay),
      };
    });
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
    const selectedHotel = this.findHotelForTripDay(selectedDay, this.data.hotelCards || []);
    const todayHotelCard = selectedHotel ? this.normalizeTodayHotelCard({
      ...selectedHotel,
      visible: true,
      hotel_id: selectedHotel.hotel_id || selectedHotel.id,
      sectionTitle: '今晚住宿',
    }) : null;
    return {
      selectedTripDayNo: selectedDayNo,
      tripProgress: nextProgress,
      progressStrip: nextProgress,
      currentProgressSummary: this.buildCurrentProgressSummary(nextProgress),
      todayCard,
      todayDriverCard,
      todayHotelCard,
      todayItinerary: selectedDay ? this.buildTodayItineraryFromTripDay(selectedDay, overview) : this.data.todayItinerary,
    };
  },

  onDaySurfaceTouchStart(e) {
    if (this._progressAxisTouching || this._daySwipeAnimating) {
      this._daySurfaceTouch = null;
      return;
    }
    const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (!touch) return;
    this._daySurfaceTouch = {
      source: (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.source) || 'home',
      x: Number(touch.clientX || 0),
      y: Number(touch.clientY || 0),
      dragging: false,
    };
  },

  onDaySurfaceTouchMove(e) {
    const start = this._daySurfaceTouch;
    if (!start || this._progressAxisTouching || this._daySwipeAnimating) return;
    const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (!touch) return;
    const dx = Number(touch.clientX || 0) - start.x;
    const dy = Number(touch.clientY || 0) - start.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (absX < 10 || absX < absY * 1.12) return;
    const now = Date.now();
    if (now - Number(this._lastDaySwipeMoveAt || 0) < 16) return;
    this._lastDaySwipeMoveAt = now;
    start.dragging = true;
    const translateX = Math.max(-104, Math.min(104, dx * 0.42));
    const opacity = Math.max(0.88, 1 - Math.min(absX, 160) / 900);
    this.setDaySwipeStyle(start.source, this.buildDaySwipeStyle(translateX, opacity, 'none'));
  },

  onDaySurfaceTouchEnd(e) {
    const start = this._daySurfaceTouch;
    this._daySurfaceTouch = null;
    if (!start) return;
    const touch = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
    if (!touch) {
      if (start.dragging) this.resetDaySwipeStyle(start.source);
      return;
    }
    const dx = Number(touch.clientX || 0) - start.x;
    const dy = Number(touch.clientY || 0) - start.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (absX < 72 || absX < absY * 1.25) {
      if (start.dragging) this.resetDaySwipeStyle(start.source);
      return;
    }
    this.animateTripDaySwitch(dx < 0 ? 1 : -1, start.source);
  },

  buildDaySwipeStyle(translateX = 0, opacity = 1, transition = '') {
    const transform = `transform: translate3d(${Number(translateX || 0).toFixed(1)}px, 0, 0);`;
    const opacityText = `opacity: ${Math.max(0, Math.min(1, Number(opacity || 1))).toFixed(3)};`;
    const transitionText = transition ? `transition: ${transition};` : '';
    return `${transform}${opacityText}${transitionText}`;
  },

  setDaySwipeStyle(source = 'home', style = '') {
    const key = source === 'invite' ? 'inviteDaySwipeStyle' : 'homeDaySwipeStyle';
    this.setData({ [key]: style });
  },

  resetDaySwipeStyle(source = 'home') {
    this.setDaySwipeStyle(source, this.buildDaySwipeStyle(0, 1, 'transform 180ms ease, opacity 180ms ease'));
    setTimeout(() => {
      this.setDaySwipeStyle(source, '');
    }, 200);
  },

  animateTripDaySwitch(delta, source = 'home') {
    if (!delta || this._daySwipeAnimating) return;
    const hasNext = this.hasAdjacentTripDay(source, delta);
    if (!hasNext) {
      this.resetDaySwipeStyle(source);
      return;
    }
    this._daySwipeAnimating = true;
    const exitX = delta > 0 ? -176 : 176;
    const enterX = delta > 0 ? 132 : -132;
    this.setDaySwipeStyle(source, this.buildDaySwipeStyle(exitX, 0.45, 'transform 160ms ease, opacity 160ms ease'));
    setTimeout(() => {
      const switched = this.switchTripDayByDelta(delta, source, {
        afterCommit: () => {
          this.setDaySwipeStyle(source, this.buildDaySwipeStyle(enterX, 0.55, 'none'));
          const enter = () => {
            this.setDaySwipeStyle(source, this.buildDaySwipeStyle(0, 1, 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease'));
            setTimeout(() => {
              this._daySwipeAnimating = false;
              this.setDaySwipeStyle(source, '');
            }, 240);
          };
          if (typeof wx !== 'undefined' && wx.nextTick) {
            wx.nextTick(enter);
          } else {
            setTimeout(enter, 16);
          }
        },
      });
      if (!switched) {
        this._daySwipeAnimating = false;
        this.resetDaySwipeStyle(source);
      }
    }, 155);
  },

  onProgressAxisTouchStart() {
    this._progressAxisTouching = true;
    this._daySurfaceTouch = null;
  },

  onProgressAxisTouchEnd() {
    setTimeout(() => {
      this._progressAxisTouching = false;
    }, 0);
  },

  onProgressAxisScroll(e) {
    const source = (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.source) || 'home';
    const scrollLeft = Number(e.detail && e.detail.scrollLeft ? e.detail.scrollLeft : 0);
    if (source === 'invite') {
      this._inviteProgressAxisScrollLeft = scrollLeft;
      return;
    }
    this._progressAxisScrollLeft = scrollLeft;
  },

  buildProgressAxisNodeId(source = 'home', dayNo = 0) {
    return `progress-day-${source === 'invite' ? 'invite' : 'home'}-${Number(dayNo || 0)}`;
  },

  centerProgressAxisDay(dayNo = 0, source = 'home') {
    const normalizedDayNo = Number(dayNo || 0);
    const normalizedSource = source === 'invite' ? 'invite' : 'home';
    if (!normalizedDayNo || typeof wx === 'undefined' || !wx.createSelectorQuery) return;

    const stripId = `progress-strip-${normalizedSource}`;
    const nodeId = this.buildProgressAxisNodeId(normalizedSource, normalizedDayNo);
    const scrollDataKey = normalizedSource === 'invite' ? 'inviteProgressAxisScrollLeft' : 'progressAxisScrollLeft';
    const scrollCacheKey = normalizedSource === 'invite' ? '_inviteProgressAxisScrollLeft' : '_progressAxisScrollLeft';
    const runQuery = () => {
      const query = wx.createSelectorQuery().in(this);
      query.select(`#${stripId}`).boundingClientRect();
      query.select(`#${nodeId}`).boundingClientRect();
      query.exec((rects = []) => {
        const stripRect = rects[0];
        const nodeRect = rects[1];
        if (!stripRect || !nodeRect) return;
        const currentScrollLeft = Number(this[scrollCacheKey] || this.data[scrollDataKey] || 0);
        const stripCenter = Number(stripRect.left || 0) + Number(stripRect.width || 0) / 2;
        const nodeCenter = Number(nodeRect.left || 0) + Number(nodeRect.width || 0) / 2;
        const delta = nodeCenter - stripCenter;
        if (Math.abs(delta) < 2) return;
        const nextScrollLeft = Math.max(0, currentScrollLeft + delta);
        this[scrollCacheKey] = nextScrollLeft;
        this.setData({ [scrollDataKey]: nextScrollLeft });
      });
    };

    if (wx.nextTick) {
      wx.nextTick(runQuery);
    } else {
      setTimeout(runQuery, 0);
    }
  },

  hasAdjacentTripDay(source = 'home', delta = 0) {
    if (!delta) return false;
    if (source === 'invite') {
      const trip = this.data.tripInviteTrip;
      if (!trip || !Array.isArray(trip.days) || trip.days.length < 2) return false;
      const currentDayNo = Number(trip.selectedDayNo || trip.selected_day_no || this.data.selectedTripDayNo || 0);
      const nextDayNo = this.resolveAdjacentTripDayNo(trip.days, currentDayNo, delta);
      return Boolean(nextDayNo && nextDayNo !== currentDayNo);
    }
    const sourceDays = this.data.tripDayCards && this.data.tripDayCards.length
      ? this.data.tripDayCards
      : (this.data.operatorPreviewDays || []);
    if (!Array.isArray(sourceDays) || sourceDays.length < 2) return false;
    const currentDayNo = Number(this.data.selectedTripDayNo || 0);
    const nextDayNo = this.resolveAdjacentTripDayNo(sourceDays, currentDayNo, delta);
    return Boolean(nextDayNo && nextDayNo !== currentDayNo);
  },

  switchTripDayByDelta(delta, source = 'home', options = {}) {
    if (!delta) return false;
    if (source === 'invite') {
      const trip = this.data.tripInviteTrip;
      if (!trip || !Array.isArray(trip.days) || trip.days.length < 2) return false;
      const currentDayNo = Number(trip.selectedDayNo || trip.selected_day_no || this.data.selectedTripDayNo || 0);
      const nextDayNo = this.resolveAdjacentTripDayNo(trip.days, currentDayNo, delta);
      if (!nextDayNo || nextDayNo === currentDayNo) return false;
      const nextTrip = this.applySelectedDayToPublishedTrip(trip, nextDayNo);
      this.setData({
        ...this.buildTripInviteSurfaceState(nextTrip),
        tripInviteTrip: nextTrip,
        selectedTripDayNo: nextDayNo,
        inviteTodayOverviewExpanded: false,
      }, () => {
        this.centerProgressAxisDay(nextDayNo, 'invite');
        if (typeof options.afterCommit === 'function') options.afterCommit(nextDayNo);
      });
      return true;
    }

    const sourceDays = this.data.tripDayCards && this.data.tripDayCards.length
      ? this.data.tripDayCards
      : (this.data.operatorPreviewDays || []);
    if (!Array.isArray(sourceDays) || sourceDays.length < 2) return false;
    const currentDayNo = Number(this.data.selectedTripDayNo || 0);
    const nextDayNo = this.resolveAdjacentTripDayNo(sourceDays, currentDayNo, delta);
    if (!nextDayNo || nextDayNo === currentDayNo) return false;
    const nextState = this.buildSelectedHomeDayState(nextDayNo);
    if (!nextState || !nextState.selectedTripDayNo) return false;
    this.setData({
      ...nextState,
      todayOverviewExpanded: false,
    }, () => {
      this.centerProgressAxisDay(nextDayNo, 'home');
      if (typeof options.afterCommit === 'function') options.afterCommit(nextDayNo);
    });
    return true;
  },

  resolveAdjacentTripDayNo(days = [], currentDayNo = 0, delta = 0) {
    const normalizedDays = (Array.isArray(days) ? days : [])
      .map((day, index) => ({
        dayNo: Number(day.dayNo || day.day_no || index + 1),
        index,
      }))
      .filter((day) => day.dayNo)
      .sort((a, b) => a.dayNo - b.dayNo);
    if (!normalizedDays.length) return 0;
    const current = Number(currentDayNo || 0);
    const currentIndex = normalizedDays.findIndex((day) => day.dayNo === current);
    const fallbackIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = Math.max(0, Math.min(normalizedDays.length - 1, fallbackIndex + (delta > 0 ? 1 : -1)));
    return normalizedDays[nextIndex].dayNo;
  },

  selectTripProgressDay(e) {
    const dayNo = Number(e.currentTarget.dataset.dayNo || 0);
    const source = e.currentTarget.dataset.source || 'home';
    if (!dayNo) return;

    if (source === 'invite') {
      const trip = this.data.tripInviteTrip;
      if (!trip || !Array.isArray(trip.days) || !trip.days.length) return;
      const nextTrip = this.applySelectedDayToPublishedTrip(trip, dayNo);
      this.setData({
        ...this.buildTripInviteSurfaceState(nextTrip),
        tripInviteTrip: nextTrip,
        selectedTripDayNo: dayNo,
        inviteTodayOverviewExpanded: false,
      }, () => {
        this.centerProgressAxisDay(dayNo, 'invite');
      });
      return;
    }

    const nextState = this.buildSelectedHomeDayState(dayNo);
    if (!nextState || !nextState.selectedTripDayNo) return;
    this.setData({
      ...nextState,
      todayOverviewExpanded: false,
    }, () => {
      this.centerProgressAxisDay(dayNo, 'home');
    });
  },

  toggleTodayOverviewExpanded(e) {
    const source = (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.source) || 'home';
    if (source === 'invite') {
      const card = this.data.tripInviteTrip && this.data.tripInviteTrip.todayOverviewCard
        ? this.data.tripInviteTrip.todayOverviewCard
        : null;
      if (!card || !card.overviewCanExpand) return;
      const expanded = !this.data.inviteTodayOverviewExpanded;
      this.setData({
        inviteTodayOverviewExpanded: expanded,
        'tripInviteTrip.todayOverviewCard.displayRouteStops': expanded
          ? (card.fullNodes || card.routeStops || [])
          : (card.summaryNodes || card.routeStops || []),
      });
      return;
    }

    const card = this.data.todayCard || null;
    if (!card || !card.overviewCanExpand) return;
    const expanded = !this.data.todayOverviewExpanded;
    this.setData({
      todayOverviewExpanded: expanded,
      'todayCard.displayRouteStops': expanded
        ? (card.fullNodes || card.routeStops || [])
        : (card.summaryNodes || card.routeStops || []),
    });
  },

  normalizeCustomerVisitCards(list) {
    return (Array.isArray(list) ? list : [])
      .filter((card) => card && card.start_time && card.school_name)
      .map((card) => {
        const durationText = (card.duration_min != null && card.duration_min !== '')
          ? ` · 约 ${card.duration_min} 分钟`
          : '';
        const timeRangeText = card.end_time
          ? `– ${this.formatDisplayTime(card.end_time)}${durationText}`
          : '';
        const arriveEarlyText = (card.arrive_early_min != null && card.arrive_early_min !== '')
          ? `请提前 ${card.arrive_early_min} 分钟`
          : '';
        const transportText = card.transport_note ? String(card.transport_note) : '';
        const arriveText = [arriveEarlyText, transportText].filter(Boolean).join(' · ');
        const weather = card.weather || null;
        const weatherText = (weather && weather.hi != null && weather.hi !== '')
          ? `${weather.hi}/${weather.lo}°C`
          : '';
        const weatherKind = (weather && weather.kind) || 'sun';
        return {
          ...card,
          startTimeText: this.formatDisplayTime(card.start_time),
          timeRangeText,
          arriveText,
          weatherText,
          weatherKind,
        };
      });
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
          phoneDateKey: this.getTodayDateKey(),
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
      const inviteSurface = this.buildTripInviteSurfaceState(trip, {
        syncStatusText: result.auto_saved || result.already_saved ? '行程已同步' : '临时查看',
      });
      this.setData({
        ...inviteSurface,
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
        phoneDateKey: this.getTodayDateKey(),
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
      }, () => {
        this.centerProgressAxisDay(trip.selectedDayNo || 0, 'invite');
        this.scrollToPendingCustomerHomeTarget();
      });
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

  buildTripInviteSurfaceState(trip, options = {}) {
    const sourceTrip = trip || {};
    const days = Array.isArray(sourceTrip.days) ? sourceTrip.days : [];
    const selectedDayNo = Number(sourceTrip.selectedDayNo || sourceTrip.selected_day_no || this.resolveInitialTripDayNo(days) || 0);
    const selectedDay = days.find((day) => Number(day.dayNo || day.day_no || 0) === selectedDayNo) || days[0] || null;
    const progressNodes = Array.isArray(sourceTrip.progressNodes) ? sourceTrip.progressNodes : [];
    const tripProgress = progressNodes.length > 1 ? {
      visible: true,
      mode: 'daily_nodes',
      current_day_no: sourceTrip.currentDayNo || sourceTrip.actualCurrentDayNo || selectedDayNo,
      selected_day_no: selectedDayNo,
      actual_current_day_no: sourceTrip.actualCurrentDayNo || sourceTrip.currentDayNo || selectedDayNo,
      current_node_id: (progressNodes.find((node) => Number(node.day_no || 0) === Number(sourceTrip.actualCurrentDayNo || sourceTrip.currentDayNo || selectedDayNo)) || progressNodes[0] || {}).node_id || '',
      nodes: progressNodes,
    } : null;
    const overview = {
      trip_id: sourceTrip.trip_id || sourceTrip.external_trip_id || this.data.tripInviteId || '',
      trip_no: sourceTrip.displayTripNo || sourceTrip.trip_no || '',
      title: sourceTrip.displayTitle || sourceTrip.title || 'Farland 行程',
      city_summary: sourceTrip.displayCity || sourceTrip.city || '',
      city_route_text: sourceTrip.displayCity || sourceTrip.city || '',
      date_range_text: sourceTrip.displayDateRange || '',
    };
    const todayItinerary = selectedDay ? this.buildTodayItineraryFromTripDay(selectedDay, overview) : null;
    const hasContent = Boolean(
      days.length
      || progressNodes.length
      || sourceTrip.todayOverviewCard
      || sourceTrip.todayHotelCard
      || (sourceTrip.visitCards && sourceTrip.visitCards.length)
      || (sourceTrip.hotels && sourceTrip.hotels.length)
      || (sourceTrip.flights && sourceTrip.flights.length)
    );
    const syncStatusText = options.syncStatusText
      || (this.data.operatorCustomerPreviewMode ? '运营预览' : (this.data.tripInviteAutoSaved || this.data.tripInviteAlreadySaved ? '行程已同步' : '临时查看'));

    return {
      customerSummaryBar: {
        visible: true,
        customer_display_name: sourceTrip.displayCustomer || 'Farland 客户',
        trip_no: sourceTrip.displayTripNo || '',
        date_range_text: sourceTrip.displayDateRange || '',
        display_title: sourceTrip.displayCompactTitle || sourceTrip.displayTitle || 'Farland 行程',
        display_meta: sourceTrip.displayCompactMeta || [sourceTrip.displayTripNo || '', sourceTrip.displayDateRange || ''].filter(Boolean).join(' · '),
        city_route_text: sourceTrip.displayCity || '',
        trip_summary_text: sourceTrip.displaySummary || '',
        thank_you_text: '感谢您使用 Farland 的服务',
        sync_status_text: syncStatusText,
        communication_note: '后续沟通请以客户群为准',
      },
      tripProgress,
      progressStrip: tripProgress,
      currentProgressSummary: sourceTrip.currentProgressSummary || this.buildCurrentProgressSummary(tripProgress),
      selectedTripDayNo: selectedDayNo,
      todayCard: sourceTrip.todayOverviewCard || null,
      dailyCharter: null,
      todayDriverCard: sourceTrip.todayDriverCard || null,
      todayHotelCard: sourceTrip.todayHotelCard || null,
      visitCards: sourceTrip.visitCards || [],
      todayItinerary,
      showHomeEmpty: !hasContent,
      showLegacyTransport: false,
      nextConfirmed: selectedDay ? {
        title: selectedDay.title || '今日行程',
        date: [selectedDay.weekday, selectedDay.date].filter(Boolean).join(' · '),
        time: selectedDay.startTime || '',
        city: selectedDay.city || '',
      } : {
        title: sourceTrip.displayTitle || 'Farland 行程',
        date: sourceTrip.displayDateRange || '',
        time: '',
        city: sourceTrip.displayCity || '',
      },
      tripOverview: [overview],
      tripDayCards: days,
      flightCards: sourceTrip.flights || [],
      hotelCards: sourceTrip.hotels || [],
      transferRequests: [],
      primaryTransfer: null,
      transportOrders: [],
      showTransferRequests: false,
      useHomePaneSwiper: false,
      homePaneIndex: 0,
      hasCharterHomeSurface: hasContent,
      hasTemporaryTransportSurface: false,
      charterServices: [],
    };
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
    const selectedHotel = this.findHotelForTripDay(selectedDay, trip.hotels || []);
    const todayHotelCard = selectedHotel ? this.normalizeTodayHotelCard({
      ...selectedHotel,
      visible: true,
      hotel_id: selectedHotel.hotel_id || selectedHotel.id,
      sectionTitle: '今晚住宿',
    }) : null;

    return {
      ...trip,
      selectedDayNo,
      selected_day_no: selectedDayNo,
      currentDayNo: actualCurrentDayNo,
      actualCurrentDayNo,
      progressNodes,
      currentProgressSummary: this.buildCurrentProgressSummary({
        visible: true,
        selected_day_no: selectedDayNo,
        current_day_no: actualCurrentDayNo,
        nodes: progressNodes,
      }),
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
      departure_time: day.startTime || '',
      estimated_departure_time_raw: day.estimatedDepartureTimeRaw || '',
      estimated_departure_time: day.estimatedDepartureTime || day.startTime || '',
      status: Number(day.dayNo || index + 1) === initialDayNo ? 'current' : 'upcoming',
      statusText: Number(day.dayNo || index + 1) === initialDayNo ? '当前' : '待前往',
    })), initialDayNo, initialDayNo);
    const displayTripNo = hero.trip_no || snapshot.trip_no || snapshot.external_trip_id || snapshot.trip_id || '';
    const displayDateRange = hero.date_range || tripSummary.date_range_text || [snapshot.start_at || snapshot.date_start || '', snapshot.end_at || snapshot.date_end || ''].filter(Boolean).join(' - ');
    const displayTitle = hero.title || snapshot.title || 'Farland 行程';
    const displayCustomer = this.normalizeCustomerDisplayName(customer.display_name || customer.name || '')
      || this.resolveDefaultCustomerNameForTrip(displayTripNo);

    return this.applySelectedDayToPublishedTrip({
      ...snapshot,
      displayTitle,
      displayCompactTitle: this.buildCompactTripTitle(displayTitle, displayCustomer, displayTripNo),
      displayTripNo,
      displayDateRange,
      displayCompactMeta: [displayTripNo, displayDateRange].filter(Boolean).join(' · '),
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
      displayCustomer,
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
      visitCards: this.normalizeCustomerVisitCards(snapshot.visit_cards || []),
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
    const draftCustomerHome = previewPayload.draft_customer_home || null;
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
      operatorDraftPreviewPayload: draftCustomerHome ? {
        customer_home: draftCustomerHome,
        preview_meta: {
          ...meta,
          operator_draft_preview: true,
        },
        preview_customer: previewCustomer,
      } : null,
      operatorPreviewDays: [],
      operatorPreviewFlights: [],
      showHomeEmpty: false,
      showLegacyTransport: false,
      hotelRequests: [],
      transportationAppointments: [],
      customerSummaryBar: null,
      tripProgress: null,
      progressStrip: null,
      currentProgressSummary: null,
      selectedTripDayNo: 0,
      todayOverviewExpanded: false,
      inviteTodayOverviewExpanded: false,
      todayCard: null,
      dailyCharter: null,
      todayDriverCard: null,
      todayHotelCard: null,
      visitCards: [],
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
    const inviteSurface = this.buildTripInviteSurfaceState(trip, {
      syncStatusText: '运营预览',
    });
    this.setData({
      ...commonState,
      ...inviteSurface,
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
      todayOverviewExpanded: false,
      inviteTodayOverviewExpanded: false,
      phoneDateKey: this.getTodayDateKey(),
      advisorPhone: trip.advisorPhone || '',
    }, () => {
      this.centerProgressAxisDay(trip.selectedDayNo || 0, 'invite');
      this.scrollToPendingCustomerHomeTarget();
    });
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
      operatorDraftPreviewPayload: null,
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
      currentProgressSummary: previewHome.currentProgressSummary,
      selectedTripDayNo: previewHome.selectedDayNo || 0,
      todayOverviewExpanded: false,
      inviteTodayOverviewExpanded: false,
      phoneDateKey: this.getTodayDateKey(),
      todayCard: previewHome.todayCard,
      dailyCharter: null,
      todayDriverCard: previewHome.todayDriverCard,
      todayHotelCard: previewHome.todayHotelCard,
      visitCards: previewHome.visitCards || [],
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
    }, () => {
      this.centerProgressAxisDay(previewHome.selectedDayNo || 0, 'home');
    });
    this.cacheTripDetailContext(previewHome.operatorPreviewDays, {
      trip_id: meta.trip_id || '',
      trip_no: (previewHome.tripOverview[0] && previewHome.tripOverview[0].trip_no) || '',
      overview: previewHome.tripOverview[0] || {},
    });
  },

  previewOperatorDraftFromWaiting() {
    const payload = this.data.operatorDraftPreviewPayload;
    if (!payload || !payload.customer_home) {
      wx.showToast({ title: '暂无草稿预览', icon: 'none' });
      return;
    }
    const meta = payload.preview_meta || {};
    const previewCustomer = payload.preview_customer || {};
    const trip = this.normalizeCustomerHomePreviewTrip(payload.customer_home, meta, previewCustomer);
    const inviteSurface = this.buildTripInviteSurfaceState(trip, {
      syncStatusText: '运营草稿预览',
    });
    this.setData({
      ...inviteSurface,
      loading: false,
      tripInviteMode: true,
      tripInviteId: meta.trip_id || this.data.tripInviteId || '',
      tripInviteTrip: trip,
      tripInviteWaiting: false,
      tripInviteMessage: '',
      tripInviteError: '',
      tripInviteCanSave: false,
      tripInviteShowSaveForm: false,
      operatorCustomerPreviewMode: true,
      operatorCustomerPreviewMeta: {
        ...meta,
        operator_draft_preview: true,
        customer_would_see: 'draft_preview',
      },
      profile: {
        name: trip.displayCustomer || previewCustomer.display_name || '客户分享卡预览',
        member_level: '运营草稿预览',
        points_balance: 0,
        subtitle: '当前页面仅供运营核对，客户正式发布前不会看到。',
      },
      selectedTripDayNo: trip.selectedDayNo || 0,
      todayOverviewExpanded: false,
      inviteTodayOverviewExpanded: false,
      phoneDateKey: this.getTodayDateKey(),
      advisorPhone: trip.advisorPhone || '',
    }, () => {
      this.centerProgressAxisDay(trip.selectedDayNo || 0, 'invite');
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
          startTime: this.resolveDayDepartureTime(normalizedDay, summary) || normalizedDay.startTime || '',
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
          startTime: this.resolveDayDepartureTime(summary) || '',
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
      status_text: order.status_text === '已分配司机' ? '' : (order.status_text || (order.order_status === 'assigned' ? '' : '用车待确认')),
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
    const profileName = this.normalizeCustomerDisplayName(previewCustomer.display_name
      || profileSource.display_name
      || '') || this.resolveDefaultCustomerNameForTrip(overview.trip_no || '') || 'Farland 客户';
    const previewTripTitle = overview.title
      || overview.trip_title
      || [overview.trip_no || '', 'Farland 行程'].filter(Boolean).join(' ')
      || 'Farland 行程';
    const todayItinerary = today ? {
      date: [today.weekday, today.date].filter(Boolean).join(' · '),
      city: today.city || overview.city_summary || '',
      title: today.title,
      summary: today.summary || (today.startTime ? `预计出发：${today.startTime}` : ''),
      items: today.timelineItems.map((item) => ({
        time: item.time,
        title: item.title,
        description: [item.location, item.route, item.driveText, item.distanceText, item.trafficText, item.note].filter(Boolean).join(' · '),
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
      departure_time: day.startTime || '',
      estimated_departure_time_raw: day.estimatedDepartureTimeRaw || '',
      estimated_departure_time: day.estimatedDepartureTime || day.startTime || '',
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
      current_summary: this.buildCurrentProgressSummary({ nodes: progressNodes, selected_day_no: selectedDayNo, current_day_no: actualCurrentDayNo }),
    } : null;
    const customerSummaryBar = {
      visible: true,
      customer_display_name: profileName,
      trip_no: overview.trip_no || '',
      date_range_text: overview.date_range_text || '',
      display_title: this.buildCompactTripTitle(previewTripTitle, '', overview.trip_no || ''),
      display_meta: [overview.trip_no || '', overview.date_range_text || ''].filter(Boolean).join(' · '),
      city_route_text: overview.city_route_text || overview.city_summary || '',
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
    const selectedHotel = this.findHotelForTripDay(today, hotelCards);
    const selectedHotelCard = selectedHotel ? this.normalizeTodayHotelCard({
      ...selectedHotel,
      visible: true,
      hotel_id: selectedHotel.hotel_id || selectedHotel.id,
      sectionTitle: '今晚住宿',
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
      currentProgressSummary: this.buildCurrentProgressSummary(tripProgress),
      selectedDayNo,
      todayCard: selectedTodayCard,
      todayDriverCard: selectedDriverCard,
      todayHotelCard: selectedHotelCard,
      visitCards: this.normalizeCustomerVisitCards(home.visit_cards || []),
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
    const tripSummary = home.trip_summary || {
      trip_id: overview.trip_id || meta.trip_id || '',
      external_trip_id: overview.external_trip_id || overview.trip_id || meta.trip_id || '',
      trip_no: overview.trip_no || '',
      title: overview.title || 'Farland 行程',
      date_range_text: overview.date_range_text || '',
      city_route_text: overview.city_route_text || overview.city_summary || '',
      days_count: overview.days_count || 0,
      hotels_count: overview.hotels_count || 0,
      flights_count: overview.flights_count || 0,
      transport_count: overview.transport_count || 0,
      next_day_label: overview.next_day_label || '',
      last_hotel_name: overview.last_hotel_name || '',
    };
    const hotelCards = Array.isArray(home.hotel_cards) && home.hotel_cards.length
      ? home.hotel_cards
      : (Array.isArray(home.hotel_requests) ? home.hotel_requests : []);
    const flightCards = Array.isArray(home.flight_cards) ? home.flight_cards : [];
    const transferRequests = [
      ...(Array.isArray(home.transportation_appointments) ? home.transportation_appointments : []),
      ...(Array.isArray(home.transfer_requests) ? home.transfer_requests : []),
    ];
    const snapshot = {
      title: overview.title || 'Farland 行程',
      trip_id: meta.trip_id || overview.trip_id || '',
      trip_no: overview.trip_no || '',
      start_at: overview.date_range_text || '',
      city: overview.city_summary || '',
      summary: overview.status_text || '',
      trip_summary: tripSummary,
      daily_summary_cards: Array.isArray(home.daily_summary_cards) ? home.daily_summary_cards : [],
      customer: {
        display_name: previewCustomer.display_name || profile.display_name || '',
      },
      advisor: {
        name: profile.advisor_name || 'Farland 顾问',
        phone: profile.advisor_phone || '',
      },
      hero: {
        title: overview.title || 'Farland 行程',
        trip_no: overview.trip_no || '',
        date_range: overview.date_range_text || '',
        city_summary: overview.city_route_text || overview.city_summary || '',
      },
      itinerary_days: Array.isArray(home.itinerary_days) ? home.itinerary_days : [],
      hotel_cards: hotelCards,
      hotels: hotelCards,
      flight_cards: flightCards,
      flights: flightCards,
      transfer_requests: transferRequests,
      transportation_appointments: Array.isArray(home.transportation_appointments) ? home.transportation_appointments : [],
      transfers: transferRequests,
      transport_orders: Array.isArray(home.transport_orders) ? home.transport_orders : [],
      charter_services: Array.isArray(home.charter_services) ? home.charter_services : [],
      visit_cards: Array.isArray(home.visit_cards) ? home.visit_cards : [],
    };
    const trip = this.normalizePublishedTrip(snapshot);
    const transportOrders = Array.isArray(home.transport_orders) ? home.transport_orders : [];
    const assignedTransports = transportOrders.map((order, index) => ({
      id: order.transport_order_id || order.request_id || `assigned-${index}`,
      title: order.driver_name || '已确认用车',
      meta: [order.vehicle_model || order.vehicle_type || '', order.plate_number || ''].filter(Boolean).join(' · '),
      note: order.driver_phone ? `电话：${order.driver_phone}` : '司机信息待同步',
    }));
    trip.transports = [...assignedTransports, ...trip.transports];
    trip.hasTransports = Boolean(trip.transports.length);
    return trip;
  },

  normalizePublishedTripDay(day, index) {
    const summaryCard = day.summary_card || {};
    const itemsSource = Array.isArray(day.destination_cards) && day.destination_cards.length
      ? day.destination_cards
      : (Array.isArray(day.cards) && day.cards.length
        ? day.cards
        : (Array.isArray(day.timeline_items)
          ? day.timeline_items
          : (Array.isArray(day.items) ? day.items : [])));
    const hotelName = summaryCard.hotel_badge
      || (day.hotel ? (day.hotel.name || day.hotel.hotel_name || day.hotel.title || '') : '');
    const transportBadge = summaryCard.transport_badge
      || (day.transport_summary ? (day.transport_summary.title || day.transport_summary.vehicle_summary || day.transport_summary.vehicle_class || '') : '');
    const startTime = this.resolveDayDepartureTime(day, summaryCard);
    return {
      id: day.day_id || day.id || `day-${day.day_no || index + 1}`,
      dayNo: day.day_no || index + 1,
      date: day.date || '',
      weekday: day.weekday || '',
      title: summaryCard.title || day.title || `Day ${day.day_no || index + 1}`,
      city: summaryCard.city || day.city || '',
      summary: day.summary || '',
      startTime,
      estimatedDepartureTimeRaw: day.estimated_departure_time_raw || day.estimatedDepartureTimeRaw || '',
      estimatedDepartureTime: day.estimated_departure_time || day.estimatedDepartureTime || startTime || '',
      start_time_text: day.start_time_text || summaryCard.start_time_text || '',
      departure_time: day.departure_time || startTime || '',
      pickupAddress: day.pickup_address || day.pickup || (day.transport_summary && (day.transport_summary.pickup_address || day.transport_summary.pickup)) || '',
      hotel: day.hotel || null,
      hotelBadge: hotelName,
      transportSummary: day.transport_summary || null,
      transportBadge,
      highlightItems: summaryCard.highlight_items || [],
      hasTimeConflict: Boolean(summaryCard.has_time_conflict || day.has_time_conflict),
      timelineItems: itemsSource.map((item, itemIndex) => ({
        card_id: item.card_id || item.item_id || item.id || `${day.day_no || index + 1}-${itemIndex}`,
        card_type: item.card_type || item.cardType || item.item_type || item.type || 'custom',
        sequence: item.sequence || itemIndex + 1,
        total_count: item.total_count || itemsSource.length,
        parent_group_id: item.parent_group_id || item.parentGroupId || '',
        parent_group_title: item.parent_group_title || item.parentGroupTitle || '',
        group_sequence: item.group_sequence || item.groupSequence || 0,
        entity_ref: item.entity_ref || item.entityRef || null,
        display_snapshot: item.display_snapshot || item.displaySnapshot || null,
        time_snapshot: item.time_snapshot || item.timeSnapshot || null,
        travel_snapshot: item.travel_snapshot || item.travelSnapshot || null,
        route_check_id: item.route_check_id || item.routeCheckId || '',
        ui_flags: item.ui_flags || item.uiFlags || null,
        hotel_stay_id: item.hotel_stay_id || item.stay_id || '',
        source_refs: item.source_refs || item.sourceRefs || [],
        content_verified_at: item.content_verified_at || item.contentVerifiedAt || '',
        content_quality_status: item.content_quality_status || item.contentQualityStatus || '',
        id: item.item_id || item.id || `${day.day_no || index + 1}-${itemIndex}`,
        type: item.item_type || item.type || 'custom',
        item_type: item.item_type || item.type || 'custom',
        time: this.formatDisplayTime(item.time || item.planned_start_time || item.planned_arrival_time || ''),
        title: item.title || '行程节点',
        location: item.location_name || item.location || '',
        route: item.route || [item.from || item.origin || item.departure_airport || '', item.to || item.destination || item.arrival_airport || ''].filter(Boolean).join(' → '),
        note: item.customer_note || item.note || item.description || '',
        driveText: item.drive_time_text || item.drive_time || (item.travel_snapshot && item.travel_snapshot.drive_time_text) || '',
        distanceText: item.distance_text || item.distance || (item.travel_snapshot && item.travel_snapshot.distance_text) || '',
        trafficText: item.traffic_text || item.traffic_level || (item.travel_snapshot && item.travel_snapshot.traffic_text) || '',
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
      title: summary.task_title || (summary.request_no ? `用车方案 ${summary.request_no}` : 'Farland 用车方案'),
      created_by_text: summary.created_by_text || '由 Farland 顾问为您安排',
      pickup: summary.pickup || summary.driver_region || '待确认',
      dropoff: summary.dropoff || '待确认',
      pickup_time_text: this.formatDisplayTime(summary.pickup_time_text || summary.service_date || '待确认'),
      route_text: summary.route_text || [summary.pickup || '', summary.dropoff || ''].filter(Boolean).join(' → '),
      time_summary: summary.time_summary || '',
      flight_summary: summary.flight_summary || '',
      task_description: summary.task_description || '',
      execution_note: summary.execution_note || '',
      estimated_drive_time: summary.estimated_drive_time || '',
      estimated_distance: summary.estimated_distance || '',
      flight_no: summary.flight_no || '',
      terminal: summary.terminal || '',
      scheduled_flight_time: summary.scheduled_flight_time || '',
      driver_arrive_time: summary.driver_arrive_time || '',
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
    const departureTime = this.resolveDayDepartureTime(day);
    const transportSummary = day.transportSummary || day.transport_summary || {};
    const assignedDriver = this.normalizeAssignedDriver(
      transportSummary.driver
        || transportSummary.assigned_transport
        || {
          name: transportSummary.driver_name || '',
          phone: transportSummary.driver_phone || '',
          vehicle_model: transportSummary.vehicle_model || '',
          vehicle_color: transportSummary.vehicle_color || '',
          vehicle_type: transportSummary.vehicle_type || transportSummary.vehicle_class || '',
          plate_number: transportSummary.plate_number || '',
        },
    );
    const driverVisibility = transportSummary.driver_visibility
      || (assignedDriver && (assignedDriver.name || assignedDriver.phone) ? 'assigned' : 'pending');
    const isDriverAssigned = driverVisibility === 'assigned' && assignedDriver;
    return {
      trip_id: context.trip_id || this.data.tripInviteId || overview.trip_id || '',
      trip_no: context.trip_no || overview.trip_no || (this.data.tripInviteTrip && this.data.tripInviteTrip.displayTripNo) || '',
      day_no: dayNo,
      date: day.date || '',
      weekday: day.weekday || '',
      city_summary: day.city || overview.city_summary || overview.city_route_text || '',
      title: day.title || `Day ${dayNo}`,
      status_text: '已确认',
      service_type: transportSummary.service_type || transportSummary.type || (day.transportBadge ? 'charter' : 'itinerary'),
      service_window: departureTime ? { label: `${departureTime} 出发` } : null,
      depart_time: departureTime || day.startTime || '',
      estimated_departure_time_raw: day.estimatedDepartureTimeRaw || day.estimated_departure_time_raw || '',
      estimated_departure_time: day.estimatedDepartureTime || day.estimated_departure_time || departureTime || '',
      vehicle_summary: transportSummary.vehicle_summary || day.transportBadge || '',
      party_summary: transportSummary.party_summary || '',
      driver_visibility: isDriverAssigned ? 'assigned' : 'pending',
      driver: isDriverAssigned ? assignedDriver : null,
      assigned_transport: isDriverAssigned ? assignedDriver : null,
      timeline_items: (day.timelineItems || []).map((item, index) => ({
        ...this.normalizeRouteLegMeta(item),
        card_id: item.card_id || item.id || `${dayNo}-${index}`,
        card_type: item.card_type || item.cardType || item.type || item.item_type || 'custom',
        sequence: item.sequence || index + 1,
        total_count: item.total_count || (day.timelineItems || []).length,
        entity_ref: item.entity_ref || item.entityRef || null,
        display_snapshot: item.display_snapshot || item.displaySnapshot || null,
        time_snapshot: item.time_snapshot || item.timeSnapshot || null,
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
      transport_summary: transportSummary && Object.keys(transportSummary).length ? transportSummary : (day.transportBadge ? { title: day.transportBadge } : null),
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
