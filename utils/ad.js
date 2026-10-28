// ============ 广告整合服务（v2） ============
// 激励视频点位规划（新增场景在此登记）：
//   1. 解锁关卡   —— 关卡页点击锁定关，看完广告立即解锁（pages/index 解锁面板）
//   2. 每日双倍   —— 每日挑战结算时光尘翻倍（预留）
//   3. Boss 复活  —— Boss 关失败后看广告获得短暂护盾复活（预留）
//
// 开发说明：
//   - AD_UNIT_ID 为空时进入 DEV 模拟模式（AD_DEV=true）：由页面层展示
//     全屏模拟广告页（倒计时），流程与真机一致——看完回调成功、提前关闭回调失败。
//   - 上线前在小程序后台「流量主 → 广告位管理」创建激励视频广告位，
//     把 ID 填入 AD_UNIT_ID 即自动切换为真实广告，页面层无需改动。

const AD_UNIT_ID = '';

let rewardedAd = null;
let adError = false;

// 是否处于开发模拟模式
const AD_DEV = !AD_UNIT_ID;

function ensureAd() {
  if (rewardedAd || adError) return rewardedAd;
  if (AD_DEV) return null;
  if (typeof wx === 'undefined' || !wx.createRewardedVideoAd) return null;
  try {
    rewardedAd = wx.createRewardedVideoAd({ adUnitId: AD_UNIT_ID });
    rewardedAd.onError(function () { adError = true; });
  } catch (e) {
    adError = true;
    rewardedAd = null;
  }
  return rewardedAd;
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
    ad.offClose(onFinish);
    cb(!!(res && res.isEnded));
  };
  ad.onClose(onFinish);
  ad.show().catch(function () {
    // 首次 show 失败时先 load 再重试一次
    ad.load().then(function () { return ad.show(); }).catch(function () {
      if (done) return;
      done = true;
      ad.offClose(onFinish);
      cb(false);
    });
  });
  return true;
}

module.exports = {
  AD_DEV: AD_DEV,
  showRewarded: showRewarded
};
