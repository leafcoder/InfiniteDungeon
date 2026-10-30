// 第二轮反馈修复回归：计时 epoch 错误 + 星级改光尘收集率
const path = require('path');
const ROOT = '/home/zhanglei3/WorkBuddy/2026-10-26-14-05-57/MazeGame/minigame/js';

const mem = {};
global.wx = {
  getStorageSync: (k) => mem[k],
  setStorageSync: (k, v) => { mem[k] = v; },
  removeStorageSync: (k) => { delete mem[k]; },
  shareAppMessage: () => {},
  vibrateShort: () => {},
  createRewardedVideoAd: () => ({ show: () => Promise.reject(new Error('no ad')), onClose: () => {}, load: () => {} })
};

const maze = require(path.join(ROOT, 'core/maze.js'));
const PlayCore = require(path.join(ROOT, 'core/play.js'));
const storage = require(path.join(ROOT, 'core/storage.js'));
const GameScene = require(path.join(ROOT, 'scene/GameScene.js'));

let pass = 0, fail = 0;
function T(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}
function makeSM() {
  return { W: 375, H: 667, sat: 20, toasts: [], toast: () => {}, sceneModal: () => {}, switch: () => {} };
}
function bootEnter(gs, params) {
  gs.enter(params);
  if (gs.loading) gs.loading.until = 0;
  gs.update();
  return gs;
}

console.log('--- 修复1：用时按 elapsed 计算（不再输出 epoch 秒） ---');
{
  const m = maze.generateMaze(5, 1.4, 12345);
  const core = new PlayCore(5, { aspect: 1.4, seed: 12345 });
  // 首帧 tick：任意绝对时间戳（模拟 epoch 毫秒）
  const T0 = 1790000000000;
  core.tick(T0);
  T('首帧后用时=0', core.stats().time === 0);
  core.tick(T0 + 7500);
  T('7.5 秒后 stats().time=7（修复前会是 1790000007）', core.stats().time === 7);
  T('elapsedS 连续推进', core.elapsedS() === 7.5);
  // 幽灵路径 t 也应是相对秒
  T('幽灵路径 t 为相对秒', core.ghostPath.every(p => p.t < 60));
}

console.log('--- 修复2：星级只看光尘收集率 ---');
{
  // 全收 → 3 星
  let gs = new GameScene(makeSM());
  bootEnter(gs, { level: 2 });
  const gemTotal = gs.core.gemTotal;
  gs.onWin({ time: 30, steps: gs.core.bestSteps, swipe: 99, gems: gemTotal, gemTotal: gemTotal });
  const p1 = storage.getProgress().completed[2];
  T('全收光尘 → 3 星（步数/操作超阈值不再扣星）', p1.stars === 3);

  // 60% 不到 → 1 星（通关保底）
  gs = new GameScene(makeSM());
  bootEnter(gs, { level: 3 });
  const gt3 = gs.core.gemTotal;
  gs.onWin({ time: 60, steps: gs.core.bestSteps * 3, swipe: 999, gems: Math.floor(gt3 * 0.3), gemTotal: gt3 });
  const p3 = storage.getProgress().completed[3];
  T('收集 30% → 1 星', p3.stars === 1);

  // ≥60% → 2 星：差一颗全收（gemTotal≥3 时比例 <1 且 ≥0.6）
  gs = new GameScene(makeSM());
  bootEnter(gs, { level: 4 });
  const gt4 = gs.core.gemTotal;
  T('关卡 4 光尘足够做阈值测试（' + gt4 + '）', gt4 >= 3);
  gs.onWin({ time: 60, steps: gs.core.bestSteps * 3, swipe: 999, gems: gt4 - 1, gemTotal: gt4 });
  const p4 = storage.getProgress().completed[4];
  T('差一颗全收（' + (gt4 - 1) + '/' + gt4 + '）→ 2 星', p4.stars === 2);

  // 极速行者成就的时间口径保留：timeOK 仍写入 recordWin（成就表内部依赖）
  T('极速行者成就仍存在', storage.achList().some(a => a.id === 'speed'));
}

console.log('--- 修复2 附加：樱皮肤开局无敌不再被 core.now=0 吞掉 ---');
{
  storage.unlockHero('sakura'); // ad 解锁：手动登记
  storage.setHero('sakura');
  const gs = new GameScene(makeSM());
  bootEnter(gs, { level: 5 });
  T('当前英雄为樱吹雪', storage.getHero() === 'sakura');
  T('invulnUntil 为未来时刻（墙钟）', gs.core.invulnUntil > Date.now());
  storage.setHero('rover');
}

console.log('\n结果: ' + pass + ' 过 / ' + fail + ' 挂');
process.exit(fail ? 1 : 0);
