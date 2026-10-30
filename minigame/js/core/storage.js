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

// 英雄微特性（N5）：每款 1 条轻特性，强化收集意义；数值刻意压低不卖数值
const HERO_TRAITS = {
  rover:   { name: '旅人直觉', desc: '探索度评价 +3 分', explore: 3 },
  mint:    { name: '薄荷清爽', desc: '道具效果时长 +10%', fxDur: 1.10 },
  sunset:  { name: '霞光馈赠', desc: '光尘结算 +5%', gem: 1.05 },
  abyssal: { name: '渊视', desc: '迷雾关火把视野 +8%', view: 1.08 },
  sakura:  { name: '樱盾', desc: '开局 2 秒无敌', invuln: 2000 },
  lava:    { name: '熔核余温', desc: 'Boss 追逐关步频 +5%', bossStep: 0.95 },
  royal:   { name: '贵胄礼遇', desc: '每日挑战光尘 +10%', daily: 1.10 }
};
function getHeroTrait() {
  return HERO_TRAITS[getHero()] || null;
}

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

// 道具实际生效时长（秒）：基础 + 等级增量，再乘「磐石」天赋加成
function fxDuration(k) {
  const u = getUpgrades();
  const base = UPG_BASE[k] + (UPG_DELTA[k] || 0) * (u[k] || 0);
  const tr = HERO_TRAITS[getHero()];
  const heroMul = tr && tr.fxDur ? tr.fxDur : 1;
  return Math.round(base * (1 + 0.04 * (getTalents().guard || 0)) * heroMul * 100) / 100;
}

// ---------------- 旅人之路（N7 局外天赋树） ----------------
// 三条支线各 5 级，光尘购买、永久生效；满树只改手感、不破坏关卡难度标定。
// 拾光：火把光照半径 +4%/级、光尘结算 +2%/级
// 磐石：道具效果时长 +4%/级（fxDuration 内乘算）
// 疾风：移动步频 -3%/级（PlayCore.stepMul）
const TAL_KEY = 'maze_talent_v1';
const TAL_COST = [20, 35, 55, 80, 120];             // Lv0→1 … 4→5
const TAL_MAX = TAL_COST.length;
const TALENT_META = {
  gather: { name: '拾光', icon: 'star', col: '#FFD86E', desc: '火把光照 +4% · 光尘结算 +2%（每级）' },
  guard: { name: '磐石', icon: 'shield', col: '#6FE3D2', desc: '道具效果时长 +4%（每级）' },
  swift: { name: '疾风', icon: 'bolt', col: '#FF9AB8', desc: '移动步频 -3%，转身更跟手（每级）' }
};

function getTalents() {
  try {
    const t = wx.getStorageSync(TAL_KEY);
    if (t && typeof t === 'object') {
      return { gather: Math.min(t.gather || 0, TAL_MAX), guard: Math.min(t.guard || 0, TAL_MAX), swift: Math.min(t.swift || 0, TAL_MAX) };
    }
  } catch (e) {}
  return { gather: 0, guard: 0, swift: 0 };
}

function buyTalent(k) {
  if (!TALENT_META[k]) return false;
  const t = getTalents();
  const lv = t[k] || 0;
  if (lv >= TAL_MAX) return false;
  if (!spendDust(TAL_COST[lv])) return false;
  t[k] = lv + 1;
  try {
    wx.setStorageSync(TAL_KEY, t);
  } catch (e) {}
  return true;
}

// 拾光：光尘结算倍率（落霞行者特性再 +5%）
function gemValueMul() {
  const tr = HERO_TRAITS[getHero()];
  const heroMul = tr && tr.gem ? tr.gem : 1;
  return (1 + 0.02 * (getTalents().gather || 0)) * heroMul;
}
// 拾光：迷雾视野倍率（PlayCore.revealAround 乘算）
function viewMul() {
  return 1 + 0.04 * (getTalents().gather || 0);
}
// 疾风：步频倍率（越小越快）
function stepMul() {
  return 1 - 0.03 * (getTalents().swift || 0);
}

// ---------------- 探索度奖章（N9 第 4 颗星） ----------------
// 分数 0-100：光尘拾取率 / 暗室发现率 / 功能道具拾取率 / 迷雾覆盖率 加权归一。
// 奖章：≥85 金 / ≥65 银 / ≥40 铜。金奖章集齐一区（20 关）→ 分区卡「✦ 制霸」。
const EXPLORE_KEY = 'maze_explore_v1';
const ZONE_SIZE = 20;

function getExplore() {
  try {
    const e = wx.getStorageSync(EXPLORE_KEY);
    if (e && typeof e === 'object') return e;
  } catch (e2) {}
  return {};
}

// medal：0 无 / 1 铜 / 2 银 / 3 金；同关只保留更高分
function recordExplore(level, score, medal) {
  const e = getExplore();
  const k = 'l' + level;
  const cur = e[k];
  if (cur && cur.score >= score) return false;
  e[k] = { score: score, medal: medal };
  try {
    wx.setStorageSync(EXPLORE_KEY, e);
  } catch (e2) {}
  return true;
}

function bestExplore(level) {
  return getExplore()['l' + level] || null;
}

// 分区制霸进度：金奖章数 / 20，全部金 → mastered
function zoneExplore(zoneIdx) {
  const e = getExplore();
  const start = zoneIdx * ZONE_SIZE + 1;
  let gold = 0;
  let done = 0;
  for (let lv = start; lv < start + ZONE_SIZE; lv++) {
    const r = e['l' + lv];
    if (r) {
      done++;
      if (r.medal >= 3) gold++;
    }
  }
  return { gold: gold, done: done, total: ZONE_SIZE, mastered: gold >= ZONE_SIZE };
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
  try {
    wx.removeStorageSync(EXPLORE_KEY); // 探索度与通关记录绑定，一并清空（天赋/皮肤等光尘资产保留）
  } catch (e) {}
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

/* ============ 图鉴（遭遇即解锁 + 计数，伙伴解锁数据源） ============ */
const CODEX_KEY = 'maze_codex_v1';
function getCodex() {
  try {
    const c = wx.getStorageSync(CODEX_KEY);
    return (c && typeof c === 'object') ? c : {};
  } catch (e) {
    return {};
  }
}
// 记录一次遭遇（累计计数）；首次遭遇返回 true（图鉴新增）
function encounterCodex(key) {
  const c = getCodex();
  const first = !c[key];
  c[key] = (c[key] || 0) + 1;
  try {
    wx.setStorageSync(CODEX_KEY, c);
  } catch (e) {}
  return first;
}
function codexCount(key) {
  return getCodex()[key] || 0;
}

/* ============ 怪物伙伴（N8）：某类怪物遭遇满 10 次 → 结伴同行（纯展示） ============ */
const PARTNER_NEED = 10;
const PARTNER_META = {
  patrol:  { name: '巡影狼崽', emoji: '🐺', desc: '巡逻怪 · 地宫里的老住户' },
  chaser:  { name: '追风蝠', emoji: '🦇', desc: '视线追击怪 · 认准了就不撒手' },
  shooter: { name: '窥视之眼', emoji: '👁️', desc: '射击怪 · 远远盯着你的那一个' },
  boss:    { name: '地宫魔王', emoji: '👹', desc: 'Boss · 折服于你的逃脱技巧' }
};
function getPartner() {
  // 按解锁难度从低到高取第一个达成 10 次的怪物类型
  const order = ['patrol', 'chaser', 'shooter', 'boss'];
  for (let i = 0; i < order.length; i++) {
    const n = codexCount('m_' + order[i]);
    if (n >= PARTNER_NEED) return { key: order[i], count: n, meta: PARTNER_META[order[i]] };
  }
  return null;
}
function partnerProgress() {
  // 图鉴展示：四种怪物的遭遇进度
  const order = ['patrol', 'chaser', 'shooter', 'boss'];
  return order.map(function (k) {
    return { key: k, count: codexCount('m_' + k), meta: PARTNER_META[k], unlocked: codexCount('m_' + k) >= PARTNER_NEED };
  });
}

/* ============ 旅人手记（N10）：分区首通 + 制霸各解锁一段轻剧情 ============ */
const JOURNAL = [
  { zone: 0, kind: 'clear', title: '第一缕火光', text: '听说每个走进地宫的人，手里都提着同一盏灯。没人知道灯是谁挂的，也没人见过挂灯的人。你拨开藤蔓，火光在石壁上晃出细长的影子——影子比你先一步，往深处去了。' },
  { zone: 0, kind: 'master', title: '森林的低语', text: '走完这片森林才发现，树根不是长在地里的，是从地宫的砖缝里钻出来的。它们在这里生活了很久，久到忘记了天上是什么样子。你拍了拍最粗的那条根，它轻轻颤了一下，像是在道别。' },
  { zone: 1, kind: 'clear', title: '雾从何处来', text: '峡谷的雾有味道，像旧书页混着铁锈。老旅人说，雾是地宫的呼吸——它睡着了，呼吸就重。你把火把举高些，雾退开一步，又慢慢围拢上来，像好奇，又像挽留。' },
  { zone: 1, kind: 'master', title: '峡谷的守灯人', text: '走出峡谷那晚，你在雾里看见一个提灯的背影，走得不快，每一步都踩在你踩过的石头上。你想追，雾却散了。后来你才明白：那是每一个走完峡谷的人，都会替下一个人留下的路。' },
  { zone: 2, kind: 'clear', title: '回廊的灯为何还亮', text: '流光回廊的灯亮了几百年，没有油，没有芯，也没有人添。石壁上的刻痕写着同一句话：光不灭，是因为还有人要走这条路。你伸手碰了碰灯座，光晃了晃，像在点头。' },
  { zone: 2, kind: 'master', title: '镜子里的旅人', text: '回廊尽头有一面旧镜，照出的不是你，是很多个提灯的背影——他们走同一个方向，脚步声连成一条河。你朝镜子挥挥手，河里所有的背影都停了一瞬，然后一起挥了挥手。' },
  { zone: 3, kind: 'clear', title: '深渊的心跳', text: '熔岩深渊的地是暖的，隔几秒会轻轻一颤，像心跳。老旅人说那不是地脉，是地宫在做梦。梦里它还是一座城，街上有人，窗里有灯。你踩着它的梦走过去，尽量放轻了脚步。' },
  { zone: 3, kind: 'master', title: '不灭的炉火', text: '深渊最深处有一座冷掉的炉子，炉膛里留着半块没烧完的柴。你把火把凑近，柴又烧了起来。火光照亮炉边的刻字：愿后来的人，都有一口热饭。你坐下来，把干粮烤热了才走。' },
  { zone: 4, kind: 'clear', title: '把星星踩在脚下', text: '星海之巅没有路，只有一片会流动的星光。旅人手册上写：别信眼睛，信脚下的凉意——星星是虚的，石头是真的。你走出第一步时，整片星海晃了一下，像被踩醒的水面。' },
  { zone: 4, kind: 'master', title: '灯塔与回信', text: '山顶有一座熄灭的灯塔。你把火把放进灯室的那一刻，整片星海亮了，光顺着来时的路铺回去，一直铺到入口。听说走夜路的新旅人都看见过这道光，他们说：那是有人先走到了山顶。' },
  { zone: 5, kind: 'clear', title: '回响是什么', text: '虚空回响里没有怪物的咆哮，只有你自己的脚步声——比你慢半拍，从很远的地方跟上来。你停下，它也停下。你笑，它隔了一拍才笑。这里回响的不是声音，是你走过的每一步。' },
  { zone: 5, kind: 'master', title: '归途', text: '走出第 120 关的时候，你手里的灯忽然轻了。低头看，灯还在，火却变成了一颗小小的、温热的光。你终于明白：地宫从来不想留住谁，它只是想确认——每一个走进来的人，都能带着光走出去。' }
];
function journalList() {
  const prog = getProgress();
  const completed = prog.completed || {};
  return JOURNAL.map(function (j, idx) {
    const start = j.zone * 20 + 1;
    let clear = false;
    let master = true;
    for (let lv = start; lv < start + 20; lv++) {
      if (completed[lv]) clear = true;
      else master = false;
    }
    return {
      idx: idx,
      zone: j.zone,
      kind: j.kind,
      title: j.title,
      text: j.text,
      unlocked: j.kind === 'clear' ? clear : (clear && master)
    };
  });
}

/* ============ 口令历史（E2）：最近 5 条 + 本口令最佳纪录 ============ */
const CODE_HIST_KEY = 'maze_codehist_v1';
const CODE_BEST_KEY = 'maze_codebest_v1';
function getCodeHist() {
  try {
    const h = wx.getStorageSync(CODE_HIST_KEY);
    return Array.isArray(h) ? h : [];
  } catch (e) {
    return [];
  }
}
function addCodeHist(code) {
  if (!code) return;
  let h = getCodeHist().filter(function (c) { return c !== code; });
  h.unshift(code);
  h = h.slice(0, 5);
  try { wx.setStorageSync(CODE_HIST_KEY, h); } catch (e) {}
}
function removeCodeHist(code) {
  try { wx.setStorageSync(CODE_HIST_KEY, getCodeHist().filter(function (c) { return c !== code; })); } catch (e) {}
}
// 本口令最佳用时（秒，取最小）；返回 {time, improved}
function recordCodeBest(code, time) {
  let best = {};
  try {
    const b = wx.getStorageSync(CODE_BEST_KEY);
    if (b && typeof b === 'object') best = b;
  } catch (e) {}
  const improved = !best[code] || time < best[code];
  if (improved) best[code] = time;
  try { wx.setStorageSync(CODE_BEST_KEY, best); } catch (e) {}
  return { time: best[code], improved: improved };
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
  getHeroTrait: getHeroTrait,
  HERO_TRAITS: HERO_TRAITS,
  encounterCodex: encounterCodex,
  codexCount: codexCount,
  getPartner: getPartner,
  partnerProgress: partnerProgress,
  PARTNER_META: PARTNER_META,
  PARTNER_NEED: PARTNER_NEED,
  journalList: journalList,
  getCodeHist: getCodeHist,
  addCodeHist: addCodeHist,
  removeCodeHist: removeCodeHist,
  recordCodeBest: recordCodeBest,
  getUpgrades: getUpgrades,
  buyUpgrade: buyUpgrade,
  TALENT_META: TALENT_META,
  TAL_COST: TAL_COST,
  TAL_MAX: TAL_MAX,
  getTalents: getTalents,
  buyTalent: buyTalent,
  gemValueMul: gemValueMul,
  viewMul: viewMul,
  stepMul: stepMul,
  getExplore: getExplore,
  recordExplore: recordExplore,
  bestExplore: bestExplore,
  zoneExplore: zoneExplore,
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
