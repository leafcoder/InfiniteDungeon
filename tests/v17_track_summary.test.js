// v1.7 埋点可视化（trackSummary + 设置弹窗「任务数据」行）回归
const assert = require('assert');
let passed = 0, failed = 0;
function T(name, cond) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name); }
}

const store = {};
global.wx = {
  getStorageSync: (k) => store[k],
  setStorageSync: (k, v) => { store[k] = v; },
  removeStorageSync: (k) => { delete store[k]; }
};
const task = require('../minigame/js/core/task.js');
const storage = require('../minigame/js/core/storage.js');
const Modals = require('../minigame/js/scene/Modals.js');

['maze_task_v1', 'maze_coupon_v1', 'maze_shard_v1', 'maze_cosmetics_v1', 'maze_skins_v1', 'maze_task_track_v1']
  .forEach(k => delete store[k]);

const sm = { W: 375, H: 667, sceneModal: function () {}, toast: function () {} };
function hasTaskRow(m) {
  return m.rows.some(function (r) { return (r.title || '').indexOf('任务数据') >= 0; });
}

(async function main() {
  console.log('--- 1. 空数据兜底 ---');
  const s0 = task.trackSummary();
  T('空数据全 0', s0.expose === 0 && s0.click === 0 && s0.complete === 0 && s0.claim === 0);
  T('空数据 total=0', s0.total === 0);
  T('空数据转化率=0（不 NaN）', s0.clickRate === 0 && s0.claimRate === 0);

  console.log('--- 2. 转化率计算 ---');
  task.track('expose'); task.track('expose'); task.track('expose'); task.track('expose'); // 4
  task.track('click'); task.track('click');  // 2 → clickRate 50
  task.track('complete'); task.track('complete'); task.track('complete'); task.track('complete'); // 4
  task.track('claim'); task.track('claim'); task.track('claim'); // 3 → claimRate 75
  const s1 = task.trackSummary();
  T('计数正确', s1.expose === 4 && s1.click === 2 && s1.complete === 4 && s1.claim === 3);
  T('clickRate=50', s1.clickRate === 50);
  T('claimRate=75', s1.claimRate === 75);
  T('total=13', s1.total === 13);

  console.log('--- 3. 设置弹窗不再暴露开发向数据行（功能清理）---');
  const m0 = Modals.showSettings(sm, function () {});
  T('有埋点数据也不显示「任务数据（本机）」行', hasTaskRow(m0) === false);
  T('不再显示「埋点上报」状态行', !m0.rows.some(r => (r.title || '').indexOf('埋点上报') >= 0));
  T('挑战码已收进设置二级页', !!m0.rows.filter(function (r) { return r.title === '挑战码'; })[0]);

  console.log('--- 4. 数据层仍在工作（只是不再展示）---');
  T('任务漏斗计数未被删除', task.trackSummary().total > 0);
  delete store['maze_task_track_v1'];
  const m1 = Modals.showSettings(sm, function () {});
  T('无数据时同样不显示任务数据行', hasTaskRow(m1) === false);

  console.log('--- 5. 重置清除埋点 ---');
  task.track('expose');
  T('重置前有数据', task.trackSummary().total > 0);
  storage.resetProgress();
  T('重置后 total=0', task.trackSummary().total === 0);

  console.log('\n通过 ' + passed + ' / 失败 ' + failed);
  if (failed > 0) process.exit(1);
})();
