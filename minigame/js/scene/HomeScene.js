/**
 * 首页场景（UI 3.0：布局与配色重设计）
 * 信息架构：
 *   顶栏（左侧：Logo 锁定组合 + 光尘胶囊；右侧：圆形图标钮[图鉴/挑战码/皮肤/设置]）
 *   → Hero 分区卡（分区色渐变大卡，滑动/箭头/圆点切换，取代 6 Tab 横滚）
 *   → 关卡节点旅程图（圆形节点 + 行内连接线 + 星级）
 *   → 悬浮主 CTA（光晕 + 扫光 + 副标题）
 *   → 底部 Dock（每日/周挑战/排行/补给/生存 5 项竖排图标）
 * 动效：入场编排 / Hero 卡切换滑移 / 网格错落重入场 / 切区粒子
 */
const storage = require('../core/storage')
const theme = require('../core/theme')
const weekly = require('../core/weekly')
const challenge = require('../core/challenge')
const ad = require('../core/ad')
const endless = require('../core/endless')
const festival = require('../core/festival')
const mutation = require('../core/mutation')
const season = require('../core/season')
const checkin = require('../core/checkin')
const ngplus = require('../core/ngplus')
const task = require('../core/task')
const Icons = require('../ui/Icons')
const club = require('../ui/gameclub')
const Modals = require('./Modals')
const Modal = require('../ui/Modal')
const AdSim = require('../ui/AdSim')
const fx = require('../ui/fx')
const Background = require('../ui/Background')
const { Button, roundRect } = require('../ui/Button')
const { drawIcon } = require('../ui/Icons')
const ScrollView = require('../ui/ScrollView')

const UNLOCK_DUST_COST = 30   // 光尘直接解锁价格（与小程序版一致）

// 6 大分区（key/区间与小程序版同源；emoji 为 Hero 氛围图形）
const ZONES = [
  { key: 'forest', name: '入门森林', emoji: '🌲', start: 1, end: 20 },
  { key: 'canyon', name: '迷雾峡谷', emoji: '🌫️', start: 21, end: 40 },
  { key: 'corridor', name: '流光回廊', emoji: '✨', start: 41, end: 60 },
  { key: 'lava', name: '熔岩深渊', emoji: '🔥', start: 61, end: 80 },
  { key: 'star', name: '星海之巅', emoji: '⭐', start: 81, end: 100 },
  { key: 'void', name: '虚空回响', emoji: '🌀', start: 101, end: 120 }
]

// 入口精简：移除「排行」（本机成绩总览，与 Hero 卡/成就数据重复，且不是真排行榜）
const DOCK = [
  { key: 'daily', icon: '📅', label: '每日' },
  { key: 'weekly', icon: '🗓️', label: '周挑战' },
  { key: 'supply', icon: '🛒', label: '补给' },
  { key: 'survival', icon: '💀', label: '生存' },
  { key: 'endless', icon: '🗼', label: '无尽' },
  { key: 'task', icon: '📋', label: '任务' }
]

function HomeScene(sm) {
  this.sm = sm
  this.u = 1
  this.always = true
  this.activeZone = 0
  this.toastMsg = ''
  this.toastUntil = 0
  this.modal = null
  this.bg = new Background()
  this.dock = []
  this.iconBtns = []
}

HomeScene.prototype.enter = function () {
  const u = this.u = this.sm.W / 375
  const W = this.sm.W
  const H = this.sm.H
  const self = this
  const SAT = this.sm.sat || 0
  const SAB = this.sm.sab || 0
  const progress = storage.getProgress()
  this.unlocked = Math.min(progress.unlocked || 1, storage.TOTAL)
  this.completed = progress.completed || {}

  // 入场编排 + 计数/进度
  this.eto = 0
  fx.to(this, { eto: 1 }, 750, { ease: 'easeOutQuint' })
  const dust = storage.getDust()
  this.dustDisp = Math.max(0, dust - Math.min(60, dust))
  fx.to(this, { dustDisp: dust }, 800, { delay: 300, ease: 'easeOutCubic' })
  const zone = ZONES[0]
  const zoneDone = this.zoneDoneCount(0)
  this.progT = zoneDone / 20
  // Hero 卡切换滑移（heroFrom: -1 左入 / 1 右入）
  this.heroT = 1
  this.heroFrom = 1

  // ---- 顶栏：标题 + 光尘 + 今日徽章（左），圆形图标钮（右） ----
  this.iconBtns = []
  const ibD = 28 * u
  const ibGap = 7 * u
  // 光尘胶囊：标题正下方左侧（独立第二行）；右上图标钮与其同一水平线
  const gy = SAT + 28 * u
  this.pillRect = { x: 30 * u, y: gy + 30 * u, w: 84 * u, h: 28 * u }
  // 顶栏只保留 3 枚高频图标钮：图鉴 / 皮肤 / 设置（右→左排列，设置最左）
  ;[
    { key: 'ach', icon: '📖' },
    { key: 'skin', icon: '🎨' },
    { key: 'settings', icon: '⚙️' }
  ].forEach(function (def, i) {
    self.iconBtns.push(new Button({
      x: W - 16 * u - ibD - i * (ibD + ibGap), y: self.pillRect.y, w: ibD, h: ibD,
      label: def.icon, fontSize: Math.round(13 * u), round: true, glass: true,
      fill: 'rgba(255,255,255,0.10)', fill2: 'rgba(255,255,255,0.05)',
      textColor: '#F3F1FF',
      onTap: function () { self.openEntry(def.key) }
    }))
  })
  // 今日徽章：把常驻赛季横幅与签到回看收进顶栏一枚胶囊（回收约 48u 纵向空间）
  this.seasonInfo = season.info()
  this.chk = checkin.info()
  const claimN = (this.seasonInfo.claimable || []).length
  const badgeLabel = !this.chk.signed
    ? ('签到 · Lv.' + this.seasonInfo.level)
    : (claimN > 0 ? ('Lv.' + this.seasonInfo.level + ' · 可领' + claimN) : ('赛季 Lv.' + this.seasonInfo.level))
  this.todayBtn = new Button({
    x: this.pillRect.x + this.pillRect.w + 8 * u, y: this.pillRect.y,
    w: 116 * u, h: 28 * u,
    label: badgeLabel, fontSize: Math.round(10.5 * u), radius: 14 * u, glass: true,
    fill: 'rgba(255,193,94,0.14)', fill2: 'rgba(255,193,94,0.06)',
    textColor: '#FFE0A8',
    onTap: function () { self.openSeason() }
  })
  this.iconBtns.push(this.todayBtn)

  // 游戏圈入口（原生控件）：与顶栏图标行同线；不支持/空间不足静默跳过
  try {
    const cRect = club.rectFor(u, this.pillRect, W - 16 * u - ibD - 2 * (ibD + ibGap))
    this._club = (cRect && club.show(cRect)) ? club : null
  } catch (e) { this._club = null }

  // ---- 底部锚点：Dock → CTA（先算底部，网格高度随之自适应） ----
  const dockY = H - SAB - 12 * u - 56 * u
  // 轮回 NG+：120 关全通后 CTA 升级为轮回入口（主线无前进目标 → 把回访钩子交给周目）
  this.ng = ngplus.info()
  const ngGo = this.ng.unlocked
  this.goBtn = new Button({
    x: W / 2 - 120 * u, y: dockY - 66 * u, w: 240 * u, h: 54 * u,
    label: ngGo ? '⟳ 轮回再临' : '▶ 继续冒险',
    sub: ngGo
      ? (this.ng.cycle > 0
        ? ('第 ' + this.ng.cycle + ' 周目 · ' + this.ng.ngClear + '/120 · 光尘 ×' + this.ng.dustMul)
        : '开启轮回 · 重跑 120 关 · 光尘 ×1.25 起')
      : '第 ' + this.unlocked + ' 关 · ' + this.zoneOf(this.unlocked).name,
    fontSize: Math.round(16 * u),
    fill: '#FFC15E', fill2: '#FF9F6E', textColor: 'rgba(10,12,32,0.92)',
    primary: true, radius: 27 * u,
    onTap: ngGo ? function () { self.openNgPlus() } : function () { self.sm.switch('game', { level: self.unlocked }) }
  })
  this.styleGoBtn()
  this.dock = []
  // Dock 项自适应排布：触摸热区必须 ≥44px（88rpx 规范）；项多时收窄间距兜底
  const padX = 14 * u
  const nDock = DOCK.length
  let gap = 8 * u
  let dw = (W - padX * 2 - (nDock - 1) * gap) / nDock
  if (dw < 44 * u) { gap = 6 * u; dw = (W - padX * 2 - (nDock - 1) * gap) / nDock }
  if (dw < 44 * u) { gap = 4 * u; dw = (W - padX * 2 - (nDock - 1) * gap) / nDock }
  DOCK.forEach(function (d, i) {
    self.dock.push({
      key: d.key, icon: d.icon, label: d.label,
      x: padX + i * (dw + gap), y: dockY, w: dw, h: 56 * u,
      pressT: 0
    })
  })

  // ---- Hero 卡（顶栏内容下方，取按钮行与光尘胶囊下沿较大值再留白） ----
  // Hero 卡：顶栏第二行（胶囊与图标钮同线）下沿再留白
  const clusterBottom = this.pillRect.y + this.pillRect.h
  this.hero = { x: 16 * u, y: clusterBottom + 14 * u, w: W - 32 * u, h: 140 * u }
  // 活动横幅共用 Hero 卡正下方唯一槽位（节日 > 异变 > 签到，三选一互斥）；
  // 赛季信息已收进顶栏「今日徽章」，此处不再常驻占位（回收约 48u 给关卡网格）
  const bannerY = this.hero.y + this.hero.h + 8 * u
  this.festBottom = this.hero.y + this.hero.h + 10 * u
  this.fest = festival.getActive()
  this.festRect = this.fest
    ? { x: 16 * u, y: bannerY, w: W - 32 * u, h: 36 * u }
    : null
  if (this.festRect) this.festBottom = this.festRect.y + this.festRect.h + 8 * u
  // 地宫异变横幅：仅挑战词缀日显示（宁静日不占版面），纯展示不可点
  this.mut = mutation.today()
  this.mutRect = (!this.fest && this.mut && this.mut.mods.length > 0)
    ? { x: 16 * u, y: bannerY, w: W - 32 * u, h: 36 * u }
    : null
  if (this.mutRect) this.festBottom = this.mutRect.y + this.mutRect.h + 8 * u
  // 每日签到横幅：仅未签到时显示，可点；已签到后由顶栏「今日徽章」回看
  this.chkRect = (!this.fest && !(this.mut && this.mut.mods.length > 0) && this.chk && !this.chk.signed)
    ? { x: 16 * u, y: bannerY, w: W - 32 * u, h: 36 * u }
    : null
  if (this.chkRect) this.festBottom = this.chkRect.y + this.chkRect.h + 8 * u
  this.heroSc = new ScrollView({ x: this.hero.x, y: this.hero.y, w: this.hero.w, h: this.hero.h, horizontal: true })
  // 分区切换：左右滑动 + 圆点指示器（反馈：两侧箭头与手势重复且挤占空间，已移除）

  // ---- 关卡节点图（5 列紧凑节点，紧贴圆点下方，高度自适应到 CTA 上沿） ----
  this.gz = { x: 16 * u, y: this.festBottom + 18 * u, w: W - 32 * u }
  this.cols = 5
  this.gap = 8 * u
  this.cw = (this.gz.w - (this.cols - 1) * this.gap) / this.cols
  this.chh = 58 * u
  const rows = Math.ceil(20 / this.cols)
  this.gridSc = new ScrollView({ x: this.gz.x, y: this.gz.y, w: this.gz.w, h: this.goBtn.y - 12 * u - this.gz.y })
  this.gridSc.setContent(rows * this.chh + (rows - 1) * this.gap)
  this.gridAnim = 1

  // 今日任务摘要：进页时缓存一次，避免 drawDock 每帧同步读存储；任务面板关闭时刷新
  this.taskBrief = task.dailyBrief()

  // 首入引导页（onboarding）：未看过引导则自动弹出，关闭后由回调标记 seen
  if (!storage.getTutorialSeen()) {
    const self = this
    this.modal = Modals.showIntro(this.sm, function () {
      self.modal = null
      storage.setTutorialSeen()
    })
  }

  this.touchDown = null
  this.dirty = true

  // 进页自动识别挑战口令
  try {
    wx.getClipboardData({
      success: function (res) {
        const dec = challenge.decode(res.data)
        if (!dec || !dec.level) return
        const code = String(res.data).trim().toUpperCase()
        storage.addCodeHist(code) // 口令历史（E2）
        const names = (dec.mods || []).map(function (mk) {
          for (let j = 0; j < weekly.MODS.length; j++) if (weekly.MODS[j].key === mk) return weekly.MODS[j].name
          return mk
        }).join('+')
        self.modal = new Modal(self.sm, {
          title: '发现挑战口令',
          lines: [
            '口令：' + String(res.data).trim().slice(0, 24),
            '第 ' + dec.level + ' 关 · 词缀：' + (names || '无')
          ],
          buttons: [
            { label: '接受挑战', primary: true, onTap: function () {
              self.modal = null
              self.sm.switch('game', { mode: 'custom', level: dec.level, mods: dec.mods, seed: dec.seed, code: code })
            } },
            { label: '忽略' }
          ]
        })
        self.dirty = true
      }
    })
  } catch (e) {}
}

HomeScene.prototype.zoneOf = function (lv) {
  for (let i = 0; i < ZONES.length; i++) if (lv <= ZONES[i].end) return ZONES[i]
  return ZONES[ZONES.length - 1]
}

HomeScene.prototype.zoneDoneCount = function (zi) {
  const z = ZONES[zi]
  let n = 0
  for (let lv = z.start; lv <= z.end; lv++) if (this.completed[lv]) n++
  return n
}

// 切换分区（dir 决定滑移方向）
HomeScene.prototype.switchZone = function (idx, dir) {
  idx = Math.max(0, Math.min(ZONES.length - 1, idx))
  if (idx === this.activeZone) return
  this.heroFrom = dir || (idx > this.activeZone ? 1 : -1)
  this.activeZone = idx
  this.gridSc.offset = 0
  this.heroT = 0
  fx.to(this, { heroT: 1 }, 340, { ease: 'easeOutCubic' })
  this.gridAnim = 0
  fx.to(this, { gridAnim: 1 }, 420, { ease: 'easeOutQuint' })
  const done = this.zoneDoneCount(idx)
  this.progT = done / 20
  fx.to(this, { progT: done / 20 }, 500, { ease: 'easeOutCubic' })
  const zx = this.hero.x + this.hero.w / 2
  fx.burst(zx, this.hero.y + this.hero.h / 2, { n: 8, colors: [this.zoneColor(idx), '#FFFFFF'], speed: 80, size: 2.2, life: 0.4 })
}

// 入口分发
HomeScene.prototype.openEntry = function (key) {
  const self = this
  if (key === 'daily') {
    this.modal = Modals.showDaily(this.sm, function () {
      self.modal = null
      self.sm.switch('game', { mode: 'daily', level: 30, seed: storage.dailySeed() })
    }, function () { self.modal = null })
  } else if (key === 'weekly') {
    this.modal = Modals.showWeekly(this.sm, function (idx, p) {
      self.modal = null
      self.sm.switch('game', { mode: 'weekly', weekIdx: idx, level: p.level, mods: p.mods, seed: weekly.weekSeed() + idx })
    }, function () { self.modal = null })
  } else if (key === 'ach') {
    // 图鉴升为主入口：收集系统独立直达，成就 / 伙伴 / 手记收进图鉴分组
    this.modal = Modals.showCodex(this.sm, function () { self.modal = null })
  } else if (key === 'skin') {
    this.modal = Modals.showSkin(this.sm, function () { self.modal = null })
  } else if (key === 'settings') {
    this.modal = Modals.showSettings(this.sm, function () { self.modal = null })
  } else if (key === 'supply') {
    this.modal = Modals.showSupply(this.sm, function () { self.modal = null })
  } else if (key === 'endless') {
    if (!endless.isUnlocked()) {
      this.sm.toast('通关全部 120 关后解锁无尽塔')
      return
    }
    this.modal = Modals.showEndless(this.sm, function () {
      self.modal = null
      self.sm.switch('game', { mode: 'endless', floor: 1 })
    }, function () { self.modal = null })
  } else if (key === 'survival') {
    if (!storage.getFlag('survTut')) {
      // 首次进入：玩法说明
      const st = storage.getStats()
      this.modal = new Modal(this.sm, {
        title: '生存模式 · 玩法',
        lines: [
          { t: '🌊 无尽波次生存战：不被怪物抓住，撑到的波数越多越强。', b: true, s: 13 },
          { t: '' },
          { t: '· 开局 3 秒准备，随后第 1 波来袭', s: 12 },
          { t: '· 每波比上一波多 1 只追击怪，第 4 波起出现会射击的狙击手', s: 12 },
          { t: '· 每波限时 20+4n 秒，倒计时归零立即刷新下一波（怪不清空，越积越多）', s: 12 },
          { t: '· 波与波之间在迷宫刷新一个随机道具，右下角背包 3 格、点按使用', s: 12 },
          { t: '· 迷雾全程开启，沿途光尘别错过（补给站强化永久生效）', s: 12 },
          { t: '· 被抓住即结束（可复活一次），成绩 = 撑到的波数', s: 12 },
          { t: '' },
          st.bestWave
            ? { t: '🏆 你的最佳纪录：第 ' + st.bestWave + ' 波', c: '#FFC15E', b: true }
            : { t: '尚无纪录，来创造第一个！', c: '#6FE3D2', b: true }
        ],
        buttons: [
          { label: '开始挑战', primary: true, onTap: function () {
            storage.setFlag('survTut')
            self.modal = null
            self.sm.switch('game', { mode: 'survival', level: 30 })
          } },
          { label: '返回' }
        ],
        onClose: function () { self.modal = null }
      })
    } else {
      this.sm.switch('game', { mode: 'survival', level: 30 })
    }
  } else if (key === 'task') {
    this.modal = require('./TaskPanel').build(this.sm, function () {
      self.modal = null
      self.taskBrief = task.dailyBrief() // 领奖/查看后刷新 Dock 进度
    })
  }
}

// 节日限时活动入口（N12）：胶囊点击 → 活动弹窗 → 进入活动关
HomeScene.prototype.openFest = function () {
  if (!this.fest) return
  const self = this
  this.modal = Modals.showFestival(this.sm, function (idx) {
    self.modal = null
    self.sm.switch('game', { mode: 'festival', fest: self.fest, festIdx: idx })
  }, function () { self.modal = null })
}

HomeScene.prototype.inFestPill = function (tx, ty) {
  const r = this.festRect
  if (!r) return false
  const pad = 8 * this.u // 上下外扩扩大热区
  return tx >= r.x && tx <= r.x + r.w && ty >= r.y - pad && ty <= r.y + r.h + pad
}

// 节日限时活动横幅（N12）：Hero 卡正下方的全宽活动条，活动期间显示
HomeScene.prototype.drawFestBanner = function (ctx, v) {
  if (!this.fest || !this.festRect) return
  const u = this.u
  const e = this.ent(2)
  if (e <= 0) return
  const r = this.festRect
  ctx.save()
  ctx.globalAlpha = e
  ctx.translate(0, (1 - e) * 10)
  const pulse = 0.5 + 0.5 * fx.pulse(1600, 0)
  // 卡底：暖橙玻璃 + 柔光
  roundRect(ctx, r.x, r.y, r.w, r.h, 18 * u)
  const bg = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h)
  bg.addColorStop(0, 'rgba(255,138,61,' + (0.20 + 0.05 * pulse) + ')')
  bg.addColorStop(1, 'rgba(255,210,63,' + (0.10 + 0.04 * pulse) + ')')
  ctx.fillStyle = bg
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(255,210,63,' + (0.45 + 0.25 * pulse) + ')'
  ctx.stroke()
  // 左侧圆徽：有矢量图标用矢量（清晰稳定），否则退回系统 emoji
  const cx = r.x + 26 * u
  const cy = r.y + r.h / 2
  ctx.beginPath()
  ctx.arc(cx, cy, 15 * u, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,225,170,0.16)'
  ctx.fill()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (this.fest.iconKey) {
    Icons.drawIcon(ctx, this.fest.iconKey, cx, cy + 1, 17 * u, '#FF8A2A')
  } else {
    ctx.font = Math.round(17 * u) + 'px sans-serif'
    ctx.fillText(this.fest.emoji, cx, cy + 1)
  }
  // 活动名 + 副语
  ctx.textAlign = 'left'
  ctx.fillStyle = '#FFE9A8'
  ctx.font = 'bold ' + Math.round(14 * u) + 'px sans-serif'
  ctx.fillText(this.fest.name + ' · 限时活动', r.x + 50 * u, r.y + r.h / 2 - 6 * u)
  ctx.fillStyle = 'rgba(255,233,168,0.62)'
  ctx.font = Math.round(9.5 * u) + 'px sans-serif'
  ctx.fillText(this.fest.tagline, r.x + 50 * u, r.y + r.h / 2 + 9 * u)
  // 右侧 CTA
  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(255,233,168,' + (0.70 + 0.30 * pulse) + ')'
  ctx.font = 'bold ' + Math.round(12.5 * u) + 'px sans-serif'
  ctx.fillText('进入 ›', r.x + r.w - 16 * u, r.y + r.h / 2 + 1)
  ctx.textBaseline = 'alphabetic'
  ctx.restore()
}

// 地宫异变横幅：今日词缀 + 光尘补偿提示（纯展示，不可点；节日活动期间让位隐藏）
HomeScene.prototype.drawMutBanner = function (ctx, v) {
  if (!this.mutRect || !this.mut) return
  const u = this.u
  const e = this.ent(2)
  if (e <= 0) return
  const r = this.mutRect
  ctx.save()
  ctx.globalAlpha = e
  ctx.translate(0, (1 - e) * 10)
  const pulse = 0.5 + 0.5 * fx.pulse(1800, 0)
  roundRect(ctx, r.x, r.y, r.w, r.h, 18 * u)
  ctx.fillStyle = 'rgba(155,140,255,' + (0.14 + 0.05 * pulse) + ')'
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = this.mut.color
  ctx.stroke()
  // 左侧圆徽：四芒星矢量图标，异变主色
  const cx = r.x + 26 * u
  const cy = r.y + r.h / 2
  ctx.beginPath()
  ctx.arc(cx, cy, 15 * u, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(200,190,255,0.18)'
  ctx.fill()
  Icons.drawIcon(ctx, 'spark', cx, cy + 1, 16 * u, this.mut.color)
  // 异变名 + 补偿说明
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#DCD6FF'
  ctx.font = 'bold ' + Math.round(14 * u) + 'px sans-serif'
  ctx.fillText('⚗ ' + this.mut.name, r.x + 50 * u, r.y + r.h / 2 - 6 * u)
  ctx.fillStyle = 'rgba(220,214,255,0.62)'
  ctx.font = Math.round(9.5 * u) + 'px sans-serif'
  const xpNote = season.mutationXp(this.mut)
  ctx.fillText(this.mut.desc + (xpNote > 0 ? ' · 赛季XP+' + xpNote : ''), r.x + 50 * u, r.y + r.h / 2 + 9 * u)
  ctx.textBaseline = 'alphabetic'
  ctx.restore()
}

// 每日签到横幅：未签到时显示今日可得 + 连续天数，点击打开签到弹窗（节日/异变优先让位）
HomeScene.prototype.drawChkBanner = function (ctx, v) {
  if (!this.chkRect || !this.chk || this.chk.signed) return
  const u = this.u
  const e = this.ent(2)
  if (e <= 0) return
  const r = this.chkRect
  ctx.save()
  ctx.globalAlpha = e
  ctx.translate(0, (1 - e) * 10)
  const pulse = 0.5 + 0.5 * fx.pulse(1700, 0.6)
  roundRect(ctx, r.x, r.y, r.w, r.h, 18 * u)
  const bg = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h)
  bg.addColorStop(0, 'rgba(255,180,110,' + (0.18 + 0.05 * pulse) + ')')
  bg.addColorStop(1, 'rgba(255,212,138,' + (0.10 + 0.04 * pulse) + ')')
  ctx.fillStyle = bg
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(255,180,110,' + (0.45 + 0.25 * pulse) + ')'
  ctx.stroke()
  // 左侧圆徽：四芒星矢量（与异变同款图标，暖金色区分）
  const cx = r.x + 26 * u
  const cy = r.y + r.h / 2
  ctx.beginPath()
  ctx.arc(cx, cy, 15 * u, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,226,184,0.18)'
  ctx.fill()
  Icons.drawIcon(ctx, 'spark', cx, cy + 1, 16 * u, '#FFB46E')
  // 签到主文案 + 连续进度
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#FFE2B8'
  ctx.font = 'bold ' + Math.round(14 * u) + 'px sans-serif'
  ctx.fillText('每日签到 · +' + this.chk.todayDust + ' 光尘', r.x + 50 * u, r.y + r.h / 2 - 6 * u)
  ctx.fillStyle = 'rgba(255,226,184,0.62)'
  ctx.font = Math.round(9.5 * u) + 'px sans-serif'
  const nx = this.chk.nextMs
  ctx.fillText(this.chk.streak > 0
    ? ('已连签 ' + this.chk.streak + ' 天 · ' + (nx ? nx.label + ' 还差 ' + nx.left + ' 天' : '里程碑全达成'))
    : (nx ? '连签 ' + nx.day + ' 天得 ' + nx.label : '坚持签到有厚礼'), r.x + 50 * u, r.y + r.h / 2 + 9 * u)
  // 右侧 CTA
  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(255,226,184,' + (0.70 + 0.30 * pulse) + ')'
  ctx.font = 'bold ' + Math.round(12.5 * u) + 'px sans-serif'
  ctx.fillText('签到 ›', r.x + r.w - 16 * u, r.y + r.h / 2 + 1)
  ctx.textBaseline = 'alphabetic'
  ctx.restore()
}

// 签到横幅热区（上下外扩扩大热区）
HomeScene.prototype.inChkRect = function (tx, ty) {
  const r = this.chkRect
  if (!r || !this.chk || this.chk.signed) return false
  const pad = 8 * this.u
  return tx >= r.x && tx <= r.x + r.w && ty >= r.y - pad && ty <= r.y + r.h + pad
}

// 签到弹窗：关闭/签到后刷新横幅状态与光尘显示
HomeScene.prototype.openCheckin = function () {
  const self = this
  this.modal = Modals.showCheckin(this.sm, function () {
    self.modal = null
    self.chk = checkin.info()
    self.chkRect = (self.chk && !self.chk.signed && !self.fest && !(self.mut && self.mut.mods.length > 0))
      ? self.chkRect : null
    self.dustDisp = storage.getDust() // 签到所得直接就位（不重播入场动画）
    self.dirty = true
  })
}

// 今日徽章入口：打开赛季领奖面板（面板内含签到回看，一处收口两个回访钩子）
HomeScene.prototype.openSeason = function () {
  const self = this
  this.modal = Modals.showSeason(this.sm, function () {
    self.modal = null
    self.seasonInfo = season.info() // 领取后刷新徽章等级 / 可领数
    // 面板内可能完成签到，关闭时一并重读签到态与光尘（避免横幅残留）
    self.chk = checkin.info()
    self.chkRect = (self.chk && !self.chk.signed && !self.fest && !(self.mut && self.mut.mods.length > 0))
      ? self.chkRect : null
    self.dustDisp = storage.getDust()
    self.dirty = true
  })
}

// 轮回入口：未开启/周目完成 → 确认弹窗（开启或进入下一周目）；周目进行中 → 直接续跑第 1 关
HomeScene.prototype.openNgPlus = function () {
  const self = this
  const ng = ngplus.info()
  if (ng.cycle > 0 && !ng.cycleDone) {
    this.sm.switch('game', { mode: 'level', level: 1 })
    return
  }
  this.modal = Modals.showNgPlus(this.sm, function () {
    const r = ngplus.enterNext()
    self.modal = null
    if (!r.ok) { self.sm.toast('尚未通关全部 120 关'); return }
    const name = r.got.map(function (g) {
      return g.kind === 'title' ? '称号「' + g.n + '」' : ('碎片 ×' + g.n)
    }).join(' · ')
    self.sm.toast('⟳ 第 ' + r.cycle + ' 轮回开启' + (name ? ' · ' + name : ''))
    self.sm.switch('game', { mode: 'level', level: 1 })
  })
}

HomeScene.prototype.showToast = function (msg) {
  this.toastMsg = msg
  this.toastUntil = Date.now() + 1600
  this.toastT = 0
  fx.to(this, { toastT: 1 }, 200, { ease: 'easeOutCubic' })
  this.dirty = true
}

HomeScene.prototype.vars = function () {
  return theme.getTheme(storage.getTheme()).vars
}

HomeScene.prototype.zoneColor = function (zi) {
  return theme.getTheme(storage.getTheme()).zones[zi]
}

// CTA 配色跟随目标分区色（与 Hero 卡/节点图/圆点同源，消除固定橙色的割裂感）
// 语义锚定「继续冒险要进的分区」（unlocked 所在区），与按钮副标题文案一致
HomeScene.prototype.styleGoBtn = function () {
  if (!this.goBtn) return
  // 轮回入口：固定轮回紫（与词缀 banner 同色系，语义区分主线 CTA）
  if (this.ng && this.ng.unlocked) {
    this.goBtn.fill = '#E36BFF'
    this.goBtn.fill2 = '#9646B3'
    this.goBtn.textColor = 'rgba(18,8,30,0.92)'
    return
  }
  const zi = Math.max(0, ZONES.indexOf(this.zoneOf(this.unlocked)))
  const zc = this.zoneColor(zi)
  if (zc && zc.charAt(0) === '#') {
    // 第二渐变stop：向暗部收 34%，保证 primary 光晕与扫光有层次
    const dr = (parseInt(zc.slice(1, 3), 16) * 0.66) | 0
    const dg = (parseInt(zc.slice(3, 5), 16) * 0.66) | 0
    const db = (parseInt(zc.slice(5, 7), 16) * 0.66) | 0
    this.goBtn.fill = zc
    this.goBtn.fill2 = 'rgb(' + dr + ',' + dg + ',' + db + ')'
  } else {
    this.goBtn.fill = zc || '#FFC15E'
    this.goBtn.fill2 = zc || '#FF9F6E'
  }
  this.goBtn.textColor = 'rgba(10,12,32,0.92)'
}

// 入场编排：区段 i 的局部进度
HomeScene.prototype.ent = function (i) {
  const p = Math.max(0, Math.min(1, this.eto * 1.55 - i * 0.15))
  return fx.E.easeOutCubic(p)
}

/* ---------- 触摸 ---------- */

HomeScene.prototype.onTouchStart = function (tx, ty) {
  if (this.adSim) return // 模拟广告页吞掉触摸
  if (this.modal) { this.modal.onTouchStart(tx, ty); return }
  this.touchDown = { x: tx, y: ty, t: Date.now() }
  for (let i = 0; i < this.iconBtns.length; i++) this.iconBtns[i].touch(tx, ty, true)
  this.goBtn.touch(tx, ty, true)
  for (let i = 0; i < this.dock.length; i++) {
    const d = this.dock[i]
    if (tx >= d.x - 4 && tx <= d.x + d.w + 4 && ty >= d.y - 4 && ty <= d.y + d.h + 4) {
      fx.to(d, { pressT: 1 }, 70)
      this._dockDown = i
    }
  }
  if (this.gridSc.hit(tx, ty)) this.gridSc.touchStart(tx, ty)
}

HomeScene.prototype.onTouchMove = function (tx, ty) {
  if (this.adSim) return
  if (this.modal) { this.modal.onTouchMove(tx, ty); return }
  if (this.gridSc.dragging) { this.gridSc.touchMove(tx, ty); this.gridSc.lastScrollAt = Date.now() }
}

HomeScene.prototype.onTouchEnd = function (tx, ty) {
  if (this.adSim) return
  if (this.modal) { this.modal.onTouchEnd(tx, ty); return }
  for (let i = 0; i < this.iconBtns.length; i++) this.iconBtns[i].touch(tx, ty, false)
  this.goBtn.touch(tx, ty, false)
  // Dock：按下与松起落在同一项才触发
  for (let i = 0; i < this.dock.length; i++) {
    const d = this.dock[i]
    fx.to(d, { pressT: 0 }, 170, { ease: 'easeOutBack' })
    if (this._dockDown === i &&
        tx >= d.x - 4 && tx <= d.x + d.w + 4 && ty >= d.y - 4 && ty <= d.y + d.h + 4) {
      this.openEntry(d.key)
    }
  }
  this._dockDown = -1
  // Hero 横滑切区
  if (this.touchDown && this.inHero(tx, ty)) {
    const dx = tx - this.touchDown.x
    const dy = ty - this.touchDown.y
    if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      this.switchZone(this.activeZone + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1)
    } else if (this.isTap(tx, ty)) {
      // 圆点指示器点按
      this.tapDots(tx, ty)
    }
  }
  if (this.gridSc.dragging) {
    this.gridSc.touchEnd()
    if (this.isTap(tx, ty)) this.tapGrid(tx, ty)
  }
  // 节日限时活动胶囊（N12）
  if (this.touchDown && this.isTap(tx, ty) && this.inFestPill(tx, ty)) {
    this.openFest()
  }
  // 每日签到横幅（可点）
  if (this.touchDown && this.isTap(tx, ty) && this.inChkRect(tx, ty)) {
    this.openCheckin()
  }
  this.touchDown = null
}

HomeScene.prototype.inHero = function (tx, ty) {
  const h = this.hero
  return tx >= h.x && tx <= h.x + h.w && ty >= h.y && ty <= h.y + h.h
}

HomeScene.prototype.isTap = function (tx, ty) {
  if (!this.touchDown) return false
  const dx = tx - this.touchDown.x
  const dy = ty - this.touchDown.y
  return Math.sqrt(dx * dx + dy * dy) < 8 && Date.now() - this.touchDown.t < 350
}

// 圆点指示器（Hero 卡下方）
HomeScene.prototype.dotsRect = function () {
  const u = this.u
  const n = ZONES.length
  const dw = 8 * u
  const gap = 6 * u
  const total = n * dw + (n - 1) * gap
  // 活动横幅存在时，圆点行随之下移（横幅下方 10u）
  return { x: this.sm.W / 2 - total / 2, y: this.festBottom + 0 * u, dw: dw, gap: gap, n: n }
}

HomeScene.prototype.tapDots = function (tx, ty) {
  const d = this.dotsRect()
  if (ty < d.y - 6 || ty > d.y + d.dw + 6) return
  for (let i = 0; i < d.n; i++) {
    const x0 = d.x + i * (d.dw + d.gap)
    if (tx >= x0 - d.gap / 2 && tx <= x0 + d.dw + d.gap / 2) {
      this.switchZone(i, i > this.activeZone ? 1 : -1)
      return
    }
  }
}

HomeScene.prototype.tapGrid = function (tx, ty) {
  const g = this.gz
  if (tx < g.x || tx > g.x + g.w || ty < g.y || ty > g.y + this.gridSc.h) return
  const col = Math.floor((tx - g.x) / (this.cw + this.gap))
  const localY = ty - g.y + this.gridSc.offset
  const row = Math.floor(localY / (this.chh + this.gap))
  const inCellY = localY - row * (this.chh + this.gap)
  if (col < 0 || col >= this.cols || row < 0 || row >= Math.ceil(20 / this.cols) || inCellY > this.chh) return
  const zone = ZONES[this.activeZone]
  const lv = zone.start + row * this.cols + col
  if (lv > zone.end) return
  if (lv > this.unlocked) {
    if (lv === this.unlocked + 1) {
      // 下一待解锁关：广告/光尘解锁面板（防跳关，仅开放此关）
      fx.burst(tx, ty, { n: 8, colors: ['#FFD86E'], speed: 70, size: 2.2, life: 0.4 })
      this.openUnlock(lv)
    } else {
      this.showToast('请先解锁前面的关卡')
      fx.burst(tx, ty, { n: 5, colors: ['#8A8FA8'], speed: 50, size: 2, life: 0.3 })
    }
    return
  }
  fx.burst(tx, ty, { n: 12, colors: [this.zoneColor(this.activeZone), '#FFD86E'], speed: 110, size: 2.6 })
  this.sm.switch('game', { level: lv })
}

// 解锁成功后的本地刷新（unlocked / CTA 副标题 / 网格重入场）
HomeScene.prototype.refreshUnlock = function () {
  const prev = this.unlocked
  this.unlocked = Math.min(storage.getProgress().unlocked, storage.TOTAL)
  if (this.unlocked === prev) return
  if (this.goBtn) {
    this.goBtn.label = '▶ 继续冒险'
    this.goBtn.sub = '第 ' + this.unlocked + ' 关 · ' + this.zoneOf(this.unlocked).name
    this.styleGoBtn()
  }
  const zoneIdx = ZONES.indexOf(this.zoneOf(this.unlocked))
  if (zoneIdx >= 0 && zoneIdx !== this.activeZone) this.activeZone = zoneIdx
  this.progT = this.zoneDoneCount(this.activeZone) / 20
  this.gridAnim = 0
  fx.to(this, { gridAnim: 1 }, 560, { ease: 'easeOutCubic' })
}

// 关卡解锁面板（广告整合 v2）：看广告免费 / 光尘直购，仅对下一待解锁关开放
HomeScene.prototype.openUnlock = function (lv) {
  const self = this
  if (this.modal || this.adSim) return
  const succeed = function () {
    storage.adUnlockTo(lv)
    self.modal = null
    self.refreshUnlock()
    self.showToast('已解锁第 ' + lv + ' 关')
    fx.burst(self.sm.W / 2, self.gz.y + 40 * self.u, { n: 16, colors: ['#FFD86E', '#6FE3D2'], speed: 130, size: 2.8 })
  }
  const finish = function (ok, why) {
    self._unlockBusy = false
    if (!ok) {
      if (why === 'daily') self.showToast('今日广告次数已达上限（' + ad.DAILY_LIMIT + ' 次/日）')
      else if (why === 'interval') self.showToast('操作太频繁，请 ' + ad.freqState().nextInSec + ' 秒后再试')
      else self.showToast('广告未看完，未能解锁')
      return
    }
    succeed()
  }
  const watchAd = function () {
    if (self._unlockBusy) return
    self._unlockBusy = true
    const handled = ad.showRewarded(finish)
    if (!handled) { ad.recordShown(); self.adSim = new AdSim(self.sm, finish, '解锁第 ' + lv + ' 关') }
  }
  const buyDust = function () {
    if (storage.spendDust(UNLOCK_DUST_COST)) succeed()
    else self.showToast('光尘不足（需 ' + UNLOCK_DUST_COST + '✦）')
  }
  this.modal = new Modal(this.sm, {
    title: '解锁第 ' + lv + ' 关',
    lines: [
      { t: '该关卡尚未通关解锁，可选择：', s: 13 },
      { t: '', gap: true },
      { t: '▶ 观看一段广告，免费立即解锁', c: '#FFD86E', b: true, s: 12.5 },
      { t: '今日剩余广告次数 ' + ad.freqState().remain + '/' + ad.DAILY_LIMIT, c: '#9AA0C8', s: 10.5 },
      { t: '✦ 花费 ' + UNLOCK_DUST_COST + ' 光尘直接解锁（通关/每日获取，不可充值）', c: '#9AA0C8', s: 11.5 }
    ],
    buttons: (function () {
      const arr = [
        { label: '看广告解锁', primary: true, onTap: watchAd },
        { label: UNLOCK_DUST_COST + '✦ 解锁', onTap: buyDust }
      ]
      const unlockCoupon = storage.getCoupons().unlock || 0
      if (unlockCoupon > 0) arr.push({
        label: '解锁券×' + unlockCoupon,
        onTap: function () {
          if (storage.spendCoupon('unlock')) succeed()
          else self.showToast('解锁券不足')
        }
      })
      arr.push({ label: '取消' })
      return arr
    })(),
    onClose: function () { self.modal = null }
  })
}

/* ---------- 帧更新 ---------- */

HomeScene.prototype.exit = function () {
  // 游戏圈原生按钮浮于 Canvas 之上：离场必须销毁，否则残留到下一场景
  if (this._club) { this._club.destroy(); this._club = null }
}

HomeScene.prototype.update = function (dt) {
  // 游戏圈原生按钮显隐同步：弹窗/广告模拟/转场期间隐藏（原生控件盖在 Canvas 上）
  if (this._club) {
    const blocked = !!(this.modal || this.adSim || this.sm.trans)
    if (blocked) this._club.hide(); else this._club.reveal()
  }
  if (this.adSim) {
    if (this.adSim.update()) this.adSim = null
    return
  }
  if (this.modal) {
    this.modal.update()
    if (this.modal.dirty) this.dirty = true
    return
  }
  // CTA 配色与进度/皮肤联动（换肤或进度变化后的下一帧自动对齐）
  const goKey = this.unlocked + ':' + storage.getTheme()
  if (goKey !== this._goKey) { this._goKey = goKey; this.styleGoBtn() }
  const scrolling = this.gridSc.update(dt)
  const toasting = Date.now() < this.toastUntil + 300
  if (scrolling || toasting) this.dirty = true
}

/* ---------- 绘制 ---------- */

HomeScene.prototype.draw = function (ctx) {
  const v = this.vars()
  const W = this.sm.W
  const H = this.sm.H
  if (this.adSim) { this.adSim.draw(ctx); return }
  ctx.save()
  this.bg.draw(ctx, W, H, v, 1 / 60, 0)
  this.drawTopBar(ctx, v)
  this.drawHero(ctx, v)
  this.drawFestBanner(ctx, v)
  this.drawMutBanner(ctx, v)
  this.drawChkBanner(ctx, v)
  this.drawDots(ctx, v)
  this.drawGrid(ctx, v)
  this.goBtn.draw(ctx)
  this.drawDock(ctx, v)
  if (this.modal) this.modal.draw(ctx)
  // Toast 必须画在弹窗之上：行卡购买等操作的反馈不能被弹窗盖住
  this.drawToast(ctx)
  ctx.restore()
}

// 顶栏：Logo 锁定组合 + 圆形图标钮 + 光尘胶囊
HomeScene.prototype.drawTopBar = function (ctx, v) {
  const u = this.u
  const W = this.sm.W
  const SAT = this.sm.sat || 0
  const e = this.ent(0)
  if (e <= 0) return
  ctx.save()
  ctx.globalAlpha = e
  ctx.translate(0, (1 - e) * 14)

  // Logo：菱形宝石 + 字标
  const gx = 30 * u
  const gy = SAT + 28 * u
  ctx.save()
  ctx.translate(gx, gy)
  ctx.rotate(Math.PI / 4)
  const dg = ctx.createLinearGradient(-7 * u, -7 * u, 7 * u, 7 * u)
  dg.addColorStop(0, '#FFE7B8')
  dg.addColorStop(1, '#FF9F6E')
  ctx.fillStyle = dg
  ctx.shadowColor = 'rgba(255,193,94,0.6)'
  ctx.shadowBlur = 8
  roundRect(ctx, -6 * u, -6 * u, 12 * u, 12 * u, 3 * u)
  ctx.fill()
  ctx.restore()
  // 字标（渐变）
  ctx.textAlign = 'left'
  const tg = ctx.createLinearGradient(46 * u, 0, 150 * u, 0)
  tg.addColorStop(0, '#FFE7B8')
  tg.addColorStop(1, v['--warn'] || '#FFC15E')
  ctx.fillStyle = tg
  ctx.font = 'bold ' + Math.round(20 * u) + 'px sans-serif'
  ctx.fillText('无尽地宫', 46 * u, gy + 2 * u)
  ctx.globalAlpha = e * 0.42
  ctx.fillStyle = v['--text-sub']
  ctx.font = Math.round(7.5 * u) + 'px sans-serif'
  ctx.fillText('E N D L E S S   D U N G E O N', 47 * u, gy + 17 * u)
  ctx.globalAlpha = e

  // 光尘胶囊
  const p = this.pillRect
  roundRect(ctx, p.x, p.y, p.w, p.h, p.h / 2)
  ctx.fillStyle = v['--pill'] || 'rgba(255,255,255,0.10)'
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = v['--pill-line'] || 'rgba(255,255,255,0.18)'
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.save()
  ctx.shadowColor = v['--accent']
  ctx.shadowBlur = 6
  ctx.fillStyle = v['--accent']
  ctx.font = 'bold ' + Math.round(14 * u) + 'px sans-serif'
  ctx.fillText('✦ ' + Math.round(this.dustDisp), p.x + p.w / 2 + 3 * u, p.y + p.h / 2 + 1)
  ctx.restore()

  // 圆形图标钮
  for (let i = 0; i < this.iconBtns.length; i++) this.iconBtns[i].draw(ctx)
  ctx.restore()
}

// Hero 分区大卡
HomeScene.prototype.drawHero = function (ctx, v) {
  const u = this.u
  const e = this.ent(1)
  if (e <= 0) return
  const h = this.hero
  const zone = ZONES[this.activeZone]
  const zc = this.zoneColor(this.activeZone)
  const locked = zone.start > this.unlocked
  ctx.save()
  ctx.globalAlpha = e
  ctx.translate(0, (1 - e) * 14)

  // 切换滑移（整卡位移 + 淡入）
  if (this.heroT < 1) {
    const slide = (1 - this.heroT) * 46 * u * this.heroFrom
    ctx.translate(slide, 0)
    ctx.globalAlpha = e * (0.35 + 0.65 * this.heroT)
  }

  // 卡底：分区色柔光渐变（去硬描边，双色光晕 + 顶部高光）
  roundRect(ctx, h.x, h.y, h.w, h.h, 22 * u)
  ctx.save()
  ctx.shadowColor = this.hexA(zc, 0.55)
  ctx.shadowBlur = 22 * this.heroT
  ctx.shadowOffsetY = 5
  const cg = ctx.createLinearGradient(h.x, h.y, h.x + h.w * 0.35, h.y + h.h)
  cg.addColorStop(0, this.hexA(zc, 0.38))
  cg.addColorStop(0.6, this.hexA(zc, 0.16))
  cg.addColorStop(1, this.hexA(zc, 0.07))
  ctx.fillStyle = cg
  ctx.fill()
  ctx.restore()

  // 斜向光带 ×2 + 顶部高光线（柔和质感）
  ctx.save()
  roundRect(ctx, h.x, h.y, h.w, h.h, 22 * u)
  ctx.clip()
  ctx.globalAlpha = e * 0.07
  ctx.fillStyle = '#FFFFFF'
  ctx.save()
  ctx.translate(h.x + h.w * 0.25, h.y)
  ctx.rotate(-0.5)
  ctx.fillRect(0, -40, 26 * u, h.h + 120)
  ctx.translate(64 * u, 0)
  ctx.fillRect(0, -40, 10 * u, h.h + 120)
  ctx.restore()
  // 大 Emoji 氛围图形
  ctx.globalAlpha = e * 0.17
  ctx.font = Math.round(66 * u) + 'px sans-serif'
  ctx.textAlign = 'right'
  ctx.fillStyle = zc
  ctx.fillText(zone.emoji, h.x + h.w - 50 * u, h.y + h.h - 22 * u)
  // 顶部高光弧线
  ctx.globalAlpha = e * 0.16
  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(h.x + 26 * u, h.y + 1.5 * u)
  ctx.lineTo(h.x + h.w - 26 * u, h.y + 1.5 * u)
  ctx.stroke()
  // 流动高光（沿顶边缓慢扫过，裁剪在卡内）
  const sweep = (Math.sin(Date.now() / 1500) + 1) / 2
  ctx.globalAlpha = e * 0.16
  ctx.fillStyle = '#FFFFFF'
  roundRect(ctx, h.x + 18 * u + sweep * (h.w - 76 * u), h.y + 0.6 * u, 40 * u, 2.4 * u, 1.2 * u)
  ctx.fill()
  ctx.restore()

  // 文案
  ctx.textAlign = 'left'
  ctx.fillStyle = v['--text']
  ctx.font = 'bold ' + Math.round(22 * u) + 'px sans-serif'
  ctx.fillText(zone.name, h.x + 22 * u, h.y + 30 * u)
  ctx.fillStyle = v['--text-sub']
  ctx.font = Math.round(11 * u) + 'px sans-serif'
  ctx.fillText('第 ' + zone.start + ' – ' + zone.end + ' 关 · 20 个关卡', h.x + 22 * u, h.y + 48 * u)

  // 进度条（内缩到左右箭头之间，避免遮挡）+ 计数
  const bx0 = h.x + 56 * u
  const bw = h.w - 112 * u
  const by = h.y + 90 * u
  roundRect(ctx, bx0, by, bw, 5 * u, 2.5 * u)
  ctx.fillStyle = 'rgba(0,0,0,0.28)'
  ctx.fill()
  if (this.progT > 0.004) {
    ctx.save()
    ctx.shadowColor = zc
    ctx.shadowBlur = 7
    roundRect(ctx, bx0, by, Math.max(5 * u, bw * this.progT), 5 * u, 2.5 * u)
    ctx.fillStyle = zc
    ctx.fill()
    ctx.restore()
  }
  const done = this.zoneDoneCount(this.activeZone)
  ctx.fillStyle = v['--text-sub']
  ctx.font = Math.round(10.5 * u) + 'px sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText('已通关 ' + done + '/20', h.x + h.w - 56 * u, by + 18 * u)

  // 怪物伙伴（N8）：结伴的怪物在卡上随行轻晃（纯展示）
  const partner = storage.getPartner()
  if (partner) {
    ctx.save()
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.globalAlpha = e * 0.95
    ctx.font = Math.round(17 * u) + 'px sans-serif'
    ctx.fillText(partner.meta.emoji, h.x + 24 * u, by + 3 * u + Math.sin(Date.now() / 420) * 1.6 * u)
    ctx.restore()
  }

  // 徽章：状态指示（锁定 / 进行中 / 已通关）—— 右上角状态标，与左侧「第 X–Y 关」文案分离，文字在容器内垂直居中
  // 宽度按文字实测自适应，避免固定宽导致的右侧空白与遮挡
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  let badgeText
  const badgeFont = 'bold ' + Math.round(11.5 * u) + 'px sans-serif'
  if (locked) {
    // 锁定：明确写出「需通关的最后一关」(zone.start-1)，而非用当前进度误导
    const need = Math.max(1, zone.start - 1)
    badgeText = '🔒 通关第 ' + need + ' 关解锁'
  } else if (this.unlocked >= zone.start && this.unlocked <= zone.end) {
    badgeText = '▶ 进行中 · 第 ' + this.unlocked + ' 关'
  } else {
    const zexp = storage.zoneExplore(this.activeZone)
    if (done >= 20 && zexp.mastered) {
      badgeText = '✦ 金章制霸 ' + zexp.gold + '/20'
    } else if (done >= 20) {
      badgeText = '✓ 已制霸'
    } else {
      badgeText = '已通关 ' + done + '/20 · 金' + zexp.gold
    }
  }
  ctx.font = badgeFont
  const badgeW = Math.ceil(ctx.measureText(badgeText).width) + 26 * u
  const bx = h.x + h.w - 20 * u - badgeW
  const bby = h.y + 20 * u
  if (locked) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    roundRect(ctx, bx, bby, badgeW, 30 * u, 15 * u)
    ctx.fill()
    ctx.fillStyle = v['--text-sub']
    ctx.font = badgeFont
    ctx.fillText(badgeText, bx + 13 * u, bby + 15.5 * u)
  } else if (this.unlocked >= zone.start && this.unlocked <= zone.end) {
    ctx.save()
    ctx.shadowColor = zc
    ctx.shadowBlur = 8
    roundRect(ctx, bx, bby, badgeW, 30 * u, 15 * u)
    ctx.fillStyle = this.hexA(zc, 0.9)
    ctx.fill()
    ctx.restore()
    ctx.fillStyle = 'rgba(10,12,32,0.9)'
    ctx.font = badgeFont
    ctx.fillText(badgeText, bx + 13 * u, bby + 15.5 * u)
  } else {
    ctx.fillStyle = this.hexA(zc, 0.85)
    roundRect(ctx, bx, bby, badgeW, 30 * u, 15 * u)
    ctx.fill()
    ctx.fillStyle = 'rgba(10,12,32,0.9)'
    ctx.font = badgeFont
    ctx.fillText(badgeText, bx + 13 * u, bby + 15.5 * u)
  }

  ctx.textBaseline = 'alphabetic'

  // 已装备外观（玩家名片）：头像框环 + 称号，置于卡内左侧空隙（与副标题/进度条错开，零重叠）
  const ac = storage.getActiveCosmetic()
  if (ac.frame || ac.title) {
    const avX = h.x + 30 * u
    const avY = h.y + 68 * u
    const avR = 12 * u
    // 头像底：取当前英雄主色（无则中性灰）
    let avCol = '#C9C4E8'
    try { const hp = storage.getHeroPal(); if (hp && hp.tunic) avCol = hp.tunic } catch (e) {}
    ctx.beginPath()
    ctx.arc(avX, avY, avR, 0, Math.PI * 2)
    ctx.fillStyle = avCol
    ctx.fill()
    // 头像框环
    if (ac.frame) {
      const fm = task.cosmeticMeta('frame', ac.frame)
      ctx.beginPath()
      ctx.arc(avX, avY, avR + 3 * u, 0, Math.PI * 2)
      ctx.lineWidth = 2.6 * u
      ctx.strokeStyle = fm.color
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(avX, avY, avR + 5.5 * u, 0, Math.PI * 2)
      ctx.lineWidth = 1.4 * u
      ctx.strokeStyle = this.hexA(fm.color, 0.4)
      ctx.stroke()
    }
    // 称号（头像右侧一行）
    if (ac.title) {
      const tm = task.cosmeticMeta('title', ac.title)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = tm.color
      ctx.font = 'bold ' + Math.round(11 * u) + 'px sans-serif'
      ctx.fillText('· ' + ac.title, avX + avR + 8 * u, avY + 1 * u)
      ctx.textBaseline = 'alphabetic'
    }
  }

  // 左右箭头
  ctx.restore()
}

// 圆点指示器（当前区加长胶囊）
HomeScene.prototype.drawDots = function (ctx, v) {
  const u = this.u
  const e = this.ent(1)
  if (e <= 0) return
  const d = this.dotsRect()
  ctx.save()
  ctx.globalAlpha = e
  for (let i = 0; i < d.n; i++) {
    const x0 = d.x + i * (d.dw + d.gap)
    if (i === this.activeZone) {
      roundRect(ctx, d.x + this.activeZone * (d.dw + d.gap) - 4 * u, d.y, d.dw + 8 * u, d.dw, d.dw / 2)
      ctx.fillStyle = this.zoneColor(this.activeZone)
      ctx.fill()
    } else {
      ctx.beginPath()
      ctx.arc(x0 + d.dw / 2, d.y + d.dw / 2, 2.4 * u, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.28)'
      ctx.fill()
    }
  }
  ctx.restore()
}

// 关卡节点图（5 列紧凑圆角节点：编号 + 星级/状态，行内连接线）
HomeScene.prototype.drawGrid = function (ctx, v) {
  const g = this.gz
  const sc = this.gridSc
  const zone = ZONES[this.activeZone]
  const zc = this.zoneColor(this.activeZone)
  const u = this.u
  const rows = Math.ceil(20 / this.cols)
  const e0 = this.ent(2)
  if (e0 <= 0) return
  ctx.save()
  ctx.globalAlpha = e0
  ctx.translate(0, (1 - e0) * 14)
  ctx.beginPath()
  ctx.rect(g.x - 6, g.y - 6, g.w + 12, sc.h + 12)
  ctx.clip()

  for (let row = 0; row < rows; row++) {
    const rowY = g.y + row * (this.chh + this.gap) - sc.offset
    if (rowY + this.chh < g.y - 20 || rowY > g.y + sc.h + 20) continue
    // 行内连接线（节点之间，已通关段点亮）
    for (let col = 0; col < this.cols - 1; col++) {
      const lvA = zone.start + row * this.cols + col
      if (lvA >= zone.end) break
      const ax = g.x + col * (this.cw + this.gap) + this.cw - 1
      const yy = rowY + this.chh / 2
      ctx.beginPath()
      ctx.moveTo(ax, yy)
      ctx.lineTo(ax + this.gap + 2, yy)
      ctx.lineWidth = 2
      // 已走过的路线（lvA 之后的格子已解锁）整体点亮并呼吸，已通关对更亮
      const traversed = (lvA + 1) <= this.unlocked
      const fully = this.completed[lvA] && this.completed[lvA + 1]
      ctx.strokeStyle = traversed
        ? this.hexA(zc, fully ? 0.5 + 0.22 * fx.pulse(1300, row * 0.5) : 0.34 + 0.14 * fx.pulse(1300, row * 0.5))
        : 'rgba(255,255,255,0.08)'
      ctx.stroke()
    }

    for (let col = 0; col < this.cols; col++) {
      const lv = zone.start + row * this.cols + col
      if (lv > zone.end) break
      const idx = row * this.cols + col
      const lp = Math.max(0, Math.min(1, this.gridAnim * 1.5 - idx * 0.05))
      if (lp <= 0) continue
      const le = fx.E.easeOutCubic(lp)
      const x0 = g.x + col * (this.cw + this.gap)
      const y0 = rowY + (1 - le) * 12
      const rec = this.completed[lv]
      const done = !!rec
      const current = lv === this.unlocked
      const locked = lv > this.unlocked
      ctx.save()
      ctx.globalAlpha = e0 * le
      // 节点底（圆润小方）
      roundRect(ctx, x0, y0, this.cw, this.chh, 15 * u)
      if (done) {
        ctx.fillStyle = this.hexA(zc, 0.18)
        ctx.fill()
        ctx.lineWidth = 1.1
        ctx.strokeStyle = this.hexA(zc, 0.5)
        ctx.stroke()
      } else if (current) {
        ctx.fillStyle = v['--glass-strong'] || 'rgba(255,255,255,0.14)'
        ctx.fill()
        ctx.lineWidth = 1.6
        ctx.globalAlpha = e0 * le * (0.6 + 0.4 * fx.pulse(1100))
        ctx.strokeStyle = v['--warn']
        ctx.stroke()
        ctx.globalAlpha = e0 * le
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.045)'
        ctx.fill()
        ctx.lineWidth = 1
        ctx.strokeStyle = 'rgba(255,255,255,0.09)'
        ctx.stroke()
      }
      // 编号
      ctx.textAlign = 'center'
      ctx.fillStyle = done ? this.hexA(zc, 0.95) : current ? v['--warn'] : locked ? v['--text-sub'] : v['--text']
      ctx.globalAlpha = e0 * le * (locked ? 0.45 : 1)
      ctx.font = 'bold ' + Math.round(17 * u) + 'px sans-serif'
      ctx.fillText(String(lv), x0 + this.cw / 2, y0 + this.chh / 2 - 5 * u)
      // 状态行
      ctx.font = Math.round(9 * u) + 'px sans-serif'
      if (done) {
        const stars = rec.stars || 1
        ctx.fillStyle = 'rgba(255,236,170,0.95)'
        ctx.fillText('★'.repeat(stars) + '☆'.repeat(3 - stars), x0 + this.cw / 2, y0 + this.chh / 2 + 14 * u)
      } else if (current) {
        ctx.fillStyle = v['--warn']
        ctx.fillText('▶ 挑战中', x0 + this.cw / 2, y0 + this.chh / 2 + 14 * u)
      } else if (locked) {
        if (lv === this.unlocked + 1) {
          // 下一待解锁关：金色广告角标（可点看广告/光尘解锁）
          ctx.fillStyle = '#FFD86E'
          ctx.fillText('▶ 广告', x0 + this.cw / 2, y0 + this.chh / 2 + 14 * u)
        } else {
          ctx.globalAlpha = e0 * le * 0.35
          ctx.fillText('🔒', x0 + this.cw / 2, y0 + this.chh / 2 + 14 * u)
          ctx.globalAlpha = e0 * le * (locked ? 0.45 : 1)
        }
      }
      // Boss 关标记（L80-100 限时追逐）
      if (lv >= 80 && lv <= 100) {
        ctx.font = Math.round(8.5 * u) + 'px sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText('👑', x0 + 5 * u, y0 + 12 * u)
      }
      ctx.restore()
    }
  }
  sc.drawBar(ctx)
  ctx.restore()
}

// 底部 Dock（矢量图标 + 柔光，去方盒卡片）
const DOCK_ICON_COLOR = {
  daily: '#6FE3D2', weekly: '#9B8CFF', rank: '#FFD86E', supply: '#FF9F6E', survival: '#FF7A92', endless: '#E36BFF', task: '#FFC15E'
}

// 矢量图标绘制：以 (cx, cy) 为中心，s 为半尺寸（实现见 ui/Icons.js，与弹窗行卡共用）
function drawDockIcon(ctx, key, cx, cy, s, col) {
  drawIcon(ctx, key, cx, cy, s, col)
}

// 底部 Dock
HomeScene.prototype.drawDock = function (ctx, v) {
  const u = this.u
  const e = this.ent(3)
  if (e <= 0) return
  ctx.save()
  ctx.globalAlpha = e
  ctx.translate(0, (1 - e) * 14)
  for (let i = 0; i < this.dock.length; i++) {
    const d = this.dock[i]
    const col = DOCK_ICON_COLOR[d.key] || '#FFFFFF'
    ctx.save()
    // 按压缩放（图标整体）
    if (d.pressT > 0.01) {
      const s = 1 - 0.08 * d.pressT
      ctx.translate(d.x + d.w / 2, d.y + d.h / 2)
      ctx.scale(s, s)
      ctx.translate(-(d.x + d.w / 2), -(d.y + d.h / 2))
    }
    const cx = d.x + d.w / 2
    const cy = d.y + 20 * u
    // 柔光底（图标色低透明径向光）
    const gl = ctx.createRadialGradient(cx, cy, 0, cx, cy, 26 * u)
    gl.addColorStop(0, this.hexA(col, 0.22 + 0.08 * fx.pulse(1600, i * 1.3)))
    gl.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gl
    ctx.fillRect(cx - 26 * u, cy - 26 * u, 52 * u, 52 * u)
    // 矢量图标
    drawDockIcon(ctx, d.key, cx, cy, 13 * u, col)
    // 标签：任务入口直接显示今日进度，不点开面板也能看到全勤还差几个
    // 用 enter() 缓存的摘要（面板关闭时刷新），避免每帧同步读存储
    const brief = d.key === 'task' ? (this.taskBrief || task.dailyBrief()) : null
    ctx.textAlign = 'center'
    ctx.fillStyle = brief
      ? (brief.full ? '#6FE3D2' : (brief.claimable > 0 ? '#FFC15E' : v['--text']))
      : (d.key === 'survival' ? '#FFB9C6' : v['--text'])
    ctx.font = Math.round(10 * u) + 'px sans-serif'
    ctx.fillText(brief ? '任务 ' + brief.done + '/' + brief.total : d.label, cx, d.y + 46 * u)
    // 任务入口红点：存在可领任务时提示
    if (brief && brief.claimable > 0) {
      ctx.fillStyle = '#FF4D5E'
      ctx.beginPath()
      ctx.arc(d.x + d.w - 8 * u, d.y + 7 * u, 5 * u, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
  ctx.restore()
}

HomeScene.prototype.drawToast = function (ctx) {
  const now = Date.now()
  if (now >= this.toastUntil || !(this.toastT > 0)) return
  const W = this.sm.W
  const H = this.sm.H
  const u = this.u
  const fadeout = Math.max(0, Math.min(1, (this.toastUntil - now) / 300))
  const a = this.toastT * fadeout
  ctx.save()
  ctx.globalAlpha = a
  ctx.translate(0, (1 - this.toastT) * 10)
  ctx.font = Math.round(13 * u) + 'px sans-serif'
  const tw = ctx.measureText(this.toastMsg).width + 36 * u
  ctx.shadowColor = 'rgba(0,0,0,0.4)'
  ctx.shadowBlur = 12
  ctx.shadowOffsetY = 3
  roundRect(ctx, W / 2 - tw / 2, H * 0.44 - 18 * u, tw, 36 * u, 18 * u)
  ctx.fillStyle = 'rgba(8,9,26,0.85)'
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'
  ctx.stroke()
  ctx.fillStyle = '#FFFFFF'
  ctx.textAlign = 'center'
  ctx.fillText(this.toastMsg, W / 2, H * 0.44)
  ctx.restore()
}

// hex/rgba → rgba 带 alpha（主题 zone 色为 #RRGGBB）
HomeScene.prototype.hexA = function (hex, a) {
  if (hex && hex.indexOf('rgba') === 0) return hex
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'
}

module.exports = HomeScene
