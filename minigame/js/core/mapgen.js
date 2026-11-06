/**
 * 塔防通道图生成器（v1.4 硬删除后独立模块）
 *
 * 背景：塔防的敌人通道图原本复用 core/maze.js 的 generateMaze / bfsPath。
 * 确认不回退、迷宫玩法物理删除后，把塔防真正依赖的最小算法闭包独立到这里，
 * core/maze.js 及其余约 900 行迷宫规则（怪物/道具/机关/传送门/星级 BFS）随之删除。
 *
 * 设计约束：
 * - 纯算法，零 wx 依赖、零 require，可直接在 node 中无头 require 做回归。
 * - 种子化生成：同一 (level, aspect, seed) 恒定，保证塔防地图可复现。
 * - 生成结果必须与删除前的 maze.generateMaze 逐格一致（RNG 调用序列不得改动），
 *   否则 20–28 格点对、塔位、路径长度等既有断言会漂移。
 *
 * 语义：grid 中 1=可走通道（敌人行进 / 墙格可建塔），0=墙。
 * DFS 先生成完美迷宫保证连通，再按 loopFactor 打通部分内墙制造分叉，
 * 让敌人路径不是唯一解，塔位选择才有策略深度。
 */

// 确定性随机：mulberry32
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DX = { U: 0, D: 0, L: -1, R: 1 };
const DY = { U: -1, D: 1, L: 0, R: 0 };

// 难度配置：塔防固定以 level=30 调用，只需要 size 与 loopFactor。
// monsterCount / monsterTier 是迷宫玩法遗留字段，保留原样以确保数值与旧版逐位一致。
function getLevelConfig(level) {
  let size;
  if (level <= 4) size = 8;
  else size = Math.min(9 + Math.floor((level - 5) / 5), level >= 101 ? 26 : 22);

  const loopFactor = Math.min(0.08 + level * 0.006, 0.32);

  let monsterCount = 0;
  let monsterTier = 0;
  if (level >= 31) {
    if (level < 56) {
      monsterCount = level < 36 ? 1 : (level < 46 ? 2 : 3);
      monsterTier = 0;
    } else if (level < 81) {
      monsterCount = level < 68 ? 3 : 4;
      monsterTier = 1;
    } else if (level < 101) {
      monsterCount = level < 91 ? 4 : 5;
      monsterTier = 2;
    } else {
      monsterCount = 6;
      monsterTier = 2;
    }
  }
  return { size: size, loopFactor: loopFactor, monsterCount: monsterCount, monsterTier: monsterTier };
}

// 生成通道栅格（0=墙，1=路）
// aspect：目标区域高/宽比（竖屏约 1.5）。传入后生成矩形栅格使格子保持正方形。
function generateMaze(level, aspect, seed) {
  const cfg = getLevelConfig(level);
  const rng = mulberry32((seed !== undefined ? seed : (level * 2654435761)) >>> 0 || 1);
  const size = cfg.size;
  let cols = size;
  let rows = size;
  if (typeof aspect === 'number' && isFinite(aspect) && aspect > 0.3 && aspect < 3.5) {
    if (aspect >= 1) {
      rows = Math.max(size, Math.min(Math.round(size * aspect), Math.floor(size * 1.8)));
    } else {
      cols = Math.max(size, Math.min(Math.round(size / aspect), Math.floor(size * 1.8)));
    }
  }

  const cells = [];
  for (let r = 0; r < rows; r++) {
    cells[r] = [];
    for (let c = 0; c < cols; c++) {
      cells[r][c] = { N: true, E: true, S: true, W: true, visited: false };
    }
  }

  // DFS 打通主路径（保证全图连通）
  const stack = [[0, 0]];
  cells[0][0].visited = true;
  const go = [
    ['N', 0, -1, 'S'],
    ['S', 0, 1, 'N'],
    ['E', 1, 0, 'W'],
    ['W', -1, 0, 'E']
  ];
  while (stack.length) {
    const top = stack[stack.length - 1];
    const r = top[0];
    const c = top[1];
    const nb = [];
    for (let i = 0; i < go.length; i++) {
      const g = go[i];
      const nr = r + g[2];
      const nc = c + g[1];
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !cells[nr][nc].visited) {
        nb.push([g[0], nr, nc, g[3]]);
      }
    }
    if (nb.length === 0) {
      stack.pop();
      continue;
    }
    const pick = nb[Math.floor(rng() * nb.length)];
    cells[r][c][pick[0]] = false;
    cells[pick[1]][pick[2]][pick[3]] = false;
    cells[pick[1]][pick[2]].visited = true;
    stack.push([pick[1], pick[2]]);
  }

  // 开环：随机打通部分内墙制造分叉
  const loopFactor = cfg.loopFactor;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const adj = [
        ['E', 1, 0, 'W'],
        ['S', 0, 1, 'N']
      ];
      for (let i = 0; i < adj.length; i++) {
        const g = adj[i];
        const nr = r + g[2];
        const nc = c + g[1];
        if (nr < rows && nc < cols) {
          if (cells[r][c][g[0]] && rng() < loopFactor) {
            cells[r][c][g[0]] = false;
            cells[nr][nc][g[3]] = false;
          }
        }
      }
    }
  }

  // 展开为像素栅格（2N+1）
  const W = 2 * cols + 1;
  const H = 2 * rows + 1;
  const grid = [];
  for (let y = 0; y < H; y++) {
    grid[y] = new Array(W).fill(0);
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      grid[2 * r + 1][2 * c + 1] = 1;
      if (!cells[r][c].N) grid[2 * r][2 * c + 1] = 1;
      if (!cells[r][c].S) grid[2 * r + 2][2 * c + 1] = 1;
      if (!cells[r][c].W) grid[2 * r + 1][2 * c] = 1;
      if (!cells[r][c].E) grid[2 * r + 1][2 * c + 2] = 1;
    }
  }

  return {
    grid: grid,
    W: W,
    H: H,
    cols: cols,
    rows: rows,
    start: { x: 1, y: 1 },
    end: { x: W - 2, y: H - 2 }
  };
}

// 返回某像素点所有可走的相邻方向
function getOpenDirs(grid, x, y) {
  const H = grid.length;
  const W = grid[0].length;
  const out = [];
  const dirs = ['U', 'D', 'L', 'R'];
  for (let i = 0; i < dirs.length; i++) {
    const d = dirs[i];
    const nx = x + DX[d];
    const ny = y + DY[d];
    if (nx >= 0 && nx < W && ny >= 0 && ny < H && grid[ny][nx] === 1) {
      out.push(d);
    }
  }
  return out;
}

// BFS 完整路径：返回 [{x,y},...]（不含起点，含终点），不可达返回 null
function bfsPath(grid, from, to) {
  const H = grid.length;
  const W = grid[0].length;
  const parent = {};
  const startKey = from.x + ',' + from.y;
  parent[startKey] = null;
  const q = [[from.x, from.y]];
  let head = 0;
  while (head < q.length) {
    const cur = q[head++];
    const cx = cur[0];
    const cy = cur[1];
    if (cx === to.x && cy === to.y) {
      const path = [];
      let k = cx + ',' + cy;
      while (k && k !== startKey) {
        const p = k.split(',');
        path.unshift({ x: +p[0], y: +p[1] });
        k = parent[k];
      }
      return path;
    }
    const dirs = getOpenDirs(grid, cx, cy);
    for (let i = 0; i < dirs.length; i++) {
      const d = dirs[i];
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      const nk = nx + ',' + ny;
      if (nx >= 0 && nx < W && ny >= 0 && ny < H && grid[ny][nx] === 1 && parent[nk] === undefined) {
        parent[nk] = cx + ',' + cy;
        q.push([nx, ny]);
      }
    }
  }
  return null;
}

module.exports = {
  generateMaze: generateMaze,
  bfsPath: bfsPath,
  getOpenDirs: getOpenDirs,
  getLevelConfig: getLevelConfig
};
