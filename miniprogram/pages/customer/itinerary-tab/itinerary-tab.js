const customerHomePageConfig = require('../home/home-page-config');

// 「我的行程」tab(自带 bottombar)。标记 __isItineraryTab:分享落非 tab home 只接参并 switchTab 到这里,
// 本 tab 无参进入时读本地存的 invite,复用 home 的 invite 三态视图渲染(Path A)。
Page(Object.assign({}, customerHomePageConfig, { __isItineraryTab: true }));
