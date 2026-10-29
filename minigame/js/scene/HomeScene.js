/**
 * 首页场景（UI 3.0：布局与配色重设计）
 * 信息架构：
 *   顶栏（Logo 锁定组合 + 圆形图标钮[图鉴/挑战码] + 光尘胶囊）
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

const DOCK = [
  { key: 'daily', icon: '📅', label: '每日' },
  { key: 'weekly', icon: '🗓️', label: '周挑战' },
  { key: 'rank', icon: '🏆', label: '排行' },
  { key: 'supply', icon: '🛒', label: '补给' },
  { key: 'survival', icon: '💀', label: '生存' }
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

  // ---- 顶栏：Logo 与胶囊同行（左侧），图标/光尘行移到胶囊下方（右侧） ----
  this.iconBtns = []
  const TOPY = (this.sm.capB || SAT + 40) + 2 * u   // 胶囊下缘以下
  const ibD = 30 * u
  const ibGap = 8 * u
  // 顶栏圆形图标钮：皮肤 / 挑战码 / 图鉴（皮肤入口提升可见性）
  ;[
    { key: 'skin', icon: '🎨' },
    { key: 'code', icon: '🔑' },
    { key: 'ach', icon: '📖' }
  ].forEach(function (def, i) {
    self.iconBtns.push(new Button({
      x: W - 16 * u - ibD - i * (ibD + ibGap), y: TOPY, w: ibD, h: ibD,
      label: def.icon, fontSize: Math.round(14 * u), round: true, glass: true,
      fill: 'rgba(255,255,255,0.10)', fill2: 'rgba(255,255,255,0.05)',
      textColor: '#F3F1FF',
      onTap: function () { self.openEntry(def.key) }
    }))
  })
  // 光尘胶囊（纯展示，与图标同行，位于最左图标钮左侧）
  this.pillRect = { x: W - 16 * u - ibD - 2 * (ibD + ibGap) - ibGap - 84 * u, y: TOPY + 1 * u, w: 84 * u, h: 28 * u }

  // ---- 底部锚点：Dock → CTA（先算底部，网格高度随之自适应） ----
  const dockY = H - SAB - 12 * u - 56 * u
  this.goBtn = new Button({
    x: W / 2 - 120 * u, y: dockY - 66 * u, w: 240 * u, h: 54 * u,
    label: '▶ 继续冒险', sub: '第 ' + this.unlocked + ' 关 · ' + this.zoneOf(this.unlocked).name,
    fontSize: Math.round(16 * u),
    fill: '#FFC15E', fill2: '#FF9F6E', textColor: '#3A2A08',
    primary: true,
    onTap: function () { self.sm.switch('game', { level: self.unlocked }) }
  })
  this.dock = []
  const dw = (W - 32 * u - 4 * 8 * u) / 5
  DOCK.forEach(function (d, i) {
    self.dock.push({
      key: d.key, icon: d.icon, label: d.label,
      x: 16 * u + i * (dw + 8 * u), y: dockY, w: dw, h: 56 * u,
      pressT: 0
    })
  })

  // ---- Hero 卡（图标行下方） ----
  this.hero = { x: 16 * u, y: TOPY + 30 * u + 14 * u, w: W - 32 * u, h: 140 * u }
  this.heroSc = new ScrollView({ x: this.hero.x, y: this.hero.y, w: this.hero.w, h: this.hero.h, horizontal: true })
  // 左右箭头（圆形玻璃钮，垂直居中）
  this.chevL = new Button({
    x: this.hero.x + 8 * u, y: this.hero.y + this.hero.h / 2 - 17 * u, w: 34 * u, h: 34 * u,
    label: '‹', fontSize: Math.round(22 * u), round: true, glass: true,
    fill: 'rgba(255,255,255,0.10)', fill2: 'rgba(255,255,255,0.04)', textColor: '#F3F1FF',
    onTap: function () { self.switchZone(self.activeZone - 1) }
  })
  this.chevR = new Button({
    x: this.hero.x + this.hero.w - 42 * u, y: this.hero.y + this.hero.h / 2 - 17 * u, w: 34 * u, h: 34 * u,
    label: '›', fontSize: Math.round(22 * u), round: true, glass: true,
    fill: 'rgba(255,255,255,0.10)', fill2: 'rgba(255,255,255,0.04)', textColor: '#F3F1FF',
    onTap: function () { self.switchZone(self.activeZone + 1) }
  })

  // ---- 关卡节点图（5 列紧凑节点，紧贴圆点下方，高度自适应到 CTA 上沿） ----
  this.gz = { x: 16 * u, y: this.hero.y + this.hero.h + 28 * u, w: W - 32 * u }
  this.cols = 5
  this.gap = 8 * u
  this.cw = (this.gz.w - (this.cols - 1) * this.gap) / this.cols
  this.chh = 58 * u
  const rows = Math.ceil(20 / this.cols)
  this.gridSc = new ScrollView({ x: this.gz.x, y: this.gz.y, w: this.gz.w, h: this.goBtn.y - 12 * u - this.gz.y })
  this.gridSc.setContent(rows * this.chh + (rows - 1) * this.gap)
  this.gridAnim = 1

  this.touchDown = null
  this.dirty = true

  // 进页自动识别挑战口令
  try {
    wx.getClipboardData({
      success: function (res) {
        const dec = challenge.decode(res.data)
        if (!dec || !dec.level) return
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
              self.sm.switch('game', { mode: 'custom', level: dec.level, mods: dec.mods, seed: dec.seed })
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
  } else if (key === 'rank') {
    this.modal = Modals.showRank(this.sm, function () { self.modal = null })
  } else if (key === 'ach') {
    this.modal = Modals.showAch(this.sm, function () { self.modal = null })
  } else if (key === 'skin') {
    this.modal = Modals.showSkin(this.sm, function () { self.modal = null })
  } else if (key === 'supply') {
    this.modal = Modals.showSupply(this.sm, function () { self.modal = null })
  } else if (key === 'code') {
    this.modal = Modals.showCode(this.sm, function (dec) {
      self.modal = null
      self.sm.switch('game', { mode: 'custom', level: dec.level, mods: dec.mods, seed: dec.seed })
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
  }
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
  this.chevL.touch(tx, ty, true)
  this.chevR.touch(tx, ty, true)
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
  this.chevL.touch(tx, ty, false)
  this.chevR.touch(tx, ty, false)
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
  return { x: this.sm.W / 2 - total / 2, y: this.hero.y + this.hero.h + 10 * u, dw: dw, gap: gap, n: n }
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
  const finish = function (ok) {
    self._unlockBusy = false
    if (!ok) { self.showToast('广告未看完，未能解锁'); return }
    succeed()
  }
  const watchAd = function () {
    if (self._unlockBusy) return
    self._unlockBusy = true
    const handled = ad.showRewarded(finish)
    if (!handled) self.adSim = new AdSim(self.sm, finish, '解锁第 ' + lv + ' 关')
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
      { t: '✦ 花费 ' + UNLOCK_DUST_COST + ' 光尘直接解锁（通关/每日获取，不可充值）', c: '#9AA0C8', s: 11.5 }
    ],
    buttons: [
      { label: '看广告解锁', primary: true, onTap: watchAd },
      { label: UNLOCK_DUST_COST + '✦ 解锁', onTap: buyDust },
      { label: '取消' }
    ],
    onClose: function () { self.modal = null }
  })
}

/* ---------- 帧更新 ---------- */

HomeScene.prototype.update = function (dt) {
  if (this.adSim) {
    if (this.adSim.update()) this.adSim = null
    return
  }
  if (this.modal) {
    this.modal.update()
    if (this.modal.dirty) this.dirty = true
    return
  }
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

  // 徽章：当前进度 / 锁定
  ctx.textAlign = 'left'
  if (locked) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    roundRect(ctx, h.x + 46 * u, h.y + 52 * u, 168 * u, 30 * u, 15 * u)
    ctx.fill()
    ctx.fillStyle = v['--text-sub']
    ctx.font = Math.round(11.5 * u) + 'px sans-serif'
    ctx.fillText('🔒 通过第 ' + this.unlocked + ' 关解锁', h.x + 60 * u, h.y + 71 * u)
  } else if (this.unlocked >= zone.start && this.unlocked <= zone.end) {
    ctx.save()
    ctx.shadowColor = zc
    ctx.shadowBlur = 8
    roundRect(ctx, h.x + 46 * u, h.y + 52 * u, 132 * u, 30 * u, 15 * u)
    ctx.fillStyle = this.hexA(zc, 0.9)
    ctx.fill()
    ctx.restore()
    ctx.fillStyle = 'rgba(10,12,32,0.9)'
    ctx.font = 'bold ' + Math.round(11.5 * u) + 'px sans-serif'
    ctx.fillText('▶ 当前进度 · 第 ' + this.unlocked + ' 关', h.x + 58 * u, h.y + 71 * u)
  } else {
    ctx.fillStyle = this.hexA(zc, 0.85)
    roundRect(ctx, h.x + 46 * u, h.y + 52 * u, 96 * u, 30 * u, 15 * u)
    ctx.fill()
    ctx.fillStyle = 'rgba(10,12,32,0.9)'
    ctx.font = 'bold ' + Math.round(11.5 * u) + 'px sans-serif'
    ctx.fillText(done >= 20 ? '✓ 已制霸' : '回顾练习', h.x + 58 * u, h.y + 71 * u)
  }

  // 左右箭头
  this.chevL.draw(ctx)
  this.chevR.draw(ctx)
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
  daily: '#6FE3D2', weekly: '#9B8CFF', rank: '#FFD86E', supply: '#FF9F6E', survival: '#FF7A92'
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
    // 标签
    ctx.textAlign = 'center'
    ctx.fillStyle = d.key === 'survival' ? '#FFB9C6' : v['--text']
    ctx.font = Math.round(10 * u) + 'px sans-serif'
    ctx.fillText(d.label, cx, d.y + 46 * u)
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
