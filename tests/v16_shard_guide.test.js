// v1.6 碎片不足引导页（shardGuide）回归
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
  console.log('--- 1. shardNeed 缺口计算 ---');
  storage.addShard(0);
  let n1 = task.shardNeed(20);
  T('持有0/需20 → 缺20', n1.need === 20 && n1.have === 0);
  T('缺20 按每日3 → 约7天', n1.days === 7);
  storage.addShard(20);
  let n2 = task.shardNeed(20);
  T('持有20/需20 → 缺0天', n2.need === 0 && n2.days === 0);
  storage.addShard(-15); // 回到5
  let n3 = task.shardNeed(20);
  T('持有5/需20 → 缺15天5', n3.need === 15 && n3.days === 5);

  console.log('--- 2. shardGuide 弹窗构建 ---');
  const Modals = require('../minigame/js/scene/Modals.js');
  const sm = {
    W: 375, H: 667,
    sceneModal: function () {},
    toast: function () {}
  };
  const t = theme.getTheme('glow');
  storage.addDust(200); // 光尘充足 → 出现「光尘解锁」按钮（共 4 个）
  const guide = Modals.shardGuide(sm, 'glow', t, theme.getShardCost('glow'), function () {});
  T('shardGuide 返回 Modal', guide && typeof guide.title === 'string');
  T('标题含「碎片不足」', guide.title.indexOf('碎片不足') >= 0);
  T('按钮数=4（光尘/广告/去做任务/取消）', guide.btns && guide.btns.length === 4);
  T('引导文案含还差碎片数', guide.lines.some(function (l) { return (l.t || '').indexOf('还差') >= 0; }));

  console.log('\n通过 ' + passed + ' / 失败 ' + failed);
  if (failed > 0) process.exit(1);
})();
