/**
 * 游戏场景（M3/M4：完整玩法 + 模式 + 系统）
 * - PlayCore 驱动全部逻辑；本场景只做：布局/渲染/输入/事件分发/结算
 * - 模式：普通关卡 / 每日挑战（日期种子+幽灵） / 周挑战（词缀计划） / 自定义挑战码 / 生存模式（无尽波次）
 * - 技能（闪现/透视）、广告复活（每局一次，DEV 模拟页）、加载过渡页（M4）
 */
const storage = require('../core/storage')
const theme = require('../core/theme')
const weekly = require('../core/weekly')
const challenge = require('../core/challenge')
const ad = require('../core/ad')
const PlayCore = require('../core/play')
const Modal = require('../ui/Modal')
const { drawBoard, computeLayout, FX_GLYPH, FX_COLOR } = require('../render/board')
const fx = require('../ui/fx')
const Background = require('../ui/Background')
const AdSim = require('../ui/AdSim')
const { Button, roundRect } = require('../ui/Button')

const LOAD_TIPS = ['生成迷宫中…', '规划安全路线…', '唤醒沉睡守卫…', '点亮迷雾灯塔…', '铺设机关齿轮…']

// 剧情过场（与小程序版 STORY_CHAPTERS 同源）
const STORY_CHAPTERS = {
  21: { id: 'c21', title: '第二章 · 迷雾峡谷', art: '🌫️🌫️🌫️', lines: ['森林的尽头弥漫着不散的迷雾。', '老旅人说，峡谷里藏着会追人的影子。', '屏住呼吸，别让它们听见你的脚步。'] },
  41: { id: 'c41', title: '第三章 · 流光回廊', art: '✨🌌✨', lines: ['峡谷的底部，是一座会发光的回廊。', '墙壁里流淌着远古的光尘。', '收集它们——它们是你唯一的武器。'] },
  61: { id: 'c61', title: '第四章 · 熔岩深渊', art: '🔥🌋🔥', lines: ['越往下走，越热。', '深渊的岩浆在墙后翻涌，单向的门只许进不许出。', '小心每一步，这里的怪物不打算让你活着离开。'] },
  81: { id: 'c81', title: '终章 · 星海之巅', art: '⭐🌊⭐', lines: ['穿过深渊，你看见了星空。', '迷宫之主就等在这里——它守着出口的最后一把钥匙。', '别回头，跑。'] },
  101: { id: 'c101', title: '回响 · 虚空回响', art: '🌀🔮🌀', lines: ['星海之后，迷宫在虚空中留下回响。', '这里的回廊左右互为镜像，仿佛走进自己的倒影。', '集三粒光尘，时光便愿意为你倒流一次。'] }
}

function GameScene(sm) {
  this.sm = sm
  this.u = 1
  this.always = true
  this.core = null
  this.hint = ''
  this.hintUntil = 0
  this.overlay = null
  this.touchStart = null
  this.reviveUsed = false
  this.bg = new Background()
  this.banner = null        // {text, until, color}
  this.redFlash = 0         // 失败红闪
  this.whiteFlash = 0       // 通关白闪
}

GameScene.prototype.enter = function (params) {
  const u = this.u = this.sm.W / 375
  const W = this.sm.W
  const H = this.sm.H
  params = params || {}
  this.mode = params.mode || 'level'
  this.weekIdx = params.weekIdx
  this.level = Math.max(1, Math.min(params.level || 1, storage.TOTAL))
  this.mods = params.mods || []
  this.seed = params.seed
  if (this.mode === 'daily' && !this.seed) this.seed = storage.dailySeed()
  this.hudH = (this.sm.sat || 0) + 92 * u
  this.view = {
    bx: 8 * u, by: this.hudH,
    bw: W - 16 * u, bh: H - this.hudH - 10 * u,
    v: theme.getTheme(storage.getTheme()).vars,
    cellMin: 40 * u, // 恒定可读 cell 下限，迷宫过大时由镜头滚动呈现
    camX: 0, camY: 0 // 迷宫世界左上像素偏移（镜头）
  }
  this.cam = { x: 0, y: 0 }   // 当前镜头（含平滑）
  this._prevVis = null        // 上一帧玩家位置，用于检测瞬移跳变
  this.reviveUsed = false
  this.buildCore()
  this.snapCamera() // 开局镜头直接对齐玩家，避免开场长平移
  this.overlay = null
  this.backBtn = null
  this.helpBtn = null
  this.modal = null
  this.bagBtns = null
  this.skillBtns = null
  this.banner = null
  this.redFlash = 0
  this.whiteFlash = 0
  fx.clear()
  // 加载过渡页（M4）：最小 650ms，首帧完成后淡出
  this.loading = { until: Date.now() + 650, tipIdx: 0, tipUntil: 0 }
  this._startTime = Date.now()
  // 剧情过场：分区首关且未读过
  this.story = null
  this.storyBtn = null
  this.storyT = undefined
  if (this.mode === 'level') {
    const ch = STORY_CHAPTERS[this.level]
    if (ch && !storage.isStorySeen(ch.id)) {
      this.story = ch
      const self = this
      this.storyBtn = new Button({
        x: this.sm.W / 2 - 70 * u, y: this.sm.H * 0.66, w: 140 * u, h: 46 * u,
        label: '开始冒险', fontSize: Math.round(15 * u),
        fill: '#FFC15E', fill2: '#FF9F6E', textColor: '#3A2A08',
        onTap: function () {
          try { storage.markStorySeen(self.story.id) } catch (e) {}
          self.story = null
          self.storyBtn = null
        }
      })
    }
  }
}

GameScene.prototype.buildCore = function () {
  const self = this
  const skillOwned = storage.getSkills()
  const core = new PlayCore(this.level, {
    aspect: this.view.bh / this.view.bw,
    seed: this.seed,
    mods: this.mods,
    survival: this.mode === 'survival',
    fxDur: function (t) { return storage.fxDuration(t) }
  })
  // 技能每局次数（已解锁才可用）
  core.skillUses = { dash: skillOwned.dash ? 3 : 0, insight: skillOwned.insight ? 2 : 0 }
  core.useSkill = function (k) {
    if (!this.skillUses[k]) {
      this.emit('hint', k === 'dash' ? '闪现步未解锁 · 前往补给站' : '透视眼未解锁 · 前往补给站')
      return
    }
    if (this.skillUses[k] <= 0) { this.emit('hint', '本局技能次数已用完'); return }
    const ok = k === 'dash' ? this.useSkillDash() : this.useSkillInsight()
    if (ok) this.skillUses[k]--
  }
  this.core = core
  // 每日挑战幽灵竞速：按时间轴插值本机最佳路线
  this.ghost = null
  this.ghostPos = null
  this._ghostIdx = 0
  if (this.mode === 'daily') {
    const g = storage.getGhost(storage.dailyKey())
    if (g && g.path && g.path.length > 2) this.ghost = g
  }
  this.hint = ''
  this.touchStart = null
  // 生存模式标题：用固定布局关（L30）生成迷宫
  if (this.mode === 'survival') this.survivalLabel = true
}

// 音效（简单包装，缺文件静默）
GameScene.prototype.snd = function (name) {
  try {
    if (!storage.getSetting('sound', true)) return
    if (!this._audio) this._audio = {}
    if (!this._audio[name]) {
      const a = wx.createInnerAudioContext()
      a.src = 'audio/' + name + '.wav'
      this._audio[name] = a
    }
    this._audio[name].play()
  } catch (e) {}
}

// 震动反馈（受设置开关控制）
GameScene.prototype.vib = function (kind) {
  try {
    if (!storage.getSetting('vibration', true)) return
    wx.vibrateShort({ type: kind || 'light' })
  } catch (e) {}
}

/* ---------- 触摸：滑动转向 + 按钮 + 弹窗 ---------- */

GameScene.prototype.onTouchStart = function (tx, ty) {
  if (this.adSim) return // 模拟广告页吞掉触摸
  if (this.story) { this.storyBtn.touch(tx, ty, true); return }
  if (this.modal) { this.modal.onTouchStart(tx, ty); return }
  if (this.overlay) {
    for (let i = 0; i < this.overlay.btns.length; i++) this.overlay.btns[i].touch(tx, ty, true)
    return
  }
  if (this.loading) return
  if (this.backBtn) this.backBtn.touch(tx, ty, true)
  if (this.bagBtns) for (let i = 0; i < this.bagBtns.length; i++) this.bagBtns[i].touch(tx, ty, true)
  if (this.skillBtns) for (let i = 0; i < this.skillBtns.length; i++) this.skillBtns[i].touch(tx, ty, true)
  this.touchStart = { x: tx, y: ty }
  this._steered = false
  this._holdDir = null
}

// 指尖跟随：按住拖动，小人实时沿手指主导方向行走（路口不停）
GameScene.prototype.onTouchMove = function (tx, ty) {
  if (this.adSim || this.story || this.modal || this.overlay || this.loading) return
  if (!this.touchStart) return
  const dx = tx - this.touchStart.x
  const dy = ty - this.touchStart.y
  const adx = Math.abs(dx)
  const ady = Math.abs(dy)
  if (Math.max(adx, ady) < 18) return
  const d = adx > ady ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U')
  this._steered = true
  if (d !== this._holdDir) {
    this._holdDir = d
    this.touchStart = { x: tx, y: ty } // 换向重锚：新方向从当前指位起算，转向更跟手
    this.core.steer(d, Math.max(adx, ady))
  }
}

GameScene.prototype.onTouchEnd = function (tx, ty) {
  if (this.adSim) return
  if (this.story) { this.storyBtn.touch(tx, ty, false); return }
  if (this.modal) { this.modal.onTouchEnd(tx, ty); return }
  if (this.overlay) {
    for (let i = 0; i < this.overlay.btns.length; i++) this.overlay.btns[i].touch(tx, ty, false)
    return
  }
  if (this.loading) return
  if (this.backBtn) this.backBtn.touch(tx, ty, false)
  if (this.bagBtns) for (let i = 0; i < this.bagBtns.length; i++) this.bagBtns[i].touch(tx, ty, false)
  if (this.skillBtns) for (let i = 0; i < this.skillBtns.length; i++) this.skillBtns[i].touch(tx, ty, false)
  if (!this.touchStart) return
  const wasSteered = this._steered
  const dx = tx - this.touchStart.x
  const dy = ty - this.touchStart.y
  const adx = Math.abs(dx)
  const ady = Math.abs(dy)
  this.touchStart = null
  this._steered = false
  this._holdDir = null
  this.core.releaseHold()
  // 按住拖动已驱动过：松起不再按一次性滑动判定（避免双重计步/转向）
  if (wasSteered) return
  if (Math.max(adx, ady) < 18) return
  const d = adx > ady ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U')
  this.core.swipe(d, Math.max(adx, ady))
}

/* ---------- 帧更新与事件分发 ---------- */

GameScene.prototype.update = function () {
  if (this.modal) { this.modal.update(); return }
  if (this.adSim) {
    // DEV 模拟广告：3 秒倒计时，走完回调成功
    if (this.adSim.update()) this.adSim = null
    return
  }
  if (this.story) return // 剧情过场：游戏暂停
  if (this.loading && Date.now() >= this.loading.until) {
    this.loading = null
    if (this.mode === 'daily') this.setHint('每日挑战 · 今日布局（' + storage.dailyKey() + '）')
    else if (this.mode === 'weekly') this.setHint('周挑战 第' + (this.weekIdx + 1) + '关 · 词缀生效中')
    else if (this.mode === 'custom') this.setHint('自定义挑战 · 词缀生效中')
    else if (this.mode === 'survival') this.setHint('生存模式 · 坚持尽可能多的波次！')
  }
  if (this.loading) {
    const tipIdx = Math.floor(Date.now() / 900) % LOAD_TIPS.length
    if (tipIdx !== this.loading.tipIdx) { this.loading.tipIdx = tipIdx; }
    return // 加载期间不推进游戏
  }
  const core = this.core
  if (!core) return
  const evs = core.tick(Date.now())
  for (let i = 0; i < evs.length; i++) this.handleEvent(evs[i])
  // 镜头跟随（边缘触发死区）：玩家走出屏幕中央区域才滚动迷宫
  this.updateCamera()
  // 幽灵竞速插值
  if (this.ghost) {
    const gt = (Date.now() - this._startTime) / 1000
    const gp = this.ghost.path
    while (this._ghostIdx < gp.length - 1 && gp[this._ghostIdx + 1].t <= gt) this._ghostIdx++
    const ga = gp[this._ghostIdx]
    const gb = gp[Math.min(this._ghostIdx + 1, gp.length - 1)]
    const span = Math.max(0.001, gb.t - ga.t)
    const f = Math.min(1, Math.max(0, (gt - ga.t) / span))
    this.ghostPos = { x: ga.x + (gb.x - ga.x) * f, y: ga.y + (gb.y - ga.y) * f }
  } else this.ghostPos = null
}

// 镜头：开局/SNAP（直接对齐玩家，避免开场长平移）
GameScene.prototype.snapCamera = function () {
  const v = this.view
  const core = this.core
  if (!core || !core.maze) return
  const m = core.maze
  const cs = Math.max(Math.min(v.bw / m.W, v.bh / m.H), v.cellMin)
  const mw = cs * m.W, mh = cs * m.H
  if (mw <= v.bw + 0.5 && mh <= v.bh + 0.5) {
    this.cam = { x: 0, y: 0 }; v.camX = 0; v.camY = 0
    return
  }
  let tx = core.visual.x * cs - v.bw / 2
  let ty = core.visual.y * cs - v.bh / 2
  tx = Math.max(0, Math.min(tx, mw - v.bw))
  ty = Math.max(0, Math.min(ty, mh - v.bh))
  this.cam = { x: tx, y: ty }
  v.camX = tx
  v.camY = ty
}

// 镜头：每帧更新（边缘触发死区，平滑跟随；瞬移跳变则直接对齐）
GameScene.prototype.updateCamera = function () {
  const v = this.view
  const core = this.core
  const m = core.maze
  const cs = Math.max(Math.min(v.bw / m.W, v.bh / m.H), v.cellMin)
  const mw = cs * m.W, mh = cs * m.H
  if (mw <= v.bw + 0.5 && mh <= v.bh + 0.5) {
    this.cam = { x: 0, y: 0 }; v.camX = 0; v.camY = 0
    this._prevVis = { x: core.visual.x, y: core.visual.y }
    return
  }
  const px = core.visual.x * cs
  const py = core.visual.y * cs
  const sx = v.bx - this.cam.x + px   // 玩家当前屏幕坐标
  const sy = v.by - this.cam.y + py
  const viewCx = v.bx + v.bw / 2
  const viewCy = v.by + v.bh / 2
  const zone = Math.min(v.bw, v.bh) * 0.22 // 死区半宽：玩家在屏幕中央约 56% 区域自由移动
  let tx = this.cam.x, ty = this.cam.y
  if (sx < viewCx - zone) tx = this.cam.x + (sx - (viewCx - zone))
  else if (sx > viewCx + zone) tx = this.cam.x + (sx - (viewCx + zone))
  if (sy < viewCy - zone) ty = this.cam.y + (sy - (viewCy - zone))
  else if (sy > viewCy + zone) ty = this.cam.y + (sy - (viewCy + zone))
  tx = Math.max(0, Math.min(tx, mw - v.bw))
  ty = Math.max(0, Math.min(ty, mh - v.bh))
  // 瞬移卷轴 / 传送门：位置跳变直接对齐，避免一段无意义快进
  const pv = this._prevVis || core.visual
  const jump = Math.abs(core.visual.x - pv.x) + Math.abs(core.visual.y - pv.y)
  if (jump > 1.5) { this.cam.x = tx; this.cam.y = ty }
  else { this.cam.x += (tx - this.cam.x) * 0.2; this.cam.y += (ty - this.cam.y) * 0.2 }
  v.camX = this.cam.x
  v.camY = this.cam.y
  this._prevVis = { x: core.visual.x, y: core.visual.y }
}

GameScene.prototype.setHint = function (t) {
  this.hint = t
  this.hintUntil = Date.now() + 2600
}

GameScene.prototype.handleEvent = function (ev) {
  const d = ev.data || {}
  switch (ev.type) {
    case 'hint':
      this.setHint(d)
      break
    case 'wave':
      this.setHint('第 ' + d.wave + ' 波来袭！')
      this.banner = { text: '第 ' + d.wave + ' 波', until: Date.now() + 1400, color: '#FF6B81' }
      fx.shake(5, 0.3)
      this.snd('alert')
      break
    case 'pickup': {
      this.snd(d.type === 'gem' ? 'pick' : 'power')
      try { storage.encounterCodex(d.type === 'gem' ? 'i_gem' : 'i_' + d.type) } catch (e) {}
      // 拾取点粒子 + 飘字
      const st = this.core.state
      const L = computeLayout(this.core, this.view)
      const px = L.ox + (st.x + 0.5) * L.cs
      const py = L.oy + (st.y + 0.5) * L.cs
      if (d.type === 'gem') {
        fx.burst(px, py, { n: 10, colors: ['#FFD86E', '#FFF3C4', '#FFC15E'], speed: 100, size: 2.6, life: 0.5 })
        fx.text(px, py - 10, '+1✦', '#FFD86E', { size: 13 * this.u })
      } else {
        const col = require('../render/board').FX_COLOR[d.type] || '#FF9F6E'
        fx.burst(px, py, { n: 14, colors: [col, '#FFFFFF'], speed: 130, size: 2.8, life: 0.55, ring: true })
      }
      break
    }
    case 'alert':
      fx.shake(2.5, 0.2)
      this.snd('alert')
      try { storage.encounterCodex('m_alert') } catch (e) {}
      break
    case 'skill':
      fx.shake(3, 0.18)
      this.snd('power')
      break
    case 'revive':
      this.overlay = null
      this.setHint('复活！3 秒无敌')
      fx.burst(this.sm.W / 2, this.sm.H / 2, { n: 22, colors: ['#6FE3D2', '#FFFFFF', '#9B8CFF'], speed: 160, size: 3, ring: true })
      this.snd('power')
      break
    case 'portal':
    case 'rewind':
      this.whiteFlash = 0.55
      fx.to(this, { whiteFlash: 0 }, 400)
      fx.ring(this.sm.W / 2, this.sm.H / 2, '#C79BFF', { speed: 420, life: 0.5 })
      this.snd('power')
      break
    case 'catchBoss':
    case 'shieldBreak':
      fx.shake(6, 0.3)
      this.snd('power')
      break
    case 'shoot':
      fx.shake(1.6, 0.1)
      this.snd('boss')
      break
    case 'secret':
      storage.addDust(d.dust || 5)
      fx.text(this.sm.W / 2, this.view.by + this.view.bh * 0.3, '✦ 隐藏密室 +' + (d.dust || 5), '#FFD86E', { size: 15 * this.u, life: 1.3 })
      fx.burst(this.sm.W / 2, this.sm.H / 2, { n: 18, colors: ['#FFD86E', '#FFF3C4'], speed: 150, size: 3 })
      this.snd('power')
      break
    case 'won':
      fx.confetti(this.sm.W / 2, this.sm.H * 0.35)
      fx.shake(2, 0.15)
      this.whiteFlash = 0.4
      fx.to(this, { whiteFlash: 0 }, 500)
      this.snd('win')
      this.vib('medium')
      this.onWin(d)
      break
    case 'fail':
      fx.shake(8, 0.4)
      this.redFlash = 0.85
      fx.to(this, { redFlash: 0 }, 600)
      this.snd('fail')
      this.vib('heavy')
      this.onFail(d.reason)
      break
  }
}

/* ---------- 结算 ---------- */

GameScene.prototype.onWin = function (st) {
  const best = this.core.bestSteps || 1
  const stepOK = st.steps <= best * 1.35
  const swipeOK = st.swipe <= Math.max(3, Math.round(best / 6))
  const timeOK = st.time <= Math.max(8, Math.round(best * 0.45))
  const cnt = (stepOK ? 1 : 0) + (swipeOK ? 1 : 0) + (timeOK ? 1 : 0)
  const stars = cnt >= 3 ? 3 : cnt >= 2 ? 2 : 1
  let dustEarn
  let extra = []
  try {
    if (this.mode === 'daily') {
      dustEarn = Math.max(3, st.gems)
      const info = storage.completeDaily(storage.dailyKey(), { time: st.time, steps: st.steps, swipe: st.swipe, stars: stars, gems: st.gems, gemTotal: st.gemTotal })
      if (info && info.better) extra.push('破纪录！')
      if (this.ghostPathCandidate(st)) storage.saveGhost(storage.dailyKey(), { path: this.core.ghostPath, gems: st.gems })
    } else if (this.mode === 'weekly') {
      dustEarn = Math.max(3, st.gems)
      storage.completeWeekLevel(weekly.weekKey(), this.weekIdx)
      extra.push('周挑战进度 +1')
    } else if (this.mode === 'custom') {
      dustEarn = Math.max(1, st.gems)
      extra.push('挑战完成')
    } else {
      const firstClear = !storage.getProgress().completed[this.level]
      dustEarn = firstClear ? st.gems : Math.max(1, Math.floor(st.gems / 2))
      storage.completeLevel(this.level, { time: st.time, steps: st.steps, swipe: st.swipe, stars: stars, gems: st.gems, gemTotal: st.gemTotal })
      storage.recordWin(this.level, st.time)
    }
    // 连击光尘加成（仅普通关卡计入连击，封顶 +10✦）
    if (this.mode === 'level') {
      const combo = storage.incCombo()
      const comboBonus = Math.min(combo - 1, 5) * 2
      if (comboBonus > 0) {
        dustEarn += comboBonus
        extra.push('连击 x' + combo + ' +' + comboBonus + '✦')
      }
    }
    storage.addDust(dustEarn)
  } catch (e) {
    dustEarn = dustEarn || 0
  }
  this.buildOverlay('win', {
    title: '通关！' + '★'.repeat(stars) + '☆'.repeat(3 - stars),
    lines: [
      '用时 ' + st.time + 's · 步数 ' + st.steps + '/' + best,
      '光尘 +' + dustEarn + '✦（' + st.gems + '/' + st.gemTotal + '）' + extra.join(' ')
    ]
  })
}

GameScene.prototype.ghostPathCandidate = function (st) {
  return this.core.ghostPath && this.core.ghostPath.length > 2
}

GameScene.prototype.onFail = function (reason) {
  const self = this
  let extra = []
  storage.resetCombo() // 连击中断
  // 生存模式：阵亡记录最佳波数
  if (this.mode === 'survival') {
    const reached = Math.max(1, this.core.wave || 1)
    const st = storage.getStats()
    if (reached > (st.bestWave || 0)) {
      st.bestWave = reached
      try { storage.saveStats(st) } catch (e) {}
      extra.push('新纪录！')
    }
    extra.push('撑到第 ' + reached + ' 波')
  }
  const canRevive = !this.reviveUsed
  const btns = [
    {
      label: canRevive ? '看广告复活' : '再试一次',
      primary: true,
      onTap: function () {
        if (canRevive) self.showReviveAd()
        else self.enter({ level: self.level, mode: self.mode, weekIdx: self.weekIdx, mods: self.mods, seed: self.mode === 'daily' ? storage.dailySeed() : self.seed })
      }
    },
    { label: '返回首页', onTap: function () { self.sm.switch('home') } }
  ]
  if (canRevive) {
    btns.push({
      label: '放弃复活',
      onTap: function () {
        self.enter({ level: self.level, mode: self.mode, weekIdx: self.weekIdx, mods: self.mods, seed: self.mode === 'daily' ? storage.dailySeed() : self.seed })
      }
    })
  }
  this.buildOverlay('fail', { title: '挑战失败', lines: [reason || '再试一次'].concat(extra), btns: btns })
}

// 广告复活：真机拉激励视频；无广告位（DEV）时用 3 秒模拟页
GameScene.prototype.showReviveAd = function () {
  const self = this
  const applyRevive = function () {
    self.reviveUsed = true
    self.core.revive()
    self.overlay = null
  }
  const handled = ad.showRewarded(function (ok) {
    if (ok) applyRevive()
  })
  if (!handled) {
    // DEV 模拟广告页
    this.adSim = new AdSim(this.sm, function (ok) { if (ok) applyRevive() }, '发放复活奖励…')
  }
}

GameScene.prototype.buildOverlay = function (type, info) {
  const u = this.u
  const W = this.sm.W
  const H = this.sm.H
  const self = this
  const defs = info.btns || [
    {
      label: type === 'win' ? '下一关' : '再试一次',
      onTap: function () {
        const isWin = type === 'win'
        if (isWin && self.mode === 'weekly' && self.weekIdx < 4) {
          const plan = weekly.getPlan()
          const nxt = plan[self.weekIdx + 1]
          self.enter({ level: nxt.level, mode: 'weekly', weekIdx: self.weekIdx + 1, mods: nxt.mods })
          return
        }
        const nxt = isWin ? Math.min(self.level + 1, storage.TOTAL) : self.level
        self.enter({ level: nxt, mode: self.mode, weekIdx: self.weekIdx, mods: self.mods, seed: self.mode === 'daily' ? storage.dailySeed() : self.seed })
      }
    },
    { label: '返回首页', onTap: function () { self.sm.switch('home') } }
  ]
  // 按钮自适应布局：≤2 个一行；≥3 个时主按钮独占一行，其余第二行
  const pw = 300 * u
  const BTN_H = 48 * u
  const BTN_GAP = 10 * u
  const rows = defs.length <= 2 ? [defs] : [defs.slice(0, 1), defs.slice(1)]
  const linesN = (info.lines || []).length
  const ph = 66 * u + linesN * 22 * u + 16 * u + rows.length * BTN_H + (rows.length - 1) * BTN_GAP + 20 * u
  // 垂直居中偏上，且不越过安全区
  const sab = this.sm.sab || 0
  let py = H * 0.5 - ph / 2 - 16 * u
  py = Math.max((this.sm.sat || 0) + 96 * u, Math.min(py, H - sab - 16 * u - ph))
  const px = W / 2 - pw / 2
  const btns = []
  for (let r = 0; r < rows.length; r++) {
    const rowDefs = rows[r]
    const n = rowDefs.length
    const bw = n === 1 ? Math.min(220 * u, pw - 56 * u) : (pw - 24 * u - (n - 1) * BTN_GAP) / n
    const rowY = py + ph - 18 * u - BTN_H - (rows.length - 1 - r) * (BTN_H + BTN_GAP)
    for (let i = 0; i < n; i++) {
      const def = rowDefs[i]
      const isFirst = r === 0 && i === 0
      btns.push(new Button({
        x: W / 2 - (n * bw + (n - 1) * BTN_GAP) / 2 + i * (bw + BTN_GAP),
        y: rowY, w: bw, h: BTN_H,
        label: def.label,
        fontSize: Math.round(14 * u),
        fill: isFirst ? '#FFC15E' : 'rgba(255,255,255,0.14)',
        fill2: isFirst ? '#FF9F6E' : 'rgba(255,255,255,0.10)',
        textColor: isFirst ? '#3A2A08' : '#F3F1FF',
        onTap: def.onTap || function () { self.sm.switch('home') }
      }))
    }
  }
  this.overlay = { type: type, info: info, btns: btns, t: 0, mt: 0, rect: { px: px, py: py, pw: pw, ph: ph } }
  fx.to(this.overlay, { t: 1 }, 340, { ease: 'easeOutBack' })
  fx.to(this.overlay, { mt: 1 }, 200, { ease: 'linear' })
}

/* ---------- 绘制 ---------- */

GameScene.prototype.draw = function (ctx) {
  const v = this.view.v
  const W = this.sm.W
  const H = this.sm.H
  const u = this.u
  ctx.save()

  // 氛围背景（压暗，突出棋盘）
  this.bg.draw(ctx, W, H, v, 1 / 60, 0.45)

  if (this.adSim) { this.drawAdSim(ctx, u, W, H); ctx.restore(); return }

  // 震屏（整体位移，事件冲击感）
  const so = fx.shakeOffset()
  ctx.save()
  ctx.translate(so.x, so.y)

  // HUD
  this.drawHud(ctx, v, u, W)

  // 棋盘
  this.view.now = Date.now()
  drawBoard(ctx, this.core, this.view)

  // 幽灵竞速
  if (this.ghostPos) {
    const L = computeLayout(this.core, this.view)
    ctx.save()
    ctx.globalAlpha = 0.5
    ctx.shadowColor = '#8FB8FF'
    ctx.shadowBlur = 10
    ctx.fillStyle = '#8FB8FF'
    ctx.beginPath()
    ctx.arc(L.ox + (this.ghostPos.x + 0.5) * L.cs, L.oy + (this.ghostPos.y + 0.5) * L.cs, L.cs * 0.3, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  ctx.restore() // 震屏结束（弹层不震）

  // 棋盘上层的右侧控件（返回/玩法/指南针/技能/背包）：
  // 必须在 drawBoard 之后绘制，否则会被迷宫地板盖住（背包/技能曾被覆盖导致不可见、不可点）
  this.drawHudControls(ctx, v, u, W)

  // 右下角小地图（镜头滚动后提供全貌与威胁分布）
  this.drawMinimap(ctx, v, u)

  // 危险红晕：最近怪物距离
  const danger = this.dangerLevel()
  if (danger > 0 && !this.overlay && !this.story && !this.loading) {
    fx.vignette(ctx, W, H, danger * (0.32 + 0.14 * fx.pulse(700)))
  }

  // 事件闪光
  if (this.whiteFlash > 0.01) fx.flash(ctx, W, H, this.whiteFlash, 'rgba(255,255,255,1)')
  if (this.redFlash > 0.01) fx.vignette(ctx, W, H, this.redFlash, 'rgba(255,30,60,0.8)')

  // 波次/事件横幅
  this.drawBanner(ctx, u, W)

  // 剧情过场（顶层）
  if (this.story) { this.drawStory(ctx, v, u); ctx.restore(); return }

  // 加载过渡页
  if (this.loading) { this.drawLoading(ctx, v, u, W, H); ctx.restore(); return }

  // 胜负面板
  if (this.overlay) this.drawOverlay(ctx, v, u)
  // 系统弹窗
  if (this.modal) this.modal.draw(ctx)
  ctx.restore()
}

// 危险度 0~1：最近追击怪与玩家的曼哈顿距离
GameScene.prototype.dangerLevel = function () {
  const core = this.core
  if (!core || core.dead || core.won) return 0
  if (core.fx && (core.fx.cloak > 0 || core.fx.freeze > 0)) return 0
  let min = 99
  for (let i = 0; i < core.monsters.length; i++) {
    const mm = core.monsters[i]
    if (mm.flee) continue
    const d = Math.abs(mm.vx - core.visual.x) + Math.abs(mm.vy - core.visual.y)
    if (d < min) min = d
  }
  return min <= 1 ? 1 : min <= 3 ? (3 - min) / 2 * 0.7 : 0
}

// 居中事件横幅（波次/Boss 狂暴）
GameScene.prototype.drawBanner = function (ctx, u, W) {
  if (!this.banner) return
  const now = Date.now()
  if (now >= this.banner.until) { this.banner = null; return }
  const left = (this.banner.until - now) / 1400
  const a = Math.min(1, Math.min(1, (1 - left) * 6) * Math.min(1, left * 3))
  ctx.save()
  ctx.globalAlpha = a
  ctx.translate(0, (1 - Math.min(1, (1 - left) * 6)) * -14)
  ctx.textAlign = 'center'
  ctx.font = 'bold ' + Math.round(26 * u) + 'px sans-serif'
  ctx.shadowColor = this.banner.color
  ctx.shadowBlur = 18
  ctx.fillStyle = this.banner.color
  ctx.fillText(this.banner.text, W / 2, this.sm.H * 0.3)
  ctx.restore()
}

GameScene.prototype.drawHud = function (ctx, v, u, W) {
  const sat = this.sm.sat || 0
  // 右上控件起始 y：胶囊按钮（"…"⊙）下缘以下，避免被遮挡
  this.capB = (this.sm.capB || sat + 40)
  // HUD 玻璃底条
  roundRect(ctx, 8 * u, sat + 8 * u, W - 16 * u, 74 * u, 14 * u)
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  ctx.stroke()

  ctx.textAlign = 'left'
  ctx.fillStyle = v['--text']
  ctx.font = 'bold ' + Math.round(17 * u) + 'px sans-serif'
  let title = '第 ' + this.level + ' 关'
  if (this.mode === 'daily') title = '每日挑战'
  else if (this.mode === 'weekly') title = '周挑战 ' + (this.weekIdx + 1) + '/5'
  else if (this.mode === 'custom') title = '自定义挑战'
  else if (this.mode === 'survival') title = '生存模式'
  ctx.fillText(title, 18 * u, sat + 26 * u)
  // 光尘进度（胶囊徽章）
  const gp = { x: 16 * u, y: sat + 38 * u, w: 78 * u, h: 24 * u }
  roundRect(ctx, gp.x, gp.y, gp.w, gp.h, gp.h / 2)
  ctx.fillStyle = v['--pill'] || 'rgba(255,255,255,0.10)'
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(255,216,110,0.30)'
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.save()
  ctx.shadowColor = '#FFD86E'
  ctx.shadowBlur = 6
  ctx.fillStyle = '#FFD86E'
  ctx.font = 'bold ' + Math.round(12.5 * u) + 'px sans-serif'
  ctx.fillText('✦ ' + this.core.collected + '/' + this.core.gemTotal, gp.x + gp.w / 2 + 2 * u, gp.y + gp.h / 2 + 1)
  ctx.restore()
  ctx.textAlign = 'left'
  let hx = 104 * u
  if (this.core.bossOn) {
    this.drawBossBar(ctx, v, u, hx)
    hx += 130 * u
  }
  if (this.mode === 'survival') {
    ctx.fillStyle = '#FF6B81'
    ctx.font = 'bold ' + Math.round(13 * u) + 'px sans-serif'
    ctx.fillText(this.core.wave > 0 ? '🌊 第 ' + this.core.wave + ' 波 · ' + Math.max(0, Math.ceil(this.core.waveTimeLeft)) + 's' : '准备…', hx, sat + 50 * u)
    hx += 110 * u
  }
  if (this.core.hasKey) {
    roundRect(ctx, hx, sat + 38 * u, 52 * u, 24 * u, 12 * u)
    ctx.fillStyle = 'rgba(255,216,110,0.16)'
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(255,216,110,0.45)'
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.save()
    ctx.shadowColor = '#FFD86E'
    ctx.shadowBlur = 8
    ctx.fillStyle = '#FFD86E'
    ctx.font = Math.round(12.5 * u) + 'px sans-serif'
    ctx.fillText('钥 ✓', hx + 26 * u, sat + 38 * u + 13 * u)
    ctx.restore()
    ctx.textAlign = 'left'
  }
  // 提示行
  if (this.hint && Date.now() < this.hintUntil) {
    const ha = Math.min(1, (this.hintUntil - Date.now()) / 400)
    ctx.globalAlpha = ha
    ctx.fillStyle = v['--accent']
    ctx.font = Math.round(12 * u) + 'px sans-serif'
    ctx.fillText(this.hint, 18 * u, sat + 72 * u)
    ctx.globalAlpha = 1
  }
}

// 棋盘上层右侧控件（在 drawBoard 之后调用，保证可见可点）
GameScene.prototype.drawHudControls = function (ctx, v, u, W) {
  const self = this
  // 玩法按钮（生存模式）
  if (this.mode === 'survival' && !this.helpBtn) {
    this.helpBtn = new Button({
      x: W - 138 * u, y: this.capB, w: 54 * u, h: 30 * u,
      label: '玩法', fontSize: Math.round(13 * u),
      glass: true,
      fill: 'rgba(255,107,129,0.24)', fill2: 'rgba(255,107,129,0.12)', textColor: '#FFB9C6',
      onTap: function () { self.showSurvivalHelp() }
    })
  }
  // 返回按钮
  if (!this.backBtn) {
    this.backBtn = new Button({
      x: W - 76 * u, y: this.capB, w: 60 * u, h: 30 * u,
      label: '返回', fontSize: Math.round(13 * u),
      glass: true,
      fill: 'rgba(255,255,255,0.12)', fill2: 'rgba(255,255,255,0.06)', textColor: '#F3F1FF',
      onTap: function () { self.sm.switch('home') }
    })
  }
  this.backBtn.draw(ctx)
  if (this.helpBtn) this.helpBtn.draw(ctx)

  // 出口指南针（非生存模式）：指向迷宫出口
  if (this.mode !== 'survival' && this.core && this.core.maze) this.drawCompass(ctx, v, u, W)

  // 技能按钮（已解锁才显示）
  this.drawSkills(ctx, u, W)
  // 背包（3 槽，点按使用）
  this.drawBag(ctx, u)
}

// 出口指南针：以迷宫出口方向旋转指针（网格坐标与屏幕同向）
GameScene.prototype.drawCompass = function (ctx, v, u, W) {
  const m = this.core.maze
  const ex = m.end
  const dx = ex.x - this.core.state.x
  const dy = ex.y - this.core.state.y
  const ang = Math.atan2(dy, dx)
  const cx = W - 26 * u
  const cy = this.hudH + 22 * u
  const r = 12 * u
  ctx.save()
  ctx.textAlign = 'center'
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(10,12,32,0.55)'
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(255,216,110,0.55)'
  ctx.stroke()
  ctx.translate(cx, cy)
  ctx.rotate(ang)
  ctx.beginPath()
  ctx.moveTo(r - 3 * u, 0)
  ctx.lineTo(-(r - 4 * u), -4 * u)
  ctx.lineTo(-(r - 4 * u), 4 * u)
  ctx.closePath()
  ctx.fillStyle = '#FFD86E'
  ctx.fill()
  ctx.restore()
  ctx.fillStyle = 'rgba(243,241,255,0.85)'
  ctx.font = Math.round(8 * u) + 'px sans-serif'
  ctx.fillText('出口', cx, cy + r + 10 * u)
}

// 生存模式玩法说明（游戏内随时可查，弹窗期间游戏暂停）
GameScene.prototype.showSurvivalHelp = function () {
  const self = this
  const st = storage.getStats()
  this.modal = new Modal(this.sm, {
    title: '生存模式 · 玩法',
    lines: [
      { t: '🌊 无尽波次生存战：不被怪物抓住，撑到的波数越多越强。', b: true, s: 13 },
      { t: '' },
      { t: '· 每波比上一波多 1 只追击怪，第 4 波起出现会射击的狙击手', s: 12 },
      { t: '· 每波限时 20+4n 秒，倒计时归零立即刷新下一波（怪不清空，越积越多）', s: 12 },
      { t: '· 波与波之间在迷宫刷新一个随机道具，右下角背包 3 格、点按使用', s: 12 },
      { t: '· 迷雾全程开启，沿途光尘别错过', s: 12 },
      { t: '· 被抓住即结束（可复活一次），成绩 = 撑到的波数', s: 12 },
      { t: '' },
      st.bestWave
        ? { t: '🏆 你的最佳纪录：第 ' + st.bestWave + ' 波', c: '#FFC15E', b: true }
        : { t: '尚无纪录，来创造第一个！', c: '#6FE3D2', b: true }
    ],
    buttons: [{ label: '继续战斗', primary: true }],
    onClose: function () { self.modal = null }
  })
}

// Boss 限时条：血条式倒计时，狂暴变紫、告急闪烁
GameScene.prototype.drawBossBar = function (ctx, v, u, x) {
  const core = this.core
  const sat = this.sm.sat || 0
  const ratio = Math.max(0, Math.min(1, core.bossTimeLeft / (core.bossTimeTotal || 45)))
  const bw = 96 * u
  const bh = 7 * u
  const by = sat + 42 * u
  ctx.textAlign = 'left'
  ctx.fillStyle = core.bossPhase === 2 ? '#C79BFF' : v['--danger']
  ctx.font = 'bold ' + Math.round(11 * u) + 'px sans-serif'
  const urgent = core.bossTimeLeft < 10
  const blink = urgent ? 0.6 + 0.4 * fx.pulse(260) : 1
  ctx.globalAlpha = blink
  ctx.fillText('⏱ ' + Math.ceil(Math.max(0, core.bossTimeLeft)) + 's' + (core.bossPhase === 2 ? ' 狂暴!' : ''), x, by - 4 * u)
  ctx.globalAlpha = 1
  roundRect(ctx, x, by, bw, bh, 3 * u)
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.fill()
  if (ratio > 0.01) {
    ctx.save()
    ctx.shadowColor = core.bossPhase === 2 ? '#C79BFF' : '#FF4D63'
    ctx.shadowBlur = 6
    roundRect(ctx, x, by, bw * ratio, bh, 3 * u)
    ctx.fillStyle = core.bossPhase === 2 ? '#C79BFF' : (urgent ? '#FF6B81' : '#FF4D63')
    ctx.fill()
    ctx.restore()
  }
}

GameScene.prototype.drawSkills = function (ctx, u, W) {
  const self = this
  const uses = this.core.skillUses
  if (!this.skillBtns) {
    this.skillBtns = []
    const defs = [{ k: 'dash', label: '⚡闪现' }, { k: 'insight', label: '👁透视' }]
    for (let i = 0; i < defs.length; i++) {
      ;(function (d) {
        self.skillBtns.push(new Button({
          x: W - 168 * u + i * 44 * u, y: self.capB + 38 * u, w: 40 * u, h: 30 * u,
          label: d.label, fontSize: Math.round(10 * u),
          fill: 'rgba(155,140,255,0.30)', fill2: 'rgba(155,140,255,0.18)', textColor: '#EDEAFF',
          onTap: function () {
            if (self.overlay || self.loading) return
            self.core.useSkill(d.k)
          }
        }))
      })(defs[i])
    }
  }
  const show = uses.dash > 0 || uses.insight > 0 || storage.getSkills().dash || storage.getSkills().insight
  if (!show) return
  this.skillBtns[0].label = '⚡' + uses.dash
  this.skillBtns[0].fill = uses.dash > 0 ? 'rgba(155,140,255,0.30)' : 'rgba(255,255,255,0.08)'
  this.skillBtns[1].label = '👁' + uses.insight
  this.skillBtns[1].fill = uses.insight > 0 ? 'rgba(155,140,255,0.30)' : 'rgba(255,255,255,0.08)'
  this.skillBtns[0].draw(ctx)
  this.skillBtns[1].draw(ctx)
}

GameScene.prototype.drawBag = function (ctx, u) {
  const W = this.sm.W
  const self = this
  if (!this.bagBtns) {
    this.bagBtns = []
    for (let i = 0; i < 3; i++) {
      this.bagBtns.push(new Button({
        x: W - 76 * u, y: this.capB + 76 * u + i * 40 * u, w: 60 * u, h: 34 * u,
        label: '—', fontSize: Math.round(11 * u),
        fill: 'rgba(255,255,255,0.10)', fill2: 'rgba(255,255,255,0.06)', textColor: '#F3F1FF',
        onTap: function () {
          if (self.overlay || self.loading || self.core.bag.length === 0) return
          self.core.useItem(Math.min(self.core.bagSel, self.core.bag.length - 1))
        }
      }))
    }
  }
  const bag = this.core.bag
  // 空背包不绘制：避免 3 个空槽常驻遮挡迷宫；捡到首个道具后槽位自动出现
  if (bag.length === 0) return
  for (let i = 0; i < 3; i++) {
    const b = this.bagBtns[i]
    if (i < bag.length) {
      // 槽位标签用道具字形（隐/冰/速…）+ 数量，底色染道具主题色
      const col = FX_COLOR[bag[i].type] || '#FFC15E'
      b.label = (FX_GLYPH[bag[i].type] || '?') + '×' + bag[i].count
      b.fill = this.hexA2(col, 0.32)
      b.fill2 = this.hexA2(col, 0.16)
      b.textColor = col
    } else {
      b.label = '—'
      b.fill = 'rgba(255,255,255,0.10)'
      b.fill2 = 'rgba(255,255,255,0.06)'
      b.textColor = '#F3F1FF'
    }
    b.draw(ctx)
  }
}

// hex → rgba 字符串（'#RRGGBB' + alpha）
GameScene.prototype.hexA2 = function (hex, a) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'
}

// 右下角小地图：镜头滚动后提供全貌与威胁分布（出口 / 玩家 / 怪物）
GameScene.prototype.drawMinimap = function (ctx, v, u) {
  const core = this.core
  if (!core || !core.maze) return
  const m = core.maze
  const W = this.sm.W, H = this.sm.H
  const mmS = 86 * u
  const mmX = W - 12 * u - mmS
  const mmY = H - 12 * u - mmS
  ctx.save()
  // 底板（半透明圆角）
  roundRect(ctx, mmX, mmY, mmS, mmS, 10 * u)
  ctx.fillStyle = 'rgba(8,10,26,0.60)'
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(255,255,255,0.14)'
  ctx.stroke()
  // 裁剪进圆角
  ctx.save()
  roundRect(ctx, mmX, mmY, mmS, mmS, 10 * u)
  ctx.clip()
  const sx = mmS / m.W
  const sy = mmS / m.H
  // 墙体（淡）
  ctx.fillStyle = 'rgba(255,255,255,0.10)'
  for (let y = 0; y < m.H; y++) {
    for (let x = 0; x < m.W; x++) {
      if (m.grid[y][x] === 1) ctx.fillRect(mmX + x * sx, mmY + y * sy, Math.ceil(sx), Math.ceil(sy))
    }
  }
  // 出口（有钥匙=绿可出，否则金=锁）
  ctx.fillStyle = core.hasKey ? '#6EE7A0' : '#FFD86E'
  ctx.fillRect(mmX + m.end.x * sx - 1, mmY + m.end.y * sy - 1, sx + 2, sy + 2)
  // 怪物
  for (let i = 0; i < core.monsters.length; i++) {
    const mm = core.monsters[i]
    ctx.fillStyle = mm.isBoss ? '#FF4D63' : (mm.chasing ? '#FF7A8A' : 'rgba(255,120,140,0.85)')
    ctx.beginPath()
    ctx.arc(mmX + mm.vx * sx + sx / 2, mmY + mm.vy * sy + sy / 2, Math.max(1.6, sx * 0.6), 0, Math.PI * 2)
    ctx.fill()
  }
  // 玩家（金点）
  ctx.fillStyle = '#FFC15E'
  ctx.beginPath()
  ctx.arc(mmX + core.visual.x * sx + sx / 2, mmY + core.visual.y * sy + sy / 2, Math.max(2.2, sx * 0.75), 0, Math.PI * 2)
  ctx.fill()
  ctx.restore() // clip
  ctx.restore()
}

// 剧情过场面板（UI 2.0：弹性入场 + 卷轴光带 + 立绘浮动）
GameScene.prototype.drawStory = function (ctx, v, u) {
  const W = this.sm.W
  const H = this.sm.H
  const ch = this.story
  if (this.storyT === undefined) {
    this.storyT = 0
    fx.to(this, { storyT: 1 }, 450, { ease: 'easeOutCubic' })
  }
  const t = this.storyT
  ctx.save()
  ctx.fillStyle = 'rgba(5,6,20,' + (0.88 * t) + ')'
  ctx.fillRect(0, 0, W, H)
  const pw = 310 * u
  const ph = 260 * u
  const px = W / 2 - pw / 2
  const py = H * 0.26 + (1 - t) * 26
  const s = 0.92 + 0.08 * t
  ctx.translate(W / 2, py + ph / 2)
  ctx.scale(s, s)
  ctx.translate(-W / 2, -(py + ph / 2))
  // 立绘呼吸光
  const pg = ctx.createRadialGradient(W / 2, py + 44 * u, 0, W / 2, py + 44 * u, 90 * u)
  pg.addColorStop(0, 'rgba(255,193,94,' + (0.10 + 0.05 * fx.pulse(1300)) + ')')
  pg.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = pg
  ctx.fillRect(px - 20, py, pw + 40, ph * 0.45)
  roundRect(ctx, px, py, pw, ph, 22 * u)
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = 26
  ctx.shadowOffsetY = 8
  const g = ctx.createLinearGradient(0, py, 0, py + ph)
  g.addColorStop(0, v['--panel'] || '#241E4A')
  g.addColorStop(1, v['--panel-2'] || '#1B1738')
  ctx.fillStyle = g
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  ctx.strokeStyle = v['--panel-line'] || 'rgba(255,255,255,0.18)'
  ctx.stroke()
  // 顶部装饰线
  const line = ctx.createLinearGradient(px, 0, px + pw, 0)
  line.addColorStop(0, 'rgba(255,193,94,0)')
  line.addColorStop(0.5, '#FFC15E')
  line.addColorStop(1, 'rgba(255,193,94,0)')
  roundRect(ctx, px + 30 * u, py - 1.5, pw - 60 * u, 3, 1.5)
  ctx.fillStyle = line
  ctx.fill()
  ctx.textAlign = 'center'
  ctx.save()
  ctx.translate(0, Math.sin(fx.now / 800) * 3)
  ctx.font = Math.round(30 * u) + 'px sans-serif'
  ctx.fillText(ch.art, W / 2, py + 44 * u)
  ctx.restore()
  ctx.fillStyle = v['--warn']
  ctx.font = 'bold ' + Math.round(19 * u) + 'px sans-serif'
  ctx.fillText(ch.title, W / 2, py + 82 * u)
  ctx.fillStyle = v['--text-sub']
  ctx.font = Math.round(13 * u) + 'px sans-serif'
  for (let i = 0; i < ch.lines.length; i++) {
    ctx.fillText(ch.lines[i], W / 2, py + 118 * u + i * 24 * u)
  }
  this.storyBtn.draw(ctx)
  ctx.restore()
}

// 加载过渡页（M4）：三环旋转封印 + 标题呼吸 + 轮换提示
GameScene.prototype.drawLoading = function (ctx, v, u, W, H) {
  const now = Date.now()
  ctx.save()
  ctx.fillStyle = 'rgba(8,8,26,0.94)'
  ctx.fillRect(0, 0, W, H)
  const cx = W / 2
  const cy = H * 0.38
  // 三环反向旋转
  const rings = [
    { r: 56 * u, w: 3, c: '#FFC15E', sp: 1.4 },
    { r: 42 * u, w: 2, c: '#6FE3D2', sp: -1.9 },
    { r: 30 * u, w: 2, c: '#9B8CFF', sp: 2.6 }
  ]
  for (let i = 0; i < rings.length; i++) {
    const rg = rings[i]
    const seg = Math.PI * 1.2
    const rot = (now / 1000) * rg.sp
    ctx.beginPath()
    ctx.arc(cx, cy, rg.r, rot, rot + seg)
    ctx.strokeStyle = rg.c
    ctx.lineWidth = rg.w
    ctx.lineCap = 'round'
    ctx.stroke()
  }
  // 中心脉动核
  const pulse = 0.5 + 0.5 * Math.sin(now / 240)
  ctx.beginPath()
  ctx.arc(cx, cy, (9 + pulse * 4) * u, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,209,110,' + (0.7 + pulse * 0.3) + ')'
  ctx.fill()
  // 标题呼吸
  const breathe = 1 + 0.04 * Math.sin(now / 420)
  ctx.save()
  ctx.translate(cx, cy + 96 * u)
  ctx.scale(breathe, breathe)
  ctx.textAlign = 'center'
  ctx.fillStyle = v['--warn']
  ctx.font = 'bold ' + Math.round(22 * u) + 'px sans-serif'
  ctx.fillText('无尽地宫', 0, 0)
  ctx.restore()
  // 轮换提示
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(243,241,255,0.72)'
  ctx.font = Math.round(13 * u) + 'px sans-serif'
  ctx.fillText(LOAD_TIPS[this.loading.tipIdx], cx, cy + 132 * u)
  // 流光进度条
  const bw = 180 * u
  const bx = cx - bw / 2
  const by = cy + 152 * u
  roundRect(ctx, bx, by, bw, 6 * u, 3 * u)
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.fill()
  const prog = 1 - Math.max(0, (this.loading.until - now) / 650)
  if (prog > 0.02) {
    roundRect(ctx, bx, by, bw * Math.min(1, prog), 6 * u, 3 * u)
    ctx.fillStyle = '#FFC15E'
    ctx.fill()
  }
  ctx.restore()
}

// DEV 模拟广告页（共用 AdSim 组件）
GameScene.prototype.drawAdSim = function (ctx) {
  this.adSim.draw(ctx)
}

GameScene.prototype.drawOverlay = function (ctx, v, u) {
  const W = this.sm.W
  const H = this.sm.H
  const info = this.overlay.info
  const ov = this.overlay
  ctx.save()
  ctx.fillStyle = 'rgba(5,6,20,' + (0.74 * ov.mt) + ')'
  ctx.fillRect(0, 0, W, H)
  const rect = ov.rect || { px: W / 2 - 150 * u, py: H * 0.32, pw: 300 * u, ph: 190 * u }
  const pw = rect.pw
  const ph = rect.ph
  const px = rect.px
  const py = rect.py
  // 弹性入场
  const s = 0.86 + 0.14 * ov.t
  ctx.translate(W / 2, py + ph / 2)
  ctx.scale(s, s)
  ctx.translate(-W / 2, -(py + ph / 2))
  ctx.globalAlpha = Math.min(1, ov.mt * 1.4)
  // 顶部氛围光
  const glow = ctx.createRadialGradient(W / 2, py, 0, W / 2, py, pw * 0.8)
  glow.addColorStop(0, ov.type === 'win' ? 'rgba(255,209,110,0.16)' : 'rgba(255,90,120,0.13)')
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow
  ctx.fillRect(px - 40, py - 40, pw + 80, ph * 0.7)
  roundRect(ctx, px, py, pw, ph, 20 * u)
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = 22
  ctx.shadowOffsetY = 6
  ctx.fillStyle = ov.type === 'win' ? v['--panel'] : '#3A1626'
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  ctx.lineWidth = 1
  ctx.strokeStyle = ov.type === 'win' ? 'rgba(255,209,110,0.35)' : 'rgba(255,122,146,0.35)'
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.save()
  ctx.shadowColor = ov.type === 'win' ? 'rgba(255,209,110,0.7)' : 'rgba(255,122,146,0.7)'
  ctx.shadowBlur = 12
  ctx.fillStyle = ov.type === 'win' ? v['--warn'] : '#FF7A92'
  ctx.font = 'bold ' + Math.round(22 * u) + 'px sans-serif'
  ctx.fillText(info.title, W / 2, py + 42 * u)
  ctx.restore()
  ctx.fillStyle = v['--text-sub']
  ctx.font = Math.round(13 * u) + 'px sans-serif'
  for (let i = 0; i < info.lines.length; i++) {
    ctx.fillText(info.lines[i], W / 2, py + 76 * u + i * 22 * u)
  }
  for (let i = 0; i < ov.btns.length; i++) ov.btns[i].draw(ctx)
  ctx.restore()
}

module.exports = GameScene
