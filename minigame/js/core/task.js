/**
 * 日常 / 周常任务系统（核心）
 * - 配置表驱动（TASKS），便于增删调参
 * - 仅新增 1 个存储字段 maze_task_v1（含全部日/周进度与领取状态）
 * - 进度钩子挂在已有事件入口：addDust / completeLevel+completeDaily / 游戏圈 onTap / 无尽塔深度
 * - 奖励：光尘（软货币）、免费复活券 / 解锁券（等价广告福利，不走广告频次）、皮肤碎片、头像框/称号（外观收集）
 * - 合规红线：奖励绝不发"额外广告次数"突破微信每日 ≤3 次（见 storage.ad.freqState）
 */
const storage = require('./storage')
const mode = require('./mode')

const TASK_KEY = 'maze_task_v1'

// ---- 任务配置（表驱动）----
// 基础日常定义：id / 行为类别 / 钩子映射恒定，仅 target、奖励、名称随「今日主题」变化
// normal 档即 v1.3 原始数值，保证 TASKS.daily 的导出值向后兼容
const BASE_DAILY = [
  { id: 'D1', cat: 'collect', name: '今日光尘矿工', desc: '当日累计获得光尘', target: 120, reward: { dust: 20 } },
  // v1.4 P1.5：塔防默认模式下 D2 口径重定义为「当日完成守卫局数」（一局 ≈ 一次关卡挑战），target 不变
  { id: 'D2', cat: 'progress', name: '今日守卫达人', desc: '当日完成守卫局数', target: 3, reward: { revive: 1 } },
  { id: 'D3', cat: 'social', name: '今日进圈打卡', desc: '进入游戏圈打卡', target: 1, reward: { dust: 15 } }
]

// 今日主题：按日期确定性轮换，对抗「每天同样 3 条」的疲劳
// 三档都是正反馈、没有惩罚档：丰饶日降门槛奖励不减，试炼日提目标也提奖励
// 奖励只含软货币 / 免费券，绝不发额外广告次数（合规红线）
const DAILY_THEMES = {
  easy: {
    key: 'easy', label: '丰饶日', desc: '目标更轻 · 奖励不减', color: '#6FE3D2', prefix: '丰饶·',
    targets: { D1: 80, D2: 2, D3: 1 },
    rewards: { D1: { dust: 20 }, D2: { revive: 1 }, D3: { dust: 15 } }
  },
  normal: {
    key: 'normal', label: '寻常日', desc: '标准目标', color: '#FFC15E', prefix: '',
    targets: { D1: 120, D2: 3, D3: 1 },
    rewards: { D1: { dust: 20 }, D2: { revive: 1 }, D3: { dust: 15 } }
  },
  hard: {
    key: 'hard', label: '试炼日', desc: '目标更高 · 奖励更丰', color: '#E36BFF', prefix: '试炼·',
    targets: { D1: 180, D2: 5, D3: 1 },
    rewards: { D1: { dust: 35 }, D2: { revive: 2 }, D3: { dust: 20 } }
  }
}
function buildDaily(v) {
  const th = DAILY_THEMES[v] || DAILY_THEMES.normal
  return BASE_DAILY.map(function (t) {
    return {
      id: t.id, cat: t.cat,
      name: th.prefix + t.name,
      desc: t.desc,
      target: th.targets[t.id] != null ? th.targets[t.id] : t.target,
      reward: th.rewards[t.id] || t.reward
    }
  })
}

const TASKS = {
  daily: buildDaily('normal'),   // 导出恒为标准档（兼容旧调用方与回归断言）
  weekly: [
    // v1.4 P1.5：「深度」重定义为本周最高守住波数，数值沿用 15
    { id: 'W1', cat: 'progress', name: '本周塔尖挑战', desc: '本周最高守住波数', target: 15, reward: { frame: '登塔者' } },
    { id: 'W2', cat: 'collect', name: '本周光尘积累', desc: '本周累计获得光尘', target: 800, reward: { unlock: 1 } }
  ]
}
// 全勤奖励
const FULL_DAILY = { shard: 3 }      // 每日 3/3 → 皮肤碎片 ×3
const FULL_WEEKLY = { title: '地宫常驻' } // 每周 2/2 → 限定称号

// 连续全勤里程碑：把「单日行为」转成「跨日承诺」，是日活留存的主钩子
// 只发软货币/外观，绝不触碰广告次数（合规红线）
const FULL_STREAK = [
  { day: 3, reward: { shard: 5 }, label: '碎片 ×5' },
  { day: 7, reward: { frame: '不熄之志' }, label: '头像框·不熄之志' },
  { day: 14, reward: { title: '地宫守望' }, label: '称号·地宫守望' }
]

// 外观元数据：任务发放的头像框/称号的展示名与配色（纯展示，不附数值）
// 未知 id 回退到 id 本身（避免后续新来源的外观显示为空白）
const COSMETIC_META = {
  frame: {
    '登塔者': { desc: '无尽塔登顶者的荣光', color: '#E36BFF' },
    '不熄之志': { desc: '连续 7 天全勤的证明', color: '#FF9E4A' },
    '探渊行者': { desc: '赛季征程 Lv.10 限定头像框', color: '#4AC8FF' }
  },
  title: {
    '地宫常驻': { desc: '每周任务全勤限定称号', color: '#FFC15E' },
    '地宫守望': { desc: '连续 14 天全勤限定称号', color: '#6FE3D2' },
    '晨昏与共': { desc: '连续签到 14 天限定称号', color: '#FFB46E' },
    '轮回行者': { desc: '开启轮回 NG+ 限定称号', color: '#E36BFF' },
    '深渊纪年': { desc: '赛季征程 Lv.25 限定称号', color: '#E36BFF' },
    '博物学家': { desc: '图鉴收录全部怪物', color: '#6FE3D2' },
    '地宫学者': { desc: '图鉴全部收录', color: '#FFD86E' }
  }
}
function cosmeticMeta(kind, id) {
  const m = COSMETIC_META[kind] && COSMETIC_META[kind][id]
  if (m) return { name: id, desc: m.desc || '', color: m.color || '#FFFFFF' }
  return { name: id, desc: '', color: '#FFFFFF' }
}

// ---- 今日主题解析 ----
// 测试/调试用：固定档位，隔离按日轮换对回归断言的影响；生产恒为空串
let THEME_OVERRIDE = ''
// 缓存当天生效定义：hasClaimable() 每帧被调用，命中缓存后 defOf 零存储 IO
let DEFS_CACHE = { key: '', daily: null, all: null }

// 同一天所有设备结果一致；周末固定「丰饶日」降门槛，把回访福利绑定到玩家更可能上线的时机
function variantOfDay(key) {
  const p = String(key || '').split('-')
  if (p.length !== 3) return 'normal'
  const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]))
  if (isNaN(d.getTime())) return 'normal'
  const dow = d.getDay()
  if (dow === 0 || dow === 6) return 'easy'
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 997
  const r = h % 5
  return r === 0 ? 'hard' : (r <= 2 ? 'normal' : 'easy')
}
function setDailyThemeOverride(v) {
  THEME_OVERRIDE = (v && DAILY_THEMES[v]) ? v : ''
  DEFS_CACHE = { key: '', daily: null, all: null }
}
function activeThemeKey(s) {
  if (THEME_OVERRIDE) return THEME_OVERRIDE
  return (s && s.theme && DAILY_THEMES[s.theme]) ? s.theme : 'normal'
}
function themeInfo() {
  const th = DAILY_THEMES[activeThemeKey(ensure())] || DAILY_THEMES.normal
  return { key: th.key, label: th.label, desc: th.desc, color: th.color, targets: th.targets }
}
function activeAll() {
  const k = storage.dailyKey() + '|' + THEME_OVERRIDE
  if (DEFS_CACHE.key === k && DEFS_CACHE.all) return DEFS_CACHE.all
  const daily = buildDaily(activeThemeKey(ensure()))
  DEFS_CACHE = { key: k, daily: daily, all: daily.concat(TASKS.weekly) }
  return DEFS_CACHE.all
}
function defOf(id) { return activeAll().filter(function (x) { return x.id === id })[0] }

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

// 前一天 key（纯字符串日期运算，不依赖真实时钟 → 可注入 dailyKey 做跨天回归）
// 断签判定与连续天数累计共用，避免 yesterdayKey() 基于 Date.now() 带来的夏令时/边界误差
function prevDay(key) {
  const p = String(key || '').split('-')
  if (p.length !== 3) return ''
  const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) - 1)
  if (isNaN(d.getTime())) return ''
  const m = ('0' + (d.getMonth() + 1)).slice(-2)
  const day = ('0' + d.getDate()).slice(-2)
  return d.getFullYear() + '-' + m + '-' + day
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
    weekly: TASKS.weekly.map(function (t) { return { id: t.id, progress: 0, claimed: false } }),
    fullStreak: 0, lastFullDate: '', streakAwarded: [],
    theme: variantOfDay(storage.dailyKey())
  }
}

// 幂等刷新：进入任何任务读取前调用；跨天重置 daily，跨周重置 weekly
// 连续全勤字段为后续版本新增，旧存档缺字段时在此补齐（不丢原有进度）
function ensure() {
  let s = load()
  const dk = storage.dailyKey(), wk = weekKey()
  if (!s || typeof s !== 'object' || !s.daily || !s.weekly) {
    s = freshState(); save(s); return s
  }
  let changed = false
  if (typeof s.fullStreak !== 'number') { s.fullStreak = 0; changed = true }
  if (typeof s.lastFullDate !== 'string') { s.lastFullDate = ''; changed = true }
  if (!Array.isArray(s.streakAwarded)) { s.streakAwarded = []; changed = true }
  // 旧存档（v1.9 及以前）缺 theme：按当天日期补算，原 daily/weekly 进度不丢
  if (!DAILY_THEMES[s.theme]) { s.theme = variantOfDay(dk); changed = true }
  if (s.date !== dk) {
    // 断签判定：上次全勤既不是今天也不是昨天 → 连续清零；否则保留（今天仍可续上）
    if (s.lastFullDate !== dk && s.lastFullDate !== prevDay(dk)) s.fullStreak = 0
    s.date = dk
    s.theme = variantOfDay(dk)   // 跨天重算今日主题（与 daily 一起刷新）
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

// 连续全勤摘要：面板展示「连了几天 / 下一个里程碑还差几天」
function streakInfo() {
  const s = ensure()
  const cur = s.fullStreak || 0
  let next = null
  for (let i = 0; i < FULL_STREAK.length; i++) {
    const m = FULL_STREAK[i]
    if (cur < m.day) { next = { day: m.day, left: m.day - cur, reward: m.reward, label: m.label }; break }
  }
  return { streak: cur, next: next, awarded: (s.streakAwarded || []).slice(), allDone: !next }
}

// ---- 进度写入（钩子）----
function addProgress(arr, id, delta) {
  const t = arr.filter(function (x) { return x.id === id })[0]
  if (!t || t.claimed) return
  const def = defOf(id)
  const before = t.progress
  t.progress = Math.min(def.target, t.progress + delta)
  // 埋点：任务进度首次达到目标（完成事件），只计一次跨越
  if (before < def.target && t.progress >= def.target) storage.incTaskTrack('complete')
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
  // 赛季 XP：打卡也是一次回访行为，数值统一取 mode.SEASON_XP（懒加载避免 season→task 静态环）
  try { const sn = require('./season'); if (sn && sn.addXp) sn.addXp(mode.SEASON_XP.club) } catch (e) {}
}
function onEndlessDepth(d, skipSeason) {
  if (!d || d <= 0) return
  const s = ensure()
  const w1 = s.weekly.filter(function (x) { return x.id === 'W1' })[0]
  if (w1 && !w1.claimed && d > w1.progress) { w1.progress = d; save(s) }
  // 赛季 XP：老存档的无尽塔深度仍由 season.onDepth 判重（XP 取 mode.SEASON_XP.depth）。
  // 塔防传 skipSeason=true：破纪录改由 TowerScene 用本机最佳波数判重发放，
  // 避免复用 bestFloor 导致老存档的深度污染塔防波数奖励。
  if (skipSeason) return
  try { const sn = require('./season'); if (sn && sn.onDepth) sn.onDepth(d) } catch (e) {}
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
    weeklyFull: s.weekly.length > 0 && s.weekly.every(function (t) { return t.claimed }),
    fullStreak: s.fullStreak || 0,
    theme: themeInfo()
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
  if (rw.skin) { storage.unlockSkin(rw.skin); got.push({ kind: 'skin', n: rw.skin }) }
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
  storage.incTaskTrack('claim')
  // 赛季 XP：领取任意任务奖励都给赛季进度，数值统一取 mode.SEASON_XP（懒加载）
  try { const sn = require('./season'); if (sn && sn.addXp) sn.addXp(mode.SEASON_XP.taskClaim) } catch (e) {}
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
  // 连续全勤：只在「当天首次达成全勤」时累计，重复领取不叠加、不重复发里程碑奖
  // 必须重新 ensure() 取最新 state：上面 applyReward 的 addDust 会触发 onDust → 写 W2 进度，
  // 若直接用旧引用 s 回写会把那部分进度覆盖掉
  const streakBonus = []
  const s2 = ensure()
  const dk = storage.dailyKey()
  if (st.dailyFull && s2.lastFullDate !== dk) {
    s2.fullStreak = (s2.lastFullDate === prevDay(dk)) ? (s2.fullStreak || 0) + 1 : 1
    s2.lastFullDate = dk
    save(s2)
    // 里程碑奖励只用 shard/frame/title（不发 dust），避免再次触发 onDust 造成状态回写穿插
    for (let i = 0; i < FULL_STREAK.length; i++) {
      const m = FULL_STREAK[i]
      if (s2.fullStreak >= m.day && s2.streakAwarded.indexOf(m.day) === -1) {
        s2.streakAwarded.push(m.day)
        applyReward(m.reward).forEach(function (g) { streakBonus.push(g) })
      }
    }
    if (streakBonus.length) save(s2)
  }
  return { ok: true, got: got, fullBonus: fullBonus, streakBonus: streakBonus }
}

// 埋点统一入口（曝光 / 点击 由面板调用；完成 / 领取 由任务内自动触发）
// 接后端上报时，在 storage.incTaskTrack 内部转发即可，业务侧无需改动
function track(ev) { return storage.incTaskTrack(ev) }

// 碎片缺口计算（每日全勤 +FULL_DAILY.shard）：用于兑换引导页展示「还差 N / 约 M 天」
function shardNeed(cost) {
  const have = storage.getShards()
  const need = Math.max(0, cost - have)
  const perDay = FULL_DAILY.shard || 1
  const days = need <= 0 ? 0 : Math.ceil(need / perDay)
  return { have: have, need: need, days: days }
}

// 埋点汇总（本机漏斗）：把裸计数转成可读指标，供设置页展示 / 接后端上报
// clickRate = 曝光→点击；claimRate = 完成→领取（衡量奖励吸引力）
function trackSummary() {
  const t = storage.getTaskTrack()
  const pct = function (a, b) { return b > 0 ? Math.round((a / b) * 100) : 0 }
  return {
    expose: t.expose, click: t.click, complete: t.complete, claim: t.claim,
    clickRate: pct(t.click, t.expose),
    claimRate: pct(t.claim, t.complete),
    total: t.expose + t.click + t.complete + t.claim
  }
}

// 结算达成判定：本关是否让某个日常首次达标（done 增加）→ 触发即时正反馈
// 抽成纯函数便于回归；只比较 done，避免把「领取」误判为「达成」
function justCompleted(before, after) {
  return !!before && !!after && after.done > before.done
}

// 今日任务摘要：首页 Dock 与结算页共用的单一文案源
// done = 已达标（含已领取）；remain = 还差几个达标；text 随状态给出下一步动机
function dailyBrief() {
  const st = getState()
  const total = st.daily.length
  const done = st.daily.filter(function (t) { return t.progress >= t.target }).length
  const claimed = st.daily.filter(function (t) { return t.claimed }).length
  const claimable = st.daily.filter(function (t) { return t.canClaim }).length
  const remain = Math.max(0, total - done)
  const shard = FULL_DAILY.shard || 0
  let text
  if (st.dailyFull) text = '今日全勤达成 · ' + shard + ' 碎片已入库'
  else if (claimable > 0) text = '今日 ' + done + '/' + total + ' · ' + claimable + ' 个奖励待领'
  else if (remain === 1) text = '今日 ' + done + '/' + total + ' · 再完成 1 个即得 ' + shard + ' 碎片'
  else text = '今日 ' + done + '/' + total + ' · 全勤可得 ' + shard + ' 碎片'
  return {
    total: total, done: done, claimed: claimed, claimable: claimable,
    full: st.dailyFull, remain: remain, text: text, theme: st.theme
  }
}

module.exports = {
  TASKS: TASKS, BASE_DAILY: BASE_DAILY, DAILY_THEMES: DAILY_THEMES,
  FULL_DAILY: FULL_DAILY, FULL_WEEKLY: FULL_WEEKLY, FULL_STREAK: FULL_STREAK,
  COSMETIC_META: COSMETIC_META,
  buildDaily: buildDaily, variantOfDay: variantOfDay, themeInfo: themeInfo,
  setDailyThemeOverride: setDailyThemeOverride,
  weekKey: weekKey, prevDay: prevDay, ensure: ensure,
  onDust: onDust, onClear: onClear, onGameClubTap: onGameClubTap, onEndlessDepth: onEndlessDepth,
  getState: getState, hasClaimable: hasClaimable, claim: claim, track: track,
  shardNeed: shardNeed, trackSummary: trackSummary, dailyBrief: dailyBrief, streakInfo: streakInfo,
  justCompleted: justCompleted,
  cosmeticMeta: cosmeticMeta,
  applyReward: applyReward
}
