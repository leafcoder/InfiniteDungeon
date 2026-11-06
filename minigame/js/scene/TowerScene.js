/**
 * 地宫守卫 · 塔防场景（v1.4 唯一玩法）
 * - 迷宫玩法层已物理删除，本场景是唯一对局入口，不提供回退。
 * - 交互采用「吸附式三态」：选塔 → 点地图吸附最近合法墙格 → 确认条建造
 *   （29×43 栅格单格约 13px，远小于 88rpx 触摸规范，精确点格在真机不可用）
 * - 波间赐福与结算复用 Modal；成绩写 stats.bestTowerWave（随 resetProgress 清理）
 * - 局内事件同时推进 codex 图鉴收录；首次遭遇才写存储，避免 kill 等高频事件重复 IO
 */
const TowerCore = require('../core/tower')
const TOWER_DEFS = TowerCore.TOWER_DEFS
const TOWER_ORDER = TowerCore.TOWER_ORDER
const BLESSINGS = TowerCore.BLESSINGS
const MAX_TOWERS = TowerCore.MAX_TOWERS
const MAX_TOWER_LV = TowerCore.MAX_TOWER_LV
const storage = require('../core/storage')
const analytics = require('../core/analytics')
const mode = require('../core/mode')
const task = require('../core/task')
const season = require('../core/season')
const codex = require('../core/codex')
const Modal = require('../ui/Modal')
const { Button } = require('../ui/Button')

const COL = {
  bg: '#0B0B18',
  wall: '#14142A',
  road: '#252547',
  path: 'rgba(111,227,210,0.20)',
  text: '#F3F1FF',
  sub: '#9AA0C8',
  gold: '#FFC15E',
  danger: '#FF6B81'
}

function TowerScene(sm) {
  this.sm = sm
  this.u = 1
  this.always = true
  this.modal = null
  this.core = null
  this.btns = []
  this.view = null
  this.cell = 1
  this.selType = null
  this.ghost = null
  this.selTower = null
  this.banner = null
  this.toastMsg = ''
  this.toastUntil = 0
}

/* ============ 进入与布局 ============ */
TowerScene.prototype.enter = function (params) {
  params = params || {}
  this.u = this.sm.W / 375
  this.seed = (params.seed === undefined ? (Date.now() % 1000000) : params.seed) >>> 0 || 1
  this.core = new TowerCore(30, { aspect: 1.5, seed: this.seed })
  this.modal = null
  this.selType = null
  this.ghost = null
  this.selTower = null
  this.banner = null
  this.toastMsg = ''
  this.toastUntil = 0
  this._settled = false
  this._codexSeen = {}
  this.layout()
  this.buildButtons()
  try { analytics.track('td_start', { seed: this.seed }) } catch (e) {}
}

TowerScene.prototype.exit = function () {
  this.modal = null
}

TowerScene.prototype.layout = function () {
  const W = this.sm.W
  const H = this.sm.H
  const u = this.u
  const sat = this.sm.sat || 0
  const sab = this.sm.sab || 0
  const hudH = sat + 60 * u
  const footH = 92 * u
  const availH = H - hudH - footH - sab
  const gW = this.core.W
  const gH = this.core.H
  const cell = Math.max(4, Math.min((W - 16 * u) / gW, availH / gH))
  this.cell = cell
  this.view = {
    x: (W - cell * gW) / 2,
    y: hudH + Math.max(0, (availH - cell * gH) / 2),
    w: cell * gW,
    h: cell * gH
  }
  this.hudH = hudH
  this.footY = H - sab - footH
}

TowerScene.prototype.px = function (gx) { return this.view.x + (gx + 0.5) * this.cell }
TowerScene.prototype.py = function (gy) { return this.view.y + (gy + 0.5) * this.cell }

/* ============ 按钮（三种底部状态互斥） ============ */
TowerScene.prototype.buildButtons = function () {
  const self = this
  const u = this.u
  const W = this.sm.W
  const pad = 8 * u
  const gap = 6 * u
  const btns = []

  btns.push(new Button({
    x: pad, y: (this.sm.sat || 0) + 8 * u, w: 40 * u, h: 40 * u,
    label: '‹', round: true, vMid: true, glass: true,
    onTap: function () { self.back() }
  }))

  const nowBtn = new Button({
    x: W - pad - 84 * u, y: this.footY + 2 * u, w: 84 * u, h: 30 * u,
    label: '提前开波', fontSize: Math.round(12 * u), primary: true,
    onTap: function () { self.core.startNow() }
  })
  nowBtn._kind = 'now'
  btns.push(nowBtn)

  const y2 = this.footY + 40 * u
  if (this.ghost) {
    const half = (W - pad * 2 - gap) / 2
    const b1 = new Button({
      x: pad, y: y2, w: half, h: 44 * u,
      label: '建造 ¥' + this.ghost.cost, fontSize: Math.round(13 * u), primary: true,
      onTap: function () { self.doBuild() }
    })
    b1._kind = 'build'
    btns.push(b1)
    btns.push(new Button({
      x: pad + half + gap, y: y2, w: half, h: 44 * u,
      label: '取消', fontSize: Math.round(13 * u),
      onTap: function () { self.clearSel() }
    }))
  } else if (this.selTower) {
    const t = this.selTower
    const w3 = (W - pad * 2 - gap * 2) / 3
    const up = new Button({
      x: pad, y: y2, w: w3, h: 44 * u,
      label: t.lv >= MAX_TOWER_LV ? '已满级' : '升级 ¥' + this.core.upgradeCost(t),
      fontSize: Math.round(12 * u), primary: true,
      onTap: function () { self.doUpgrade() }
    })
    up._kind = 'upgrade'
    btns.push(up)
    btns.push(new Button({
      x: pad + w3 + gap, y: y2, w: w3, h: 44 * u,
      label: '出售 +¥' + Math.round(t.invest * 0.6), fontSize: Math.round(12 * u),
      onTap: function () { self.doSell() }
    }))
    btns.push(new Button({
      x: pad + (w3 + gap) * 2, y: y2, w: w3, h: 44 * u,
      label: '取消', fontSize: Math.round(12 * u),
      onTap: function () { self.clearSel() }
    }))
  } else {
    const bw = (W - pad * 2 - gap * 3) / 4
    for (let i = 0; i < TOWER_ORDER.length; i++) {
      const type = TOWER_ORDER[i]
      const d = TOWER_DEFS[type]
      const picked = this.selType === type
      const b = new Button({
        x: pad + i * (bw + gap), y: y2, w: bw, h: 44 * u,
        label: d.name, sub: '¥' + this.core.costOf(type),
        fontSize: Math.round(12 * u),
        fill: picked ? d.color : 'rgba(255,255,255,0.14)',
        textColor: picked ? '#10201C' : '#F3F1FF',
        onTap: (function (tp) { return function () { self.pickType(tp) } })(type)
      })
      b._kind = 'tower'
      b._type = type
      btns.push(b)
    }
  }
  this.btns = btns
  this.syncButtons()
}

TowerScene.prototype.syncButtons = function () {
  const c = this.core
  for (let i = 0; i < this.btns.length; i++) {
    const b = this.btns[i]
    if (b._kind === 'tower') {
      b.disabled = c.phase === 'over' || c.towers.length >= MAX_TOWERS || c.gold < c.costOf(b._type)
    } else if (b._kind === 'now') {
      b.disabled = c.phase !== 'prep'
    } else if (b._kind === 'build') {
      b.disabled = !this.ghost || !this.ghost.ok || c.phase === 'over'
    } else if (b._kind === 'upgrade') {
      b.disabled = !this.selTower || this.selTower.lv >= MAX_TOWER_LV || c.gold < c.upgradeCost(this.selTower)
    }
  }
}

/* ============ 交互 ============ */
TowerScene.prototype.pickType = function (type) {
  this.selType = this.selType === type ? null : type
  this.ghost = null
  this.selTower = null
  this.buildButtons()
}
TowerScene.prototype.clearSel = function () {
  this.selType = null
  this.ghost = null
  this.selTower = null
  this.buildButtons()
}
TowerScene.prototype.doBuild = function () {
  if (!this.ghost || !this.ghost.ok) return
  const g = this.ghost
  if (this.core.build(g.slot, g.type)) this.clearSel()
}
TowerScene.prototype.doUpgrade = function () {
  if (!this.selTower) return
  if (this.core.upgrade(this.selTower)) this.buildButtons()
}
TowerScene.prototype.doSell = function () {
  if (!this.selTower) return
  if (this.core.sell(this.selTower)) this.clearSel()
}
TowerScene.prototype.inBoard = function (tx, ty) {
  const v = this.view
  return tx >= v.x && tx <= v.x + v.w && ty >= v.y && ty <= v.y + v.h
}
TowerScene.prototype.onBoardTap = function (tx, ty) {
  const v = this.view
  const c = this.cell
  const gx = (tx - v.x) / c - 0.5
  const gy = (ty - v.y) / c - 0.5
  if (gx < 0 || gy < 0 || gx >= this.core.W || gy >= this.core.H) return
  let hit = null
  for (let i = 0; i < this.core.towers.length; i++) {
    const t = this.core.towers[i]
    const dx = t.x - gx
    const dy = t.y - gy
    if (dx * dx + dy * dy < 1.6) { hit = t; break }
  }
  if (hit) {
    this.selTower = hit
    this.selType = null
    this.ghost = null
    this.buildButtons()
    return
  }
  if (!this.selType) { this.clearSel(); return }
  const slot = this.core.snap(gx, gy)
  if (!slot) { this.showToast('附近没有空余塔位'); return }
  const chk = this.core.canBuild(slot, this.selType)
  this.ghost = { slot: slot, type: this.selType, cost: chk.cost, ok: chk.ok }
  if (!chk.ok) this.showToast(chk.msg)
  this.buildButtons()
}

TowerScene.prototype.onTouchStart = function (tx, ty) {
  if (this.modal) { this.modal.onTouchStart(tx, ty); return }
  for (let i = 0; i < this.btns.length; i++) this.btns[i].touch(tx, ty, true)
}
TowerScene.prototype.onTouchMove = function (tx, ty) {
  if (this.modal) { this.modal.onTouchMove(tx, ty); return }
}
TowerScene.prototype.onTouchEnd = function (tx, ty) {
  if (this.modal) { this.modal.onTouchEnd(tx, ty); return }
  for (let i = 0; i < this.btns.length; i++) this.btns[i].touch(tx, ty, false)
  if (this.inBoard(tx, ty)) this.onBoardTap(tx, ty)
}

/* ============ 主循环 ============ */
TowerScene.prototype.update = function (dt) {
  if (this.modal) return
  this.core.tick(dt)
  const evs = this.core.drain()
  for (let i = 0; i < evs.length; i++) this.handleEvent(evs[i])
  this.syncButtons()
}
TowerScene.prototype.handleEvent = function (ev) {
  const d = ev.data || {}
  // 图鉴收录：事件驱动、同 key 每局只写一次存储
  if (!this._codexSeen) this._codexSeen = {}
  const cxKeys = codex.keysForEvent(ev)
  for (let k = 0; k < cxKeys.length; k++) {
    if (this._codexSeen[cxKeys[k]]) continue
    this._codexSeen[cxKeys[k]] = 1
    try { storage.encounterCodex(cxKeys[k]) } catch (e) {}
  }
  if (ev.type === 'wave') {
    this.banner = { text: '第 ' + d.wave + ' 波来袭', until: Date.now() + 1400, color: COL.danger }
    this.buildButtons()
  } else if (ev.type === 'hint') {
    this.showToast(d.text)
  } else if (ev.type === 'waveclear') {
    try { analytics.track('td_wave', { wave: d.wave, hp: this.core.hp }) } catch (e) {}
    this.showBlessing(d)
  } else if (ev.type === 'gameover') {
    this.showResult(d)
  }
}
TowerScene.prototype.showToast = function (msg) {
  this.toastMsg = msg
  this.toastUntil = Date.now() + 1600
}

/* ============ 弹窗：波间赐福 / 结算 ============ */
TowerScene.prototype.showBlessing = function (d) {
  const self = this
  const offers = d.offers || []
  const rows = offers.map(function (k) {
    const meta = BLESSINGS[k]
    return {
      ick: meta.ick, title: meta.name, sub: meta.desc,
      tag: '选择', tagColor: '#6FE3D2',
      onTap: function (m) {
        self.core.chooseBlessing(k)
        try { analytics.track('td_bless', { key: k, wave: d.wave }) } catch (e) {}
        m.close()
        self.modal = null
      }
    }
  })
  // 金币出口：波间可反复锻造，价格指数递增；塔位/等级全满后仍能把溢出金币转成战力
  const fc = this.core.forgeCost()
  const forgeLabel = fc > 0 ? ('⚒ 锻造 ¥' + fc) : '⚒ 已满级'
  this.modal = new Modal(this.sm, {
    title: '第 ' + d.wave + ' 波守住！',
    lines: [
      { t: '波次奖励 +' + d.bonus + ' 金币 · 选一项地宫赐福（本局有效）', s: 12, c: COL.sub },
      { t: '⚒ 锻造：花金币使全体塔伤害 +8%，可重复、价格递增', s: 11, c: COL.gold },
      { t: '当前锻造 ' + this.core.forgeLv + ' 级 · 伤害 ×' + this.core.damageMul().toFixed(2), s: 11, c: COL.sub }
    ],
    rows: rows,
    buttons: [
      { label: forgeLabel, onTap: function () {
        if (self.core.forge()) {
          try { analytics.track('td_bless', { key: 'forge', wave: d.wave }) } catch (e) {}
          // 重建弹窗刷新价格/等级；不关闭赐福流程，玩家仍可三选一
          self.showBlessing(d)
        } else {
          self.showToast('金币不足或锻造已达上限')
        }
      } },
      { label: '跳过', onTap: function (m) {
        self.core.chooseBlessing(null); m.close(); self.modal = null
      } }
    ],
    onClose: function () { self.modal = null }
  })
}
TowerScene.prototype.showResult = function () {
  // 幂等闸门：gameover 事件只应结算一次，避免重复写统计 / 重复发赛季 XP
  if (this._settled) return
  this._settled = true
  const c = this.core
  const reached = c.reached
  const prevBest = storage.getStats().bestTowerWave || 0
  const isBest = reached > prevBest

  // ---- 波数结算（规格 14.5）：一局统一串联 统计 / 光尘 / 任务 / 赛季 / 成就 ----
  const briefBefore = task.dailyBrief()
  storage.recordTowerRun(reached)               // bestTowerWave / towerRuns / totalTowerWaves
  const dust = mode.dustFor(reached)
  if (dust > 0) storage.addDust(dust)         // addDust 内部推进 D1 / W2
  task.onClear()                              // D2：当日完成守卫局数
  task.onEndlessDepth(reached, true)          // W1：本周最高波数；赛季破纪录由本局 isBest 独立判重
  const xp = mode.seasonXpFor(reached) + (isBest ? mode.WAVE_RULES.recordXp : 0)
  season.addXp(xp)
  const achIds = mode.achFor(reached)
  let achNew = 0
  for (let i = 0; i < achIds.length; i++) achNew += storage.unlockAch(achIds[i])
  const taskDone = task.justCompleted(briefBefore, task.dailyBrief())
  // 图鉴里程碑在结算时统一检查（flags 防重，老存档已解锁的不回收、不重发）
  let cxNew = []
  try { cxNew = codex.checkMilestones(storage) } catch (e) {}

  try {
    analytics.track('td_end', {
      reached: reached, wave: c.wave, kills: c.kills, towers: c.towers.length,
      forge: c.forgeLv, dust: dust, xp: xp, isBest: isBest, achNew: achNew,
      cxNew: cxNew.length
    })
  } catch (e) {}

  const self = this
  const lines = [
    { t: '守住了 ' + reached + ' 波 · 倒在第 ' + c.wave + ' 波', b: true },
    { t: '' },
    { t: '击杀 ' + c.kills + ' · 漏怪 ' + c.leaks + ' · 建塔 ' + c.towers.length + ' 座', s: 12, c: COL.sub },
    { t: '光尘 +' + dust + ' · 赛季 XP +' + xp + (isBest ? ' · 新纪录！' : ''), s: 12, c: COL.gold },
    { t: '本机最佳：' + Math.max(prevBest, reached) + ' 波', s: 12, c: COL.sub }
  ]
  if (c.forgeLv > 0) lines.push({ t: '⚒ 锻造 ' + c.forgeLv + ' 级 · 最终伤害 ×' + c.damageMul().toFixed(2), s: 12, c: COL.gold })
  if (achNew > 0) lines.push({ t: '🏅 解锁 ' + achNew + ' 项守卫成就', s: 12, c: COL.gold })
  if (cxNew.length > 0) lines.push({ t: '📖 图鉴里程碑达成 ' + cxNew.length + ' 项', s: 12, c: COL.gold })
  if (taskDone) lines.push({ t: '🎉 任务达成！', s: 12, c: '#6FE3D2' })

  this.modal = new Modal(this.sm, {
    title: '地宫失守',
    lines: lines,
    buttons: [
      { label: '再来一局', primary: true, onTap: function () { self.modal = null; self.enter({}) } },
      { label: '返回首页', onTap: function () { self.modal = null; self.sm.switch('home') } }
    ],
    onClose: function () { self.modal = null }
  })
}
TowerScene.prototype.back = function () {
  if (this.modal) return
  this.sm.switch('home')
}

/* ============ 绘制 ============ */
TowerScene.prototype.drawBoard = function (ctx) {
  const c = this.core
  const v = this.view
  const cell = this.cell
  const g = c.grid
  ctx.fillStyle = COL.wall
  ctx.fillRect(v.x, v.y, v.w, v.h)
  ctx.fillStyle = COL.road
  for (let y = 0; y < c.H; y++) {
    for (let x = 0; x < c.W; x++) {
      if (g[y][x] === 1) ctx.fillRect(v.x + x * cell, v.y + y * cell, cell + 0.5, cell + 0.5)
    }
  }
  ctx.beginPath()
  for (let i = 0; i < c.path.length; i++) {
    const p = c.path[i]
    if (i === 0) ctx.moveTo(this.px(p.x), this.py(p.y))
    else ctx.lineTo(this.px(p.x), this.py(p.y))
  }
  ctx.strokeStyle = COL.path
  ctx.lineWidth = Math.max(2, cell * 0.5)
  ctx.lineJoin = 'round'
  ctx.stroke()

  if (this.selType) {
    const occ = {}
    for (let i = 0; i < c.towers.length; i++) occ[c.towers[i].key] = 1
    ctx.fillStyle = 'rgba(255,255,255,0.13)'
    for (let i = 0; i < c.slots.length; i++) {
      const s = c.slots[i]
      if (occ[s.key]) continue
      ctx.fillRect(this.px(s.x) - cell * 0.14, this.py(s.y) - cell * 0.14, cell * 0.28, cell * 0.28)
    }
  }

  const sx = this.px(c.start.x)
  const sy = this.py(c.start.y)
  ctx.beginPath()
  ctx.arc(sx, sy, cell * 0.42, 0, 6.283)
  ctx.fillStyle = COL.danger
  ctx.fill()
  const kx = this.px(c.corePos.x)
  const ky = this.py(c.corePos.y)
  ctx.beginPath()
  ctx.moveTo(kx, ky - cell * 0.5)
  ctx.lineTo(kx + cell * 0.5, ky)
  ctx.lineTo(kx, ky + cell * 0.5)
  ctx.lineTo(kx - cell * 0.5, ky)
  ctx.closePath()
  ctx.fillStyle = COL.gold
  ctx.fill()

  if (this.ghost) {
    const d = TOWER_DEFS[this.ghost.type]
    const gx = this.px(this.ghost.slot.x)
    const gy = this.py(this.ghost.slot.y)
    const r = (d.range + c.bless.range) * cell
    ctx.beginPath()
    ctx.arc(gx, gy, r, 0, 6.283)
    ctx.fillStyle = 'rgba(111,227,210,0.08)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(111,227,210,0.5)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.globalAlpha = 0.6
    ctx.beginPath()
    ctx.arc(gx, gy, cell * 0.42, 0, 6.283)
    ctx.fillStyle = d.color
    ctx.fill()
    ctx.globalAlpha = 1
  }
}

TowerScene.prototype.drawEntities = function (ctx) {
  const c = this.core
  const cell = this.cell
  for (let i = 0; i < c.shots.length; i++) {
    const s = c.shots[i]
    ctx.beginPath()
    ctx.moveTo(this.px(s.x), this.py(s.y))
    ctx.lineTo(this.px(s.tx), this.py(s.ty))
    ctx.strokeStyle = s.color
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
  for (let i = 0; i < c.towers.length; i++) {
    const t = c.towers[i]
    const d = TOWER_DEFS[t.type]
    const X = this.px(t.x)
    const Y = this.py(t.y)
    if (t === this.selTower) {
      ctx.beginPath()
      ctx.arc(X, Y, c.towerRange(t) * cell, 0, 6.283)
      ctx.fillStyle = 'rgba(255,193,94,0.08)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,193,94,0.6)'
      ctx.lineWidth = 1
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.arc(X, Y, cell * 0.42, 0, 6.283)
    ctx.fillStyle = d.color
    ctx.fill()
    ctx.fillStyle = COL.bg
    for (let j = 0; j < t.lv; j++) {
      ctx.fillRect(X - cell * 0.3 + j * cell * 0.2, Y + cell * 0.18, cell * 0.14, cell * 0.14)
    }
  }
  for (let i = 0; i < c.enemies.length; i++) {
    const e = c.enemies[i]
    if (!e.alive) continue
    const X = this.px(e.x)
    const Y = this.py(e.y)
    ctx.beginPath()
    ctx.arc(X, Y, cell * 0.3, 0, 6.283)
    ctx.fillStyle = e.color
    ctx.fill()
    const w = cell * 0.7
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(X - w / 2, Y - cell * 0.58, w, 2)
    ctx.fillStyle = '#7FE8C0'
    ctx.fillRect(X - w / 2, Y - cell * 0.58, w * Math.max(0, e.hp / e.maxHp), 2)
  }
}

TowerScene.prototype.drawHud = function (ctx, W, H, u) {
  const c = this.core
  const sat = this.sm.sat || 0
  ctx.fillStyle = 'rgba(10,10,26,0.94)'
  ctx.fillRect(0, 0, W, this.hudH)
  ctx.fillRect(0, this.footY, W, H - this.footY)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.font = Math.round(13 * u) + 'px sans-serif'
  ctx.fillStyle = COL.gold
  ctx.fillText('第 ' + Math.max(1, c.wave) + ' 波', 56 * u, sat + 20 * u)
  ctx.fillStyle = COL.text
  ctx.fillText('¥ ' + c.gold, 56 * u, sat + 40 * u)
  ctx.textAlign = 'right'
  ctx.fillStyle = c.hp > 6 ? COL.text : COL.danger
  ctx.fillText('核心 ' + c.hp + '/' + c.hpMax, W - 10 * u, sat + 20 * u)
  let status
  if (c.phase === 'prep') status = '布防 ' + Math.max(0, Math.ceil(c.prepLeft)) + 's'
  else if (c.phase === 'wave') status = '剩余 ' + (c.enemies.length + c.spawnQueue.length) + ' 只'
  else if (c.phase === 'interlude') status = '选择赐福'
  else status = '本局结束'
  ctx.font = Math.round(11 * u) + 'px sans-serif'
  ctx.fillStyle = COL.sub
  ctx.fillText(status, W - 10 * u, sat + 40 * u)
  ctx.textAlign = 'left'
  ctx.fillText('选塔 → 点地图放置 → 确认', 10 * u, this.footY + 17 * u)
}

TowerScene.prototype.drawBanner = function (ctx, W, u) {
  if (!this.banner || Date.now() >= this.banner.until) return
  ctx.textAlign = 'center'
  ctx.font = Math.round(20 * u) + 'px sans-serif'
  ctx.fillStyle = this.banner.color
  ctx.fillText(this.banner.text, W / 2, this.hudH + 26 * u)
  ctx.textAlign = 'left'
}
TowerScene.prototype.drawToast = function (ctx, W, H, u) {
  if (!this.toastMsg || Date.now() >= this.toastUntil) return
  ctx.textAlign = 'center'
  ctx.font = Math.round(13 * u) + 'px sans-serif'
  ctx.fillStyle = 'rgba(10,10,26,0.9)'
  ctx.fillRect(W / 2 - 130 * u, this.footY - 40 * u, 260 * u, 30 * u)
  ctx.fillStyle = COL.text
  ctx.fillText(this.toastMsg, W / 2, this.footY - 25 * u)
  ctx.textAlign = 'left'
}

TowerScene.prototype.draw = function (ctx) {
  if (!this.core || !this.view) return
  const W = this.sm.W
  const H = this.sm.H
  const u = this.u
  ctx.fillStyle = COL.bg
  ctx.fillRect(0, 0, W, H)
  this.drawBoard(ctx)
  this.drawEntities(ctx)
  this.drawHud(ctx, W, H, u)
  for (let i = 0; i < this.btns.length; i++) this.btns[i].draw(ctx)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  this.drawBanner(ctx, W, u)
  this.drawToast(ctx, W, H, u)
  if (this.modal) this.modal.draw(ctx)
}

module.exports = TowerScene
