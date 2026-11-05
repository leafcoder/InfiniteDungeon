/**
 * 日常 / 周常任务系统（核心）
 * - 配置表驱动（TASKS），便于增删调参
 * - 仅新增 1 个存储字段 maze_task_v1（含全部日/周进度与领取状态）
 * - 进度钩子挂在已有事件入口：addDust / completeLevel+completeDaily / 游戏圈 onTap / 无尽塔深度
 * - 奖励：光尘（软货币）、免费复活券 / 解锁券（等价广告福利，不走广告频次）、皮肤碎片、头像框/称号（外观收集）
 * - 合规红线：奖励绝不发"额外广告次数"突破微信每日 ≤3 次（见 storage.ad.freqState）
 */
const storage = require('./storage')

const TASK_KEY = 'maze_task_v1'

// ---- 任务配置（表驱动）----
const TASKS = {
  daily: [
    { id: 'D1', cat: 'collect', name: '今日光尘矿工', desc: '当日累计获得光尘', target: 120, reward: { dust: 20 } },
    { id: 'D2', cat: 'progress', name: '今日通关达人', desc: '当日通关关卡数', target: 3, reward: { revive: 1 } },
    { id: 'D3', cat: 'social', name: '今日进圈打卡', desc: '进入游戏圈打卡', target: 1, reward: { dust: 15 } }
  ],
  weekly: [
    { id: 'W1', cat: 'progress', name: '本周塔尖挑战', desc: '本周无尽塔最深层', target: 15, reward: { frame: '登塔者' } },
    { id: 'W2', cat: 'collect', name: '本周光尘积累', desc: '本周累计获得光尘', target: 800, reward: { unlock: 1 } }
  ]
}
// 全勤奖励
const FULL_DAILY = { shard: 3 }      // 每日 3/3 → 皮肤碎片 ×3
const FULL_WEEKLY = { title: '地宫常驻' } // 每周 2/2 → 限定称号

// 外观元数据：任务发放的头像框/称号的展示名与配色（纯展示，不附数值）
// 未知 id 回退到 id 本身（避免后续新来源的外观显示为空白）
const COSMETIC_META = {
  frame: {
    '登塔者': { desc: '无尽塔登顶者的荣光', color: '#E36BFF' }
  },
  title: {
    '地宫常驻': { desc: '每周任务全勤限定称号', color: '#FFC15E' }
  }
}
function cosmeticMeta(kind, id) {
  const m = COSMETIC_META[kind] && COSMETIC_META[kind][id]
  if (m) return { name: id, desc: m.desc || '', color: m.color || '#FFFFFF' }
  return { name: id, desc: '', color: '#FFFFFF' }
}

const ALL = TASKS.daily.concat(TASKS.weekly)
function defOf(id) { return ALL.filter(function (x) { return x.id === id })[0] }

// ---- 周 key（ISO 周，周一为一周开始）----
function weekKey() {
  const d = new Date()
  const dow = (d.getDay() + 6) % 7 // 0=周一
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow)
  const y = monday.getFullYear()
  const jan1 = new Date(y, 0, 1)
  const wk = Math.ceil((Math.round((monday - jan1) / 86400000) + 1) / 7)
  return y + '-W' + (wk < 10 ? '0' : '') + wk
}

// ---- 存储 ----
function load() {
  try { return wx.getStorageSync(TASK_KEY) || null } catch (e) { return null }
}
function save(s) {
  try { wx.setStorageSync(TASK_KEY, s) } catch (e) {}
}
function freshState() {
  return {
    date: storage.dailyKey(),
    week: weekKey(),
    daily: TASKS.daily.map(function (t) { return { id: t.id, progress: 0, claimed: false } }),
    weekly: TASKS.weekly.map(function (t) { return { id: t.id, progress: 0, claimed: false } })
  }
}

// 幂等刷新：进入任何任务读取前调用；跨天重置 daily，跨周重置 weekly
function ensure() {
  let s = load()
  const dk = storage.dailyKey(), wk = weekKey()
  if (!s || typeof s !== 'object' || !s.daily || !s.weekly) {
    s = freshState(); save(s); return s
  }
  let changed = false
  if (s.date !== dk) {
    s.date = dk
    s.daily = TASKS.daily.map(function (t) { return { id: t.id, progress: 0, claimed: false } })
    changed = true
  }
  if (s.week !== wk) {
    s.week = wk
    s.weekly = TASKS.weekly.map(function (t) { return { id: t.id, progress: 0, claimed: false } })
    changed = true
  }
  if (changed) save(s)
  return s
}

// ---- 进度写入（钩子）----
function addProgress(arr, id, delta) {
  const t = arr.filter(function (x) { return x.id === id })[0]
  if (!t || t.claimed) return
  const def = defOf(id)
  t.progress = Math.min(def.target, t.progress + delta)
}
function onDust(n) {
  if (!n) return
  const s = ensure()
  addProgress(s.daily, 'D1', n)
  addProgress(s.weekly, 'W2', n)
  save(s)
}
function onClear() {
  const s = ensure()
  addProgress(s.daily, 'D2', 1)
  save(s)
}
function onGameClubTap() {
  const s = ensure()
  addProgress(s.daily, 'D3', 1)
  save(s)
}
function onEndlessDepth(d) {
  if (!d || d <= 0) return
  const s = ensure()
  const w1 = s.weekly.filter(function (x) { return x.id === 'W1' })[0]
  if (w1 && !w1.claimed && d > w1.progress) { w1.progress = d; save(s) }
}

// ---- 状态查询 ----
function wrap(type, t) {
  const def = defOf(t.id)
  return {
    id: t.id, name: def.name, desc: def.desc, cat: def.cat,
    target: def.target, progress: t.progress, claimed: t.claimed,
    canClaim: t.progress >= def.target && !t.claimed, reward: def.reward
  }
}
function getState() {
  const s = ensure()
  return {
    daily: s.daily.map(function (t) { return wrap('daily', t) }),
    weekly: s.weekly.map(function (t) { return wrap('weekly', t) }),
    dailyFull: s.daily.length > 0 && s.daily.every(function (t) { return t.claimed }),
    weeklyFull: s.weekly.length > 0 && s.weekly.every(function (t) { return t.claimed })
  }
}
function hasClaimable() {
  const s = ensure()
  const all = s.daily.concat(s.weekly)
  for (let i = 0; i < all.length; i++) {
    const def = defOf(all[i].id)
    if (all[i].progress >= def.target && !all[i].claimed) return true
  }
  return false
}

// ---- 领奖 ----
// 发放单条奖励；返回实际发放的内容（供弹窗展示）
function applyReward(rw) {
  const got = []
  if (rw.dust) { storage.addDust(rw.dust); got.push({ kind: 'dust', n: rw.dust }) }
  if (rw.revive) { storage.addCoupon('revive', rw.revive); got.push({ kind: 'revive', n: rw.revive }) }
  if (rw.unlock) { storage.addCoupon('unlock', rw.unlock); got.push({ kind: 'unlock', n: rw.unlock }) }
  if (rw.shard) { const before = storage.addShard(rw.shard); got.push({ kind: 'shard', n: rw.shard, total: before }) }
  if (rw.frame) { storage.unlockCosmetic('frames', rw.frame); got.push({ kind: 'frame', n: rw.frame }) }
  if (rw.title) { storage.unlockCosmetic('titles', rw.title); got.push({ kind: 'title', n: rw.title }) }
  return got
}

// 领取单条任务；返回 {ok, got, fullBonus}
function claim(id) {
  const s = ensure()
  const all = s.daily.concat(s.weekly)
  const t = all.filter(function (x) { return x.id === id })[0]
  if (!t) return { ok: false, reason: 'notask' }
  const def = defOf(id)
  if (t.claimed) return { ok: false, reason: 'claimed' }
  if (t.progress < def.target) return { ok: false, reason: 'undone' }
  t.claimed = true
  save(s)
  const got = applyReward(def.reward)
  // 全勤判定（领取后）
  const st = getState()
  const fullBonus = []
  if (st.dailyFull) {
    const fr = applyReward(FULL_DAILY); fullBonus.push.apply(fullBonus, fr)
  }
  if (st.weeklyFull) {
    const fr = applyReward(FULL_WEEKLY); fullBonus.push.apply(fullBonus, fr)
  }
  return { ok: true, got: got, fullBonus: fullBonus }
}

module.exports = {
  TASKS: TASKS, FULL_DAILY: FULL_DAILY, FULL_WEEKLY: FULL_WEEKLY, COSMETIC_META: COSMETIC_META,
  weekKey: weekKey, ensure: ensure,
  onDust: onDust, onClear: onClear, onGameClubTap: onGameClubTap, onEndlessDepth: onEndlessDepth,
  getState: getState, hasClaimable: hasClaimable, claim: claim,
  cosmeticMeta: cosmeticMeta
}
