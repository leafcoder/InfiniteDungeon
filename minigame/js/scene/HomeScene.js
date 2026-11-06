/**
 * 首页场景（v1.4 单塔防版 · v1.4 死代码清理后）
 * 信息架构：
 *   顶栏（Logo + 光尘胶囊 + 今日徽章；右侧图鉴 / 皮肤 / 设置 3 枚图标钮）
 *   → Hero 卡（地宫守卫 + 最佳波数进度）
 *   → 战绩卡（占据原关卡网格区域：最佳波数 / 累计局数 / 累计波数）
 *   → 悬浮主 CTA「开始守卫」→ 底部 Dock（补给 / 守卫 / 任务 3 项可见）
 *
 * 说明：迷宫玩法层已物理删除；v1.4.1 进一步清除了恒不可达的迷宫绘制 / 触摸骨架
 * （drawGrid / drawDots / drawFestBanner / drawMutBanner / tapGrid / openUnlock 等）。
 * 布局结构 DOCK / ZONES / gz / dotsRect / festRect / festBottom 及全部坐标计算保留，
 * 因为既有测试对它们有精确像素断言；dotsRect 仍是 gz 锚点的回归基点。
 */
const storage = require('../core/storage')
const theme = require('../core/theme')
const season = require('../core/season')
const checkin = require('../core/checkin')
const task = require('../core/task')
const Icons = require('../ui/Icons')   // drawChkBanner 仍用矢量 spark 图标
const club = require('../ui/gameclub')
const Modals = require('./Modals')
const Modal = require('../ui/Modal')
const fx = require('../ui/fx')
const Background = require('../ui/Background')
const { Button, roundRect } = require('../ui/Button')
const { drawIcon } = require('../ui/Icons')
const mode = require('../core/mode')

// 塔防默认模式下 Hero 卡的虚拟「分区」：只替换数据源，不动 drawHero 的任何绘制代码
const TOWER_HERO_ZONE = { key: 'tower', name: '地宫守卫', emoji: '🛡', start: 1, end: 20 }

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
  { key: 'survival', icon: '🛡', label: '守卫' },
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
  // v1.4 硬删除：塔防是唯一玩法，main.js 只注册 home / tower，不再有回退开关
  this.towerMode = true
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
  const twStat = storage.getStats()
  this.towerBest = twStat.bestTowerWave || 0
  this.towerRuns = twStat.towerRuns || 0
  this.progT = Math.min(1, this.towerBest / 20)
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
  // 主 CTA：唯一玩法入口，直接指向地宫守卫（首入弹玩法说明）
  this.goBtn = new Button({
    x: W / 2 - 120 * u, y: dockY - 66 * u, w: 240 * u, h: 54 * u,
    label: '▶ 开始守卫',
    sub: '最佳 ' + this.towerBest + ' 波 · 累计 ' + this.towerRuns + ' 局',
    fontSize: Math.round(16 * u),
    fill: '#FFC15E', fill2: '#FF9F6E', textColor: 'rgba(10,12,32,0.92)',
    primary: true, radius: 27 * u,
    onTap: function () { self.openEntry('survival') }
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
  // 只保留补给 / 守卫 / 任务三项可见并重排居中。
  // this.dock 仍保留全量 6 项（布局回归断言依赖），隐藏项只打 hidden 标记，不改数据结构。
  const vis = this.dock.filter(function (d) { return mode.TOWER_DOCK_KEYS.indexOf(d.key) >= 0 })
  const n = vis.length
  const vg = 10 * u
  const vw = Math.min(88 * u, (W - padX * 2 - (n - 1) * vg) / n)
  const startX = (W - (n * vw + (n - 1) * vg)) / 2
  for (let i = 0; i < this.dock.length; i++) this.dock[i].hidden = true
  vis.forEach(function (d, i) {
    d.hidden = false
    d.x = startX + i * (vw + vg)
    d.w = vw
  })

  // ---- Hero 卡（顶栏内容下方，取按钮行与光尘胶囊下沿较大值再留白） ----
  // Hero 卡：顶栏第二行（胶囊与图标钮同线）下沿再留白
  const clusterBottom = this.pillRect.y + this.pillRect.h
  this.hero = { x: 16 * u, y: clusterBottom + 14 * u, w: W - 32 * u, h: 140 * u }
  // 活动横幅共用 Hero 卡正下方唯一槽位（节日 > 异变 > 签到，三选一互斥）；
  // 赛季信息已收进顶栏「今日徽章」，此处不再常驻占位（回收约 48u 给关卡网格）
  const bannerY = this.hero.y + this.hero.h + 8 * u
  this.festBottom = this.hero.y + this.hero.h + 10 * u
  // 节日 / 异变玩法已随迷宫层删除，横幅槽位恒为空；festBottom 仍作为 gz 的唯一锚点
  this.fest = null
  this.festRect = null
  this.mut = null
  this.mutRect = null
  // 每日签到横幅：仅未签到时显示，可点；已签到后由顶栏「今日徽章」回看
  this.chkRect = (this.chk && !this.chk.signed)
    ? { x: 16 * u, y: bannerY, w: W - 32 * u, h: 36 * u }
    : null
  if (this.chkRect) this.festBottom = this.chkRect.y + this.chkRect.h + 8 * u
  // 分区切换：左右滑动 + 圆点指示器（反馈：两侧箭头与手势重复且挤占空间，已移除）

  // ---- 关卡节点图（5 列紧凑节点，紧贴圆点下方，高度自适应到 CTA 上沿） ----
  this.gz = { x: 16 * u, y: this.festBottom + 18 * u, w: W - 32 * u }
  this.cols = 5
  this.gap = 8 * u
  this.cw = (this.gz.w - (this.cols - 1) * this.gap) / this.cols
  this.chh = 58 * u
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

  // 挑战码 / 口令识别已随迷宫玩法删除；纯单机不再读取剪贴板
}

// 分区切换 / 关卡解锁相关方法（zoneOf / zoneDoneCount / switchZone / refreshUnlock /
// openUnlock / tapGrid / tapDots）已随迷宫玩法层一并清除：唯一玩法是塔防，
// 首页不存在任何分区与关卡概念。ZONES 仅作 dotsRect 的计数与配色锚点保留。

// 入口分发：唯一玩法是塔防，首页不存在任何 switch('game') 路径
HomeScene.prototype.openEntry = function (key) {
  const self = this
  if (key === 'ach') {
    // 图鉴升为主入口：收集系统独立直达，成就 / 伙伴 / 手记收进图鉴分组
    this.modal = Modals.showCodex(this.sm, function () { self.modal = null })
  } else if (key === 'skin') {
    this.modal = Modals.showSkin(this.sm, function () { self.modal = null })
  } else if (key === 'settings') {
    this.modal = Modals.showSettings(this.sm, function () { self.modal = null })
  } else if (key === 'supply') {
    this.modal = Modals.showSupply(this.sm, function () { self.modal = null })
  } else if (key === 'survival') {
    // 槽位内核已升级为「地宫守卫」塔防（P1）：key 保持不变，避免打断 v34 布局断言
    if (!storage.getFlag('towerTut')) {
      const st = storage.getStats()
      this.modal = new Modal(this.sm, {
        title: '地宫守卫 · 玩法',
        lines: [
          { t: '🛡 在迷宫墙上建塔，守住地宫核心，撑过越多波越强。', b: true, s: 13 },
          { t: '' },
          { t: '· 点底部选塔，再点地图任意处会自动吸附到最近的空塔位', s: 12 },
          { t: '· 底部点「建造」确认；点已有塔可升级或出售', s: 12 },
          { t: '· 每波间有 8 秒布防，点「提前开波」额外 +10 金币', s: 12 },
          { t: '· 敌人抵达核心会扣血，核心归零即结束', s: 12 },
          { t: '· 每波守住后三选一「地宫赐福」，仅本局有效', s: 12 },
          { t: '' },
          (st.bestTowerWave || 0)
            ? { t: '🏆 你的最佳纪录：守住 ' + st.bestTowerWave + ' 波', c: '#FFC15E', b: true }
            : { t: '尚无纪录，来创造第一个！', c: '#6FE3D2', b: true }
        ],
        buttons: [
          { label: '开始守卫', primary: true, onTap: function () {
            storage.setFlag('towerTut')
            self.modal = null
            self.sm.switch('tower')
          } },
          { label: '返回' }
        ],
        onClose: function () { self.modal = null }
      })
    } else {
      this.sm.switch('tower')
    }
  } else if (key === 'task') {
    this.modal = require('./TaskPanel').build(this.sm, function () {
      self.modal = null
      self.taskBrief = task.dailyBrief() // 领奖/查看后刷新 Dock 进度
    })
  }
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
    // 节日 / 异变横幅恒为空（已删除），签到横幅只取决于当日是否已签到
    self.chkRect = (self.chk && !self.chk.signed) ? self.chkRect : null
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
    // 节日 / 异变横幅恒为空（已删除），签到横幅只取决于当日是否已签到
    self.chkRect = (self.chk && !self.chk.signed) ? self.chkRect : null
    self.dustDisp = storage.getDust()
    self.dirty = true
  })
}

// 轮回（NG+）入口已随迷宫玩法删除

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
  // 唯一玩法：CTA 固定守卫金，不再跟随分区色 / 轮回紫
  this.goBtn.fill = '#FFC15E'
  this.goBtn.fill2 = '#FF9F6E'
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
    if (d.hidden) continue
    if (tx >= d.x - 4 && tx <= d.x + d.w + 4 && ty >= d.y - 4 && ty <= d.y + d.h + 4) {
      fx.to(d, { pressT: 1 }, 70)
      this._dockDown = i
    }
  }
}

HomeScene.prototype.onTouchMove = function (tx, ty) {
  if (this.adSim) return
  if (this.modal) { this.modal.onTouchMove(tx, ty); return }
  // 关卡网格已下线，首页不再有可拖拽内容
}

HomeScene.prototype.onTouchEnd = function (tx, ty) {
  if (this.adSim) return
  if (this.modal) { this.modal.onTouchEnd(tx, ty); return }
  for (let i = 0; i < this.iconBtns.length; i++) this.iconBtns[i].touch(tx, ty, false)
  this.goBtn.touch(tx, ty, false)
  // Dock：按下与松起落在同一项才触发
  for (let i = 0; i < this.dock.length; i++) {
    const d = this.dock[i]
    if (d.hidden) continue
    fx.to(d, { pressT: 0 }, 170, { ease: 'easeOutBack' })
    if (this._dockDown === i &&
        tx >= d.x - 4 && tx <= d.x + d.w + 4 && ty >= d.y - 4 && ty <= d.y + d.h + 4) {
      this.openEntry(d.key)
    }
  }
  this._dockDown = -1
  // Hero 横滑切区 / 圆点 / 关卡网格 / 节日胶囊的命中已随迷宫玩法删除
  // 每日签到横幅（可点）
  if (this.touchDown && this.isTap(tx, ty) && this.inChkRect(tx, ty)) {
    this.openCheckin()
  }
  this.touchDown = null
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
  // 关卡网格滚动实例已随迷宫玩法移除；此处只保留 toast 期间的持续重绘
  const toasting = Date.now() < this.toastUntil + 300
  if (toasting) this.dirty = true
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
  // 节日 / 异变 / 分区网格 / 圆点均不绘制；签到横幅保留，战绩卡填充原网格区域
  this.drawChkBanner(ctx, v)
  this.drawTowerBoard(ctx, v)
  this.goBtn.draw(ctx)
  this.drawDock(ctx, v)
  if (this.modal) this.modal.draw(ctx)
  // Toast 必须画在弹窗之上：行卡购买等操作的反馈不能被弹窗盖住
  this.drawToast(ctx)
  ctx.restore()
}

// 塔防默认模式的战绩卡：占据原关卡网格区域。
// 只用 Canvas 最基础方法（无 createLinearGradient / measureText），保证无头测试桩可绘制。
HomeScene.prototype.drawTowerBoard = function (ctx, v) {
  const u = this.u
  const g = this.gz
  const e = this.ent(2)
  if (e <= 0 || !g) return
  const y = g.y
  const h = Math.max(120 * u, Math.min(180 * u, this.goBtn.y - 20 * u - y))
  ctx.save()
  ctx.globalAlpha = e
  roundRect(ctx, g.x, y, g.w, h, 18 * u)
  ctx.fillStyle = 'rgba(255,255,255,0.10)'  // .glass：直接压在页面渐变底上的卡片
  ctx.fill()
  ctx.textAlign = 'left'
  ctx.fillStyle = v['--text']
  ctx.font = 'bold ' + Math.round(22 * u) + 'px sans-serif'   // --fs-title 档
  ctx.fillText('地宫守卫 · 战绩', g.x + 20 * u, y + 30 * u)
  ctx.fillStyle = v['--text-sub']
  ctx.font = Math.round(11 * u) + 'px sans-serif'              // --fs-caption 档
  ctx.fillText('在迷宫墙上建塔，守住地宫核心', g.x + 20 * u, y + 52 * u)
  const st = storage.getStats()
  const items = [
    { n: st.bestTowerWave || 0, label: '最佳波数' },
    { n: st.towerRuns || 0, label: '累计局数' },
    { n: st.totalTowerWaves || 0, label: '累计波数' }
  ]
  const rowY = y + 96 * u
  const colW = g.w / 3
  for (let i = 0; i < items.length; i++) {
    const cx = g.x + colW * i + colW / 2
    ctx.textAlign = 'center'
    ctx.fillStyle = '#FFC15E'
    ctx.font = 'bold ' + Math.round(28 * u) + 'px sans-serif'  // --fs-numeric 档
    ctx.fillText(String(items[i].n), cx, rowY)
    ctx.fillStyle = v['--text-sub']
    ctx.font = Math.round(11 * u) + 'px sans-serif'
    ctx.fillText(items[i].label, cx, rowY + 24 * u)
  }
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
  const zone = TOWER_HERO_ZONE
  const zc = this.zoneColor(this.activeZone)
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
  ctx.fillText('无尽波次 · 守住核心 · 波间三选一赐福', h.x + 22 * u, h.y + 48 * u)

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
  ctx.fillStyle = v['--text-sub']
  ctx.font = Math.round(10.5 * u) + 'px sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText('累计 ' + this.towerRuns + ' 局', h.x + h.w - 56 * u, by + 18 * u)

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

  // 徽章：塔防最佳波数状态标。唯一玩法下不再有「锁定 / 进行中 / 已通关」三态，
  // 收敛为单一高亮绘制（原三态分支残留的未定义变量 locked 会让入场后整页绘制抛 ReferenceError）。
  // 宽度按文字实测自适应，避免固定宽导致的右侧空白与遮挡
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const badgeFont = 'bold ' + Math.round(11.5 * u) + 'px sans-serif'
  const badgeText = this.towerBest > 0 ? ('🛡 最佳 ' + this.towerBest + ' 波') : '🛡 等待首局'
  ctx.font = badgeFont
  const badgeW = Math.ceil(ctx.measureText(badgeText).width) + 26 * u
  const bx = h.x + h.w - 20 * u - badgeW
  const bby = h.y + 20 * u
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
    if (d.hidden) continue
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
