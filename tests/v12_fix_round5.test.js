// 第五轮反馈回归：重置进度完整化（清光尘/皮肤/英雄/天赋/技能/成就/图鉴等，保留广告解锁与设置）
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

let pass = 0, fail = 0;
function T(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}

console.log('--- 铺垫：制造各类存档数据 ---');
{
  storage.addDust(500);
  storage.completeLevel(10, { stars: 3, gems: 20, gemTotal: 20, time: 60, steps: 40, swipe: 3, perfect: true });
  storage.unlockHero('mage'); storage.setHero('mage');
  storage.setTheme('sakura');
  storage.buyTalent('gather', 1); // 花 20 光尘
  storage.buySkill('dash');
  storage.unlockAch('journey');
  storage.recordExplore(5, 90, 'gold');
  storage.addCodeHist('MZ00007Bl');
  storage.setTrial('insight');
  storage.adUnlockTo(30);
  storage.setSetting('sound', false);

  T('前置：光尘 > 0', storage.getDust() > 0);
  T('前置：已解锁 > 1 关', storage.getProgress().unlocked > 1);
  T('前置：英雄 = mage', storage.getHero() === 'mage');
  T('前置：主题 = sakura', storage.getTheme() === 'sakura');
  T('前置：天赋已购', (storage.getTalents().gather || 0) >= 1);
  T('前置：技能已解锁', !!storage.getSkills().dash);
  T('前置：探索度有记录', storage.zoneExplore(0) !== null);
  T('前置：广告解锁 30', storage.getAdUnlocked() === 30);
  T('前置：设置已改', storage.getSetting('sound', true) === false);
}

console.log('--- 执行 resetProgress ---');
storage.resetProgress();

{
  T('光尘归零', storage.getDust() === 0);
  T('通关记录清空', Object.keys(storage.getProgress().completed || {}).length === 0);
  T('进度不超过广告解锁派生（≤31）', storage.getProgress().unlocked <= 31);
  T('英雄回默认 rover', storage.getHero() === 'rover');
  T('英雄解锁记录清空', !storage.heroAvailable('mage'));
  T('主题回默认 classic', storage.getTheme() === 'classic');
  T('天赋清空（gather 回 0 级）', storage.getTalents().gather === 0);
  T('技能清空（dash 未解锁）', !storage.getSkills().dash);
  T('成就清空', storage.achList().every(a => !a.unlocked));
  T('探索度清空（分区 done=0）', storage.zoneExplore(0).done === 0);
  T('口令历史清空', storage.getCodeHist().length === 0);
  T('试用标记清空', !storage.getTrial());
  T('广告解锁保留（30）', storage.getAdUnlocked() === 30);
  T('系统设置保留（sound=false）', storage.getSetting('sound', true) === false);
}

console.log('--- 幂等：重复 resetProgress 不抛错 ---');
{
  let ok = true;
  try { storage.resetProgress(); storage.resetProgress(); } catch (e) { ok = false; console.log('    ' + e.message); }
  T('重复重置安全', ok);
}

console.log('');
console.log('结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
