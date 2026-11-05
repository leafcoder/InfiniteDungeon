// 图鉴条目定义：怪物 / 道具 / 机关（首次遭遇即解锁）
// key 与 GameScene 内 storage.encounterCodex 调用一一对应：
//   怪物 m_*（alert/kill 事件），道具 i_*（pickup 事件），机关 mach_*（portal/secret 事件）
const CODEX = [
  // 怪物
  { key: 'm_patrol', name: '巡逻史莱姆', glyph: '巡', color: '#FF9F6E', group: 'monster', desc: '沿固定路线往返巡逻的迷宫原住民，撞上就会被抓住。' },
  { key: 'm_chaser', name: '追猎者', glyph: '猎', color: '#FF6B6B', group: 'monster', desc: '进入直线视野后立刻追击。拐角甩视野、丢诱饵都是好办法。' },
  { key: 'm_shooter', name: '狙击手', glyph: '狙', color: '#C79BFF', group: 'monster', desc: '会朝你发射能量弹。冰冻可以连子弹一起定住。' },
  { key: 'm_boss', name: '迷宫之主', glyph: '王', color: '#FF4D4D', group: 'monster', desc: '限时追逐关的巨型怪物。狂暴会提速、召唤影卫、蓄力冲刺——魔弹可眩晕它 2.5 秒。' },
  { key: 'm_flee', name: '宝藏Boss', glyph: '宝', color: '#FFD86E', group: 'monster', desc: '携带终点钥匙四处逃窜的胆小Boss。追上它才能拿到钥匙，魔弹对它无效。' },
  { key: 'm_gatekeeper', name: '守门怪', glyph: '守', color: '#FFB84D', group: 'monster', desc: '守在钥匙附近的哨卫（L68+）。平时静止，靠近即追击，但不会离哨位太远。' },
  // 道具
  { key: 'i_cloak', name: '隐身斗篷', glyph: '隐', color: '#9B8CFF', group: 'item', desc: '短时间内怪物看不见你，Boss 只会前往最后目击点。', use: '点背包格使用，约8秒隐身（怪物看不见你）' },
  { key: 'i_freeze', name: '冰冻星', glyph: '冰', color: '#5BC8FF', group: 'item', desc: '冻结全场怪物与子弹，是穿越枪线的钥匙。', use: '点背包格使用，约8秒冻结全场怪物与子弹' },
  { key: 'i_dash', name: '疾风靴', glyph: '速', color: '#FF9F6E', group: 'item', desc: '移动速度翻倍，抢时间与逃命两相宜。', use: '点背包格使用，约8秒移速翻倍' },
  { key: 'i_shield', name: '护盾', glyph: '盾', color: '#6EE7A0', group: 'item', desc: '抵挡一次碰撞或子弹，抵挡后获得短暂无敌。', use: '点背包格使用，抵挡一次碰撞或子弹' },
  { key: 'i_magnet', name: '磁铁', glyph: '磁', color: '#5EE6D8', group: 'item', desc: '自动吸附附近的光点，全收集党的最爱。', use: '点背包格使用，约8秒自动吸附附近光点' },
  { key: 'i_flare', name: '照明弹', glyph: '灯', color: '#FF6B6B', group: 'item', desc: '大幅扩大迷雾中的可见范围。', use: '点背包格使用，约8秒扩大迷雾视野' },
  { key: 'i_decoy', name: '诱饵', glyph: '饵', color: '#FF9EC4', group: 'item', desc: '放置后怪物改追诱饵——但迷宫之主从不被骗。', use: '点背包格使用，约8秒放诱饵引怪（Boss不信）' },
  { key: 'i_hourglass', name: '时光沙漏', glyph: '沙', color: '#B8A9FF', group: 'item', desc: '被抓的瞬间自动回退 3 步。危机时刻的最后底牌。', use: '被动：被抓瞬间自动回退3步，无需手动' },
  { key: 'i_bow', name: '魔弹', glyph: '弹', color: '#C79BFF', group: 'item', desc: '拾取即装填 3 发。视线内最近怪锁定：普通怪击杀掉光尘，Boss 眩晕。', use: '点背包格发射，命中视线内最近怪（普怪掉光尘/Boss眩晕）' },
  { key: 'i_key', name: '终点钥匙', glyph: '钥', color: '#FFD86E', group: 'item', desc: '拿到它才能打开终点的锁门。' },
  { key: 'i_gem', name: '光点', glyph: '✦', color: '#FFD86E', group: 'item', desc: '散落迷宫的收集物，兑换光尘与全收集标记。' },
  // 机关
  { key: 'mach_portal', name: '传送门', glyph: '门', color: '#7FD8FF', group: 'mech', desc: '成对出现，踩上即瞬移到孪生门。怪物不会使用。' },
  { key: 'mach_secret', name: '宝藏暗室', glyph: '密', color: '#C9A96E', group: 'mech', desc: '颜色略深的墙藏有暗室，朝它滑动即可撞开，内有光尘与道具。' }
];

const GROUP_LABEL = { monster: '怪物', item: '道具', mech: '机关' };
const GROUP_ORDER = ['monster', 'item', 'mech'];

// 图鉴收集里程碑：达成后由 checkMilestones 一次性发奖（flags 防重）
const MILESTONES = [
  { id: 'cx_m', flag: 'cx_m', need: 'monster', title: '博物学家', shard: 5, desc: '收录全部 6 种怪物' },
  { id: 'cx_all', flag: 'cx_all', title: '地宫学者', shard: 20, desc: '收录图鉴全部条目' }
];

function byKey(k) {
  for (let i = 0; i < CODEX.length; i++) {
    if (CODEX[i].key === k) return CODEX[i];
  }
  return null;
}

function byGroup(g) {
  return CODEX.filter(function (c) { return c.group === g; });
}

// 收集进度：{ group: { total, got } }
function progress(getCodexFn) {
  const out = { total: CODEX.length, got: 0, byGroup: {} };
  for (let i = 0; i < GROUP_ORDER.length; i++) {
    const g = GROUP_ORDER[i];
    const list = byGroup(g);
    let got = 0;
    for (let j = 0; j < list.length; j++) if (getCodexFn()[list[j].key]) got++;
    out.byGroup[g] = { total: list.length, got: got };
    out.got += got;
  }
  return out;
}

// 里程碑检查：达成分组/全收集时发碎片+称号（一次性，flags 记录）
// 返回本次新达成的里程碑数组
function checkMilestones(storage) {
  const got = [];
  const p = progress(function () { return storage.getCodex(); });
  for (let i = 0; i < MILESTONES.length; i++) {
    const ms = MILESTONES[i];
    if (storage.getFlag(ms.flag)) continue;
    const done = ms.need ? (p.byGroup[ms.need].got >= p.byGroup[ms.need].total) : (p.got >= p.total);
    if (!done) continue;
    storage.setFlag(ms.flag);
    if (ms.shard) storage.addShard(ms.shard);
    storage.unlockCosmetic('titles', ms.title);
    // 同步解锁同名成就（maze_ach_v1），使图鉴里程碑在「成就图鉴」面板可见（reward 由 ACHS 决定，与碎片不冲突）
    if (storage.unlockAch) storage.unlockAch(ms.id);
    got.push(ms);
  }
  return got;
}

module.exports = {
  CODEX: CODEX,
  GROUP_LABEL: GROUP_LABEL,
  GROUP_ORDER: GROUP_ORDER,
  MILESTONES: MILESTONES,
  byKey: byKey,
  byGroup: byGroup,
  progress: progress,
  checkMilestones: checkMilestones
};
