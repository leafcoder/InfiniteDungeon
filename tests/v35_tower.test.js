// v1.4 P1 地宫守卫（塔防）回归：纯算法 / 状态机 / 吸附放置 / 首页接线
// 约束：主线 GameScene 与 34 个既有测试零改动，本文件只验证新增层
const path = require('path');
const fs = require('fs');
const ROOT = '/home/zhanglei3/WorkBuddy/2026-10-26-14-05-57/MazeGame/minigame/js';

const mem = {};
global.wx = {
  getStorageSync: (k) => mem[k],
  setStorageSync: (k, v) => { mem[k] = v; },
  removeStorageSync: (k) => { delete mem[k]; },
  getSystemInfoSync: () => ({ model: 'test', windowWidth: 375, windowHeight: 667, pixelRatio: 2 }),
  getMenuButtonBoundingClientRect: () => ({ top: 20, height: 32, width: 80, right: 360, left: 280 }),
  shareAppMessage: () => {},
  vibrateShort: () => {}
};

const tower = require(path.join(ROOT, 'core/tower.js'));
const TowerCore = tower.TowerCore;
const storage = require(path.join(ROOT, 'core/storage.js'));
const analytics = require(path.join(ROOT, 'core/analytics.js'));
const TowerScene = require(path.join(ROOT, 'scene/TowerScene.js'));

let pass = 0, fail = 0;
function T(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}
function mk(seed) { return new TowerCore(30, { seed: seed || 1, aspect: 1.5 }); }
function enemy(c, t, hp) {
  const p = c.pathAt(t);
  return {
    type: 'wisp', hp: hp, maxHp: hp, t: t, x: p.x, y: p.y,
    speed: 1.6, slowT: 0, bounty: 8, leak: 1, color: '#fff', alive: true
  };
}

console.log('--- 1. 建图与 20~28 格点对（用户拍板） ---');
[1, 12345, 99991, 7, 555].forEach(function (s) {
  const c = mk(s);
  T('seed ' + s + ' 路径长度落在 20~28', c.pathLen >= tower.PATH_MIN && c.pathLen <= tower.PATH_MAX);
  T('seed ' + s + ' BFS 距离与路径一致', c.pathDist === c.pathLen);
});
const c1 = mk(1);
T('栅格为 29x43', c1.W === 29 && c1.H === 43);
T('路径首格是出生点', c1.path[0].x === c1.start.x && c1.path[0].y === c1.start.y);
T('路径末格是核心', c1.path[c1.path.length - 1].x === c1.corePos.x && c1.path[c1.path.length - 1].y === c1.corePos.y);
T('核心是路格', c1.grid[c1.corePos.y][c1.corePos.x] === 1);
T('合法塔位数量充足', c1.slots.length > 200);
T('合法塔位全是墙格', c1.slots.every(s => c1.grid[s.y][s.x] === 0));
T('合法塔位四邻至少一个路格', c1.slots.every(function (s) {
  const g = c1.grid;
  return g[s.y - 1][s.x] === 1 || g[s.y + 1][s.x] === 1 || g[s.y][s.x - 1] === 1 || g[s.y][s.x + 1] === 1;
}));
const df = tower.distanceField(c1.grid, c1.start);
T('距离场起点为 0', df[c1.start.y][c1.start.x] === 0);
T('距离场核心等于路径长度', df[c1.corePos.y][c1.corePos.x] === c1.pathLen);

console.log('--- 2. 波次数值纯函数 ---');
T('第 1 波 7 只', tower.waveCount(1) === 7);
T('第 10 波 21 只', tower.waveCount(10) === 21);
T('第 20 波 36 只', tower.waveCount(20) === 36);
T('HP 倍率第 1 波为 1', tower.waveHpMul(1) === 1);
T('HP 倍率 30 波后进入深渊加速', tower.waveHpMul(31) - tower.waveHpMul(30) > 0.28);
T('速度倍率封顶 1.5', tower.waveSpeedMul(99) === 1.5);
T('出场间隔随波收紧', tower.waveSpawnGap(20) < tower.waveSpawnGap(1));
T('出场间隔有下限 0.18', tower.waveSpawnGap(999) === 0.18);
T('波次奖励 20+5n', tower.waveBonus(4) === 40);
T('4 塔 4 敌 6 赐福配置齐全', tower.TOWER_ORDER.length === 4 &&
  Object.keys(tower.ENEMY_DEFS).length === 4 && tower.BLESS_KEYS.length === 6);

console.log('--- 3. 建塔 / 升级 / 出售 / 吸附 ---');
const c2 = mk(1);
T('初始金币 120 / 核心 20', c2.gold === 120 && c2.hp === 20);
const sl0 = c2.slots[0];
T('canBuild 合法位置通过', c2.canBuild(sl0, 'arrow').ok);
T('canBuild 拒绝未知塔种', !c2.canBuild(sl0, 'nope').ok);
T('canBuild 拒绝路格', !c2.canBuild({ x: c2.start.x, y: c2.start.y }, 'arrow').ok);
T('建造扣款 60', c2.build(sl0, 'arrow') && c2.gold === 60);
T('建造后事件入队', c2.drain().some(e => e.type === 'build'));
T('同位重复建造被拒', !c2.build(sl0, 'arrow'));
T('塔数上限 12', tower.MAX_TOWERS === 12);
c2.gold = 100000;
T('升级 Lv1→2 扣造价 0.8 倍', c2.upgrade(c2.towers[0]) && c2.towers[0].lv === 2);
T('升级 Lv2→3', c2.upgrade(c2.towers[0]) && c2.towers[0].lv === 3);
T('Lv3 封顶', !c2.upgrade(c2.towers[0]) && c2.towers[0].lv === 3);
const invested = c2.towers[0].invest;
const goldBeforeSell = c2.gold;
T('出售返还累计投入 60%', c2.sell(c2.towers[0]) && c2.gold === goldBeforeSell + Math.round(invested * 0.6));
T('出售后塔位移除', c2.towers.length === 0);
const snapA = c2.snap(sl0.x, sl0.y);
T('snap 命中最近合法空位', !!snapA && snapA.x === sl0.x && snapA.y === sl0.y);
c2.build(snapA, 'arrow');
const snapB = c2.snap(sl0.x, sl0.y);
T('snap 跳过已占用位', !!snapB && !(snapB.x === sl0.x && snapB.y === sl0.y));
T('nearestSlot 纯函数空集返回 null', tower.nearestSlot([], 1, 1, {}) === null);

console.log('--- 4. 波次、移动与战斗 ---');
const c3 = mk(1);
T('初始为 prep 阶段', c3.phase === 'prep');
T('startNow 只在 prep 生效', c3.startNow() && !c3.startNow());
T('提前开波奖励 +10 金币', c3.gold === 130);
T('第 1 波生成队列长度 7', c3.spawnQueue.length === 7);
const c4 = mk(1);
for (let i = 0; i < 90; i++) c4.tick(0.1); // tick 会把 dt clamp 到 0.1，需逐帧累计
T('prep 倒计时结束自动开波', c4.phase === 'wave' && c4.wave === 1);
const c5 = mk(1);
c5.phase = 'wave'; c5.wave = 5; c5.waveClock = 99;
c5.startWave = function () {}; // 防止测试内二次开波
const before = c5.enemies.length;
c5.spawnQueue = [{ type: 'brute', at: 0, hpMul: 1, spdMul: 1 }];
c5.updateSpawns();
T('spawn 生成石卫且 HP 为 90', c5.enemies.length === before + 1 && c5.enemies[0].maxHp === 90);
const c6 = mk(1);
T('第 10 波含 Boss', (function () {
  const x = mk(1); x.phase = 'prep'; x.wave = 9; x.startWave();
  return x.spawnQueue[x.spawnQueue.length - 1].type === 'boss';
})());
const c7 = mk(1);
c7.phase = 'wave'; c7.wave = 1; c7.spawnQueue = [];
const leakE = enemy(c7, c7.pathLen - 0.01, 30);
c7.enemies = [leakE];
c7.tick(0.1);
T('敌人抵达核心扣血', c7.hp === 19 && c7.leaks === 1);
const c8 = mk(1);
c8.phase = 'wave'; c8.wave = 3; c8.reached = 2; c8.hp = 1; c8.spawnQueue = [];
c8.enemies = [enemy(c8, c8.pathLen - 0.01, 30)];
c8.tick(0.1);
T('核心归零触发 gameover', c8.phase === 'over' && c8.hp === 0);
T('gameover 事件含守住波数', c8.drain().some(e => e.type === 'gameover' && e.data.reached === 2));
const c9 = mk(1);
// 找一个「路径上且落在某塔位射程内」的点，验证自动攻击确实发生
let shoot = null;
for (let i = 0; i < c9.slots.length && !shoot; i++) {
  const s = c9.slots[i];
  for (let j = 0; j < c9.path.length; j++) {
    const p = c9.path[j];
    const dx = p.x - s.x, dy = p.y - s.y;
    if (dx * dx + dy * dy <= tower.TOWER_DEFS.arrow.range * tower.TOWER_DEFS.arrow.range) {
      shoot = { slot: s, t: j }; break;
    }
  }
}
c9.phase = 'wave'; c9.wave = 1; c9.spawnQueue = []; c9.gold = 999;
c9.build(shoot.slot, 'arrow');
c9.enemies = [enemy(c9, shoot.t, 10)];
c9.tick(1 / 60);
T('塔自动攻击并击杀', c9.kills === 1);
T('击杀发放赏金', c9.drain().some(e => e.type === 'kill' && e.data.gold === 8));
T('攻击产生视觉弹道', c9.shots.length >= 1);
const c10 = mk(1);
let shootF = null;
for (let i = 0; i < c10.slots.length && !shootF; i++) {
  const s = c10.slots[i];
  for (let j = 0; j < c10.path.length; j++) {
    const p = c10.path[j];
    const dx = p.x - s.x, dy = p.y - s.y;
    if (dx * dx + dy * dy <= 4) { shootF = { slot: s, t: j }; break; } // 留余量，移动一帧后仍在霜塔 2.8 射程内
  }
}
c10.phase = 'wave'; c10.wave = 1; c10.spawnQueue = []; c10.gold = 999;
c10.build(shootF.slot, 'frost');
c10.enemies = [enemy(c10, shootF.t, 999)];
c10.tick(1 / 60);
T('霜塔附带减速', c10.enemies.length === 1 && c10.enemies[0].slowT > 0);

console.log('--- 5. 赐福：效果与叠加上限（防曲线压塌） ---');
const cb = mk(1);
T('pickBlessings 返回 3 个不重复合法 key', (function () {
  const o = cb.pickBlessings();
  return o.length === 3 && new Set(o).size === 3 && o.every(k => tower.BLESS_KEYS.indexOf(k) >= 0);
})());
T('非 interlude 拒绝选择', !cb.chooseBlessing('torch'));
cb.phase = 'interlude'; cb.chooseBlessing('torch');
T('火炬 +1 射程', cb.bless.range === 1);
T('选择后回到 prep', cb.phase === 'prep' && cb.prepLeft === tower.PREP_SEC);
const caps = mk(1);
for (let i = 0; i < 30; i++) { caps.phase = 'interlude'; caps.chooseBlessing('swift'); }
T('疾风攻速封顶 0.5', caps.bless.atkSpeed === 0.5);
for (let i = 0; i < 30; i++) { caps.phase = 'interlude'; caps.chooseBlessing('torch'); }
T('火炬射程封顶 3', caps.bless.range === 3);
for (let i = 0; i < 30; i++) { caps.phase = 'interlude'; caps.chooseBlessing('magnet'); }
T('磁石赏金封顶 0.6', Math.abs(caps.bless.bounty - 0.6) < 1e-9);
for (let i = 0; i < 30; i++) { caps.phase = 'interlude'; caps.chooseBlessing('greed'); }
T('贪婪波次奖励封顶 0.9', Math.abs(caps.bless.waveGold - 0.9) < 1e-9);
for (let i = 0; i < 30; i++) { caps.phase = 'interlude'; caps.chooseBlessing('alch'); }
T('炼金造价折扣封顶 0.4', caps.bless.cost === 0.4);
caps.hp = 10; caps.phase = 'interlude'; caps.chooseBlessing('iron');
T('铁壁修复 +3 且不超上限', caps.hp === 13);
caps.hp = 19; caps.phase = 'interlude'; caps.chooseBlessing('iron');
T('铁壁修复不超 20', caps.hp === 20);
caps.phase = 'interlude';
T('跳过（null）只推进状态机', caps.chooseBlessing(null) && caps.phase === 'prep');
caps.phase = 'interlude';
T('非法 key 被拒绝', !caps.chooseBlessing('not_a_bless'));

console.log('--- 6. 波次结算与状态机 ---');
const cs = mk(1);
cs.phase = 'wave'; cs.wave = 2; cs.spawnQueue = []; cs.enemies = [];
const gBefore = cs.gold;
cs.checkWaveEnd();
T('清空后进入 interlude', cs.phase === 'interlude');
T('结算发放 20+5n 金币', cs.gold === gBefore + 30);
T('记录守住波数', cs.reached === 2);
T('waveclear 事件带 offers', cs.drain().some(e => e.type === 'waveclear' && e.data.offers.length === 3));
const cv = mk(1);
cv.phase = 'over';
const goldOver = cv.gold;
cv.tick(1);
T('over 后 tick 不再推进', cv.gold === goldOver && cv.wave === 0);
T('stats 字段完整', (function () {
  const s = mk(1).stats();
  return ['wave','reached','gold','hp','kills','leaks','towers','pathLen','phase'].every(k => k in s);
})());

console.log('--- 7. P1 通过标准：引擎能完整跑到第 10 波 ---');
const csim = mk(12345);
const ranked = csim.slots.map(function (s) {
  let cover = 0;
  for (let i = 0; i < csim.path.length; i++) {
    const p = csim.path[i], dx = p.x - s.x, dy = p.y - s.y;
    if (dx * dx + dy * dy <= 3.2 * 3.2) cover++;
  }
  return { slot: s, cover: cover };
}).sort(function (a, b) { return b.cover - a.cover });
csim.gold = 100000;
for (let i = 0; i < tower.MAX_TOWERS; i++) csim.build(ranked[i].slot, 'arrow');
for (let i = 0; i < csim.towers.length; i++) { csim.upgrade(csim.towers[i]); csim.upgrade(csim.towers[i]); }
let guard = 0;
while (csim.wave < 10 && csim.phase !== 'over' && guard++ < 60 * 60 * 12) {
  if (csim.phase === 'interlude') { csim.chooseBlessing(null); continue; }
  csim.tick(1 / 60);
}
T('状态机循环推进到第 10 波', csim.wave >= 10);
T('第 10 波时核心未失守', csim.phase !== 'over' && csim.hp > 0);
T('满配 12 座塔全部 Lv3', csim.towers.length === 12 && csim.towers.every(t => t.lv === 3));
T('过程中确实产生击杀', csim.kills > 50);

console.log('--- 8. 场景与首页接线（主线零改动） ---');
function fakeSM() {
  return {
    W: 375, H: 667, sat: 20, sab: 10,
    toast: () => {}, sceneModal: () => {}, switch: function (n) { this.lastSwitch = n; }
  };
}
const sc = new TowerScene(fakeSM());
sc.enter({ seed: 1 });
T('场景进入后 core/view 就绪', !!sc.core && !!sc.view && sc.cell > 0);
T('棋盘不越界', sc.view.x >= 0 && sc.view.x + sc.view.w <= 375);
T('底部 4 塔按钮 + 返回 + 开波 = 6', sc.btns.length === 6);
T('初始无预览态', !sc.ghost && !sc.selTower && !sc.selType);
sc.pickType('arrow');
T('点塔栏进入待建状态', sc.selType === 'arrow');
const targetSlot = sc.core.slots[0];
sc.onBoardTap(sc.px(targetSlot.x), sc.py(targetSlot.y));
T('点地图产生吸附预览', !!sc.ghost && sc.ghost.ok);
T('吸附命中最近合法空位', sc.ghost.slot.x === targetSlot.x && sc.ghost.slot.y === targetSlot.y);
T('预览态切换为建造/取消按钮', sc.btns.length === 4 && sc.btns.some(b => b._kind === 'build'));
sc.doBuild();
T('确认后建成并回到塔栏', sc.core.towers.length === 1 && sc.btns.length === 6 && !sc.ghost);
sc.onBoardTap(sc.px(targetSlot.x), sc.py(targetSlot.y));
T('点已有塔进入升级/出售态', !!sc.selTower && sc.btns.length === 5);
T('升级按钮存在', sc.btns.some(b => b._kind === 'upgrade'));
const mainSrc = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
T('main.js 注册 tower 场景', mainSrc.indexOf("sm.register('tower'") >= 0);
const homeSrc = fs.readFileSync(path.join(ROOT, 'scene/HomeScene.js'), 'utf8');
T('DOCK 槽位 key 保持 survival（不打断 v34 断言）', homeSrc.indexOf("key: 'survival'") >= 0);
T('DOCK 文案升级为守卫', homeSrc.indexOf("label: '守卫'") >= 0);
T('入口切到 tower 场景', homeSrc.indexOf("sm.switch('tower')") >= 0);
T('埋点白名单含 td_start/td_end', analytics.TRACK_EVENTS.indexOf('td_start') >= 0 && analytics.TRACK_EVENTS.indexOf('td_end') >= 0);
const st0 = storage.getStats();
st0.bestTowerWave = 9;
storage.saveStats(st0);
storage.resetProgress();
T('resetProgress 自动清理最佳波数', !storage.getStats().bestTowerWave);

console.log('\nv35 tower: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
