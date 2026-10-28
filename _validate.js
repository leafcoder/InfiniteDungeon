// Validation harness for maze core logic (no wx dependency at module scope).
const maze = require('./utils/maze.js');
const theme = require('./utils/theme.js');
const storage = require('./utils/storage.js');

let fail = 0;
const assert = (c, msg) => { if (!c) { console.error('  FAIL:', msg); fail++; } };

// 1) All 120 levels: solvable (BFS reaches end), monsters count per tier config.
let okLevels = 0;
for (let lv = 1; lv <= 120; lv++) {
  const cfg = maze.getLevelConfig(lv);
  const m = maze.generateMaze(lv, cfg);
  const best = maze.bfsSteps(m.grid, m.start, m.end);
  assert(best > 0 && Number.isFinite(best), `L${lv} solvable via BFS (best=${best})`);
  const mons = maze.placeMonsters(lv, m);
  // L75 猎手反转关：仅 1 只携带钥匙的逃跑 Boss
  if (lv === 75) {
    assert(mons.length === 1 && mons[0].flee && mons[0].isBoss, `L75 hunter level: single flee boss`);
    continue;
  }
  // L20/24/28 教学关：1 只纯巡逻教学怪（不追击），软化 L31 怪物突兀感
  const teachMon = (lv === 20 || lv === 24 || lv === 28);
  if (teachMon) {
    assert(mons.length === 1 && mons[0].isTeach && mons[0].behavior === 0 && mons[0].path, `L${lv} teaching monster: 1 pure patrol`);
  } else {
    // L76-79 伪 Boss 预热：常规怪物 + 1 只仅在视线内追击的伪 Boss（非 isBoss）
    const pseudoBoss = (lv >= 76 && lv <= 79);
    if (pseudoBoss) {
      assert(mons.length === cfg.monsterCount + 1, `L${lv} pseudo boss: ${mons.length} === ${cfg.monsterCount}+1`);
      const pb = mons.filter(x => x.isPseudoBoss);
      assert(pb.length === 1 && pb[0].behavior === 1 && !pb[0].isBoss, `L${lv} exactly 1 pseudo boss (behavior 1, not isBoss)`);
    } else {
      assert(mons.length === cfg.monsterCount, `L${lv} monster count ${mons.length} === ${cfg.monsterCount}`);
    }
  }
  for (const mo of mons) {
    if (mo.isBoss) {
      assert(mo.alert === 100, `L${lv} boss alert 100`);
      assert(mo.lastSeen === null, `L${lv} boss lastSeen init null`);
      continue;
    }
    assert(typeof mo.alert === 'number' && mo.alert === 0, `L${lv} monster alert init 0`);
    assert(mo.lastSeen === null, `L${lv} monster lastSeen init null`);
  }
  // ensure start/end open and distinct
  assert(m.grid[m.start.y][m.start.x] === 1, `L${lv} start open`);
  assert(m.grid[m.end.y][m.end.x] === 1, `L${lv} end open`);
  if (best > 0) okLevels++;
}
console.log(`Levels solvable: ${okLevels}/120`);

// 3) 收集物/道具：数量、避让（起终点+怪物路径）、位置可走、确定性
let okItems = 0;
for (let lv = 1; lv <= 120; lv++) {
  const cfg = maze.getLevelConfig(lv);
  const m = maze.generateMaze(lv);
  const mons = maze.placeMonsters(lv, m);
  const its = maze.placeItems(lv, m, mons);
  const blocked = {};
  blocked[m.start.x + ',' + m.start.y] = 1;
  blocked[m.end.x + ',' + m.end.y] = 1;
  for (const mo of mons) for (const c of (mo.path || [])) blocked[c.x + ',' + c.y] = 1;
  assert(its.gemTotal >= 3 && its.gemTotal <= 9, `L${lv} gemTotal ${its.gemTotal} in 3..9`);
  const gems = its.items.filter(it => it.type === 'gem');
  const powers = its.items.filter(it => it.type !== 'gem' && it.type !== 'key');
  assert(gems.length === its.gemTotal, `L${lv} gem items == gemTotal`);
  const expectP = lv < 6 ? 0 : (lv < 25 ? 1 : 2);
  assert(powers.length === expectP, `L${lv} powerups ${powers.length} == ${expectP}`);
  if (lv < 16) assert(its.key === null, `L${lv} no key before L16`);
  if (lv === 20 || lv === 24 || lv === 28) assert(its.key !== null, `L${lv} teaching key forced`);
  if (its.key) {
    const kk = its.key.x + ',' + its.key.y;
    assert(!blocked[kk], `L${lv} key ${kk} not on start/end/monster path`);
    assert(m.grid[its.key.y][its.key.x] === 1, `L${lv} key ${kk} on open cell`);
    assert(its.items.some(it => it.type === 'key' && it.x === its.key.x && it.y === its.key.y), `L${lv} key item present`);
  }
  const seen = {};
  for (const it of its.items) {
    const k = it.x + ',' + it.y;
    assert(!blocked[k], `L${lv} item ${k} not on start/end/monster path`);
    assert(m.grid[it.y][it.x] === 1, `L${lv} item ${k} on open cell`);
    assert(!seen[k], `L${lv} item ${k} unique`);
    seen[k] = 1;
  }
  // 确定性：再放一次应完全一致
  const again = maze.placeItems(lv, m, mons);
  assert(JSON.stringify(again) === JSON.stringify(its), `L${lv} placeItems deterministic`);
  if (its.gemTotal >= 3 && gems.length === its.gemTotal && powers.length === expectP) okItems++;
}
console.log(`Levels with valid items: ${okItems}/120`);

// 3.5) P7 传送门：成对合法、避开关键点、BFS 感知传送、确定性
let portalLv = 0;
for (let lv = 1; lv <= 79; lv++) {
  const m = maze.generateMaze(lv);
  const mons = maze.placeMonsters(lv, m);
  const ps = maze.placePortals(lv, m, mons);
  if (lv < 26) {
    const forcePortal = (lv === 18 || lv === 22 || lv === 26);
    if (forcePortal) {
      assert(ps && ps.length === 2, `L${lv} teaching portal forced pair`);
    } else {
      assert(ps === null, `L${lv} no portals before L26`);
      continue;
    }
  }
  if (!ps) continue;
  portalLv++;
  assert(ps.length === 2, `L${lv} portals pair`);
  const pa = ps[0], pb = ps[1];
  assert(!(pa.x === pb.x && pa.y === pb.y), `L${lv} portals distinct`);
  const dh = Math.abs(pa.x - pb.x) + Math.abs(pa.y - pb.y);
  assert(dh >= 8, `L${lv} portal pair distance ${dh} >= 8`);
  for (const p of ps) {
    assert(m.grid[p.y][p.x] === 1, `L${lv} portal ${p.x},${p.y} on open cell`);
    assert(!(p.x === m.start.x && p.y === m.start.y), `L${lv} portal not on start`);
    assert(!(p.x === m.end.x && p.y === m.end.y), `L${lv} portal not on end`);
    for (const mo of mons) {
      for (const c of (mo.path || [])) {
        assert(!(c.x === p.x && c.y === p.y), `L${lv} portal not on monster path`);
      }
    }
  }
  // BFS 感知传送：距离不变长；两门互相可达（经传送边）
  const dPlain = maze.bfsSteps(m.grid, m.start, m.end);
  const dPort = maze.bfsSteps(m.grid, m.start, m.end, ps);
  assert(dPort > 0 && dPort <= dPlain, `L${lv} portal BFS ${dPort} <= plain ${dPlain}`);
  const dAB = maze.bfsSteps(m.grid, pa, pb, ps);
  assert(dAB > 0, `L${lv} portals mutually reachable (d=${dAB})`);
  // 道具不与传送门重叠
  const its = maze.placeItems(lv, m, mons);
  assert(its.items.every(it => !ps.some(p => p.x === it.x && p.y === it.y)), `L${lv} no item on portal`);
  // 确定性
  const ps2 = maze.placePortals(lv, m, mons);
  assert(JSON.stringify(ps2) === JSON.stringify(ps), `L${lv} placePortals deterministic`);
}
// Boss 关不出现传送门
for (const lv of [80, 90, 100]) {
  const m = maze.generateMaze(lv);
  const mons = maze.placeMonsters(lv, m);
  assert(maze.placePortals(lv, m, mons) === null, `L${lv} no portals on boss levels`);
}
console.log(`Portals validated (${portalLv} of 54 eligible levels spawned pairs)`);

// 3.6) P7 诱饵：L31+ 才可能掉落，强化时长可用
{
  let dropped = false;
  for (let lv = 1; lv <= 60; lv++) {
    const m = maze.generateMaze(lv);
    const mons = maze.placeMonsters(lv, m);
    const its = maze.placeItems(lv, m, mons);
    const has = its.items.some(it => it.type === 'decoy');
    if (lv < 31) assert(!has, `L${lv} no decoy before L31`);
    else dropped = dropped || has;
  }
  assert(dropped, 'decoy drops somewhere in L31-60');
  assert(storage.fxDuration('decoy') > 0, 'fxDuration(decoy) > 0');
}
console.log('Decoy item pool validated');

// 4) 皮肤系统：3 套皮肤，各 5 分区色 + var 集
assert(theme.ORDER.length === 4, '4 themes order');
for (const name of theme.ORDER) {
  const t = theme.getTheme(name);
  assert(t && t.zones.length === 6, `${name} has 6 zone colors`);
  const style = theme.themeStyle(name);
  assert(typeof style === 'string' && style.includes('--'), `${name} style string`);
  assert(typeof theme.nextTheme(name) === 'string', `${name} nextTheme`);
}
console.log('Themes:', theme.ORDER.join(', '));

// 3) grid dimensions grow with difficulty (size 8 early, up to 22).
const c1 = maze.getLevelConfig(1), c100 = maze.getLevelConfig(100);
const s1 = maze.generateMaze(1, c1).grid.length;
const s50 = maze.generateMaze(50, maze.getLevelConfig(50)).grid.length;
const s100 = maze.generateMaze(100, c100).grid.length;
console.log(`Grid sizes: L1=${s1} L50=${s50} L100=${s100} (grid=2*size+1)`);
assert(s1 === 2 * c1.size + 1, 'L1 grid = 2*size+1');
assert(s100 === 2 * c100.size + 1, 'L100 grid = 2*size+1');

// 5) P2 Boss 限时追逐关：L80-100 恰好 1 只 Boss，Boss 无巡逻路径且远离起点
//    虚空回响 L101-120 不含 Boss（改为 6 只射击怪 + 镜像迷宫）
for (const lv of [79, 80, 85, 95, 100, 105, 110, 115, 120]) {
  const cfg = maze.getLevelConfig(lv);
  const m = maze.generateMaze(lv);
  const mons = maze.placeMonsters(lv, m);
  const bosses = mons.filter(x => x.isBoss);
  if (lv >= 80 && lv <= 100) {
    assert(bosses.length === 1, `L${lv} exactly 1 boss`);
    assert(mons.length === cfg.monsterCount, `L${lv} total monsters ${mons.length} === cfg ${cfg.monsterCount}`);
    const b = bosses[0];
    assert(b.behavior === 3, `L${lv} boss behavior 3`);
    assert(!b.path, `L${lv} boss has no patrol path`);
    assert(m.grid[b.y][b.x] === 1, `L${lv} boss on open cell`);
    assert(!(b.x === m.start.x && b.y === m.start.y), `L${lv} boss not on start`);
    assert(!(b.x === m.end.x && b.y === m.end.y), `L${lv} boss not on end`);
    const dd = (b.x - m.start.x) * (b.x - m.start.x) + (b.y - m.start.y) * (b.y - m.start.y);
    assert(dd >= 49, `L${lv} boss far from start (d2=${dd})`);
    // Boss 不能被道具占位
    const its = maze.placeItems(lv, m, mons);
    assert(its.items.every(it => !(it.x === b.x && it.y === b.y)), `L${lv} no item on boss cell`);
  } else if (lv >= 101) {
    assert(bosses.length === 0, `L${lv} no boss in void zone (expected mirror+monsters)`);
  } else {
    assert(bosses.length === 0, `L${lv} no boss before L80`);
  }
}
console.log('Boss levels validated (L80-100 has exactly 1 chaser, void has none)');

// 9) 虚空回响（L101-120）：镜像迷宫可达率 100% + 数量/位置合法（无 Boss）
let voidOk = 0;
for (let lv = 101; lv <= 120; lv++) {
  const cfg = maze.getLevelConfig(lv);
  const m = maze.mirrorMaze(maze.generateMaze(lv));
  assert(m.mirrored === true, `L${lv} mirrorMaze applied`);
  const best = maze.bfsSteps(m.grid, m.start, m.end);
  assert(best > 0 && Number.isFinite(best), `L${lv} mirrored maze solvable (best=${best})`);
  // 镜像后重新放置怪物/道具，断言全部落在可走格
  const mons = maze.placeMonsters(lv, m);
  assert(mons.length === cfg.monsterCount, `L${lv} void monster count ${mons.length} === ${cfg.monsterCount}`);
  const bosses = mons.filter(x => x.isBoss);
  assert(bosses.length === 0, `L${lv} void has no boss`);
  for (const mo of mons) assert(m.grid[mo.y][mo.x] === 1, `L${lv} monster on open cell`);
  const its = maze.placeItems(lv, m, mons);
  for (const it of its.items) assert(m.grid[it.y][it.x] === 1, `L${lv} item on open cell`);
  if (best > 0 && bosses.length === 0) voidOk++;
}
console.log(`Void (mirror) levels solvable: ${voidOk}/20`);

// 6) 种子确定性（每日挑战）：同种子同布局，异种子异布局
const SEED = 123456789;
const ma = maze.generateMaze(45, 1.5, SEED);
const mb = maze.generateMaze(45, 1.5, SEED);
assert(JSON.stringify(ma.grid) === JSON.stringify(mb.grid), 'seeded maze deterministic');
const mc = maze.generateMaze(45, 1.5, 987654321);
assert(JSON.stringify(ma.grid) !== JSON.stringify(mc.grid), 'different seed -> different maze');
const ita = maze.placeItems(45, ma, maze.placeMonsters(45, ma, SEED), SEED);
const itb = maze.placeItems(45, mb, maze.placeMonsters(45, mb, SEED), SEED);
assert(JSON.stringify(ita) === JSON.stringify(itb), 'seeded monsters+items deterministic');
console.log('Seed determinism validated');

// 7) bfsStepToward：必须沿最短路走一步（距离严格 -1）
{
  const m = maze.generateMaze(20);
  const grid = m.grid;
  const s = { x: m.start.x, y: m.start.y };
  const e = { x: m.end.x, y: m.end.y };
  const st = maze.bfsStepToward(grid, s, e);
  assert(st !== null, 'bfsStepToward returns a step');
  assert(Math.abs(st.x) + Math.abs(st.y) === 1, 'bfsStepToward returns unit step');
  const d0 = maze.bfsSteps(grid, s, e);
  const d1 = maze.bfsSteps(grid, { x: s.x + st.x, y: s.y + st.y }, e);
  assert(d1 === d0 - 1, `bfsStepToward shortens path (${d0} -> ${d1})`);
  assert(maze.bfsStepToward(grid, s, s) === null, 'bfsStepToward null at same cell');
  // 走完整条路径可达终点
  let cur = { x: s.x, y: s.y };
  let guard = 0;
  while (!(cur.x === e.x && cur.y === e.y) && guard++ < 5000) {
    const stp = maze.bfsStepToward(grid, cur, e);
    if (!stp) break;
    cur = { x: cur.x + stp.x, y: cur.y + stp.y };
    assert(grid[cur.y][cur.x] === 1, 'chase path stays on walkable cells');
  }
  assert(cur.x === e.x && cur.y === e.y, 'chase path reaches target');
}
console.log('bfsStepToward validated');

// 8) P3 成就 / 统计 / 每日挑战（storage 无 wx 时安全降级）
{
  const list = storage.achList();
  assert(list.length >= 8, `achievements defined (${list.length})`);
  assert(list.every(x => x.id && x.name && x.desc), 'achievement fields complete');
  assert(new Set(list.map(x => x.id)).size === list.length, 'achievement ids unique');
  const st = storage.getStats();
  assert(typeof st.clears === 'number' && typeof st.dailyStreak === 'number', 'stats defaults');
  const ach = storage.recordWin(1, { stars: 3, timeOK: true, perfect: true, usedItem: false, boss: false, gems: 5, dust: 5 });
  assert(Array.isArray(ach) && ach.length > 0, 'recordWin returns newly unlocked list');
  assert(ach.some(x => x.id === 'first'), 'recordWin unlocks "first" for level 1');
  const ach2 = storage.recordWin(80, { stars: 3, timeOK: true, perfect: false, usedItem: false, boss: true, gems: 3, dust: 3 });
  assert(ach2.some(x => x.id === 'boss'), 'recordWin unlocks "boss" for boss level');
  assert(ach2.some(x => x.id === 'pacifist'), 'recordWin unlocks "pacifist" when no item used');
  const d = storage.completeDaily(storage.dailyKey(), { time: 10, steps: 20, swipe: 2, stars: 3, gems: 3, gemTotal: 3 });
  assert(typeof d.streak === 'number' && d.streak >= 1, 'daily streak >= 1');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(storage.dailyKey()), 'dailyKey format YYYY-MM-DD');
  assert(storage.dailySeed() === storage.dailySeed(), 'dailySeed stable within a day');
  assert(Number.isFinite(storage.dailySeed()), 'dailySeed is a finite number');
}
console.log('Achievements / stats / daily validated');

if (fail === 0) console.log('\nALL CHECKS PASSED');
else { console.error(`\n${fail} CHECK(S) FAILED`); process.exit(1); }
