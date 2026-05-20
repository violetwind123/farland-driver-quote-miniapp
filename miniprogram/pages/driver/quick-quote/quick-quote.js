const CURRENCY_OPTIONS = ['USD', 'CNY'];
const VEHICLE_TYPES = ['sedan', 'suv', 'suburban', 'van', 'sprinter', 'transit', 'bus', 'other'];

Page({
  data: {
    loading: true,
    invalid: false,
    submitSuccess: false,
    cancelled: false,
    cancelReasonDriver: '',
    errorMessage: '',
    token: '',
    invite: null,
    request: null,
    driver: null,
    vehicle: null,
    isRegistered: false,
    driverStatus: 'unregistered',
    pageTitle: 'Farland 用车报价邀请',
    quotePrice: '',
    currency: 'USD',
    quoteNote: '',
    hasExistingQuote: false,
    existingQuoteStatus: '',
    existingQuoteUpdatedAt: '',
    requestStatus: '',
    quoteFinalized: false,
    quoteLocked: false,
    quoteResultText: '',
    quoteResultType: '',
    currencyIndex: 0,
    submitting: false,
    currencyOptions: CURRENCY_OPTIONS,
    vehicleTypeOptions: VEHICLE_TYPES,
    vehicleTypeIndex: 0,
    formDriverName: '',
    formDriverPhone: '',
    formVehicleType: VEHICLE_TYPES[0],
    formVehicleModel: '',
    formSeats: '',
    formLuggageCapacity: '',
    formPlateNumber: '',
  },

  onLoad(options) {
    const token = options.token;
    if (!token) {
      this.setData({ loading: false, invalid: true, errorMessage: '报价链接无效' });
      return;
    }
    this.setData({ token });
    this.loadQuoteInfo(token);
  },

  async loadQuoteInfo(token) {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getQuoteInviteByToken',
        data: { token },
      });
      if (!result || !result.success) {
        const isCancelled = result && (
          result.status === 'cancelled'
          || (result.code === 410 && /取消/.test(result.message || result.msg || ''))
        );
        if (isCancelled) {
          this.setData({
            loading: false,
            invalid: false,
            cancelled: true,
            cancelReasonDriver: result.cancel_reason_driver || '本报价单已取消，如有疑问，请联系 Farland 运营。',
          });
          return;
        }
        this.setData({ loading: false, invalid: true, errorMessage: (result && result.message) || '加载失败' });
        return;
      }

      const existingQuote = result.existing_quote || null;
      const currency = existingQuote && existingQuote.currency ? existingQuote.currency : 'USD';
      const requestStatus = result.request && result.request.status ? result.request.status : '';
      const quoteStatus = existingQuote ? existingQuote.quote_status : '';
      const quoteResult = this.getQuoteResult(requestStatus, quoteStatus, !!existingQuote);
      const quoteLocked = !!existingQuote || quoteResult.finalized;
      this.setData({
        loading: false,
        invite: result.invite,
        request: result.request,
        driver: result.driver,
        vehicle: result.vehicle,
        driverStatus: result.driver_status || 'unregistered',
        isRegistered: result.driver_status === 'registered_with_vehicle',
        pageTitle: this.getPageTitle(result.request.service_type),
        quotePrice: existingQuote && existingQuote.quote_price ? String(existingQuote.quote_price) : '',
        currency,
        quoteNote: existingQuote && existingQuote.quote_note ? existingQuote.quote_note : '',
        hasExistingQuote: !!existingQuote,
        existingQuoteStatus: quoteStatus,
        existingQuoteUpdatedAt: existingQuote ? existingQuote.updated_at : '',
        requestStatus,
        quoteFinalized: quoteResult.finalized,
        quoteLocked,
        quoteResultText: quoteResult.text,
        quoteResultType: quoteResult.type,
        currencyIndex: Math.max(CURRENCY_OPTIONS.indexOf(currency), 0),
      });
    } catch (error) {
      this.setData({ loading: false, invalid: true, errorMessage: '系统繁忙，请稍后再试' });
    }
  },

  getPageTitle(serviceType) {
    if (serviceType === 'transfer') return 'Farland 接送报价邀请';
    if (serviceType === 'charter') return 'Farland 包车报价邀请';
    return 'Farland 用车报价邀请';
  },

  getQuoteResult(requestStatus, quoteStatus, hasExistingQuote) {
    if (quoteStatus === 'selected') {
      return {
        finalized: true,
        type: 'selected',
        text: '您的报价已被 Farland 运营选择，运营会再与您确认。',
      };
    }
    if (quoteStatus === 'rejected') {
      return {
        finalized: true,
        type: 'rejected',
        text: '本单已选择其他司机，感谢您的报价。',
      };
    }
    if (requestStatus === 'assigned') {
      return {
        finalized: true,
        type: hasExistingQuote ? 'closed' : 'rejected',
        text: hasExistingQuote ? '本单已完成司机选择，当前报价不能再修改。' : '本单已完成司机选择，当前不再接受报价。',
      };
    }
    return { finalized: false, type: '', text: '' };
  },

  onInputChange(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },

  onCurrencyChange(e) {
    const currencyIndex = Number(e.detail.value);
    this.setData({ currency: CURRENCY_OPTIONS[currencyIndex], currencyIndex });
  },

  onVehicleTypeChange(e) {
    const vehicleTypeIndex = Number(e.detail.value);
    this.setData({
      vehicleTypeIndex,
      formVehicleType: VEHICLE_TYPES[vehicleTypeIndex],
    });
  },

  async onSubmit() {
    const {
      token,
      quotePrice,
      currency,
      quoteNote,
      submitting,
      isRegistered,
      driverStatus,
      driver,
      vehicle,
      formDriverName,
      formDriverPhone,
      formVehicleType,
      formVehicleModel,
      formSeats,
      formLuggageCapacity,
      formPlateNumber,
      quoteFinalized,
      quoteLocked,
    } = this.data;
    if (submitting) return;
    if (quoteLocked || quoteFinalized) {
      wx.showToast({ title: '报价已提交，不能重复提交', icon: 'none' });
      return;
    }
    const parsedPrice = Number(quotePrice);
    if (!quotePrice || Number.isNaN(parsedPrice) || parsedPrice <= 0) {
      wx.showToast({ title: '请输入有效报价金额', icon: 'none' });
      return;
    }

    const driverProfile = driverStatus !== 'unregistered'
      ? { name: driver.name, phone: driver.phone }
      : { name: formDriverName, phone: formDriverPhone };
    const vehicleProfile = isRegistered && vehicle
      ? {
        vehicle_type: vehicle.vehicle_type,
        vehicle_model: vehicle.vehicle_model,
        seats: vehicle.seats,
        luggage_capacity: vehicle.luggage_capacity,
        plate_number: vehicle.plate_number,
      }
      : {
        vehicle_type: formVehicleType,
        vehicle_model: formVehicleModel,
        seats: formSeats,
        luggage_capacity: formLuggageCapacity,
        plate_number: formPlateNumber,
      };

    this.setData({ submitting: true });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'submitQuickQuote',
        data: {
          token,
          driver_profile: driverProfile,
          vehicle_profile: vehicleProfile,
          quote_price: parsedPrice,
          currency,
          quote_note: quoteNote || '',
        },
      });
      if (!result || !result.success) {
        wx.showToast({ title: (result && result.message) || '提交失败', icon: 'none' });
        this.setData({ submitting: false });
        return;
      }
      this.setData({ submitting: false, submitSuccess: true });
    } catch (error) {
      wx.showToast({ title: '提交失败，请稍后再试', icon: 'none' });
      this.setData({ submitting: false });
    }
  },
});
