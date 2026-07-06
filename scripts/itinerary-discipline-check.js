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
    // R6b:share_path 的 query 必须带 trip_id(或 external_trip_id/trip_no)与 invite_code。
    // 只落对页但丢了 query,home.onLoad 拿不到参数 → 不 writeStoredTripInvite/switchTab 转交 → 客户进空页。
    const hasTripParam = /[?&](trip_id|external_trip_id|trip_no)=/.test(tpl);
    const hasInviteParam = /[?&]invite_code=/.test(tpl);
    if (!hasTripParam || !hasInviteParam) {
      violations.push('R6b 客户 invite share_path 缺 query 参数(需 trip_id/external_trip_id/trip_no 且 invite_code):home 收不到参数 → 不转交 → 客户点分享卡进空页。');
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
// 要求属性赋值 __isItineraryTab: true,而非仅字符串出现(否则注释里提一句就能骗过守卫,真标记删了也放行)。
if (!/__isItineraryTab\s*:\s*true/.test(tabJs)) {
  violations.push('R4 itinerary-tab.js 缺 __isItineraryTab: true 标记:tab 无法自识别 → 读不回本地 invite,Path A 断(客户看不到带 bottombar 的行程)。');
}

// R5:home-page-config 的转交接线必须完整。不只查 token 是否存在,而是锚定"转交块"查接线一致
//     (否则:switchTab 后漏 return→home 也自渲染;写端成死代码没真调用;存储对象字段名与读端不一致 —— 都能让功能坏但 token 还在)。
const homeCfg = read('miniprogram/pages/customer/home/home-page-config.js');
const INVITE_KEY = 'customer_active_trip_invite';
// 转交块 = 非 tab home 拿到 trip invite 后的处理分支;锚定 guard 条件取块体。
const handoffMatch = homeCfg.match(/tripInviteId\s*&&\s*!this\.__isItineraryTab\s*\)\s*\{([\s\S]{0,400}?)\n\s*\}/);
const handoff = handoffMatch ? handoffMatch[1] : '';
// R5a:转交块必须 switchTab→itinerary-tab 且以 return 早退(否则 onLoad 落到下方 setData/loadHome,非 tab home 自渲染 invite/双跳)。
if (!/switchTab\s*\(\s*\{[\s\S]{0,120}?itinerary-tab/.test(handoff) || !/\breturn\b/.test(handoff)) {
  violations.push('R5a home-page-config 转交块缺 switchTab→itinerary-tab 或缺 return 早退:分享卡落非 tab home 须转交带 bottombar 的 tab 并 return,不得自渲染 invite。');
}
// R5b:转交块内必须"实际"写本地 invite(写端锚定到转交路径,防止只在别处留死代码定义)。
if (!/writeStoredTripInvite\s*\(/.test(handoff) && !new RegExp(`setStorageSync\\s*\\(\\s*['"\`]${INVITE_KEY}`).test(handoff)) {
  violations.push(`R5b home-page-config 转交块内未写本地 invite(需调 writeStoredTripInvite 或 setStorageSync '${INVITE_KEY}'):switchTab 后 tab 无 query、本地也没存 → tab 空页。`);
}
// R5c:本地 invite round-trip 字段一致 —— 写端 setStorageSync 同键且对象含 trip_id;读端 getStorageSync 同键且以 .trip_id 取回。
const writeObjOk = new RegExp(`setStorageSync\\s*\\(\\s*['"\`]${INVITE_KEY}['"\`]\\s*,\\s*\\{[\\s\\S]{0,200}?trip_id\\s*:`).test(homeCfg);
const readRoundTrip = new RegExp(`getStorageSync\\s*\\(\\s*['"\`]${INVITE_KEY}['"\`]\\s*\\)[\\s\\S]{0,200}?\\.trip_id`).test(homeCfg);
if (!writeObjOk || !readRoundTrip) {
  violations.push('R5c home-page-config 本地 invite round-trip 字段不一致(写端对象须含 trip_id、读端须 getStorageSync 同键并以 .trip_id 取回):改字段名/键名会让 tab 读回 undefined → 空页。');
}

if (violations.length) {
  console.error('✗ 手机版行程单纪律未通过:');
  violations.forEach((v) => console.error('  - ' + v));
  console.error('规范:docs/product/itinerary-sheet-discipline.md');
  process.exit(1);
}
console.log('✓ 手机版行程单纪律通过 (R1 invite非tab / R2 客户只读 / R3 不自渲染 / R4 tab自识别 / R5a 转交块switchTab+return / R5b 块内真写本地 / R5c round-trip字段一致 / R6 invite落home / R6b 带query参数)');
