// v1.5 皮肤碎片兑换 + 任务埋点 回归
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
const theme = require('../minigame/js/core/theme.js');

['maze_task_v1', 'maze_coupon_v1', 'maze_shard_v1', 'maze_cosmetics_v1', 'maze_skins_v1', 'maze_task_track_v1']
  .forEach(k => delete store[k]);

(async function main() {
  console.log('--- 1. 碎片兑换核心（storage 层）---');
  T('初始碎片=0', storage.getShards() === 0);
  storage.addShard(20);
  T('addShard(20) 后=20', storage.getShards() === 20);
  T('spendShard(20) 足额扣减返回 0', storage.spendShard(20) === 0 && storage.getShards() === 0);
  storage.addShard(10);
  T('不足额 spendShard 返回 false 且不计扣', storage.spendShard(20) === false && storage.getShards() === 10);
  storage.addShard(10); // 20
  storage.spendShard(20);
  storage.unlockSkin('glow');
  storage.setTheme('glow');
  T('碎片兑换后 glow 已解锁', storage.getUnlockedSkins().indexOf('glow') >= 0);
  T('碎片兑换后主题切换为 glow', storage.getTheme() === 'glow');

  console.log('--- 2. 主题碎片价表 ---');
  T('classic 不可碎片兑换(=0)', theme.getShardCost('classic') === 0);
  T('glow 碎片价=20', theme.getShardCost('glow') === 20);
  T('sakura 碎片价=60', theme.getShardCost('sakura') === 60);

  console.log('--- 3. 任务埋点（曝光/点击/完成/领取）---');
  delete store['maze_task_v1'];
  delete store['maze_task_track_v1'];
  task.onDust(120); // D1 target=120 → 完成事件 +1
  const tk0 = storage.getTaskTrack();
  T('进度达目标记 complete', tk0.complete >= 1);
  const rc = task.claim('D1'); // 领取 → claim +1
  T('claim D1 成功', rc.ok === true);
  T('领取后 claim 计数+1', storage.getTaskTrack().claim >= 1);
  task.track('expose');
  task.track('click');
  const tk1 = storage.getTaskTrack();
  T('expose/click/complete/claim 均>0', tk1.expose >= 1 && tk1.click >= 1 && tk1.complete >= 1 && tk1.claim >= 1);

  console.log('--- 4. 重置清除埋点 ---');
  storage.resetProgress();
  const tk2 = storage.getTaskTrack();
  T('重置后埋点全清', tk2.expose === 0 && tk2.click === 0 && tk2.complete === 0 && tk2.claim === 0);

  console.log('--- 5. 重置清除碎片与皮肤 ---');
  storage.addShard(20);
  storage.unlockSkin('glow');
  storage.resetProgress();
  T('重置后碎片=0', storage.getShards() === 0);
  T('重置后皮肤仅 classic', storage.getUnlockedSkins().length === 1 && storage.getUnlockedSkins()[0] === 'classic');

  console.log('\n通过 ' + passed + ' / 失败 ' + failed);
  if (failed > 0) process.exit(1);
})();
