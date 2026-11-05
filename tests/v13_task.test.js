// v1.3 日常/周常任务系统回归
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
task.setDailyThemeOverride('normal'); // 固定标准档，隔离「今日主题」按日轮换对固定 target 断言的影响

// 清空任务相关存储，确保全新
delete store['maze_task_v1'];
delete store['maze_coupon_v1'];
delete store['maze_shard_v1'];
delete store['maze_cosmetics_v1'];

(async function main() {
  console.log('--- 1. 初始化与刷新 ---');
  let st = task.getState();
  T('初始 3 日常 + 2 周常', st.daily.length === 3 && st.weekly.length === 2);
  T('初始进度全 0', st.daily.every(t => t.progress === 0) && st.weekly.every(t => t.progress === 0));
  T('初始无 canClaim', task.hasClaimable() === false);

  console.log('--- 2. 钩子进度 ---');
  task.onDust(120);
  st = task.getState();
  T('onDust(120) → D1=120 达标', st.daily.find(t => t.id === 'D1').progress === 120 && st.daily.find(t => t.id === 'D1').canClaim === true);
  T('onDust(120) → W2=120', st.weekly.find(t => t.id === 'W2').progress === 120);
  task.onClear();
  st = task.getState();
  T('onClear → D2=1', st.daily.find(t => t.id === 'D2').progress === 1);
  task.onGameClubTap();
  st = task.getState();
  T('onGameClubTap → D3=1 达标', st.daily.find(t => t.id === 'D3').progress === 1 && st.daily.find(t => t.id === 'D3').canClaim === true);
  task.onEndlessDepth(20);
  st = task.getState();
  T('onEndlessDepth(20) → W1=20 达标', st.weekly.find(t => t.id === 'W1').progress === 20 && st.weekly.find(t => t.id === 'W1').canClaim === true);

  console.log('--- 3. hasClaimable ---');
  T('存在达标未领 → hasClaimable=true', task.hasClaimable() === true);

  console.log('--- 4. 领奖发放 ---');
  let r = task.claim('D1');
  T('claim D1 ok', r.ok === true);
  T('D1 发 dust 20', r.got.some(g => g.kind === 'dust' && g.n === 20));
  T('D1 已 claimed', task.getState().daily.find(t => t.id === 'D1').claimed === true);
  let r2 = task.claim('D1');
  T('重复 claim D1 → ok=false', r2.ok === false);
  task.onClear(); task.onClear(); // D2 target=3，补 2 次通关达成
  r = task.claim('D2');
  T('claim D2 发 revive 券', r.got.some(g => g.kind === 'revive' && g.n === 1));
  T('券到账 revive=1', storage.getCoupons().revive === 1);
  T('消费券 → 0', storage.spendCoupon('revive') === true && storage.getCoupons().revive === 0);
  r = task.claim('W1');
  T('claim W1 发 frame 登塔者', r.got.some(g => g.kind === 'frame' && g.n === '登塔者'));
  T('外观收藏记录 frame', storage.getCosmetics().frames.indexOf('登塔者') !== -1);

  console.log('--- 5. 全勤奖励 ---');
  r = task.claim('D3');
  T('claim D3 ok', r.ok === true);
  st = task.getState();
  T('dailyFull=true', st.dailyFull === true);
  T('全勤发 shard 3', r.fullBonus.some(g => g.kind === 'shard' && g.n === 3));
  T('碎片累计=3', storage.getShards() === 3);
  task.onDust(700); // W2 target=800，补足光尘
  r = task.claim('W2');
  T('claim W2 → weeklyFull + 全勤 title', r.ok === true && r.fullBonus.some(g => g.kind === 'title'));

  console.log('--- 6. 跨天/跨周重置 ---');
  let s = JSON.parse(JSON.stringify(store['maze_task_v1']));
  s.date = '2000-01-01';
  store['maze_task_v1'] = s;
  task.ensure();
  st = task.getState();
  T('跨天：daily 进度重置为 0', st.daily.every(t => t.progress === 0));
  s = JSON.parse(JSON.stringify(store['maze_task_v1']));
  s.week = '2000-W01';
  store['maze_task_v1'] = s;
  task.ensure();
  st = task.getState();
  T('跨周：weekly 进度重置为 0', st.weekly.every(t => t.progress === 0));

  console.log('--- 7. storage 钩子集成 ---');
  storage.addDust(50);
  T('storage.addDust(50) 触发 task.onDust → D1=50', task.getState().daily.find(t => t.id === 'D1').progress === 50);
  storage.completeLevel(5, { time: 10, steps: 10, swipe: 10, stars: 1, gems: 5, gemTotal: 5 });
  T('storage.completeLevel 触发 task.onClear → D2=1', task.getState().daily.find(t => t.id === 'D2').progress === 1);

  console.log('\n通过 ' + passed + ' / 失败 ' + failed);
  if (failed > 0) process.exit(1);
})();
