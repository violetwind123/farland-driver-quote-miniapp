const CURRENCY_OPTIONS = ['USD', 'CNY'];
const PRICE_TYPE_OPTIONS = ['all_in', 'base_plus_extra'];

Page({
  data: {
    loading: true,
    invalid: false,
    submitSuccess: false,
    errorMessage: '',
    token: '',
    invite: null,
    request: null,
    pageTitle: 'Farland 用车报价邀请',
    quotePrice: '',
    currency: 'USD',
    quoteNote: '',
    priceType: 'all_in',
    includedHours: '',
    overtimeRate: '',
    submitting: false,
    currencyOptions: CURRENCY_OPTIONS,
    priceTypeOptions: PRICE_TYPE_OPTIONS,
  },

  onLoad(options) {
    const token = options.token;
    if (!token) {
      this.setData({ loading: false, invalid: true, errorMessage: '报价链接无效' });
      return;
    }
    this.setData({ token });
    this.loadInvite(token);
  },

  async loadInvite(token) {
    this.setData({ loading: true, invalid: false, errorMessage: '' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getQuoteInviteByToken',
        data: { token },
      });

      if (!result || !result.success) {
        this.setData({ loading: false, invalid: true, errorMessage: (result && result.message) || '该报价链接已失效' });
        return;
      }

      const { invite, request, existing_quote: existingQuote } = result;
      const pageTitle = this.getPageTitle(request.service_type);
      this.setData({
        loading: false,
        invalid: false,
        invite,
        request,
        pageTitle,
        quotePrice: existingQuote && existingQuote.quote_price ? String(existingQuote.quote_price) : '',
        currency: existingQuote && existingQuote.currency ? existingQuote.currency : 'USD',
        quoteNote: existingQuote && existingQuote.quote_note ? existingQuote.quote_note : '',
        priceType: existingQuote && existingQuote.price_type ? existingQuote.price_type : 'all_in',
        includedHours: existingQuote && existingQuote.included_hours ? String(existingQuote.included_hours) : '',
        overtimeRate: existingQuote && existingQuote.overtime_rate ? existingQuote.overtime_rate : '',
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

  onInputChange(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [field]: e.detail.value });
  },

  onCurrencyChange(e) {
    this.setData({ currency: CURRENCY_OPTIONS[Number(e.detail.value)] });
  },

  onPriceTypeChange(e) {
    this.setData({ priceType: PRICE_TYPE_OPTIONS[Number(e.detail.value)] });
  },

  async onSubmit() {
    const { request, token, quotePrice, currency, quoteNote, priceType, includedHours, overtimeRate, submitting } = this.data;
    if (submitting) return;

    const parsedPrice = Number(quotePrice);
    if (!quotePrice || Number.isNaN(parsedPrice) || parsedPrice <= 0) {
      wx.showToast({ title: '请输入大于0的报价金额', icon: 'none' });
      return;
    }

    const payload = {
      token,
      quote_price: parsedPrice,
      currency,
      quote_note: quoteNote || '',
    };

    if (request.service_type === 'charter') {
      payload.price_type = priceType;
      payload.included_hours = includedHours ? Number(includedHours) : undefined;
      payload.overtime_rate = overtimeRate || '';
    }

    this.setData({ submitting: true });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'submitQuickQuote',
        data: payload,
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
