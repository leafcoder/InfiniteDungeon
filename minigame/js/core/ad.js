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

// 拉起激励视频；cb(ok)，ok=true 表示完整看完（isEnded）。
// 返回 false 表示当前处于 DEV 模拟模式，需由页面层自行展示模拟广告页。
function showRewarded(cb) {
  if (AD_DEV) return false;
  const ad = ensureAd();
  if (!ad) { cb(false); return true; }
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
  asPromise(p).catch(function () {
    // 首次 show 失败：先 load 再重试一次（官方示例流程）
    let lp = null;
    try { lp = ad.load(); } catch (e) { lp = null; }
    asPromise(lp).then(function () { return ad.show(); }).catch(fail);
  });
  return true;
}

// 仅供测试：重置单例
function _reset() { rewardedAd = null; }

module.exports = {
  AD_DEV: AD_DEV,
  isDevtools: isDevtools,
  showRewarded: showRewarded,
  _reset: _reset
};
