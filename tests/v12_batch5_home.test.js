// HomeScene 冒烟：fest pill 初始化顺序 / 布局无重叠 / openEntry endless / openFest
const path = require('path');
const ROOT = '/home/zhanglei3/WorkBuddy/2026-10-26-14-05-57/MazeGame/minigame/js';
const mem = {};
global.wx = {
  getStorageSync: (k) => mem[k],
  setStorageSync: (k, v) => { mem[k] = v; },
  removeStorageSync: (k) => { delete mem[k]; }
};
const storage = require(path.join(ROOT, 'core/storage.js'));
const endless = require(path.join(ROOT, 'core/endless.js'));
const festival = require(path.join(ROOT, 'core/festival.js'));
const HomeScene = require(path.join(ROOT, 'scene/HomeScene.js'));

let pass = 0, fail = 0;
function T(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}
function makeSM() {
  const modals = [];
  return {
    W: 375, H: 667, sat: 20,
    modals: modals,
    toast: () => {},
    sceneModal: (m) => modals.push(m),
    switch: (k, p) => { this._switched = { key: k, p: p }; }
  };
}

// 万圣节期间（当前日期自动命中）
const hs = new HomeScene(makeSM());
hs.enter();
T('活动命中 → fest 注入', !!hs.fest && hs.fest.id === 'halloween');
T('festRect 存在', !!hs.festRect);
T('festRect 在 Hero 卡下方（无重叠）', hs.festRect.y >= hs.hero.y + hs.hero.h);
T('festRect 不与网格重叠', hs.festRect.y + hs.festRect.h <= hs.gz.y);
T('festRect 不与顶栏按钮重叠', hs.festRect.y > hs.iconBtns[0].y + hs.iconBtns[0].h);
T('dock 6 项含无尽', hs.dock.length === 6 && hs.dock[5].key === 'endless');
T('dock 触摸热区宽 ≥44px（88rpx 规范）', hs.dock[0].w >= 44);
T('命中判定 inFestPill', hs.inFestPill(hs.festRect.x + 5, hs.festRect.y + 5));
T('胶囊外命中 false', !hs.inFestPill(10, 10));

// 空档期无活动
const realGetActive = festival.getActive;
festival.getActive = () => null;
const hs2 = new HomeScene(makeSM());
hs2.enter();
festival.getActive = realGetActive;
T('空档期 festRect 为 null（入口隐藏）', hs2.festRect === null && hs2.fest === null);

// openEntry endless 未解锁 → toast 不弹窗
const sm3 = makeSM();
const hs3 = new HomeScene(sm3);
hs3.enter();
hs3.openEntry('endless');
T('未解锁点无尽塔 → 无弹窗', hs3.modal === null);

// 解锁后 → 弹说明
for (let i = 1; i <= 120; i++) storage.completeLevel(i, { time: 9, steps: 9, swipe: 0, stars: 1, gems: 0, gemTotal: 0 });
hs3.openEntry('endless');
T('解锁后点无尽塔 → 弹窗', !!hs3.modal);

// openFest → 弹活动弹窗
hs3.modal = null;
hs3.openFest();
T('活动弹窗弹出', !!hs3.modal);

console.log('');
console.log(fail === 0 ? 'ALL PASS: ' + pass : 'FAIL: ' + fail + ' / PASS: ' + pass);
process.exit(fail === 0 ? 0 : 1);
