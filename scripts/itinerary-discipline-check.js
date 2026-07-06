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

// R1:客户正式 invite 分享路径必须落「我的行程」(/pages/customer/home/home),不得落 mobile-itinerary。
const invite = read('cloudfunctions/createCustomerTripInvite/index.js');
if (invite) {
  const m = invite.match(/buildTripSharePath[\s\S]{0,400}?return\s+`([^`]+)`/);
  const tpl = m ? m[1] : '';
  if (/mobile-itinerary/.test(tpl)) {
    violations.push(`R1 客户 invite share_path 落在 mobile-itinerary,应落 /pages/customer/home/home。当前:${tpl}`);
  } else if (tpl && !/pages\/customer\/home\/home/.test(tpl)) {
    violations.push(`R1 客户 invite share_path 不是「我的行程」home:${tpl}`);
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

if (violations.length) {
  console.error('✗ 手机版行程单纪律未通过:');
  violations.forEach((v) => console.error('  - ' + v));
  console.error('规范:docs/product/itinerary-sheet-discipline.md');
  process.exit(1);
}
console.log('✓ 手机版行程单纪律通过 (R1 invite路径 / R2 客户只读 / R3 不自渲染)');
