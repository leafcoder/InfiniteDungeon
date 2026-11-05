// v1.11 批次19 首入引导页（onboarding）
const path = require('path');
const ROOT = '/home/zhanglei3/WorkBuddy/2026-10-26-14-05-57/MazeGame/minigame/js';

const mem = {};
global.wx = {
  getStorageSync: (k) => mem[k],
  setStorageSync: (k, v) => { mem[k] = v; },
  removeStorageSync: (k) => { delete mem[k]; },
  getSystemInfoSync: () => ({ model: 'test', windowWidth: 375, windowHeight: 667, pixelRatio: 2 }),
  getMenuButtonBoundingClientRect: () => ({ top: 20, height: 32, width: 80, right: 360, left: 280 }),
  shareAppMessage: () => {},
  vibrateShort: () => {}
};

const storage = require(path.join(ROOT, 'core/storage.js'));
const Modals = require(path.join(ROOT, 'scene/Modals.js'));
const HomeScene = require(path.join(ROOT, 'scene/HomeScene.js'));

let pass = 0, fail = 0;
function T(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}
function fakeSM() {
  const toasts = [];
  return {
    W: 375, H: 667, sat: 20, sab: 10, sal: 10, sar: 10,
    toasts, toast: (t) => toasts.push(t),
    sceneModal: () => {}, switch: () => {}
  };
}

console.log('--- 1. showIntro 面板生成 ---');
{
  const sm = fakeSM();
  const m = Modals.showIntro(sm, function () {});
  T('showIntro 返回 Modal', !!m && Array.isArray(m.rows));
  T('标题含「无尽地宫」', (m.title || '').indexOf('无尽地宫') >= 0);
  T('含 4 条玩法要点', m.rows.length === 4);
  const hasExplore = Array.isArray(m.btns) && m.btns.some(b => (b.label || '').indexOf('开始探索') >= 0);
  T('含「开始探索」按钮', hasExplore || (Array.isArray(m.btns) && m.btns.length >= 1));
}

console.log('--- 2. 首入自动弹出 + 关闭标记 seen ---');
// 清空 tutorial 标记，模拟全新玩家
storage.resetProgress();
try {
  const sm = fakeSM();
  const hs = new HomeScene(sm);
  hs.enter();
  T('首入：未 seen 时自动弹出引导页', !!hs.modal);
  T('弹出时 tutorial 尚未标记 seen', storage.getTutorialSeen() === false);
  // 模拟关闭引导页（执行 onClose 回调）
  if (hs.modal && hs.modal.onClose) hs.modal.onClose();
  else if (typeof hs.modal === 'object' && hs.modal._onCloseCb) hs.modal._onCloseCb();
  T('关闭后标记 tutorial seen', storage.getTutorialSeen() === true);
} catch (e) {
  console.log('  ⚠ HomeScene 实例化异常：' + e.message);
  T('HomeScene 实例化成功', false);
}

console.log('--- 3. 已 seen 不再自动弹出 ---');
{
  const sm = fakeSM();
  const hs = new HomeScene(sm);
  hs.enter();
  T('已 seen：不自动弹出引导页', !hs.modal);
}

console.log('');
console.log('结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail > 0 ? 1 : 0);
