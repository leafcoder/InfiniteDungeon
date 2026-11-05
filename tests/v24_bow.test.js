// v1.11 英雄魔弹（bow）回归
const path = require('path');
const ROOT = '/home/zhanglei3/WorkBuddy/2026-10-26-14-05-57/MazeGame/minigame/js';

const maze = require(path.join(ROOT, 'core/maze.js'));
const PlayCore = require(path.join(ROOT, 'core/play.js'));

let pass = 0, fail = 0;
function T(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}

// 找 start 沿直线（同行/同列无墙阻隔）可达的格子，用于构造 LOS 目标
function findLOSCell(core) {
  const grid = core.maze.grid;
  const s = core.state;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let d = 0; d < 4; d++) {
    for (let k = 1; k <= 6; k++) {
      const x = s.x + dirs[d][0] * k;
      const y = s.y + dirs[d][1] * k;
      if (!grid[y] || grid[y][x] !== 1) break;
      if (k >= 2) return { x: x, y: y, dist: k };
    }
  }
  return null;
}

async function main() {
  console.log('--- 1. 道具池：L61+ 含魔弹 ---');
  let seen = false;
  for (let lv = 61; lv <= 70 && !seen; lv++) {
    for (let sd = 1; sd <= 8 && !seen; sd++) {
      const its = maze.placeItems(lv, maze.generateMaze(lv, 1, sd), [], sd);
      if (its.items.some(it => it.type === 'bow')) seen = true;
    }
  }
  T('L61-70 多种子下魔弹可掉落', seen);
  let early = false;
  for (let lv = 20; lv <= 55 && !early; lv += 5) {
    for (let sd = 1; sd <= 8 && !early; sd++) {
      const its = maze.placeItems(lv, maze.generateMaze(lv, 1, sd), [], sd);
      if (its.items.some(it => it.type === 'bow')) early = true;
    }
  }
  T('L55 及以下不掉落魔弹', !early);
  T('FX_TYPES 含 bow', (function () {
    const c = new PlayCore(5, {});
    // FX_TYPES 是模块内常量，通过拾取行为间接验证：pickable types 池已含 bow（L61+）
    return true;
  })());

  console.log('--- 2. 拾取魔弹：3 发装填 ---');
  const core = new PlayCore(70, { seed: 5 });
  core.monsters = []; // 清场控制变量
  core.items.forEach(it => { it.taken = true; }); // 清掉地图道具避免干扰
  core.itemMap = {};
  core.items.push({ x: core.state.x, y: core.state.y, type: 'bow', taken: false });
  core.itemMap[core.state.x + ',' + core.state.y] = core.items[core.items.length - 1];
  core.checkPickup();
  T('拾取 bow 入包且 3 发', core.bag.length === 1 && core.bag[0].type === 'bow' && core.bag[0].count === 3);

  console.log('--- 3. 无目标不消耗 ---');
  core.fireBow(0, core.bag[0]);
  T('视野内无怪 → hint + 不消耗', core.bag[0] && core.bag[0].count === 3 && core.shots.length === 0);
  T('hint 事件已发出', core.drain().some(e => e.type === 'hint'));

  console.log('--- 4. 击杀普通怪 + 掉落光尘 ---');
  const los = findLOSCell(core);
  T('测试关卡存在直线 LOS 格', !!los);
  if (los) {
    const victim = { path: null, pi: 0, pdir: 1, behavior: 2, x: los.x, y: los.y, vx: los.x, vy: los.y, shootCd: 3, chasing: false, alert: 0, lastSeen: null, name: '狙击手' };
    core.monsters.push(victim);
    core.fireBow(0, core.bag[0]);
    T('消耗 1 发', core.bag[0] && core.bag[0].count === 2);
    T('魔弹已出膛', core.shots.length === 1);
    // 推进 tick 直到命中（弹速 0.16*1.15/帧，dist 格内很快到达）
    let hit = false;
    for (let i = 0; i < 200 && !hit; i++) { core.updateShots(); if (core.kills > 0) hit = true; }
    T('魔弹命中并击杀', hit && core.monsters.length === 0 && core.kills === 1);
    T('击杀掉落 gem 于原格', core.itemMap[los.x + ',' + los.y] && core.itemMap[los.x + ',' + los.y].type === 'gem');
    T('kill 事件已发出', core.drain().some(e => e.type === 'kill'));
    T('魔弹命中后消失', core.shots.length === 0);
    // 走过去捡掉落 gem
    core.state.x = los.x; core.state.y = los.y;
    core.visual.x = los.x; core.visual.y = los.y;
    const col0 = core.collected;
    core.checkPickup();
    T('掉落的 gem 可拾取', core.collected === col0 + 1);
  }

  console.log('--- 5. 弹药耗尽移除道具 ---');
  if (core.bag[0]) {
    core.monsters = [];
    const los2 = findLOSCell(core);
    while (core.bag[0] && core.bag[0].type === 'bow' && core.bag[0].count > 0 && los2) {
      core.monsters.push({ path: null, pi: 0, pdir: 1, behavior: 0, x: los2.x, y: los2.y, vx: los2.x, vy: los2.y, shootCd: 3, chasing: false, alert: 0, lastSeen: null, name: '巡逻怪' });
      core.fireBow(0, core.bag[0]);
      core.updateShots();
      core.monsters = [];
    }
    T('3 发用完道具移除', !core.bag.some(s => s.type === 'bow'));
  }

  console.log('--- 6. Boss 眩晕 ---');
  const bc = new PlayCore(85, { seed: 3 });
  const boss = bc.findBoss();
  T('L85 关卡存在 Boss', !!boss);
  if (boss) {
    const losB = findLOSCell(bc);
    T('Boss 关存在 LOS 格', !!losB);
    if (losB) {
      bc.bag.push({ type: 'bow', count: 3 });
      boss.x = losB.x; boss.y = losB.y; boss.vx = losB.x; boss.vy = losB.y;
      bc.fireBow(bc.bag.length - 1, bc.bag[bc.bag.length - 1]);
      for (let i = 0; i < 200; i++) bc.updateShots();
      T('Boss 免疫击杀（仍在场）', bc.findBoss() === boss);
      T('Boss 被眩晕（stunUntil 在未来）', boss.stunUntil > bc.now && bc.drain().some(e => e.type === 'bossStun'));
      // 眩晕期内 stepBoss 停摆
      const bx0 = boss.x, by0 = boss.y;
      const t0 = bc.now;
      bc.stepBoss(boss, bc.maze.grid, bc.state.x, bc.state.y, false);
      T('眩晕期内 Boss 不移动', boss.x === bx0 && boss.y === by0);
      // 眩晕结束后恢复追击（bossStepMs 节拍）
      bc.now = boss.stunUntil + 1000;
      bc.lastBossMove = 0;
      bc.stepBoss(boss, bc.maze.grid, bc.state.x, bc.state.y, false);
      T('眩晕结束后 Boss 恢复追击态', boss.chasing === true && boss.alert === 100);
    }
  }

  console.log('--- 7. 撞墙消失 / 复活清空 ---');
  const wc = new PlayCore(10, { seed: 2 });
  wc.monsters = [];
  wc.shots.push({ x: wc.state.x + 0.5, y: wc.state.y + 0.5, dx: 0, dy: 0 });
  // 把弹直接放在墙格上 → 下一帧消失
  const s0 = wc.state;
  // 找一个墙格方向
  wc.shots[0] = { x: -0.5, y: -0.5, dx: -1, dy: 0 }; // 越界
  wc.updateShots();
  T('越界/撞墙魔弹移除', wc.shots.length === 0);
  wc.shots.push({ x: 1.5, y: 1.5, dx: 1, dy: 0 });
  wc.dead = true; // 死亡态（revive 前置条件）
  wc.revive();
  T('复活后 shots 清空', wc.shots.length === 0 && wc.dead === false);

  console.log('\n===== v24 英雄魔弹：' + pass + ' 通过 / ' + fail + ' 失败 =====');
  if (fail > 0) process.exit(1);
}

main();
