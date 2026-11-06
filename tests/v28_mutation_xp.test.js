// v1.11 批次15 异变日联动赛季 XP 回归
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
const mutation = require(path.join(ROOT, 'core/mutation.js'));
const season = require(path.join(ROOT, 'core/season.js'));
const GameScene = require(path.join(ROOT, 'scene/GameScene.js'));
const HomeScene = require(path.join(ROOT, 'scene/HomeScene.js'));

let pass = 0, fail = 0;
function T(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}
function makeSM() {
  const toasts = [];
  return { W: 375, H: 667, sat: 20, sab: 10, sal: 10, sar: 10, toasts, toast: (t) => toasts.push(t), sceneModal: () => {}, switch: () => {} };
}
function bootEnter(gs, params) {
  gs.enter(params);
  if (gs.loading) gs.loading.until = 0;
  gs.update();
  return gs;
}
// stub buildOverlay 以隔离渲染依赖，捕获结算文案
function onWinCaptured(gs, st) {
  let cap = null;
  gs.buildOverlay = function (type, info) { cap = info; };
  gs.onWin(st);
  return cap;
}

async function main() {
  storage.resetProgress();

  console.log('--- 1. season.mutationXp 纯函数三档 ---');
  T('宁静日 bonus=1 → 0', season.mutationXp(mutation.MUTS[0]) === 0);
  T('迷雾日 1.3 → 12', season.mutationXp(mutation.MUTS[1]) === 12);
  T('疾走日 1.4 → 16', season.mutationXp(mutation.MUTS[2]) === 16);
  T('夜幕日 1.5 → 20', season.mutationXp(mutation.MUTS[3]) === 20);
  T('禁补日 1.5 → 20', season.mutationXp(mutation.MUTS[4]) === 20);
  T('围剿日 1.4 → 16', season.mutationXp(mutation.MUTS[5]) === 16);
  T('泥沼日 1.3 → 12', season.mutationXp(mutation.MUTS[6]) === 12);
  T('null/undefined 安全返回 0', season.mutationXp(null) === 0 && season.mutationXp(undefined) === 0);

  const st = { time: 30, steps: 20, swipe: 10, gems: 5, gemTotal: 5 };
  function xpDeltaFor(overrideKey, level) {
    mutation.setOverride(overrideKey);
    const gs = new GameScene(makeSM());
    bootEnter(gs, { level: level, mode: 'level' });
    const before = season.info().xp;
    const cap = onWinCaptured(gs, st);
    const after = season.info().xp;
    mutation.setOverride('');
    return { delta: after - before, cap: cap, lines: cap ? cap.lines.join(' ') : '' };
  }

  console.log('--- 2. 集成：夜幕日通关 XP delta=40（基础20+异变20）---');
  let r = xpDeltaFor('dark', 5);
  T('XP 净增 40', r.delta === 40);
  T('结算文案含「赛季XP+20」', r.lines.indexOf('赛季XP+20') >= 0);
  T('结算文案含「⚗ 夜幕日」', r.lines.indexOf('夜幕日') >= 0);

  console.log('--- 3. 集成：宁静日无额外 XP（仅基础20）---');
  let r2 = xpDeltaFor('calm', 6);
  T('XP 净增 20（无异变加成）', r2.delta === 20);
  T('结算文案不含「赛季XP」', r2.lines.indexOf('赛季XP') < 0);

  console.log('--- 4. 集成：迷雾日 XP delta=32（基础20+异变12）---');
  let r3 = xpDeltaFor('fog', 7);
  T('XP 净增 32', r3.delta === 32);
  T('结算文案含「赛季XP+12」', r3.lines.indexOf('赛季XP+12') >= 0);

  console.log('--- 5. 模式豁免：daily 不挂异变 → 无赛季XP加成 ---');
  mutation.setOverride('dark');
  const gsD = new GameScene(makeSM());
  bootEnter(gsD, { level: 30, mode: 'daily' });
  T('每日挑战 mut 为 null（异变不生效）', gsD.mut === null);
  const beforeD = season.info().xp;
  const capD = onWinCaptured(gsD, st);
  const afterD = season.info().xp;
  mutation.setOverride('');
  T('每日挑战 XP 仅基础40（无 +异变，mut 不生效）', afterD - beforeD === 40);
  T('每日挑战结算文案不含「赛季XP」', capD.lines.indexOf('赛季XP') < 0);

  console.log('--- 6. HomeScene 异变横幅带赛季XP提示 ---');
  mutation.setOverride('dark');
  const hs = new HomeScene(makeSM());
  hs.enter();
  T('词缀日显示异变横幅', !!hs.mutRect && !!hs.mut);
  T('横幅数据 mutationXp=20', hs.mut && season.mutationXp(hs.mut) === 20);
  // 显式固定为宁静日：按真实日期解析会随日期漂移（如 11-06 是迷雾日），使本断言偶发失败
  mutation.setOverride('calm');
  const hs2 = new HomeScene(makeSM());
  hs2.enter();
  T('宁静日不显示异变横幅', hs2.mutRect === null || (hs2.mut && hs2.mut.bonus <= 1));
  mutation.setOverride('');

  console.log('\n===== v28 异变日联动赛季XP: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
