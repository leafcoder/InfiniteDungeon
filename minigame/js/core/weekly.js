// 周挑战：按自然周重置的 5 个 mod 关卡（计划由周种子确定性生成）
// 周期：周一 00:00 为一周起点；入口见 pages/index，玩法结算见 pages/game
const storage = require('./storage.js');

const BASE_LEVELS = [32, 46, 58, 70, 76]; // 覆盖四档怪物难度，避开 Boss 关（80+）

// 词缀池（key 与 game.js 应用逻辑一一对应）
const MODS = [
  { key: 'fog', name: '浓雾', desc: '全场迷雾笼罩' },
  { key: 'haste', name: '疾走', desc: '怪物移速 +25%' },
  { key: 'noitem', name: '禁补', desc: '地图上不生成道具' },
  { key: 'dark', name: '夜幕', desc: '视野半径减半' },
  { key: 'more', name: '围剿', desc: '怪物数量 +2' },
  { key: 'slow', name: '泥沼', desc: '你的步速降低' }
];

// 当年第几周（周一为界），如 '2026-W44'
function weekKey() {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // 周一=0
  const thursday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day + 3);
  const yearStart = new Date(thursday.getFullYear(), 0, 1);
  const week = Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7);
  return thursday.getFullYear() + '-W' + (('0' + week).slice(-2));
}

// 周种子（FNV-1a，与每日种子同构）
function weekSeed() {
  const k = weekKey();
  let h = 2166136261;
  for (let i = 0; i < k.length; i++) {
    h ^= k.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// 确定性伪随机（mulberry32，与 maze.js 同构）
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 本周计划：5 关，每关 1-2 个词缀（由周种子确定，全服一致）
function getPlan() {
  const doneMap = storage.getWeeklyDone();
  const done = Array.isArray(doneMap[weekKey()]) ? doneMap[weekKey()] : [false, false, false, false, false];
  const rng = mulberry32(weekSeed());
  const plan = [];
  for (let i = 0; i < 5; i++) {
    const pool = MODS.slice();
    const mods = [];
    const modCount = i < 2 ? 1 : 2; // 前两关 1 词缀，后三关 2 词缀
    for (let k = 0; k < modCount && pool.length; k++) {
      const j = Math.floor(rng() * pool.length);
      mods.push(pool.splice(j, 1)[0].key);
    }
    plan.push({
      idx: i,
      level: BASE_LEVELS[i],
      mods: mods,
      done: !!done[i]
    });
  }
  return plan;
}

function weekProgress() {
  const plan = getPlan();
  let n = 0;
  for (let i = 0; i < plan.length; i++) if (plan[i].done) n++;
  return { done: n, total: 5 };
}

module.exports = {
  MODS: MODS,
  weekKey: weekKey,
  weekSeed: weekSeed,
  getPlan: getPlan,
  weekProgress: weekProgress
};
