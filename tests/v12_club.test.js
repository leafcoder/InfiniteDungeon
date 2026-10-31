// 游戏圈入口回归：可用性检测 / 位置计算 / 创建-销毁生命周期 / 显隐同步
const path = require('path');
const ROOT = '/home/zhanglei3/WorkBuddy/2026-10-26-14-05-57/MazeGame/minigame/js';

const mem = {};
global.wx = {
  getStorageSync: (k) => mem[k],
  setStorageSync: (k, v) => { mem[k] = v; },
  removeStorageSync: (k) => { delete mem[k]; }
};

const club = require(path.join(ROOT, 'ui/gameclub.js'));

let pass = 0, fail = 0;
function T(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}

console.log('--- 1. 可用性检测 ---');
global.wx.createGameClubButton = () => ({});
T('wx.createGameClubButton 存在 → 可用', club.isAvail() === true);
delete global.wx.createGameClubButton;
T('缺失 API → 不可用', club.isAvail() === false);
const savedWx = global.wx; global.wx = undefined;
T('wx 整体缺失 → 不可用且安全', club.isAvail() === false && club.show({ left: 0, top: 0, width: 28, height: 28 }) === false);
global.wx = savedWx;

console.log('--- 2. rectFor 位置计算 ---');
{
  // u=1：图标行最左枚 x=191（W=375 时），光尘胶囊 30..114
  const r1 = club.rectFor(1, { x: 30, y: 58, w: 84, h: 28 }, 191);
  T('u=1 与图标行同线（left=156/top=58/28x28）',
    r1 && r1.left === 156 && r1.top === 58 && r1.width === 28 && r1.height === 28);
  // 窄屏：空间不足（136-7-28=101 < 114+6）→ null
  T('与光尘胶囊重叠 → null', club.rectFor(1, { x: 30, y: 58, w: 84, h: 28 }, 136) === null);
  // u=1.5：d=42、gap=11、垂直对齐胶囊中心
  const r2 = club.rectFor(1.5, { x: 45, y: 87, w: 126, h: 42 }, 286);
  T('u=1.5 缩放正确（42x42 / left=233 / top=87）',
    r2 && r2.width === 42 && r2.height === 42 && r2.left === 233 && r2.top === 87);
}

console.log('--- 3. 创建-显隐-销毁生命周期 ---');
{
  const calls = [];
  global.wx.createGameClubButton = (o) => {
    calls.push(JSON.parse(JSON.stringify(o)));
    return { hide() { calls.push('hide'); }, show() { calls.push('show'); }, destroy() { calls.push('destroy'); } };
  };
  T('show 创建成功', club.show({ left: 10, top: 20, width: 28, height: 28 }) === true && club.exists());
  T('参数透传（type=image / icon=light / style 原样）',
    calls[0].type === 'image' && calls[0].icon === 'light' &&
    calls[0].style.left === 10 && calls[0].style.top === 20 &&
    calls[0].style.width === 28 && calls[0].style.height === 28);
  club.hide();  T('hide 调用按钮', calls[1] === 'hide');
  club.reveal(); T('reveal 调用按钮', calls[2] === 'show');
  club.show({ left: 1, top: 1, width: 28, height: 28 });
  T('重复 show 先销毁旧按钮', calls[3] === 'destroy' && calls[4].style.left === 1 && club.exists());
  club.destroy(); T('destroy 调用并置空', calls[5] === 'destroy' && !club.exists());
  club.hide(); club.reveal(); // 无按钮时安全
  T('无按钮时 hide/reveal 安全', calls[6] === undefined);
  // 异常兜底
  global.wx.createGameClubButton = () => { throw new Error('unsupported client'); };
  T('创建抛异常 → 返回 false', club.show({ left: 0, top: 0, width: 28, height: 28 }) === false && !club.exists());
  global.wx.createGameClubButton = () => undefined;
  T('创建返回 undefined → 返回 false', club.show({ left: 0, top: 0, width: 28, height: 28 }) === false);
}

console.log('--- 4. HomeScene 集成：enter 创建 / update 同步 / exit 销毁 ---');
{
  let hid = false, shown = false, destroyed = false;
  global.wx.createGameClubButton = () => ({
    hide() { hid = true; }, show() { shown = true; }, destroy() { destroyed = true; }
  });
  const HomeScene = require(path.join(ROOT, 'scene/HomeScene.js'));
  const sm = {
    W: 375, H: 667, sat: 20, sab: 0, capB: 60, trans: null,
    toast: () => {}, sceneModal: () => {}, switch: () => {}
  };
  const hs = new HomeScene(sm);
  T('enter 前未创建', !club.exists());
  hs.enter({});
  T('enter 后按钮已创建且显示', club.exists());
  hs.modal = { update() {}, dirty: false };
  hs.update(0.016);
  T('弹窗打开 → 隐藏', hid && !shown);
  hs.modal = null; hid = false; shown = false;
  hs.update(0.016);
  T('弹窗关闭 → 恢复显示', shown && !hid);
  sm.trans = { phase: 'out' }; hid = false; shown = false;
  hs.update(0.016);
  T('转场期间 → 隐藏', hid && !shown);
  sm.trans = null;
  hs.adSim = { update() { return true; }, draw() {} };
  hid = false; shown = false;
  hs.update(0.016);
  T('广告模拟 → 隐藏', hid && !shown);
  hs.adSim = null;
  hs.exit();
  T('exit 销毁按钮', destroyed && !club.exists());
  hs.update(0.016); // _club 已置空，不得抛错
  T('exit 后 update 安全', true);
}

console.log('\n通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
