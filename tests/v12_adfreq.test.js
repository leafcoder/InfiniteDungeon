// v1.2 广告频次控制回归（官方合规：每日上限 + 两次展示间隔）
const assert = require('assert');
let passed = 0, failed = 0;
function T(name, cond) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name); }
}

// ---- 存储 mock（模拟 wx 本地存储） ----
const store = {};
const tick = () => new Promise(r => setTimeout(r, 0));

// ---- 激励视频广告 mock ----
const adMock = {
  _showN: 0, _loadN: 0, _c: null,
  show: function () { this._showN++; return Promise.resolve(); },
  load: function () { this._loadN++; return Promise.resolve(); },
  onClose: function (f) { this._c = f; },
  offClose: function () { this._c = null; },
  fireClose: function (res) { if (this._c) this._c(res); }
};

global.wx = {
  getStorageSync: (k) => store[k],
  setStorageSync: (k, v) => { store[k] = v; },
  removeStorageSync: (k) => { delete store[k]; },
  createRewardedVideoAd: () => adMock
};

const ad = require('../minigame/js/core/ad.js');
ad._reset();
adMock._showN = 0; adMock._loadN = 0;

// 与 ad.js 一致的本地日期串（直接构造存储记录以模拟时间推进，
// 因为 showRewarded 内部使用真实时钟、无法注入 now）
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}
const FREQ_KEY = 'maze_ad_freq_v1';

(async function main() {
  console.log('--- 1. 常量与默认状态 ---');
  T('DAILY_LIMIT=3（每日上限）', ad.DAILY_LIMIT === 3);
  T('MIN_INTERVAL_MS=60000（两次间隔 ≥60s）', ad.MIN_INTERVAL_MS === 60000);
  let st = ad.freqState();
  T('初始 canShow=true，remain=3', st.canShow === true && st.remain === 3 && st.count === 0);

  console.log('--- 2. 成功展示计数 ---');
  let cbArg = null;
  const handled1 = ad.showRewarded(function (ok, why) { cbArg = [ok, why]; });
  await tick();
  adMock.fireClose({ isEnded: true });
  T('showRewarded handled=true（真实广告路径）', handled1 === true);
  T('完整看完回调 cb(true)', cbArg[0] === true && cbArg[1] === undefined);
  T('展示计数 +1', ad.freqState().count === 1 && ad.freqState().remain === 2);

  console.log('--- 3. 间隔拦截（60s 内再次拉起） ---');
  const showBefore = adMock._showN;
  cbArg = null;
  const handled2 = ad.showRewarded(function (ok, why) { cbArg = [ok, why]; });
  T('间隔内拉起被拦截：handled=true 且不真正展示', handled2 === true && adMock._showN === showBefore);
  T('回调 cb(false, "interval")', cbArg[0] === false && cbArg[1] === 'interval');
  T('nextInSec>0', ad.freqState().nextInSec > 0);

  console.log('--- 4. 间隔过后可再次展示 ---');
  const later = Date.now() + 61000;
  T('freqState(later) canShow=true', ad.freqState(later).canShow === true && ad.freqState(later).count === 1);
  // 回拨上次展示时间 61s，模拟间隔已过（showRewarded 用真实时钟，故直接改存储记录）
  store[FREQ_KEY].t = Date.now() - 61000;
  ad.showRewarded(function () {});
  await tick();
  adMock.fireClose({ isEnded: true });
  T('第二次展示成功，count=2', ad.freqState().count === 2);

  console.log('--- 5. 每日上限拦截 ---');
  // 构造「今天已看 3 次、最后一次在 120s 前」的记录：间隔已过但次数用尽
  store[FREQ_KEY] = { d: todayStr(), n: 3, t: Date.now() - 120000 };
  adMock._showN = 0;
  cbArg = null;
  const handled3 = ad.showRewarded(function (ok, why) { cbArg = [ok, why]; });
  T('达到每日上限：拦截且不拉起', handled3 === true && adMock._showN === 0);
  T('回调 cb(false, "daily")', cbArg[0] === false && cbArg[1] === 'daily');
  T('freqState reason="daily"，remain=0', ad.freqState().reason === 'daily' && ad.freqState().remain === 0);

  console.log('--- 6. 跨天重置 ---');
  store[FREQ_KEY] = { d: '2000-01-01', n: 99, t: 0 };
  st = ad.freqState();
  T('隔日旧记录自动失效：count=0 可展示', st.canShow === true && st.count === 0 && st.remain === 3);
  ad.recordShown(Date.now());
  st = ad.freqState();
  T('跨天后首次计数重置为 1', st.count === 1);

  console.log('--- 7. 防御性 ---');
  store[FREQ_KEY] = 'corrupted-string';
  st = ad.freqState();
  T('损坏存储不崩溃且视为无记录', st.canShow === true && st.count === 0);
  store[FREQ_KEY] = null;
  T('null 存储不崩溃', ad.freqState().canShow === true);

  console.log('--- 8. 展示失败不计数 ---');
  ad._reset();
  store[FREQ_KEY] = null;
  adMock.show = function () { return Promise.reject(new Error('no fill')); };
  cbArg = null;
  ad.showRewarded(function (ok, why) { cbArg = [ok, why]; });
  await tick(); await tick();
  T('两次 show 均失败 → cb(false) 且不计数', cbArg[0] === false && ad.freqState().count === 0);

  console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
  process.exit(failed ? 1 : 0);
})();
