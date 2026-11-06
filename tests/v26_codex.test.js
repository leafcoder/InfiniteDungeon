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

  console.log('--- 7b. 里程碑幂等（图鉴历史陈列，不再由迷宫结算触发） ---');
  // 图鉴里程碑仍在 storage/codex 层生效，只是不再由 GameScene 结算触发
  storage.resetProgress();
  ['m_patrol', 'm_chaser', 'm_shooter', 'm_boss', 'm_flee', 'm_gatekeeper'].forEach(k => storage.encounterCodex(k));
  storage.setFlag('cx_m'); // 已发过
  got = codex.checkMilestones(storage);
  T('flag 已置时跳过发奖', got.length === 0);

  console.log('\n===== v26 怪物图鉴: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
