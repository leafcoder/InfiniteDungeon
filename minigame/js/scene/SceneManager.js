/**
 * 场景管理器（UI 2.0）
 * - 状态机切换 + 黑场转场：out 160ms 压黑 → 真正切换 → in 240ms 揭开
 * - main.js 需调用 sm.update(dt) 与 sm.drawOverlay(ctx)；转场期间触摸由 route 屏蔽
 */
const fx = require('../ui/fx')

function SceneManager(W, H) {
  this.W = W
  this.H = H
  this.scenes = {}
  this.current = null
  this.currentName = ''
  this.trans = null   // {name, params, phase:'out'|'in', t, durOut, durIn}
}

SceneManager.prototype.register = function (name, scene) {
  this.scenes[name] = scene
  scene.sm = this
}

SceneManager.prototype.switch = function (name, params) {
  const next = this.scenes[name]
  if (!next) return
  // 首次进入或重入同场景：无转场直接切
  if (!this.current || this.current === next) {
    if (this.current && this.current.exit) this.current.exit()
    this.current = next
    this.currentName = name
    if (next.enter) next.enter(params || {})
    return
  }
  if (this.trans) return
  this.trans = { name: name, params: params || {}, phase: 'out', t: 0, durOut: 0.16, durIn: 0.24 }
}

SceneManager.prototype._doSwitch = function () {
  const tr = this.trans
  const next = this.scenes[tr.name]
  if (!next) { this.trans = null; return }
  if (this.current && this.current.exit) this.current.exit()
  this.current = next
  this.currentName = tr.name
  if (next.enter) next.enter(tr.params)
}

SceneManager.prototype.update = function (dt) {
  if (!this.trans) return
  const tr = this.trans
  tr.t += dt
  if (tr.phase === 'out' && tr.t >= tr.durOut) {
    this._doSwitch()
    tr.phase = 'in'
    tr.t = 0
  } else if (tr.phase === 'in' && tr.t >= tr.durIn) {
    this.trans = null
  }
}

SceneManager.prototype.drawOverlay = function (ctx) {
  if (!this.trans) return
  const tr = this.trans
  let a
  if (tr.phase === 'out') a = fx.E.easeInOutQuad(tr.t / tr.durOut)
  else a = 1 - fx.E.easeOutCubic(tr.t / tr.durIn)
  ctx.fillStyle = 'rgba(4,4,14,' + Math.max(0, Math.min(1, a)) + ')'
  ctx.fillRect(0, 0, this.W, this.H)
}

// 在当前场景上叠放弹窗（同屏单弹窗）
SceneManager.prototype.sceneModal = function (modal) {
  if (this.current) this.current.modal = modal
}

// 全局 Toast（交由当前场景显示）
SceneManager.prototype.toast = function (msg) {
  if (this.current && this.current.showToast) this.current.showToast(msg)
}

module.exports = SceneManager
