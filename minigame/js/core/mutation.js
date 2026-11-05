/**
 * 地宫异变（每日变异层，核心）
 * - 每天全服同一种「今日异变」：按日期确定性哈希从 7 档中选 1（含宁静日缓冲档）
 * - 挑战词缀直接复用 weekly.MODS 的 6 个键（PlayCore 全部已生效，零玩法基建）：
 *   fog 迷雾 / haste 疾走 / dark 夜幕 / noitem 禁补 / more 围剿 / slow 泥沼
 * - 设计原则：挑战有补偿——词缀日通关光尘 ×1.3~1.5，玩家自选参与（打或不打都不亏）
 * - 只作用于普通关（mode=level、L<80、无口令词缀）；每日挑战/生存/无尽塔/节日/Boss 追逐关不受影响
 */
const storage = require('./storage')

const MUTS = [
  { key: 'calm', name: '宁静日', color: '#6FE3D2', mods: [], bonus: 1, desc: '今日无异变 · 照常探索' },
  { key: 'fog', name: '迷雾日', color: '#9B8CFF', mods: ['fog'], bonus: 1.3, desc: '全场迷雾笼罩 · 通关光尘×1.3' },
  { key: 'haste', name: '疾走日', color: '#FF9E4A', mods: ['haste'], bonus: 1.4, desc: '怪物移速+25% · 通关光尘×1.4' },
  { key: 'dark', name: '夜幕日', color: '#5A6CFF', mods: ['dark'], bonus: 1.5, desc: '视野半径减半 · 通关光尘×1.5' },
  { key: 'noitem', name: '禁补日', color: '#FF6B8A', mods: ['noitem'], bonus: 1.5, desc: '地图不生成道具 · 通关光尘×1.5' },
  { key: 'more', name: '围剿日', color: '#E36BFF', mods: ['more'], bonus: 1.4, desc: '怪物数量+2 · 通关光尘×1.4' },
  { key: 'slow', name: '泥沼日', color: '#8BC9FF', mods: ['slow'], bonus: 1.3, desc: '你的步速降低 · 通关光尘×1.3' }
]

// 测试/调试用固定档位；生产恒为空串
let OVERRIDE = ''

function hashDay(key) {
  let h = 0
  const s = String(key || '')
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973
  return h
}

// 日期 key（YYYY-MM-DD）→ 今日异变档；同一天全设备一致，非法输入回退宁静日
function mutationOfDay(key) {
  if (OVERRIDE) {
    const om = MUTS.filter(function (m) { return m.key === OVERRIDE })[0]
    if (om) return om
  }
  const p = String(key || '').split('-')
  if (p.length !== 3 || isNaN(new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).getTime())) {
    return MUTS[0]
  }
  return MUTS[hashDay(key) % MUTS.length] || MUTS[0]
}

function today() { return mutationOfDay(storage.dailyKey()) }

function setOverride(key) {
  OVERRIDE = (key && MUTS.some(function (m) { return m.key === key })) ? key : ''
}

// 光尘补偿（纯函数）：异变日按 bonus 取整放大；宁静日/无异变原样返回
function applyBonus(dust, mut) {
  if (!mut || !(mut.bonus > 1)) return dust || 0
  return Math.round((dust || 0) * mut.bonus)
}

module.exports = {
  MUTS: MUTS,
  mutationOfDay: mutationOfDay,
  today: today,
  setOverride: setOverride,
  applyBonus: applyBonus
}
