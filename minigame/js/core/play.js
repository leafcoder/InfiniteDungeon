/**
 * PlayCore —— 无头游戏核心（M2）
 * 行为 1:1 移植自 pages/game/game.js（移动/怪物/道具/机关/胜负），零 UI、零存储依赖：
 * - 迷宫与放置全部复用 core/maze.js 纯函数
 * - 事件通过 events 队列交给场景层（音效/粒子/结算由 GameScene 处理）
 * - node 无 wx 环境可完整跑通（回归测试用）
 * 已移植：滑动转向/缓冲、路口等待、拐角自动转、单向门、传送门、宝藏暗室、闸门、
 *        钥匙与终点锁、迷雾、巡逻/追击/射击怪、警戒衰减、Boss 限时追逐（含狂暴阶段）、
 *        守门怪、逃跑 Boss、道具背包（3 槽）、磁铁、护盾、冰冻、隐身、加速、诱饵、
 *        沙漏自动回溯、虚空充能、词缀（浓雾/夜幕/疾走/泥沼/禁补/围剿）、
 *        生存波次（无尽）、技能（闪现步/透视眼）、复活（广告）。
 */
const maze = require('./maze')

const DIRV = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] }
const OPPD = { U: 'D', D: 'U', L: 'R', R: 'L' }
const BAG_MAX = 3
const FX_TYPES = ['cloak', 'freeze', 'dash', 'shield', 'magnet', 'flare', 'decoy', 'hourglass', 'scroll']

function PlayCore(level, opts) {
  opts = opts || {}
  this.level = level
  this.seed = opts.seed
  this.aspect = opts.aspect || 1
  this.mods = opts.mods || []          // 词缀 key 数组（与 weekly.MODS 同源）
  this.survival = !!opts.survival      // 生存模式（无尽波次）
  this.fxDur = opts.fxDur || function () { return 8000 }
  this.stepMul = opts.stepMul || 1     // 疾风天赋步频倍率（<1 更快）
  this.survTalents = {}                // 生存波间天赋计数（N1，当局有效）
  this.events = []
  this.now = 0
  this._t0 = null
  this.initLevel()
}

PlayCore.prototype.emit = function (type, data) {
  this.events.push({ type: type, data: data })
}

PlayCore.prototype.drain = function () {
  const e = this.events
  this.events = []
  return e
}

// 词缀开关（mods: key 数组）
PlayCore.prototype.modOn = function (k) {
  return this.mods.indexOf(k) !== -1
}

// BFS 洪泛：距玩家 ≥minD 的可走格（按距离降序取 n 个），生存波次/围剿影卫用
PlayCore.prototype.findFarCells = function (px, py, minD, n) {
  const grid = this.maze.grid
  const H = grid.length
  const W = grid[0].length
  const dist = {}
  const q = [[px, py]]
  dist[px + ',' + py] = 0
  let head = 0
  while (head < q.length) {
    const cur = q[head++]
    const cx = cur[0]
    const cy = cur[1]
    const dirs = ['U', 'D', 'L', 'R']
    for (let i = 0; i < dirs.length; i++) {
      const nx = cx + DIRV[dirs[i]][0]
      const ny = cy + DIRV[dirs[i]][1]
      if (nx >= 0 && nx < W && ny >= 0 && ny < H && grid[ny][nx] === 1 && dist[nx + ',' + ny] === undefined) {
        dist[nx + ',' + ny] = dist[cx + ',' + cy] + 1
        q.push([nx, ny])
      }
    }
  }
  const far = []
  for (const k in dist) {
    if (dist[k] >= minD) {
      const p = k.split(',')
      far.push({ x: +p[0], y: +p[1], d: dist[k] })
    }
  }
  far.sort(function (a, b) { return b.d - a.d })
  return far.slice(0, n * 2)
}

PlayCore.prototype.initLevel = function () {
  const level = this.level
  let m = maze.generateMaze(level, this.aspect, this.seed)
  // 虚空回响（L101+）：左右镜像迷宫
  this.voidZone = level >= 101
  if (this.voidZone) m = maze.mirrorMaze(m)
  this.maze = m

  // 迷雾（L41+ / 词缀 浓雾·夜幕 / 生存模式）
  this.darkMode = this.modOn('dark')
  this.fogEnabled = level >= 41 || this.darkMode || this.modOn('fog') || this.survival
  this.seen = null
  if (this.fogEnabled) {
    this.seen = []
    for (let y = 0; y < m.H; y++) this.seen.push(new Array(m.W).fill(false))
  }

  // 玩家状态机（与 maze.step 契约一致）
  this.state = { x: m.start.x, y: m.start.y, dir: null, cameFrom: null, atFork: false, visited: {} }
  this.state.visited[m.start.x + ',' + m.start.y] = true
  this.visual = { x: m.start.x, y: m.start.y }

  // 放置顺序铁律：怪物 → 传送门 → 单向门 → 暗室 → 闸门 → 道具 → 守门怪
  this.monsters = maze.placeMonsters(level, m, this.seed)
  m.portals = maze.placePortals(level, m, this.monsters, this.seed)
  this.portals = m.portals
  m.oneways = maze.placeOneWays(level, m, this.monsters, this.portals, this.seed)
  this.onewayMap = null
  if (m.oneways && m.oneways.length) {
    this.onewayMap = {}
    for (let i = 0; i < m.oneways.length; i++) {
      this.onewayMap[m.oneways[i].x + ',' + m.oneways[i].y] = m.oneways[i].dir
    }
  }
  m.secrets = maze.placeSecrets(level, m, this.seed)
  this.secretMap = {}
  for (let i = 0; i < m.secrets.length; i++) {
    this.secretMap[m.secrets[i].x + ',' + m.secrets[i].y] = m.secrets[i]
  }
  m.gates = maze.placeGates(level, m, this.monsters, this.portals, m.oneways, this.seed)
  this.gates = m.gates
  const its = maze.placeItems(level, m, this.monsters, this.seed)
  this.items = its.items
  this.gemTotal = its.gemTotal
  m.key = its.key
  const gk = maze.placeGatekeeper(level, m, this.monsters, m.key, this.seed)
  if (gk) this.monsters.push(gk)
  // 迷宫事件格（N2）：道具之后放置，避开道具/暗室/闸门/单向门/传送门已占格
  this.eventMap = {}
  const evs = maze.placeEvents(level, m, this.seed, this.occupiedCells())
  for (let i = 0; i < evs.length; i++) {
    this.eventMap[evs[i].x + ',' + evs[i].y] = evs[i]
  }
  this.itemMap = {}
  for (let i = 0; i < this.items.length; i++) {
    this.itemMap[this.items[i].x + ',' + this.items[i].y] = this.items[i]
  }

  // 节拍配置（与 game.js 同式）
  this.bestSteps = (m.key
    ? maze.bfsStepsKey(m.grid, m.start, m.key, m.end, m.portals, this.onewayMap)
    : maze.bfsSteps(m.grid, m.start, m.end, m.portals, this.onewayMap)) || 1
  const cfg = maze.getLevelConfig(level)
  this.monsterStepMs = Math.max(240, 400 - cfg.monsterTier * 40 - Math.floor(level / 4))
  this.bulletSpeed = 0.16 + cfg.monsterTier * 0.03
  this.bulletInterval = 4
  this.fleeStepMs = Math.max(300, Math.round(this.monsterStepMs * 1.25))
  // 词缀：疾走（怪物提速）/ 泥沼（玩家步速降低）
  if (this.modOn('haste')) this.monsterStepMs = Math.round(this.monsterStepMs * 0.8)
  if (this.modOn('slow')) this.baseStepMul = 1.4
  // Boss 限时追逐（L76–100，生存/虚空关禁用）：伪 Boss L76-79 固定 45s
  this.bossOn = level >= 76 && level <= 100 && !this.survival && !!this.findBoss()
  this.pseudoBoss = this.bossOn && level <= 79
  if (this.bossOn) {
    this.bossStepMs = Math.max(260, Math.round(this.monsterStepMs * 0.92))
    this.bossTimeLeft = this.pseudoBoss ? 45 : Math.max(45, Math.round(this.bestSteps * 1.15))
    this.bossTimeTotal = this.bossTimeLeft
    this.bossPhase = this.pseudoBoss ? 0 : 1
    this.lastBossMove = 0
  }
  this.stepMs = Math.max(70, 130 - Math.floor(level / 2))
  if (this.baseStepMul) this.stepMs = Math.round(this.stepMs * this.baseStepMul)
  if (this.stepMul && this.stepMul !== 1) this.stepMs = Math.max(70, Math.round(this.stepMs * this.stepMul)) // 疾风天赋

  // 词缀：围剿（+2 追击怪，放置在远离玩家的直走廊）
  if (this.modOn('more')) {
    const far = this.findFarCells(this.state.x, this.state.y, 8, 2)
    for (let i = 0; i < far.length && i < 2; i++) {
      this.monsters.push({
        path: null, pi: 0, pdir: 1, behavior: 1,
        x: far[i].x, y: far[i].y, vx: far[i].x, vy: far[i].y,
        shootCd: 3, chasing: false, alert: 0, lastSeen: null, name: '影卫'
      })
    }
  }
  // 词缀：禁补（移除非光尘道具，光尘保留）
  if (this.modOn('noitem')) {
    this.items = this.items.filter(function (it) { return it.type === 'gem' })
    this.itemMap = {}
    for (let i = 0; i < this.items.length; i++) {
      this.itemMap[this.items[i].x + ',' + this.items[i].y] = this.items[i]
    }
  }
  // 生存模式：清空预置怪物，全部由波次生成
  if (this.survival) {
    this.monsters = []
    this._waveGrace = 3000
    this.wave = 0
    this.waveTimeLeft = 0
  }

  // 运行时状态
  this.bullets = []
  this.dead = false
  this.won = false
  this.stepping = false
  this.waiting = false
  this.pendingDir = null
  this.holding = false    // 指尖按住拖动中（方向盘模式）：true 期间一直沿 holdDir 行进
  this.holdDir = null
  this.swiping = false    // 一次性滑动（flick）：自动走一段到路口停
  this._parked = false    // 已停下提示去重
  this.lastMonsterMove = 0
  this.lastStepAt = 0
  this.steps = 0
  this.swipeDist = 0
  this.swipeCount = 0
  this.collected = 0
  this.bag = []
  this.bagSel = 0
  this.hasKey = false
  this.shield = false
  this.invulnUntil = 0
  this.fx = { cloak: 0, freeze: 0, dash: 0, magnet: 0, flare: 0, decoy: 0 }
  this.decoyPos = null
  this.portalCd = false
  this.pathHistory = []
  this.hourglassBank = 0
  this.ghostPath = []
  this.hint = ''
  this._gatePhase = 0
}

// 怪物种类（图鉴计数 / 伙伴解锁数据源）：boss > shooter > patrol > chaser
PlayCore.prototype.monsterKind = function (m) {
  if (!m) return 'patrol'
  if (m.isBoss) return 'boss'
  if (m.behavior >= 2) return 'shooter'
  if (m.path && m.path.length) return 'patrol'
  return 'chaser'
}

// 已占用格集合（事件格放置用）：道具/暗室/单向门/闸门/传送门
PlayCore.prototype.occupiedCells = function () {
  const used = {}
  let i
  if (this.items) {
    for (i = 0; i < this.items.length; i++) used[this.items[i].x + ',' + this.items[i].y] = 1
  }
  if (this.secretMap) {
    for (const k in this.secretMap) used[k] = 1
  }
  const m = this.maze
  if (m.oneways) {
    for (i = 0; i < m.oneways.length; i++) used[m.oneways[i].x + ',' + m.oneways[i].y] = 1
  }
  if (m.gates) {
    for (i = 0; i < m.gates.length; i++) used[m.gates[i].x + ',' + m.gates[i].y] = 1
  }
  if (m.portals) {
    for (i = 0; i < m.portals.length; i++) used[m.portals[i].x + ',' + m.portals[i].y] = 1
  }
  return used
}

/* ============ 输入 ============ */

// 滑动转向（dist：滑动像素，用于步数统计）
PlayCore.prototype.swipe = function (d, dist) {
  if (this.dead || this.won) return
  this.swipeDist += dist || 30
  this.swipeCount++
  this.swiping = true
  this.holding = false      // flick 覆盖按住状态
  this.holdDir = null
  this.pendingDir = d
  if (!this.stepping) this.tryConsumePending()
}

// 指尖跟随（按住拖动）：把手指主导方向持续喂给行进状态。
// 与一次性 swipe 的区别：按住期间路过路口不停留，直接沿手指方向走；
// 计一次滑动（整个按住会话），distance 累加。只要手指还按在屏幕上（holding 保持 true），
// 就一直沿 holdDir 行进；手指抬起 releaseHold() 后才清 holding，小人停在当前格。
PlayCore.prototype.steer = function (d, dist) {
  if (this.dead || this.won) return
  this.holding = true
  this.holdDir = d
  this.swiping = false         // 主动拖动覆盖 flick
  this._parked = false
  this.swipeDist += dist || 0
  if (!this._holdCounted) {
    this._holdCounted = true
    this.swipeCount++
  }
  this.pendingDir = d
  if (!this.stepping) this.tryConsumePending()
}

// 松手：停止指尖驱动（行进中的小人走到当前格即停）
PlayCore.prototype.releaseHold = function () {
  this.holding = false
  this.holdDir = null
  this.pendingDir = null      // 清除缓冲转向，避免松手后误自动续走
  this._holdCounted = false
}

PlayCore.prototype.tryConsumePending = function () {
  if (!this.pendingDir || !this.state) return
  const d = this.pendingDir
  if (this.canGo(d)) {
    this.pendingDir = null
    this.inputDir(d)
  }
  // 不可走则保留缓冲：走到可转向位置再消费（不丢滑动）
}

PlayCore.prototype.canGo = function (d) {
  const s = this.state
  const opens = maze.getOpenDirs(this.maze.grid, s.x, s.y, this.onewayMap)
  const nx = s.x + DIRV[d][0]
  const ny = s.y + DIRV[d][1]
  if (opens.indexOf(d) === -1) {
    // 前方是墙：若是未撞开的宝藏暗室假墙 → 撞开
    if (this.maze.grid[ny] && this.maze.grid[ny][nx] === 0 && this.secretMap && this.secretMap[nx + ',' + ny]) {
      this.breakSecret(nx, ny)
    }
    return false
  }
  if (this.gateClosedAt(nx, ny)) {
    this.hint = '闸门关闭 · 等待开启'
    this.emit('hint', this.hint)
    return false
  }
  return true
}

PlayCore.prototype.gateClosedAt = function (x, y) {
  if (!this.gates) return false
  for (let i = 0; i < this.gates.length; i++) {
    const g = this.gates[i]
    if (g.x === x && g.y === y && g._init && !g._open) return true
  }
  return false
}

// 撞开宝藏暗室：墙变通路，掉落光尘 + 随机道具
PlayCore.prototype.breakSecret = function (x, y) {
  const sk = x + ',' + y
  if (!this.secretMap || !this.secretMap[sk]) return
  delete this.secretMap[sk]
  if (this.maze.secrets) {
    for (let i = 0; i < this.maze.secrets.length; i++) {
      if (this.maze.secrets[i].x === x && this.maze.secrets[i].y === y) this.maze.secrets[i].broken = true
    }
  }
  this.maze.grid[y][x] = 1
  this.emit('secret', { x: x, y: y, dust: 5 }) // 光尘入账由场景层处理
  const t = FX_TYPES[Math.floor(Math.random() * FX_TYPES.length)]
  const it = { x: x, y: y, type: t, taken: false }
  this.items.push(it)
  this.itemMap[sk] = it
  this.revealAround()
  this.emit('hint', '发现宝藏暗室！+5✦ 与一个道具')
}

PlayCore.prototype.inputDir = function (d) {
  if (this.dead || this.won) return
  if (!this.canGo(d)) return
  this._parked = false
  const s = this.state
  s.dir = d
  s.atFork = false
  s.visited = {}
  s.visited[s.x + ',' + s.y] = true
  if (!this.stepping) {
    this.stepping = true
    this.lastStepAt = this.now - 999 // 立即迈第一步
  }
}

/* ============ 主循环（时间驱动，替代 setTimeout 链） ============ */

PlayCore.prototype.tick = function (now) {
  this.now = now
  if (this.dead || this.won) return this.drain()
  if (this._t0 == null) this._t0 = now // 计时起点：首帧 tick（this.now 是绝对时间戳，用时须用 elapsed）
  if (!this._lastTick) this._lastTick = now
  const dt = Math.min((now - this._lastTick) / 1000, 0.1)
  this._lastTick = now

  // 道具时长衰减
  for (const k in this.fx) {
    if (this.fx[k] > 0) this.fx[k] = Math.max(0, this.fx[k] - dt * 1000)
  }
  if (this.fx.decoy <= 0) this.decoyPos = null

  // 闸门周期开合（近似移植：2.4s 相位翻转，格坐标奇偶错相）
  if (this.gates && this.gates.length) {
    const phase = Math.floor(now / 2400)
    for (let i = 0; i < this.gates.length; i++) {
      const g = this.gates[i]
      if (!g._init) { g._init = true; g._open = true }
      g._open = (phase + ((g.x + g.y) & 1)) % 2 === 0
    }
  }

  // 玩家行进
  if (this.stepping) this.advancePlayer(now)

  // 怪物与子弹
  this.updateMonsters(now)
  this.updateBullets()

  // 碰撞
  this.checkCollision(now)

  // Boss 限时
  if (this.bossOn && this.bossTimeLeft > 0) {
    this.bossTimeLeft -= dt
    // 狂暴阶段：剩余时间过半 → 提速（一次性）
    if (this.bossPhase === 1 && this.bossTimeLeft < this.bossTimeTotal / 2) {
      this.bossPhase = 2
      this.bossStepMs = Math.round(this.bossStepMs * 0.72)
      this.emit('hint', 'Boss 狂暴！移速大幅提升')
    }
    if (this.bossTimeLeft <= 0) {
      this.bossTimeLeft = 0
      this.fail('限时耗尽 · 被迷宫之主追上', this.findBoss())
    }
  }

  // 生存波次推进（无尽）
  if (this.survival && !this.dead) {
    if (this.wave === 0) {
      this._waveGrace -= dt * 1000
      if (this._waveGrace <= 0) this.startWave(1)
    } else {
      this.waveTimeLeft -= dt
      if (this.waveTimeLeft <= 0) {
        // 波间天赋（N1）：第 1 波结束后，每次波清给 3 选 1（当局有效）
        const offers = this.pickWaveTalents()
        if (offers.length) this.emit('waveclear', { wave: this.wave, offers: offers })
        this.startWave(this.wave + 1)
      }
    }
  }

  // 视觉插值（渲染用）
  const k = Math.min(1, dt * 14)
  this.visual.x += (this.state.x - this.visual.x) * k
  this.visual.y += (this.state.y - this.visual.y) * k
  for (let i = 0; i < this.monsters.length; i++) {
    const mm = this.monsters[i]
    mm.vx += (mm.x - mm.vx) * 0.35
    mm.vy += (mm.y - mm.vy) * 0.35
  }
  return this.drain()
}

PlayCore.prototype.advancePlayer = function (now) {
  const s = this.state
  // 手指未按住（松手/未拖动，且非 flick）：不再迈步，停在当前格
  if (!this.holding && !this.swiping) {
    if (this.stepping) {
      this.stepping = false
      this.waiting = true
      if (!this._parked) { this._parked = true; this.emit('hint', '已停下') }
    }
    return
  }
  // 行进中即时转向：缓冲方向现在可走则立刻转
  if (this.pendingDir && s.dir !== null) {
    if (this.canGo(this.pendingDir)) {
      const d = this.pendingDir
      this.pendingDir = null
      if (d !== s.dir) {
        s.dir = d
        s.cameFrom = OPPD[d]
        s.atFork = false
        s.visited = {}
        s.visited[s.x + ',' + s.y] = true
      }
    }
  }
  // 前方闸门关闭：原地等待
  if (s.dir !== null) {
    const nx = s.x + DIRV[s.dir][0]
    const ny = s.y + DIRV[s.dir][1]
    if (this.gateClosedAt(nx, ny)) {
      this.stepping = false
      this.waiting = true
      this.tryConsumePending()
      if (!this.stepping) {
        this.hint = '闸门关闭 · 等待开启'
        this.emit('hint', this.hint)
      }
      return
    }
  }
  if (now - this.lastStepAt < this.stepMs) return
  this.lastStepAt = now
  this.doStep()
}

PlayCore.prototype.doStep = function () {
  const s = this.state
  const m = this.maze
  const px = s.x
  const py = s.y
  const res = maze.step(s, m.grid, this.onewayMap)
  if (s.x !== px || s.y !== py) {
    this.steps++
    this.pathHistory.push({ x: px, y: py })
    this.ghostPath.push({ t: this.elapsedS(), x: s.x, y: s.y })
    // 传送门
    if (this.portals) {
      const pi = this.portalAt(s.x, s.y)
      if (pi >= 0 && !this.portalCd) {
        const twin = this.portals[1 - pi]
        s.x = twin.x
        s.y = twin.y
        s.visited = {}
        s.visited[twin.x + ',' + twin.y] = true
        this.portalCd = true
        this.emit('portal', { from: { x: px, y: py }, to: { x: twin.x, y: twin.y } })
      } else if (pi < 0) {
        this.portalCd = false
      }
    }
    // 事件格（N2）：踩上触发一次性事件（祭坛/诅咒宝箱/神秘商人），场景层弹选择
    if (this.eventMap && this.eventMap[s.x + ',' + s.y]) {
      const ev = this.eventMap[s.x + ',' + s.y]
      delete this.eventMap[s.x + ',' + s.y]
      this.emit('eventTile', { x: s.x, y: s.y, kind: ev.kind })
    }
  }
  this.checkPickup()
  if (this.fx.magnet > 0) this.applyMagnet()
  this.revealAround()
  if (res === 'won') {
    if (m.key && !this.hasKey) {
      this.stepping = false
      this.waiting = true
      this.hint = '终点已上锁 · 滑动返回取钥匙'
      this.emit('hint', this.hint)
      return
    }
    this.stepping = false
    this.won = true
    this.emit('won', this.stats())
    return
  }
  if (res === 'wait') {
    // 指尖按住中：路口不停车，直接沿手指方向继续（手指方向撞墙则原地等待转向）
    if (this.holding && this.holdDir && this.canGo(this.holdDir)) {
      this.inputDir(this.holdDir)
      this.pendingDir = null
      return
    }
    // 否则在路口停下等待（flick 到路口 / 手指抬起 / 手指方向撞墙）
    this.swiping = false
    this.stepping = false
    this.waiting = true
    this.tryConsumePending()
    if (!this.stepping) {
      this.hint = (this.holdDir ? '路口 · 拖动选择方向' : '路口 · 滑动选择方向')
      this.emit('hint', this.hint)
    }
    return
  }
  this.waiting = false
}

/* ============ 怪物 AI（移植 updateMonsters） ============ */

PlayCore.prototype.hasLOS = function (ax, ay, bx, by, grid) {
  if (ax === bx) {
    const y0 = Math.min(ay, by)
    const y1 = Math.max(ay, by)
    for (let y = y0 + 1; y < y1; y++) if (grid[y][ax] !== 1) return false
    return y0 !== y1
  }
  if (ay === by) {
    const x0 = Math.min(ax, bx)
    const x1 = Math.max(ax, bx)
    for (let x = x0 + 1; x < x1; x++) if (grid[ay][x] !== 1) return false
    return x0 !== x1
  }
  return false
}

PlayCore.prototype.nearestPathIndex = function (m) {
  if (!m.path || !m.path.length) return 0
  let best = 0
  let bd = Infinity
  for (let i = 0; i < m.path.length; i++) {
    const d2 = (m.path[i].x - m.x) * (m.path[i].x - m.x) + (m.path[i].y - m.y) * (m.path[i].y - m.y)
    if (d2 < bd) { bd = d2; best = i }
  }
  return best
}

PlayCore.prototype.updateMonsters = function (now) {
  const grid = this.maze.grid
  const px = this.state.x
  const py = this.state.y
  const frozen = this.fx.freeze > 0
  const cloaked = this.fx.cloak > 0
  const decoyOn = this.fx.decoy > 0 && this.decoyPos
  const tx = decoyOn ? this.decoyPos.x : px
  const ty = decoyOn ? this.decoyPos.y : py
  let effMs = this.monsterStepMs
  for (let i = 0; i < this.monsters.length; i++) {
    if (this.monsters[i].alert >= 80) effMs = Math.min(effMs, this.monsterStepMs * 0.55)
  }
  if (now - this.lastMonsterMove >= effMs) {
    this.lastMonsterMove = now
    for (let i = 0; i < this.monsters.length; i++) {
      const m = this.monsters[i]
      if (m.isBoss) {
        if (m.flee && now - (m._lastMove || 0) >= this.fleeStepMs) {
          m._lastMove = now
          this.stepFlee(m, grid, px, py)
        }
        continue
      }
      const canFreeze = !m.freezeRes || decoyOn
      if (frozen && canFreeze) continue
      if (m.isGatekeeper) {
        this.stepGatekeeper(m, grid, tx, ty)
        continue
      }
      const los = !cloaked && m.behavior >= 1 && this.hasLOS(m.x, m.y, tx, ty, grid)
      if (los) {
        m.alert = Math.min(100, m.alert + 26)
        m.lastSeen = { x: tx, y: ty }
        if (m.x === tx) {
          const ny = m.y + (ty > m.y ? 1 : -1)
          if (grid[ny] && grid[ny][m.x] === 1) m.y = ny
        } else {
          const nx = m.x + (tx > m.x ? 1 : -1)
          if (grid[m.y] && grid[m.y][nx] === 1) m.x = nx
        }
        m.chasing = true
        if (!m._alerted) {
          m._alerted = true
          this.emit('alert', { x: m.x, y: m.y, kind: this.monsterKind(m) })
        }
        if (m.behavior >= 2) {
          m.shootCd -= 1
          if (m.shootCd <= 0) {
            this.spawnBullet(m, tx, ty)
            m.shootCd = this.bulletInterval
          }
        }
      } else {
        m.alert = Math.max(0, m.alert - 3)
        if (m.alert >= 45 && m.lastSeen) {
          let moved = false
          if (m.x !== m.lastSeen.x && grid[m.y] && grid[m.y][m.x + (m.lastSeen.x > m.x ? 1 : -1)] === 1) {
            m.x += (m.lastSeen.x > m.x ? 1 : -1)
            moved = true
          } else if (m.y !== m.lastSeen.y && grid[m.y + (m.lastSeen.y > m.y ? 1 : -1)] && grid[m.y + (m.lastSeen.y > m.y ? 1 : -1)][m.x] === 1) {
            m.y += (m.lastSeen.y > m.y ? 1 : -1)
            moved = true
          } else {
            m.lastSeen = null
          }
          if (moved && m.behavior >= 2) m.shootCd = Math.max(0, m.shootCd - 1)
        } else {
          if (m.chasing) {
            m.pi = this.nearestPathIndex(m)
            m.chasing = false
          }
          if (!m.path || !m.path.length) {
            const rdirs = maze.getOpenDirs(grid, m.x, m.y)
            if (rdirs.length) {
              const rd = rdirs[Math.floor(Math.random() * rdirs.length)]
              m.x += DIRV[rd][0]
              m.y += DIRV[rd][1]
            }
            if (m.behavior >= 2) m.shootCd = Math.max(0, m.shootCd - 1)
          } else {
            let ni = m.pi + m.pdir
            if (ni >= m.path.length || ni < 0) {
              m.pdir *= -1
              ni = m.pi + m.pdir
              if (ni < 0 || ni >= m.path.length) ni = m.pi
            }
            // 变速巡逻：偶发停顿，制造节奏变化（不影响寻路正确性）
            if (Math.random() < 0.16) {
              if (m.behavior >= 2) m.shootCd = Math.max(0, m.shootCd - 1)
            } else {
              m.pi = ni
              m.x = m.path[ni].x
              m.y = m.path[ni].y
              if (m.behavior >= 2) m.shootCd = Math.max(0, m.shootCd - 1)
            }
          }
        }
      }
    }
  }
  // Boss 独立节拍追击
  if (this.bossOn && !frozen && now - this.lastBossMove >= this.bossStepMs) {
    this.lastBossMove = now
    for (let i = 0; i < this.monsters.length; i++) {
      const b = this.monsters[i]
      if (b.isBoss && !b.flee) this.stepBoss(b, grid, px, py, cloaked)
    }
  }
}

PlayCore.prototype.findBoss = function () {
  for (let i = 0; i < this.monsters.length; i++) {
    if (this.monsters[i].isBoss) return this.monsters[i]
  }
  return null
}

PlayCore.prototype.stepBoss = function (b, grid, px, py, cloaked) {
  b.alert = 100
  b.chasing = true
  if (cloaked) {
    if (b.lastSeen) {
      const step = maze.bfsStepToward(grid, { x: b.x, y: b.y }, b.lastSeen)
      if (step) {
        b.x += step.x
        b.y += step.y
        if (b.x === b.lastSeen.x && b.y === b.lastSeen.y) b.lastSeen = null
      } else {
        b.lastSeen = null
      }
    } else {
      const dirs = maze.getOpenDirs(grid, b.x, b.y)
      if (dirs.length) {
        const d = dirs[Math.floor(Math.random() * dirs.length)]
        b.x += DIRV[d][0]
        b.y += DIRV[d][1]
      }
    }
    return
  }
  b.lastSeen = { x: px, y: py }
  const step = maze.bfsStepToward(grid, { x: b.x, y: b.y }, { x: px, y: py })
  if (step) {
    b.x += step.x
    b.y += step.y
  }
}

// 逃跑 Boss：BFS 洪泛，向距玩家最远的相邻格逃窜
PlayCore.prototype.stepFlee = function (m, grid, px, py) {
  const H = grid.length
  const W = grid[0].length
  const dist = {}
  const q = [[px, py]]
  dist[px + ',' + py] = 0
  let head = 0
  while (head < q.length) {
    const cur = q[head++]
    const cx = cur[0]
    const cy = cur[1]
    const dirs = ['U', 'D', 'L', 'R']
    for (let i = 0; i < dirs.length; i++) {
      const d = dirs[i]
      const nx = cx + DIRV[d][0]
      const ny = cy + DIRV[d][1]
      if (nx >= 0 && nx < W && ny >= 0 && ny < H && grid[ny][nx] === 1 && dist[nx + ',' + ny] === undefined) {
        dist[nx + ',' + ny] = dist[cx + ',' + cy] + 1
        q.push([nx, ny])
      }
    }
  }
  let best = null
  let bd = -1
  const dirs2 = maze.getOpenDirs(grid, m.x, m.y)
  for (let i = 0; i < dirs2.length; i++) {
    const nx = m.x + DIRV[dirs2[i]][0]
    const ny = m.y + DIRV[dirs2[i]][1]
    const dv = dist[nx + ',' + ny]
    if (dv !== undefined && dv > bd) { bd = dv; best = dirs2[i] }
  }
  if (best) {
    m.x += DIRV[best][0]
    m.y += DIRV[best][1]
  }
}

// 守门怪：玩家靠近钥匙区（曼哈顿 ≤5）则追击，否则回防钥匙
PlayCore.prototype.stepGatekeeper = function (m, grid, tx, ty) {
  const d2 = (m.x - tx) * (m.x - tx) + (m.y - ty) * (m.y - ty)
  if (d2 <= 25) {
    m.alert = 100
    m.chasing = true
    const step = maze.bfsStepToward(grid, { x: m.x, y: m.y }, { x: tx, y: ty })
    if (step) {
      m.x += step.x
      m.y += step.y
    }
  } else {
    m.chasing = false
    m.alert = Math.max(0, m.alert - 8)
    if (m.post && (m.x !== m.post.x || m.y !== m.post.y)) {
      const step2 = maze.bfsStepToward(grid, { x: m.x, y: m.y }, m.post)
      if (step2) {
        m.x += step2.x
        m.y += step2.y
      }
    }
  }
}

// 生存波次：第 n 波 = n+1 只追击怪（n≥2 追击、n≥4 射击），刷新在远离玩家的直走廊；
// 波次限时 20+4n 秒（无尽递进）；n>1 时波间补给一个随机道具
PlayCore.prototype.startWave = function (n) {
  this.wave = n
  this.waveTimeLeft = 20 + n * 4
  // 铁壁天赋：每波开始 +2s 无敌
  if (this.survTalents && this.survTalents.iron) {
    this.invulnUntil = Math.max(this.invulnUntil || 0, this.now + 2000)
  }
  const count = n + 1
  const px = this.state.x
  const py = this.state.y
  const far = this.findFarCells(px, py, 8, count)
  let made = 0
  for (let i = 0; i < far.length && made < count; i += 2) {
    const c = far[i]
    const m = {
      path: null, pi: 0, pdir: 1,
      behavior: n >= 4 ? 2 : 1,
      x: c.x, y: c.y, vx: c.x, vy: c.y,
      shootCd: 3, chasing: true, alert: 100, lastSeen: null,
      waveSpawn: true, name: n >= 4 ? '狙击手' : '追猎者'
    }
    this.monsters.push(m)
    made++
    this.emit('alert', { x: c.x, y: c.y, kind: this.monsterKind(m) })
  }
  if (n > 1) {
    const cells = this.findFarCells(px, py, 4, 1)
    if (cells.length) {
      const c = cells[0]
      const kk = c.x + ',' + c.y
      if (!this.itemMap[kk]) {
        const t = FX_TYPES[Math.floor(Math.random() * FX_TYPES.length)]
        const it = { x: c.x, y: c.y, type: t, taken: false }
        this.items.push(it)
        this.itemMap[kk] = it
      }
    }
  }
  this.emit('wave', { wave: n })
}

/* ============ 生存波间天赋（N1，当局有效） ============ */

const WAVE_TALENTS = ['torch', 'magnet', 'iron', 'swift', 'alch', 'greed']

// 随机取 3 个不重复的波间天赋供选择
PlayCore.prototype.pickWaveTalents = function () {
  const pool = WAVE_TALENTS.slice()
  const out = []
  while (out.length < 3 && pool.length) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
  }
  return out
}

/* ============ 技能（补给站解锁：dash 闪现步 / insight 透视眼） ============ */

// 闪现步：朝面向方向瞬移 1 格（无面向时给提示）
PlayCore.prototype.useSkillDash = function () {
  if (this.dead || this.won) return false
  const d = this.state.dir || this.pendingDir
  if (!d) {
    this.emit('hint', '先滑动选定方向，再使用闪现步')
    return false
  }
  const nx = this.state.x + DIRV[d][0]
  const ny = this.state.y + DIRV[d][1]
  if (!this.maze.grid[ny] || this.maze.grid[ny][nx] !== 1 || this.gateClosedAt(nx, ny)) {
    this.emit('hint', '闪现目标被挡住了')
    return false
  }
  this.pathHistory.push({ x: this.state.x, y: this.state.y })
  this.state.x = nx
  this.state.y = ny
  this.state.atFork = false
  this.state.visited = {}
  this.state.visited[nx + ',' + ny] = true
  this.portalCd = false
  this.checkPickup()
  this.revealAround()
  this.emit('skill', { type: 'dash' })
  return true
}

// 透视眼：迷雾全图显形 3 秒
PlayCore.prototype.useSkillInsight = function () {
  if (this.dead || this.won || !this.fogEnabled) return false
  this.insightUntil = this.now + 3000
  this.revealAround() // 立即生效
  this.emit('hint', '透视！迷雾全图显形 3 秒')
  this.emit('skill', { type: 'insight' })
  return true
}

/* ============ 复活（广告点位 3：失败后复活一次） ============ */

// 复活：清除玩家周围 4 格内的怪物，短暂无敌；生存模式同时清掉当前波次近身怪
PlayCore.prototype.revive = function () {
  if (!this.dead) return
  this.dead = false
  this.won = false
  const px = this.state.x
  const py = this.state.y
  for (let i = this.monsters.length - 1; i >= 0; i--) {
    const m = this.monsters[i]
    if (m.isBoss) continue // Boss 不可清除，仅靠无敌时间拉开
    if (Math.abs(m.x - px) + Math.abs(m.y - py) <= 4) this.monsters.splice(i, 1)
  }
  this.bullets = []
  this.invulnUntil = this.now + 3000
  this.stepping = false
  this.waiting = true
  this.emit('revive', { x: px, y: py })
}

PlayCore.prototype.spawnBullet = function (m, tx, ty) {
  const dx = tx - m.x
  const dy = ty - m.y
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  this.bullets.push({ x: m.x + (dx / len) * 0.6, y: m.y + (dy / len) * 0.6, dx: dx / len, dy: dy / len })
  this.emit('shoot', { x: m.x, y: m.y })
}

PlayCore.prototype.updateBullets = function () {
  const grid = this.maze.grid
  for (let i = this.bullets.length - 1; i >= 0; i--) {
    const b = this.bullets[i]
    b.x += b.dx * this.bulletSpeed
    b.y += b.dy * this.bulletSpeed
    const cx = Math.round(b.x)
    const cy = Math.round(b.y)
    if (cx < 0 || cy < 0 || cy >= grid.length || cx >= grid[0].length || grid[cy][cx] !== 1) {
      this.bullets.splice(i, 1)
    }
  }
}

/* ============ 拾取 / 碰撞 / 道具 ============ */

PlayCore.prototype.checkPickup = function () {
  if (!this.state || !this.itemMap) return
  const key = this.state.x + ',' + this.state.y
  const it = this.itemMap[key]
  if (!it || it.taken) return
  it.taken = true
  if (it.type === 'gem') {
    this.collected++
    this.emit('pickup', { type: 'gem', x: it.x, y: it.y })
    this.maybeChargeHourglass(1)
  } else if (it.type === 'key') {
    this.hasKey = true
    this.emit('pickup', { type: 'key', x: it.x, y: it.y })
  } else {
    const canStack = this.bag.some(function (s) { return s.type === it.type })
    if (this.bag.length >= BAG_MAX && !canStack) {
      it.taken = false // 背包满：道具保留在地图上
      this.emit('hint', '背包已满 · 先用掉一个道具')
      return
    }
    const slot = this.addToBag(it.type)
    this.emit('pickup', { type: it.type, x: it.x, y: it.y, count: slot ? slot.count : 1 })
  }
}

PlayCore.prototype.addToBag = function (type) {
  for (let i = 0; i < this.bag.length; i++) {
    if (this.bag[i].type === type) {
      this.bag[i].count++
      return this.bag[i]
    }
  }
  if (this.bag.length >= BAG_MAX) return null
  const slot = { type: type, count: 1 }
  this.bag.push(slot)
  this.bagSel = this.bag.length - 1
  return slot
}

// 虚空回响：每 3 光点充能 1 次时间回溯（沙漏入包，被抓时自动发动）
PlayCore.prototype.maybeChargeHourglass = function (n) {
  if (!this.voidZone) return
  this.hourglassBank += n || 1
  while (this.hourglassBank >= 3) {
    const slot = this.addToBag('hourglass')
    if (!slot) break
    this.hourglassBank -= 3
    this.emit('hint', '集齐 3 光点 · 时间回溯充能 +1')
  }
}

PlayCore.prototype.useItem = function (idx) {
  const slot = this.bag[idx]
  if (!slot || this.dead || this.won) return
  const t = slot.type
  if (t === 'hourglass') {
    this.emit('hint', '时光沙漏会在被抓的瞬间自动生效')
    return
  }
  if (t === 'scroll') {
    // 传送到出口前格：出口为死路，踏出即通关（需先取得钥匙）
    const ex = this.maze.end
    const dirs = maze.getOpenDirs(this.maze.grid, ex.x, ex.y)
    const d = dirs[0] || 'U'
    const tx = ex.x - DIRV[d][0]
    const ty = ex.y - DIRV[d][1]
    this.pathHistory.push({ x: this.state.x, y: this.state.y })
    this.state.x = tx
    this.state.y = ty
    this.state.dir = null
    this.state.atFork = false
    this.state.visited = {}
    this.state.visited[tx + ',' + ty] = true
    this.portalCd = false
    this.checkPickup()
    this.revealAround()
    this.stepping = true
    this.lastStepAt = this.now - 999
    this.pendingDir = d
    slot.count--
    if (slot.count <= 0) this.bag.splice(idx, 1)
    this.bagSel = Math.min(this.bagSel, Math.max(0, this.bag.length - 1))
    this.emit('useItem', { type: 'scroll' })
    this.emit('portal', { from: { x: tx, y: ty }, to: { x: ex.x, y: ex.y } })
    this.emit('hint', '瞬移卷轴！已传送到出口附近')
    return
  }
  if (t === 'shield') {
    this.shield = true
  } else if (t === 'decoy') {
    this.decoyPos = { x: this.state.x, y: this.state.y }
  }
  const dur = Math.round(this.fxDur(t))
  this.fx[t] = Math.min((this.fx[t] || 0) + dur, dur * 3)
  slot.count--
  if (slot.count <= 0) this.bag.splice(idx, 1)
  this.bagSel = Math.min(this.bagSel, Math.max(0, this.bag.length - 1))
  this.emit('useItem', { type: t })
}

PlayCore.prototype.portalAt = function (x, y) {
  if (!this.portals) return -1
  for (let i = 0; i < this.portals.length; i++) {
    if (this.portals[i].x === x && this.portals[i].y === y) return i
  }
  return -1
}

PlayCore.prototype.applyMagnet = function () {
  if (!this.items || !this.state) return
  const px = this.state.x
  const py = this.state.y
  const R = 2.6 + (this.survTalents && this.survTalents.magnet ? 1.2 * this.survTalents.magnet : 0) // 磁潮天赋：吸程递增
  const r2 = R * R
  let got = 0
  for (let i = 0; i < this.items.length; i++) {
    const it = this.items[i]
    if (it.taken || it.type !== 'gem') continue
    const dx = it.x - px
    const dy = it.y - py
    if (dx * dx + dy * dy <= r2) {
      it.taken = true
      this.collected++
      got++
      this.emit('pickup', { type: 'gem', x: it.x, y: it.y, magnet: true })
    }
  }
  if (got > 0) this.maybeChargeHourglass(got)
}

PlayCore.prototype.revealAround = function () {
  if (!this.fogEnabled || !this.state) return
  const m = this.maze
  // 透视眼：全图显形
  if (this.insightUntil && this.now < this.insightUntil) {
    for (let y = 0; y < m.H; y++) this.seen[y] = this.seen[y] || []
    for (let y = 0; y < m.H; y++) {
      for (let x = 0; x < m.W; x++) this.seen[y][x] = true
    }
    return
  }
  const px = this.state.x
  const py = this.state.y
  const R = (this.fx.flare > 0 ? 7.6 : (this.darkMode ? 1.8 : 3.6)) * (this.viewMul || 1) // 夜幕：半径减半；viewMul：拾光天赋
  const r2 = R * R
  const x0 = Math.max(0, Math.floor(px - R))
  const x1 = Math.min(m.W - 1, Math.ceil(px + R))
  const y0 = Math.max(0, Math.floor(py - R))
  const y1 = Math.min(m.H - 1, Math.ceil(py + R))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - px
      const dy = y - py
      if (dx * dx + dy * dy <= r2) this.seen[y][x] = true
    }
  }
}

PlayCore.prototype.checkCollision = function (now) {
  if (now < this.invulnUntil || this.dead || this.won) return
  const px = this.visual.x
  const py = this.visual.y
  for (let i = 0; i < this.monsters.length; i++) {
    const m = this.monsters[i]
    if (Math.abs(m.vx - px) < 0.5 && Math.abs(m.vy - py) < 0.5) {
      // 逃跑 Boss：撞上即抓捕（得钥匙），不是死亡
      if (m.flee) {
        this.hasKey = true
        this.monsters.splice(i, 1)
        this.emit('catchBoss', { x: m.x, y: m.y })
        return
      }
      if (this.consumeShield(now)) return
      if (this.tryRewind(now)) return
      this.fail(m.isBoss ? '被迷宫之主抓住了' : '被怪物抓住了', m)
      return
    }
  }
  for (let i = 0; i < this.bullets.length; i++) {
    const b = this.bullets[i]
    if (Math.abs(b.x - px) < 0.5 && Math.abs(b.y - py) < 0.5) {
      if (this.consumeShield(now)) {
        this.bullets.splice(i, 1)
        return
      }
      if (this.tryRewind(now)) return
      this.fail('被怪物子弹击中', null)
      return
    }
  }
}

PlayCore.prototype.consumeShield = function (now) {
  if (!this.shield) return false
  this.shield = false
  this.invulnUntil = now + 1300
  this.emit('shieldBreak', {})
  return true
}

// 沙漏自动回溯：被抓瞬间消耗一个沙漏，倒回最近 10 步
PlayCore.prototype.tryRewind = function (now) {
  let idx = -1
  for (let i = 0; i < this.bag.length; i++) {
    if (this.bag[i].type === 'hourglass') { idx = i; break }
  }
  if (idx < 0) return false
  this.bag.splice(idx, 1)
  const back = Math.min(10, this.pathHistory.length)
  const target = back > 0 ? this.pathHistory[this.pathHistory.length - back] : { x: this.maze.start.x, y: this.maze.start.y }
  if (back > 0) this.pathHistory.splice(this.pathHistory.length - back, back)
  this.state.x = target.x
  this.state.y = target.y
  this.state.dir = null
  this.state.atFork = false
  this.state.visited = {}
  this.state.visited[target.x + ',' + target.y] = true
  this.visual.x = target.x
  this.visual.y = target.y
  this.stepping = false
  this.waiting = true
  this.invulnUntil = now + 1500
  this.emit('rewind', { x: target.x, y: target.y })
  return true
}

PlayCore.prototype.fail = function (reason, monster) {
  this.dead = true
  this.stepping = false
  this.emit('fail', { reason: reason, monster: monster ? (monster.name || (monster.isBoss ? '迷宫之主' : '怪物')) : null })
}

PlayCore.prototype.elapsedS = function () {
  // 对外用时 = 距首帧 tick 的秒数（this.now 是 epoch 毫秒，不能直接除 1000）
  return this._t0 == null ? 0 : Math.max(0, (this.now - this._t0) / 1000)
}

PlayCore.prototype.stats = function () {
  return {
    time: Math.floor(this.elapsedS()),
    steps: this.steps,
    swipe: this.swipeCount,
    gems: this.collected,
    gemTotal: this.gemTotal
  }
}

module.exports = PlayCore
