/**
 * 地宫守卫 · 塔防核心算法（P1）
 * - 纯算法层：无 wx 依赖，可在 node 里直接 require 做回归
 * - 地图与路径由独立模块 core/mapgen.js 提供（v1.4 硬删除后已与迷宫玩法解耦）；
 *   塔建在墙格不占路，因此 BFS 路径一次算完全波恒定，无需每帧重算
 * - 出生点→核心 BFS 距离限定 20~28 格（用户拍板），保证单波约 10~17 秒
 * - 状态机：prep（布防 8s）→ wave（实时）→ interlude（三选一赐福）→ over
 */
const mapgen = require('./mapgen')

/* ============ 确定性随机 ============ */
function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ============ v1.4 实测调平：战斗数值单一事实来源 ============
 * 与 core/mode.js 的 WAVE_RULES 分工：
 *   - WAVE_RULES 管「一局结束后」的光尘 / 赛季 XP / 成就口径；
 *   - WAVE_TUNING 管「一局之内」的经济、难度曲线、塔成长与金币出口。
 * 禁止在业务代码里另写魔法数字。
 *
 * 仿真基线（v1.4.0）：真实玩家前 9~17 波满血零漏怪，第 15 波后断崖式崩盘；
 * 12 座 Lv3 后战力封顶而敌人 HP 仍线性增长，金币从第 14 波 523 涨到第 19 波 2270 无处可花。
 * 本次三条对策：① 收紧前期经济制造取舍；② HP 曲线加二次项让压力渐进；
 * ③ 塔等级上限 Lv5 + 全局锻造，让溢出金币持续转化为战力（消除断崖）。
 */
const WAVE_TUNING = {
  startGold: 100,            // 原 120：开局只够 1 座弩塔 + 余款，第一波就要做取舍
  countBase: 6,
  countPerWave: 1.5,
  hpLinear: 0.26,            // 原 0.28 线性
  hpQuad: 0.004,             // 二次项：让压力逐波可感知，而非一条平线后突然崩塌
  hpDeepStart: 30,           // 30 波后进入深渊加速
  hpDeepPerWave: 0.42,
  spawnGapBase: 0.52,        // 原 0.55：前期即有轻微出场积压
  spawnGapPerWave: 0.017,
  spawnGapMin: 0.17,         // 原 0.18
  bonusBase: 16,             // 原 20+5n → 16+4n，温和收紧波奖（赏金仍是主收入）
  bonusPerWave: 4,
  maxTowerLv: 5,             // 原 3：12 座塔的金币坑加深，战力得以延续
  upgradeBase: 0.8,          // Lv1→2 = 0.8×造价
  upgradeStep: 0.6,          // 每级 +0.6（Lv4→5 = 2.6×造价）
  forgeBase: 80,             // 全局锻造：全体塔伤害 +8%/级，价格指数递增
  forgeGrowth: 1.35,
  forgeDmgStep: 0.08,
  forgeMax: 15               // 硬上限（最高 ×2.2），防止高波数无限叠乘后无敌
}
const MAX_TOWER_LV = WAVE_TUNING.maxTowerLv

/* ============ 静态配置 ============ */
const TOWER_DEFS = {
  arrow: { key: 'arrow', name: '弩塔', cost: 60, dmg: 12, cd: 0.8, range: 3.2, color: '#6FE3D2', splash: 0 },
  frost: { key: 'frost', name: '霜塔', cost: 80, dmg: 4, cd: 1.0, range: 2.8, color: '#8FD8FF', splash: 0, slow: 0.35, slowDur: 1.5 },
  flame: { key: 'flame', name: '炎塔', cost: 110, dmg: 9, cd: 1.2, range: 2.4, color: '#FF9F6E', splash: 1.2 },
  spark: { key: 'spark', name: '雷塔', cost: 90, dmg: 18, cd: 1.6, range: 3.6, color: '#FFC15E', splash: 0 }
}
const TOWER_ORDER = ['arrow', 'frost', 'flame', 'spark']

const ENEMY_DEFS = {
  wisp:  { key: 'wisp', name: '游魂', hp: 30, speed: 1.6, bounty: 8, leak: 1, color: '#B9A7FF' },
  swift: { key: 'swift', name: '迅影', hp: 20, speed: 2.8, bounty: 6, leak: 1, color: '#7FE8C0' },
  brute: { key: 'brute', name: '石卫', hp: 90, speed: 0.9, bounty: 14, leak: 2, color: '#D8856B' },
  boss:  { key: 'boss', name: '层主', hp: 600, speed: 0.7, bounty: 100, leak: 5, color: '#FF6B81' }
}

// 复用 PlayCore.WAVE_TALENTS 的 6 个 key，只改效果语义（零新增数据表）
const BLESS_KEYS = ['torch', 'magnet', 'iron', 'swift', 'alch', 'greed']
const BLESSINGS = {
  torch:  { name: '火炬', desc: '全体塔射程 +1 格', ick: 'eye' },
  magnet: { name: '磁石', desc: '击杀赏金 +15%', ick: 'spark' },
  iron:   { name: '铁壁', desc: '核心立即修复 +3', ick: 'shield' },
  swift:  { name: '疾风', desc: '全体塔攻速 +10%', ick: 'sword' },
  alch:   { name: '炼金', desc: '塔造价 -15%', ick: 'leaf' },
  greed:  { name: '贪婪', desc: '波次结算金币 +30%', ick: 'spark' }
}

const MAX_TOWERS = 12
const HP_MAX = 20
const PREP_SEC = 8
const PATH_MIN = 20
const PATH_MAX = 28

/* ============ 纯函数：BFS 距离场 ============ */
function distanceField(grid, from) {
  const H = grid.length
  const W = grid[0].length
  const dist = []
  for (let y = 0; y < H; y++) dist.push(new Array(W).fill(-1))
  const q = [[from.x, from.y]]
  dist[from.y][from.x] = 0
  let head = 0
  const DX = [0, 0, -1, 1]
  const DY = [-1, 1, 0, 0]
  while (head < q.length) {
    const cur = q[head++]
    const cx = cur[0]
    const cy = cur[1]
    for (let i = 0; i < 4; i++) {
      const nx = cx + DX[i]
      const ny = cy + DY[i]
      if (nx >= 0 && nx < W && ny >= 0 && ny < H && grid[ny][nx] === 1 && dist[ny][nx] === -1) {
        dist[ny][nx] = dist[cy][cx] + 1
        q.push([nx, ny])
      }
    }
  }
  return dist
}

/* ============ 纯函数：从合法塔位中找最近未占用格 ============ */
function nearestSlot(slots, cx, cy, occupied, maxDist) {
  let best = null
  let bestD = (maxDist === undefined ? 3.5 : maxDist) * (maxDist === undefined ? 3.5 : maxDist)
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i]
    if (occupied[s.key]) continue
    const dx = s.x - cx
    const dy = s.y - cy
    const d = dx * dx + dy * dy
    if (d < bestD) { bestD = d; best = s }
  }
  return best
}

/* ============ 波次数值（纯函数，供测试直接断言） ============ */
function waveCount(n) {
  return WAVE_TUNING.countBase + Math.floor(n * WAVE_TUNING.countPerWave)
}
function waveHpMul(n) {
  const k = n - 1
  // 二次项是关键：纯线性时 12 座满级塔在前 14 波完全无压力，之后 3 波内直接崩盘。
  const quad = function (kk) {
    return 1 + WAVE_TUNING.hpLinear * kk + WAVE_TUNING.hpQuad * kk * kk
  }
  if (n <= WAVE_TUNING.hpDeepStart) return quad(k)
  const cap = WAVE_TUNING.hpDeepStart - 1
  return quad(cap) + (n - WAVE_TUNING.hpDeepStart) * WAVE_TUNING.hpDeepPerWave
}
function waveSpeedMul(n) { return Math.min(1 + (n - 1) * 0.02, 1.5) }
// 出场密度才是难度主杠杆：间隔过宽时塔能「来一只秒一只」，HP 再高也不积压
function waveSpawnGap(n) {
  return Math.max(WAVE_TUNING.spawnGapMin, WAVE_TUNING.spawnGapBase - (n - 1) * WAVE_TUNING.spawnGapPerWave)
}
function waveBonus(n) {
  return WAVE_TUNING.bonusBase + WAVE_TUNING.bonusPerWave * n
}

/* ============ 构造 ============ */
function TowerCore(level, opts) {
  opts = opts || {}
  this.level = level || 30
  this.aspect = opts.aspect || 1.5
  this.seed = (opts.seed === undefined ? (30 * 2654435761) >>> 0 : opts.seed) >>> 0 || 1
  this.rng = mulberry32(this.seed)
  this.events = []

  this.phase = 'prep'
  this.wave = 0
  this.reached = 0
  this.gold = WAVE_TUNING.startGold
  // 字段名必须与原型方法 forge() 区分：同名实例字段会遮蔽方法（c.forge is not a function）
  this.forgeLv = 0
  this.hp = HP_MAX
  this.hpMax = HP_MAX
  this.prepLeft = PREP_SEC
  this.waveClock = 0
  this.towers = []
  this.enemies = []
  this.shots = []
  this.spawnQueue = []
  this.offers = []
  this.kills = 0
  this.leaks = 0
  this.bless = { range: 0, bounty: 0, atkSpeed: 0, cost: 0, waveGold: 0 }

  this.buildMap()
}

TowerCore.prototype.emit = function (type, data) {
  this.events.push({ type: type, data: data || {} })
}
TowerCore.prototype.drain = function () {
  const e = this.events
  this.events = []
  return e
}

/* ============ 建图：路径 + 合法塔位 ============ */
TowerCore.prototype.buildMap = function () {
  const m = mapgen.generateMaze(30, this.aspect, this.seed)
  this.grid = m.grid
  this.W = m.W
  this.H = m.H
  this.start = { x: m.start.x, y: m.start.y }

  const dist = distanceField(this.grid, this.start)
  // 优先取 24~28 格（路径更长、塔覆盖机会更多），不足再放宽到 20~28
  const pickFrom = function (lo, hi) {
    const out = []
    for (let y = 2; y < this.H - 2; y++) {
      for (let x = 2; x < this.W - 2; x++) {
        const d = dist[y][x]
        if (this.grid[y][x] === 1 && d >= lo && d <= hi) out.push({ x: x, y: y, d: d })
      }
    }
    return out
  }.bind(this)

  let cands = pickFrom(24, PATH_MAX)
  if (!cands.length) cands = pickFrom(PATH_MIN, PATH_MAX)
  if (!cands.length) {
    // 极端兜底：取可达且最远的路格
    let far = null
    for (let y = 1; y < this.H - 1; y++) {
      for (let x = 1; x < this.W - 1; x++) {
        if (this.grid[y][x] === 1 && dist[y][x] >= 8 && (!far || dist[y][x] > far.d)) far = { x: x, y: y, d: dist[y][x] }
      }
    }
    cands = far ? [far] : [{ x: m.end.x, y: m.end.y, d: 0 }]
  }
  this.corePos = cands[Math.floor(this.rng() * cands.length)]

  const tail = mapgen.bfsPath(this.grid, this.start, this.corePos) || []
  this.path = [this.start].concat(tail)
  this.pathLen = this.path.length - 1
  this.pathDist = dist[this.corePos.y][this.corePos.x]

  this.slots = []
  for (let y = 1; y < this.H - 1; y++) {
    for (let x = 1; x < this.W - 1; x++) {
      if (this.isSlot(x, y)) this.slots.push({ x: x, y: y, key: x + ',' + y })
    }
  }
}

TowerCore.prototype.isSlot = function (x, y) {
  if (x <= 0 || y <= 0 || x >= this.W - 1 || y >= this.H - 1) return false
  if (this.grid[y][x] !== 0) return false
  const g = this.grid
  if (!(g[y - 1][x] === 1 || g[y + 1][x] === 1 || g[y][x - 1] === 1 || g[y][x + 1] === 1)) return false
  if (Math.abs(x - this.start.x) + Math.abs(y - this.start.y) <= 1) return false
  if (Math.abs(x - this.corePos.x) + Math.abs(y - this.corePos.y) <= 1) return false
  return true
}

TowerCore.prototype.pathAt = function (t) {
  const i = Math.floor(t)
  const f = t - i
  const a = this.path[Math.max(0, Math.min(i, this.path.length - 1))]
  const b = this.path[Math.max(0, Math.min(i + 1, this.path.length - 1))]
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }
}

/* ============ 塔：建造 / 升级 / 出售 ============ */
TowerCore.prototype.towerAt = function (x, y) {
  const k = x + ',' + y
  for (let i = 0; i < this.towers.length; i++) if (this.towers[i].key === k) return this.towers[i]
  return null
}
TowerCore.prototype.costOf = function (type) {
  const d = TOWER_DEFS[type]
  if (!d) return 0
  return Math.round(d.cost * (1 - this.bless.cost))
}
TowerCore.prototype.canBuild = function (slot, type) {
  if (!slot || !TOWER_DEFS[type]) return { ok: false, msg: '无效的建塔位置' }
  if (this.phase === 'over') return { ok: false, msg: '本局已结束' }
  if (!this.isSlot(slot.x, slot.y)) return { ok: false, msg: '这里无法建塔' }
  if (this.towerAt(slot.x, slot.y)) return { ok: false, msg: '此处已有防御塔' }
  if (this.towers.length >= MAX_TOWERS) return { ok: false, msg: '最多只能建造 12 座塔' }
  const cost = this.costOf(type)
  if (this.gold < cost) return { ok: false, msg: '金币不足（需要 ' + cost + '）' }
  return { ok: true, cost: cost }
}
TowerCore.prototype.build = function (slot, type) {
  const chk = this.canBuild(slot, type)
  if (!chk.ok) { this.emit('hint', { text: chk.msg }); return false }
  this.gold -= chk.cost
  const t = {
    type: type, x: slot.x, y: slot.y, key: slot.x + ',' + slot.y,
    lv: 1, invest: chk.cost, cd: 0
  }
  this.towers.push(t)
  this.emit('build', { type: type, x: t.x, y: t.y, cost: chk.cost })
  return true
}
TowerCore.prototype.upgradeCost = function (t) {
  if (!t) return 0
  // Lv1→2 = 0.8×造价，之后每级 +0.6×造价：把金币坑从 12 座 ×2 级加深到 ×4 级
  return Math.round(TOWER_DEFS[t.type].cost *
    (WAVE_TUNING.upgradeBase + WAVE_TUNING.upgradeStep * (t.lv - 1)))
}
TowerCore.prototype.upgrade = function (t) {
  if (!t || this.phase === 'over') return false
  if (t.lv >= MAX_TOWER_LV) { this.emit('hint', { text: '已达最高等级' }); return false }
  const c = this.upgradeCost(t)
  if (this.gold < c) { this.emit('hint', { text: '金币不足（需要 ' + c + '）' }); return false }
  this.gold -= c
  t.invest += c
  t.lv++
  this.emit('upgrade', { type: t.type, lv: t.lv, cost: c })
  return true
}

/* ============ 金币出口：全局锻造（本局有效，价格指数递增） ============
 * 12 座塔全部 Lv5 后金币仍会继续积累，锻造提供无限但有边际成本的战力出口，
 * 让高波数靠经营延续，而不是「战力封顶 → 敌人 HP 线性增长 → 必然断崖」。
 */
TowerCore.prototype.damageMul = function () {
  return 1 + this.forgeLv * WAVE_TUNING.forgeDmgStep
}
TowerCore.prototype.forgeCost = function () {
  if (this.forgeLv >= WAVE_TUNING.forgeMax) return 0
  return Math.round(WAVE_TUNING.forgeBase * Math.pow(WAVE_TUNING.forgeGrowth, this.forgeLv))
}
TowerCore.prototype.forge = function () {
  if (this.phase === 'over') return false
  if (this.forgeLv >= WAVE_TUNING.forgeMax) {
    this.emit('hint', { text: '锻造已达上限' })
    return false
  }
  const c = this.forgeCost()
  if (this.gold < c) { this.emit('hint', { text: '金币不足（需要 ' + c + '）' }); return false }
  this.gold -= c
  this.forgeLv++
  this.emit('forge', { lv: this.forgeLv, cost: c, dmgMul: this.damageMul() })
  return true
}
TowerCore.prototype.sell = function (t) {
  if (!t || this.phase === 'over') return false
  const back = Math.round(t.invest * 0.6)
  const idx = this.towers.indexOf(t)
  if (idx < 0) return false
  this.towers.splice(idx, 1)
  this.gold += back
  this.emit('sell', { type: t.type, back: back })
  return true
}
TowerCore.prototype.snap = function (cx, cy) {
  const occ = {}
  for (let i = 0; i < this.towers.length; i++) occ[this.towers[i].key] = 1
  return nearestSlot(this.slots, cx, cy, occ)
}
TowerCore.prototype.towerRange = function (t) {
  return TOWER_DEFS[t.type].range + this.bless.range + (t.lv - 1) * 0.5
}

/* ============ 波次 ============ */
TowerCore.prototype.startWave = function () {
  if (this.phase === 'over') return false
  this.wave++
  this.waveClock = 0
  this.prepLeft = 0
  const n = this.wave
  const count = waveCount(n)
  const hpMul = waveHpMul(n)
  const spdMul = waveSpeedMul(n)
  const gap = waveSpawnGap(n)
  const q = []
  for (let i = 0; i < count; i++) {
    let type = 'wisp'
    if (n % 10 === 0 && i === count - 1) type = 'boss'
    else if (n % 5 === 0 && i % 4 === 0) type = 'brute'
    else if (i % 3 === 1) type = 'swift'
    q.push({ type: type, at: i * gap, hpMul: hpMul, spdMul: spdMul })
  }
  this.spawnQueue = q
  this.phase = 'wave'
  this.emit('wave', { wave: n, count: count, hpMul: hpMul })
  return true
}
TowerCore.prototype.startNow = function () {
  if (this.phase !== 'prep') return false
  this.gold += 10
  this.emit('hint', { text: '提前开波 · 金币 +10' })
  return this.startWave()
}
TowerCore.prototype.spawn = function (s) {
  const d = ENEMY_DEFS[s.type]
  const hp = Math.round(d.hp * s.hpMul)
  this.enemies.push({
    type: s.type, hp: hp, maxHp: hp, t: 0,
    x: this.start.x, y: this.start.y,
    speed: d.speed * s.spdMul, slowT: 0,
    bounty: d.bounty, leak: d.leak, color: d.color, alive: true
  })
}
TowerCore.prototype.updateSpawns = function () {
  while (this.spawnQueue.length && this.spawnQueue[0].at <= this.waveClock) {
    this.spawn(this.spawnQueue.shift())
  }
}

/* ============ 敌人移动与漏怪 ============ */
TowerCore.prototype.updateEnemies = function (dt) {
  const arr = this.enemies
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i]
    if (!e.alive) continue
    const slow = e.slowT > 0 ? 0.65 : 1
    e.t += e.speed * slow * dt
    if (e.slowT > 0) e.slowT = Math.max(0, e.slowT - dt)
    if (e.t >= this.pathLen) {
      e.alive = false
      this.hp -= e.leak
      this.leaks++
      this.emit('leak', { type: e.type, hp: this.hp, dmg: e.leak })
      if (this.hp <= 0) { this.hp = 0; this.gameOver() }
      continue
    }
    const p = this.pathAt(e.t)
    e.x = p.x
    e.y = p.y
  }
  this.enemies = arr.filter(function (e) { return e.alive })
}

/* ============ 塔自动攻击 ============ */
TowerCore.prototype.findTarget = function (x, y, range) {
  let best = null
  const r2 = range * range
  for (let i = 0; i < this.enemies.length; i++) {
    const e = this.enemies[i]
    if (!e.alive) continue
    const dx = e.x - x
    const dy = e.y - y
    if (dx * dx + dy * dy <= r2 && (!best || e.t > best.t)) best = e
  }
  return best
}
TowerCore.prototype.dealDamage = function (target, dmg, def) {
  const self = this
  const mul = this.damageMul()   // 全局锻造加成：直击与溅射一视同仁
  const hit = function (e, amount) {
    if (!e || !e.alive) return
    e.hp -= amount
    if (e.hp <= 0) {
      e.alive = false
      const gold = Math.round(e.bounty * (1 + self.bless.bounty))
      self.gold += gold
      self.kills++
      self.emit('kill', { type: e.type, gold: gold })
    }
  }
  hit(target, dmg * mul)
  if (def.splash > 0) {
    const r2 = def.splash * def.splash
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i]
      if (!e.alive || e === target) continue
      const dx = e.x - target.x
      const dy = e.y - target.y
      if (dx * dx + dy * dy <= r2) hit(e, dmg * 0.6 * mul)
    }
  }
  if (def.slow && target.alive) target.slowT = def.slowDur
}
TowerCore.prototype.updateTowers = function (dt) {
  for (let i = 0; i < this.towers.length; i++) {
    const t = this.towers[i]
    const def = TOWER_DEFS[t.type]
    t.cd -= dt
    if (t.cd > 0) continue
    const target = this.findTarget(t.x, t.y, this.towerRange(t))
    if (!target) continue
    t.cd = def.cd / (1 + this.bless.atkSpeed)
    this.dealDamage(target, def.dmg * (1 + (t.lv - 1) * 0.5), def)
    this.shots.push({ x: t.x, y: t.y, tx: target.x, ty: target.y, life: 0.18, color: def.color })
  }
}
TowerCore.prototype.updateShots = function (dt) {
  const out = []
  for (let i = 0; i < this.shots.length; i++) {
    const s = this.shots[i]
    s.life -= dt
    if (s.life > 0) out.push(s)
  }
  this.shots = out
}

/* ============ 波次结算与赐福 ============ */
TowerCore.prototype.checkWaveEnd = function () {
  if (this.phase !== 'wave') return
  this.enemies = this.enemies.filter(function (e) { return e.alive })
  if (this.spawnQueue.length || this.enemies.length) return
  this.reached = this.wave
  const bonus = Math.round(waveBonus(this.wave) * (1 + this.bless.waveGold))
  this.gold += bonus
  this.offers = this.pickBlessings()
  this.phase = 'interlude'
  this.emit('waveclear', { wave: this.wave, bonus: bonus, offers: this.offers.slice() })
}
TowerCore.prototype.pickBlessings = function () {
  const pool = BLESS_KEYS.slice()
  const out = []
  while (out.length < 3 && pool.length) {
    out.push(pool.splice(Math.floor(this.rng() * pool.length), 1)[0])
  }
  return out
}
TowerCore.prototype.chooseBlessing = function (k) {
  if (this.phase !== 'interlude') return false
  // k 为 null/undefined 表示「跳过」：只推进状态机，不发增益
  if (k !== null && k !== undefined && BLESS_KEYS.indexOf(k) === -1) return false
  // 叠加上限是硬约束：无上限时 21 次「疾风」会把攻速推到 ×3.1，压塌整条难度曲线
  if (k === 'torch') this.bless.range = Math.min(3, this.bless.range + 1)
  else if (k === 'magnet') this.bless.bounty = Math.min(0.6, this.bless.bounty + 0.15)
  else if (k === 'iron') this.hp = Math.min(this.hpMax, this.hp + 3)
  else if (k === 'swift') this.bless.atkSpeed = Math.min(0.5, this.bless.atkSpeed + 0.1)
  else if (k === 'alch') this.bless.cost = Math.min(0.4, this.bless.cost + 0.15)
  else if (k === 'greed') this.bless.waveGold = Math.min(0.9, this.bless.waveGold + 0.3)
  this.offers = []
  this.phase = 'prep'
  this.prepLeft = PREP_SEC
  this.emit('bless', { key: k || 'skip' })
  return true
}

/* ============ 主循环 ============ */
TowerCore.prototype.gameOver = function () {
  if (this.phase === 'over') return
  this.phase = 'over'
  this.hp = Math.max(0, this.hp)
  this.emit('gameover', { wave: this.wave, reached: this.reached, kills: this.kills })
}
TowerCore.prototype.tick = function (dt) {
  if (this.phase === 'over' || this.phase === 'interlude') return
  dt = Math.max(0, Math.min(dt || 0, 0.1))
  if (this.phase === 'prep') {
    this.prepLeft -= dt
    if (this.prepLeft <= 0) this.startWave()
    return
  }
  if (this.phase !== 'wave') return
  this.waveClock += dt
  this.updateSpawns()
  this.updateEnemies(dt)
  if (this.phase === 'over') return
  this.updateTowers(dt)
  this.updateShots(dt)
  this.checkWaveEnd()
}
TowerCore.prototype.stats = function () {
  return {
    wave: this.wave, reached: this.reached, gold: this.gold,
    hp: this.hp, hpMax: this.hpMax, kills: this.kills, leaks: this.leaks,
    towers: this.towers.length, pathLen: this.pathLen, pathDist: this.pathDist,
    forge: this.forgeLv, dmgMul: this.damageMul(),
    phase: this.phase
  }
}

module.exports = TowerCore
module.exports.TowerCore = TowerCore
module.exports.TOWER_DEFS = TOWER_DEFS
module.exports.TOWER_ORDER = TOWER_ORDER
module.exports.ENEMY_DEFS = ENEMY_DEFS
module.exports.BLESSINGS = BLESSINGS
module.exports.BLESS_KEYS = BLESS_KEYS
module.exports.distanceField = distanceField
module.exports.nearestSlot = nearestSlot
module.exports.waveCount = waveCount
module.exports.waveHpMul = waveHpMul
module.exports.waveSpeedMul = waveSpeedMul
module.exports.waveSpawnGap = waveSpawnGap
module.exports.waveBonus = waveBonus
module.exports.WAVE_TUNING = WAVE_TUNING
module.exports.MAX_TOWER_LV = MAX_TOWER_LV
module.exports.MAX_TOWERS = MAX_TOWERS
module.exports.PREP_SEC = PREP_SEC
module.exports.PATH_MIN = PATH_MIN
module.exports.PATH_MAX = PATH_MAX
