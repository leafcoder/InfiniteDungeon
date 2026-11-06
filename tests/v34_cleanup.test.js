// v1.4 功能清理回归：首页入口精简 / 迷宫弹窗下线 / 入口层级纠正
// 目的：把「删了什么、留了什么」固化成断言，防止冗余入口日后悄悄回潮
const path = require('path');
const fs = require('fs');
const ROOT = '/home/zhanglei3/WorkBuddy/2026-10-26-14-05-57/MazeGame/minigame/js';

const mem = {};
let shareCount = 0;
global.wx = {
  getStorageSync: (k) => mem[k],
  setStorageSync: (k, v) => { mem[k] = v; },
  removeStorageSync: (k) => { delete mem[k]; },
  getSystemInfoSync: () => ({ model: 'test', windowWidth: 375, windowHeight: 667, pixelRatio: 2 }),
  getMenuButtonBoundingClientRect: () => ({ top: 20, height: 32, width: 80, right: 360, left: 280 }),
  shareAppMessage: () => { shareCount++; },
  vibrateShort: () => {}
};

const storage = require(path.join(ROOT, 'core/storage.js'));
const analytics = require(path.join(ROOT, 'core/analytics.js'));
const task = require(path.join(ROOT, 'core/task.js'));
const checkin = require(path.join(ROOT, 'core/checkin.js'));
const Modals = require(path.join(ROOT, 'scene/Modals.js'));
const HomeScene = require(path.join(ROOT, 'scene/HomeScene.js'));

let pass = 0, fail = 0;
function T(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}
function fakeSM() {
  return {
    W: 375, H: 667, sat: 20, sab: 10, sal: 10, sar: 10,
    toast: () => {}, sceneModal: () => {}, switch: () => {}
  };
}
function src(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

// 与真实日期解耦：模拟「已签到」空档期。节日 / 异变模块已物理删除，无需再注入。
storage.resetProgress();
storage.setTutorialSeen();
const realChk = checkin.info;
checkin.info = () => ({ signed: true, streak: 0, total: 0, todayDust: 20, nextMs: null, ms: [], allDone: false });

console.log('--- 1. 首页入口结构：Dock 6 项 / 顶栏 3 图标 + 1 徽章 ---');
const hs = new HomeScene(fakeSM());
hs.enter();
T('Dock 收敛为 6 项（布局骨架保留）', hs.dock.length === 6);
T('Dock 不再含「排行」', !hs.dock.some(d => d.key === 'rank'));
T('6 项玩法/经济/留存入口结构保留', ['daily','weekly','supply','survival','endless','task'].every(k => hs.dock.some(d => d.key === k)));
T('实际可见仅补给/守卫/任务 3 项', hs.dock.filter(d => !d.hidden).map(d => d.key).join(',') === 'supply,survival,task');
T('顶栏热区收敛为 4 个（3 图标钮 + 今日徽章）', hs.iconBtns.length === 4);
T('今日徽章已创建并挂进 iconBtns（命中自动覆盖）', !!hs.todayBtn && hs.iconBtns.indexOf(hs.todayBtn) >= 0);
T('顶栏不再有分享/挑战码独立按钮', !hs.iconBtns.some(b => b.label === '📤' || b.label === '🔑'));

console.log('--- 2. 常驻横幅下线，纵向空间回收 ---');
T('seasonRect 已移除', !hs.seasonRect);
T('drawSeasonBanner 方法已删除', typeof hs.drawSeasonBanner === 'undefined');
T('inSeasonRect 命中方法已删除', typeof hs.inSeasonRect === 'undefined');
T('节日 / 异变横幅恒为空', hs.festRect === null && hs.mutRect === null);
T('空档期圆点行回到 Hero 卡下方', Math.abs(hs.dotsRect().y - (hs.hero.y + hs.hero.h + 10 * hs.u)) < 0.01);
T('空档期网格 y 回到原位（较清理前回收约 48u）', Math.abs(hs.gz.y - (hs.hero.y + hs.hero.h + 28 * hs.u)) < 0.01);

console.log('--- 3. 删除项不残留 ---');
T('showRank 已从 Modals 导出移除', typeof Modals.showRank === 'undefined');
const beforeShare = shareCount;
hs.openEntry('share');
T('分享入口下线后不再调用 wx.shareAppMessage', shareCount === beforeShare);
const beforeModal = hs.modal;
hs.openEntry('rank');
T('排行入口下线后无副作用（不抛错、不压弹窗）', hs.modal === beforeModal);
const settings = Modals.showSettings(fakeSM(), function () {});
T('设置页不再显示「任务数据（本机）」行', !settings.rows.some(r => (r.title || '').indexOf('任务数据') >= 0));
T('设置页不再显示「埋点上报」行', !settings.rows.some(r => (r.title || '').indexOf('埋点上报') >= 0));
T('挑战码行已随迷宫玩法删除', !settings.rows.some(r => (r.title || '').indexOf('挑战码') >= 0));
T('_enterGame 闸门已删除', typeof hs._enterGame === 'undefined');
T('首页无 switch(game) 调用', src('scene/HomeScene.js').indexOf("this.sm.switch('game'") === -1);

console.log('--- 4. 迷宫专属弹窗全部下线 ---');
T('每日 / 周挑战弹窗已删除', typeof Modals.showDaily === 'undefined' && typeof Modals.showWeekly === 'undefined');
T('节日 / 无尽 / 轮回弹窗已删除', typeof Modals.showFestival === 'undefined' && typeof Modals.showEndless === 'undefined' && typeof Modals.showNgPlus === 'undefined');
T('挑战码 / 剪贴板入口已删除', typeof Modals.showCode === 'undefined' && typeof Modals.pasteCode === 'undefined');
T('Modals 不再 require 已删模块', !/require\('\.\.\/core\/(maze|play|weekly|festival|mutation|challenge|endless|ngplus|mercy)'\)/.test(src('scene/Modals.js')));

console.log('--- 5. 入口纠正：图鉴升主入口 / 成绩就近展示 ---');
hs.openEntry('ach');
T('顶栏 📖 直达图鉴（标题「地宫图鉴」）', !!hs.modal && hs.modal.title === '地宫图鉴');
const cx = Modals.showCodex(fakeSM(), null);
T('图鉴内可点进成就', !!cx.rows.find(r => r.title && r.title.indexOf('成就 ') === 0 && typeof r.onTap === 'function'));
T('图鉴内可点进旅人手记', !!cx.rows.find(r => r.title && r.title.indexOf('旅人手记') === 0 && typeof r.onTap === 'function'));
T('旅人手记常量仍在（历史陈列）', src('scene/Modals.js').indexOf('const JOURNAL_ZONES') >= 0);
const ach = Modals.showAch(fakeSM(), null);
T('成就面板回归纯成就清单（标题「成就」）', ach.title === '成就');
T('成就面板不再堆图鉴/伙伴/手记行', !ach.rows.some(r => (r.title || '').indexOf('怪物遭遇') === 0));
T('成就面板承接 PB 摘要（最速/生存波数）', (ach.lines || []).some(l => String(l.t || '').indexOf('最速') >= 0));
const seasonModal = Modals.showSeason(fakeSM(), function () {});
T('赛季面板提供签到回看（今日徽章一处收口）', seasonModal.rows.some(r => (r.title || '').indexOf('每日签到') === 0));

console.log('--- 6. 底盘与数据层未被误删 ---');
T('补给/皮肤/设置/图鉴/签到/赛季面板仍导出', ['showSupply','showSkin','showSettings','showCodex','showCheckin','showSeason','showIntro'].every(k => typeof Modals[k] === 'function'));
T('埋点抽象层仍可用', typeof analytics.summary === 'function' && typeof analytics.track === 'function');
T('本机任务漏斗仍可用', typeof task.trackSummary === 'function');

// 还原注入，避免污染同进程其他逻辑
checkin.info = realChk;

console.log('');
console.log('结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail > 0 ? 1 : 0);
