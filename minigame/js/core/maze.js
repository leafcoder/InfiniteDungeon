/**
 * 迷宫生成与行走核心算法
 * - 种子化生成：同一关卡恒定（可复现、可重玩）
 * - DFS 生成完美迷宫（保证连通可解），再按关卡比例"开环"制造分叉
 * - 行走规则（路口等待）：拐角自动转弯；分叉路口停下等待玩家滑动选择方向
 *   （滑动可预输入缓冲，不会丢）；死路同样停下。
 * - 环路访问记忆：防止在闭环里无限自动绕圈
 * - 难度曲线：前 4 关为入门小迷宫，之后尺寸与分叉密度快速递增
 * - 怪物系统：31 关起出现巡逻怪物；56 关起具备直线视线追击；
 *   81 关起在视线内发射子弹。怪物沿直线走廊往返巡逻。
 * - 怪物警戒值：alert 0~100，看到玩家上升、被甩开后缓慢衰减；
 *   满警戒时记忆"最后位置"前往搜索，并提升移动速度。
 * - bfsSteps：返回起点到终点的理论最短步数（用于星级评分）。
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
const OPP = { U: 'D', D: 'U', L: 'R', R: 'L' };

// 根据关卡返回难度配置
function getLevelConfig(level) {
  // 迷宫边长（格子数）：前 4 关入门尺寸 8，之后快速递增，L101+ 上限放大到 26
  let size;
  if (level <= 4) size = 8;
  else size = Math.min(9 + Math.floor((level - 5) / 5), level >= 101 ? 26 : 22);

  // 开环（分叉）密度：随关卡提升，越往后可走岔路越多
  const loopFactor = Math.min(0.08 + level * 0.006, 0.32);

  // 怪物配置：按难度分三档（v2 提量：L36 起整体 +1，峰值 5）
  let monsterCount = 0;
  let monsterTier = 0; // 0=巡逻 1=巡逻+追击 2=巡逻+追击+射击
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
      // 虚空回响（L101-120）：更大的镜像迷宫 + 6 只射击档怪物（无 Boss）
      monsterCount = 6;
      monsterTier = 2;
    }
  }
  return { size: size, loopFactor: loopFactor, monsterCount: monsterCount, monsterTier: monsterTier };
}

// 生成迷宫，返回像素栅格（0=墙，1=路）
// aspect：目标区域高/宽比（如手机竖屏约 1.5）。传入后生成矩形迷宫（行数相应增加），
// 使格子保持正方形的同时铺满屏幕；不传或非法值则生成正方形迷宫（默认 1）。
function generateMaze(level, aspect, seed) {
  const cfg = getLevelConfig(level);
  const rng = mulberry32((seed !== undefined ? seed : (level * 2654435761)) >>> 0 || 1);
  const size = cfg.size;
  let cols = size;
  let rows = size;
  if (typeof aspect === 'number' && isFinite(aspect) && aspect > 0.3 && aspect < 3.5) {
    // 长边最多放大到 1.8 倍，避免行/列数过大导致后期难度失衡
    if (aspect >= 1) {
      rows = Math.max(size, Math.min(Math.round(size * aspect), Math.floor(size * 1.8)));
    } else {
      cols = Math.max(size, Math.min(Math.round(size / aspect), Math.floor(size * 1.8)));
    }
  }

  // 单元墙状态
  const cells = [];
  for (let r = 0; r < rows; r++) {
    cells[r] = [];
    for (let c = 0; c < cols; c++) {
      cells[r][c] = { N: true, E: true, S: true, W: true, visited: false };
    }
  }

  // DFS 打通主路径
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

  // 开环：随机打通部分内墙，制造分叉（环路），随关卡提升密度
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

// 镜像迷宫（虚空回响 L101+）：把左半结构反射到右半，得到左右对称迷宫。
// 反射后做 BFS 可达性校验；若不可达则退化为 OR 对称（必然可达），再不可达则回退原图。
function mirrorMaze(m) {
  const grid = m.grid;
  const W = m.W, H = m.H;
  const cx = (W - 1) >> 1; // 中心列索引
  // 1) 反射左半到右半（右半 = 左半的镜像）
  const g1 = [];
  for (let y = 0; y < H; y++) g1.push(grid[y].slice());
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < cx; x++) g1[y][W - 1 - x] = grid[y][x];
  }
  if (bfsDist(g1, m.start, m.end) !== -1) {
    return Object.assign({}, m, { grid: g1, mirrored: true, mirrorKind: 'reflect' });
  }
  // 2) 退化：OR 对称（去除成对墙，必然可达）
  const g2 = [];
  for (let y = 0; y < H; y++) {
    const row = grid[y].slice();
    for (let x = 0; x <= cx; x++) {
      const v = grid[y][x] | grid[y][W - 1 - x];
      row[x] = v;
      row[W - 1 - x] = v;
    }
    g2.push(row);
  }
  if (bfsDist(g2, m.start, m.end) !== -1) {
    return Object.assign({}, m, { grid: g2, mirrored: true, mirrorKind: 'or' });
  }
  return m; // 极端兜底：保留原图
}

// 返回某像素点所有可走的相邻方向
// onewayMap（可选）：单向门映射 { "x,y": dir }——站在此格只能沿 dir 离开（玩家专属规则）
function getOpenDirs(grid, x, y, onewayMap) {
  const H = grid.length;
  const W = grid[0].length;
  const od = onewayMap ? onewayMap[x + ',' + y] : null;
  if (od) {
    // 单向滑梯格：仅指定方向可走（该方向需为通路）
    const nx = x + DX[od];
    const ny = y + DY[od];
    return (nx >= 0 && nx < W && ny >= 0 && ny < H && grid[ny][nx] === 1) ? [od] : [];
  }
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

function isEnd(grid, x, y) {
  return x === grid[0].length - 2 && y === grid.length - 2;
}

// BFS 最短步数（用于星级评分的理论最优）
// portals（可选）：传送门对 [{x,y},{x,y}]，作为图上的一条边参与寻路
// onewayMap（可选）：单向门映射（BFS 与玩家规则一致，保证星级公平）
function bfsDist(grid, a, b, portals, onewayMap) {
  const H = grid.length;
  const W = grid[0].length;
  let jump = null;
  if (portals && portals.length === 2) {
    jump = {};
    jump[portals[0].x + ',' + portals[0].y] = portals[1];
    jump[portals[1].x + ',' + portals[1].y] = portals[0];
  }
  const dist = {};
  const q = [[a.x, a.y]];
  dist[a.x + ',' + a.y] = 0;
  let head = 0;
  while (head < q.length) {
    const cur = q[head++];
    const cx = cur[0];
    const cy = cur[1];
    if (cx === b.x && cy === b.y) return dist[cx + ',' + cy];
    const dirs = getOpenDirs(grid, cx, cy, onewayMap);
    for (let i = 0; i < dirs.length; i++) {
      const d = dirs[i];
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      if (nx >= 0 && nx < W && ny >= 0 && ny < H && grid[ny][nx] === 1 && dist[nx + ',' + ny] === undefined) {
        dist[nx + ',' + ny] = dist[cx + ',' + cy] + 1;
        q.push([nx, ny]);
      }
    }
    // 传送门边：踩上门 A 即等于走到门 B（步数 +1）
    if (jump) {
      const tp = jump[cx + ',' + cy];
      if (tp && dist[tp.x + ',' + tp.y] === undefined) {
        dist[tp.x + ',' + tp.y] = dist[cx + ',' + cy] + 1;
        q.push([tp.x, tp.y]);
      }
    }
  }
  return -1;
}
function bfsSteps(grid, start, end, portals, onewayMap) {
  return bfsDist(grid, start, end, portals, onewayMap);
}
// 含钥匙的最优步数：起点 → 钥匙 → 终点（portals / onewayMap 可选）
function bfsStepsKey(grid, start, key, end, portals, onewayMap) {
  const a = bfsDist(grid, start, key, portals, onewayMap);
  if (a < 0) return -1;
  const b = bfsDist(grid, key, end, portals, onewayMap);
  if (b < 0) return -1;
  return a + b;
}

// BFS 完整路径（Boss 冲刺技能用）：返回 [{x,y},...]（不含起点，含终点），超长或不可达返回 null
function bfsPath(grid, from, to, maxLen) {
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
      // 回溯路径
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

/**
 * 推进一步。直接修改 state。
 * state: { x, y, dir, cameFrom, visited, atFork }
 * 返回: 'moving'（继续自动走） | 'wait'（停下等待用户转向） | 'won'（到达终点）
 * 行走规则（路口等待）：走进分叉路口格后停住（state.atFork 标记），
 * 玩家滑动选择方向后从路口出发；滑动可预输入缓冲，不会丢；
 * 拐角自动转弯；死路停下。玩家显式选向后不会被再次拦截。
 */
function step(state, grid, onewayMap) {
  if (state.dir === null) return 'wait';

  const d = state.dir;
  const fx = state.x + DX[d];
  const fy = state.y + DY[d];
  const H = grid.length;
  const W = grid[0].length;
  // 单向滑梯格：只有沿指定方向才可离开
  const od = onewayMap ? onewayMap[state.x + ',' + state.y] : null;
  const fwdOpen = od
    ? (d === od && fx >= 0 && fx < W && fy >= 0 && fy < H && grid[fy][fx] === 1)
    : (fx >= 0 && fx < W && fy >= 0 && fy < H && grid[fy][fx] === 1);

  if (!fwdOpen) {
    // 前方是墙（或单向格限制方向）：需要转弯或停下
    const opts = getOpenDirs(grid, state.x, state.y, onewayMap).filter(function (o) {
      return o !== state.cameFrom;
    });
    if (opts.length === 1) {
      // 仅一个出口：拐角，自动转弯
      const nd = opts[0];
      const tx = state.x + DX[nd];
      const ty = state.y + DY[nd];
      if (state.visited && state.visited[tx + ',' + ty]) return 'wait'; // 环路保护
      state.dir = nd;
      state.cameFrom = OPP[nd];
      state.x = tx;
      state.y = ty;
      state.visited[state.x + ',' + state.y] = true;
      if (isEnd(grid, state.x, state.y)) return 'won';
      return forkCheck(state, grid, onewayMap);
    }
    // 死路：等待用户转向
    return 'wait';
  }

  // 正站在路口等待：保持等待，直到玩家显式选向（inputDir 会清除 atFork）
  if (state.atFork) return 'wait';

  // 防环路
  if (state.visited && state.visited[fx + ',' + fy]) return 'wait';

  state.cameFrom = OPP[d];
  state.x = fx;
  state.y = fy;
  state.visited[state.x + ',' + state.y] = true;
  if (isEnd(grid, state.x, state.y)) return 'won';
  return forkCheck(state, grid, onewayMap);
}

// 到达新格后的分叉检测：除来路外还有 ≥2 个出口 → 停在路口等待选择
function forkCheck(state, grid, onewayMap) {
  const side = getOpenDirs(grid, state.x, state.y, onewayMap).filter(function (o) {
    return o !== state.cameFrom;
  });
  if (side.length > 1) {
    state.atFork = true;
    return 'wait';
  }
  return 'moving';
}

/**
 * 为关卡放置怪物（仅当 monsterCount>0）。
 * 怪物沿一条直线走廊（水平或垂直、长度>=4 且远离起点/终点）往返巡逻。
 * 行为分档由关卡决定：0 巡逻 / 1 巡逻+直线视线追击 / 2 巡逻+追击+射击。
 * alert：警戒值 0~100；lastSeen：最后看到玩家的格子（满警戒时前往搜索）。
 */
function placeMonsters(level, maze, seed) {
  const cfg = getLevelConfig(level);
  // 教学关（L20/24/28）：即便未到常规怪物档，也放 1 只纯巡逻教学怪
  const teachMon = (level === 20 || level === 24 || level === 28);
  if (cfg.monsterCount <= 0 && !teachMon) return [];
  const rng = mulberry32((seed !== undefined ? seed : ((level * 911) + 12345)) >>> 0 || 1);
  const grid = maze.grid;
  const W = maze.W;
  const H = maze.H;
  const sx = maze.start.x;
  const sy = maze.start.y;
  const ex = maze.end.x;
  const ey = maze.end.y;
  const tooClose = function (cx, cy) {
    const d = (cx - sx) * (cx - sx) + (cy - sy) * (cy - sy);
    return d < 16 || (cx === ex && cy === ey);
  };

  const runs = [];
  const addRun = function (cells) {
    if (cells.length < 4) return;
    for (let i = 0; i < cells.length; i++) {
      if (tooClose(cells[i].x, cells[i].y)) return;
    }
    runs.push(cells);
  };

  // 水平走廊
  for (let y = 1; y < H - 1; y++) {
    let x = 1;
    while (x < W - 1) {
      if (grid[y][x] === 1) {
        let x2 = x;
        while (x2 + 1 < W - 1 && grid[y][x2 + 1] === 1) x2++;
        const len = x2 - x + 1;
        if (len >= 4) {
          const cells = [];
          for (let i = x; i <= x2; i++) cells.push({ x: i, y: y });
          addRun(cells);
        }
        x = x2 + 1;
      } else {
        x++;
      }
    }
  }
  // 垂直走廊
  for (let x = 1; x < W - 1; x++) {
    let y = 1;
    while (y < H - 1) {
      if (grid[y][x] === 1) {
        let y2 = y;
        while (y2 + 1 < H - 1 && grid[y2 + 1][x] === 1) y2++;
        const len = y2 - y + 1;
        if (len >= 4) {
          const cells = [];
          for (let i = y; i <= y2; i++) cells.push({ x: x, y: i });
          addRun(cells);
        }
        y = y2 + 1;
      } else {
        y++;
      }
    }
  }

  // 洗牌
  for (let i = runs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = runs[i];
    runs[i] = runs[j];
    runs[j] = t;
  }

  // Boss 限时追逐关（L80+）：把常规怪物减 1，换成一只会主动 BFS 追击的巨型 Boss（无巡逻路径）
  const patrolCount = (level >= 80 && level <= 100) ? Math.max(0, cfg.monsterCount - 1) : cfg.monsterCount;
  const chosen = runs.slice(0, patrolCount);
  const patrol = chosen.map(function (cells, idx) {
    const m = {
      path: cells,
      pi: 0,
      pdir: 1,
      behavior: cfg.monsterTier,
      x: cells[0].x,
      y: cells[0].y,
      vx: cells[0].x,
      vy: cells[0].y,
      shootCd: 0,
      chasing: false,
      alert: 0,
      lastSeen: null
    };
    // 抗冻怪（L64+ 追击档 40%）：冰冻无效，需先用诱饵削弱
    if (level >= 64 && cfg.monsterTier >= 1 && (seed === undefined ? (idx + level) % 5 < 2 : rng() < 0.4)) {
      m.freezeRes = true;
      m.name = '抗冻怪';
    }
    return m;
  });
  // 猎手反转关（L75）：无巡逻怪，换成一只携带钥匙的逃跑 Boss——追上它才有钥匙
  if (level === 75) {
    const fleeCells = [];
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (grid[y][x] !== 1) continue;
        if ((x === sx && y === sy) || (x === ex && y === ey)) continue;
        fleeCells.push({ x: x, y: y });
      }
    }
    if (fleeCells.length) {
      const fc = fleeCells[Math.floor(rng() * fleeCells.length)];
      return [{
        isBoss: true,
        flee: true,
        behavior: 3,
        x: fc.x,
        y: fc.y,
        vx: fc.x,
        vy: fc.y,
        name: '宝藏Boss',
        path: null,
        chasing: false,
        alert: 0,
        lastSeen: null
      }];
    }
  }
  if (level >= 80 && level <= 100) {
    const bossCells = [];
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (grid[y][x] !== 1) continue;
        if ((x === sx && y === sy) || (x === ex && y === ey)) continue;
        let onPath = false;
        for (let k = 0; k < chosen.length; k++) {
          const path = chosen[k];
          for (let j = 0; j < path.length; j++) {
            if (path[j].x === x && path[j].y === y) { onPath = true; break; }
          }
          if (onPath) break;
        }
        if (onPath) continue;
        const d = (x - sx) * (x - sx) + (y - sy) * (y - sy);
        if (d < 49) continue; // 远离起点，给玩家反应时间
        bossCells.push({ x: x, y: y, d: d });
      }
    }
    if (bossCells.length) {
      bossCells.sort(function (a, b) { return b.d - a.d; });
      const bc = bossCells[Math.min(2, bossCells.length - 1)];
      patrol.push({
        isBoss: true,
        behavior: 3,
        x: bc.x,
        y: bc.y,
        vx: bc.x,
        vy: bc.y,
        alert: 100,
        lastSeen: null,
        chasing: true,
        name: 'Boss'
      });
    }
  }
  // 教学关（L20/24/28）：在远离起点的走廊放 1 只纯巡逻教学怪（不追击），软化 L31 怪物突兀感
  if (teachMon && runs.length) {
    const c0 = runs[0];
    const tm = {
      path: c0,
      pi: 0,
      pdir: 1,
      behavior: 0,
      x: c0[0].x,
      y: c0[0].y,
      vx: c0[0].x,
      vy: c0[0].y,
      shootCd: 0,
      chasing: false,
      alert: 0,
      lastSeen: null,
      isTeach: true,
      name: '教学怪'
    };
    return [tm];
  }
  // 伪 Boss 预热（L76-79）：1 只带限时追逐条、仅 LOS 追击（不过全图 BFS）的怪物，
  // 让玩家提前熟悉"限时甩开追兵"的节奏，平滑过渡到 L80 真 Boss
  if (level >= 76 && level <= 79) {
    const pbCells = [];
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (grid[y][x] !== 1) continue;
        if ((x === sx && y === sy) || (x === ex && y === ey)) continue;
        const d = (x - sx) * (x - sx) + (y - sy) * (y - sy);
        if (d < 49) continue; // 远离起点，给反应时间
        pbCells.push({ x: x, y: y, d: d });
      }
    }
    if (pbCells.length) {
      pbCells.sort(function (a, b) { return b.d - a.d; });
      const pc = pbCells[Math.min(2, pbCells.length - 1)];
      patrol.push({
        isPseudoBoss: true,
        behavior: 1,
        x: pc.x,
        y: pc.y,
        vx: pc.x,
        vy: pc.y,
        alert: 0,
        lastSeen: null,
        chasing: false,
        name: '伪Boss'
      });
    }
  }
  return patrol;
}

/**
 * 放置传送门（L26-79 约 50% 关卡出现）：成对出现，玩家踩上即瞬移到孪生门。
 * - 避开起点/终点/怪物巡逻路径；两门保持足够距离，传送才有价值。
 * - Boss 关（L80+）不放置，避免成为无限甩开 Boss 的捷径。
 * - 怪物不使用传送门（玩家专属优势）；道具/钥匙不会与传送门重叠。
 * 返回 [{x,y},{x,y}] 或 null。
 */
function placePortals(level, maze, monsters, seed) {
  // 教学关 18/22/26：强制出现传送门（即使 <L26 也放行），0 怪物配合，教"踩门瞬移"
  const forcePortal = (level === 18 || level === 22 || level === 26);
  if (!forcePortal && (level < 26 || level >= 80)) return null;
  const rng = mulberry32((seed !== undefined ? seed : ((level * 617) + 29)) >>> 0 || 1);
  if (!forcePortal && Math.floor(rng() * 10) >= 5) return null; // 普通 50%；教学关 18/22/26 强制出现
  const grid = maze.grid;
  const W = maze.W;
  const H = maze.H;
  const blocked = {};
  blocked[maze.start.x + ',' + maze.start.y] = 1;
  blocked[maze.end.x + ',' + maze.end.y] = 1;
  if (monsters) {
    for (let i = 0; i < monsters.length; i++) {
      const path = monsters[i].path;
      if (!path) continue; // Boss 无巡逻路径
      for (let j = 0; j < path.length; j++) blocked[path[j].x + ',' + path[j].y] = 1;
    }
  }
  const open = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (grid[y][x] === 1 && !blocked[x + ',' + y]) open.push({ x: x, y: y });
    }
  }
  if (open.length < 2) return null;
  // 门 A：离起点足够远（曼哈顿距离和的平方 >= 25），保证探索感
  const far = open.filter(function (c) {
    const dx = c.x - maze.start.x;
    const dy = c.y - maze.start.y;
    return dx * dx + dy * dy >= 25;
  });
  const poolA = far.length ? far : open;
  const a = poolA[Math.floor(rng() * poolA.length)];
  // 门 B：与门 A 曼哈顿距离 >= 8
  const poolB = open.filter(function (c) {
    if (c.x === a.x && c.y === a.y) return false;
    return Math.abs(c.x - a.x) + Math.abs(c.y - a.y) >= 8;
  });
  if (!poolB.length) return null;
  const b = poolB[Math.floor(rng() * poolB.length)];
  return [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
}

/**
 * 放置单向门（单向滑梯，L61-79 约 45% 关卡出现）：站在门格只能沿箭头方向离开，进入不受限。
 * - 避开起点/终点/传送门格/怪物巡逻路径；放置后 BFS 验证起点→终点仍可达（含单向限制），否则放弃。
 * - 怪物与 Boss 无视单向门（熟悉地形）；玩家专属地形机制。
 * 返回 [{x,y,dir},...]（写入 maze.oneways），无则 []。
 */
function placeOneWays(level, maze, monsters, portals, seed) {
  maze.oneways = [];
  if (level < 61 || level >= 80) return maze.oneways;
  const rng = mulberry32((seed !== undefined ? seed : ((level * 431) + 77)) >>> 0 || 1);
  if (Math.floor(rng() * 100) >= 45) return maze.oneways; // 45% 概率出现
  const grid = maze.grid;
  const W = maze.W;
  const H = maze.H;
  const reserved = {};
  reserved[maze.start.x + ',' + maze.start.y] = 1;
  reserved[maze.end.x + ',' + maze.end.y] = 1;
  if (portals) {
    for (let i = 0; i < portals.length; i++) reserved[portals[i].x + ',' + portals[i].y] = 1;
  }
  if (monsters) {
    for (let i = 0; i < monsters.length; i++) {
      const path = monsters[i].path;
      if (!path) continue;
      for (let j = 0; j < path.length; j++) reserved[path[j].x + ',' + path[j].y] = 1;
    }
  }
  // 候选：相邻通路格对 (A→B)，A/B 均非保留格
  const DIRS = ['U', 'D', 'L', 'R'];
  const cands = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (grid[y][x] !== 1 || reserved[x + ',' + y]) continue;
      for (let di = 0; di < DIRS.length; di++) {
        const d = DIRS[di];
        const nx = x + DX[d];
        const ny = y + DY[d];
        if (nx < 1 || nx >= W - 1 || ny < 1 || ny >= H - 1) continue;
        if (grid[ny][nx] === 1 && !reserved[nx + ',' + ny]) {
          cands.push({ x: x, y: y, dir: d });
        }
      }
    }
  }
  // 洗牌
  for (let i = cands.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = cands[i];
    cands[i] = cands[j];
    cands[j] = t;
  }
  const want = 1 + (Math.floor(rng() * 10) < 4 ? 1 : 0); // 1~2 个
  for (let i = 0; i < cands.length && maze.oneways.length < want; i++) {
    const c = cands[i];
    const map = {};
    map[c.x + ',' + c.y] = c.dir;
    // 放置后整图仍需可达（与玩家规则一致）
    if (bfsSteps(grid, maze.start, maze.end, portals, map) < 0) continue;
    // 与已放单向门不同格
    const dup = maze.oneways.some(function (o) { return o.x === c.x && o.y === c.y; });
    if (dup) continue;
    maze.oneways.push(c);
  }
  return maze.oneways;
}

/**
 * 为关卡放置收集物与道具（确定性，可复现）。
 * - 光点(gem)：散布在通道中，收集可计入"全收集"成就（不影响 3 星评分，但作为额外挑战）。
 * - 道具：cloak=隐身斗篷（怪物看不见你）、freeze=冰冻（定身怪物与子弹）、dash=加速（移动更快）、shield=护盾（使用后抵挡一次碰撞）。
 * 放置避开起点/终点以及怪物巡逻路径，避免"走到道具上同时被怪物抓"的憋屈局面。
 */
function placeItems(level, maze, monsters, seed) {
  const cfg = getLevelConfig(level);
  const rng = mulberry32((seed !== undefined ? seed : ((level * 733) + 99)) >>> 0 || 1);
  const grid = maze.grid;
  const W = maze.W;
  const H = maze.H;
  const blocked = {};
  blocked[maze.start.x + ',' + maze.start.y] = 1;
  blocked[maze.end.x + ',' + maze.end.y] = 1;
  if (monsters) {
    for (let i = 0; i < monsters.length; i++) {
      const path = monsters[i].path;
      if (!path) continue; // Boss 无巡逻路径
      for (let j = 0; j < path.length; j++) blocked[path[j].x + ',' + path[j].y] = 1;
    }
  }
  // 传送门格不放道具（P7）
  if (maze.portals) {
    for (let i = 0; i < maze.portals.length; i++) {
      const p = maze.portals[i];
      blocked[p.x + ',' + p.y] = 1;
    }
  }
  // 单向门格不放道具/钥匙：钥匙放上去可能形成"只能进不能出"的死角
  if (maze.oneways) {
    for (let i = 0; i < maze.oneways.length; i++) {
      const o = maze.oneways[i];
      blocked[o.x + ',' + o.y] = 1;
    }
  }
  // 动态闸门格不放道具（关上时会被"吞"住）
  if (maze.gates) {
    for (let i = 0; i < maze.gates.length; i++) {
      const g = maze.gates[i];
      blocked[g.x + ',' + g.y] = 1;
    }
  }
  const open = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (grid[y][x] === 1 && !blocked[x + ',' + y]) open.push({ x: x, y: y });
    }
  }
  // 洗牌
  for (let i = open.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = open[i];
    open[i] = open[j];
    open[j] = t;
  }
  const gemCount = Math.max(3, Math.min(3 + Math.floor(level / 8), 9));
  const items = [];
  let keyPos = null;
  // 钥匙与锁门（L16+ 概率出现）：从离起点较远的空格取一把
  // L75 猎手反转关：钥匙在逃跑 Boss 身上，不放地面钥匙
  // 教学轻谜题（L20/24/28）：强制出钥匙，配合教学怪软化 L31 突兀感
  if (level >= 16 && level !== 75) {
    const forceKey = (level === 20 || level === 24 || level === 28);
    const wantKey = forceKey || (Math.floor(rng() * 10) < 6);
    if (wantKey) {
      for (let i = 0; i < open.length; i++) {
        const c = open[i];
        if (Math.abs(c.x - 1) + Math.abs(c.y - 1) >= 4) {
          keyPos = c;
          open.splice(i, 1);
          break;
        }
      }
    }
  }
  if (keyPos) items.push({ x: keyPos.x, y: keyPos.y, type: 'key', taken: false });
  let idx = 0;
  for (let k = 0; k < gemCount && idx < open.length; k++, idx++) {
    items.push({ x: open[idx].x, y: open[idx].y, type: 'gem', taken: false });
  }
  // 道具池：L31+（怪物登场）加入诱饵；迷雾关（L41+）加入磁铁 / 照明弹
  const base = ['cloak', 'freeze', 'dash', 'shield'];
  if (level >= 31) base.push('decoy');
  const types = level >= 41 ? base.concat(['magnet', 'flare']) : base;
  const powerCount = level < 6 ? 0 : (level < 25 ? 1 : 2);
  for (let k = 0; k < powerCount && idx < open.length; k++, idx++) {
    items.push({ x: open[idx].x, y: open[idx].y, type: types[Math.floor(rng() * types.length)], taken: false });
  }
  // 瞬移卷轴（L16+ 概率出现）：使用后直接传送至出口前格，踏出即通关
  if (level >= 16 && idx < open.length && Math.floor(rng() * 4) === 0) {
    items.push({ x: open[idx].x, y: open[idx].y, type: 'scroll', taken: false });
    idx++;
  }
  // 新手教学（L2/L3）：前 5 关无道具掉落（powerCount=0），强制在出口附近放 1 个护盾，
  // 让「捡到道具→背包→使用」链路在前 3 关内可完成
  if (level === 2 || level === 3) {
    let bestI = -1;
    let bestD = 1e9;
    for (let i = idx; i < open.length; i++) {
      const d = Math.abs(open[i].x - maze.end.x) + Math.abs(open[i].y - maze.end.y);
      if (d > 0 && d < bestD) { bestD = d; bestI = i; }
    }
    if (bestI >= 0) {
      items.push({ x: open[bestI].x, y: open[bestI].y, type: 'shield', taken: false });
      open.splice(bestI, 1);
    }
  }
  return { items: items, gemTotal: gemCount, key: keyPos };
}

// BFS：返回从 from 朝 to 走的第一步位移 {x,y}（单位向量），用于 Boss 主动追击。
// 若已在同一格返回 null；不可达返回 null。
function bfsStepToward(grid, from, to) {
  if (from.x === to.x && from.y === to.y) return null;
  const H = grid.length;
  const W = grid[0].length;
  const prev = {};
  const q = [[from.x, from.y]];
  prev[from.x + ',' + from.y] = null;
  let head = 0;
  while (head < q.length) {
    const cur = q[head++];
    const cx = cur[0], cy = cur[1];
    if (cx === to.x && cy === to.y) break;
    const dirs = ['U', 'D', 'L', 'R'];
    for (let i = 0; i < dirs.length; i++) {
      const d = dirs[i];
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      if (nx >= 0 && nx < W && ny >= 0 && ny < H && grid[ny][nx] === 1 && prev[nx + ',' + ny] === undefined) {
        prev[nx + ',' + ny] = cx + ',' + cy;
        q.push([nx, ny]);
      }
    }
  }
  const tk = to.x + ',' + to.y;
  if (prev[tk] === undefined) return null;
  const path = [];
  let key = tk;
  while (key !== null) {
    path.push(key);
    key = prev[key];
  }
  path.reverse();
  if (path.length < 2) return null;
  const nx = parseInt(path[1].split(',')[0], 10);
  const ny = parseInt(path[1].split(',')[1], 10);
  return { x: nx - from.x, y: ny - from.y };
}

/**
 * 放置宝藏暗室（L45+ 约 50% 关卡出现）：假墙后藏着光尘堆与稀有道具。
 * - 候选 = 内部墙格且正交相邻 ≥2 个通路格（撞开后形成捷径或连通新区域）。
 * - 避开起点/终点四周；与单向门/传送门不冲突（它们占的是通路格）。
 * 返回 [{x,y}]（写入 maze.secrets），无则 []。撞开由游戏层运行时处理（修改 grid）。
 */
function placeSecrets(level, maze, seed) {
  maze.secrets = [];
  if (level < 45) return maze.secrets;
  const rng = mulberry32((seed !== undefined ? seed : ((level * 271) + 541)) >>> 0 || 1);
  if (Math.floor(rng() * 100) >= 50) return maze.secrets; // 50% 概率出现
  const grid = maze.grid;
  const W = maze.W;
  const H = maze.H;
  const sx = maze.start.x;
  const sy = maze.start.y;
  const cands = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (grid[y][x] !== 0) continue;
      // 距起点 3 格以上，避免开局撞墙
      if (Math.abs(x - sx) + Math.abs(y - sy) < 3) continue;
      let openN = 0;
      const dirs = ['U', 'D', 'L', 'R'];
      for (let di = 0; di < dirs.length; di++) {
        const nx = x + DX[dirs[di]];
        const ny = y + DY[dirs[di]];
        if (nx >= 0 && nx < W && ny >= 0 && ny < H && grid[ny][nx] === 1) openN++;
      }
      if (openN >= 2) cands.push({ x: x, y: y });
    }
  }
  if (!cands.length) return maze.secrets;
  // 1~2 个暗室
  const want = 1 + (Math.floor(rng() * 10) < 3 ? 1 : 0);
  for (let k = 0; k < want && cands.length; k++) {
    const i = Math.floor(rng() * cands.length);
    const c = cands.splice(i, 1)[0];
    maze.secrets.push({ x: c.x, y: c.y });
  }
  return maze.secrets;
}

/**
 * 放置动态闸门（L66+ 约 40% 关卡出现）：通路上的闸门周期开合。
 * - 候选 = 直走廊中段（恰好 2 个正交通路且方向相反），关上时形成临时墙。
 * - 避开起点/终点/传送门/单向门/怪物巡逻路径（怪物无视闸门，走固定路径时不被夹住）。
 * 返回 [{x,y,closedMs,openMs,offset}]（写入 maze.gates），开合时序由游戏层运行时驱动。
 */
function placeGates(level, maze, monsters, portals, oneways, seed) {
  maze.gates = [];
  if (level < 66 || level >= 80) return maze.gates;
  const rng = mulberry32((seed !== undefined ? seed : ((level * 389) + 911)) >>> 0 || 1);
  if (Math.floor(rng() * 100) >= 40) return maze.gates; // 40% 概率出现
  const grid = maze.grid;
  const W = maze.W;
  const H = maze.H;
  const reserved = {};
  reserved[maze.start.x + ',' + maze.start.y] = 1;
  reserved[maze.end.x + ',' + maze.end.y] = 1;
  if (portals) {
    for (let i = 0; i < portals.length; i++) reserved[portals[i].x + ',' + portals[i].y] = 1;
  }
  if (oneways) {
    for (let i = 0; i < oneways.length; i++) reserved[oneways[i].x + ',' + oneways[i].y] = 1;
  }
  if (monsters) {
    for (let i = 0; i < monsters.length; i++) {
      const path = monsters[i].path;
      if (!path) continue;
      for (let j = 0; j < path.length; j++) reserved[path[j].x + ',' + path[j].y] = 1;
    }
  }
  const dirs = ['U', 'D', 'L', 'R'];
  const OPPD = { U: 'D', D: 'U', L: 'R', R: 'L' };
  const cands = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (grid[y][x] !== 1 || reserved[x + ',' + y]) continue;
      let openN = 0;
      let dA = null;
      let dB = null;
      for (let di = 0; di < dirs.length; di++) {
        const d = dirs[di];
        const nx = x + DX[d];
        const ny = y + DY[d];
        if (nx >= 0 && nx < W && ny >= 0 && ny < H && grid[ny][nx] === 1) {
          openN++;
          if (!dA) dA = d; else dB = d;
        }
      }
      // 直走廊：2 个开口且相对
      if (openN === 2 && dA && dB && OPPD[dA] === dB) cands.push({ x: x, y: y });
    }
  }
  if (!cands.length) return maze.gates;
  const want = 1 + (Math.floor(rng() * 10) < 4 ? 1 : 0); // 1~2 个
  for (let k = 0; k < want && cands.length; k++) {
    const i = Math.floor(rng() * cands.length);
    const c = cands.splice(i, 1)[0];
    maze.gates.push({
      x: c.x,
      y: c.y,
      closedMs: 2200 + Math.floor(rng() * 3) * 600,  // 2.2~3.4s 关闭
      openMs: 2600 + Math.floor(rng() * 3) * 700,    // 2.6~4.0s 开放
      offset: Math.floor(rng() * 3000)               // 相位错开
    });
  }
  return maze.gates;
}

/**
 * 放置守门怪（L68+ 带钥匙关）：守在钥匙附近的 stationary 守卫。
 * - 位置 = 距钥匙 BFS 2~5 步的通路格，大视野（半径 5）+ 追击 leash（离哨位 8 格回防）。
 * 返回守门怪对象或 null（写入 maze.gatekeeper）。
 */
function placeGatekeeper(level, maze, monsters, keyPos, seed) {
  maze.gatekeeper = null;
  if (level < 68 || level >= 80 || !keyPos) return null;
  const rng = mulberry32((seed !== undefined ? seed : ((level * 613) + 373)) >>> 0 || 1);
  if (Math.floor(rng() * 100) >= 55) return null; // 55% 概率出现
  const grid = maze.grid;
  const H = grid.length;
  const W = grid[0].length;
  // 从钥匙做一次 BFS 洪泛，取 dist 2~5 的格子
  const dist = {};
  const q = [[keyPos.x, keyPos.y]];
  dist[keyPos.x + ',' + keyPos.y] = 0;
  let head = 0;
  while (head < q.length) {
    const cur = q[head++];
    const cx = cur[0], cy = cur[1];
    const dirs = ['U', 'D', 'L', 'R'];
    for (let i = 0; i < dirs.length; i++) {
      const d = dirs[i];
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      if (nx >= 0 && nx < W && ny >= 0 && ny < H && grid[ny][nx] === 1 && dist[nx + ',' + ny] === undefined) {
        dist[nx + ',' + ny] = dist[cx + ',' + cy] + 1;
        q.push([nx, ny]);
      }
    }
  }
  const pool = [];
  for (const k in dist) {
    const d = dist[k];
    if (d >= 2 && d <= 5) {
      const p = k.split(',');
      pool.push({ x: parseInt(p[0], 10), y: parseInt(p[1], 10) });
    }
  }
  if (!pool.length) return null;
  const post = pool[Math.floor(rng() * pool.length)];
  const gk = {
    isGatekeeper: true,
    name: '守门怪',
    behavior: 1,
    x: post.x,
    y: post.y,
    vx: post.x,
    vy: post.y,
    post: post,
    mode: 'guard',   // guard | chase | return
    chasing: false,
    alert: 0,
    lastSeen: null,
    path: null
  };
  maze.gatekeeper = gk;
  return gk;
}

module.exports = {
  getLevelConfig: getLevelConfig,
  generateMaze: generateMaze,
  mirrorMaze: mirrorMaze,
  getOpenDirs: getOpenDirs,
  step: step,
  isEnd: isEnd,
  bfsSteps: bfsSteps,
  bfsStepsKey: bfsStepsKey,
  bfsStepToward: bfsStepToward,
  placeMonsters: placeMonsters,
  placePortals: placePortals,
  placeOneWays: placeOneWays,
  placeSecrets: placeSecrets,
  placeGates: placeGates,
  placeGatekeeper: placeGatekeeper,
  placeItems: placeItems,
  bfsPath: bfsPath
};
