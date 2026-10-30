/**
 * Canvas 弹窗组件（UI 2.0）
 * - 入场编排：遮罩线性淡入 200ms + 面板 easeOutBack 弹出 300ms（scale 0.86→1）
 * - 面板：实底渐变 + 顶部渐变装饰线 + 四角柔光 + 标题光晕
 * - 规范沿用小程序版 .panel：弹窗背后是实时迷宫，必须实底防"染穿"
 * 用法不变：new Modal(sm, {title, lines, buttons, onClose})
 */
const storage = require('../core/storage')
const theme = require('../core/theme')
const fx = require('./fx')
const ScrollView = require('./ScrollView')
const { Button, roundRect } = require('./Button')
const { drawIcon, drawHeroChip, hexA } = require('./Icons')

function Modal(sm, opts) {
  this.sm = sm
  this.u = sm.W / 375
  this.title = opts.title || ''
  this.lines = opts.lines || []
  this.rows = opts.rows || []   // 可点按行：{header} 或 {icon,title,sub,tag,tagColor,dim,onTap}
  this.onClose = opts.onClose || null
  this.w = Math.min(320 * this.u, sm.W - 32 * this.u)
  this.h = Math.min(470 * this.u, sm.H - 80 * this.u)
  this.x = (sm.W - this.w) / 2
  this.y = (sm.H - this.h) / 2
  // 入场编排
  this.t = 0    // 面板弹出（easeOutBack）
  this.mt = 0   // 遮罩淡入（linear）
  fx.to(this, { t: 1 }, 300, { ease: 'easeOutBack' })
  fx.to(this, { mt: 1 }, 200, { ease: 'linear' })

  const u = this.u
  const pad = 16 * u
  const headH = 52 * u
  const btnH = (opts.buttons && opts.buttons.length) ? 52 * u : 10 * u
  this.bodyRect = { x: this.x + pad, y: this.y + headH, w: this.w - pad * 2, h: this.h - headH - btnH - 14 * u }
  this.sc = new ScrollView({ x: this.bodyRect.x, y: this.bodyRect.y, w: this.bodyRect.w, h: this.bodyRect.h })
  this.sc.setContent(this.measureBody())
  const self = this
  const btns = opts.buttons || [{ label: '关闭', primary: false }]
  const bw = (this.w - pad * 2 - (btns.length - 1) * 10 * u) / btns.length
  this.btns = btns.map(function (b, i) {
    return new Button({
      x: self.x + pad + i * (bw + 10 * u),
      y: self.y + self.h - 56 * u,
      w: bw, h: 44 * u,
      label: b.label,
      fontSize: Math.round(14 * u),
      fill: b.primary ? '#FFC15E' : 'rgba(255,255,255,0.14)',
      fill2: b.primary ? '#FF9F6E' : 'rgba(255,255,255,0.08)',
      textColor: b.primary ? '#3A2A08' : '#F3F1FF',
      primary: !!b.primary,
      onTap: function () {
        if (b.onTap) b.onTap(self)
        else self.close()
      }
    })
  })
  this.dirty = true
}

Modal.prototype.measureBody = function () {
  const u = this.u
  const lh = 20 * u
  let total = 0
  const charW = 7 * u
  const maxChars = Math.max(8, Math.floor(this.bodyRect.w / charW))
  for (let i = 0; i < this.lines.length; i++) {
    const ln = typeof this.lines[i] === 'string' ? { t: this.lines[i] } : this.lines[i]
    const n = Math.max(1, Math.ceil((ln.t || '').length / maxChars))
    total += n * lh + (ln.gap ? 8 * u : 0)
  }
  // 行区域：标题头 26u / 条目卡 58u + 间距
  for (let i = 0; i < this.rows.length; i++) {
    const r = this.rows[i]
    total += r.header ? (30 * u) : (58 * u + 8 * u)
  }
  return total + 14 * u
}

// 行布局：绘制/命中共用。返回 [{rect, row}]
Modal.prototype.layoutRows = function (startY) {
  const u = this.u
  const b = this.bodyRect
  const out = []
  let yy = startY
  for (let i = 0; i < this.rows.length; i++) {
    const r = this.rows[i]
    if (r.header) {
      out.push({ header: true, row: r, rect: { x: b.x, y: yy, w: b.w, h: 24 * u } })
      yy += 30 * u
    } else {
      out.push({ row: r, rect: { x: b.x, y: yy, w: b.w, h: 58 * u } })
      yy += 58 * u + 8 * u
    }
  }
  return out
}

Modal.prototype.close = function () {
  if (this.onClose) this.onClose()
}

/* ---------- 触摸（由场景转发） ---------- */

Modal.prototype.onTouchStart = function (tx, ty) {
  this.dirty = true
  this._down = { x: tx, y: ty, t: Date.now() }
  this._rowDown = this._hitRow(tx, ty)
  for (let i = 0; i < this.btns.length; i++) this.btns[i].touch(tx, ty, true)
  if (this.sc.hit(tx, ty)) this.sc.touchStart(tx, ty)
}

// 命中可点按行（考虑滚动偏移）
Modal.prototype._hitRow = function (tx, ty) {
  const b = this.bodyRect
  if (tx < b.x || tx > b.x + b.w || ty < b.y || ty > b.y + b.h) return -1
  const u = this.u
  const charW = 7 * u
  const maxChars = Math.max(8, Math.floor(b.w / charW))
  let yy = b.y + 8 * u - this.sc.offset
  for (let i = 0; i < this.lines.length; i++) {
    const ln = typeof this.lines[i] === 'string' ? { t: this.lines[i] } : this.lines[i]
    const n = Math.max(1, Math.ceil((ln.t || '').length / maxChars))
    yy += n * (20 * u) + (ln.gap ? 8 * u : 0)
  }
  const laid = this.layoutRows(yy + 6 * u)
  for (let i = 0; i < laid.length; i++) {
    const it = laid[i]
    if (it.header) continue
    const r = it.rect
    if (ty >= r.y - 2 && ty <= r.y + r.h + 2) return i
  }
  return -1
}

Modal.prototype.onTouchMove = function (tx, ty) {
  if (this.sc.dragging) {
    this.sc.touchMove(tx, ty)
    this.dirty = true
  }
}

Modal.prototype.onTouchEnd = function (tx, ty) {
  this.dirty = true
  for (let i = 0; i < this.btns.length; i++) this.btns[i].touch(tx, ty, false)
  if (this.sc.dragging) this.sc.touchEnd()
  // 行点按：按下与松起在同一行才触发（防滚动误触）
  const down = this._rowDown
  this._rowDown = -1
  if (down >= 0 && this._hitRow(tx, ty) === down && this._isTap(tx, ty)) {
    const row = this.rows[down]
    if (row && row.onTap) row.onTap(this)
  }
  this._down = null
}

Modal.prototype._isTap = function (tx, ty) {
  if (!this._down) return false
  const dx = tx - this._down.x
  const dy = ty - this._down.y
  return Math.sqrt(dx * dx + dy * dy) < 10 && Date.now() - this._down.t < 400
}

Modal.prototype.update = function () {
  if (this.sc.update()) this.dirty = true
}

// 就地刷新：更新标题/正文/行卡并重测内容高度，保留滚动位置、不重播入场动画。
// 用于开关切换、购买后状态更新——此前整弹重建（sm.sceneModal(build())）会重新播放入场
// 动画并清空滚动位置，表现为"点一下闪一下"。
Modal.prototype.refresh = function (opts) {
  if (!opts) return this
  if (opts.title !== undefined) this.title = opts.title
  if (opts.lines) this.lines = opts.lines
  if (opts.rows) this.rows = opts.rows
  this.sc.setContent(this.measureBody())
  this.sc.clampHard()
  this.dirty = true
  return this
}

/* ---------- 绘制 ---------- */

Modal.prototype.draw = function (ctx) {
  const u = this.u
  const v = theme.getTheme(storage.getTheme()).vars
  const W = this.sm.W
  ctx.save()
  // 遮罩（随 mt 淡入 + 轻微压暗模糊感）
  ctx.fillStyle = 'rgba(5,6,20,' + (0.74 * this.mt) + ')'
  ctx.fillRect(0, 0, W, this.sm.H)

  // 面板弹出（围绕中心缩放）
  const cx = this.x + this.w / 2
  const cy = this.y + this.h / 2
  const s = 0.86 + 0.14 * this.t
  ctx.translate(cx, cy)
  ctx.scale(s, s)
  ctx.translate(-cx, -cy)
  ctx.globalAlpha = Math.min(1, this.mt * 1.4)

  // 四角柔光
  const glow = ctx.createRadialGradient(cx, this.y, 0, cx, this.y, this.w * 0.9)
  glow.addColorStop(0, 'rgba(255,193,94,0.12)')
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow
  ctx.fillRect(this.x - 30, this.y - 30, this.w + 60, this.h * 0.5)

  // 实底面板
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = 24
  ctx.shadowOffsetY = 8
  roundRect(ctx, this.x, this.y, this.w, this.h, 18 * u)
  const g = ctx.createLinearGradient(0, this.y, 0, this.y + this.h)
  g.addColorStop(0, v['--panel'] || '#241E4A')
  g.addColorStop(1, v['--panel-2'] || '#1B1738')
  ctx.fillStyle = g
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  ctx.lineWidth = 1
  ctx.strokeStyle = v['--panel-line'] || 'rgba(255,255,255,0.18)'
  ctx.stroke()

  // 顶部装饰渐变线
  const line = ctx.createLinearGradient(this.x, 0, this.x + this.w, 0)
  line.addColorStop(0, 'rgba(255,193,94,0)')
  line.addColorStop(0.5, '#FFC15E')
  line.addColorStop(1, 'rgba(255,193,94,0)')
  roundRect(ctx, this.x + 24 * u, this.y - 1.5, this.w - 48 * u, 3, 1.5)
  ctx.fillStyle = line
  ctx.fill()

  // 标题（微光晕）
  ctx.textAlign = 'center'
  ctx.save()
  ctx.shadowColor = 'rgba(255,193,94,0.55)'
  ctx.shadowBlur = 8
  ctx.fillStyle = v['--warn'] || '#FFC15E'
  ctx.font = 'bold ' + Math.round(18 * u) + 'px sans-serif'
  ctx.fillText(this.title, W / 2, this.y + 30 * u)
  ctx.restore()

  // 正文（滚动裁剪）
  const b = this.bodyRect
  ctx.save()
  roundRect(ctx, b.x, b.y, b.w, b.h, 10 * u)
  ctx.clip()
  const lh = 20 * u
  const charW = 7 * u
  const maxChars = Math.max(8, Math.floor(b.w / charW))
  let yy = b.y + 8 * u - this.sc.offset
  ctx.textAlign = 'left'
  for (let i = 0; i < this.lines.length; i++) {
    const ln = typeof this.lines[i] === 'string' ? { t: this.lines[i] } : this.lines[i]
    if (!ln.t) { yy += lh / 2; continue }
    ctx.font = (ln.b ? 'bold ' : '') + Math.round((ln.s || 13) * u) + 'px sans-serif'
    ctx.fillStyle = ln.c || v['--text'] || '#F3F1FF'
    let t = ln.t
    const centerX = ln.ac === 'center' ? b.x + b.w / 2 : b.x + 8 * u
    if (ln.ac === 'center') ctx.textAlign = 'center'
    while (t.length > maxChars) {
      ctx.fillText(t.slice(0, maxChars), centerX, yy)
      t = t.slice(maxChars)
      yy += lh
      if (yy > b.y + b.h + lh) break
    }
    if (yy <= b.y + b.h + lh) ctx.fillText(t, centerX, yy)
    if (ln.ac === 'center') ctx.textAlign = 'left'
    yy += lh + (ln.gap ? 8 * u : 0)
    if (yy > b.y + b.h + lh * 2) break
  }
  // 可点按行（卡片列表，随滚动）
  if (this.rows.length) {
    const laid = this.layoutRows(yy + 6 * u)
    this._rowRects = laid
    for (let i = 0; i < laid.length; i++) {
      const it = laid[i]
      const r = it.rect
      if (r.y + r.h < b.y - 4 || r.y > b.y + b.h + 4) continue
      const row = it.row
      if (it.header) {
        // 分组头：居中文字 + 两侧渐变细线（取代旧版"—— X ——"字符破折号，无设计感）
        const hy = r.y + r.h / 2
        ctx.textBaseline = 'middle'
        ctx.textAlign = 'center'
        ctx.font = 'bold ' + Math.round(11 * u) + 'px sans-serif'
        ctx.fillStyle = '#9B8CFF'
        const label = row.header
        ctx.fillText(label, b.x + b.w / 2, hy)
        const tw = ctx.measureText(label).width
        const gapH = 10 * u
        const segW = (b.w - tw) / 2 - gapH
        if (segW > 6) {
          const yLine = Math.round(hy) + 0.5
          const lx1 = b.x + b.w / 2 - tw / 2 - gapH
          const lx0 = lx1 - segW
          let lg = ctx.createLinearGradient(lx0, 0, lx1, 0)
          lg.addColorStop(0, 'rgba(155,140,255,0)')
          lg.addColorStop(1, 'rgba(155,140,255,0.55)')
          ctx.fillStyle = lg
          ctx.fillRect(lx0, yLine, segW, 1)
          const rx0 = b.x + b.w / 2 + tw / 2 + gapH
          const rx1 = rx0 + segW
          lg = ctx.createLinearGradient(rx0, 0, rx1, 0)
          lg.addColorStop(0, 'rgba(155,140,255,0.55)')
          lg.addColorStop(1, 'rgba(155,140,255,0)')
          ctx.fillStyle = lg
          ctx.fillRect(rx0, yLine, segW, 1)
        }
        ctx.textBaseline = 'alphabetic'
        ctx.textAlign = 'left'
        continue
      }
      ctx.save()
      if (row.dim) ctx.globalAlpha = 0.55
      roundRect(ctx, r.x, r.y, r.w, r.h, 12 * u)
      ctx.fillStyle = 'rgba(255,255,255,0.06)'
      ctx.fill()
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(255,255,255,0.10)'
      ctx.stroke()
      // 图标：ick 矢量图标瓦片（清晰、机型一致）优先；hero 调色板 → 英雄小人 chip；
      // emoji 兜底
      let tx0 = r.x + (row.icon ? 48 * u : 14 * u)
      if (row.hero) {
        // 英雄小人 chip：调色板驱动的迷你 chibi，一眼对应游戏内角色
        const isz = 34 * u
        const ix = r.x + 10 * u
        const iy = r.y + (r.h - isz) / 2
        const col = row.icCol || '#FFC15E'
        roundRect(ctx, ix, iy, isz, isz, 10 * u)
        ctx.fillStyle = hexA(col, 0.13)
        ctx.fill()
        ctx.lineWidth = 1
        ctx.strokeStyle = hexA(col, 0.3)
        ctx.stroke()
        drawHeroChip(ctx, row.hero, ix + isz / 2, iy + isz / 2 + 1 * u, isz * 0.38)
        tx0 = ix + isz + 10 * u
      } else if (row.ick) {
        const isz = 34 * u
        const ix = r.x + 10 * u
        const iy = r.y + (r.h - isz) / 2
        const icol = row.icCol || '#FFC15E'
        roundRect(ctx, ix, iy, isz, isz, 10 * u)
        ctx.fillStyle = hexA(icol, 0.13)
        ctx.fill()
        ctx.lineWidth = 1
        ctx.strokeStyle = hexA(icol, 0.3)
        ctx.stroke()
        drawIcon(ctx, row.ick, ix + isz / 2, iy + isz / 2 + 0.5 * u, isz * 0.4, icol)
        tx0 = ix + isz + 10 * u
      } else if (row.icon) {
        ctx.textAlign = 'center'
        ctx.font = Math.round(20 * u) + 'px sans-serif'
        ctx.fillText(row.icon, r.x + 26 * u, r.y + r.h / 2)
      }
      ctx.textAlign = 'left'
      ctx.font = 'bold ' + Math.round(13 * u) + 'px sans-serif'
      ctx.fillStyle = v['--text'] || '#F3F1FF'
      ctx.fillText(row.title || '', tx0, r.y + 20 * u)
      if (row.sub) {
        ctx.font = Math.round(10.5 * u) + 'px sans-serif'
        ctx.fillStyle = v['--text-sub'] || 'rgba(243,241,255,0.7)'
        ctx.fillText(row.sub, tx0, r.y + 40 * u)
      }
      // 右侧状态/价格
      if (row.tag) {
        ctx.textAlign = 'right'
        ctx.font = 'bold ' + Math.round(12.5 * u) + 'px sans-serif'
        ctx.fillStyle = row.tagColor || '#FFD86E'
        ctx.fillText(row.tag, r.x + r.w - 14 * u, r.y + r.h / 2)
      }
      ctx.restore()
    }
  }
  ctx.restore()
  // 滚动条（超出才显示）
  this.sc.drawBar(ctx)

  // 按钮
  for (let i = 0; i < this.btns.length; i++) this.btns[i].draw(ctx)
  ctx.restore()
}

module.exports = Modal
