/**
 * 玩法模式软切换（v1.4 P1.5）
 *
 * - 默认 MAZE_ENABLED=false：迷宫探索玩法的所有入口下线，塔防「地宫守卫」是唯一默认玩法。
 * - GameScene / play.js / maze.js 等迷宫代码【全部保留】，只是不再注册为可达路径；
 *   setMazeEnabled(true) 即可完整回退（含旧入口与旧分发），34 个既有测试据此继续验证旧行为。
 * - 注意：maze.js 不能删。core/tower.js 依赖它的 generateMaze / bfsPath 生成敌人通道图，
 *   maze.js 在此版本降级为「塔防专用地图生成器」。
 *
 * WAVE_RULES 是波数结算口径的单一事实来源，与规格文档第 14.5 节一一对应。
 * 所有系数均为首版草案，需由埋点数据收敛，禁止在业务代码里另写魔法数字。
 */
let MAZE_ENABLED = false

// 波数结算口径（详见规格 14.5）
const WAVE_RULES = {
  dustPerTwoWaves: 3,      // dust = floor(reached / 2) * 3
  xpBase: 10,              // 每局基础赛季 XP，避免 0 波时零收益
  xpPerWave: 2,            // 每波 XP
  xpWaveCap: 20,           // 波数计入上限，防高波无限刷 XP
  recordXp: 30,            // 破本机最佳波数时的额外 XP（由 TowerScene 的 isBest 判重，不复用 bestFloor）
  achWaves: [5, 10, 20],   // 塔防成就阈值：首局正反馈 / P1 通过标准 / 当前难度瓶颈
  achIds: ['td5', 'td10', 'td20']
}

// 塔防默认模式下，首页 DOCK 仍保留的可见项（其余迷宫玩法入口仅隐藏，不删除数据结构）
const TOWER_DOCK_KEYS = ['supply', 'survival', 'task']

function isMazeEnabled() { return MAZE_ENABLED }
function setMazeEnabled(v) { MAZE_ENABLED = !!v }
function isTowerDefault() { return !MAZE_ENABLED }

// 赛季 XP：基础 + 波数线性（封顶），破纪录额外奖励复用 season.onDepth 的既有判重
function seasonXpFor(reached) {
  const w = Math.max(0, Math.min(reached || 0, WAVE_RULES.xpWaveCap))
  return WAVE_RULES.xpBase + WAVE_RULES.xpPerWave * w
}

// 光尘：沿用 P1 现值，不引入新货币
function dustFor(reached) {
  return Math.floor(Math.max(0, reached || 0) / 2) * WAVE_RULES.dustPerTwoWaves
}

// 按本局波数返回应解锁的塔防成就 id 列表
function achFor(reached) {
  const out = []
  const w = reached || 0
  for (let i = 0; i < WAVE_RULES.achWaves.length; i++) {
    if (w >= WAVE_RULES.achWaves[i]) out.push(WAVE_RULES.achIds[i])
  }
  return out
}

module.exports = {
  WAVE_RULES: WAVE_RULES,
  TOWER_DOCK_KEYS: TOWER_DOCK_KEYS,
  isMazeEnabled: isMazeEnabled,
  setMazeEnabled: setMazeEnabled,
  isTowerDefault: isTowerDefault,
  seasonXpFor: seasonXpFor,
  dustFor: dustFor,
  achFor: achFor
}
