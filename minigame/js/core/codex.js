/**
 * 地宫图鉴 · 守卫篇（v1.4）
 *
 * 主进度 = 塔防条目（tower / enemy / bless / mech），由 TowerScene 的局内事件真实推进。
 * archive = 迷宫时代旧 19 条，只读档案陈列，不再写入、不计入里程碑分母。
 *
 * 【存档迁移口径：零回收】
 * - 老存档 maze_codex_v1 中的 m_* / i_* / mach_* key 原样保留，不删、不重写。
 * - cx_m / cx_all 的 flag、同名成就、已发称号与碎片全部保留：
 *   checkMilestones 首行 getFlag 防重，已解锁的老玩家不会被回收或重复发奖。
 * - 里程碑分母冻结为「塔防可解锁条目」。P2 硬删除后旧条目永远不可能再解锁，
 *   若把 archive 计入 total，cx_all 对新玩家将永久不可达——这是本次修复的核心缺陷。
 */
const CODEX = [
  // ---- 守卫塔：首次建造收录 ----
  { key: 't_arrow', name: '弩塔', glyph: '弩', color: '#6FE3D2', group: 'tower', desc: '造价最低的单体速射塔，开局的第一道防线。' },
  { key: 't_frost', name: '霜塔', glyph: '霜', color: '#8FD8FF', group: 'tower', desc: '命中后减速，把密集的敌群拖进其他塔的射程。' },
  { key: 't_flame', name: '炎塔', glyph: '炎', color: '#FF9F6E', group: 'tower', desc: '溅射伤害，专治扎堆涌来的小怪。' },
  { key: 't_spark', name: '雷塔', glyph: '雷', color: '#FFC15E', group: 'tower', desc: '射程最远、单发最重，用来点杀高血量的石卫。' },
  // ---- 来袭者：首次击杀收录 ----
  { key: 'e_wisp', name: '游魂', glyph: '魂', color: '#B9A7FF', group: 'enemy', desc: '最常见的来袭者，血量中等、赏金稳定。' },
  { key: 'e_swift', name: '迅影', glyph: '影', color: '#7FE8C0', group: 'enemy', desc: '血薄但跑得极快，容易被漏过去。' },
  { key: 'e_brute', name: '石卫', glyph: '卫', color: '#D8856B', group: 'enemy', desc: '慢速高血量，漏一只就掉 2 点核心耐久。' },
  { key: 'e_boss', name: '层主', glyph: '主', color: '#FF6B81', group: 'enemy', desc: '每 10 波出现的巨型来袭者，击杀赏金极高。' },
  // ---- 地宫赐福：波间选中收录 ----
  { key: 'b_torch', name: '火炬', glyph: '炬', color: '#FFD86E', group: 'bless', desc: '全体塔射程 +1 格。' },
  { key: 'b_magnet', name: '磁石', glyph: '磁', color: '#5EE6D8', group: 'bless', desc: '击杀赏金 +15%。' },
  { key: 'b_iron', name: '铁壁', glyph: '壁', color: '#6EE7A0', group: 'bless', desc: '核心立即修复 +3。' },
  { key: 'b_swift', name: '疾风', glyph: '风', color: '#FF9AB8', group: 'bless', desc: '全体塔攻速 +10%（有叠加上限）。' },
  { key: 'b_alch', name: '炼金', glyph: '金', color: '#C9A96E', group: 'bless', desc: '塔造价 -15%。' },
  { key: 'b_greed', name: '贪婪', glyph: '贪', color: '#FFC15E', group: 'bless', desc: '波次结算金币 +30%。' },
  // ---- 守卫纪事：局内里程碑 ----
  { key: 'mech_forge', name: '全局锻造', glyph: '锻', color: '#FFB84D', group: 'mech', desc: '波间花金币锻造，使全体塔伤害永久提升（本局有效）。' },
  { key: 'mech_wave5', name: '守住 5 波', glyph: '5', color: '#7FD8FF', group: 'mech', desc: '首次守住第 5 波。' },
  { key: 'mech_wave10', name: '守住 10 波', glyph: '10', color: '#FF6B81', group: 'mech', desc: '首次守住第 10 波（层主波）。' },
  { key: 'mech_wave15', name: '守住 15 波', glyph: '15', color: '#9B8CFF', group: 'mech', desc: '首次守住第 15 波。' },

  // ---- 迷宫时代档案（已封存）：老存档 key 原样保留，不再新增解锁 ----
  { key: 'm_patrol', name: '巡逻史莱姆', glyph: '巡', color: '#FF9F6E', group: 'archive', desc: '沿固定路线往返巡逻的迷宫原住民。' },
  { key: 'm_chaser', name: '追猎者', glyph: '猎', color: '#FF6B6B', group: 'archive', desc: '进入直线视野后立刻追击。' },
  { key: 'm_shooter', name: '狙击手', glyph: '狙', color: '#C79BFF', group: 'archive', desc: '会朝你发射能量弹。' },
  { key: 'm_boss', name: '迷宫之主', glyph: '王', color: '#FF4D4D', group: 'archive', desc: '限时追逐关的巨型怪物。' },
  { key: 'm_flee', name: '宝藏Boss', glyph: '宝', color: '#FFD86E', group: 'archive', desc: '携带终点钥匙四处逃窜的胆小Boss。' },
  { key: 'm_gatekeeper', name: '守门怪', glyph: '守', color: '#FFB84D', group: 'archive', desc: '守在钥匙附近的哨卫。' },
  { key: 'i_cloak', name: '隐身斗篷', glyph: '隐', color: '#9B8CFF', group: 'archive', desc: '短时间内怪物看不见你。' },
  { key: 'i_freeze', name: '冰冻星', glyph: '冰', color: '#5BC8FF', group: 'archive', desc: '冻结全场怪物与子弹。' },
  { key: 'i_dash', name: '疾风靴', glyph: '速', color: '#FF9F6E', group: 'archive', desc: '移动速度翻倍。' },
  { key: 'i_shield', name: '护盾', glyph: '盾', color: '#6EE7A0', group: 'archive', desc: '抵挡一次碰撞或子弹。' },
  { key: 'i_magnet', name: '磁铁', glyph: '磁', color: '#5EE6D8', group: 'archive', desc: '自动吸附附近的光点。' },
  { key: 'i_flare', name: '照明弹', glyph: '灯', color: '#FF6B6B', group: 'archive', desc: '大幅扩大迷雾中的可见范围。' },
  { key: 'i_decoy', name: '诱饵', glyph: '饵', color: '#FF9EC4', group: 'archive', desc: '放置后怪物改追诱饵。' },
  { key: 'i_hourglass', name: '时光沙漏', glyph: '沙', color: '#B8A9FF', group: 'archive', desc: '被抓的瞬间自动回退 3 步。' },
  { key: 'i_bow', name: '魔弹', glyph: '弹', color: '#C79BFF', group: 'archive', desc: '拾取即装填 3 发，命中视线内最近怪。' },
  { key: 'i_key', name: '终点钥匙', glyph: '钥', color: '#FFD86E', group: 'archive', desc: '拿到它才能打开终点的锁门。' },
  { key: 'i_gem', name: '光点', glyph: '✦', color: '#FFD86E', group: 'archive', desc: '散落迷宫的收集物。' },
  { key: 'mach_portal', name: '传送门', glyph: '门', color: '#7FD8FF', group: 'archive', desc: '成对出现，踩上即瞬移到孪生门。' },
  { key: 'mach_secret', name: '宝藏暗室', glyph: '密', color: '#C9A96E', group: 'archive', desc: '颜色略深的墙藏有暗室。' }
];

const GROUP_LABEL = {
  tower: '守卫塔', enemy: '来袭者', bless: '地宫赐福', mech: '守卫纪事',
  archive: '迷宫时代档案（已封存）'
};
const GROUP_ORDER = ['tower', 'enemy', 'bless', 'mech', 'archive'];
const ACTIVE_GROUPS = ['tower', 'enemy', 'bless', 'mech'];
const WAVE_MARKS = [5, 10, 15];

// 图鉴收集里程碑：id / flag / 称号 / 碎片均沿用老版本，保证老存档成就零回收。
// 判定分母只看塔防可解锁条目（progress().total），archive 不计入。
const MILESTONES = [
  { id: 'cx_m', flag: 'cx_m', need: 'enemy', title: '博物学家', shard: 5, desc: '收录全部来袭者' },
  { id: 'cx_all', flag: 'cx_all', title: '地宫学者', shard: 20, desc: '收录守卫篇全部条目' }
];

const LEGACY_KEYS = CODEX.filter(function (c) { return c.group === 'archive'; })
  .map(function (c) { return c.key; });

function byKey(k) {
  for (let i = 0; i < CODEX.length; i++) {
    if (CODEX[i].key === k) return CODEX[i];
  }
  return null;
}

function byGroup(g) {
  return CODEX.filter(function (c) { return c.group === g; });
}

/**
 * 收集进度。total / got 只统计塔防可解锁条目（里程碑分母）；
 * allTotal / allGot 与 archive 供面板展示历史档案，不参与任何判定。
 */
function progress(getCodexFn) {
  const cx = getCodexFn() || {};
  const out = { total: 0, got: 0, allTotal: CODEX.length, allGot: 0, byGroup: {}, archive: { total: 0, got: 0 } };
  for (let i = 0; i < GROUP_ORDER.length; i++) {
    const g = GROUP_ORDER[i];
    const list = byGroup(g);
    let got = 0;
    for (let j = 0; j < list.length; j++) if (cx[list[j].key]) got++;
    out.byGroup[g] = { total: list.length, got: got };
    out.allGot += got;
    if (g === 'archive') out.archive = { total: list.length, got: got };
    else { out.total += list.length; out.got += got; }
  }
  return out;
}

/**
 * 塔防事件 → 图鉴 key（纯函数，便于无头回归）。
 * 只返回图鉴中真实存在的 key；waveclear 一次可解锁多个波次纪事。
 */
function keysForEvent(ev) {
  if (!ev) return [];
  const d = ev.data || {};
  const t = ev.type;
  const out = [];
  if (t === 'build' && d.type) out.push('t_' + d.type);
  else if (t === 'kill' && d.type) out.push('e_' + d.type);
  else if (t === 'bless' && d.key && d.key !== 'skip') out.push('b_' + d.key);
  else if (t === 'forge') out.push('mech_forge');
  else if (t === 'waveclear' && d.wave) {
    for (let i = 0; i < WAVE_MARKS.length; i++) {
      if (d.wave >= WAVE_MARKS[i]) out.push('mech_wave' + WAVE_MARKS[i]);
    }
  }
  return out.filter(function (k) { return !!byKey(k); });
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
    // 同步解锁同名成就（maze_ach_v1），使图鉴里程碑在成就面板可见
    if (storage.unlockAch) storage.unlockAch(ms.id);
    got.push(ms);
  }
  return got;
}

module.exports = {
  CODEX: CODEX,
  GROUP_LABEL: GROUP_LABEL,
  GROUP_ORDER: GROUP_ORDER,
  ACTIVE_GROUPS: ACTIVE_GROUPS,
  WAVE_MARKS: WAVE_MARKS,
  LEGACY_KEYS: LEGACY_KEYS,
  MILESTONES: MILESTONES,
  byKey: byKey,
  byGroup: byGroup,
  progress: progress,
  keysForEvent: keysForEvent,
  checkMilestones: checkMilestones
};
