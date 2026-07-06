// 手机版行程单 = web 生成的 itinerary_sheet 图的极简查看器。
// 只展示 web 图 + 保存/转发,绝不端上自渲染 days/todayOverviewCard(见 docs/product/miniprogram-dev-guidelines.md)。
const app = getApp();

function schemeOk(url) {
  const m = /^([a-z][a-z0-9+.-]*:)/i.exec(String(url == null ? '' : url).trim());
  return Boolean(m && ['https:', 'cloud:', 'wxfile:'].includes(m[1].toLowerCase()));
}

Page({
  data: {
    loading: true,
    error: '',
    sheetUrl: '',
    tripId: '',
    inviteCode: '',
    isOperatorPreview: false,
  },

  onLoad(options = {}) {
    const tripId = decodeURIComponent(options.trip_id || options.external_trip_id || '');
    const inviteCode = decodeURIComponent(options.invite_code || '');
    const isOperatorPreview = options.operator_mobile_preview === '1';
    this.setData({ tripId, inviteCode, isOperatorPreview });
    if (isOperatorPreview) {
      this.loadFromOperatorPreview();
    } else {
      this.loadFromInvite(tripId, inviteCode);
    }
    // 客户端只读:关闭转发菜单,不开放二次转发(转发是运营动作)
    if (wx.hideShareMenu) wx.hideShareMenu();
  },

  pickSheet(preview) {
    if (!preview) return null;
    const share = preview.customer_share_preview || preview;
    const sheet = (share && share.itinerary_sheet) || preview.itinerary_sheet || null;
    return sheet && sheet.png_url && schemeOk(sheet.png_url) ? sheet : null;
  },

  loadFromOperatorPreview() {
    const g = (app && app.globalData) || {};
    const preview = g.operatorCustomerSharePreview || g.operatorMobileItineraryDraftPreview || {};
    const sheet = this.pickSheet(preview);
    this.setData({
      loading: false,
      sheetUrl: sheet ? sheet.png_url : '',
      tripId: this.data.tripId || preview.trip_id || preview.external_trip_id || '',
      inviteCode: this.data.inviteCode || preview.invite_code || '',
    });
  },

  async loadFromInvite(tripId, inviteCode) {
    if (!tripId) {
      this.setData({ loading: false, error: '缺少行程信息' });
      return;
    }
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getCustomerTripByInvite',
        data: { trip_id: tripId, invite_code: inviteCode },
      });
      if (!result || !result.success) {
        this.setData({ loading: false, error: (result && result.message) || '手机版行程单加载失败' });
        return;
      }
      const sheet = result.itinerary_sheet;
      const url = sheet && sheet.png_url && schemeOk(sheet.png_url) ? sheet.png_url : '';
      this.setData({ loading: false, sheetUrl: url });
    } catch (err) {
      this.setData({ loading: false, error: '手机版行程单加载失败，请稍后重试。' });
    }
  },

  // 客户端只读:不提供下载/保存/预览大图/转发(去掉 onSave/onPreview/onShareAppMessage);
  // 图片本身 show-menu-by-longpress=false,长按也不可保存。
});
