/**
 * 每日签到系统（留存主钩子）
 * - 仅新增 1 个存储字段 maze_checkin_v1
 * - 每日签到送光尘（7 天一循环递增），连续签到里程碑：
 *   3 天碎片 / 7 天签到限定皮肤「晨曦」/ 14 天称号 / 30 天大额碎片
 * - 断签判定与 task.prevDay 同源（纯字符串日期运算，可注入 dailyKey 做跨天回归）
 * - 合规红线：奖励只发软货币/外观，绝不触碰广告次数
 */
const storage = require('./storage')
const task = require('./task')
const mode = require('./mode')

const CHECK_KEY = 'maze_checkin_v1'

// 每日光尘奖励：7 天一循环递增（第 7 天 50 为小高潮，随后重新爬升）
const DUST_TABLE = [20, 25, 30, 35, 40, 45, 50]

// 连续签到里程碑（天数累计，断签重计但不回收已发奖励）
const MILESTONES = [
  { day: 3, reward: { shard: 5 }, label: '碎片 ×5' },
  { day: 7, reward: { skin: 'dawn' }, label: '皮肤·晨曦' },
  { day: 14, reward: { title: '晨昏与共' }, label: '称号·晨昏与共' },
  { day: 30, reward: { shard: 20 }, label: '碎片 ×20' }
]

// 测试/调试用：固定连续天数基准；生产恒为 null
let STREAK_OVERRIDE = null
function setStreakOverride(n) {
  STREAK_OVERRIDE = (typeof n === 'number' && n >= 0) ? n : null
}

function load() {
  try { return wx.getStorageSync(CHECK_KEY) || null } catch (e) { return null }
}
function save(s) {
  try { wx.setStorageSync(CHECK_KEY, s) } catch (e) {}
}

// 幂等刷新：旧存档缺字段补齐，不丢签到记录
function ensure() {
  let s = load()
  if (!s || typeof s !== 'object' || typeof s.streak !== 'number') {
    s = { last: '', streak: 0, total: 0, msAwarded: [] }
    save(s)
    return s
  }
  let changed = false
  if (typeof s.last !== 'string') { s.last = ''; changed = true }
  if (typeof s.total !== 'number') { s.total = 0; changed = true }
  if (!Array.isArray(s.msAwarded)) { s.msAwarded = []; changed = true }
  // 断签判定：上次签到既不是今天也不是昨天 → 连续清零（记录保留，total 不回退）
  const dk = storage.dailyKey()
  if (s.last && s.last !== dk && s.last !== task.prevDay(dk) && s.streak > 0) {
    s.streak = 0
    changed = true
  }
  if (changed) save(s)
  return s
}

// 今日信息摘要：signed 是否已签 / streak 连续天数 / todayDust 今日可得光尘 / nextMs 下一个里程碑
function info() {
  const s = ensure()
  const dk = storage.dailyKey()
  const signed = s.last === dk
  const streak = STREAK_OVERRIDE != null ? STREAK_OVERRIDE : s.streak
  // 已签 → 展示今日已得的档位；未签 → 展示今天签到将得的档位（streak+1）
  const eff = signed ? streak : streak + 1
  const todayDust = DUST_TABLE[(eff - 1) % 7] || 20
  let nextMs = null
  for (let i = 0; i < MILESTONES.length; i++) {
    const m = MILESTONES[i]
    if (streak < m.day) {
      nextMs = { day: m.day, left: m.day - streak, reward: m.reward, label: m.label, got: false }
      break
    }
  }
  const msRows = MILESTONES.map(function (m) {
    return { day: m.day, label: m.label, reward: m.reward, got: s.msAwarded.indexOf(m.day) !== -1 }
  })
  return {
    signed: signed, streak: streak, total: s.total || 0,
    todayDust: todayDust, nextMs: nextMs, ms: msRows, allDone: !nextMs
  }
}

// 执行签到：返回 {ok, got, msGot, streak, total}
function sign() {
  const s = ensure()
  const dk = storage.dailyKey()
  if (s.last === dk) return { ok: false, reason: 'signed' }
  // 连续：昨天签过 → +1；断签 → 重计为 1
  s.streak = (s.last === task.prevDay(dk)) ? (s.streak || 0) + 1 : 1
  s.last = dk
  s.total = (s.total || 0) + 1
  save(s)
  const effStreak = STREAK_OVERRIDE != null ? STREAK_OVERRIDE : s.streak
  // 当日光尘：按连续天数取 7 天循环表（STREAK_OVERRIDE 供测试里程碑验证时对齐档位）
  const dust = DUST_TABLE[(effStreak - 1) % 7] || 20
  const got = []
  if (dust) { storage.addDust(dust); got.push({ kind: 'dust', n: dust }) }
  // 里程碑：按生效连续天数发放（未领过才发）；皮肤/称号走 task.applyReward 统一入口
  const msGot = []
  const s2 = ensure()
  for (let i = 0; i < MILESTONES.length; i++) {
    const m = MILESTONES[i]
    if (effStreak >= m.day && s2.msAwarded.indexOf(m.day) === -1) {
      s2.msAwarded.push(m.day)
      task.applyReward(m.reward).forEach(function (g) { msGot.push(g) })
    }
  }
  if (msGot.length) save(s2)
  // 赛季 XP：签到也是一次回访行为，数值统一取 mode.SEASON_XP（懒加载避免静态环）
  try { const sn = require('./season'); if (sn && sn.addXp) sn.addXp(mode.SEASON_XP.checkin) } catch (e) {}
  return { ok: true, got: got, msGot: msGot, streak: s.streak, total: s.total || 0 }
}

module.exports = {
  DUST_TABLE: DUST_TABLE,
  MILESTONES: MILESTONES,
  ensure: ensure,
  info: info,
  sign: sign,
  setStreakOverride: setStreakOverride
}
