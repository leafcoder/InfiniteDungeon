// v1.11 批次16 道具说明与背包交互修复回归
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
const codex = require(path.join(ROOT, 'core/codex.js'));
const GameScene = require(path.join(ROOT, 'scene/GameScene.js'));

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
function wrapHint(core) {
  const calls = [];
  const orig = core.emit;
  core.emit = function (ev, d) { if (ev === 'hint') calls.push(d); return orig.apply(this, arguments); };
  return calls;
}

async function main() {
  storage.resetProgress();

  console.log('--- 1. 图鉴道具条目含 use 用法字段（补「怎么用」）---');
  const items = codex.byGroup('item');
  // 钥匙/光点是收集物而非使用型道具，本就无需 use 说明；其余消耗类道具都应有用法
  const miss = items.filter(function (e) { return e.key !== 'i_key' && e.key !== 'i_gem' && (!e.use || !e.use.length); });
  T('道具组（钥匙/光点除外）均有 use 用法字段', miss.length === 0);
  const cloak = items.find(function (e) { return e.key === 'i_cloak'; });
  const bow = items.find(function (e) { return e.key === 'i_bow'; });
  const hg = items.find(function (e) { return e.key === 'i_hourglass'; });
  T('隐身斗篷 use 含「点背包格」', (cloak.use || '').indexOf('点背包格') >= 0);
  T('魔弹 use 含「发射」', (bow.use || '').indexOf('发射') >= 0);
  T('时光沙漏 use 标注「被动」', (hg.use || '').indexOf('被动') >= 0);

  console.log('--- 2. 首次获得道具弹用法提示（去重）---');
  const gs = new GameScene(makeSM());
  bootEnter(gs, { level: 5, mode: 'level' });
  const calls = wrapHint(gs.core);
  gs.core.bag = [];
  gs.core._fxSeen = {};
  gs.core._hintFxOnce('cloak');
  gs.core._hintFxOnce('cloak'); // 重复：不应再弹
  gs.core._hintFxOnce('freeze');
  T('首次获得共弹 2 次（cloak+freeze，重复 cloak 不重复）', calls.length === 2);
  T('cloak 提示含「隐身斗篷」', (calls[0] || '').indexOf('隐身斗篷') >= 0);
  T('freeze 提示含「冰冻星」', (calls[1] || '').indexOf('冰冻星') >= 0);

  console.log('--- 3. useItem 按 index 消耗正确槽位（背包交互核心）---');
  gs.core.bag = [{ type: 'cloak', count: 1 }, { type: 'freeze', count: 1 }];
  gs.core.bagSel = 0;
  gs.core.dead = false; gs.core.won = false;
  gs.core.useItem(1); // 用第 2 个（freeze）
  T('useItem(1) 消耗 bag[1]（freeze 移除，cloak 不动）', gs.core.bag.length === 1 && gs.core.bag[0].type === 'cloak');
  gs.core.bag = [{ type: 'cloak', count: 1 }, { type: 'freeze', count: 1 }, { type: 'dash', count: 1 }];
  gs.core.useItem(0);
  T('useItem(0) 消耗 bag[0]（cloak 移除，其余不动）',
    gs.core.bag.length === 2 && gs.core.bag[0].type === 'freeze' && gs.core.bag[1].type === 'dash');

  console.log('--- 4. GameScene 背包按钮点哪格用哪格（UI 接线修复）---');
  const stubCtx = new Proxy({}, {
    get: function (t, p) { if (p === 'measureText') return function () { return { width: 0 }; }; return function () { return stubCtx; }; },
    set: function () { return true; }
  });
  const gs2 = new GameScene(makeSM());
  bootEnter(gs2, { level: 6, mode: 'level' });
  gs2.core.bag = [{ type: 'cloak', count: 1 }, { type: 'freeze', count: 1 }];
  gs2.drawBag(stubCtx, 1); // 创建 bagBtns
  let usedIdx = -1;
  gs2.core.useItem = function (idx) { usedIdx = idx; };
  gs2.bagBtns[1].onTap();
  T('点第 2 个背包格 → useItem(1)', usedIdx === 1);
  usedIdx = -1;
  gs2.bagBtns[0].onTap();
  T('点第 1 个背包格 → useItem(0)', usedIdx === 0);
  // 越界保护：点击空背包格不触发使用
  usedIdx = -1;
  gs2.core.bag = [{ type: 'cloak', count: 1 }];
  gs2.drawBag(stubCtx, 1);
  gs2.bagBtns[2].onTap();
  T('点击空背包格不触发使用', usedIdx === -1);

  console.log('\n===== 结果：' + pass + ' 通过 / ' + fail + ' 失败 =====');
  process.exit(fail ? 1 : 0);
}
main().catch(function (e) { console.error(e); process.exit(1); });
