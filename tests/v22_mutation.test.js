// v1.10 地宫异变（每日变异层）回归
const path = require('path');
const ROOT = '/home/zhanglei3/WorkBuddy/2026-10-26-14-05-57/MazeGame/minigame/js';

// ---- wx mock ----
const mem = {};
global.wx = {
  getStorageSync: (k) => mem[k],
  setStorageSync: (k, v) => { mem[k] = v; },
  removeStorageSync: (k) => { delete mem[k]; },
  shareAppMessage: () => {},
  vibrateShort: () => {},
  createRewardedVideoAd: () => ({ show: () => Promise.reject(new Error('no ad')), onClose: () => {}, load: () => {} })
};

const storage = require(path.join(ROOT, 'core/storage.js'));
const mutation = require(path.join(ROOT, 'core/mutation.js'));
const weekly = require(path.join(ROOT, 'core/weekly.js'));
const GameScene = require(path.join(ROOT, 'scene/GameScene.js'));
const HomeScene = require(path.join(ROOT, 'scene/HomeScene.js'));

let pass = 0, fail = 0;
function T(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}

function makeSM() {
  const toasts = [];
  return { W: 375, H: 667, sat: 20, toasts: toasts, toast: (t) => toasts.push(t), sceneModal: () => {}, switch: () => {} };
}
function bootEnter(gs, params) {
  gs.enter(params);
  if (gs.loading) gs.loading.until = 0;
  gs.update();
  return gs;
}

// 日期工具：注入 dailyKey + 生成连续日期
const REAL_KEY = storage.dailyKey.bind(storage);
function setDay(key) { storage.dailyKey = function () { return key }; }
function dateAt(n) { // 2026-11-01 + n 天
  const d = new Date(2026, 10, 1 + n);
  const m = ('0' + (d.getMonth() + 1)).slice(-2);
  const dd = ('0' + d.getDate()).slice(-2);
  return d.getFullYear() + '-' + m + '-' + dd;
}
function findDay(mutKey) { // 找一个落在指定异变档的日期
  for (let i = 0; i < 30; i++) {
    const k = dateAt(i);
    if (mutation.mutationOfDay(k).key === mutKey) return k;
  }
  return null;
}

(async function main() {
  console.log('--- 1. 异变池字段合规 ---');
  T('共 7 档（宁静日 + 6 词缀日）', mutation.MUTS.length === 7);
  const calm = mutation.MUTS[0];
  T('宁静日无词缀无加成', calm.key === 'calm' && calm.mods.length === 0 && calm.bonus === 1);
  const modKeys = weekly.MODS.map(function (m) { return m.key; });
  const others = mutation.MUTS.slice(1);
  T('6 个词缀日均有唯一词缀', others.every(function (m) { return m.mods.length === 1; }));
  T('词缀键全部 ⊆ weekly.MODS（PlayCore 已生效）', others.every(function (m) { return modKeys.indexOf(m.mods[0]) >= 0; }));
  T('词缀日加成均在 1.3~1.5', others.every(function (m) { return m.bonus >= 1.3 && m.bonus <= 1.5; }));
  T('全部档位字段齐备', mutation.MUTS.every(function (m) { return m.name && m.desc && m.color && m.key; }));

  console.log('--- 2. 确定性与覆盖 ---');
  const a = mutation.mutationOfDay('2026-11-05');
  T('同日确定性', JSON.stringify(a) === JSON.stringify(mutation.mutationOfDay('2026-11-05')));
  T('非法日期回退宁静日', mutation.mutationOfDay('bad').key === 'calm');
  const seen = {};
  let allValid = true;
  for (let i = 0; i < 365; i++) {
    const m = mutation.mutationOfDay(dateAt(i));
    seen[m.key] = (seen[m.key] || 0) + 1;
    if (!m || !m.key) allValid = false;
  }
  T('全年 365 天结果恒合法', allValid);
  T('7 档全年均出现（含缓冲档）', Object.keys(seen).length === 7);

  console.log('--- 3. override 与日期注入 ---');
  mutation.setOverride('dark');
  T('override 强制指定档', mutation.mutationOfDay('2026-11-05').key === 'dark');
  mutation.setOverride('');
  const byDate = mutation.mutationOfDay('2026-11-05').key;
  mutation.setOverride('dark');
  mutation.setOverride('nope');
  T('非法 override 被忽略（回退按日档）', mutation.mutationOfDay('2026-11-05').key === byDate);

  const hasteDay = findDay('haste');
  const calmDay = findDay('calm');
  T('可找到疾走日与宁静日样本', !!hasteDay && !!calmDay);
  setDay(hasteDay);
  T('today() 跟随 dailyKey 注入', mutation.today().key === 'haste');
  setDay(REAL_KEY());

  console.log('--- 4. applyBonus 纯函数 ---');
  T('无异变原样返回', mutation.applyBonus(5, null) === 5 && mutation.applyBonus(5, calm) === 5);
  T('疾走日 ×1.4', mutation.applyBonus(10, mutation.MUTS[2]) === 14);
  T('夜幕日 ×1.5 四舍五入', mutation.applyBonus(7, mutation.MUTS[3]) === 11);
  T('0 光尘不放大出负/NaN', mutation.applyBonus(0, mutation.MUTS[3]) === 0);

  console.log('--- 5. GameScene 挂载与豁免 ---');
  setDay(hasteDay);
  const gs = new GameScene(makeSM());
  bootEnter(gs, { level: 5, mode: 'level' });
  T('普通关自动挂今日异变', gs.mut && gs.mut.key === 'haste');
  T('mods 含 haste（PlayCore 生效）', gs.mods.indexOf('haste') >= 0);
  T('开局 banner 提示异变', !!gs.banner && gs.banner.text.indexOf('疾走日') >= 0);

  const gs2 = new GameScene(makeSM());
  bootEnter(gs2, { level: 5, mode: 'level', mods: ['fog'], code: 'XYZ' });
  T('口令关词缀优先（异变不覆盖）', gs2.mut === null && gs2.mods.length === 1 && gs2.mods[0] === 'fog');

  const gs3 = new GameScene(makeSM());
  bootEnter(gs3, { level: 85, mode: 'level' });
  T('Boss 追逐关（L80+）不受异变', gs3.mut === null);

  const gs4 = new GameScene(makeSM());
  bootEnter(gs4, { mode: 'daily', level: 30 });
  T('每日挑战不受异变', gs4.mut === null);

  const gs5 = new GameScene(makeSM());
  bootEnter(gs5, { mode: 'survival', level: 30 });
  T('生存模式不受异变', gs5.mut === null);

  setDay(calmDay);
  const gs6 = new GameScene(makeSM());
  bootEnter(gs6, { level: 5, mode: 'level' });
  T('宁静日 mods 为空且无异变 banner', gs6.mods.length === 0 && (!gs6.banner || gs6.banner.text.indexOf('⚗') < 0));

  console.log('--- 6. HomeScene 异变横幅 ---');
  setDay(hasteDay);
  const hs = new HomeScene(makeSM());
  hs.enter();
  T('词缀日显示异变横幅', !!hs.mutRect && hs.mut.key === 'haste');
  const dr = hs.dotsRect();
  T('圆点行锚点被横幅下推（不重叠）', dr.y >= hs.mutRect.y + hs.mutRect.h);
  setDay(calmDay);
  const hs2 = new HomeScene(makeSM());
  hs2.enter();
  T('宁静日不占版面', hs2.mutRect === null);
  setDay(REAL_KEY());

  console.log('\n通过 ' + pass + ' / 失败 ' + fail);
  if (fail > 0) process.exit(1);
})();
