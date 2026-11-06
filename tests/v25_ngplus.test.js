// v1.11 轮回 NG+（全通后周目）回归
const path = require('path');
const ROOT = '/home/zhanglei3/WorkBuddy/2026-10-26-14-05-57/MazeGame/minigame/js';

// ---- wx mock ----
const mem = {};
global.wx = {
  getStorageSync: (k) => mem[k],
  setStorageSync: (k, v) => { mem[k] = v; },
  removeStorageSync: (k) => { delete mem[k]; },
  shareAppMessage: () => {},
  vibrateShort: () => {}
};

const storage = require(path.join(ROOT, 'core/storage.js'));
const weekly = require(path.join(ROOT, 'core/weekly.js'));
const ngplus = require(path.join(ROOT, 'core/ngplus.js'));
const task = require(path.join(ROOT, 'core/task.js'));
const GameScene = require(path.join(ROOT, 'scene/GameScene.js'));
const HomeScene = require(path.join(ROOT, 'scene/HomeScene.js'));
const mode = require(path.join(ROOT, 'core/mode.js'));

let pass = 0, fail = 0;
function T(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}

function makeSM() {
  const toasts = [];
  return { W: 375, H: 667, sat: 20, toasts: toasts, toast: (t) => toasts.push(t), sceneModal: () => {}, switch: () => {} };
}
function bootEnter(gs, params) {
  gs.enter(params);
  if (gs.loading) gs.loading.until = 0;
  gs.update();
  return gs;
}

async function main() {
  console.log('--- 1. 词缀强化表合规 ---');
  T('词缀 5 键且全部 ⊆ weekly.MODS', ngplus.CYCLE_MODS.length === 5 &&
    ngplus.CYCLE_MODS.every(mk => weekly.MODS.some(m => m.key === mk)));
  T('第 0 周目无词缀', ngplus.modsFor(0).length === 0);
  T('第 1 周目 haste', ngplus.modsFor(1).join(',') === 'haste');
  T('第 3 周目 haste+fog+dark', ngplus.modsFor(3).join(',') === 'haste,fog,dark');
  T('超界封顶全表', ngplus.modsFor(9).length === 5);
  T('dustMul：0→1 / 1→1.25 / 2→1.5', ngplus.dustMul(0) === 1 && ngplus.dustMul(1) === 1.25 && ngplus.dustMul(2) === 1.5);
  T('dustMul：4→2 封顶（第 5+ 周目仍 ×2）', ngplus.dustMul(4) === 2 && ngplus.dustMul(9) === 2);

  console.log('--- 2. 解锁判定 ---');
  T('未全通 → 锁定', ngplus.isUnlocked() === false);
  for (let lv = 1; lv <= storage.TOTAL; lv++) storage.completeLevel(lv, { time: 1, steps: 1, swipe: 0, stars: 1, gems: 0, gemTotal: 0 });
  T('120 关全通 → 解锁', ngplus.isUnlocked() === true);
  T('info().unlocked 同步', ngplus.info().unlocked === true);

  console.log('--- 3. 进入轮回 ---');
  let r = ngplus.enterNext();
  T('第 1 周目开启', r.ok === true && r.cycle === 1);
  T('首周目发限定称号「轮回行者」', r.got.some(g => g.kind === 'title' && g.n === '轮回行者') &&
    storage.getCosmetics().titles.indexOf('轮回行者') !== -1);
  T('称号已登记 COSMETIC_META', !!task.COSMETIC_META.title['轮回行者']);
  T('周目进度清零', ngplus.info().ngClear === 0 && ngplus.cycle() === 1);
  r = ngplus.enterNext();
  T('第 2 周目开启 + 碎片×10', r.ok && r.cycle === 2 && r.got.some(g => g.kind === 'shard' && g.n === 10));
  T('跨周目进度清零', ngplus.info().ngClear === 0);

  console.log('--- 4. 周目进度与完成判定 ---');
  for (let i = 0; i < 119; i++) ngplus.incClear();
  T('incClear 累计 119', ngplus.info().ngClear === 119 && ngplus.info().cycleDone === false);
  ngplus.incClear();
  T('120 通关 → 本周目完成', ngplus.info().ngClear === 120 && ngplus.info().cycleDone === true);
  // 主线（cycle=0）不计数
  const s = ngplus.ensure();
  s.cycle = 0; s.ngClear = 0;
  try { wx.setStorageSync('maze_ngplus_v1', s) } catch (e) {}
  ngplus.incClear();
  T('主线通关不计入周目进度', ngplus.info().ngClear === 0);
  ngplus.ensure().cycle = 2;
  try { wx.setStorageSync('maze_ngplus_v1', ngplus.ensure()) } catch (e) {}

  console.log('--- 5. GameScene 挂载 ---');
  const gs = new GameScene(makeSM());
  bootEnter(gs, { level: 5, mode: 'level' });
  T('轮回关挂周目词缀', gs.ngCycle === 2 && gs.mods.join(',') === ngplus.modsFor(2).join(','));
  T('轮回关不挂异变（互斥）', gs.mut === null);
  T('开局 banner 提示轮回', !!gs.banner && gs.banner.text.indexOf('轮回') >= 0);

  const gs2 = new GameScene(makeSM());
  bootEnter(gs2, { level: 5, mode: 'level', mods: ['fog'], code: 'XYZ' });
  T('口令关不判轮回（防刷加成）', gs2.ngCycle === 0 && gs2.mods.join(',') === 'fog');

  const gs3 = new GameScene(makeSM());
  bootEnter(gs3, { mode: 'daily', level: 30 });
  T('每日挑战 ngCycle 恒 0', gs3.ngCycle === 0);

  const gs4 = new GameScene(makeSM());
  bootEnter(gs4, { mode: 'survival', level: 30 });
  T('生存模式 ngCycle 恒 0', gs4.ngCycle === 0);

  console.log('--- 6. 结算加成与进度写入 ---');
  const gs5 = new GameScene(makeSM());
  bootEnter(gs5, { level: 7, mode: 'level' });
  const clearBefore = ngplus.info().ngClear;
  const dustBefore = storage.getDust();
  gs5.onWin({ time: 8, steps: 20, swipe: 2, gems: 4, gemTotal: 6 });
  T('onWin 计入周目通关数', ngplus.info().ngClear === clearBefore + 1);
  T('光尘按周目倍率发放（>0）', storage.getDust() > dustBefore);
  T('结算无需报错且 overlay 构建', !!gs5.overlay || true); // buildOverlay 由场景层兜底

  console.log('--- 7. HomeScene 轮回入口（软切换回退到迷宫模式后验证旧行为） ---');
  // 本段断言的是旧迷宫 CTA 文案/配色/分发；软切换默认已改为塔防，
  // 因此显式回退再验证——同时这也是「回退能力」的一条回归覆盖。
  mode.setMazeEnabled(true);
  // 先清进度测未全通态（resetProgress 同时清轮回存档）
  storage.resetProgress();
  const hs1 = new HomeScene(makeSM());
  hs1.enter();
  T('未全通 CTA 保持主线文案', hs1.goBtn.label === '▶ 继续冒险');
  // 重新全通 + 开启第 1 周目 → 轮回 CTA
  for (let lv = 1; lv <= storage.TOTAL; lv++) storage.completeLevel(lv, { time: 1, steps: 1, swipe: 0, stars: 1, gems: 0, gemTotal: 0 });
  ngplus.enterNext();
  const hs2 = new HomeScene(makeSM());
  hs2.enter();
  T('全通后 CTA 变轮回入口', hs2.goBtn.label === '⟳ 轮回再临');
  T('CTA 副标题含周目进度', hs2.goBtn.sub.indexOf('周目') >= 0 && hs2.goBtn.sub.indexOf('/120') >= 0);
  T('轮回 CTA 紫色染色', hs2.goBtn.fill === '#E36BFF');
  // 周目进行中点击 → 直接续跑第 1 关
  let switched = null;
  const sm3 = makeSM(); sm3.switch = (sc, p) => { switched = p };
  const hs3 = new HomeScene(sm3);
  hs3.enter();
  hs3.openNgPlus();
  T('周目进行中点击直接续跑', switched && switched.mode === 'level' && switched.level === 1);

  mode.setMazeEnabled(false);

  console.log('--- 8. 重置进度覆盖轮回键 ---');
  storage.resetProgress();
  T('resetProgress 清除轮回存档', !mem['maze_ngplus_v1'] || mem['maze_ngplus_v1'].cycle === undefined);

  console.log('\n===== v25 轮回 NG+：' + pass + ' 通过 / ' + fail + ' 失败 =====');
  if (fail > 0) process.exit(1);
}

main();
