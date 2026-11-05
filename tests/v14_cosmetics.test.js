// v1.4 外观穿戴系统回归（头像框/称号 装备闭环）
const assert = require('assert');
let passed = 0, failed = 0;
function T(name, cond) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name); }
}

// ---- 存储 mock ----
const store = {};
global.wx = {
  getStorageSync: (k) => store[k],
  setStorageSync: (k, v) => { store[k] = v; },
  removeStorageSync: (k) => { delete store[k]; }
};
const task = require('../minigame/js/core/task.js');
const storage = require('../minigame/js/core/storage.js');

['maze_task_v1', 'maze_coupon_v1', 'maze_shard_v1', 'maze_cosmetics_v1', 'maze_hero_v1', 'maze_skins_v1']
  .forEach(k => delete store[k]);

(async function main() {
  console.log('--- 1. 装备 / 卸下 ---');
  storage.unlockCosmetic('frames', '登塔者');
  storage.unlockCosmetic('titles', '地宫常驻');
  T('解锁后 getCosmetics 含登塔者', storage.getCosmetics().frames.indexOf('登塔者') >= 0);
  T('setActiveFrame 成功', storage.setActiveFrame('登塔者') === true);
  T('getActiveCosmetic.frame=登塔者', storage.getActiveCosmetic().frame === '登塔者');
  T('卸下 frame 成功', storage.setActiveFrame(null) === true && storage.getActiveCosmetic().frame === null);
  T('未拥有的框拒绝装备', storage.setActiveFrame('不存在的框') === false && storage.getActiveCosmetic().frame === null);
  storage.setActiveTitle('地宫常驻');
  T('getActiveCosmetic.title=地宫常驻', storage.getActiveCosmetic().title === '地宫常驻');
  T('卸下 title 成功', storage.setActiveTitle(null) === true && storage.getActiveCosmetic().title === null);

  console.log('--- 2. getCosmetics 携带 active 字段 ---');
  storage.setActiveFrame('登塔者');
  T('getCosmetics 含 activeFrame', storage.getCosmetics().activeFrame === '登塔者');

  console.log('--- 3. 元数据回退 ---');
  const m1 = task.cosmeticMeta('frame', '登塔者');
  T('已知 frame 取色', m1.color === '#E36BFF' && m1.name === '登塔者');
  const m2 = task.cosmeticMeta('title', '未知称号');
  T('未知 id 回退到自身', m2.name === '未知称号' && m2.color === '#FFFFFF');

  console.log('--- 4. 任务发放 → 可装备 闭环 ---');
  task.onDust(120);
  task.onClear(); task.onClear(); task.onClear(); // D2 target=3
  task.onGameClubTap();
  task.onEndlessDepth(20); // W1 target=15
  const r = task.claim('W1');
  T('claim W1 发 frame 登塔者', r.ok && r.got.some(g => g.kind === 'frame' && g.n === '登塔者'));
  T('发放后已解锁 frame', storage.getCosmetics().frames.indexOf('登塔者') >= 0);
  storage.setActiveFrame('登塔者');
  T('发放后可直接装备', storage.getActiveCosmetic().frame === '登塔者');

  console.log('--- 5. 每周全勤 → 称号 ---');
  task.onDust(800); // W2 target=800
  const r2 = task.claim('W2');
  T('claim W2 ok', r2.ok === true);
  T('每周全勤发 title 地宫常驻', storage.getCosmetics().titles.indexOf('地宫常驻') >= 0);

  console.log('--- 6. 重置清除装备 ---');
  storage.resetProgress();
  T('重置后 frame 清空', storage.getCosmetics().frames.length === 0);
  T('重置后 active 清空', storage.getActiveCosmetic().frame === null && storage.getActiveCosmetic().title === null);

  console.log('\n通过 ' + passed + ' / 失败 ' + failed);
  if (failed > 0) process.exit(1);
})();
