/**
 * 玩法与波数结算口径（v1.4 硬删除后）
 *
 * - 唯一玩法是塔防「地宫守卫」。迷宫玩法层已从仓库物理删除，
 *   main.js 只注册 home / tower 两个场景，**不再提供任何回退开关**。
 * - core/mapgen.js 是塔防专用的通道图生成器，独立于已删除的 core/maze.js。
 *
 * WAVE_RULES 是波数结算口径的单一事实来源，与规格文档第 14.5 节一一对应。
 * SEASON_XP 是所有赛季 XP 常量的单一事实来源；业务代码禁止另写魔法数字。
 * 纯单机没有埋点回流，两套数值仍为首版草案；真机数据回来后只改这两张表。
 */

const WAVE_RULES = {
  dustPerTwoWaves: 3,      // dust = floor(reached / 2) * 3
  xpBase: 10,              // 每局基础赛季 XP，避免 0 波时零收益
  xpPerWave: 2,            // 每波 XP
  xpWaveCap: 20,           // 波数计入上限，防高波无限刷 XP
  recordXp: 30,            // 破本机最佳波数时的额外 XP（由 TowerScene 的 isBest 判重，不复用 bestFloor）
  achWaves: [5, 10, 20],   // 塔防成就阈值：首局正反馈 / P1 通过标准 / 当前难度瓶颈
  achIds: ['td5', 'td10', 'td20']
}

// 赛季 XP 数值口径（唯一事实来源）。
// clearLegacy / dailyLegacy 仅供老存档兼容路径（塔防不触发）；depth 与破纪录 XP 同源，
// 避免 season.onDepth 与 WAVE_RULES.recordXp 各写一个 30。
const SEASON_XP = {
  clearLegacy: 20,             // 老存档：completeLevel
  dailyLegacy: 40,             // 老存档：completeDaily
  checkin: 10,                 // 每日签到（当前生效）
  club: 5,                     // 游戏圈打卡（当前生效）
  taskClaim: 15,               // 领取任务奖励（当前生效）
  depth: WAVE_RULES.recordXp   // 破纪录：与波数结算同源
}

// 首页 DOCK 保留的可见项（布局结构仍保留 6 项，其余按 hidden 过滤不绘制、不命中）
const TOWER_DOCK_KEYS = ['supply', 'survival', 'task']

// 赛季 XP：基础 + 波数线性（封顶）
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
  SEASON_XP: SEASON_XP,
  TOWER_DOCK_KEYS: TOWER_DOCK_KEYS,
  seasonXpFor: seasonXpFor,
  dustFor: dustFor,
  achFor: achFor
};
