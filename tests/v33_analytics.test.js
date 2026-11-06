// v1.4 纯单机埋点回归：本机环形缓冲 / 白名单 / 隐私过滤 / 零网络能力
// 用户已确认「暂不接后端，只做单机游戏」：configure / setTransport / flush / wx.request 全部移除，
// 这里把「零网络」固化成源码与运行时双重断言，防止后端接口桩日后悄悄回潮。
const path = require('path');
const fs = require('fs');
const ROOT = '/home/zhanglei3/WorkBuddy/2026-10-26-14-05-57/MazeGame/minigame/js';
const REPO = '/home/zhanglei3/WorkBuddy/2026-10-26-14-05-57/MazeGame';

const mem = {};
let reqCount = 0;
global.wx = {
  getStorageSync: (k) => mem[k],
  setStorageSync: (k, v) => { mem[k] = v; },
  removeStorageSync: (k) => { delete mem[k]; },
  request: () => { reqCount++; },   // 若有人偷偷接后端，这里会被计数
  getSystemInfoSync: () => ({ model: 'test', windowWidth: 375, windowHeight: 667, pixelRatio: 2 }),
  getMenuButtonBoundingClientRect: () => ({ top: 20, height: 32, width: 80, right: 360, left: 280 }),
  shareAppMessage: () => {},
  vibrateShort: () => {}
};

const analytics = require(path.join(ROOT, 'core/analytics.js'));
const storage = require(path.join(ROOT, 'core/storage.js'));
const task = require(path.join(ROOT, 'core/task.js'));
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
function src(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function repo(rel) { return fs.readFileSync(path.join(REPO, rel), 'utf8'); }

console.log('--- 1. 缓冲 / 白名单 / 隐私过滤 ---');
{
  analytics.reset();
  const r1 = analytics.track('td_start', { seed: 7 });
  T('合法塔防事件入缓冲', analytics.summary().buffered === 1 && r1.queued === 1);
  T('byEvent 统计正确', analytics.summary().byEvent.td_start === 1);
  T('事件带时间戳', typeof analytics.loadBuffer()[0].t === 'number');
  const r2 = analytics.track('not_registered_event', { x: 1 });
  T('未登记事件被拒（防拼写漂移）', r2.reason === 'unknown_event' && analytics.summary().buffered === 1);
  analytics.track('td_end', { reached: 3, obj: { a: 1 }, fn: function () {}, long: 'x'.repeat(100), ok: true });
  const p = analytics.loadBuffer()[1].p;
  T('payload 只保留标量', p.reached === 3 && p.ok === true && !('obj' in p) && !('fn' in p));
  T('长字符串截断到 32 字符', p.long.length === 32);
  T('payload 键数上限 = MAX_PAYLOAD_KEYS（16，避免 td_end 尾字段被静默截断）', (function () {
    const many = {};
    for (let i = 0; i < 20; i++) many['k' + i] = i;
    analytics.track('td_wave', many);
    const q = analytics.loadBuffer().filter(r => r.e === 'td_wave').pop().p;
    return analytics.MAX_PAYLOAD_KEYS === 16 && Object.keys(q).length === 16;
  })());
  for (let i = 0; i < 60; i++) analytics.track('checkin', { streak: i });
  T('缓冲封顶 50 条不膨胀', analytics.summary().buffered === 50);
  T('最旧记录被挤出（环形）', analytics.loadBuffer()[0].e !== 'td_start');
  analytics.setEnabled(false);
  const before = analytics.summary().buffered;
  analytics.track('td_start', { seed: 9 });
  T('关闭后不记录', analytics.summary().buffered === before);
  analytics.setEnabled(true);
  T('isEnabled 反映开关', analytics.isEnabled() === true);
  analytics.clear();
  T('clear 清空缓冲', analytics.summary().buffered === 0);
}

console.log('--- 2. 纯单机：代码层与运行时均无网络能力 ---');
{
  const s = src('core/analytics.js');
  T('源码无 wx.request 调用', !/wx\.request\s*\(/.test(s));
  T('源码无 configure / setTransport / flush 函数', !/function (configure|setTransport|flush)\s*\(/.test(s));
  T('exports 不含后端接口', typeof analytics.configure === 'undefined' && typeof analytics.setTransport === 'undefined' && typeof analytics.flush === 'undefined');
  T('summary 不再暴露后端字段', analytics.summary().hasTransport === undefined && analytics.summary().endpoint === undefined && analytics.summary().sent === undefined);
  T('埋点全程零 wx.request 调用', reqCount === 0);
  T('白名单含塔防与已迁入外围事件', ['td_start', 'td_end', 'td_wave', 'td_bless', 'ach_unlock', 'season_claim', 'checkin'].every(k => analytics.TRACK_EVENTS.indexOf(k) >= 0));
  T('白名单已移除迷宫事件', ['level_win', 'level_fail', 'daily_win', 'weekly_win', 'festival_win', 'endless_depth', 'mutation_win', 'ngplus_enter'].every(k => analytics.TRACK_EVENTS.indexOf(k) === -1));
  T('storage 移除微信托管数据上报', src('core/storage.js').indexOf('setUserCloudStorage') === -1 && typeof storage.reportScoreKV === 'undefined');
  T('game.json 无云开发 / 域名配置', repo('minigame/game.json').indexOf('cloud') === -1 && repo('minigame/game.json').indexOf('http') === -1);
  T('project.config.json 无云函数根 / 合法域名', repo('minigame/project.config.json').indexOf('cloudfunctionRoot') === -1 && repo('minigame/project.config.json').indexOf('request') === -1);
}

console.log('--- 3. 外围接线（成就 / 重置） ---');
{
  analytics.reset();
  storage.resetProgress();
  storage.unlockAch('journey');
  T('unlockAch → ach_unlock 事件', (analytics.summary().byEvent.ach_unlock || 0) >= 1);
  const payload = analytics.loadBuffer().filter(r => r.e === 'ach_unlock')[0].p;
  T('成就 payload 含 id/reward', payload.id === 'journey' && typeof payload.reward === 'number');
  const had = analytics.summary().buffered > 0;
  storage.resetProgress();
  T('resetProgress 清空埋点缓冲', had && analytics.summary().buffered === 0);
}

console.log('--- 4. 与既有本机任务漏斗并存（互不干扰） ---');
{
  analytics.reset();
  task.track('expose');
  T('task.track 仍写本机漏斗', storage.getTaskTrack().expose >= 1);
  T('漏斗事件不污染埋点缓冲', analytics.summary().buffered === 0);
  T('trackSummary 仍可用', typeof task.trackSummary().clickRate === 'number');
}

console.log('--- 5. 设置页不暴露开发向埋点状态 ---');
{
  analytics.reset();
  analytics.track('td_start', { seed: 1 });
  const m = Modals.showSettings(makeSM(), function () {});
  T('设置页不再显示埋点上报状态行', !(m.rows || []).some(r => (r.title || '').indexOf('埋点上报') >= 0));
  T('埋点数据层仍在采集（展示层下线不影响功能）', analytics.summary().buffered > 0);
}

console.log('');
console.log('结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail > 0 ? 1 : 0);
