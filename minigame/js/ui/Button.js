/**
 * Canvas UI 按钮（UI 2.0）
 * 状态矩阵：常态 / 按下（缩放+压暗）/ 禁用（降透明）/ 选中
 * 视觉：渐变底 + 顶部高光线 + 1px 描边 + 柔影；primary 增加呼吸光晕与扫光
 * 场景入场编排：alpha / oy 两个字段可被 fx.to 驱动（默认 1 / 0）
 * 规范沿用：命中热区外扩 8px（88rpx 最小触摸目标近似）
 */
const fx = require('./fx')

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function Button(opts) {
  this.x = opts.x
  this.y = opts.y
  this.w = opts.w
  this.h = opts.h
  this.label = opts.label || ''
  this.sub = opts.sub || ''                 // 副文本（主标签下方）
  this.fontSize = opts.fontSize || 16
  this.fill = opts.fill || '#6FE3D2'
  this.fill2 = opts.fill2 || opts.fill || '#6FE3D2'
  this.textColor = opts.textColor || '#10201C'
  this.lineColor = opts.lineColor || null
  this.onTap = opts.onTap || null
  this.primary = !!opts.primary             // 主按钮：光晕 + 扫光
  this.disabled = !!opts.disabled
  this.glass = !!opts.glass                 // 玻璃态：半透明底 + 细描边
  this.round = !!opts.round                 // 圆形（图标钮）：半径 = min(w,h)/2
  this.iconSize = opts.iconSize || 0        // 图标字号（与主标签分离时可设）
  this.phase = Math.random() * 6.28         // 光晕呼吸错相
  this.pressed = false
  this.pressT = 0                           // 按压深度 0~1（fx 驱动）
  this.alpha = 1                            // 入场编排钩子
  this.oy = 0
}

Button.prototype.hit = function (tx, ty) {
  const pad = 8
  return tx >= this.x - pad && tx <= this.x + this.w + pad &&
         ty >= this.y + this.oy - pad && ty <= this.y + this.oy + this.h + pad
}

Button.prototype.touch = function (tx, ty, down) {
  const inside = this.hit(tx, ty)
  if (down) {
    if (inside && !this.disabled) {
      if (!this.pressed) fx.to(this, { pressT: 1 }, 70, { ease: 'easeOutCubic' })
      this.pressed = true
    }
  } else {
    if (this.pressed && inside && !this.disabled && this.onTap) this.onTap()
    if (this.pressed) fx.to(this, { pressT: 0 }, 170, { ease: 'easeOutBack' })
    this.pressed = false
  }
  return inside
}

Button.prototype.draw = function (ctx) {
  if (this.alpha <= 0.01) return
  const cx = this.x + this.w / 2
  const cy = this.y + this.oy + this.h / 2
  const s = 1 - 0.05 * this.pressT
  ctx.save()
  ctx.globalAlpha = this.alpha * (this.disabled ? 0.45 : 1)
  ctx.translate(cx, cy)
  ctx.scale(s, s)
  ctx.translate(-cx, -cy)

  const bx = this.x
  const by = this.y + this.oy
  const r = this.round ? Math.min(this.w, this.h) / 2 : Math.min(this.h / 2, 14 + this.h * 0.08)

  // 柔影（primary 更深）
  ctx.shadowColor = this.primary ? this.fill : 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = this.primary ? 10 + 6 * fx.pulse(900, this.phase) : 6
  ctx.shadowOffsetY = 2 + 2 * this.pressT

  // 底
  const g = ctx.createLinearGradient(bx, by, bx, by + this.h)
  const dark = 1 - 0.18 * this.pressT
  g.addColorStop(0, this.fill)
  g.addColorStop(1, this.fill2)
  roundRect(ctx, bx, by, this.w, this.h, r)
  ctx.fillStyle = g
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0

  // 顶部内高光（玻璃质感）
  roundRect(ctx, bx + 2, by + 1.5, this.w - 4, this.h * 0.42, r - 2)
  const hl = ctx.createLinearGradient(0, by, 0, by + this.h * 0.45)
  hl.addColorStop(0, 'rgba(255,255,255,' + (this.glass ? 0.10 : 0.22) + ')')
  hl.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = hl
  ctx.fill()

  // 描边
  if (!this.glass || this.lineColor) {
    roundRect(ctx, bx, by, this.w, this.h, r)
    ctx.lineWidth = 1
    ctx.strokeStyle = this.lineColor || 'rgba(255,255,255,0.22)'
    ctx.stroke()
  }

  // primary 扫光（斜向高光带循环掠过）
  if (this.primary) {
    ctx.save()
    roundRect(ctx, bx, by, this.w, this.h, r)
    ctx.clip()
    const sw = (fx.now / 1600 + this.phase / 6.28) % 1
    const sx = bx - this.w * 0.3 + sw * this.w * 1.6
    const sg = ctx.createLinearGradient(sx - this.w * 0.25, by, sx + this.w * 0.25, by + this.h)
    sg.addColorStop(0, 'rgba(255,255,255,0)')
    sg.addColorStop(0.5, 'rgba(255,255,255,0.30)')
    sg.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = sg
    ctx.fillRect(bx, by, this.w, this.h)
    ctx.restore()
  }

  // 文本
  ctx.textAlign = 'center'
  const hasSub = !!this.sub
  ctx.fillStyle = this.textColor
  ctx.font = 'bold ' + Math.round(this.fontSize) + 'px sans-serif'
  ctx.fillText(this.label, cx, hasSub ? by + this.h * 0.42 : cy + 1)
  if (hasSub) {
    ctx.globalAlpha = this.alpha * 0.75
    ctx.font = Math.round(Math.max(10, this.fontSize * 0.62)) + 'px sans-serif'
    ctx.fillText(this.sub, cx, by + this.h * 0.74)
    ctx.globalAlpha = this.alpha * (this.disabled ? 0.45 : 1)
  }
  ctx.restore()
}

module.exports = { Button: Button, roundRect: roundRect }
