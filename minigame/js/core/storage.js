// 本地进度存储（单机，无需后端）
const KEY = 'maze_progress_v1';
const TUT_KEY = 'maze_tutorial_v1';
const THEME_KEY = 'maze_theme_v1';
const DUST_KEY = 'maze_dust_v1';
const SKINS_KEY = 'maze_skins_v1';
const UPG_KEY = 'maze_upgrades_v1';
const TOTAL = 120;

// —— 光尘经济配置 ——
// 皮肤价格见 theme.js；道具强化每级价格与效果增量
const UPG_COST = [60, 120, 200];           // Lv0→1 / 1→2 / 2→3
const UPG_DELTA = { cloak: 0.75, freeze: 0.6, dash: 0.7, magnet: 0.7, flare: 0.8, decoy: 0.8 }; // 每级延时（秒）
const UPG_BASE = { cloak: 4.5, freeze: 3.0, dash: 3.5, magnet: 4.0, flare: 5.0, decoy: 5.0 };   // 基础时长（秒）

function getTutorialSeen() {
  try {
    return wx.getStorageSync(TUT_KEY) === 1;
  } catch (e) {
    return false;
  }
}

function setTutorialSeen() {
  try {
    wx.setStorageSync(TUT_KEY, 1);
  } catch (e) {}
}

function getTheme() {
  try {
    return wx.getStorageSync(THEME_KEY) || 'classic';
  } catch (e) {
    return 'classic';
  }
}

function setTheme(t) {
  try {
    wx.setStorageSync(THEME_KEY, t);
  } catch (e) {}
}

/* ============ 光尘经济 ============ */
function getDust() {
  try {
    return wx.getStorageSync(DUST_KEY) || 0;
  } catch (e) {
    return 0;
  }
}

function addDust(n) {
  const v = Math.max(0, getDust() + n);
  try {
    wx.setStorageSync(DUST_KEY, v);
  } catch (e) {}
  return v;
}

// 花费光尘，余额不足返回 false
function spendDust(n) {
  if (getDust() < n) return false;
  addDust(-n);
  return true;
}

// 已解锁皮肤（classic 恒解锁）
function getUnlockedSkins() {
  try {
    const s = wx.getStorageSync(SKINS_KEY);
    if (Array.isArray(s)) {
      if (s.indexOf('classic') === -1) s.push('classic');
      return s;
    }
  } catch (e) {}
  return ['classic'];
}

function unlockSkin(k) {
  const s = getUnlockedSkins();
  if (s.indexOf(k) === -1) s.push(k);
  try {
    wx.setStorageSync(SKINS_KEY, s);
  } catch (e) {}
  return s;
}

/* ============ 英雄皮肤（小人造型） ============ */
// 解锁路径分层：free 初始 / clears 累计通关 / stars 累计星级 / ad 看广告 / dust 光尘购买（稀有款更贵）
const HERO_KEY = 'maze_hero_v1';       // 当前穿戴
const HEROES_KEY = 'maze_heroes_v1';   // 手动解锁记录（广告 / 光尘）
const HEROES = [
  {
    id: 'rover', name: '金衫旅人', desc: '初始造型 · 荒野徒步者', by: 'free', ick: 'bolt',
    pal: { skin: '#FFE3C4', hair: '#453863', tunic: '#FFC15E', tunic2: '#D98F35', pants: '#4E4370', boot: '#2E2850', eye: '#2E2850', flame: ['255,240,170', '255,180,70', '255,120,40'] }
  },
  {
    id: 'mint', name: '薄荷信使', desc: '累计通关 5 关解锁', by: 'clears', need: 5, ick: 'leaf',
    pal: { skin: '#FFE3C4', hair: '#2E5E50', tunic: '#6FE3D2', tunic2: '#3AA896', pants: '#27423C', boot: '#1C2E2A', eye: '#1C2E2A', flame: ['220,255,245', '140,240,215', '80,200,170'] }
  },
  {
    id: 'sunset', name: '落霞行者', desc: '累计 20 颗星解锁', by: 'stars', need: 20, ick: 'spark',
    pal: { skin: '#FFD9B8', hair: '#6B3550', tunic: '#FF9F6E', tunic2: '#D96C45', pants: '#4A2E44', boot: '#33202E', eye: '#33202E', flame: ['255,235,190', '255,170,90', '230,110,50'] }
  },
  {
    id: 'abyssal', name: '渊行者', desc: '累计 45 颗星解锁', by: 'stars', need: 45, ick: 'wave',
    pal: { skin: '#D8E8EC', hair: '#123040', tunic: '#40E0FF', tunic2: '#2B9EB8', pants: '#14323E', boot: '#0C2028', eye: '#0C2028', flame: ['220,250,255', '130,230,250', '60,180,220'] }
  },
  {
    id: 'sakura', name: '樱吹雪', desc: '看广告解锁', by: 'ad', ick: 'flower',
    pal: { skin: '#FFE3C4', hair: '#8A4A6B', tunic: '#FF9ECB', tunic2: '#D9689F', pants: '#5C3244', boot: '#3E2130', eye: '#3E2130', flame: ['255,240,248', '255,190,220', '240,130,180'] }
  },
  {
    id: 'lava', name: '熔核骑士', desc: '累计通关 30 关解锁', by: 'clears', need: 30, ick: 'sword',
    pal: { skin: '#F2C8A8', hair: '#3A1E18', tunic: '#FF6B4A', tunic2: '#C23E28', pants: '#40201A', boot: '#26120E', eye: '#26120E', flame: ['255,245,200', '255,150,60', '220,70,30'] }
  },
  {
    id: 'royal', name: '星海贵胄', desc: '光尘购买 · 稀有', by: 'dust', price: 320, ick: 'crown',
    pal: { skin: '#FFEAD8', hair: '#E8E4FF', tunic: '#C79BFF', tunic2: '#8F6BD9', pants: '#3A2E5C', boot: '#241C3E', eye: '#241C3E', flame: ['255,250,230', '255,220,140', '240,180,80'] }
  }
];

// 累计星级 / 通关数（英雄解锁条件的数据源）
function heroStats() {
  const p = getProgress();
  let stars = 0;
  let clears = 0;
  for (const lv in p.completed) {
    clears++;
    stars += (p.completed[lv] && p.completed[lv].stars) || 0;
  }
  return { stars: stars, clears: clears };
}

// 手动解锁记录（广告 / 光尘路径）
function getUnlockedHeroes() {
  try {
    const s = wx.getStorageSync(HEROES_KEY);
    if (Array.isArray(s)) return s;
  } catch (e) {}
  return [];
}

function unlockHero(id) {
  const s = getUnlockedHeroes();
  if (s.indexOf(id) === -1) s.push(id);
  try {
    wx.setStorageSync(HEROES_KEY, s);
  } catch (e) {}
  return s;
}

// 是否可用：free 恒真；stars/clears 条件达标即解锁（无需手动领取）；ad/dust 需在手动解锁记录里
function heroAvailable(id) {
  for (let i = 0; i < HEROES.length; i++) {
    const h = HEROES[i];
    if (h.id !== id) continue;
    if (h.by === 'free') return true;
    if (h.by === 'ad' || h.by === 'dust') return getUnlockedHeroes().indexOf(id) !== -1;
    const st = heroStats();
    return h.by === 'stars' ? st.stars >= h.need : st.clears >= h.need;
  }
  return false;
}

function getHero() {
  let cur = 'rover';
  try {
    const v = wx.getStorageSync(HERO_KEY);
    if (typeof v === 'string') cur = v;
  } catch (e) {}
  // 进度被重置等情况下条件可能失效，回退到初始造型
  return heroAvailable(cur) ? cur : 'rover';
}

function setHero(id) {
  if (!heroAvailable(id)) return false;
  try {
    wx.setStorageSync(HERO_KEY, id);
  } catch (e) {}
  return true;
}

// 光尘购买英雄：扣费 + 记录，成功后立即穿戴
function buyHero(id) {
  for (let i = 0; i < HEROES.length; i++) {
    const h = HEROES[i];
    if (h.id !== id || h.by !== 'dust') continue;
    if (heroAvailable(id)) return true;
    if (!spendDust(h.price)) return false;
    unlockHero(id);
    setHero(id);
    return true;
  }
  return false;
}

function hexToRgbStr(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r: r, g: g, b: b };
}

// 当前英雄的渲染调色板（含躯干光晕 rgba 与火焰三段 rgb 串），供 board.drawWalker 使用
function getHeroPal() {  const cur = getHero();
  for (let i = 0; i < HEROES.length; i++) {
    if (HEROES[i].id !== cur) continue;
    const pal = {};
    const src = HEROES[i].pal;
    for (const k in src) pal[k] = src[k];
    const c = hexToRgbStr(src.tunic);
    pal.glow = 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',0.55)';
    return pal;
  }
  return null; // board.js 回退默认配色
}

// 已收集英雄数（条件型达标即算收集，供弹窗收集度展示）
function getHeroCollected() {
  let n = 0;
  for (let i = 0; i < HEROES.length; i++) {
    if (heroAvailable(HEROES[i].id)) n++;
  }
  return n;
}

// 道具强化等级 {cloak,freeze,dash}，上限 3
function getUpgrades() {
  try {
    const u = wx.getStorageSync(UPG_KEY);
    if (u && typeof u === 'object') {
      return { cloak: u.cloak || 0, freeze: u.freeze || 0, dash: u.dash || 0 };
    }
  } catch (e) {}
  return { cloak: 0, freeze: 0, dash: 0 };
}

function buyUpgrade(k) {
  const u = getUpgrades();
  const lv = u[k] || 0;
  if (lv >= UPG_COST.length) return false;
  if (!spendDust(UPG_COST[lv])) return false;
  u[k] = lv + 1;
  try {
    wx.setStorageSync(UPG_KEY, u);
  } catch (e) {}
  return true;
}

// 道具实际生效时长（秒）：基础 + 等级增量
function fxDuration(k) {
  const u = getUpgrades();
  return UPG_BASE[k] + (UPG_DELTA[k] || 0) * (u[k] || 0);
}

function getProgress() {
  // 广告解锁永久生效：与通关进度合并取最大。
  // 注意 getAdUnlocked() 存的就是"广告解锁到的最高可玩关"（adUnlockTo(lv) 传的是关卡号），
  // 不可再 +1——否则解锁第 65 关后 unlocked 变 66，关卡格上"挑战中"标到 66（历史 bug）。
  const adMax = getAdUnlocked();
  try {
    const p = wx.getStorageSync(KEY);
    if (p && typeof p === 'object' && p.completed) {
      return { unlocked: Math.max(p.unlocked || 1, adMax), completed: p.completed };
    }
  } catch (e) {}
  return { unlocked: Math.max(1, adMax), completed: {} };
}

/* ============ 广告解锁关卡（永久保留，重置进度不清除） ============ */
const AD_KEY = 'maze_ad_unlock_v1';
function getAdUnlocked() {
  try {
    const v = wx.getStorageSync(AD_KEY);
    return (typeof v === 'number' && v > 0) ? v : 0;
  } catch (e) {
    return 0;
  }
}
// 记录看广告解锁到的最大关卡
function adUnlockTo(n) {
  const v = Math.max(getAdUnlocked(), n, 1);
  try {
    wx.setStorageSync(AD_KEY, v);
  } catch (e) {}
  return v;
}

function saveProgress(p) {
  try {
    wx.setStorageSync(KEY, p);
  } catch (e) {}
}

// rec: { time(秒), steps(格数), swipe(操作次数), stars(1-3), gems(收集数), gemTotal(总数) }
// 保留更优记录：星级优先 → 同星取更短时间 → 同星同时取更多收集
function isBetter(rec, prev) {
  if (!prev) return true;
  if (rec.stars !== prev.stars) return rec.stars > prev.stars;
  if (prev.time === undefined) return true;
  if (rec.time !== prev.time) return rec.time < prev.time;
  const g = (rec.gems || 0);
  const pg = (prev.gems || 0);
  return g > pg;
}

function completeLevel(level, rec) {
  const p = getProgress();
  const prev = p.completed[level];
  const better = isBetter(rec, prev);
  if (better) p.completed[level] = rec;
  p.unlocked = Math.max(p.unlocked, Math.min(level + 1, TOTAL));
  saveProgress(p);
  return { progress: p, isNew: better };
}

function resetProgress() {
  saveProgress({ unlocked: 1, completed: {} });
}

/* ============ 连击（连续通关，失败清零，用于光尘加成） ============ */
const COMBO_KEY = 'maze_combo_v1'
function getCombo() {
  try { return wx.getStorageSync(COMBO_KEY) || 0 } catch (e) { return 0 }
}
function incCombo() {
  const c = getCombo() + 1
  try { wx.setStorageSync(COMBO_KEY, c) } catch (e) {}
  return c
}
function resetCombo() {
  try { wx.setStorageSync(COMBO_KEY, 0) } catch (e) {}
}

/* ============ 设置（P4 无障碍 / 音效） ============ */
const SET_KEY = 'maze_settings_v1';
function getSettings() {
  try {
    return wx.getStorageSync(SET_KEY) || {};
  } catch (e) {
    return {};
  }
}
function getSetting(k, def) {
  const s = getSettings();
  return s[k] !== undefined ? s[k] : def;
}
function setSetting(k, v) {
  const s = getSettings();
  s[k] = v;
  try {
    wx.setStorageSync(SET_KEY, s);
  } catch (e) {}
  return s;
}

/* ============ 统计 ============ */
const STAT_KEY = 'maze_stats_v1';
const STAT_DEFAULT = { clears: 0, perfects: 0, bossClears: 0, noItemClears: 0, gemsTotal: 0, dustTotal: 0, dailyCount: 0, dailyStreak: 0, lastDaily: '', bestWave: 0, hunterWins: 0 };
function getStats() {
  try {
    const s = wx.getStorageSync(STAT_KEY);
    if (s && typeof s === 'object') return Object.assign({}, STAT_DEFAULT, s);
  } catch (e) {}
  return Object.assign({}, STAT_DEFAULT);
}
function saveStats(s) {
  try {
    wx.setStorageSync(STAT_KEY, s);
  } catch (e) {}
}

/* ============ 成就 ============ */
const ACHS = [
  { id: 'journey', name: '旅程开始', desc: '通关第 3 关', reward: 10 },
  { id: 'first', name: '初次通关', desc: '完成你的第一关', reward: 10 },
  { id: 'perfect', name: '拾光者', desc: '任意关卡全收集光点', reward: 15 },
  { id: 'speed', name: '极速行者', desc: '30 关以上取得 3 星且时间达标', reward: 20 },
  { id: 'boss', name: '屠龙者', desc: '通关一个 Boss 追逐关（≥80）', reward: 25 },
  { id: 'pacifist', name: '赤手空拳', desc: '不使用任何道具通关一关', reward: 20 },
  { id: 'daily', name: '每日达人', desc: '完成一次每日挑战', reward: 10 },
  { id: 'streak', name: '坚持不懈', desc: '每日挑战连续 7 天', reward: 30 },
  { id: 'dust', name: '光尘富翁', desc: '累计获得 500 光尘', reward: 20 },
  { id: 'hundred', name: '百关达成', desc: '通关第 100 关（星海之巅）', reward: 50 },
  { id: 'void', name: '虚空征服者', desc: '通关全部 120 关（虚空回响）', reward: 100 },
  { id: 'survivor', name: '终极生存者', desc: '生存模式撑过 10 波', reward: 25 },
  { id: 'hunter', name: '猎手时刻', desc: '抓住携带钥匙的宝藏 Boss', reward: 25 }
];
const ACH_KEY = 'maze_ach_v1';
function getAch() {
  try {
    return wx.getStorageSync(ACH_KEY) || {};
  } catch (e) {
    return {};
  }
}
function achList() {
  const a = getAch();
  return ACHS.map(function (x) {
    return { id: x.id, name: x.name, desc: x.desc, reward: x.reward || 0, unlocked: !!a[x.id] };
  });
}
// 解锁成就：新解锁时自动发放光尘奖励，返回奖励值（已解锁返回 0）
function unlockAch(id) {
  const a = getAch();
  if (a[id]) return 0;
  a[id] = 1;
  try {
    wx.setStorageSync(ACH_KEY, a);
  } catch (e) {}
  const def = ACHS.filter(function (x) { return x.id === id; })[0];
  const reward = def ? (def.reward || 0) : 0;
  if (reward > 0) addDust(reward);
  return reward;
}

/* ============ 每日挑战 ============ */
function dailyKey() {
  const d = new Date();
  const m = ('0' + (d.getMonth() + 1)).slice(-2);
  const day = ('0' + d.getDate()).slice(-2);
  return d.getFullYear() + '-' + m + '-' + day;
}
function yesterdayKey() {
  const d = new Date(Date.now() - 86400000);
  const m = ('0' + (d.getMonth() + 1)).slice(-2);
  const day = ('0' + d.getDate()).slice(-2);
  return d.getFullYear() + '-' + m + '-' + day;
}
// 由日期串派生稳定数字种子（FNV-1a）
function dailySeed() {
  const k = dailyKey();
  let h = 2166136261;
  for (let i = 0; i < k.length; i++) {
    h ^= k.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const DAILY_KEY = 'maze_daily_v1';
function getDaily() {
  try {
    return wx.getStorageSync(DAILY_KEY) || {};
  } catch (e) {
    return {};
  }
}
// 完成每日挑战：记录当日最佳，并维护连续天数；返回 { better, streak, newAch:[name] }
function completeDaily(date, rec) {
  const d = getDaily();
  const prev = d[date];
  const better = isBetter(rec, prev);
  if (better) d[date] = rec;
  const st = getStats();
  const last = st.lastDaily;
  let streak = st.dailyStreak || 0;
  if (last === yesterdayKey()) streak = streak + 1;
  else if (last === date) streak = streak; // 同日重复，不累加
  else streak = 1;
  st.dailyStreak = streak;
  st.lastDaily = date;
  st.dailyCount = (st.dailyCount || 0) + 1;
  saveStats(st);
  try {
    wx.setStorageSync(DAILY_KEY, d);
  } catch (e) {}
  const newAch = [];
  const r1 = unlockAch('daily');
  if (r1 > 0) newAch.push('每日达人');
  const r2 = (streak >= 7) ? unlockAch('streak') : 0;
  if (r2 > 0) newAch.push('坚持不懈');
  // 每日火把里程碑：连续第 3 天 +15✦，此后每满 7 天 +30✦（断签只清连击、不清总参与）
  let bonus = 0;
  if (streak === 3) bonus = 15;
  else if (streak > 3 && streak % 7 === 0) bonus = 30;
  if (bonus > 0) addDust(bonus);
  return { better: better, streak: streak, bonus: bonus, newAch: newAch };
}

/* ============ 通关统一记录（统计 + 成就） ============ */
// info: { stars, timeOK, perfect, usedItem, boss, gems, dust }
// 返回新解锁成就 [{id,name}]
function recordWin(level, info) {
  const st = getStats();
  st.clears = (st.clears || 0) + 1;
  if (info.perfect) st.perfects = (st.perfects || 0) + 1;
  if (info.boss) st.bossClears = (st.bossClears || 0) + 1;
  if (!info.usedItem) st.noItemClears = (st.noItemClears || 0) + 1;
  st.gemsTotal = (st.gemsTotal || 0) + (info.gems || 0);
  st.dustTotal = (st.dustTotal || 0) + (info.dust || 0);
  saveStats(st);
  const a = getAch();
  const newAch = [];
  const tryU = function (id) {
    if (!a[id]) {
      a[id] = 1;
      const def = ACHS.filter(function (x) { return x.id === id; })[0];
      const reward = def ? (def.reward || 0) : 0;
      if (reward > 0) addDust(reward);
      newAch.push({ id: id, name: def ? def.name : id, reward: reward });
    }
  };
  if (level >= 3) tryU('journey');
  if (level === 1) tryU('first');
  if (info.perfect) tryU('perfect');
  if (level >= 30 && info.stars >= 3 && info.timeOK) tryU('speed');
  if (info.boss) tryU('boss');
  if (!info.usedItem) tryU('pacifist');
  if (level >= 100) tryU('hundred');
  if (level >= 120) tryU('void');
  if (st.dustTotal >= 500) tryU('dust');
  if (info.survival) tryU('survivor');
  if (info.hunter) tryU('hunter');
  try {
    wx.setStorageSync(ACH_KEY, a);
  } catch (e) {}
  return newAch;
}

/* ============ 图鉴（遭遇即解锁） ============ */
const CODEX_KEY = 'maze_codex_v1';
function getCodex() {
  try {
    const c = wx.getStorageSync(CODEX_KEY);
    return (c && typeof c === 'object') ? c : {};
  } catch (e) {
    return {};
  }
}
// 记录一次遭遇；首次遭遇返回 true（图鉴新增）
function encounterCodex(key) {
  const c = getCodex();
  if (c[key]) return false;
  c[key] = 1;
  try {
    wx.setStorageSync(CODEX_KEY, c);
  } catch (e) {}
  return true;
}

/* ============ 周挑战（按周重置的 5 个 mod 关卡） ============ */
const WEEK_KEY = 'maze_weekly_v1';
function getWeeklyDone() {
  try {
    const w = wx.getStorageSync(WEEK_KEY);
    return (w && typeof w === 'object') ? w : {};
  } catch (e) {
    return {};
  }
}
// 标记本周第 idx 关（0-4）完成；返回完成数组
function completeWeekLevel(weekKey, idx) {
  const w = getWeeklyDone();
  if (!Array.isArray(w[weekKey])) w[weekKey] = [false, false, false, false, false];
  w[weekKey][idx] = true;
  try {
    wx.setStorageSync(WEEK_KEY, w);
  } catch (e) {}
  return w[weekKey];
}

/* ============ 周挑战周奖励（5 关全完成 → 一次性领取） ============ */
const WEEK_REWARD = 30;
function weeklyRewardClaimed(weekKey) {
  return getFlag('weekReward_' + weekKey);
}
// 领取周奖励：返回发放光尘（0=未全完成，-1=已领过）
function claimWeeklyReward(weekKey) {
  const arr = getWeeklyDone()[weekKey];
  if (!Array.isArray(arr) || arr.length < 5 || !arr.every(function (x) { return !!x })) return 0;
  if (weeklyRewardClaimed(weekKey)) return -1;
  setFlag('weekReward_' + weekKey);
  addDust(WEEK_REWARD);
  return WEEK_REWARD;
}

/* ============ 主动技能（技能树 2.0，光尘一次性解锁） ============ */
const SKILL_KEY = 'maze_skills_v1';
const SKILL_COST = { dash: 80, insight: 60 };
const SKILL_META = {
  dash: { name: '闪现步', desc: '朝面向方向瞬移 1 格', uses: 3 },
  insight: { name: '透视眼', desc: '迷雾全图显形 3 秒', uses: 2 }
};
function getSkills() {
  try {
    const s = wx.getStorageSync(SKILL_KEY);
    return (s && typeof s === 'object') ? s : {};
  } catch (e) {
    return {};
  }
}
function buySkill(k) {
  if (!SKILL_META[k]) return false;
  const s = getSkills();
  if (s[k]) return true; // 已解锁
  if (!spendDust(SKILL_COST[k])) return false;
  s[k] = 1;
  try {
    wx.setStorageSync(SKILL_KEY, s);
  } catch (e) {}
  return true;
}

/* ============ 幽灵竞速（每日挑战本机最佳路线） ============ */
const GHOST_KEY = 'maze_ghost_v1';
function getGhost(seedKey) {
  try {
    const g = wx.getStorageSync(GHOST_KEY);
    return (g && g[seedKey] && Array.isArray(g[seedKey].path)) ? g[seedKey] : null;
  } catch (e) {
    return null;
  }
}
// path: [{t(秒),x,y}] 采样点；保留更优（时间更短）记录
function saveGhost(seedKey, path, time) {
  const prev = getGhost(seedKey);
  if (prev && prev.time <= time) return false;
  try {
    const g = wx.getStorageSync(GHOST_KEY) || {};
    // 降采样：最多 400 点
    let p = path;
    if (p.length > 400) {
      const stepN = Math.ceil(p.length / 400);
      p = p.filter(function (_, i) { return i % stepN === 0 || i === path.length - 1; });
    }
    g[seedKey] = { path: p, time: time };
    wx.setStorageSync(GHOST_KEY, g);
  } catch (e) {}
  return true;
}

/* ============ 剧情章节已读 ============ */
const STORY_KEY = 'maze_story_v1';
function isStorySeen(id) {
  try {
    const s = wx.getStorageSync(STORY_KEY) || {};
    return !!s[id];
  } catch (e) {
    return false;
  }
}
function markStorySeen(id) {
  try {
    const s = wx.getStorageSync(STORY_KEY) || {};
    s[id] = 1;
    wx.setStorageSync(STORY_KEY, s);
  } catch (e) {}
}

/* ============ 微信云存储打点（好友排行预留，小程序仅 KVS 可用） ============ */
function reportScoreKV(level, time) {
  try {
    if (!wx.setUserCloudStorage) return;
    wx.setUserCloudStorage({
      KVDataList: [{ key: 'maze_best_L' + level, value: JSON.stringify({ t: Math.round(time * 10) / 10, ts: Date.now() }) }],
      success: function () {},
      fail: function () {}
    });
  } catch (e) {}
}

// —— 通用一次性标志（教程已读等） ——
const FLAG_KEY = 'maze_flags_v1';
function getFlags() {
  try {
    return wx.getStorageSync(FLAG_KEY) || {};
  } catch (e) {
    return {};
  }
}
function getFlag(k) {
  return !!getFlags()[k];
}
function setFlag(k) {
  try {
    const f = getFlags();
    f[k] = 1;
    wx.setStorageSync(FLAG_KEY, f);
  } catch (e) {}
}

module.exports = {
  TOTAL: TOTAL,
  UPG_COST: UPG_COST,
  UPG_DELTA: UPG_DELTA,
  UPG_BASE: UPG_BASE,
  getFlag: getFlag,
  setFlag: setFlag,
  getProgress: getProgress,
  saveProgress: saveProgress,
  getAdUnlocked: getAdUnlocked,
  adUnlockTo: adUnlockTo,
  completeLevel: completeLevel,
  resetProgress: resetProgress,
  getTutorialSeen: getTutorialSeen,
  setTutorialSeen: setTutorialSeen,
  getTheme: getTheme,
  setTheme: setTheme,
  getDust: getDust,
  addDust: addDust,
  spendDust: spendDust,
  getUnlockedSkins: getUnlockedSkins,
  unlockSkin: unlockSkin,
  HEROES: HEROES,
  heroStats: heroStats,
  getUnlockedHeroes: getUnlockedHeroes,
  unlockHero: unlockHero,
  heroAvailable: heroAvailable,
  getHero: getHero,
  setHero: setHero,
  buyHero: buyHero,
  getHeroPal: getHeroPal,
  getHeroCollected: getHeroCollected,
  getUpgrades: getUpgrades,
  buyUpgrade: buyUpgrade,
  fxDuration: fxDuration,
  getSettings: getSettings,
  getSetting: getSetting,
  setSetting: setSetting,
  getCombo: getCombo,
  incCombo: incCombo,
  resetCombo: resetCombo,
  getStats: getStats,
  saveStats: saveStats,
  achList: achList,
  unlockAch: unlockAch,
  dailyKey: dailyKey,
  dailySeed: dailySeed,
  getDaily: getDaily,
  completeDaily: completeDaily,
  recordWin: recordWin,
  getCodex: getCodex,
  encounterCodex: encounterCodex,
  getWeeklyDone: getWeeklyDone,
  completeWeekLevel: completeWeekLevel,
  weeklyRewardClaimed: weeklyRewardClaimed,
  claimWeeklyReward: claimWeeklyReward,
  SKILL_COST: SKILL_COST,
  SKILL_META: SKILL_META,
  getSkills: getSkills,
  buySkill: buySkill,
  getGhost: getGhost,
  saveGhost: saveGhost,
  isStorySeen: isStorySeen,
  markStorySeen: markStorySeen,
  reportScoreKV: reportScoreKV
};
