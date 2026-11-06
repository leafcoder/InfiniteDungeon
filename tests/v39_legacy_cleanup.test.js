// v1.4 遗留项收尾回归：假功能下线 / 特性字段清理 / 赛季 XP 口径 / 死实例移除 / 图鉴接线
const path = require('path');
const fs = require('fs');
const ROOT = '/home/zhanglei3/WorkBuddy/2026-10-26-14-05-57/MazeGame/minigame/js';

const mem = {};
global.wx = {
  getStorageSync: (k) => mem[k],
  setStorageSync: (k, v) => { mem[k] = v; },
  removeStorageSync: (k) => { delete mem[k]; },
  getSystemInfoSync: () => ({ pixelRatio: 2, windowWidth: 375, windowHeight: 667, safeArea: { top: 20, bottom: 657 }, statusBarHeight: 20, platform: 'devtools' }),
  getMenuButtonBoundingClientRect: () => ({ top: 24, bottom: 56, left: 281, right: 368, width: 87, height: 32 }),
  createCanvas: () => ({ width: 750, height: 1334, getContext: () => ctxStub() }),
  createGameClubButton: () => ({ onTap: () => {}, destroy: () => {} }),
  onTouchStart: () => {}, onTouchMove: () => {}, onTouchEnd: () => {},
  vibrateShort: () => {}, shareAppMessage: () => {},
  createInnerAudioContext: () => ({ play: () => {}, stop: () => {}, destroy: () => {} }),
  createRewardedVideoAd: () => ({ onClose: () => {}, onError: () => {}, show: () => {}, load: () => {} })
};
global.requestAnimationFrame = () => 0;

function ctxStub() {
  const noop = () => {};
  return new Proxy({}, {
    get: function (t, k) {
      if (k === 'canvas') return { width: 375, height: 667 };
      if (k === 'measureText') return () => ({ width: 40 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
      if (k === 'getImageData') return () => ({ data: [] });
      return noop;
    },
    set: function () { return true; }
  });
}
function makeSM() {
  return {
    W: 375, H: 667, sat: 20, sab: 10, sal: 10, sar: 10,
    cap: { top: 24, bottom: 56, left: 281, right: 368, width: 87, height: 32 }, capB: 62,
    scenes: {}, toasts: [], switched: [],
    register: function (n, s) { this.scenes[n] = s; },
    toast: function (t) { this.toasts.push(t); },
    switch: function (n, p) { this.switched.push({ name: n, params: p }); },
    sceneModal: () => {}, drawOverlay: () => {}
  };
}

let pass = 0, fail = 0;
function T(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}
function src(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

const storage = require(path.join(ROOT, 'core/storage.js'));
const codex = require(path.join(ROOT, 'core/codex.js'));
const mode = require(path.join(ROOT, 'core/mode.js'));
const season = require(path.join(ROOT, 'core/season.js'));
const task = require(path.join(ROOT, 'core/task.js'));
const analytics = require(path.join(ROOT, 'core/analytics.js'));
const Modals = require(path.join(ROOT, 'scene/Modals.js'));
const HomeScene = require(path.join(ROOT, 'scene/HomeScene.js'));
const TowerScene = require(path.join(ROOT, 'scene/TowerScene.js'));

console.log('--- 1. 遗留1：补给站假功能下线 / 旅人手记封存 ---');
const supply = Modals.showSupply(makeSM(), null);
const supplyHeaders = supply.rows.filter(r => r.header).map(r => r.header);
T('补给站只剩「皮肤 / 英雄」两个真实生效分组', supplyHeaders.join(',') === '皮肤,英雄');
T('补给站不再售卖天赋 / 道具强化 / 技能',
  !supply.rows.some(r => (r.title || '').indexOf('拾光') >= 0 || (r.title || '').indexOf('隐身衣') >= 0));
const modalsSrc = src('scene/Modals.js');
T('Modals 已清掉 UPG_FX / UPG_ICON / UPG_COL 死常量',
  modalsSrc.indexOf('UPG_FX') === -1 && modalsSrc.indexOf('UPG_ICON') === -1 && modalsSrc.indexOf('UPG_COL') === -1);
T('Modals 不再引用 TALENT_META / SKILL_META',
  modalsSrc.indexOf('TALENT_META') === -1 && modalsSrc.indexOf('SKILL_META') === -1);
T('storage 侧老存档 API 完整保留（零回收）',
  ['buyTalent', 'getTalents', 'getSkills', 'setTrial', 'fxDuration', 'gemValueMul', 'journalList', 'getPartner']
    .every(k => typeof storage[k] === 'function'));
T('TALENT_META 文案标注迷宫时代已封存',
  Object.keys(storage.TALENT_META).every(k => storage.TALENT_META[k].desc.indexOf('迷宫时代') >= 0));
const jr = Modals.showJournal(makeSM(), null);
T('旅人手记标注「已封存」且仍可构造',
  !!jr && jr.lines.some(l => String(l.t || '').indexOf('已封存') >= 0));
T('JOURNAL_ZONES 常量与老存档分区名保留',
  modalsSrc.indexOf("const JOURNAL_ZONES = ['入门森林'") >= 0);
T('图鉴手记入口文案已去迷宫承诺', modalsSrc.indexOf('每分区首通与制霸各解锁一段') === -1);

console.log('--- 2. 遗留2：HERO_TRAITS 失效数值字段清理 ---');
T('12 个英雄特性只剩 name / desc',
  Object.keys(storage.HERO_TRAITS).length === 12 &&
  Object.keys(storage.HERO_TRAITS).every(k => Object.keys(storage.HERO_TRAITS[k]).sort().join(',') === 'desc,name'));
T('getHeroTrait 仍返回风味文案', (function () {
  const tr = storage.getHeroTrait();
  return !!tr && typeof tr.name === 'string' && typeof tr.desc === 'string';
})());
const stSrc = src('core/storage.js');
T('fxDuration / gemValueMul 不再读英雄数值字段', stSrc.indexOf('heroMul') === -1);
T('HERO_TRAITS 注释明确「不提供数值加成」', stSrc.indexOf('不提供任何数值加成') >= 0);

console.log('--- 3. 遗留3：赛季 XP 口径集中（数值零变化） ---');
T('SEASON_XP 表存在且 depth 与 WAVE_RULES.recordXp 同源',
  !!mode.SEASON_XP && mode.SEASON_XP.depth === mode.WAVE_RULES.recordXp && mode.SEASON_XP.depth === 30);
T('六项数值与旧版一致（20/40/10/5/15/30）', (function () {
  const x = mode.SEASON_XP;
  return x.clearLegacy === 20 && x.dailyLegacy === 40 && x.checkin === 10 &&
    x.club === 5 && x.taskClaim === 15 && x.depth === 30;
})());
const coreFiles = ['core/storage.js', 'core/checkin.js', 'core/task.js', 'core/season.js', 'core/mode.js'];
T('五个核心文件均无 addXp(数字) / xp + 数字 硬编码',
  coreFiles.every(f => !/addXp\(\s*\d+\s*\)|s\.xp\s*\+\s*\d+/.test(src(f))));
T('业务代码统一从 mode.SEASON_XP 取值',
  coreFiles.filter(f => src(f).indexOf('mode.SEASON_XP') >= 0).length >= 4);
T('mutationXp 死钩子已删除（依赖的 mutation 模块已物理删除）',
  typeof season.mutationXp === 'undefined' && src('core/season.js').indexOf('mutationXp') === -1);

console.log('--- 4. 遗留4：首页 heroSc / gridSc 死实例移除 ---');
const homeSrc = src('scene/HomeScene.js');
T('不再 require ScrollView',
  homeSrc.indexOf("require('../ui/ScrollView')") === -1 && homeSrc.indexOf('new ScrollView') === -1);
T('heroSc / gridSc 字段与调用全部清除',
  homeSrc.indexOf('heroSc') === -1 && homeSrc.indexOf('gridSc') === -1);
const hs = new HomeScene(makeSM());
hs.enter();
T('布局锚点 gz / cols / cw / chh / gridAnim 全部保留',
  !!hs.gz && hs.cols === 5 && typeof hs.cw === 'number' &&
  typeof hs.chh === 'number' && hs.gridAnim === 1);
let homeErr = '';
try {
  hs.modal = null;
  hs.eto = 1;
  hs.update(0.016);
  hs.draw(ctxStub());
} catch (e) { homeErr = e.name + ': ' + e.message; }
T('首页 update + 全量 draw 无运行期异常', homeErr === '');

console.log('--- 5. 遗留5：塔防事件驱动图鉴收录 + 结算里程碑 ---');
const tsSrc = src('scene/TowerScene.js');
T('TowerScene 已接入 codex 与 keysForEvent',
  tsSrc.indexOf("require('../core/codex')") >= 0 && tsSrc.indexOf('codex.keysForEvent') >= 0);
T('结算链调用 checkMilestones', tsSrc.indexOf('codex.checkMilestones(storage)') >= 0);
storage.resetProgress();
const ts = new TowerScene(makeSM());
ts.enter({ seed: 12345 });
T('enter 初始化 _codexSeen', !!ts._codexSeen && Object.keys(ts._codexSeen).length === 0);
ts.handleEvent({ type: 'build', data: { type: 'arrow' } });
ts.handleEvent({ type: 'build', data: { type: 'arrow' } });
T('build 收录 t_arrow 且同 key 每局只写一次存储', storage.getCodex()['t_arrow'] === 1);
ts.handleEvent({ type: 'kill', data: { type: 'boss' } });
T('kill 收录 e_boss', storage.getCodex()['e_boss'] === 1);
ts.handleEvent({ type: 'bless', data: { key: 'skip' } });
T('跳过赐福不写图鉴', !storage.getCodex()['b_torch']);
ts.handleEvent({ type: 'forge', data: {} });
ts.handleEvent({ type: 'waveclear', data: { wave: 15, bonus: 60, offers: [] } });
T('forge + 15 波一次收录 4 条纪事',
  storage.getCodex()['mech_forge'] === 1 && storage.getCodex()['mech_wave5'] === 1 &&
  storage.getCodex()['mech_wave10'] === 1 && storage.getCodex()['mech_wave15'] === 1);
T('图鉴主进度随局内事件真实推进',
  codex.progress(() => storage.getCodex()).got === 6);

// 结算：造一个「塔防条目全收录但 flag 未置」的存档，验证里程碑在结算时发放
storage.resetProgress();
codex.CODEX.filter(c => c.group !== 'archive').forEach(c => storage.encounterCodex(c.key));
const ts2 = new TowerScene(makeSM());
ts2.enter({ seed: 777 });
ts2.core.reached = 20;
ts2.core.wave = 21;
ts2.core.kills = 60;
ts2.core.leaks = 2;
// 合法塔对象：draw 需要 t.type / x / y / lv，空对象会让 TOWER_DEFS[undefined] 崩
ts2.core.towers = [
  { type: 'arrow', x: 1, y: 1, lv: 1 },
  { type: 'frost', x: 2, y: 1, lv: 2 },
  { type: 'spark', x: 3, y: 1, lv: 3 }
];
ts2.core.forgeLv = 0;
ts2.showResult();
T('结算触发 cx_m / cx_all 两个图鉴里程碑',
  storage.getFlag('cx_m') && storage.getFlag('cx_all'));
T('结算弹窗含图鉴里程碑达成行',
  !!ts2.modal && ts2.modal.lines.some(l => String(l.t).indexOf('图鉴里程碑达成') >= 0));
T('td_end 埋点携带 cxNew=2', (function () {
  const ev = analytics.loadBuffer().filter(x => x.e === 'td_end').pop();
  return !!ev && ev.p.cxNew === 2;
})());
T('结算幂等：重复调用不重复发里程碑', (function () {
  const before = storage.getShards();
  ts2.showResult();
  return storage.getShards() === before;
})());
let towerErr = '';
try { ts2.draw(ctxStub()); } catch (e) { towerErr = e.name + ': ' + e.message; }
if (towerErr) console.log('    [诊断] draw error: ' + towerErr);
T('塔防场景全量 draw 无运行期异常', towerErr === '');

console.log('\n===== v39 遗留项收尾: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
if (fail > 0) process.exit(1);
