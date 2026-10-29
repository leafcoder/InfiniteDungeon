/**
 * DEV 模拟广告页（无广告位时的激励视频替代，流程与真机一致）
 * 用法：scene.adSim = new AdSim(sm, cb, label)
 *   - scene.update() 里：if (this.adSim && this.adSim.update()) this.adSim = null
 *   - scene.draw() 顶层：if (this.adSim) { this.adSim.draw(ctx); return }
 *   - 倒计时走完 → cb(true)（视为完整观看）；scene 需吞掉 adSim 期间的触摸
 * 上线前在「流量主 → 广告位管理」创建激励视频广告位并填入 core/ad.js 的
 * AD_UNIT_ID，即自动切换为真实广告，页面层无需改动。
 */
function AdSim(sm, cb, label) {
  this.sm = sm
  this.end = Date.now() + 3000
  this.cb = cb
  this.label = label || '奖励发放中…'
}

// 返回 true 表示已看完并回调结束（场景应置 adSim = null）
AdSim.prototype.update = function () {
  if (Date.now() < this.end) return false
  const cb = this.cb
  this.cb = null
  if (cb) cb(true)
  return true
}

AdSim.prototype.draw = function (ctx) {
  const u = this.sm.W / 375
  const W = this.sm.W
  const H = this.sm.H
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.96)'
  ctx.fillRect(0, 0, W, H)
  const left = Math.ceil((this.end - Date.now()) / 1000)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#FFC15E'
  ctx.font = 'bold ' + Math.round(24 * u) + 'px sans-serif'
  ctx.fillText('模拟广告', W / 2, H * 0.4)
  ctx.fillStyle = 'rgba(243,241,255,0.8)'
  ctx.font = Math.round(14 * u) + 'px sans-serif'
  ctx.fillText(left + 's 后' + this.label, W / 2, H * 0.48)
  ctx.restore()
}

module.exports = AdSim
