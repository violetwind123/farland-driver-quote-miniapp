#!/usr/bin/env node
/**
 * 手机版行程单 · 纪律守卫 (Itinerary Sheet Discipline guard).
 * 违反任一铁律即 exit 1。规范全文见 docs/product/itinerary-sheet-discipline.md。
 * 用法:node scripts/itinerary-discipline-check.js   (CI / 提交前必跑)
 *
 * 这些铁律与"单层/两层(A/B)"无关,恒成立;不要为了让某次改动过而放宽它们——
 * 改规则要先改 docs/product/itinerary-sheet-discipline.md 并让 owner 确认。
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => {
  try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return ''; }
};
const violations = [];

// R1:客户正式 invite 分享路径**不得落 tabBar 页**。
// 原因:微信分享卡跳 tabBar 页会走 switchTab 丢掉 query 参数(trip_id/invite_code 收不到 → 推送打开是空页)。
// 所以 invite 必须落一个非 tab 的承载页(如 mobile-itinerary),参数才传得进去。
const invite = read('cloudfunctions/createCustomerTripInvite/index.js');
const appJson = read('miniprogram/app.json');
if (invite && appJson) {
  let tabPages = [];
  try { tabPages = ((JSON.parse(appJson).tabBar || {}).list || []).map((x) => String(x.pagePath || '')); } catch (e) { /* ignore */ }
  const m = invite.match(/buildTripSharePath[\s\S]{0,400}?return\s+`([^`]+)`/);
  const tpl = m ? m[1] : '';
  const page = tpl.replace(/^\//, '').split('?')[0];
  if (!m || !page) {
    // 解析不到 share_path 就无法验 R1/R6 —— 不静默放行(否则重构 buildTripSharePath 会让守卫失效)。
    violations.push('R1/R6 无法从 createCustomerTripInvite 解析 buildTripSharePath 的 share_path:守卫失效。请保持可解析,或同步更新本守卫。');
  } else {
    if (tabPages.includes(page)) {
      violations.push(`R1 客户 invite share_path 落在 tabBar 页(${page}):分享卡跳 tabBar 会丢参数,推送打不开。请落非 tab 承载页。`);
    }
    // R6:Path A —— invite 必须落 home(承载 switchTab→tab 的转交逻辑)。落到别的非 tab 页(如 mobile-itinerary)会绕过 Path A,客户看不到带 bottombar 的行程 tab。
    const PATH_A_LANDING = 'pages/customer/home/home';
    if (page !== PATH_A_LANDING) {
      violations.push(`R6 客户 invite share_path 落在 ${page},非 Path A 承载页 ${PATH_A_LANDING}:该页无 switchTab→itinerary-tab 转交,客户看不到带 bottombar 的行程 tab。`);
    }
  }
}

// R2:客户手机版行程单表面只读,不开放二次转发。mobile-itinerary 不得出现 open-type="share"。
const miWxml = read('miniprogram/pages/customer/mobile-itinerary/mobile-itinerary.wxml');
if (/open-type\s*=\s*["']share["']/.test(miWxml)) {
  violations.push('R2 mobile-itinerary 出现 open-type="share":客户手机版行程单不得二次转发(转发是运营动作)。');
}

// R3:手机版行程单表面只展示 web 图,绝不端上自渲染行程(不引用 days/todayOverviewCard/每日安排/…)。
const SELF_RENDER = /(todayOverviewCard|daily_summary_cards|tripInviteTrip\.days|progressNodes|mi-day-row|每日安排|行程概览卡)/;
const miWxss = read('miniprogram/pages/customer/mobile-itinerary/mobile-itinerary.wxss');
if (SELF_RENDER.test(miWxml) || SELF_RENDER.test(miWxss)) {
  violations.push('R3 mobile-itinerary 出现自渲染行程标记:手机版行程单只展示 web 生成的图片。');
}

// —— Path A 不变式(客户行程体验落带 bottombar 的「我的行程」tab)。规范见 docs §7 Path A。 ——
// R4:itinerary-tab 必须自识别(__isItineraryTab)。分享卡落非 tab home 后 switchTab 到本 tab,
// tab 靠这个标记才知道"我要读本地 invite 并渲染 invite 视图";没标记 → tab 走普通 my-trips → 客户看不到行程。
const tabJs = read('miniprogram/pages/customer/itinerary-tab/itinerary-tab.js');
if (!/__isItineraryTab/.test(tabJs)) {
  violations.push('R4 itinerary-tab.js 缺 __isItineraryTab 标记:tab 无法自识别 → 读不回本地 invite,Path A 断(客户看不到带 bottombar 的行程)。');
}

// R5:home-page-config 必须 (a) 把 trip invite switchTab 转交给 itinerary-tab(不在非 tab home 自渲染);
//     (b) 本地 invite 存储 setStorageSync/getStorageSync 同键 round-trip —— switchTab 丢 query,靠本地键读回参数。
const homeCfg = read('miniprogram/pages/customer/home/home-page-config.js');
const HANDS_OFF = /switchTab\s*\(\s*\{[\s\S]{0,160}?itinerary-tab/;
if (!HANDS_OFF.test(homeCfg)) {
  violations.push('R5a home-page-config 未见 switchTab→itinerary-tab:分享卡落非 tab home 后必须转交带 bottombar 的 tab 渲染,不得在非 tab home 自渲染 invite。');
}
const INVITE_KEY = 'customer_active_trip_invite';
const writesKey = new RegExp(`setStorageSync\\s*\\(\\s*['"\`]${INVITE_KEY}['"\`]`).test(homeCfg);
const readsKey = new RegExp(`getStorageSync\\s*\\(\\s*['"\`]${INVITE_KEY}['"\`]`).test(homeCfg);
if (!writesKey || !readsKey) {
  violations.push(`R5b home-page-config 本地 invite 未 round-trip(需 setStorageSync+getStorageSync 同键 '${INVITE_KEY}'):tab switchTab 丢 query,靠本地键读回;缺任一端 → tab 打开是空页。`);
}

if (violations.length) {
  console.error('✗ 手机版行程单纪律未通过:');
  violations.forEach((v) => console.error('  - ' + v));
  console.error('规范:docs/product/itinerary-sheet-discipline.md');
  process.exit(1);
}
console.log('✓ 手机版行程单纪律通过 (R1 invite路径 / R2 客户只读 / R3 不自渲染 / R4 tab自识别 / R5 home转交+存储round-trip / R6 invite落home)');
