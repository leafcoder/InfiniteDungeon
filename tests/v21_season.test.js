// v1.10 赛季征程（免费通行证）回归
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
const season = require('../minigame/js/core/season.js');

['maze_task_v1', 'maze_coupon_v1', 'maze_shard_v1', 'maze_cosmetics_v1', 'maze_task_track_v1', 'maze_season_v1', 'maze_progress_v1', 'maze_daily_v1', 'maze_stats_v1', 'maze_ach_v1']
  .forEach(k => delete store[k]);

task.setDailyThemeOverride('normal');

// 日期注入：赛季/任务/存档全部跟随 dailyKey
const REAL_DAILY_KEY = storage.dailyKey.bind(storage);
function setDay(key) { storage.dailyKey = function () { return key }; }
const DAY = (base, n) => {
  const p = base.split('-');
  const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n);
  const m = ('0' + (d.getMonth() + 1)).slice(-2);
  const dd = ('0' + d.getDate()).slice(-2);
  return d.getFullYear() + '-' + m + '-' + dd;
};

(async function main() {
  const BASE = '2026-11-05';
  setDay(BASE);

  console.log('--- 1. seasonOf 赛季索引确定性 ---');
  let a = season.seasonOf('2026-11-01');
  T('锚点日 → 第1赛季第1天', a.season === 1 && a.day === 1);
  a = season.seasonOf('2026-11-30');
  T('锚点+29天 → 第1赛季第30天', a.season === 1 && a.day === 30);
  a = season.seasonOf('2026-12-01');
  T('锚点+30天 → 第2赛季第1天', a.season === 2 && a.day === 1);
  a = season.seasonOf('2027-11-01');
  T('锚点+365天 → 第13赛季第6天', a.season === 13 && a.day === 6);
  a = season.seasonOf('2026-10-31');
  T('锚点前 → 按第1赛季第1天处理', a.season === 1 && a.day === 1);
  a = season.seasonOf('bad');
  T('非法日期 → 兜底第1赛季', a.season === 1 && a.day === 1);

  console.log('--- 2. 初始状态 ---');
  let si = season.info();
  T('赛季号与 dailyKey 一致', si.season === 1 && si.day === 5 && si.totalDays === 30);
  T('初始 XP/等级/可领为空', si.xp === 0 && si.level === 0 && si.claimable.length === 0);

  console.log('--- 3. XP 来源钩子 ---');
  storage.completeLevel(1, { stars: 3, time: 60, gems: 5 });
  si = season.info();
  T('通关普通关 +20', si.xp === 20);
  storage.completeDaily(BASE, { stars: 3, time: 120, gems: 10 });
  si = season.info();
  T('每日挑战 +40', si.xp === 60);
  season.onDepth(5);
  si = season.info();
  T('无尽塔新深度 +30 且记录 bestFloor', si.xp === 90 && si.bestFloor === 5);
  season.onDepth(3);
  si = season.info();
  T('未刷新纪录不重复发', si.xp === 90 && si.bestFloor === 5);
  season.onDepth(8);
  si = season.info();
  T('更深纪录再 +30', si.xp === 120 && si.bestFloor === 8);
  task.onGameClubTap();
  si = season.info();
  T('游戏圈打卡 +5', si.xp === 125);
  const c3 = task.claim('D3');
  si = season.info();
  T('领取任务 +15（D3 达标可领）', c3.ok && si.xp === 140);

  console.log('--- 4. 等级与领取 ---');
  T('XP140 → Lv.1 可领第1级', si.level === 1 && si.claimable.length === 1 && si.claimable[0] === 1);
  const r1 = season.claim(1);
  T('第1级=复活券×1 发放', r1.ok && storage.getCoupons().revive >= 1);
  T('重复领取拦截', season.claim(1).ok === false);
  T('未达标等级拦截', season.claim(2).ok === false);
  T('越界等级拦截', season.claim(0).ok === false && season.claim(31).ok === false);

  console.log('--- 5. 里程碑奖励 ---');
  season.addXp(1000 - 140);
  si = season.info();
  T('补到 1000XP → Lv.10', si.level === 10);
  const r10 = season.claim(10);
  const cos = storage.getCosmetics();
  T('第10级头像框·探渊行者实发', r10.ok && cos.frames.indexOf('探渊行者') >= 0);
  season.addXp(1000);
  const r20 = season.claim(20);
  T('第20级=碎片×5', r20.ok && r20.got.some(function (g) { return g.kind === 'shard' && g.n === 5; }));
  season.addXp(500);
  const r25 = season.claim(25);
  T('第25级称号·深渊纪年实发', r25.ok && storage.getCosmetics().titles.indexOf('深渊纪年') >= 0);
  season.addXp(500);
  const r30 = season.claim(30);
  T('第30级=碎片×10', r30.ok && r30.got.some(function (g) { return g.kind === 'shard' && g.n === 10; }));
  si = season.info();
  season.addXp(1000);
  T('满级封顶（超加不溢出等级）', season.info().level === 30);

  console.log('--- 6. 赛季外观元数据 ---');
  const m1 = task.cosmeticMeta('frame', '探渊行者');
  const m2 = task.cosmeticMeta('title', '深渊纪年');
  T('探渊行者有展示元数据', m1.desc.length > 0 && m1.color !== '#FFFFFF');
  T('深渊纪年有展示元数据', m2.desc.length > 0 && m2.color !== '#FFFFFF');

  console.log('--- 7. 跨赛季重置（限时稀缺） ---');
  setDay('2026-12-01'); // 锚点+30 天 → 第 2 赛季
  si = season.info();
  T('新赛季号 + XP/等级清零', si.season === 2 && si.xp === 0 && si.level === 0);
  T('新赛季 claimed 清空（未领奖励失效）', si.claimed.length === 0 && si.claimable.length === 0);
  T('新赛季 bestFloor 清零', si.bestFloor === 0);
  season.onDepth(3);
  si = season.info();
  T('新赛季深度纪录从 0 重新计（重复层数也发）', si.xp === 30 && si.bestFloor === 3);

  console.log('--- 8. 存档兼容 ---');
  setDay(BASE); // 回到第 1 赛季
  store['maze_season_v1'] = { season: 1, xp: 250, claimed: [2] }; // 缺 bestFloor 的旧档
  si = season.info();
  T('旧档缺 bestFloor 自动补齐', si.bestFloor === 0 && si.level === 2 && si.claimed.length === 1);
  store['maze_season_v1'] = 'garbage';
  si = season.info();
  T('损坏存档 → 重建', si.xp === 0 && si.level === 0);

  console.log('--- 9. 任务面板赛季分区 ---');
  const TaskPanel = require('../minigame/js/scene/TaskPanel.js');
  const sm = { W: 375, H: 667, sceneModal: function () {}, toast: function () {} };
  const panel = TaskPanel.build(sm, function () {});
  const titles = panel.rows.map(function (r) { return r.title || ''; });
  T('面板含赛季头行', titles.some(function (t) { return t.indexOf('第 1 赛季') >= 0; }));
  T('面板含等级进度行', titles.some(function (t) { return t.indexOf('赛季 Lv.') >= 0; }));
  const claimRows = panel.rows.filter(function (r) { return r.tag === '领取' && (r.title || '').indexOf('级奖励') >= 0; });
  T('面板无未领等级 → 无领取行', claimRows.length === 0);
  season.addXp(120); // Lv.1 → 第1级可领（旧档已重建为 0）
  const panel2 = TaskPanel.build(sm, function () {});
  const claimRows2 = panel2.rows.filter(function (r) { return r.tag === '领取' && (r.title || '').indexOf('级奖励') >= 0; });
  T('达标后出现第1级领取行', claimRows2.length === 1 && claimRows2[0].title.indexOf('第 1 级') >= 0);

  console.log('--- 10. resetProgress 清理 ---');
  storage.resetProgress();
  T('maze_season_v1 被清理', store['maze_season_v1'] === undefined);
  si = season.info();
  T('重置后回到全新赛季状态', si.xp === 0 && si.level === 0);

  console.log('\n通过 ' + passed + ' / 失败 ' + failed);
  if (failed > 0) process.exit(1);
})();
