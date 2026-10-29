/**
 * 氛围背景层（UI 2.0）
 * 三层结构：主题渐变底 → 深景光斑（大半径低透明，缓慢漂移）→ 前景粒子（主题化）
 * 六套皮肤各自氛围：
 * - classic  经典：青紫浮尘，横向缓漂 + 呼吸闪烁
 * - glow     夜光：萤火虫，上升 + 正弦游移，绿青双色
 * - festival 节日：余烬上升，橙金红，速度更快
 * - cosmos   星穹：繁星闪烁 + 偶发流星拖尾
 * - abyss    深渊：气泡上升，青蓝双色，深海底色
 * - sakura   樱粉：花瓣飘落，柔粉白，缓速横摆
 * 用法：scene.enter 里 new Background()；draw 开头 bg.draw(ctx, W, H, v, dt, dim)
 */
const theme = require('../core/theme')

function rand(a, b) { return a + Math.random() * (b - a) }

function Background() {
  this.themeKey = ''
  this.t = 0
  this.orbs = []
  this.motes = []
  this.meteor = null          // cosmos 专属 {x,y,vx,vy,life}
  this.meteorAt = 0
}

Background.prototype.regenerate = function (key) {
  this.themeKey = key
  this.orbs = []
  this.motes = []
  for (let i = 0; i < 5; i++) {
    this.orbs.push({ x: Math.random(), y: Math.random(), r: rand(0.16, 0.3), dx: rand(-0.008, 0.008), dy: rand(-0.006, 0.006), ph: rand(0, 6.28) })
  }
  for (let i = 0; i < 42; i++) {
    this.motes.push({
      x: Math.random(), y: Math.random(),
      r: rand(0.8, 2.3), vx: rand(-1, 1), vy: rand(-1, 1),
      ph: rand(0, 6.28), tw: rand(0.5, 1)
    })
  }
  this.meteor = null
  this.meteorAt = this.t + rand(2, 5)
}

Background.prototype.draw = function (ctx, W, H, v, dt, dim) {
  if (!v || !v['--bg-1']) return
  const key = v['--bg-1'] + v['--accent']   // 主题切换即重建（皮肤变量指纹）
  if (key !== this._fp) { this._fp = key; this.regenerate(v['--accent']) }
  this.t += dt || 0
  const style = this.styleOf(v)

  // 1) 三段渐变底
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, v['--bg-1'])
  bg.addColorStop(0.55, v['--bg-2'])
  bg.addColorStop(1, v['--bg-3'])
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  ctx.save()
  if (dim) ctx.globalAlpha = 1 - dim * 0.6

  // 2) 深景光斑（视差呼吸）
  for (let i = 0; i < this.orbs.length; i++) {
    const o = this.orbs[i]
    o.x += o.dx * (dt || 0)
    o.y += o.dy * (dt || 0)
    if (o.x < -0.2) o.x = 1.2; if (o.x > 1.2) o.x = -0.2
    if (o.y < -0.2) o.y = 1.2; if (o.y > 1.2) o.y = -0.2
    const breathe = 0.75 + 0.25 * Math.sin(this.t * 0.5 + o.ph)
    const rr = o.r * Math.max(W, H) * breathe
    const g = ctx.createRadialGradient(o.x * W, o.y * H, 0, o.x * W, o.y * H, rr)
    const c = i % 2 === 0 ? style.orbA : style.orbB
    g.addColorStop(0, c)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(o.x * W - rr, o.y * H - rr, rr * 2, rr * 2)
  }

  // 3) 前景粒子（主题行为）
  for (let i = 0; i < this.motes.length; i++) {
    const m = this.motes[i]
    style.move(m, dt || 0, this.t)
    // 环绕包裹
    if (m.x < -0.05) m.x = 1.05; if (m.x > 1.05) m.x = -0.05
    if (m.y < -0.05) m.y = 1.05; if (m.y > 1.05) m.y = -0.05
    const a = (0.25 + 0.75 * Math.max(0, Math.sin(this.t * m.tw + m.ph))) * style.moteA
    ctx.globalAlpha = (dim ? (1 - dim * 0.6) : 1) * a
    ctx.fillStyle = style.moteC(i, m)
    ctx.beginPath()
    ctx.arc(m.x * W, m.y * H, m.r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = dim ? 1 - dim * 0.6 : 1

  // 4) cosmos 流星
  if (style.meteor && !dim) {
    if (!this.meteor && this.t > this.meteorAt) {
      this.meteor = { x: rand(0.15, 0.9), y: rand(-0.05, 0.25), vx: rand(-0.5, -0.3), vy: rand(0.25, 0.4), life: 1 }
    }
    if (this.meteor) {
      const mt = this.meteor
      mt.x += mt.vx * (dt || 0)
      mt.y += mt.vy * (dt || 0)
      mt.life -= (dt || 0) * 0.9
      if (mt.life <= 0) {
        this.meteor = null
        this.meteorAt = this.t + rand(4, 9)
      } else {
        const tx = mt.x * W, ty = mt.y * H
        const tl = Math.max(W, H) * 0.16
        const g = ctx.createLinearGradient(tx, ty, tx - mt.vx * tl * 2, ty - mt.vy * tl * 2)
        g.addColorStop(0, 'rgba(255,255,255,' + (0.85 * mt.life) + ')')
        g.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.strokeStyle = g
        ctx.lineWidth = 2
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(tx, ty)
        ctx.lineTo(tx - mt.vx * tl * 2, ty - mt.vy * tl * 2)
        ctx.stroke()
      }
    }
  }
  ctx.restore()

  // 5) 顶部/底部压暗（HUD 与快捷区可读性）
  const dk = ctx.createLinearGradient(0, 0, 0, H)
  dk.addColorStop(0, 'rgba(0,0,0,' + (dim ? 0.12 : 0.28) + ')')
  dk.addColorStop(0.2, 'rgba(0,0,0,0)')
  dk.addColorStop(0.8, 'rgba(0,0,0,0)')
  dk.addColorStop(1, 'rgba(0,0,0,' + (dim ? 0.14 : 0.3) + ')')
  ctx.fillStyle = dk
  ctx.fillRect(0, 0, W, H)
}

Background.prototype.styleOf = function (v) {
  const acc = v['--accent'] || '#6FE3D2'
  const acc2 = v['--accent-2'] || '#9B8CFF'
  const key = (v['--bg-1'] || '') + acc
  if (key.indexOf('#02100C') === 0) {
    // 夜光：萤火虫上升
    return {
      orbA: 'rgba(57,255,158,0.05)', orbB: 'rgba(34,224,255,0.05)', moteA: 0.55,
      moteC: function (i) { return i % 3 === 0 ? acc2 : acc },
      move: function (m, dt, t) {
        m.y -= 0.012 * dt * (0.6 + m.tw)
        m.x += Math.sin(t * 0.8 + m.ph) * 0.014 * dt
      }
    }
  }
  if (key.indexOf('#3A0D2B') === 0) {
    // 节日：余烬上升
    return {
      orbA: 'rgba(255,138,61,0.06)', orbB: 'rgba(255,210,63,0.05)', moteA: 0.6,
      moteC: function (i) { return i % 3 === 0 ? '#FFE066' : (i % 3 === 1 ? '#FF8A3D' : '#FFD23F') },
      move: function (m, dt, t) {
        m.y -= 0.03 * dt * (0.5 + m.tw)
        m.x += Math.sin(t * 1.2 + m.ph) * 0.02 * dt
      }
    }
  }
  if (key.indexOf('#0A0A2E') === 0) {
    // 星穹：繁星 + 流星
    return {
      orbA: 'rgba(143,184,255,0.05)', orbB: 'rgba(199,155,255,0.05)', moteA: 0.7,
      moteC: function (i) { return i % 4 === 0 ? '#FFFFFF' : acc },
      meteor: true,
      move: function (m, dt) { m.y += 0.003 * dt; m.x += 0.002 * dt }
    }
  }
  if (key.indexOf('#021A2E') === 0) {
    // 深渊：气泡上升
    return {
      orbA: 'rgba(64,224,255,0.05)', orbB: 'rgba(40,255,210,0.05)', moteA: 0.6,
      moteC: function (i) { return i % 3 === 0 ? '#7DF9FF' : (i % 3 === 1 ? '#40E0FF' : '#5EE6D8') },
      move: function (m, dt, t) {
        m.y -= 0.022 * dt * (0.6 + m.tw)
        m.x += Math.sin(t * 0.7 + m.ph) * 0.016 * dt
      }
    }
  }
  if (key.indexOf('#2C1238') === 0) {
    // 樱粉：花瓣飘落
    return {
      orbA: 'rgba(255,180,210,0.05)', orbB: 'rgba(255,210,235,0.05)', moteA: 0.6,
      moteC: function (i) { return i % 3 === 0 ? '#FFD0E4' : (i % 3 === 1 ? '#FFB4D2' : '#FFF0F6') },
      move: function (m, dt, t) {
        m.y += 0.016 * dt * (0.5 + m.tw)
        m.x += Math.sin(t * 0.9 + m.ph) * 0.02 * dt
      }
    }
  }
  // 经典：浮尘横漂
  return {
    orbA: 'rgba(155,140,255,0.05)', orbB: 'rgba(111,227,210,0.04)', moteA: 0.45,
    moteC: function (i) { return i % 3 === 0 ? acc2 : acc },
    move: function (m, dt, t) {
      m.x += 0.008 * dt * (0.4 + m.tw)
      m.y += Math.sin(t * 0.6 + m.ph) * 0.006 * dt
    }
  }
}

module.exports = Background
