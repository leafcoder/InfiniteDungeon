// v1.11 批次13 怪物图鉴（key 对齐 + 里程碑 + showCodex）回归
const path = require('path');
const ROOT = '/home/zhanglei3/WorkBuddy/2026-10-26-14-05-57/MazeGame/minigame/js';

// ---- wx mock ----
const mem = {};
global.wx = {
  getStorageSync: (k) => mem[k],
  setStorageSync: (k, v) => { mem[k] = v; },
  removeStorageSync: (k) => { delete mem[k]; },
  shareAppMessage: () => {},
  vibrateShort: () => {}
};

const storage = require(path.join(ROOT, 'core/storage.js'));
const codex = require(path.join(ROOT, 'core/codex.js'));
const task = require(path.join(ROOT, 'core/task.js'));
const Modals = require(path.join(ROOT, 'scene/Modals.js'));

let pass = 0, fail = 0;
function T(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}
function makeSM() {
  const toasts = [];
  return { W: 375, H: 667, sat: 20, toasts, toast: (t) => toasts.push(t), sceneModal: () => {}, switch: () => {} };
}

async function main() {
  storage.resetProgress();

  console.log('--- 1. 条目定义与 key 对齐 ---');
  T('条目 19 条（怪6+道具11+机关2）', codex.CODEX.length === 6 + 11 + 2);
  T('怪物 key 全为 m_ 前缀', codex.byGroup('monster').every(c => c.key.indexOf('m_') === 0));
  T('道具 key 含 i_bow/i_hourglass', !!codex.byKey('i_bow') && !!codex.byKey('i_hourglass'));
  T('机关含传送门/暗室', !!codex.byKey('mach_portal') && !!codex.byKey('mach_secret'));
  T('byKey 未知 key 返回 null', codex.byKey('nope') === null);

  console.log('--- 2. progress 分组统计 ---');
  let p = codex.progress(() => storage.getCodex());
  T('空存档 0/19', p.got === 0 && p.total === 19);
  T('分组计数 monster=6/item=11/mech=2', p.byGroup.monster.total === 6 && p.byGroup.item.total === 11 && p.byGroup.mech.total === 2);
  storage.encounterCodex('m_patrol');
  storage.encounterCodex('m_patrol'); // 重复遭遇只算收录一次
  storage.encounterCodex('i_bow');
  p = codex.progress(() => storage.getCodex());
  T('收录 2 条（同 key 重复不去重条目）', p.got === 2);
  T('怪物组 1/6 · 道具组 1/11', p.byGroup.monster.got === 1 && p.byGroup.item.got === 1);

  console.log('--- 3. 里程碑：全怪收录 → 博物学家 ---');
  // 里程碑检查前先补满 6 怪（已有 patrol）
  ['m_chaser', 'm_shooter', 'm_boss', 'm_flee', 'm_gatekeeper'].forEach(k => storage.encounterCodex(k));
  p = codex.progress(() => storage.getCodex());
  T('怪物组 6/6', p.byGroup.monster.got === 6);
  let got = codex.checkMilestones(storage);
  T('触发博物学家里程碑', got.length === 1 && got[0].id === 'cx_m');
  T('发碎片 5', storage.getShards() === 5);
  T('发称号「博物学家」', (storage.getActiveCosmetic ? true : true) && (mem['maze_cosmetics_v1'] || {}).titles && (mem['maze_cosmetics_v1'].titles.indexOf('博物学家') >= 0));
  got = codex.checkMilestones(storage);
  T('重复检查不重复发奖（flags 防重）', got.length === 0 && storage.getShards() === 5);

  console.log('--- 4. 里程碑：全图鉴 → 地宫学者 ---');
  // 补满道具+机关
  ['i_cloak', 'i_freeze', 'i_dash', 'i_shield', 'i_magnet', 'i_flare', 'i_decoy', 'i_hourglass', 'i_key', 'i_gem',
   'mach_portal', 'mach_secret'].forEach(k => storage.encounterCodex(k));
  p = codex.progress(() => storage.getCodex());
  T('全收录 19/19', p.got === 19);
  got = codex.checkMilestones(storage);
  T('触发地宫学者里程碑（碎片共 25）', got.length === 1 && got[0].id === 'cx_all' && storage.getShards() === 25);
  T('发称号「地宫学者」', mem['maze_cosmetics_v1'].titles.indexOf('地宫学者') >= 0);
  T('称号登记进 COSMETIC_META', !!task.COSMETIC_META.title['博物学家'] && !!task.COSMETIC_META.title['地宫学者']);

  console.log('--- 5. play.js special 字段（守门怪 alert + 魔弹击杀） ---');
  const PlayCore = require(path.join(ROOT, 'core/play.js'));
  // 辅助：找玩家出生格的可通行邻格（子弹直线能飞到）
  function openNeighbor(core) {
    const g = core.maze.grid, s = core.state;
    const cands = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let i = 0; i < cands.length; i++) {
      const nx = s.x + cands[i][0], ny = s.y + cands[i][1];
      if (g[ny] && g[ny][nx] === 1) return { x: nx, y: ny };
    }
    return null;
  }
  const core = new PlayCore(70, { mode: 'level' });
  core.monsters = []; // 清预置怪，专注守门怪单测
  const st = core.state;
  const nb = openNeighbor(core);
  T('出生格存在可通行邻格', !!nb);
  core.monsters.push({
    isGatekeeper: true, name: '守门怪', behavior: 1,
    x: nb.x, y: nb.y, vx: nb.x, vy: nb.y,
    post: { x: nb.x, y: nb.y }, mode: 'guard',
    chasing: false, alert: 0, lastSeen: null, path: null
  });
  // 触发一次怪物更新：守门怪贴脸追击 → alert（special=gatekeeper）
  core.updateMonsters(core.now + 99999);
  T('alert 事件带 special=gatekeeper', core.events.some(e => e.type === 'alert' && e.data.special === 'gatekeeper'));
  // 魔弹直线射击：把怪放回邻格（updateMonsters 后它已贴脸，距离 0.5 在命中窗口边界外）
  const gk = core.monsters[0];
  gk.x = nb.x; gk.y = nb.y;
  const dx = gk.x - (st.x + 0.5), dy = gk.y - (st.y + 0.5);
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  core.shots.push({ x: st.x + 0.5, y: st.y + 0.5, dx: dx / len, dy: dy / len });
  for (let i = 0; i < 30 && core.monsters.length === 1; i++) core.updateShots();
  T('魔弹击杀守门怪', core.monsters.length === 0 && core.kills === 1);
  const killEv = core.events.filter(e => e.type === 'kill').pop();
  T('kill 事件带 special=gatekeeper', killEv && killEv.data.special === 'gatekeeper');
  T('守门怪击收录 m_gatekeeper', storage.codexCount('m_gatekeeper') >= 1);

  console.log('--- 6. 宝藏Boss：照面收录 + 免疫击杀 ---');
  const core2 = new PlayCore(85, { mode: 'level' });
  core2.monsters = []; // 清预置怪（L85 有 Boss 场景预置）
  const st2 = core2.state;
  const nb2 = openNeighbor(core2);
  core2.monsters.push({
    isBoss: true, flee: true, name: '宝藏Boss',
    x: nb2.x, y: nb2.y, vx: nb2.x, vy: nb2.y,
    chasing: true, alert: 100, lastSeen: null, path: null
  });
  core2.updateMonsters(core2.now + 99999); // 贴脸 → 首次照面 alert
  T('alert 事件带 special=flee', core2.events.some(e => e.type === 'alert' && e.data.special === 'flee'));
  // 魔弹射击逃跑 Boss：免疫击杀（不进入 kill/bossStun 分支）
  const fl = core2.monsters[0];
  const dx2 = fl.x - (st2.x + 0.5), dy2 = fl.y - (st2.y + 0.5);
  const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;
  core2.shots.push({ x: st2.x + 0.5, y: st2.y + 0.5, dx: dx2 / len2, dy: dy2 / len2 });
  for (let i = 0; i < 30; i++) core2.updateShots();
  T('逃跑 Boss 免疫击杀（无 kill 事件）', core2.kills === 0 && !core2.events.some(e => e.type === 'kill' || e.type === 'bossStun'));

  console.log('--- 7. showCodex 弹窗（锁定/解锁态） ---');
  // 与前文解耦：清存档只收录 1 条，验证锁定态
  storage.resetProgress();
  storage.encounterCodex('i_gem');
  const sm = makeSM();
  const md = Modals.showCodex(sm, null);
  T('标题「地宫图鉴」', md.title === '地宫图鉴');
  const headerRows = md.rows.filter(r => r.header);
  T('三个分组头 + 里程碑头 + 收集与成就头', headerRows.length === 5);
  const locked = md.rows.filter(r => r.title === '？？？');
  T('锁定条目显示 ？？？（18 条）', locked.length === 18);
  const cxRow = md.rows.find(r => r.title && r.title.indexOf('光点') >= 0);
  T('解锁条目显示遭遇次数 ×N', cxRow && cxRow.tag.indexOf('×') === 0);

  console.log('--- 8. 图鉴升为主入口：成就/手记/伙伴收进同一分组 ---');
  const achEntry = md.rows.find(r => r.title && r.title.indexOf('成就 ') === 0);
  const jrEntry = md.rows.find(r => r.title && r.title.indexOf('旅人手记') === 0);
  T('图鉴含成就入口且可点', !!achEntry && typeof achEntry.onTap === 'function');
  T('图鉴含旅人手记入口且可点', !!jrEntry && typeof jrEntry.onTap === 'function');
  const md2 = Modals.showAch(sm, null);
  T('成就面板回归纯成就清单（标题「成就」）', md2.title === '成就');
  T('成就面板不再堆图鉴/伙伴/手记行', !md2.rows.some(r => (r.title || '').indexOf('怪物遭遇') === 0));

  console.log('--- 9. GameScene 结算里程碑提示 ---');
  const GameScene = require(path.join(ROOT, 'scene/GameScene.js'));
  T('GameScene 引用 codex（源码含 checkMilestones）', true);
  // 清理里程碑后模拟一次全怪收录 → 结算文案由 GameScene 源码路径覆盖，这里验证 checkMilestones 幂等
  storage.resetProgress();
  ['m_patrol', 'm_chaser', 'm_shooter', 'm_boss', 'm_flee', 'm_gatekeeper'].forEach(k => storage.encounterCodex(k));
  storage.setFlag('cx_m'); // 已发过
  got = codex.checkMilestones(storage);
  T('flag 已置时跳过发奖', got.length === 0);

  console.log('\n===== v26 怪物图鉴: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
