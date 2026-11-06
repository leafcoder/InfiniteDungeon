/**
 * 赛季征程（免费通行证，核心）
 * - 30 天一个赛季（锚点 2026-11-01），赛季内 XP 累积 → 等级 → 免费奖励轨
 * - XP 数值统一由 mode.SEASON_XP 定义（单一事实来源），业务代码禁止另写魔法数字。
 *   当前生效：守卫局结算（WAVE_RULES）/ 签到 +10 / 打卡 +5 / 任务领取 +15；
 *   老存档兼容：completeLevel +20 / completeDaily +40 / onDepth +30（塔防不触发）。
 * - 纯单机无埋点回流，数值仍为首版草案；真机数据回来后只改 mode 的两张表。
 * - 奖励只含软货币 / 免费券 / 限定外观，绝不发额外广告次数（合规红线）
 * - 限时稀缺：赛季结束 XP 与未领奖励重置（claimed 不跨赛季），制造回访截止感
 * - 存储 maze_season_v1；resetProgress 一并清理
 */
const storage = require('./storage')
const mode = require('./mode')

const SEASON_KEY = 'maze_season_v1'
const SEASON_LEN = 30      // 赛季天数
const SEASON_LEVELS = 30   // 赛季最高等级
const XP_PER_LEVEL = 100   // 每级所需 XP
const ANCHOR = { y: 2026, m: 11, d: 1 } // 第 1 赛季起点（锚点前统一按第 1 赛季第 1 天处理）

// 赛季奖励表（确定性）：里程碑级给限定外观 / 大额碎片，普通级按 5 级周期循环
function rewardFor(level) {
  if (level === 10) return { frame: '探渊行者' }
  if (level === 20) return { shard: 5 }
  if (level === 25) return { title: '深渊纪年' }
  if (level === 30) return { shard: 10 }
  const m = level % 5
  if (m === 0) return { shard: 2 }
  if (m === 3) return { unlock: 1 }
  if (m === 1) return { revive: 1 }
  return { dust: 30 }
}

// 日期 key（YYYY-MM-DD）→ {season, day}：纯字符串日期运算，可注入 dailyKey 做跨赛季回归
function seasonOf(key) {
  const p = String(key || '').split('-')
  if (p.length !== 3) return { season: 1, day: 1 }
  const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]))
  if (isNaN(d.getTime())) return { season: 1, day: 1 }
  const a = new Date(ANCHOR.y, ANCHOR.m - 1, ANCHOR.d)
  const diff = Math.floor((d - a) / 86400000)
  if (diff < 0) return { season: 1, day: 1 }
  return {
    season: Math.floor(diff / SEASON_LEN) + 1,
    day: (diff % SEASON_LEN) + 1
  }
}

// ---- 存储 ----
function freshState() {
  const cur = seasonOf(storage.dailyKey())
  return { season: cur.season, xp: 0, bestFloor: 0, claimed: [] }
}
function load() {
  try { return wx.getStorageSync(SEASON_KEY) || null } catch (e) { return null }
}
function save(s) {
  try { wx.setStorageSync(SEASON_KEY, s) } catch (e) {}
}
// 幂等刷新：存档缺失/损坏重建；跨赛季重置（限时稀缺）
function ensure() {
  let s = load()
  const cur = seasonOf(storage.dailyKey())
  if (!s || typeof s !== 'object' || s.season !== cur.season ||
      typeof s.xp !== 'number' || !Array.isArray(s.claimed)) {
    s = freshState(); save(s); return s
  }
  if (typeof s.bestFloor !== 'number') { s.bestFloor = 0; save(s) }
  return s
}

function level(xp) { return Math.min(SEASON_LEVELS, Math.floor((xp || 0) / XP_PER_LEVEL)) }

// 赛季摘要：面板展示 / 测试断言共用
function info() {
  const s = ensure()
  const cur = seasonOf(storage.dailyKey())
  const lv = level(s.xp)
  const claimable = []
  for (let i = 1; i <= lv; i++) {
    if (s.claimed.indexOf(i) === -1) claimable.push(i)
  }
  return {
    season: s.season,
    day: cur.day,
    totalDays: SEASON_LEN,
    left: Math.max(0, SEASON_LEN - cur.day),
    xp: s.xp,
    level: lv,
    maxLevel: SEASON_LEVELS,
    into: s.xp % XP_PER_LEVEL,
    perLevel: XP_PER_LEVEL,
    bestFloor: s.bestFloor || 0,
    claimed: s.claimed.slice(),
    claimable: claimable,
    rewardFor: rewardFor
  }
}

// ---- XP 写入 ----
function addXp(n) {
  if (!n || n <= 0) return info()
  const s = ensure()
  s.xp = s.xp + n
  save(s)
  return info()
}
// 无尽塔：仅「刷新本赛季最深纪录」给 XP，重复刷同一层不重复发
function onDepth(d) {
  if (!d || d <= 0) return info()
  const s = ensure()
  if (d <= (s.bestFloor || 0)) return info()
  s.bestFloor = d
  s.xp = s.xp + mode.SEASON_XP.depth
  save(s)
  return info()
}

// ---- 领奖 ----
// 复用 task.applyReward 发放（懒加载避免 task→season→task 静态环）
function claim(levelNo) {
  const s = ensure()
  const lv = level(s.xp)
  if (!levelNo || levelNo < 1 || levelNo > SEASON_LEVELS) return { ok: false, reason: 'invalid' }
  if (s.claimed.indexOf(levelNo) !== -1) return { ok: false, reason: 'claimed' }
  if (levelNo > lv) return { ok: false, reason: 'locked' }
  s.claimed.push(levelNo)
  save(s)
  let got = []
  try {
    const task = require('./task')
    if (task && task.applyReward) got = task.applyReward(rewardFor(levelNo))
  } catch (e) { got = [] }
  return { ok: true, level: levelNo, got: got }
}

module.exports = {
  SEASON_KEY: SEASON_KEY, SEASON_LEN: SEASON_LEN, SEASON_LEVELS: SEASON_LEVELS, XP_PER_LEVEL: XP_PER_LEVEL,
  seasonOf: seasonOf, rewardFor: rewardFor,
  ensure: ensure, info: info, addXp: addXp, onDepth: onDepth, claim: claim
}
