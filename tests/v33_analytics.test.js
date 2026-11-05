// v1.11 批次20 埋点上报抽象层（接口桩）回归
const path = require('path');
const ROOT = '/home/zhanglei3/WorkBuddy/2026-10-26-14-05-57/MazeGame/minigame/js';

const mem = {};
let reqCount = 0;
global.wx = {
  getStorageSync: (k) => mem[k],
  setStorageSync: (k, v) => { mem[k] = v; },
  removeStorageSync: (k) => { delete mem[k]; },
  request: () => { reqCount++; },
  getSystemInfoSync: () => ({ model: 'test', windowWidth: 375, windowHeight: 667, pixelRatio: 2 }),
  getMenuButtonBoundingClientRect: () => ({ top: 20, height: 32, width: 80, right: 360, left: 280 }),
  shareAppMessage: () => {},
  vibrateShort: () => {}
};

const analytics = require(path.join(ROOT, 'core/analytics.js'));
const storage = require(path.join(ROOT, 'core/storage.js'));
const task = require(path.join(ROOT, 'core/task.js'));
const GameScene = require(path.join(ROOT, 'scene/GameScene.js'));
const Modals = require(path.join(ROOT, 'scene/Modals.js'));

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

console.log('--- 1. 缓冲 / 白名单 / 隐私过滤 ---');
{
  analytics.reset();
  const r1 = analytics.track('level_win', { level: 5, stars: 3 });
  T('合法事件入缓冲', analytics.summary().buffered === 1 && r1.queued === 1);
  T('byEvent 统计正确', analytics.summary().byEvent.level_win === 1);
  T('事件带时间戳', typeof analytics.loadBuffer()[0].t === 'number');
  const r2 = analytics.track('not_registered_event', { x: 1 });
  T('未登记事件被拒（防拼写漂移）', r2.reason === 'unknown_event' && analytics.summary().buffered === 1);
  analytics.track('level_fail', { level: 1, obj: { a: 1 }, fn: function () {}, long: 'x'.repeat(100), ok: true });
  const p = analytics.loadBuffer()[1].p;
  T('payload 只保留标量', p.level === 1 && p.ok === true && !('obj' in p) && !('fn' in p));
  T('长字符串截断到 32', p.long.length === 32);
  // 环形缓冲上限
  for (let i = 0; i < 60; i++) analytics.track('checkin', { streak: i });
  T('缓冲封顶 50 条不膨胀', analytics.summary().buffered === 50);
  T('最旧记录被挤出（环形）', analytics.loadBuffer()[0].e !== 'level_win');
  // 开关
  analytics.setEnabled(false);
  const before = analytics.summary().buffered;
  analytics.track('level_win', { level: 9 });
  T('关闭后不记录', analytics.summary().buffered === before);
  analytics.setEnabled(true);
  T('isEnabled 反映开关', analytics.isEnabled() === true);
  T('默认无 transport（零网络请求）', analytics.summary().hasTransport === false && reqCount === 0);
}

console.log('--- 2. transport 降级 / 失败重试 / 后端接入 ---');
{
  analytics.reset();
  analytics.track('level_win', { level: 1 });
  analytics.track('level_fail', { level: 2 });
  analytics.track('checkin', { streak: 3 });
  T('无后端时事件留在本地缓冲', analytics.summary().buffered === 3);
  // 后端返回 false：保留缓冲
  analytics.setTransport(function () { return false; });
  analytics.track('level_win', { level: 3 });
  T('transport 返回 false → 缓冲保留', analytics.summary().buffered === 4);
  T('记录 lastError', analytics.summary().lastError.length > 0);
  // 后端抛错：保留缓冲
  analytics.setTransport(function () { throw new Error('boom'); });
  analytics.track('level_win', { level: 4 });
  T('transport 抛错 → 缓冲保留', analytics.summary().buffered === 5);
  T('lastError 记录异常信息', analytics.summary().lastError.indexOf('boom') >= 0);
  // 后端恢复：flush 成功清空
  let sent = [];
  analytics.setTransport(function (recs) { sent = sent.concat(recs); return true; });
  const ok = analytics.flush();
  T('flush 成功', ok === true);
  T('flush 投递全部 5 条', sent.length === 5);
  T('成功清空缓冲', analytics.summary().buffered === 0);
  T('sent 累计生效', analytics.summary().sent >= 5);
  // 内置 wx.request transport
  analytics.reset();
  reqCount = 0;
  analytics.configure({ endpoint: 'https://example.test/collect' });
  T('configure 后 hasTransport=true', analytics.summary().hasTransport === true);
  analytics.track('level_win', { level: 7 });
  T('内置 transport 触发 wx.request', reqCount === 1);
  T('投递后缓冲清空', analytics.summary().buffered === 0);
}

console.log('--- 3. 事件接线（成就 / 通关 / 失败 / 重置） ---');
{
  analytics.reset();
  storage.resetProgress();
  storage.unlockAch('journey');
  T('unlockAch → ach_unlock 事件', (analytics.summary().byEvent.ach_unlock || 0) >= 1);
  const payload = analytics.loadBuffer().filter(r => r.e === 'ach_unlock')[0].p;
  T('成就 payload 含 id/reward', payload.id === 'journey' && typeof payload.reward === 'number');
  // onWin / onFail（复用 v28 无头脚手架，stub buildOverlay 隔离渲染）
  try {
    const gs = new GameScene(makeSM());
    bootEnter(gs, { level: 6, mode: 'level' });
    gs.buildOverlay = function () {};
    gs.onWin({ gems: 5, gemTotal: 5, steps: 20, swipe: 2, time: 30 });
    T('onWin → level_win 事件', (analytics.summary().byEvent.level_win || 0) >= 1);
    gs.onFail('caught');
    T('onFail → level_fail 事件', (analytics.summary().byEvent.level_fail || 0) >= 1);
  } catch (e) {
    console.log('  ⚠ GameScene 无头跳过：' + e.message);
    T('GameScene 接线', false);
  }
  // resetProgress 清理埋点键
  const had = analytics.summary().buffered > 0;
  storage.resetProgress();
  T('resetProgress 清空埋点缓冲', had && analytics.summary().buffered === 0);
}

console.log('--- 4. 与既有本机任务漏斗并存（互不干扰） ---');
{
  analytics.reset();
  task.track('expose');
  T('task.track 仍写本机漏斗', storage.getTaskTrack().expose >= 1);
  T('漏斗事件不污染上报缓冲', analytics.summary().buffered === 0);
  T('trackSummary 仍可用', typeof task.trackSummary().clickRate === 'number');
}

console.log('--- 5. 设置页展示埋点上报状态（零新增按钮） ---');
{
  analytics.reset();
  analytics.track('level_win', { level: 1 });
  try {
    const m = Modals.showSettings(makeSM(), function () {});
    const row = (m.rows || []).filter(r => (r.title || '').indexOf('埋点上报') >= 0)[0];
    T('设置页出现埋点上报状态行', !!row);
    if (row) T('状态行标注「接口留桩」', (row.tag || '').indexOf('留桩') >= 0);
  } catch (e) {
    console.log('  ⚠ showSettings 跳过：' + e.message);
    T('设置页状态行', false);
  }
}

console.log('');
console.log('结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail > 0 ? 1 : 0);
