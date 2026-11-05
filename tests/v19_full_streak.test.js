// v1.9 连续全勤里程碑 + 任务达成即时反馈 回归
// 关键手法：覆盖 storage.dailyKey 注入「今天」，配合手动改 state.date 模拟真实跨天，
// 不 sleep、不依赖真实时钟，可稳定复现连续/断签/跨月闰年等分支。
const fs = require('fs');
const path = require('path');
const mem = {};
global.wx = {
  getStorageSync: (k) => mem[k],
  setStorageSync: (k, v) => { mem[k] = v; },
  removeStorageSync: (k) => { delete mem[k]; }
};
const storage = require('../minigame/js/core/storage.js');
const task = require('../minigame/js/core/task.js');
const TaskPanel = require('../minigame/js/scene/TaskPanel.js');
task.setDailyThemeOverride('normal'); // 固定标准档，隔离「今日主题」按日轮换对固定 target 断言的影响

let passed = 0, failed = 0;
function T(name, cond) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name); }
}
const KEYS = ['maze_task_v1', 'maze_coupon_v1', 'maze_shard_v1', 'maze_cosmetics_v1', 'maze_task_track_v1', 'maze_skins_v1'];
function reset() { KEYS.forEach(k => delete mem[k]); }
const pad = (n) => (n < 10 ? '0' : '') + n;
const DAY = (i) => '2026-11-' + pad(i);

let TODAY = DAY(5);
storage.dailyKey = function () { return TODAY; };

// 模拟「某天完成全部日常并全部领取」：强制跨天让 ensure() 重置 daily，再走完整链路
function fullDay(date) {
  TODAY = date;
  const s = mem['maze_task_v1'];
  if (s) { s.date = '1999-01-01'; mem['maze_task_v1'] = s; }
  task.onDust(120);                       // D1 光尘 120
  task.onClear(); task.onClear(); task.onClear(); // D2 通关 3
  task.onGameClubTap();                   // D3 打卡 1
  task.claim('D1');
  task.claim('D2');
  return task.claim('D3');                // 最后一次领取触发全勤 + 连续累计
}
function makeSM() {
  return {
    W: 375, H: 667, sat: 20,
    sceneModal: () => {}, toast: () => {}, switch: () => {}
  };
}

(async function main() {
  console.log('--- 1. 初始状态与配置 ---');
  reset();
  let si = task.streakInfo();
  T('初始连续 0 天', si.streak === 0);
  T('下一里程碑 3 天 / 还差 3 天', si.next && si.next.day === 3 && si.next.left === 3);
  T('getState 暴露 fullStreak', task.getState().fullStreak === 0);
  T('里程碑表 3 档且递增', task.FULL_STREAK.length === 3 && task.FULL_STREAK[0].day < task.FULL_STREAK[1].day && task.FULL_STREAK[1].day < task.FULL_STREAK[2].day);
  const kinds = [];
  task.FULL_STREAK.forEach(m => Object.keys(m.reward).forEach(k => { if (kinds.indexOf(k) < 0) kinds.push(k); }));
  T('奖励仅碎片/头像框/称号（不碰广告次数）', kinds.every(k => ['shard', 'frame', 'title'].indexOf(k) >= 0));
  T('新外观元数据齐备', task.cosmeticMeta('frame', '不熄之志').color !== '#FFFFFF' && task.cosmeticMeta('title', '地宫守望').color !== '#FFFFFF');

  console.log('--- 2. prevDay 纯日期函数 ---');
  T('普通前一天', task.prevDay('2026-11-05') === '2026-11-04');
  T('跨月回退', task.prevDay('2026-11-01') === '2026-10-31');
  T('平年 3/1 → 2/28', task.prevDay('2026-03-01') === '2026-02-28');
  T('闰年 3/1 → 2/29', task.prevDay('2024-03-01') === '2024-02-29');
  T('非法输入兜底', task.prevDay('') === '' && task.prevDay('x') === '');

  console.log('--- 3. 连续 1~3 天 + 首个里程碑 ---');
  let r = fullDay(DAY(5));
  T('第1天 streak=1', task.streakInfo().streak === 1);
  T('第1天 lastFullDate 记为今天', mem['maze_task_v1'].lastFullDate === DAY(5));
  T('未到里程碑不发连勤奖', r.streakBonus.length === 0);
  r = fullDay(DAY(6));
  T('第2天 streak=2', task.streakInfo().streak === 2);
  T('第2天还差 1 天', task.streakInfo().next.left === 1);
  const shardBefore = storage.getShards();
  r = fullDay(DAY(7));
  T('第3天 streak=3', task.streakInfo().streak === 3);
  T('第3天发放碎片里程碑', r.streakBonus.some(g => g.kind === 'shard' && g.n === 5));
  T('碎片实际到账（全勤3 + 里程碑5）', storage.getShards() - shardBefore === task.FULL_DAILY.shard + 5);
  T('awarded 记录 3', task.streakInfo().awarded.indexOf(3) >= 0);
  T('下一里程碑切到 7 天', task.streakInfo().next.day === 7 && task.streakInfo().next.left === 4);

  console.log('--- 4. 重复领取不叠加 / 不重发 ---');
  const dup = task.claim('D1');
  T('已领取再领返回失败', dup.ok === false);
  T('streak 不因重复领取变化', task.streakInfo().streak === 3);
  // 人为回到「连续 2 天」再达成第 3 天：awarded 已含 3 → 不应重发碎片
  const st = mem['maze_task_v1'];
  st.fullStreak = 2; st.lastFullDate = DAY(7);
  mem['maze_task_v1'] = st;
  const again = fullDay(DAY(8));
  T('已发过的里程碑不重复发', again.streakBonus.length === 0 && task.streakInfo().streak === 3);

  console.log('--- 5. 跨天未完成不清零 / 断签清零 ---');
  const keep = mem['maze_task_v1'];
  keep.date = '1999-01-01';
  mem['maze_task_v1'] = keep;
  TODAY = DAY(9);
  const s2 = task.ensure();
  T('昨天全勤 → 今日未完成仍保留 streak', s2.fullStreak === 3);
  T('跨天 daily 已重置', task.dailyBrief().done === 0);
  // 跳过 11-10，直接到 11-11：lastFullDate=11-08，prevDay(11-11)=11-10 → 断签
  r = fullDay(DAY(11));
  T('漏一天后 streak 归 1', task.streakInfo().streak === 1);

  console.log('--- 6. 旧存档兼容 ---');
  TODAY = DAY(12);
  mem['maze_task_v1'] = {
    date: TODAY, week: task.weekKey(),
    daily: [{ id: 'D1', progress: 50, claimed: false }, { id: 'D2', progress: 1, claimed: false }, { id: 'D3', progress: 0, claimed: false }],
    weekly: [{ id: 'W1', progress: 3, claimed: false }, { id: 'W2', progress: 100, claimed: false }]
  };
  const old = task.ensure();
  T('旧存档补齐全勤字段', old.fullStreak === 0 && old.lastFullDate === '' && Array.isArray(old.streakAwarded));
  T('旧存档原有进度不丢', old.daily[0].progress === 50 && old.weekly[0].progress === 3);
  T('旧存档可正常领奖流程', task.streakInfo().streak === 0);

  console.log('--- 7. 连续 14 天：外观里程碑 + 全部达成 ---');
  reset();
  for (let i = 1; i <= 14; i++) {
    r = fullDay(DAY(i));
    if (i === 7) T('第7天发放头像框·不熄之志', r.streakBonus.some(g => g.kind === 'frame') && storage.getCosmetics().frames.indexOf('不熄之志') >= 0);
  }
  T('第14天 streak=14', task.streakInfo().streak === 14);
  T('第14天发放称号·地宫守望', r.streakBonus.some(g => g.kind === 'title') && storage.getCosmetics().titles.indexOf('地宫守望') >= 0);
  T('awarded 含 3/7/14', [3, 7, 14].every(d => task.streakInfo().awarded.indexOf(d) >= 0));
  T('所有里程碑达成 → next=null', task.streakInfo().allDone === true && task.streakInfo().next === null);

  console.log('--- 8. 任务面板连续全勤行 ---');
  let panel = TaskPanel.build(makeSM(), function () {}, true);
  T('面板含连续全勤行', panel.rows.length > 0 && panel.rows[0].title.indexOf('连续全勤 14 天') >= 0);
  T('全部达成时副文案正确', panel.rows[0].sub.indexOf('全部里程碑') >= 0);
  reset();
  panel = TaskPanel.build(makeSM(), function () {}, true);
  T('未达成时显示「再 N 天得」', panel.rows[0].sub.indexOf('再 3 天得') >= 0);
  T('未达成时 tag 为进行中', panel.rows[0].tag === '进行中');

  console.log('--- 9. 结算达成判定（纯函数 + 接线）---');
  T('done 增加 → 达成', task.justCompleted({ done: 1 }, { done: 2 }) === true);
  T('done 不变 → 非达成', task.justCompleted({ done: 2 }, { done: 2 }) === false);
  T('领取不改变 done → 非达成', task.justCompleted({ done: 2, claimed: 1 }, { done: 2, claimed: 2 }) === false);
  T('缺参兜底', task.justCompleted(null, { done: 1 }) === false && task.justCompleted({ done: 1 }, null) === false);
  const src = fs.readFileSync(path.join(__dirname, '../minigame/js/scene/GameScene.js'), 'utf8');
  T('结算接线：before/after 快照', src.indexOf('briefBefore') >= 0 && src.indexOf('briefAfter') >= 0);
  T('结算接线：调用 justCompleted 并给达成文案', src.indexOf('task.justCompleted(briefBefore, briefAfter)') >= 0 && src.indexOf('🎉 任务达成！') >= 0);

  console.log('\n通过 ' + passed + ' / 失败 ' + failed);
  if (failed > 0) process.exit(1);
})();
