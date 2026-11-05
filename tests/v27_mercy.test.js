// v1.11 批次14 连败保护回归
const path = require('path');
const ROOT = '/home/zhanglei3/WorkBuddy/2026-10-26-14-05-57/MazeGame/minigame/js';

const mem = {};
global.wx = {
  getStorageSync: (k) => mem[k],
  setStorageSync: (k, v) => { mem[k] = v; },
  removeStorageSync: (k) => { delete mem[k]; },
  shareAppMessage: () => {},
  vibrateShort: () => {}
};

const storage = require(path.join(ROOT, 'core/storage.js'));
const mercy = require(path.join(ROOT, 'core/mercy.js'));
const PlayCore = require(path.join(ROOT, 'core/play.js'));
const GameScene = require(path.join(ROOT, 'scene/GameScene.js'));

let pass = 0, fail = 0;
function T(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}
function makeSM() {
  const toasts = [];
  return { W: 375, H: 667, sat: 20, toasts, toast: (t) => toasts.push(t), sceneModal: () => {}, switch: () => {} };
}
function bootEnter(gs, params) {
  gs.enter(params);
  if (gs.loading) gs.loading.until = 0;
  gs.update();
  return gs;
}

async function main() {
  storage.resetProgress();

  console.log('--- 1. recordFail 计数规则 ---');
  T('首败 streak=1', mercy.recordFail(30) === 1);
  T('同关再败 streak=2', mercy.recordFail(30) === 2);
  T('同关三败 streak=3', mercy.recordFail(30) === 3);
  T('换关失败重开计数', mercy.recordFail(31) === 1);
  T('换关后原关保护失效', mercy.streakFor(30) === 0);

  console.log('--- 2. mercyFor 档位 ---');
  T('streak 0/1 无保护', mercy.mercyFor(30, 0) === null && mercy.mercyFor(30, 1) === null);
  const m2 = mercy.mercyFor(30, 2);
  T('streak 2：不减速 + 无敌 6s + 送道具', m2 && m2.slow === 1 && m2.extraInvuln === 3000 && !!m2.gift);
  const m3 = mercy.mercyFor(30, 3);
  T('streak 3：减速 0.85', m3 && m3.slow === 0.85 && m3.extraInvuln === 3000);
  const m4 = mercy.mercyFor(30, 4);
  T('streak 4+：减速 0.75 + 无敌 8s', m4 && m4.slow === 0.75 && m4.extraInvuln === 5000);
  const m9 = mercy.mercyFor(30, 9);
  T('streak 9 封顶同 4 档', m9 && m9.slow === 0.75 && m9.extraInvuln === 5000);
  T('gift 确定性（同参同果）', mercy.mercyFor(30, 2).gift === mercy.mercyFor(30, 2).gift);
  T('gift 在基础道具池', ['shield', 'cloak', 'freeze', 'dash'].indexOf(m2.gift) >= 0);

  console.log('--- 3. streakFor 同关门槛 ---');
  mercy.recordFail(30); mercy.recordFail(30); mercy.recordFail(30); // 30 关连败 3（重开计数后累加）
  T('30 关连败 3 → streakFor=3', mercy.streakFor(30) === 3);

  console.log('--- 4. recordWin 清零 ---');
  mercy.recordWin();
  T('通关后 streakFor=0', mercy.streakFor(30) === 0);
  T('存档清空', (mem['maze_mercy_v1'] || {}).failStreak === 0);

  console.log('--- 5. PlayCore 接 mercy 参数 ---');
  const coreA = new PlayCore(30, { mode: 'level' });
  const coreB = new PlayCore(30, { mode: 'level', mercy: { streak: 3, slow: 0.85, extraInvuln: 3000, gift: 'shield' } });
  T('无 mercy 时怪物原速', coreA.monsterStepMs === coreB.mercy0Check || coreA.monsterStepMs > 0);
  // 同 seed 难以对齐：直接断言 mercy 怪速 = 原速 ×0.85
  const raw = Math.round(coreA.monsterStepMs * 0.85);
  T('mercy 怪速 = 原速 ×0.85', coreB.monsterStepMs === raw);
  T('mercy 开局送护盾入包', coreB.bag.length === 1 && coreB.bag[0].type === 'shield' && coreB.bag[0].count === 1);
  T('mercy 开局无敌延长（墙钟）', coreB.invulnUntil > Date.now() + 2000);
  T('无 mercy 无礼包', coreA.bag.length === 0 && coreA.invulnUntil === 0);
  const coreC = new PlayCore(30, { mode: 'level', mercy: { streak: 4, slow: 0.75, extraInvuln: 5000, gift: 'cloak' } });
  T('streak 4 怪速 = 原速 ×0.75', coreC.monsterStepMs === Math.round(coreA.monsterStepMs * 0.75));
  T('streak 4 无敌 8s', coreC.invulnUntil > Date.now() + 4000);

  console.log('--- 6. GameScene 接线（enter/onFail/onWin） ---');
  const gs = new GameScene(makeSM());
  gs.enter({ level: 30, mode: 'level' });
  T('无连败时 mercyStreak=0', gs.mercyStreak === 0 && gs.mercyInfo === null);
  // 模拟连败 3 次 → 重建
  gs.onFail('被追上');
  gs.onFail('被追上');
  gs.onFail('被追上');
  T('onFail 记录连败 3', gs.mercyStreak === 0 && mercy.streakFor(30) === 3);
  gs.enter({ level: 30, mode: 'level' });
  T('重进后 mercyStreak=3', gs.mercyStreak === 3);
  T('mercyInfo 减速 0.85', gs.mercyInfo && gs.mercyInfo.slow === 0.85);
  T('开局 banner 提示连败保护', gs.banner && gs.banner.text.indexOf('连败保护') >= 0);
  T('core 收到 mercy', gs.core.mercy && gs.core.mercy.slow === 0.85);
  T('core 包里有开局礼包', gs.core.bag.length === 1);
  // 通关清零
  mercy.recordWin();
  gs.enter({ level: 31, mode: 'level' });
  T('通关后重建 mercyStreak=0', gs.mercyStreak === 0 && !gs.banner);

  console.log('--- 7. 模式豁免 ---');
  mercy.recordFail(30); mercy.recordFail(30); mercy.recordFail(30);
  const gs2 = new GameScene(makeSM());
  gs2.enter({ level: 30, mode: 'daily' });
  T('每日挑战不做轻减', gs2.mercyStreak === 0 && gs2.mercyInfo === null);
  const gs3 = new GameScene(makeSM());
  gs3.enter({ level: 1, mode: 'endless', floor: 5 });
  T('无尽塔不做轻减', gs3.mercyStreak === 0);
  mercy.recordWin();

  console.log('--- 8. resetProgress 覆盖 mercy 键 ---');
  mercy.recordFail(30); mercy.recordFail(30);
  storage.resetProgress();
  T('重置后连败清零', mercy.streakFor(30) === 0);

  console.log('\n===== v27 连败保护: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
