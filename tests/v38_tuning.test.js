// v1.4 回归：首页死代码清理 + 首页崩溃修复 + 塔防数值调平 + 金币出口 + 英雄阈值重标定
// 本文件同时承担「入场动画完成后全量 draw 冒烟」职责：ent(1)===0 的旧测试桩覆盖不到运行期错误。
const path = require('path');
const fs = require('fs');
const ROOT = '/home/zhanglei3/WorkBuddy/2026-10-26-14-05-57/MazeGame/minigame/js';

const mem = {};
global.wx = {
  getStorageSync: (k) => mem[k],
  setStorageSync: (k, v) => { mem[k] = v; },
  removeStorageSync: (k) => { delete mem[k]; },
  getSystemInfoSync: () => ({ pixelRatio: 2, windowWidth: 375, windowHeight: 667, safeArea: { top: 20, bottom: 657 }, statusBarHeight: 20, platform: 'devtools' }),
  getMenuButtonBoundingClientRect: () => ({ top: 24, bottom: 56, left: 281, right: 368, width: 87, height: 32 }),
  createCanvas: () => ({ width: 750, height: 1334, getContext: () => ctxStub() }),
  createGameClubButton: () => ({ onTap: () => {}, destroy: () => {} }),
  onTouchStart: () => {}, onTouchMove: () => {}, onTouchEnd: () => {},
  vibrateShort: () => {}, shareAppMessage: () => {},
  createInnerAudioContext: () => ({ play: () => {}, stop: () => {}, destroy: () => {} }),
  createRewardedVideoAd: () => ({ onClose: () => {}, onError: () => {}, show: () => {}, load: () => {} })
};
global.requestAnimationFrame = () => 0;

function ctxStub() {
  const noop = () => {};
  return new Proxy({}, {
    get: function (t, k) {
      if (k === 'canvas') return { width: 375, height: 667 };
      if (k === 'measureText') return () => ({ width: 40 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
      if (k === 'getImageData') return () => ({ data: [] });
      return noop;
    },
    set: function () { return true; }
  });
}
function makeSM() {
  return {
    W: 375, H: 667, sat: 20, sab: 10, sal: 10, sar: 10,
    cap: { top: 24, bottom: 56, left: 281, right: 368, width: 87, height: 32 }, capB: 62,
    scenes: {}, toasts: [], switched: [],
    register: function (n, s) { this.scenes[n] = s; },
    toast: function (t) { this.toasts.push(t); },
    switch: function (n, p) { this.switched.push({ name: n, params: p }); },
    sceneModal: () => {}, drawOverlay: () => {}
  };
}

let pass = 0, fail = 0;
function T(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}
function src(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function mk(seed) { return new tower.TowerCore(30, { aspect: 1.5, seed: seed }); }

const tower = require(path.join(ROOT, 'core/tower.js'));
const WT = tower.WAVE_TUNING;
const storage = require(path.join(ROOT, 'core/storage.js'));
const HomeScene = require(path.join(ROOT, 'scene/HomeScene.js'));
const TowerScene = require(path.join(ROOT, 'scene/TowerScene.js'));

console.log('--- 1. 首页死代码清理与入场后绘制冒烟 ---');
const homeSrc = src('scene/HomeScene.js');
const hs = new HomeScene(makeSM());
hs.enter();
hs.modal = null;   // 隔离首入引导弹窗
const removedFns = [
  'drawGrid', 'drawDots', 'drawFestBanner', 'drawMutBanner',
  'tapGrid', 'tapDots', 'switchZone', 'zoneOf', 'zoneDoneCount',
  'refreshUnlock', 'openUnlock', 'inHero'
];
removedFns.forEach(function (n) { T('已删除不可达方法 ' + n, typeof hs[n] === 'undefined'); });
T('已移除 ad / AdSim / UNLOCK_DUST_COST 依赖',
  homeSrc.indexOf("require('../core/ad')") === -1 && homeSrc.indexOf("require('../ui/AdSim')") === -1 &&
  homeSrc.indexOf('UNLOCK_DUST_COST') === -1);
T('已移除 gridSc 触摸转发', homeSrc.indexOf('this.gridSc.hit(') === -1 && homeSrc.indexOf('this.gridSc.touchEnd(') === -1);
T('已移除恒假的 fest/mut 让位条件', homeSrc.indexOf('!self.fest &&') === -1);
T('已修复 drawHero 的 locked 未定义变量', homeSrc.indexOf('if (locked)') === -1);
T('布局锚点全部保留（像素回归）',
  hs.dock.length === 6 && !!hs.gz && typeof hs.festBottom === 'number' &&
  hs.festRect === null && hs.mutRect === null && typeof hs.dotsRect === 'function' && !!hs.dotsRect());
T('保留 dotsRect / zoneColor / hexA / drawTowerBoard',
  ['dotsRect', 'zoneColor', 'hexA', 'drawTowerBoard', 'drawChkBanner', 'styleGoBtn']
    .every(function (n) { return typeof hs[n] === 'function'; }));
hs.eto = 1;        // 关键：让 ent(0..3) > 0，真正执行全部绘制分支
let drawErr = '';
try { hs.draw(ctxStub()); } catch (e) { drawErr = e.name + ': ' + e.message; }
T('入场动画完成后首页全量 draw 无运行期异常', drawErr === '');
T('逐函数绘制冒烟', (function () {
  const names = ['drawTopBar', 'drawHero', 'drawDock', 'drawChkBanner', 'drawTowerBoard', 'drawToast'];
  for (let i = 0; i < names.length; i++) {
    try { hs[names[i]](ctxStub(), hs.vars()); } catch (e) { return false; }
  }
  return true;
})());

console.log('--- 2. WAVE_TUNING 数值口径与难度曲线 ---');
T('WAVE_TUNING 是唯一事实来源', typeof WT === 'object' && tower.MAX_TOWER_LV === WT.maxTowerLv);
T('源码不再硬编码旧金币/波奖常量', homeSrc.indexOf('UNLOCK_DUST') === -1);
T('起始金币收紧到 100', WT.startGold === 100 && mk(1).gold === 100);
T('波奖 16+4n 且低于旧 20+5n', tower.waveBonus(20) === 96 && tower.waveBonus(20) < 20 + 5 * 20);
T('HP 倍率第 1 波为 1', tower.waveHpMul(1) === 1);
T('HP 曲线含二次项（第 20 波高于纯线性）',
  tower.waveHpMul(20) > 1 + WT.hpLinear * 19 + 0.001);
T('HP 倍率单调不降', (function () {
  for (let n = 2; n <= 40; n++) if (tower.waveHpMul(n) < tower.waveHpMul(n - 1)) return false;
  return true;
})());
T('30 波后进入深渊加速', tower.waveHpMul(31) - tower.waveHpMul(30) > 0.28);
T('出场间隔随波收紧且有下限',
  tower.waveSpawnGap(1) === WT.spawnGapBase &&
  tower.waveSpawnGap(20) < tower.waveSpawnGap(1) &&
  tower.waveSpawnGap(999) === WT.spawnGapMin);
T('敌人数量公式不变', tower.waveCount(1) === 7 && tower.waveCount(20) === 36);

console.log('--- 3. 塔等级 Lv5 与升级价格递增 ---');
T('塔等级上限 5', tower.MAX_TOWER_LV === 5);
const cu = mk(1);
cu.gold = 100000;
cu.build(cu.slots[0], 'arrow');
const costs = [];
for (let lv = 1; lv < 5; lv++) { costs.push(cu.upgradeCost(cu.towers[0])); cu.upgrade(cu.towers[0]); }
T('连续升到 Lv5', cu.towers[0].lv === 5);
T('升级价格逐级递增', costs.every(function (v, i) { return i === 0 || v > costs[i - 1]; }));
T('Lv5 后拒绝升级', !cu.upgrade(cu.towers[0]));
T('Lv1→2 仍为造价 0.8 倍', costs[0] === Math.round(tower.TOWER_DEFS.arrow.cost * 0.8));

console.log('--- 4. 锻造：金币消费出口与战力延续 ---');
const cf = mk(1);
cf.gold = 100000;
T('字段名 forgeLv 不遮蔽 forge() 方法', cf.forgeLv === 0 && typeof cf.forge === 'function');
T('首级锻造价格 = forgeBase', cf.forgeCost() === WT.forgeBase);
const gold0 = cf.gold;
T('锻造成功并扣款', cf.forge() === true && cf.forgeLv === 1 && cf.gold === gold0 - WT.forgeBase);
T('价格指数递增', cf.forgeCost() > WT.forgeBase);
T('伤害倍率 +8%', Math.abs(cf.damageMul() - (1 + WT.forgeDmgStep)) < 1e-9);
while (cf.forgeLv < WT.forgeMax) cf.forge();
T('可锻造到硬上限', cf.forgeLv === WT.forgeMax && cf.forgeCost() === 0);
T('达上限后拒绝继续锻造', !cf.forge());
T('伤害倍率封顶', Math.abs(cf.damageMul() - (1 + WT.forgeMax * WT.forgeDmgStep)) < 1e-9);
T('stats 暴露 forge / dmgMul', (function () {
  const s = cf.stats();
  return s.forge === WT.forgeMax && Math.abs(s.dmgMul - cf.damageMul()) < 1e-9;
})());
const cp = mk(1);
T('金币不足时拒绝锻造', (function () { cp.gold = 0; return !cp.forge() && cp.forgeLv === 0; })());

// 锻造加成必须同时作用于直击与溅射
function enemy(hp, x, y) {
  return { type: 'wisp', hp: hp, maxHp: hp, t: 0, x: x, y: y, speed: 0, slowT: 0, bounty: 8, leak: 1, color: '', alive: true };
}
function hitPair(mul) {
  const c = mk(1);
  c.forgeLv = mul;
  const a = enemy(10000, 0, 0), b = enemy(10000, 0.5, 0);
  c.enemies = [a, b];
  c.dealDamage(a, 100, tower.TOWER_DEFS.flame);
  return { direct: 10000 - a.hp, splash: 10000 - b.hp, c: c };
}
const h0 = hitPair(0), h1 = hitPair(1);
T('锻造加成作用于直击', h1.direct > h0.direct);
T('锻造加成作用于溅射', h1.splash > h0.splash);

// 塔位/等级全满后，锻造仍能持续吃掉金币（消除「12 座 Lv3 后金币溢出」）
const co = mk(1);
co.gold = 50000;
for (let i = 0; i < tower.MAX_TOWERS; i++) co.build(co.slots[i], 'arrow');
for (let i = 0; i < co.towers.length; i++) while (co.towers[i].lv < tower.MAX_TOWER_LV) co.upgrade(co.towers[i]);
const beforeForge = co.gold;
let forgeGuard = 0;
while (co.forgeCost() > 0 && co.gold >= co.forgeCost() && forgeGuard++ < 100) co.forge();
T('12 座 Lv5 后金币仍有消费出口', co.gold < beforeForge && co.forgeLv > 0);

console.log('--- 5. 英雄阈值调平与老存档零回收 ---');
const cond = storage.HEROES.filter(function (h) { return h.by === 'stars' || h.by === 'clears'; });
T('7 个条件型英雄', cond.length === 7);
T('desc 全部改为波/局语义（无「关」「星」）', cond.every(function (h) { return !/[关星]/.test(h.desc); }));
T('解锁单位固定为波/局', (function () {
  const s = src('scene/Modals.js');
  return s.indexOf("const uStar = ' 波'") >= 0 && s.indexOf("const uClear = ' 局'") >= 0;
})());
T('阈值阶梯递进（clears 3/10/20/40, stars 40/120/240）', (function () {
  const c = cond.filter(function (h) { return h.by === 'clears'; }).map(function (h) { return h.need; }).sort(function (a, b) { return a - b; });
  const s = cond.filter(function (h) { return h.by === 'stars'; }).map(function (h) { return h.need; }).sort(function (a, b) { return a - b; });
  return c.join(',') === '3,10,20,40' && s.join(',') === '40,120,240';
})());
T('最高阈值低于老存档全通进度（360 星 / 120 关）',
  Math.max.apply(null, cond.filter(function (h) { return h.by === 'stars'; }).map(function (h) { return h.need; })) <= 360 &&
  Math.max.apply(null, cond.filter(function (h) { return h.by === 'clears'; }).map(function (h) { return h.need; })) <= 120);
T('HERO_TRAITS 不再承诺迷宫数值效果', (function () {
  const s = src('core/storage.js');
  const block = s.slice(s.indexOf('const HERO_TRAITS'), s.indexOf('function getHeroTrait'));
  // 天赋树 TALENT_META 仍留有迷宫语义文案，属另一个模块，本轮不在清理范围内
  return block.length > 0 && !/迷雾|Boss|道具|每日挑战|探索度/.test(block);
})());
storage.resetProgress();
for (let i = 1; i <= 120; i++) storage.completeLevel(i, { time: 9, steps: 9, swipe: 0, stars: 3, gems: 0, gemTotal: 0 });
const oldStat = storage.heroStats();
T('老存档 120 关 / 360 星仍可读', oldStat.clears >= 120 && oldStat.stars >= 360);
T('老玩家全部条件型英雄保持解锁（零回收）',
  cond.every(function (h) { return storage.heroAvailable(h.id); }));
storage.resetProgress();

console.log('--- 6. 场景接线 ---');
const tsSrc = src('scene/TowerScene.js');
T('升级按钮走 MAX_TOWER_LV', tsSrc.indexOf('t.lv >= MAX_TOWER_LV') >= 0);
T('结算链上报 forge', tsSrc.indexOf('forge: c.forgeLv') >= 0);
T('结算弹窗展示锻造等级', tsSrc.indexOf('⚒ 锻造 ') >= 0);
const sc = new TowerScene(makeSM());
sc.enter({ seed: 1 });
sc.core.gold = 1000;
sc.showBlessing({ wave: 1, bonus: tower.waveBonus(1), offers: ['torch', 'magnet', 'iron'] });
T('赐福弹窗 2 个按钮（锻造 + 跳过）', sc.modal.btns.length === 2);
T('锻造按钮展示当前价格',
  sc.modal.btns[0].label.indexOf('锻造') >= 0 &&
  sc.modal.btns[0].label.indexOf(String(sc.core.forgeCost())) >= 0);
sc.modal.btns[0].onTap();
T('点击锻造后等级 +1', sc.core.forgeLv === 1);
T('弹窗刷新后赐福仍可三选一', sc.modal.rows.length === 3);
T('刷新后价格已递增',
  sc.modal.btns[0].label.indexOf(String(sc.core.forgeCost())) >= 0 && sc.core.forgeCost() > WT.forgeBase);
let blessDrawErr = '';
try { sc.draw(ctxStub()); } catch (e) { blessDrawErr = e.name + ': ' + e.message; }
T('赐福弹窗（含锻造行）绘制冒烟', blessDrawErr === '');
sc.core.forgeLv = 2;
sc.core.wave = 7;
sc.core.reached = 6;
sc._settled = false;
let resultErr = '';
try { sc.showResult({ wave: 7, reached: 6, kills: 10 }); } catch (e) { resultErr = e.name + ': ' + e.message; }
T('结算弹窗可构造（含锻造等级行）', resultErr === '' && !!sc.modal);
let resultDrawErr = '';
try { sc.draw(ctxStub()); } catch (e) { resultDrawErr = e.name + ': ' + e.message; }
T('结算弹窗绘制冒烟', resultDrawErr === '');

console.log('');
console.log('===== v38 死代码清理·数值调平：' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);
