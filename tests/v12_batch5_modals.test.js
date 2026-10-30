// Modals 冒烟：showSupply（试用二级弹窗）/ showFestival / showEndless / showRank
const path = require('path');
const ROOT = '/home/zhanglei3/WorkBuddy/2026-10-26-14-05-57/MazeGame/minigame/js';
const mem = {};
global.wx = {
  getStorageSync: (k) => mem[k],
  setStorageSync: (k, v) => { mem[k] = v; },
  removeStorageSync: (k) => { delete mem[k]; }
};
const storage = require(path.join(ROOT, 'core/storage.js'));
const Modals = require(path.join(ROOT, 'scene/Modals.js'));

let pass = 0, fail = 0;
function T(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}
function makeSM() {
  const stack = [];
  return {
    W: 375, H: 667, sat: 20, stack: stack,
    toast: () => {},
    sceneModal: (m) => stack.push(m),
    switch: () => {}
  };
}

// showRank 含今日榜行
{
  const sm = makeSM();
  const m = Modals.showRank(sm, () => {});
  T('showRank 构建', !!m && !!m.rows);
  T('排行榜含「今日挑战（本机）」行', m.rows.some(r => r.title === '今日挑战（本机）'));
}

// showSupply：技能行出现「试用」；点行 → 二级弹窗含「免费试用 1 局」
{
  const sm = makeSM();
  const m = Modals.showSupply(sm, () => {});
  const skillRows = m.rows.filter(r => r.title && (r.title.indexOf('闪现步') === 0 || r.title.indexOf('透视眼') === 0));
  T('技能行存在', skillRows.length === 2);
  T('未解锁技能显示「试用」', skillRows.every(r => r.tag === '试用'));
  skillRows[0].onTap();
  T('点技能行 → 二级弹窗', sm.stack.length === 1);
  const m2 = sm.stack[0];
  const labels = m2.btns.map(b => b.label || '');
  T('二级弹窗含「免费试用 1 局」', JSON.stringify(labels).indexOf('免费试用 1 局') >= 0);
  // 点试用按钮
  const trialBtn = m2.btns.find(b => (b.label || '').indexOf('免费试用') >= 0);
  trialBtn.onTap();
  T('试用标记写入', storage.getTrial() === 'dash' || storage.getTrial() === 'insight');
}

// showFestival / showEndless
{
  const sm = makeSM();
  const mf = Modals.showFestival(sm, () => {}, () => {});
  T('活动弹窗构建（万圣节期）', !!mf && mf.title.indexOf('万圣夜巡游') >= 0);
  const me = Modals.showEndless(sm, () => {}, () => {});
  T('无尽塔弹窗构建', !!me && me.title.indexOf('无尽地宫塔') >= 0);
  T('未解锁态含锁定提示', me.lines.some(l => (l.t || '').indexOf('尚未解锁') >= 0));
}

console.log('');
console.log(fail === 0 ? 'ALL PASS: ' + pass : 'FAIL: ' + fail + ' / PASS: ' + pass);
process.exit(fail === 0 ? 0 : 1);
