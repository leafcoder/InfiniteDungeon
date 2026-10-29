/**
 * 滚动容器（UI 2.0）
 * - 拖拽跟手 + 惯性衰减 + 橡皮筋边界（越界阻力 0.35，松手回弹）
 * - drawBar：滚动条胶囊（滚动时显示，停止 600ms 后淡出）
 */
function ScrollView(opts) {
  this.x = opts.x
  this.y = opts.y
  this.w = opts.w
  this.h = opts.h
  this.horizontal = !!opts.horizontal
  this.offset = 0
  this.velocity = 0
  this.content = 0
  this.dragging = false
  this.lastPos = 0
  this.lastMoveAt = 0
  this.lastScrollAt = 0
  this._barA = 0
}

ScrollView.prototype.setContent = function (c) {
  this.content = Math.max(c, this.axisLen())
  this.clamp()
}

ScrollView.prototype.axisLen = function () {
  return this.horizontal ? this.w : this.h
}

ScrollView.prototype.max = function () {
  return Math.max(0, this.content - this.axisLen())
}

ScrollView.prototype.clamp = function () {
  // 静止时硬钳制（回弹由 update 完成）
  if (!this.dragging && Math.abs(this.velocity) < 0.02) {
    this.offset = Math.max(0, Math.min(this.offset, this.max()))
  }
}

ScrollView.prototype.hit = function (tx, ty) {
  return tx >= this.x && tx <= this.x + this.w && ty >= this.y && ty <= this.y + this.h
}

ScrollView.prototype.touchStart = function (tx, ty) {
  this.dragging = true
  this.velocity = 0
  this.lastPos = this.horizontal ? tx : ty
  this.lastMoveAt = Date.now()
  this.lastScrollAt = this.lastMoveAt
}

ScrollView.prototype.touchMove = function (tx, ty) {
  if (!this.dragging) return
  const p = this.horizontal ? tx : ty
  const now = Date.now()
  const delta = p - this.lastPos
  const dt = Math.max(now - this.lastMoveAt, 1)
  // 橡皮筋：越界方向阻力 0.35
  const next = this.offset - delta
  const beyond = next < 0 ? -next : (next > this.max() ? next - this.max() : 0)
  this.offset = this.offset - delta * (beyond > 0 ? 0.35 : 1)
  this.velocity = delta / dt
  this.lastPos = p
  this.lastMoveAt = now
  this.lastScrollAt = now
}

ScrollView.prototype.touchEnd = function () {
  this.dragging = false
  this.lastScrollAt = Date.now()
}

// 返回 true 表示仍在滚动/回弹（调用方据此标记重绘）
// 注意：dt 由内部按真实帧间隔计算（秒，上限 50ms）。此前外部传入 Date.now()/1000 绝对
// 时间戳，导致惯性 pow(0.0025, dt) 瞬间归零、回弹无过渡——滚动"很不顺畅"的根因。
ScrollView.prototype.update = function () {
  const now = Date.now()
  let dt = (now - (this._lastT || now)) / 1000
  this._lastT = now
  if (!(dt > 0)) dt = 0.016
  if (dt > 0.05) dt = 0.05 // 后台切回等大间隔，防止位移爆炸
  let active = false
  // 回弹：越界时向边界弹簧收敛
  if (!this.dragging) {
    if (this.offset < 0) {
      this.offset += (0 - this.offset) * Math.min(1, dt * 14)
      if (Math.abs(this.offset) < 0.4) this.offset = 0
      active = true
    } else if (this.offset > this.max()) {
      this.offset += (this.max() - this.offset) * Math.min(1, dt * 14)
      if (Math.abs(this.offset - this.max()) < 0.4) this.offset = this.max()
      active = true
    } else if (Math.abs(this.velocity) >= 0.02) {
      this.offset += this.velocity * dt * 1000
      this.velocity *= Math.pow(0.0025, dt)
      active = true
      // 惯性到达边界：清零速度，交给回弹分支
      if (this.offset <= 0 || this.offset >= this.max()) {
        this.clampHard()
        this.velocity = 0
      }
    }
  }
  // 滚动条淡出
  const target = (Date.now() - this.lastScrollAt < 600) ? 1 : 0
  if (Math.abs(this._barA - target) > 0.01) {
    this._barA += (target - this._barA) * Math.min(1, dt * 8)
    active = true
  }
  return active
}

ScrollView.prototype.clampHard = function () {
  this.offset = Math.max(0, Math.min(this.offset, this.max()))
}

// 滚动条胶囊（调用方在内容裁剪 save/restore 之内或之后绘制均可）
ScrollView.prototype.drawBar = function (ctx) {
  if (this.content <= this.axisLen() || this._barA <= 0.02) return
  const a = this._barA
  const track = this.axisLen()
  const thumb = Math.max(28, track * this.axisLen() / this.content)
  const p = this.max() > 0 ? this.offset / this.max() : 0
  ctx.save()
  ctx.globalAlpha = a * 0.6
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  if (this.horizontal) {
    const bx = this.x + p * (this.w - thumb)
    roundRectPath(ctx, bx, this.y + this.h - 5, thumb, 3, 1.5)
  } else {
    const by = this.y + p * (this.h - thumb)
    roundRectPath(ctx, this.x + this.w - 5, by, 3, thumb, 1.5)
  }
  ctx.fill()
  ctx.restore()
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

module.exports = ScrollView
