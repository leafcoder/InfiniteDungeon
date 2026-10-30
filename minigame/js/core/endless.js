// 无尽地宫塔（N6）：通关全部主线后解锁的无限爬层模式
// 每层一小关，每 5 层换一区主题氛围，每 10 层一个 Boss 层；种子固定 → 同层地图恒定，可背版
const storage = require('./storage.js');

const ZONES = [
  { key: 'forest', name: '林间回梯', emoji: '🌲' },
  { key: 'canyon', name: '雾谷盘道', emoji: '🌫️' },
  { key: 'corridor', name: '灯廊回旋', emoji: '✨' },
  { key: 'lava', name: '炉心竖井', emoji: '🔥' },
  { key: 'star', name: '星穹栈桥', emoji: '⭐' },
  { key: 'void', name: '虚空洞窟', emoji: '🌀' }
];

const MODS = [
  { key: 'fog', name: '浓雾', desc: '全场迷雾笼罩' },
  { key: 'haste', name: '疾走', desc: '怪物移速 +25%' },
  { key: 'noitem', name: '禁补', desc: '地图上不生成道具' },
  { key: 'dark', name: '夜幕', desc: '视野半径减半' },
  { key: 'more', name: '围剿', desc: '怪物数量 +2' },
  { key: 'slow', name: '泥沼', desc: '你的步速降低' }
];

// mulberry32（与 weekly/maze 同构）
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 14), 1)) >>> 0;
    return t / 4294967296;
  };
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function floorSeed(floor) {
  return hashStr('endless-' + floor);
}

// 层配置：{ boss, level, zone, mods, seed }
function floorSpec(floor) {
  floor = Math.max(1, floor | 0);
  const boss = floor % 10 === 0;
  // 普通层：22 + 2n 封顶 76（覆盖四档怪物且迷宫不过分大）；Boss 层固定 85（限时追逐关）
  const level = boss ? 85 : Math.min(76, 22 + floor * 2);
  const zone = ZONES[Math.floor((floor - 1) / 5) % ZONES.length];
  const mods = [];
  if (!boss) {
    const count = floor < 6 ? 0 : (floor < 15 ? 1 : 2);
    if (count > 0) {
      const rnd = mulberry32(floorSeed(floor) ^ 0x9E3779B9);
      const pool = MODS.slice();
      for (let i = 0; i < count && pool.length; i++) {
        mods.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0].key);
      }
    }
  }
  return { boss: boss, level: level, zone: zone, mods: mods, seed: floorSeed(floor) };
}

// 解锁条件：主线 120 关全部通关
function isUnlocked() {
  const prog = storage.getProgress();
  let done = 0;
  for (const k in (prog.completed || {})) done++;
  return done >= storage.TOTAL;
}

module.exports = {
  ZONES: ZONES,
  MODS: MODS,
  floorSpec: floorSpec,
  floorSeed: floorSeed,
  isUnlocked: isUnlocked
};
