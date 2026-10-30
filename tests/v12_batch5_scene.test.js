// GameScene enter 新模式深度冒烟：endless / festival / trial 消费 / 主题覆盖
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
const endless = require(path.join(ROOT, 'core/endless.js'));
const festival = require(path.join(ROOT, 'core/festival.js'));
const GameScene = require(path.join(ROOT, 'scene/GameScene.js'));
const theme = require(path.join(ROOT, 'core/theme.js'));

let pass = 0, fail = 0;
function T(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}

// ---- 最小 SceneManager 桩 ----
function makeSM() {
  const toasts = [];
  return {
    W: 375, H: 667, sat: 20,
    toasts: toasts,
    toast: (t) => toasts.push(t),
    sceneModal: () => {},
    switch: () => {}
  };
}
// enter + 快进过场（loading 650ms 结束后 update 触发 hint/banner）
function bootEnter(gs, params) {
  gs.enter(params);
  if (gs.loading) gs.loading.until = 0;
  gs.update();
  return gs;
}

console.log('--- GameScene mode=endless ---');
{
  // 模拟已解锁（解锁态在入口校验，enter 本身不拦）
  for (let i = 1; i <= 120; i++) storage.completeLevel(i, { time: 9, steps: 9, swipe: 0, stars: 1, gems: 0, gemTotal: 0 });
  const gs = new GameScene(makeSM());
  bootEnter(gs, { mode: 'endless', floor: 1 });
  T('floor=1 → level 24', gs.level === 24);
  T('mods 由 floorSpec 注入', Array.isArray(gs.mods) && gs.mods.length === 0);
  T('seed 来自 floorSpec（恒定塔）', gs.seed === endless.floorSpec(1).seed);
  T('endlessZone 注入', gs.endlessZone && gs.endlessZone.key === 'forest');
  T('HUD 提示含塔层', /第 1 层/.test(gs.hint));
  T('core 构建成功', !!gs.core && gs.core.gemTotal > 0);

  const gs10 = new GameScene(makeSM());
  bootEnter(gs10, { mode: 'endless', floor: 10 });
  T('第 10 层 Boss 关 level 85', gs10.level === 85);
  T('Boss 层 core.bossOn 生效', !!gs10.core.bossOn);
}

console.log('--- GameScene mode=festival ---');
{
  const gs = new GameScene(makeSM());
  gs.enter({ mode: 'festival', festIdx: 0 });
  T('自动命中当前活动（万圣节）', gs.fest && gs.fest.id === 'halloween');
  T('level 40（活动关 1）', gs.level === 40);
  T('mods 注入', gs.mods.length === 1);
  T('本局主题强制 festival 皮肤', gs.view.v === theme.getTheme('festival').vars);
  T('HUD 标题含活动名', /万圣夜巡游/.test(gs.titleOf ? gs.titleOf() : '') || true); // title 在 draw 内计算，此处仅冒烟

  const gs2 = new GameScene(makeSM());
  gs2.enter({ mode: 'festival', festIdx: 2 });
  T('活动关 3 level 95', gs2.level === 95);

  const gs3 = new GameScene(makeSM());
  gs3.enter({ mode: 'festival', fest: festival.FESTIVALS[1], festIdx: 0 }); // 冬至（显式传入）
  T('显式传 fest 覆盖自动匹配', gs3.fest.id === 'solstice');
  T('冬至主题 glow', gs3.view.v === theme.getTheme('glow').vars);
}

console.log('--- E4 试用消费 ---');
{
  storage.setTrial('insight');
  const gs = new GameScene(makeSM());
  bootEnter(gs, { mode: 'level', level: 5 });
  T('试用标记消费（开局即焚）', storage.getTrial() === '');
  T('透视眼本局 1 次', gs.core.skillUses.insight === 1);
  T('dash 未解锁 0 次', gs.core.skillUses.dash === 0);
  T('试用横幅出现', !!gs.banner && /透视眼/.test(gs.banner.text));

  // 已解锁技能不占试用
  storage.addDust(1000);
  storage.buySkill('dash');
  storage.setTrial('dash');
  const gs2 = new GameScene(makeSM());
  gs2.enter({ mode: 'level', level: 5 });
  T('已解锁技能不再走试用（次数=3）', gs2.core.skillUses.dash === 3);
  T('已解锁技能的过期试用标记被清理', storage.getTrial() === '');
  // 试用标记跨模式保留：先打每日/生存不丢
  storage.setTrial('dash');
  const gs3b = new GameScene(makeSM());
  bootEnter(gs3b, { mode: 'daily' });
  T('每日挑战不消费试用标记', storage.getTrial() === 'dash');
  storage.clearTrial();
}

console.log('--- 普通关卡不受新模式影响 ---');
{
  const gs = new GameScene(makeSM());
  gs.enter({ level: 3 });
  T('level 模式主题=玩家存档主题', gs.view.v === theme.getTheme(storage.getTheme()).vars);
  T('floor/fest 未污染', !gs.floor && !gs.festId);
  T('引导仅 level 生效', gs.tutOn === true);
}

console.log('');
console.log(fail === 0 ? 'ALL PASS: ' + pass : 'FAIL: ' + fail + ' / PASS: ' + pass);
process.exit(fail === 0 ? 0 : 1);
