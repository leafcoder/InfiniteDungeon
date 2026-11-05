// v1.8 任务进度可见化（dailyBrief + HomeScene 缓存）回归
const path = require('path');
const ROOT = '/home/zhanglei3/WorkBuddy/2026-10-26-14-05-57/MazeGame/minigame/js';
const mem = {};
global.wx = {
  getStorageSync: (k) => mem[k],
  setStorageSync: (k, v) => { mem[k] = v; },
  removeStorageSync: (k) => { delete mem[k]; }
};
const storage = require(path.join(ROOT, 'core/storage.js'));
const task = require(path.join(ROOT, 'core/task.js'));
const HomeScene = require(path.join(ROOT, 'scene/HomeScene.js'));
task.setDailyThemeOverride('normal'); // 固定标准档，隔离「今日主题」按日轮换对固定 target 断言的影响

let passed = 0, failed = 0;
function T(name, cond) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name); }
}
function makeSM() {
  return {
    W: 375, H: 667, sat: 20,
    toast: () => {}, sceneModal: () => {},
    switch: () => {}
  };
}

['maze_task_v1', 'maze_coupon_v1', 'maze_shard_v1', 'maze_task_track_v1']
  .forEach(k => delete mem[k]);

(async function main() {
  console.log('--- 1. 初始状态 ---');
  const b0 = task.dailyBrief();
  T('total=3', b0.total === 3);
  T('done=0 / remain=3', b0.done === 0 && b0.remain === 3);
  T('claimable=0 / full=false', b0.claimable === 0 && b0.full === false);
  T('文案含「全勤可得」', b0.text.indexOf('全勤可得') >= 0);

  console.log('--- 2. 完成 1 个 → 待领 ---');
  task.onDust(120); // D1 target=120
  const b1 = task.dailyBrief();
  T('done=1 / claimable=1', b1.done === 1 && b1.claimable === 1);
  T('文案含「待领」', b1.text.indexOf('待领') >= 0);

  console.log('--- 3. 领取后 → 还差 1 个（目标梯度）---');
  task.claim('D1');
  task.onClear(); task.onClear(); task.onClear(); // D2 target=3
  const b2 = task.dailyBrief();
  T('done=2 / claimed=1 / claimable=1', b2.done === 2 && b2.claimed === 1 && b2.claimable === 1);
  task.claim('D2');
  const b3 = task.dailyBrief();
  T('done=2 / claimed=2 / remain=1', b3.done === 2 && b3.claimed === 2 && b3.remain === 1);
  T('文案含「再完成 1 个」', b3.text.indexOf('再完成 1 个') >= 0);
  T('文案含碎片数', b3.text.indexOf(String(task.FULL_DAILY.shard)) >= 0);

  console.log('--- 4. 全勤达成 ---');
  task.onGameClubTap(); // D3 target=1
  const b4 = task.dailyBrief();
  T('done=3 / claimable=1', b4.done === 3 && b4.claimable === 1);
  task.claim('D3');
  const b5 = task.dailyBrief();
  T('full=true / claimable=0', b5.full === true && b5.claimable === 0);
  T('文案含「全勤达成」', b5.text.indexOf('全勤达成') >= 0);
  T('全勤确实发放碎片', storage.getShards() === task.FULL_DAILY.shard);

  console.log('--- 5. HomeScene 进页缓存 ---');
  const hs = new HomeScene(makeSM());
  hs.enter();
  T('enter 后 taskBrief 存在', !!hs.taskBrief && typeof hs.taskBrief === 'object');
  T('缓存值与 dailyBrief 一致', hs.taskBrief.total === 3 && hs.taskBrief.full === task.dailyBrief().full);
  T('dock 仍为 7 项且含任务', hs.dock.length === 7 && hs.dock[6].key === 'task');

  console.log('--- 6. 跨天重置 → 摘要归零 ---');
  const s = mem['maze_task_v1'];
  s.date = '1999-01-01';
  mem['maze_task_v1'] = s;
  const b6 = task.dailyBrief();
  T('跨天后 done=0 / remain=3', b6.done === 0 && b6.remain === 3);
  T('跨天后文案回到全勤可得', b6.text.indexOf('全勤可得') >= 0);
  const hs2 = new HomeScene(makeSM());
  hs2.enter();
  T('重新进页缓存也刷新为 0', hs2.taskBrief.done === 0);

  console.log('\n通过 ' + passed + ' / 失败 ' + failed);
  if (failed > 0) process.exit(1);
})();
