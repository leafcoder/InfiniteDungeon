// v2.0 每日任务「今日主题」按日轮换 回归
// 关键手法：覆盖 storage.dailyKey 注入日期 + setDailyThemeOverride 固定档位，
// 既验证确定性轮换，又能在固定档位下验证各档 target/奖励/全勤链路。
const mem = {};
global.wx = {
  getStorageSync: (k) => mem[k],
  setStorageSync: (k, v) => { mem[k] = v; },
  removeStorageSync: (k) => { delete mem[k]; }
};
const storage = require('../minigame/js/core/storage.js');
const task = require('../minigame/js/core/task.js');
const TaskPanel = require('../minigame/js/scene/TaskPanel.js');

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
function makeSM() {
  return { W: 375, H: 667, sat: 20, sceneModal: () => {}, toast: () => {}, switch: () => {} };
}
function D(id) { return task.getState().daily.filter(t => t.id === id)[0]; }

(async function main() {
  console.log('--- 1. 配置与向后兼容 ---');
  T('三档主题齐备', ['easy', 'normal', 'hard'].every(k => !!task.DAILY_THEMES[k]));
  T('TASKS.daily 恒为标准档 120/3/1', task.TASKS.daily.map(t => t.target).join(',') === '120,3,1');
  T('buildDaily(normal) 与基础定义一致', task.buildDaily('normal').map(t => t.target).join(',') === '120,3,1');
  const es = task.DAILY_THEMES.easy.targets, ns = task.DAILY_THEMES.normal.targets, hs = task.DAILY_THEMES.hard.targets;
  T('D1/D2 目标三档递增', es.D1 < ns.D1 && ns.D1 < hs.D1 && es.D2 < ns.D2 && ns.D2 < hs.D2);
  T('D3 打卡恒为 1（社交行为不加量）', es.D3 === 1 && ns.D3 === 1 && hs.D3 === 1);
  T('全勤碎片恒为 3（保护 shardNeed 天数换算）', task.FULL_DAILY.shard === 3);
  const kinds = [];
  ['easy', 'normal', 'hard'].forEach(k => Object.keys(task.DAILY_THEMES[k].rewards).forEach(id => {
    Object.keys(task.DAILY_THEMES[k].rewards[id]).forEach(r => { if (kinds.indexOf(r) < 0) kinds.push(r); });
  }));
  T('奖励仅软货币/免费券，无广告次数', kinds.every(r => ['dust', 'revive', 'unlock', 'shard', 'frame', 'title'].indexOf(r) >= 0));

  console.log('--- 2. variantOfDay 确定性轮换 ---');
  T('同一天结果确定', task.variantOfDay('2026-11-05') === task.variantOfDay('2026-11-05'));
  T('周六固定丰饶日', task.variantOfDay('2026-11-07') === 'easy');
  T('周日固定丰饶日', task.variantOfDay('2026-11-01') === 'easy');
  T('非法输入回退寻常日', task.variantOfDay('') === 'normal' && task.variantOfDay('x') === 'normal');
  // 遍历 2026 全年：验证三档在工作日都会出现，且结果恒合法（不依赖具体某一天）
  const seen = {};
  let allValid = true;
  for (let m = 1; m <= 12; m++) {
    const dim = new Date(2026, m, 0).getDate();
    for (let d = 1; d <= dim; d++) {
      const v = task.variantOfDay('2026-' + pad(m) + '-' + pad(d));
      if (['easy', 'normal', 'hard'].indexOf(v) < 0) allValid = false;
      seen[v] = (seen[v] || 0) + 1;
    }
  }
  T('全年结果恒合法', allValid);
  T('全年三档均出现', seen.easy > 0 && seen.normal > 0 && seen.hard > 0);
  T('周末均为丰饶日', (function () {
    for (let m = 1; m <= 12; m++) {
      const dim = new Date(2026, m, 0).getDate();
      for (let d = 1; d <= dim; d++) {
        const dow = new Date(2026, m - 1, d).getDay();
        if ((dow === 0 || dow === 6) && task.variantOfDay('2026-' + pad(m) + '-' + pad(d)) !== 'easy') return false;
      }
    }
    return true;
  })());

  console.log('--- 3. 试炼日档位生效 ---');
  reset();
  task.setDailyThemeOverride('hard');
  T('themeInfo 为试炼日', task.themeInfo().label === '试炼日' && task.themeInfo().key === 'hard');
  T('D1 target=180 / D2 target=5', D('D1').target === 180 && D('D2').target === 5);
  T('D1 名称带主题前缀', D('D1').name.indexOf('试炼·') === 0);
  T('D1 奖励 dust35 / D2 奖励 revive2', D('D1').reward.dust === 35 && D('D2').reward.revive === 2);
  task.onDust(120);
  T('试炼日 onDust(120) 未达标', D('D1').progress === 120 && D('D1').canClaim === false);
  task.onDust(60);
  T('试炼日 onDust(180) 达标', D('D1').canClaim === true);
  for (let i = 0; i < 5; i++) task.onClear();
  T('试炼日 5 次通关达标', D('D2').canClaim === true);
  T('试炼日 dailyBrief 文案仍可读', task.dailyBrief().text.indexOf('今日') >= 0);

  console.log('--- 4. 丰饶日档位生效 ---');
  reset();
  task.setDailyThemeOverride('easy');
  T('D1 target=80 / D2 target=2', D('D1').target === 80 && D('D2').target === 2);
  T('丰饶日奖励不减（dust20 / revive1）', D('D1').reward.dust === 20 && D('D2').reward.revive === 1);
  task.onDust(80);
  T('丰饶日 onDust(80) 达标', D('D1').canClaim === true);
  task.onClear(); task.onClear();
  T('丰饶日 2 次通关达标', D('D2').canClaim === true);

  console.log('--- 5. 三档全勤链路均闭环 ---');
  ['easy', 'normal', 'hard'].forEach(function (v) {
    reset();
    task.setDailyThemeOverride(v);
    const defs = task.buildDaily(v);
    task.onDust(defs[0].target);
    for (let i = 0; i < defs[1].target; i++) task.onClear();
    task.onGameClubTap();
    task.claim('D1'); task.claim('D2');
    const r = task.claim('D3');
    T(v + ' 全勤发放碎片 ×3', r.fullBonus.some(g => g.kind === 'shard' && g.n === 3) && task.dailyBrief().full === true);
    T(v + ' 主题信息随 getState 暴露', task.getState().theme.key === v);
  });

  console.log('--- 6. 跨天重算与缓存一致 ---');
  reset();
  task.setDailyThemeOverride('');        // 恢复真实轮换
  TODAY = DAY(4);
  mem['maze_task_v1'] = {
    date: TODAY, week: task.weekKey(), theme: 'normal',
    daily: [{ id: 'D1', progress: 10, claimed: false }, { id: 'D2', progress: 0, claimed: false }, { id: 'D3', progress: 0, claimed: false }],
    weekly: [{ id: 'W1', progress: 0, claimed: false }, { id: 'W2', progress: 0, claimed: false }],
    fullStreak: 0, lastFullDate: '', streakAwarded: []
  };
  TODAY = DAY(7);                        // 跨到周六 → 丰饶日
  const s = task.ensure();
  T('跨天重算主题为丰饶日', s.theme === 'easy' && task.themeInfo().label === '丰饶日');
  T('跨天后生效 target=80', D('D1').target === 80);
  T('跨天 daily 已重置', task.dailyBrief().done === 0);
  const t1 = D('D1').target, th1 = task.themeInfo().key;
  T('同日多次读取主题/目标一致（缓存）', D('D1').target === t1 && task.themeInfo().key === th1);
  T('hasClaimable 在轮换下正常工作', typeof task.hasClaimable() === 'boolean');

  console.log('--- 7. 旧存档兼容（v1.9 无 theme）---');
  reset();
  TODAY = DAY(9);
  mem['maze_task_v1'] = {
    date: TODAY, week: task.weekKey(),
    daily: [{ id: 'D1', progress: 50, claimed: false }, { id: 'D2', progress: 1, claimed: false }, { id: 'D3', progress: 0, claimed: false }],
    weekly: [{ id: 'W1', progress: 3, claimed: false }, { id: 'W2', progress: 100, claimed: false }]
  };
  const old = task.ensure();
  T('旧存档补 theme 且合法', ['easy', 'normal', 'hard'].indexOf(old.theme) >= 0);
  T('旧存档补齐全勤字段', old.fullStreak === 0 && Array.isArray(old.streakAwarded));
  T('旧存档原进度不丢', old.daily[0].progress === 50 && old.weekly[0].progress === 3);
  T('旧存档可正常读取状态', !!task.getState().theme && task.dailyBrief().total === 3);

  console.log('--- 8. 任务面板展示今日主题 ---');
  reset();
  task.setDailyThemeOverride('hard');
  let panel = TaskPanel.build(makeSM(), function () {}, true);
  let head = panel.rows.filter(r => r.title.indexOf('【每日任务') >= 0)[0];
  T('试炼日面板标题含主题', head && head.title.indexOf('试炼日') >= 0);
  T('试炼日面板 sub 含主题描述', head && head.sub.indexOf('目标更高') >= 0);
  T('试炼日面板配色为试炼色', head && head.tagColor === task.DAILY_THEMES.hard.color);
  task.setDailyThemeOverride('normal');
  panel = TaskPanel.build(makeSM(), function () {}, true);
  head = panel.rows.filter(r => r.title.indexOf('【每日任务') >= 0)[0];
  T('切换寻常日后面板同步刷新', head && head.title.indexOf('寻常日') >= 0);
  // v1.10 起任务面板新增固定「赛季征程」分区（【第 N 赛季…】），故分区头总数为 3；
  // 本断言意图是主题切换不改变任务分区结构，因此只数任务本身的两个分区头
  T('主题切换不影响任务行数', panel.rows.filter(r => r.title.indexOf('【每日任务') === 0 || r.title.indexOf('【每周任务') === 0).length === 2);

  console.log('\n通过 ' + passed + ' / 失败 ' + failed);
  if (failed > 0) process.exit(1);
})();
