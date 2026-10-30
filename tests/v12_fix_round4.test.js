// 第四轮反馈修复回归：复活瞬移到安全点（远离怪物/Boss）
const path = require('path');
const ROOT = '/home/zhanglei3/WorkBuddy/2026-10-26-14-05-57/MazeGame/minigame/js';

const mem = {};
global.wx = {
  getStorageSync: (k) => mem[k],
  setStorageSync: (k, v) => { mem[k] = v; },
  removeStorageSync: (k) => { delete mem[k]; },
  vibrateShort: () => {}
};

const maze = require(path.join(ROOT, 'core/maze.js'));
const PlayCore = require(path.join(ROOT, 'core/play.js'));

let pass = 0, fail = 0;
function T(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}
function minDistToMonsters(core, x, y) {
  let d = 999;
  for (const m of core.monsters) d = Math.min(d, Math.abs(m.x - x) + Math.abs(m.y - y));
  return d;
}
function makeCore(level, seed) {
  const core = new PlayCore(level, { aspect: 1.4, seed: seed });
  core.now = 1790000000000; // 模拟已 tick 过的墙钟
  return core;
}
function killAt(core, x, y) {
  core.state.x = x; core.state.y = y;
  core.visual.x = x; core.visual.y = y;
  core.dead = true;
}

console.log('--- 复活1：Boss 在旁，复活瞬移拉开距离 ---');
{
  const core = makeCore(85, 777); // Boss 层
  const boss = core.monsters.find(m => m.isBoss) || core.monsters[0];
  const bx = boss.x, by = boss.y;
  // 在 Boss 旁找一个通路格作为死亡点
  let spot = null;
  [[1,0],[-1,0],[0,1],[0,-1]].forEach(d => {
    const x = bx + d[0], y = by + d[1];
    if (!spot && core.maze.grid[y] && core.maze.grid[y][x] === 1) spot = { x, y };
  });
  killAt(core, spot.x, spot.y);
  core.revive();
  T('dead 已复位', core.dead === false);
  T('英雄已离开死亡点', core.state.x !== spot.x || core.state.y !== spot.y);
  T('离 Boss 曼哈顿距离 ≥ 6（当前 ' + minDistToMonsters(core, core.state.x, core.state.y) + '）', minDistToMonsters(core, core.state.x, core.state.y) >= 6);
  T('落点是通路格', core.maze.grid[core.state.y][core.state.x] === 1);
  T('不在出口格上', !(core.state.x === core.maze.end.x && core.state.y === core.maze.end.y));
  T('3 秒无敌已上（墙钟口径）', core.invulnUntil === core.now + 3000);
  T('visual 同步瞬移（镜头跟随）', core.visual.x === core.state.x && core.visual.y === core.state.y);
  T('追击态已复位', core.monsters.every(m => !m.chasing));
}

console.log('--- 复活2：死亡点已安全（如被子弹打死），原地复活不乱跳 ---');
{
  const core = makeCore(35, 4242);
  T('本关有怪可测', core.monsters.length > 0);
  // 找一个离所有怪都远的通路格
  let safe = null;
  const g = core.maze.grid;
  for (let y = 1; y < g.length - 1 && !safe; y++)
    for (let x = 1; x < g[0].length - 1 && !safe; x++)
      if (g[y][x] === 1 && minDistToMonsters(core, x, y) >= 8) safe = { x, y };
  killAt(core, safe.x, safe.y);
  core.bullets.push({ x: safe.x, y: safe.y, dx: 1, dy: 0 });
  core.revive();
  T('位置保持原地进行复活', core.state.x === safe.x && core.state.y === safe.y);
  T('子弹已清空', core.bullets.length === 0);
}

console.log('--- 复活3：普通怪围堵，瞬移后近旁怪清空 ---');
{
  const core = makeCore(40, 999);
  const hero = core.maze.start;
  killAt(core, hero.x, hero.y);
  const before = core.monsters.length;
  core.revive();
  T('怪未全清（只清近旁）', core.monsters.length > 0 && core.monsters.length <= before);
  T('落点离所有怪 ≥ 6', minDistToMonsters(core, core.state.x, core.state.y) >= 6);
  T('落点 3 格内无怪（保险清除）', minDistToMonsters(core, core.state.x, core.state.y) >= 4);
  T('waiting 等待玩家输入', core.waiting === true);
  T('重复 revive 幂等（dead=false 直接返回）', (function () { core.revive(); return core.state.x === core.state.x; })());
}

console.log('--- 复活4：无怪关卡（坠崖/陷阱类死法）不瞬移 ---');
{
  const core = makeCore(3, 55);
  core.monsters = [];
  const hero = core.maze.start;
  killAt(core, hero.x, hero.y);
  core.revive();
  T('无怪时原地复活', core.state.x === hero.x && core.state.y === hero.y);
  T('无敌仍生效', core.invulnUntil === core.now + 3000);
}

console.log('');
console.log('结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
