/**
 * 轮回 NG+（通关后长线目标）
 * - 解决「120 关全通即流失」：全通后开启轮回周目，从第 1 关重跑并逐周目强化
 * - 仅新增 1 个存储字段 maze_ngplus_v1（cycle 当前周目 / ngClear 本周目通关数）
 * - 强化：每周目叠加词缀（haste→fog→dark→more→slow，封顶 5），光尘收益 ×(1+0.25N) 封顶 ×2
 * - 合规红线：词缀全部 ⊆ weekly.MODS 已有键（零新增玩法基建），奖励只发软货币/外观
 */
const storage = require('./storage')
const weekly = require('./weekly')

const NG_KEY = 'maze_ngplus_v1'

// 周目词缀强化表（第 N 周目取前 N 个；全部来自 weekly.MODS 既有键）
const CYCLE_MODS = ['haste', 'fog', 'dark', 'more', 'slow']

// 每完成一个周目（进入下一周目）发放的碎片奖励
const CYCLE_SHARD_REWARD = 10

function load() {
  try { return wx.getStorageSync(NG_KEY) || null } catch (e) { return null }
}
function save(s) {
  try { wx.setStorageSync(NG_KEY, s) } catch (e) {}
}
function ensure() {
  let s = load()
  if (!s || typeof s !== 'object') {
    s = { cycle: 0, ngClear: 0 }
    save(s)
    return s
  }
  let changed = false
  if (typeof s.cycle !== 'number' || s.cycle < 0) { s.cycle = 0; changed = true }
  if (typeof s.ngClear !== 'number' || s.ngClear < 0) { s.ngClear = 0; changed = true }
  if (changed) save(s)
  return s
}

// 120 关全通解锁（与 endless.isUnlocked 同口径：completed 覆盖数）
function isUnlocked() {
  const prog = storage.getProgress()
  let done = 0
  for (const k in (prog.completed || {})) done++
  return done >= storage.TOTAL
}

function cycle() { return ensure().cycle }

// 周目词缀：第 N 周目取强化表前 N 个（封顶全表）
function modsFor(c) {
  return CYCLE_MODS.slice(0, Math.min(Math.max(0, Math.round(c)), CYCLE_MODS.length))
}

// 光尘收益倍率：×(1 + 0.25N)，第 4 周目起封顶 ×2
function dustMul(c) {
  return 1 + 0.25 * Math.min(Math.max(0, Math.round(c)), 4)
}

// 周目进度摘要：cycle 当前周目 / ngClear 本周目通关数 / cycleDone 本周目是否全通
function info() {
  const s = ensure()
  return {
    cycle: s.cycle,
    ngClear: s.ngClear,
    cycleDone: s.cycle > 0 && s.ngClear >= storage.TOTAL,
    unlocked: isUnlocked(),
    mods: modsFor(s.cycle),
    dustMul: dustMul(s.cycle),
    shardReward: CYCLE_SHARD_REWARD
  }
}

// 开启下一周目：首次进入发限定称号，跨周目发碎片奖励；返回 {ok, cycle, got}
function enterNext() {
  if (!isUnlocked()) return { ok: false, reason: 'locked' }
  const s = ensure()
  const next = s.cycle + 1
  s.cycle = next
  s.ngClear = 0
  save(s)
  const got = []
  try {
    const task = require('./task')
    if (next === 1) {
      // 首次进入轮回：限定称号（纯外观，无数值）
      storage.unlockCosmetic('titles', '轮回行者')
      got.push({ kind: 'title', n: '轮回行者' })
    }
    if (next > 1) {
      storage.addShard(CYCLE_SHARD_REWARD)
      got.push({ kind: 'shard', n: CYCLE_SHARD_REWARD })
    }
  } catch (e) {}
  // 赛季 XP：轮回再临也是重要里程碑
  try { const sn = require('./season'); if (sn && sn.addXp) sn.addXp(30) } catch (e) {}
  return { ok: true, cycle: next, got: got }
}

// 轮回关通关计数（GameScene onWin 调用；cycle=0 主线不计数）
function incClear() {
  const s = ensure()
  if (s.cycle <= 0) return
  s.ngClear++
  save(s)
}

module.exports = {
  CYCLE_MODS: CYCLE_MODS,
  ensure: ensure,
  isUnlocked: isUnlocked,
  cycle: cycle,
  modsFor: modsFor,
  dustMul: dustMul,
  info: info,
  enterNext: enterNext,
  incClear: incClear
}
