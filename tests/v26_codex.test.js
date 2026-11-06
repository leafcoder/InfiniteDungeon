// v1.4 地宫图鉴「守卫篇」回归：塔防主进度 / 事件收录 / 里程碑分母冻结 / 老存档零回收
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
const active = () => codex.CODEX.filter(c => c.group !== 'archive');
const progress = () => codex.progress(() => storage.getCodex());

async function main() {
  storage.resetProgress();

  console.log('--- 1. 条目定义与分组 ---');
  T('塔防条目 18 条（塔4+敌4+赐福6+纪事4）',
    active().length === 18 &&
    codex.byGroup('tower').length === 4 && codex.byGroup('enemy').length === 4 &&
    codex.byGroup('bless').length === 6 && codex.byGroup('mech').length === 4);
  T('迷宫时代档案 19 条，key 与旧版完全一致',
    codex.byGroup('archive').length === 19 && codex.LEGACY_KEYS.length === 19 &&
    ['m_patrol', 'i_bow', 'i_gem', 'mach_portal', 'mach_secret'].every(k => !!codex.byKey(k)));
  T('分组顺序：4 个塔防组 + archive 收尾',
    codex.GROUP_ORDER.join(',') === 'tower,enemy,bless,mech,archive' &&
    codex.ACTIVE_GROUPS.length === 4);
  T('byKey 未知 key 返回 null', codex.byKey('nope') === null);
  T('里程碑 id / 称号 / 碎片沿用老版本（零回收）',
    codex.MILESTONES.map(m => m.id).join(',') === 'cx_m,cx_all' &&
    codex.MILESTONES[0].title === '博物学家' && codex.MILESTONES[0].shard === 5 &&
    codex.MILESTONES[1].title === '地宫学者' && codex.MILESTONES[1].shard === 20);

  console.log('--- 2. progress：主进度分母冻结在塔防条目 ---');
  let p = progress();
  T('空存档主进度 0/18（不含档案）', p.got === 0 && p.total === 18);
  T('全量 0/37 + 档案 0/19', p.allGot === 0 && p.allTotal === 37 && p.archive.got === 0 && p.archive.total === 19);
  storage.encounterCodex('t_arrow');
  storage.encounterCodex('t_arrow'); // 重复遭遇只算收录一次
  storage.encounterCodex('m_patrol'); // 老 key 只进档案区
  p = progress();
  T('塔防收录 1 条，档案收录 1 条互不混淆',
    p.got === 1 && p.byGroup.tower.got === 1 && p.archive.got === 1 && p.allGot === 2);

  console.log('--- 3. 事件 → 图鉴 key 映射（纯函数） ---');
  T('build → t_arrow', codex.keysForEvent({ type: 'build', data: { type: 'arrow' } }).join(',') === 't_arrow');
  T('kill → e_boss', codex.keysForEvent({ type: 'kill', data: { type: 'boss' } }).join(',') === 'e_boss');
  T('bless → b_torch', codex.keysForEvent({ type: 'bless', data: { key: 'torch' } }).join(',') === 'b_torch');
  T('bless skip 不收录', codex.keysForEvent({ type: 'bless', data: { key: 'skip' } }).length === 0);
  T('forge → mech_forge', codex.keysForEvent({ type: 'forge', data: {} }).join(',') === 'mech_forge');
  T('waveclear 15 波一次解锁 3 条纪事',
    codex.keysForEvent({ type: 'waveclear', data: { wave: 15 } }).join(',') === 'mech_wave5,mech_wave10,mech_wave15');
  T('waveclear 7 波只解锁 5 波纪事',
    codex.keysForEvent({ type: 'waveclear', data: { wave: 7 } }).join(',') === 'mech_wave5');
  T('未知事件 / 未知 type 返回空（不写脏 key）',
    codex.keysForEvent({ type: 'hint', data: {} }).length === 0 &&
    codex.keysForEvent({ type: 'build', data: { type: 'nope' } }).length === 0 &&
    codex.keysForEvent(null).length === 0);

  console.log('--- 4. 里程碑：新玩家可达、档案不污染分母 ---');
  storage.resetProgress();
  codex.LEGACY_KEYS.forEach(k => storage.encounterCodex(k));
  T('只收满 19 条档案不触发任何里程碑（分母冻结）', codex.checkMilestones(storage).length === 0);
  codex.byGroup('enemy').forEach(e => storage.encounterCodex(e.key));
  let got = codex.checkMilestones(storage);
  T('收满 4 种来袭者触发博物学家', got.length === 1 && got[0].id === 'cx_m');
  T('发碎片 5 + 称号「博物学家」',
    storage.getShards() === 5 && storage.getCosmetics().titles.indexOf('博物学家') >= 0);
  T('cx_m 同名成就已解锁', storage.achList().find(a => a.id === 'cx_m').unlocked);
  active().forEach(e => storage.encounterCodex(e.key));
  p = progress();
  T('收满守卫篇 18/18', p.got === 18 && p.total === 18);
  got = codex.checkMilestones(storage);
  T('触发地宫学者里程碑（碎片共 25）', got.length === 1 && got[0].id === 'cx_all' && storage.getShards() === 25);
  T('发称号「地宫学者」', storage.getCosmetics().titles.indexOf('地宫学者') >= 0);
  T('重复检查不重复发奖（flags 防重）', codex.checkMilestones(storage).length === 0 && storage.getShards() === 25);

  console.log('--- 5. 存档迁移：老存档零回收 ---');
  storage.resetProgress();
  codex.LEGACY_KEYS.forEach(k => storage.encounterCodex(k));
  storage.unlockAch('cx_m');
  storage.unlockAch('cx_all');
  storage.setFlag('cx_m');
  storage.setFlag('cx_all');
  storage.unlockCosmetic('titles', '博物学家');
  storage.unlockCosmetic('titles', '地宫学者');
  const legacy = storage.getCodex();
  T('老存档 19 个旧 key 原样保留、未删未重写',
    codex.LEGACY_KEYS.every(k => legacy[k] > 0));
  p = progress();
  T('档案区 19/19，主进度 0/18 但里程碑分母仍是 18',
    p.archive.got === 19 && p.archive.total === 19 && p.got === 0 && p.total === 18);
  T('已置 flag 保持', storage.getFlag('cx_m') && storage.getFlag('cx_all'));
  T('已解锁成就保持', storage.achList().filter(a => a.id.indexOf('cx_') === 0).every(a => a.unlocked));
  T('已发称号保持',
    storage.getCosmetics().titles.indexOf('博物学家') >= 0 &&
    storage.getCosmetics().titles.indexOf('地宫学者') >= 0);
  const shardBefore = storage.getShards();
  T('checkMilestones 不回收也不重复发奖',
    codex.checkMilestones(storage).length === 0 && storage.getShards() === shardBefore);

  console.log('--- 6. showCodex 弹窗结构 ---');
  storage.resetProgress();
  storage.encounterCodex('t_arrow');
  const sm = makeSM();
  const md = Modals.showCodex(sm, null);
  T('标题「地宫图鉴」', md.title === '地宫图鉴');
  T('首行同时展示守卫篇进度与已封存档案',
    String(md.lines[0].t).indexOf('守卫篇 1/18') === 0 &&
    String(md.lines[0].t).indexOf('迷宫时代档案 0/19（已封存）') >= 0);
  const headers = md.rows.filter(r => r.header);
  T('5 个分组头 + 里程碑头 + 收集与成就头 = 7', headers.length === 7);
  T('含「迷宫时代档案（已封存）」分组头', headers.some(h => String(h.header).indexOf('迷宫时代档案（已封存）') >= 0));
  const locked = md.rows.filter(r => r.title === '？？？');
  T('锁定条目 36 条（37 条 - 已收录 1 条）', locked.length === 36);
  T('锁定文案区分档案与塔防',
    locked.some(r => String(r.sub).indexOf('已封存') >= 0) &&
    locked.some(r => String(r.sub).indexOf('守卫局内') >= 0));
  T('已收录条目显示 ×N', md.rows.some(r => r.title && r.title.indexOf('弩塔') >= 0 && String(r.tag).indexOf('×') === 0));
  T('伙伴行已换成真实生效的守卫战绩',
    !!md.rows.find(r => r.title && r.title.indexOf('守卫战绩') === 0) &&
    !md.rows.some(r => (r.title || '').indexOf('伙伴') >= 0));
  T('图鉴含成就入口且可点', !!md.rows.find(r => (r.title || '').indexOf('成就 ') === 0 && typeof r.onTap === 'function'));
  T('图鉴含旅人手记入口且可点（历史档案）',
    !!md.rows.find(r => (r.title || '').indexOf('旅人手记') === 0 && typeof r.onTap === 'function'));
  const md2 = Modals.showAch(sm, null);
  T('成就面板回归纯成就清单（标题「成就」）', md2.title === '成就');

  console.log('\n===== v26 守卫篇图鉴: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
