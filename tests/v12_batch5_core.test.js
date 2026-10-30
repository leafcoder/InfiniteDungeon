// v1.2 第五批无头回归：E4 试用 / E6 今日榜 / N6 无尽塔 / N12 节日活动
const path = require('path');
const ROOT = '/home/zhanglei3/WorkBuddy/2026-10-26-14-05-57/MazeGame/minigame/js';

// ---- wx mock：内存存储 ----
const mem = {};
global.wx = {
  getStorageSync: (k) => mem[k],
  setStorageSync: (k, v) => { mem[k] = v; },
  removeStorageSync: (k) => { delete mem[k]; }
};

const storage = require(path.join(ROOT, 'core/storage.js'));
const endless = require(path.join(ROOT, 'core/endless.js'));
const festival = require(path.join(ROOT, 'core/festival.js'));

let pass = 0, fail = 0;
function T(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}
console.log('--- N12 节日活动 ---');
// 区间判定：2026-10-30 应命中万圣节
T('万圣节区间命中（10-30）', festival.getActive(new Date(2026, 9, 30)).id === 'halloween');
T('万圣节起点命中（10-24）', festival.getActive(new Date(2026, 9, 24)).id === 'halloween');
T('万圣节终点命中（11-02）', festival.getActive(new Date(2026, 10, 2)).id === 'halloween');
T('万圣节结束后不命中（11-03）', festival.getActive(new Date(2026, 10, 3)) === null);
T('跨年新春命中（01-20）', festival.getActive(new Date(2026, 0, 20)).id === 'cny');
T('跨年新春末尾命中（02-20）', festival.getActive(new Date(2026, 1, 20)).id === 'cny');
T('空档期（07-15）无活动', festival.getActive(new Date(2026, 6, 15)) === null);
// seed/spec 确定性
T('festSeed 确定性', festival.festSeed('halloween', 0) === festival.festSeed('halloween', 0));
T('不同关种子不同', festival.festSeed('halloween', 0) !== festival.festSeed('halloween', 1));
const spec0 = festival.festSpec(festival.FESTIVALS[0], 0);
T('活动关 1 配置：level/mods/seed', spec0.level === 40 && spec0.mods.length === 1 && spec0.mods[0] === 'fog' && spec0.skin === 'festival');
T('活动关 2 mods 轮换', festival.festSpec(festival.FESTIVALS[0], 1).mods[0] === 'more');
T('festTitles 覆盖全部活动', festival.festTitles().length === festival.FESTIVALS.length);

console.log('--- N12 节日进度（storage） ---');
T('初始进度全空', storage.getFestDone('halloween').every(x => !x));
storage.completeFestLevel('halloween', 0);
T('标记第 1 关', storage.getFestDone('halloween')[0] === true && storage.getFestDone('halloween')[1] === false);
T('未全通不算制霸', !storage.isFestDone('halloween'));
storage.completeFestLevel('halloween', 1);
storage.completeFestLevel('halloween', 2);
T('全通置位 done', storage.isFestDone('halloween'));
T('限定称号列表含已得活动', storage.getFestTitles(festival.festTitles()).some(t => t.id === 'halloween'));
// 成就：completeFestLevel 不发成就（GameScene 负责解锁），这里验证 unlockAch 通路
storage.addDust(1000);
const bal = storage.getDust();
storage.unlockAch('fest_clear');
T('节日成就解锁发奖 10✦', storage.getDust() === bal + 10);

console.log('--- N6 无尽塔 ---');
T('初始未解锁', endless.isUnlocked() === false);
// 模拟通关 120 关
for (let i = 1; i <= 120; i++) storage.completeLevel(i, { time: 10, steps: 10, swipe: 0, stars: 1, gems: 0, gemTotal: 0 });
T('120 关全通后解锁', endless.isUnlocked() === true);
const f1 = endless.floorSpec(1);
T('第 1 层：非 Boss / level 24 / 无词缀', !f1.boss && f1.level === 24 && f1.mods.length === 0);
T('第 1 层区域 = 林间回梯', f1.zone.key === 'forest');
const f5 = endless.floorSpec(5);
T('第 5 层仍是森林区', f5.zone.key === 'forest');
const f6 = endless.floorSpec(6);
T('第 6 层换区（雾谷）', f6.zone.key === 'canyon');
const f61 = endless.floorSpec(61);
T('第 61 层区域轮回（第 6 个区之后回到 forest）', f61.zone.key === 'forest');
const f6m = endless.floorSpec(6);
T('6-14 层 1 词缀', f6m.mods.length === 1);
const f15 = endless.floorSpec(15);
T('15+ 层 2 词缀', f15.mods.length === 2);
const f10 = endless.floorSpec(10);
T('第 10 层 Boss 关 level 85 无词缀', f10.boss && f10.level === 85 && f10.mods.length === 0);
const f30 = endless.floorSpec(30);
T('第 30 层 Boss（10 的倍数）', f30.boss);
const f27 = endless.floorSpec(27);
T('level 封顶 76（第 27 层 22+54=76）', f27.level === 76);
const f40 = endless.floorSpec(40);
T('第 40 层 Boss 关 level 85', f40.boss && f40.level === 85);
T('同层种子恒定（可背版）', f1.seed === endless.floorSpec(1).seed);
T('不同层种子不同', f1.seed !== f2Seed(), { });
function f2Seed() { return endless.floorSpec(2).seed; }
T('不同层种子不同（修正版）', endless.floorSpec(1).seed !== endless.floorSpec(2).seed);
// 词缀确定性
T('层词缀确定性', JSON.stringify(endless.floorSpec(20).mods) === JSON.stringify(endless.floorSpec(20).mods));

console.log('--- N6 最深层数 ---');
T('bestFloor 初始 0', (storage.getStats().bestFloor || 0) === 0);
const st = storage.getStats();
st.bestFloor = 42;
storage.saveStats(st);
T('bestFloor 可存取', storage.getStats().bestFloor === 42);

console.log('--- E4 道具试用 ---');
T('初始无试用', storage.getTrial() === '');
storage.setTrial('dash');
T('标记试用 dash', storage.getTrial() === 'dash');
storage.setTrial('insight');
T('重复标记覆盖（单技能）', storage.getTrial() === 'insight');
storage.setTrial('bogus');
T('非法 key 不写入', storage.getTrial() === 'insight');
storage.clearTrial();
T('清除试用', storage.getTrial() === '');

console.log('--- E6 今日榜数据通路 ---');
const key = storage.dailyKey();
T('dailyKey 格式 YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(key));
T('今日无成绩', !storage.getDaily()[key]);
storage.completeDaily(key, { time: 30, steps: 20, swipe: 1, stars: 2, gems: 25, gemTotal: 30 });
const rec = storage.getDaily()[key];
T('今日成绩可查（本机今日榜）', rec && rec.gems === 25);
T('历史最佳写入 stats', storage.getStats().bestDaily && storage.getStats().bestDaily.gems === 25);

console.log('');
console.log(fail === 0 ? 'ALL PASS: ' + pass : 'FAIL: ' + fail + ' / PASS: ' + pass);
process.exit(fail === 0 ? 0 : 1);
