// ============ 广告整合服务（v2） ============
// 激励视频点位规划（新增场景在此登记）：
//   1. 解锁关卡   —— 关卡页点击锁定关，看完广告立即解锁
//   2. 皮肤/英雄解锁 —— 补给站弹窗内看广告解锁（预留位同一点位）
//   3. Boss 复活  —— Boss 关失败后看广告获得短暂护盾复活
//
// 流量主已开通（2026-11）：激励视频广告位 adunit-bbcd2443a128df92，
// 对接微信官方示例流程：show 失败 → load 重试一次 → 再 show → 仍失败回调失败。
// 对接前 AD_UNIT_ID 为空时是 DEV 模拟模式（页面层展示模拟广告页），
// 现在 ID 已填，自动切换为真实广告，页面层无需改动。
// 广告实例全局单例 + 创建后立即预加载，缩短首次拉起等待。

const AD_UNIT_ID = 'adunit-bbcd2443a128df92';

// ============ 广告频次控制（官方合规要求） ============
// 依据：《小程序广告合规指引》要求控制广告频次（示例口径：单用户每日激励视频 ≤3 次）；
// 两次广告展示之间保持间隔（对齐各小游戏平台通用规范 60s）。
// 说明：计数按「实际成功展示」记录——拉起失败不消耗当日次数；
//      跳过未看完的广告同样计入展示次数（已打开）。
const DAILY_LIMIT = 3;            // 单用户每日激励视频上限
const MIN_INTERVAL_MS = 60 * 1000; // 两次广告展示最小间隔
const FREQ_KEY = 'maze_ad_freq_v1';

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

function loadFreq() {
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync) {
      const v = wx.getStorageSync(FREQ_KEY);
      if (v && typeof v === 'object' && v.d !== undefined) return v;
    }
  } catch (e) { /* 存储异常按无记录处理 */ }
  return { d: '', n: 0, t: 0 };
}

function saveFreq(f) {
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) wx.setStorageSync(FREQ_KEY, f);
  } catch (e) { /* 频控状态写失败仅影响跨次启动的记忆，本会话仍会累计 */ }
}

// 当前频控状态；now 仅供测试注入
function freqState(now) {
  now = now || Date.now();
  const f = loadFreq();
  const n = (f.d === todayStr()) ? (f.n || 0) : 0;
  const waitMs = Math.max(0, (f.t || 0) + MIN_INTERVAL_MS - now);
  const overDaily = n >= DAILY_LIMIT;
  return {
    count: n,
    limit: DAILY_LIMIT,
    remain: Math.max(0, DAILY_LIMIT - n),
    nextInSec: Math.ceil(waitMs / 1000),
    canShow: !overDaily && waitMs <= 0,
    reason: overDaily ? 'daily' : (waitMs > 0 ? 'interval' : null)
  };
}

// 记录一次成功展示（拉起成功即计数，无论是否看完）
function recordShown(now) {
  now = now || Date.now();
  const d = todayStr();
  const f = loadFreq();
  const sameDay = f.d === d;
  f.d = d;
  f.n = sameDay ? (f.n || 0) + 1 : 1;
  f.t = now;
  saveFreq(f);
}

let rewardedAd = null;

// 开发者工具模拟器不支持真实广告填充（operateWXDataForAd:fail system apperror），
// 检测到 devtools 时回落 DEV 模拟广告页；真机（预览/体验版/正式版）走真实广告。
// 注意：真机调试仍可能上报 platform='devtools'，真实广告请用「预览」验证。
function isDevtools() {
  try {
    if (typeof wx === 'undefined' || !wx.getSystemInfoSync) return false;
    const sys = wx.getSystemInfoSync();
    return !!sys && sys.platform === 'devtools';
  } catch (e) { return false; }
}

// 是否处于开发模拟模式（ID 为空 或 开发者工具模拟器）
const AD_DEV = !AD_UNIT_ID || isDevtools();

function ensureAd() {
  if (rewardedAd) return rewardedAd;
  if (AD_DEV) return null;
  if (typeof wx === 'undefined' || !wx.createRewardedVideoAd) return null;
  try {
    rewardedAd = wx.createRewardedVideoAd({ adUnitId: AD_UNIT_ID });
    // 预加载：创建后立即拉取一次素材（失败静默，show 时还有重试兜底）
    preload(rewardedAd);
    // onError 只记录不熔断：单次瞬时错误不应让整个会话的广告失效
    if (rewardedAd.onError) {
      rewardedAd.onError(function (err) { console.error('[ad] 激励视频错误', err); });
    }
  } catch (e) {
    rewardedAd = null;
  }
  return rewardedAd;
}

function preload(ad) {
  try {
    const p = ad.load();
    if (p && typeof p.catch === 'function') p.catch(function () {});
  } catch (e) { /* 预加载失败由 show 重试兜底 */ }
}

// promise 化防御：mock / 部分环境可能返回非 promise
function asPromise(p) {
  return (p && typeof p.then === 'function') ? p : Promise.resolve(p === undefined ? undefined : p);
}

// 拉起激励视频；cb(ok, why)，ok=true 表示完整看完（isEnded）。
// why 仅在 ok=false 时可能给出：'daily'（今日次数已达上限）/ 'interval'（距上次展示间隔不足）。
// 返回 false 表示当前处于 DEV 模拟模式，需由页面层自行展示模拟广告页。
function showRewarded(cb) {
  if (AD_DEV) return false;
  // 频次前置校验：超限/间隔不足直接回调失败，不拉起广告（官方频次合规）
  const st = freqState();
  if (!st.canShow) {
    try { cb(false, st.reason); } catch (e) {}
    return true;
  }
  const ad = ensureAd();
  if (!ad) { cb(false); return true; }
  const onShown = function () { recordShown(); }; // 展示成功即计数（无论看完与否）
  let done = false;
  const onFinish = function (res) {
    if (done) return;
    done = true;
    if (ad.offClose) { try { ad.offClose(onFinish); } catch (e) {} }
    cb(!!(res && res.isEnded));
  };
  if (ad.onClose) { try { ad.onClose(onFinish); } catch (e) {} }
  let p = null;
  try { p = ad.show(); } catch (e) { p = Promise.reject(e); } // 同步抛异常也走统一重试链
  const fail = function (err) {
    console.error('激励视频 广告显示失败', err);
    if (done) return;
    done = true;
    if (ad.offClose) { try { ad.offClose(onFinish); } catch (e) {} }
    cb(false);
  };
  asPromise(p).then(onShown).catch(function () {
    // 首次 show 失败：先 load 再重试一次（官方示例流程）；重试成功同样计数
    let lp = null;
    try { lp = ad.load(); } catch (e) { lp = null; }
    asPromise(lp).then(function () { return ad.show(); }).then(onShown).catch(fail);
  });
  return true;
}

// 仅供测试：重置单例与频次状态
function _reset() {
  rewardedAd = null;
  try {
    if (typeof wx !== 'undefined' && wx.removeStorageSync) wx.removeStorageSync(FREQ_KEY);
  } catch (e) {}
}

module.exports = {
  AD_DEV: AD_DEV,
  DAILY_LIMIT: DAILY_LIMIT,
  MIN_INTERVAL_MS: MIN_INTERVAL_MS,
  freqState: freqState,
  recordShown: recordShown,
  isDevtools: isDevtools,
  showRewarded: showRewarded,
  _reset: _reset
};
