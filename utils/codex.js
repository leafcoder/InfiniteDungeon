// 图鉴条目定义：怪物 / 道具 / 机关（首次遭遇即解锁）
// encounter 时机见 game.js；key 与 game.js 内 encounterCodex 调用一一对应
const CODEX = [
  // 怪物
  { key: 'monster_patrol', name: '巡逻史莱姆', glyph: '巡', color: '#FF9F6E', group: '怪物', desc: '沿固定路线往返巡逻的迷宫原住民，撞上就会被抓住。' },
  { key: 'monster_chase', name: '追猎者', glyph: '猎', color: '#FF6B6B', group: '怪物', desc: '进入直线视野后立刻追击。拐角甩视野、丢诱饵都是好办法。' },
  { key: 'monster_shoot', name: '狙击手', glyph: '狙', color: '#C79BFF', group: '怪物', desc: '会朝你发射能量弹。冰冻可以连子弹一起定住。' },
  { key: 'monster_boss', name: '迷宫之主', glyph: '王', color: '#FF4D4D', group: '怪物', desc: '限时追逐关的巨型怪物。剩余时间过半会狂暴：提速、召唤影卫、蓄力冲刺。' },
  { key: 'monster_freezeres', name: '冰甲怪', glyph: '甲', color: '#5BC8FF', group: '怪物', desc: '覆盖冰甲的追击怪，冰冻对它无效——先丢诱饵削弱它的护甲。' },
  { key: 'monster_gatekeeper', name: '守门怪', glyph: '守', color: '#FFB84D', group: '怪物', desc: '守在钥匙附近的哨卫。平时静止，靠近即追击，但不会离哨位太远。' },
  { key: 'monster_flee', name: '宝藏Boss', glyph: '宝', color: '#FFD86E', group: '怪物', desc: '携带终点钥匙四处逃窜的胆小Boss。追上它才能拿到钥匙！' },
  // 道具
  { key: 'item_cloak', name: '隐身斗篷', glyph: '隐', color: '#9B8CFF', group: '道具', desc: '短时间内怪物看不见你，Boss 只会前往最后目击点。' },
  { key: 'item_freeze', name: '冰冻星', glyph: '冰', color: '#5BC8FF', group: '道具', desc: '冻结全场怪物与子弹，是穿越枪线的钥匙。' },
  { key: 'item_dash', name: '疾风靴', glyph: '速', color: '#FF9F6E', group: '道具', desc: '移动速度翻倍，抢时间与逃命两相宜。' },
  { key: 'item_shield', name: '护盾', glyph: '盾', color: '#6EE7A0', group: '道具', desc: '抵挡一次碰撞或子弹，抵挡后获得短暂无敌。' },
  { key: 'item_magnet', name: '磁铁', glyph: '磁', color: '#5EE6D8', group: '道具', desc: '自动吸附附近的光点，全收集党的最爱。' },
  { key: 'item_flare', name: '照明弹', glyph: '灯', color: '#FF6B6B', group: '道具', desc: '大幅扩大迷雾中的可见范围。' },
  { key: 'item_decoy', name: '诱饵', glyph: '饵', color: '#FF9EC4', group: '道具', desc: '放置后怪物改追诱饵——但迷宫之主从不被骗。' },
  // 机关与收集
  { key: 'item_key', name: '终点钥匙', glyph: '钥', color: '#FFD86E', group: '机关', desc: '拿到它才能打开终点的锁门。' },
  { key: 'mach_portal', name: '传送门', glyph: '门', color: '#7FD8FF', group: '机关', desc: '成对出现，踩上即瞬移到孪生门。怪物不会使用。' },
  { key: 'mach_oneway', name: '单向门', glyph: '向', color: '#6FE3D2', group: '机关', desc: '单向滑梯：只能沿箭头离开，进去前想好路线。' },
  { key: 'mach_gate', name: '动态闸门', glyph: '闸', color: '#8FA3C8', group: '机关', desc: '周期开合的能量闸门，关闭前有闪烁预警。怪物无视闸门。' },
  { key: 'mach_secret', name: '宝藏暗室', glyph: '密', color: '#C9A96E', group: '机关', desc: '颜色略深的墙藏有暗室，朝它滑动即可撞开，内有光尘与道具。' },
  { key: 'item_hourglass', name: '时光沙漏', glyph: '沙', color: '#B8A9FF', group: '道具', desc: '被抓的瞬间自动回退 3 步。危机时刻的最后底牌。' },
  { key: 'gem', name: '光点', glyph: '✦', color: '#FFD86E', group: '收集', desc: '散落迷宫的收集物，兑换光尘与全收集标记。' }
];

function byKey(k) {
  for (let i = 0; i < CODEX.length; i++) {
    if (CODEX[i].key === k) return CODEX[i];
  }
  return null;
}

module.exports = {
  CODEX: CODEX,
  byKey: byKey
};
