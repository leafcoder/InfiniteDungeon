/**
 * 动效引擎 fx（UI 2.0 核心）
 * - 全局补间（Tween）：fx.to(obj, props, dur, opts) —— 帧驱动、可覆盖、自动清理
 * - 粒子：fx.burst（迸发/环形冲击波）、fx.confetti（通关彩带）、fx.text（飘字）
 * - 镜头：fx.shake（受击/波次震屏）、fx.vignette（危险红晕）、fx.flash（全屏闪光）
 * - 缓动：easeOutCubic / easeOutQuint / easeOutBack / easeOutElastic / easeInOutQuad
 * 所有场景在 update 后调用 fx.update(dt)，draw 末尾调用 fx.draw(ctx) 叠加粒子层。
 */
const E = {
  linear: function (t) { return t },
  easeOutCubic: function (t) { return 1 - Math.pow(1 - t, 3) },
  easeOutQuint: function (t) { return 1 - Math.pow(1 - t, 5) },
  easeInOutQuad: function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2 },
  easeOutBack: function (t) { const c = 1.35; const p = t - 1; return 1 + (c + 1) * p * p * p + c * p * p },
  easeOutElastic: function (t) {
    if (t <= 0) return 0
    if (t >= 1) return 1
    const p = 0.36
    return Math.pow(2, -9 * t) * Math.sin((t - p / 4) * (2 * Math.PI) / p) + 1
  }
}

/* ---------- 全局状态 ---------- */
let tweens = []
let sparks = []   // {x,y,vx,vy,life,max,size,color,grav,shape}
let floats = []   // {x,y,text,color,life,max,size}
let rings = []    // {x,y,r,vr,life,max,color,lw}
let shake = { power: 0, until: 0, dur: 1 }

const fx = {
  now: Date.now(),
  E: E,

  /* ---------- 补间 ---------- */
  // fx.to(obj, {x:100, alpha:1}, 300, {ease:'easeOutCubic', delay:0, onDone:fn})
  // 同对象同属性的新补间会覆盖旧的（取最新值起点，避免跳变）
  to: function (obj, props, dur, opts) {
    opts = opts || {}
    const ease = E[opts.ease || 'easeOutCubic']
    const items = []
    for (const k in props) {
      // 覆盖同对象同属性的在途补间
      for (let i = tweens.length - 1; i >= 0; i--) {
        const tw = tweens[i]
        const hit = tw.props.some(function (it) { return it.k === k })
        if (tw.obj === obj && hit) {
          if (tw.props.length === 1) tweens.splice(i, 1)
          else tw.props.splice(tw.props.findIndex(function (it) { return it.k === k }), 1)
        }
      }
      items.push({ k: k, from: obj[k], to: props[k] })
    }
    const tw = { obj: obj, props: items, t: -(opts.delay || 0) / 1000, dur: dur / 1000, ease: ease, onDone: opts.onDone || null }
    tweens.push(tw)
    return tw
  },

  kill: function (obj) {
    for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].obj === obj) tweens.splice(i, 1)
  },

  update: function (dt) {
    this.now = Date.now()
    // 补间
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i]
      tw.t += dt
      if (tw.t < 0) continue
      const p = Math.min(1, tw.t / tw.dur)
      const e = tw.ease(p)
      for (let j = 0; j < tw.props.length; j++) {
        const it = tw.props[j]
        tw.obj[it.k] = it.from + (it.to - it.from) * e
      }
      if (p >= 1) {
        tweens.splice(i, 1)
        if (tw.onDone) tw.onDone()
      }
    }
    // 火花
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]
      s.life -= dt
      if (s.life <= 0) { sparks.splice(i, 1); continue }
      s.x += s.vx * dt
      s.y += s.vy * dt
      s.vy += s.grav * dt
      s.vx *= Math.pow(0.4, dt)
      s.vy *= Math.pow(0.4, dt)
    }
    // 飘字
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i]
      f.life -= dt
      if (f.life <= 0) { floats.splice(i, 1); continue }
      f.y -= 34 * dt
    }
    // 冲击环
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]
      r.life -= dt
      if (r.life <= 0) { rings.splice(i, 1); continue }
      r.r += r.vr * dt
    }
  },

  /* ---------- 粒子 ---------- */
  // burst(x, y, {n, colors, speed, size, life, grav, ring})
  burst: function (x, y, o) {
    o = o || {}
    const n = o.n || 14
    const colors = o.colors || ['#FFD86E', '#FFC15E', '#FFF3C4']
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.6
      const sp = (o.speed || 130) * (0.5 + Math.random() * 0.7)
      sparks.push({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: (o.life || 0.55) * (0.7 + Math.random() * 0.6), max: o.life || 0.55,
        size: (o.size || 3) * (0.6 + Math.random() * 0.8),
        color: colors[Math.floor(Math.random() * colors.length)],
        grav: o.grav || 60
      })
    }
    if (o.ring) this.ring(x, y, o.ringColor || colors[0])
  },

  ring: function (x, y, color, o) {
    o = o || {}
    rings.push({ x: x, y: y, r: o.r0 || 6, vr: o.speed || 260, life: o.life || 0.45, max: o.life || 0.45, color: color, lw: o.lw || 2.5 })
  },

  confetti: function (x, y) {
    const palette = ['#FFC15E', '#6FE3D2', '#9B8CFF', '#FF7A92', '#5BC8FF', '#FFE08A']
    for (let i = 0; i < 42; i++) {
      const a = Math.PI * (1 + Math.random()) // 上半圆喷发
      const sp = 180 + Math.random() * 260
      sparks.push({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.9 + Math.random() * 0.7, max: 1.4,
        size: 3 + Math.random() * 3,
        color: palette[Math.floor(Math.random() * palette.length)],
        grav: 320
      })
    }
  },

  text: function (x, y, str, color, o) {
    o = o || {}
    floats.push({ x: x, y: y, text: str, color: color || '#FFD86E', life: o.life || 0.9, max: o.life || 0.9, size: o.size || 14 })
  },

  /* ---------- 镜头 ---------- */
  shake: function (power, dur) {
    if (power >= shake.power * (shake.until - this.now) / 1000) shake = { power: power, until: this.now + dur * 1000, dur: dur }
  },

  shakeOffset: function () {
    const left = (shake.until - this.now) / 1000
    if (left <= 0) return { x: 0, y: 0 }
    const k = shake.power * (left / shake.dur)
    return { x: (Math.random() - 0.5) * 2 * k, y: (Math.random() - 0.5) * 2 * k }
  },

  /* ---------- 叠加绘制 ---------- */
  draw: function (ctx) {
    // 火花
    for (let i = 0; i < sparks.length; i++) {
      const s = sparks[i]
      const a = Math.max(0, s.life / s.max)
      ctx.globalAlpha = a
      ctx.fillStyle = s.color
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.size * (0.4 + 0.6 * a), 0, Math.PI * 2)
      ctx.fill()
    }
    // 冲击环
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i]
      const a = Math.max(0, r.life / r.max)
      ctx.globalAlpha = a * 0.9
      ctx.strokeStyle = r.color
      ctx.lineWidth = r.lw * a + 0.5
      ctx.beginPath()
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2)
      ctx.stroke()
    }
    // 飘字
    ctx.textAlign = 'center'
    for (let i = 0; i < floats.length; i++) {
      const f = floats[i]
      const a = Math.max(0, f.life / f.max)
      ctx.globalAlpha = a
      ctx.font = 'bold ' + Math.round(f.size) + 'px sans-serif'
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.fillText(f.text, f.x + 1, f.y + 1)
      ctx.fillStyle = f.color
      ctx.fillText(f.text, f.x, f.y)
    }
    ctx.globalAlpha = 1
  },

  /* ---------- 氛围叠加 ---------- */
  // 危险红晕：strength 0~1，color 默认暗红
  vignette: function (ctx, W, H, strength, color) {
    if (strength <= 0.01) return
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.72)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, color || 'rgba(255,45,70,' + Math.min(0.55, strength) + ')')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  },

  // 全屏闪光（胜/败/传送）：alpha 0~1
  flash: function (ctx, W, H, alpha, color) {
    if (alpha <= 0.01) return
    ctx.fillStyle = color || 'rgba(255,255,255,1)'
    ctx.globalAlpha = Math.min(1, alpha)
    ctx.fillRect(0, 0, W, H)
    ctx.globalAlpha = 1
  },

  // 通用脉动 0~1（period ms）
  pulse: function (period, phase) {
    return 0.5 + 0.5 * Math.sin(this.now / (period || 600) + (phase || 0))
  },

  clear: function () {
    sparks = []; floats = []; rings = []
    shake = { power: 0, until: 0, dur: 1 }
  }
}

module.exports = fx
