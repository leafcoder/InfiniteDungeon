// v1.4 硬删除回归：默认塔防 / 波数结算 / 外围系统接线（不再验证可逆回退，见 v37）
// 约束：迷宫玩法层已物理删除，main.js 只注册 home / tower 两个场景
const path = require('path');
const fs = require('fs');
const ROOT = '/home/zhanglei3/WorkBuddy/2026-10-26-14-05-57/MazeGame/minigame/js';

const mem = {};
global.wx = {
  getStorageSync: (k) => mem[k],
  setStorageSync: (k, v) => { mem[k] = v; },
  removeStorageSync: (k) => { delete mem[k]; },
  shareAppMessage: () => {},
  vibrateShort: () => {}
};

const mode = require(path.join(ROOT, 'core/mode.js'));
const storage = require(path.join(ROOT, 'core/storage.js'));
const analytics = require(path.join(ROOT, 'core/analytics.js'));
const task = require(path.join(ROOT, 'core/task.js'));
const season = require(path.join(ROOT, 'core/season.js'));
const HomeScene = require(path.join(ROOT, 'scene/HomeScene.js'));
const TowerScene = require(path.join(ROOT, 'scene/TowerScene.js'));

let pass = 0, fail = 0;
function T(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}
function makeSM() {
  return {
    W: 375, H: 667, sat: 20, sab: 10, sal: 10, sar: 10,
    toasts: [], switched: [],
    toast: function (t) { this.toasts.push(t); },
    switch: function (n, p) { this.switched.push({ name: n, params: p }); },
    sceneModal: () => {}
  };
}
function freshHome() {
  const sm = makeSM();
  const hs = new HomeScene(sm);
  hs.enter();
  return { sm: sm, hs: hs };
}
function src(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

console.log('--- 1. 无回退开关 + 波数口径纯函数 ---');
T('mode.js 不再导出回退开关', typeof mode.setMazeEnabled === 'undefined' && typeof mode.isMazeEnabled === 'undefined' && typeof mode.isTowerDefault === 'undefined');
T('玩法常量仍收敛为单一事实来源', typeof mode.WAVE_RULES === 'object' && Array.isArray(mode.TOWER_DOCK_KEYS));

const R = mode.WAVE_RULES;
T('口径常量集中且封顶 20 波', R.xpBase === 10 && R.xpPerWave === 2 && R.xpWaveCap === 20 && R.recordXp === 30);
T('成就阈值三档', R.achWaves.join(',') === '5,10,20' && R.achIds.join(',') === 'td5,td10,td20');
T('光尘口径 0/1/2/10/21 波', [0, 1, 2, 10, 21].map(mode.dustFor).join(',') === '0,0,3,15,30');
T('赛季 XP 0/5/20/100 波', [0, 5, 20, 100].map(mode.seasonXpFor).join(',') === '10,20,50,50');
T('100 波不突破封顶', mode.seasonXpFor(100) === mode.seasonXpFor(20));
T('成就 0/5/10/20 波', [0, 5, 10, 20].map(function (w) { return mode.achFor(w).length; }).join(',') === '0,1,2,3');
T('可见 DOCK 白名单', mode.TOWER_DOCK_KEYS.join(',') === 'supply,survival,task');

console.log('--- 2. 首页默认塔防（结构保留、迷宫入口已删） ---');
storage.resetProgress();
storage.setTutorialSeen();
const h1 = freshHome();
const hs = h1.hs;
T('首页进入塔防模式', hs.towerMode === true);
T('主 CTA 文案改为开始守卫', hs.goBtn.label === '▶ 开始守卫');
T('主 CTA 副标题走波数口径', hs.goBtn.sub.indexOf('最佳') >= 0 && hs.goBtn.sub.indexOf('局') >= 0);
T('主 CTA 固定守卫金不染轮回紫', hs.goBtn.fill === '#FFC15E');
T('DOCK 仍保留 6 项结构（像素回归依赖）', hs.dock.length === 6);
const vis = hs.dock.filter(function (d) { return !d.hidden; });
T('可见 DOCK 恰 3 项', vis.length === 3);
T('可见项 key 正确', vis.map(function (d) { return d.key; }).join(',') === 'supply,survival,task');
T('可见项触摸宽度 ≥88rpx 规范', vis.every(function (d) { return d.w >= 44 * hs.u; }));
T('可见项横向不重叠', vis.every(function (d, i) { return i === 0 || d.x >= vis[i - 1].x + vis[i - 1].w; }));
T('顶栏热区仍 4 个（不新增按钮）', hs.iconBtns.length === 4 && !!hs.todayBtn);
T('布局字段全部保留（像素回归依赖）', !!hs.gz && !!hs.dotsRect() && typeof hs.festBottom === 'number');
T('Hero 卡数据源换成守卫', src('scene/HomeScene.js').indexOf("name: '地宫守卫'") >= 0);
T('战绩卡已实现', typeof hs.drawTowerBoard === 'function');

// draw() 只按可见白名单绘制：网格 / 圆点 / 活动横幅下线，战绩卡与签到横幅保留
const calls = { grid: 0, dots: 0, fest: 0, mut: 0, chk: 0, board: 0, dock: 0 };
hs.bg.draw = () => {};
hs.drawTopBar = () => {};
hs.drawHero = () => {};
hs.drawFestBanner = () => { calls.fest++; };
hs.drawMutBanner = () => { calls.mut++; };
hs.drawChkBanner = () => { calls.chk++; };
hs.drawDots = () => { calls.dots++; };
hs.drawGrid = () => { calls.grid++; };
hs.drawTowerBoard = () => { calls.board++; };
hs.drawDock = () => { calls.dock++; };
hs.drawToast = () => {};
hs.goBtn.draw = () => {};
hs.modal = null;
hs.draw({ save: () => {}, restore: () => {} });
T('塔防默认不绘制关卡网格', calls.grid === 0);
T('塔防默认不绘制分区圆点', calls.dots === 0);
T('塔防默认不绘制节日/异变横幅', calls.fest === 0 && calls.mut === 0);
T('塔防默认绘制战绩卡与签到横幅', calls.board === 1 && calls.chk === 1);

console.log('--- 3. 迷宫入口已物理删除 ---');
const h3 = freshHome();
storage.setFlag('towerTut');
h3.hs.goBtn.onTap();
T('主 CTA 点击直接进入塔防场景', h3.sm.switched.length === 1 && h3.sm.switched[0].name === 'tower');
const homeSrc = src('scene/HomeScene.js');
T('HomeScene 不存在 _enterGame 闸门', typeof h3.hs._enterGame === 'undefined');
T('HomeScene 无任何 switch(game) 调用', homeSrc.indexOf("this.sm.switch('game'") === -1);
T('首页不再 require 已删模块', !/require\('\.\.\/core\/(maze|play|weekly|festival|mutation|challenge|endless|ngplus|mercy)'\)/.test(homeSrc));

console.log('--- 4. 塔防结算串联外围系统（波数口径） ---');
storage.resetProgress();
analytics.clear();
const smT = makeSM();
const ts = new TowerScene(smT);
ts.enter({ seed: 1 });
ts.core.reached = 12;
ts.core.wave = 13;
ts.core.kills = 40;
ts.core.leaks = 3;
ts.core.towers = [{}, {}, {}];
const dustBefore = storage.getDust();
const xpBefore = season.info().xp;
ts.showResult();
const st = storage.getStats();
T('结算写 bestTowerWave', st.bestTowerWave === 12);
T('结算写累计局数', st.towerRuns === 1);
T('结算写累计波数', st.totalTowerWaves === 12);
T('光尘按波数发放（12 波 = 18 尘，不含成就奖励）', storage.getDust() - dustBefore >= mode.dustFor(12));
T('赛季 XP = 基础+波数+破纪录', season.info().xp - xpBefore === mode.seasonXpFor(12) + R.recordXp);
const tstate = task.getState();
const d2 = tstate.daily.filter(function (x) { return x.id === 'D2'; })[0];
const w1 = tstate.weekly.filter(function (x) { return x.id === 'W1'; })[0];
T('任务 D2 按完成局数推进', d2 && d2.progress >= 1);
T('任务 W1 按最高波数推进', w1 && w1.progress >= 12);
const achMap = {};
storage.achList().forEach(function (a) { achMap[a.id] = a.unlocked; });
T('成就 td5 / td10 解锁', achMap.td5 === true && achMap.td10 === true);
T('成就 td20 未达成不解锁', achMap.td20 === false);
T('结算弹窗存在且含赛季 XP 行', !!ts.modal && ts.modal.lines.some(function (l) { return String(l.t).indexOf('赛季 XP') >= 0; }));
const buf = analytics.loadBuffer();
const endEv = buf.filter(function (x) { return x.e === 'td_end'; })[0];
T('td_end 埋点上报', !!endEv);
T('td_end 携带波数/光尘/XP/破纪录', !!endEv && endEv.p.reached === 12 && endEv.p.dust === mode.dustFor(12) && endEv.p.xp === mode.seasonXpFor(12) + R.recordXp && endEv.p.isBest === true);
T('td_start 开局埋点存在', buf.some(function (x) { return x.e === 'td_start'; }));

console.log('--- 5. 结算幂等 / 迁移兼容 / 重置 ---');
ts.showResult();
T('重复结算不重复计数', storage.getStats().towerRuns === 1);
T('重复结算不重复发赛季 XP', season.info().xp - xpBefore === mode.seasonXpFor(12) + R.recordXp);
storage.resetProgress();
storage.recordTowerRun(30);
const hstat = storage.heroStats();
T('heroStats 暴露塔防进度', hstat.towerRuns === 1 && hstat.totalTowerWaves === 30);
T('累计波数可充当星数解锁源', hstat.stars >= 30);
T('累计局数可充当通关数解锁源', hstat.clears >= 1);
for (let i = 1; i <= 120; i++) storage.completeLevel(i, { time: 9, steps: 9, swipe: 0, stars: 3, gems: 0, gemTotal: 0 });
const oldStat = storage.heroStats();
T('老存档星数不回收（取较大值）', oldStat.stars >= 360);
T('老存档通关数不回收', oldStat.clears >= 120);
storage.resetProgress();
T('resetProgress 清理三项塔防统计', storage.getStats().bestTowerWave === 0 && storage.getStats().towerRuns === 0 && storage.getStats().totalTowerWaves === 0);

console.log('--- 6. 规范约束（硬删除相关断言见 v37） ---');
T('main.js 仍注册 tower 场景', src('main.js').indexOf("sm.register('tower'") >= 0);
T('埋点白名单含 td_wave / td_bless', analytics.TRACK_EVENTS.indexOf('td_wave') >= 0 && analytics.TRACK_EVENTS.indexOf('td_bless') >= 0);
T('任务文案已重定义为波数口径', src('core/task.js').indexOf('本周最高守住波数') >= 0 && src('core/task.js').indexOf('当日完成守卫局数') >= 0);
T('结算修掉 towers 数组拼接 bug', src('scene/TowerScene.js').indexOf("c.towers.length + ' 座'") >= 0);

console.log('\n===== v36 硬删除·默认塔防：' + pass + ' 通过 / ' + fail + ' 失败 =====');
if (fail > 0) process.exit(1);
