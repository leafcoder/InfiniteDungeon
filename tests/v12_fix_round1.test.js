// v1.2 反馈第一轮修复回归：活动横幅位置 / 英雄行文案 / 徽章自适应 / 挑战码词缀
const path = require('path');
const ROOT = '/home/zhanglei3/WorkBuddy/2026-10-26-14-05-57/MazeGame/minigame/js';
const mem = {};
global.wx = {
  getStorageSync: (k) => mem[k],
  setStorageSync: (k, v) => { mem[k] = v; },
  removeStorageSync: (k) => { delete mem[k]; }
};
const storage = require(path.join(ROOT, 'core/storage.js'));
const festival = require(path.join(ROOT, 'core/festival.js'));
const weekly = require(path.join(ROOT, 'core/weekly.js'));
const challenge = require(path.join(ROOT, 'core/challenge.js'));
const Modals = require(path.join(ROOT, 'scene/Modals.js'));
const HomeScene = require(path.join(ROOT, 'scene/HomeScene.js'));

let pass = 0, fail = 0;
function T(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}
function makeSM() {
  return {
    W: 375, H: 667, sat: 20, stack: [],
    toast: () => {}, sceneModal: (m) => this.stack && this.stack.push(m), switch: () => {}
  };
}

console.log('--- 反馈1：活动横幅位置 ---');
{
  const hs = new HomeScene(makeSM());
  hs.enter();
  T('活动期横幅存在（万圣节期）', !!hs.festRect && !!hs.fest);
  T('横幅全宽（左右 16 边距）', Math.abs(hs.festRect.x - 16 * hs.u) < 0.01 && Math.abs(hs.festRect.w - (hs.sm.W - 32 * hs.u)) < 0.01);
  T('横幅在 Hero 卡正下方', hs.festRect.y >= hs.hero.y + hs.hero.h);
  T('圆点行在横幅下方不重叠', hs.dotsRect().y >= hs.festRect.y + hs.festRect.h);
  T('网格在圆点行下方不重叠', hs.gz.y >= hs.dotsRect().y + 8);
  T('横幅命中区域生效', hs.inFestPill(hs.festRect.x + 20, hs.festRect.y + 10));
  // 空档期：布局回退（圆点/网格位置与无活动一致）
  const real = festival.getActive;
  festival.getActive = () => null;
  const hs2 = new HomeScene(makeSM());
  hs2.enter();
  festival.getActive = real;
  T('空档期圆点行回到 Hero 卡下方', Math.abs(hs2.dotsRect().y - (hs2.hero.y + hs2.hero.h + 10 * hs2.u)) < 0.01);
  T('空档期网格 y 回到原位', Math.abs(hs2.gz.y - (hs2.hero.y + hs2.hero.h + 28 * hs2.u)) < 0.01);
}

console.log('--- 反馈2：英雄行文案不超行卡 ---');
{
  const sm = makeSM();
  const m = Modals.showSkin(sm, () => {});
  const heroRows = m.rows.filter(r => r.hero);
  T('英雄行存在', heroRows.length === storage.HEROES.length);
  // 行卡文字区约 190px（10.5px 字号），保守上限：sub ≤ 14 字、title ≤ 14 字
  let maxLen = 0, maxTitle = 0, worst = '';
  heroRows.forEach(r => {
    if (r.sub.length > maxLen) { maxLen = r.sub.length; worst = r.sub; }
    if (r.title.length > maxTitle) maxTitle = r.title.length;
  });
  T('sub 最长 ≤ 14 字（当前 ' + maxLen + '：' + worst + '）', maxLen <= 14);
  T('title 最长 ≤ 14 字（当前 ' + maxTitle + '）', maxTitle <= 14);
  // 未解锁态 tag 显示还差多少
  T('未解锁英雄 tag 带「还差」', heroRows.some(r => (r.tag || '').indexOf('还差') >= 0));
  // 全解锁态（真实解锁路径：通关+星级堆满）
  for (let i = 1; i <= 120; i++) storage.completeLevel(i, { time: 9, steps: 9, swipe: 0, stars: 3, gems: 0, gemTotal: 0 });
  const m2 = Modals.showSkin(makeSM(), () => {});
  let maxLen2 = 0, worst2 = '';
  m2.rows.filter(r => r.hero).forEach(r => {
    if (r.sub.length > maxLen2) { maxLen2 = r.sub.length; worst2 = r.sub; }
  });
  T('全解锁后 sub 最长 ≤ 14 字（当前 ' + maxLen2 + '：' + worst2 + '）', maxLen2 <= 14);
  T('已解锁英雄 title 带特性名', m2.rows.some(r => r.hero && r.title.indexOf(' · ') >= 0));
}

console.log('--- 反馈3：Hero 卡徽章（drawHero 各状态不抛错） ---');
{
  // 解锁到 66 关：覆盖 zone0 已制霸 / zone1 进行中 / zone2 锁定 / 金章制霸态
  for (let i = 1; i <= 66; i++) storage.completeLevel(i, { time: 9, steps: 9, swipe: 0, stars: 1, gems: 0, gemTotal: 0 });
  const hs = new HomeScene(makeSM());
  hs.enter();
  hs.eto = 1; hs.heroT = 1; hs.progT = 1;
  // 轻量 canvas 桩
  const calls = { badge: 0 };
  const grad = { addColorStop: () => {} };
  const ctx = {
    save: () => {}, restore: () => {}, translate: () => {}, rotate: () => {},
    clip: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {}, fill: () => {},
    arc: () => {}, arcTo: () => {}, fillRect: () => {}, closePath: () => {},
    scale: () => {}, quadraticCurveTo: () => {}, bezierCurveTo: () => {}, rect: () => {}, clearRect: () => {},
    createLinearGradient: () => grad, createRadialGradient: () => grad,
    measureText: (t) => ({ width: t.length * 11 }),
    fillText: (t, x, y) => { if (t && t.indexOf('关') >= 0) calls.badge++; },
    set fillStyle(v) {}, get fillStyle() { return ''; },
    set strokeStyle(v) {}, get strokeStyle() { return ''; },
    set font(v) {}, get font() { return ''; },
    set textAlign(v) {}, get textAlign() { return ''; },
    set textBaseline(v) {}, get textBaseline() { return ''; },
    set globalAlpha(v) {}, get globalAlpha() { return 1; },
    set lineWidth(v) {}, get lineWidth() { return 1; },
    set shadowColor(v) {}, get shadowColor() { return ''; },
    set shadowBlur(v) {}, get shadowBlur() { return 0; },
    set shadowOffsetY(v) {}, get shadowOffsetY() { return 0; }
  };
  for (let z = 0; z < 6; z++) {
    hs.activeZone = z;
    hs.drawHero(ctx, {});
  }
  T('6 个分区 drawHero 全部可绘制（含锁定/进行中/制霸态）', calls.badge > 0);
}

console.log('--- 反馈4：挑战码词缀点选 ---');
{
  const sm = makeSM();
  sm.sceneModal = (m) => sm.stack.push(m);
  sm.stack = [];
  const m = Modals.showCode(sm, () => {}, () => {});
  const modRow = m.rows.find(r => r.title && r.title.indexOf('浓雾') === 0);
  T('词缀行存在（初始未添加）', !!modRow && modRow.tag === '添加');
  // 点击添加：onTap(带 refresh 桩的 Modal mock)
  const refreshed = [];
  modRow.onTap({ refresh: (opts) => refreshed.push(opts) });
  T('点击后行状态变为已添加', refreshed.length === 1 && refreshed[0].rows.some(r => r.title && r.title.indexOf('浓雾') === 0 && r.tag === '已添加'));
  // 口令文本包含词缀数
  const opts = refreshed[0];
  T('刷新后词缀行可再次点击（移除）', (() => {
    const row = opts.rows.find(r => r.title && r.title.indexOf('浓雾') === 0);
    const refreshed2 = [];
    row.onTap({ refresh: (o) => refreshed2.push(o) });
    return refreshed2.length === 1 && refreshed2[0].rows.find(r => r.title && r.title.indexOf('浓雾') === 0).tag === '添加';
  })());
  // 口令内容应包含词缀（encode 含 mods 数量）
  const code = challenge.encode([0], ['fog'], 123);
  const dec = challenge.decode(code);
  T('编码-解码含词缀（fog ×1）', dec && dec.mods.length === 1 && dec.mods[0] === 'fog');
}

console.log('');
console.log(fail === 0 ? 'ALL PASS: ' + pass : 'FAIL: ' + fail + ' / PASS: ' + pass);
process.exit(fail === 0 ? 0 : 1);
