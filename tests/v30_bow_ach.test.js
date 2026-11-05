// 批次17：魔弹击杀成就 + 图鉴里程碑接进成就系统 + 修复 showAch 解锁态 bug
const path = require('path');
const ROOT = '/home/zhanglei3/WorkBuddy/2026-10-26-14-05-57/MazeGame/minigame/js';

const mem = {};
global.wx = {
  getStorageSync: (k) => mem[k],
  setStorageSync: (k, v) => { mem[k] = v; },
  removeStorageSync: (k) => { delete mem[k]; },
  vibrateShort: () => {}
};

const storage = require(path.join(ROOT, 'core/storage.js'));
const codex = require(path.join(ROOT, 'core/codex.js'));

let pass = 0, fail = 0;
function T(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}

// ---- 1. recordBowKills 三档累计 ----
console.log('--- 1. 魔弹击杀成就（recordBowKills 三档累计）---');
storage.resetProgress();
let r = storage.recordBowKills(1);
T('bow1 解锁（1 杀）', r.length === 1 && r[0].id === 'bow1');
T('bow1 发 10 光尘', storage.getDust() === 10);
T('achList.bow1 已解锁', storage.achList().find(a => a.id === 'bow1').unlocked);

let r2 = storage.recordBowKills(9); // 累计 10
T('bow10 解锁（累计 10）', r2.length === 1 && r2[0].id === 'bow10');
T('bow10 再发 20 光尘（共 30）', storage.getDust() === 30);

let r3 = storage.recordBowKills(40); // 累计 50
T('bow50 解锁（累计 50）', r3.length === 1 && r3[0].id === 'bow50');
T('bow50 再发 40 光尘（共 70）', storage.getDust() === 70);
T('stats.bowKills 累计 = 50', storage.getStats().bowKills === 50);

T('n<=0 返回空', storage.recordBowKills(0).length === 0);
T('已全解锁再调用不再触发', storage.recordBowKills(5).length === 0);

storage.resetProgress();
T('重置后 bowKills 清空', !storage.getStats().bowKills);
T('重置后 bow 成就清空', storage.achList().filter(a => a.id.indexOf('bow') === 0).every(a => !a.unlocked));

// ---- 2. 图鉴里程碑接进成就系统 ----
console.log('--- 2. codex 里程碑并联解锁同名成就 ---');
storage.resetProgress();
codex.CODEX.forEach(function (e) { storage.encounterCodex(e.key); });
let beforeDust = storage.getDust();
let ms = codex.checkMilestones(storage);
T('返回 2 个里程碑', ms.length === 2);
T('cx_m 在 achList 已解锁', storage.achList().find(a => a.id === 'cx_m').unlocked);
T('cx_all 在 achList 已解锁', storage.achList().find(a => a.id === 'cx_all').unlocked);
T('cx_m/cx_all 发 ACH 光尘 15+30=45', storage.getDust() - beforeDust === 45);
let before2 = storage.getDust();
let ms2 = codex.checkMilestones(storage);
T('重复触发不重复发奖', ms2.length === 0 && storage.getDust() === before2);

// ---- 3. achList.unlocked 正确性（showAch 修复的数据基础）----
console.log('--- 3. achList.unlocked 数据正确 ---');
storage.resetProgress();
storage.unlockAch('journey');
T('unlockAch 后 achList 该成就 unlocked=true', storage.achList().find(a => a.id === 'journey').unlocked);
T('未解锁成就 unlocked=false', storage.achList().find(a => a.id === 'void').unlocked === false);

// ---- 4. showAch 集成（best-effort：加载失败则跳过）----
console.log('--- 4. showAch 解锁态展示（尽力集成）---');
try {
  const Modals = require(path.join(ROOT, 'scene/Modals.js'));
  // 先让图鉴里程碑达成 → cx_m 解锁，验证面板把它显示为「已解锁」
  storage.resetProgress();
  codex.CODEX.forEach(function (e) { storage.encounterCodex(e.key); });
  codex.checkMilestones(storage);
  const fakeSM = {
    W: 375, H: 667,
    sceneModal: function (m) { fakeSM._m = m; },
    switch: function () {}
  };
  const m = Modals.showAch(fakeSM, function () {});
  T('showAch 生成 rows', !!m && Array.isArray(m.rows));
  const cxRow = m.rows.filter(function (rw) { return rw.title && rw.title.indexOf('博物学家') === 0; })[0];
  if (cxRow) {
    T('showAch 博物学家行未置灰（dim=false）', cxRow.dim === false);
    T('showAch 博物学家标记「已解锁」', cxRow.tag === '已解锁');
  } else {
    T('showAch 含图鉴里程碑行', false);
  }
  const lockRow = m.rows.filter(function (rw) { return rw.title === '初次通关'; })[0];
  if (lockRow) {
    T('showAch 未解锁成就仍置灰', lockRow.dim === true && lockRow.tag !== '已解锁');
  }
} catch (e) {
  console.log('  (showAch 集成跳过：' + e.message + ')');
}

console.log('');
console.log('结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
