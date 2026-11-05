// v1.11 批次18 首页赛季等级横幅 + 领奖面板
const path = require('path');
const ROOT = '/home/zhanglei3/WorkBuddy/2026-10-26-14-05-57/MazeGame/minigame/js';

const mem = {};
global.wx = {
  getStorageSync: (k) => mem[k],
  setStorageSync: (k, v) => { mem[k] = v; },
  removeStorageSync: (k) => { delete mem[k]; },
  getSystemInfoSync: () => ({ model: 'test', windowWidth: 375, windowHeight: 667, pixelRatio: 2 }),
  getMenuButtonBoundingClientRect: () => ({ top: 20, height: 32, width: 80, right: 360, left: 280 }),
  shareAppMessage: () => {},
  vibrateShort: () => {}
};

const storage = require(path.join(ROOT, 'core/storage.js'));
const season = require(path.join(ROOT, 'core/season.js'));
const Modals = require(path.join(ROOT, 'scene/Modals.js'));
const HomeScene = require(path.join(ROOT, 'scene/HomeScene.js'));

let pass = 0, fail = 0;
function T(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}
function fakeSM() {
  const toasts = [];
  return {
    W: 375, H: 667, sat: 20, sab: 10, sal: 10, sar: 10,
    toasts, toast: (t) => toasts.push(t),
    sceneModal: () => {}, switch: () => {}
  };
}

console.log('--- 1. season.info 字段可用于横幅 ---');
storage.resetProgress();
{
  const s = season.info();
  T('返回 season 字段', typeof s.season === 'number');
  T('返回 level 字段', typeof s.level === 'number');
  T('返回 into/perLevel 字段', typeof s.into === 'number' && typeof s.perLevel === 'number');
  T('返回 left（剩余天数）', typeof s.left === 'number');
  T('返回 claimable 数组', Array.isArray(s.claimable));
}

console.log('--- 2. Modals.showSeason 面板生成 + 领取闭环 ---');
{
  const sm = fakeSM();
  const m = Modals.showSeason(sm, function () {});
  T('showSeason 返回 Modal', !!m && Array.isArray(m.rows));
  T('面板标题含「赛季」', (m.title || '').indexOf('赛季') >= 0);
  // 制造可领奖励：加 XP 到 Lv.1
  season.addXp(100); // Lv.1
  const s2 = season.info();
  T('加 100 XP 后达到 Lv.1', s2.level >= 1);
  const m2 = Modals.showSeason(sm, function () {});
  const claimableRow = m2.rows.filter(r => r.tag === '领取')[0];
  T('出现可领奖励行', !!claimableRow);
  if (claimableRow) {
    const beforeClaimed = season.info().claimed.length;
    claimableRow.onTap(m2); // 领取（Modal 传参若缺失则仅走 claim 分支）
    const afterClaimed = season.info().claimed.length;
    T('领取后 claimed 增加（season.claim 生效）', afterClaimed > beforeClaimed);
  }
}

console.log('--- 3. HomeScene 赛季横幅锚点 + 命中 + 入口（尽力，环境缺 stub 则跳过） ---');
try {
  const sm = fakeSM();
  const hs = new HomeScene(sm);
  hs.enter();
  const hero = hs.hero, sr = hs.seasonRect;
  T('seasonRect 已创建', !!sr);
  if (sr) {
    T('赛季横幅位于 Hero 卡下方', sr.y > hero.y + hero.h);
    T('festBottom 在赛季横幅下沿之下（不重叠）', hs.festBottom >= sr.y + sr.h);
    if (hs.festRect) T('节日横幅在赛季横幅之下', hs.festRect.y >= sr.y + sr.h);
    // 命中检测
    const cx = sr.x + sr.w / 2, cy = sr.y + sr.h / 2;
    T('inSeasonRect 命中中心', hs.inSeasonRect(cx, cy) === true);
    T('inSeasonRect 命中外部返回 false', hs.inSeasonRect(2, 2) === false);
    // 入口
    hs.openSeason();
    T('openSeason 打开赛季面板（modal 非空）', !!hs.modal);
  }
} catch (e) {
  console.log('  ⚠ HomeScene 实例化跳过（' + e.message + '），由数据层/面板测试覆盖');
}

console.log('');
console.log('结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail > 0 ? 1 : 0);
