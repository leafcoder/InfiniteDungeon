// 节日限时活动（N12）：复用现有皮肤主题做氛围，3 关固定词缀关 + 限定称号
// 入口见 HomeScene 限时胶囊；结算见 GameScene mode='festival'
const storage = require('./storage.js');

// start/end 为 MM-DD；支持跨年区间（如新春 01-15 ~ 02-20）
const FESTIVALS = [
  {
    id: 'halloween', name: '万圣夜巡游', emoji: '🎃', iconKey: 'pumpkin',
    start: '10-24', end: '11-02', skin: 'festival',
    tagline: '南瓜灯亮起，地宫的墙在偷笑',
    levels: [40, 70, 95],
    mods: ['fog', 'more', 'haste']
  },
  {
    id: 'solstice', name: '冬至点灯', emoji: '🕯️',
    start: '12-20', end: '12-27', skin: 'glow',
    tagline: '一年里最长的夜，适合提灯深行',
    levels: [36, 64, 92],
    mods: ['dark', 'noitem', 'haste']
  },
  {
    id: 'cny', name: '新春点灯', emoji: '🏮',
    start: '01-15', end: '02-20', skin: 'festival',
    tagline: '把灯笼挂进地宫，照亮回家的路',
    levels: [34, 62, 90],
    mods: ['more', 'dark', 'slow']
  },
  {
    id: 'midautumn', name: '中秋月圆', emoji: '🌕',
    start: '09-20', end: '09-30', skin: 'sakura',
    tagline: '月光淌进回廊，怪也看得出神',
    levels: [38, 66, 94],
    mods: ['dark', 'fog', 'more']
  }
];

function mmdd(d) {
  const m = ('0' + (d.getMonth() + 1)).slice(-2);
  const day = ('0' + d.getDate()).slice(-2);
  return m + '-' + day;
}

// 命中当前日期的活动；无则 null。可传 Date 便于测试
function getActive(now) {
  const d = now || new Date();
  const k = mmdd(d);
  for (let i = 0; i < FESTIVALS.length; i++) {
    const f = FESTIVALS[i];
    if (f.start <= f.end) {
      if (k >= f.start && k <= f.end) return f;
    } else if (k >= f.start || k <= f.end) { // 跨年
      return f;
    }
  }
  return null;
}

// FNV-1a 字符串种子（与 daily/weekly 同构）
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function festSeed(festId, idx) {
  return hashStr(festId + '-lv' + idx);
}

// 活动关配置：{ level, mods, seed, skin }
function festSpec(fest, idx) {
  return {
    level: fest.levels[idx],
    mods: [fest.mods[idx % fest.mods.length]],
    seed: festSeed(fest.id, idx),
    skin: fest.skin
  };
}

// 已获得限定称号（供 storage.getFestTitles 用）
function festTitles() {
  return FESTIVALS.map(function (f) { return { id: f.id, name: f.name + ' · ' + f.emoji }; });
}

module.exports = {
  FESTIVALS: FESTIVALS,
  getActive: getActive,
  festSeed: festSeed,
  festSpec: festSpec,
  festTitles: festTitles
};
