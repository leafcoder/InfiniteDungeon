// 游戏圈入口回归：可用性检测 / 位置计算（文字胶囊自适应宽）/ 创建-销毁生命周期 / 显隐同步
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
T('wx 整体缺失 → 不可用且安全', club.isAvail() === false && club.show({ left: 0, top: 0, width: 28, height: 28, fontSize: 10 }) === false);
global.wx = savedWx;

console.log('--- 2. rectFor 位置计算（文字胶囊，宽度自适应） ---');
{
  const pill1 = { x: 30, y: 58, w: 84, h: 28 };
  const r1 = club.rectFor(1, pill1, 191);
  T('u=1 满宽胶囊（left=120/top=58/64x28）',
    r1 && r1.left === 120 && r1.top === 58 && r1.width === 64 && r1.height === 28 && r1.fontSize === 10);
  // W=360 典型窄屏：空间收窄但 ≥44u，应仍创建
  const r2 = club.rectFor(0.96, { x: 29, y: 56, w: 81, h: 27 }, 184);
  T('u=0.96 窄屏自适应（61x27 / left=116）',
    r2 && r2.width === 61 && r2.height === 27 && r2.left === 116 && r2.top === 56 && r2.fontSize === 10);
  T('空间不足（u=1 iconsLeft=136）→ null', club.rectFor(1, pill1, 136) === null);
  T('宽度低于 44u 下限（iconsLeft=158）→ null', club.rectFor(1, pill1, 158) === null);
  const r3 = club.rectFor(1.5, { x: 45, y: 87, w: 126, h: 42 }, 286);
  T('u=1.5 缩放正确（95x42 / left=180 / top=87 / fontSize=15）',
    r3 && r3.width === 95 && r3.height === 42 && r3.left === 180 && r3.top === 87 && r3.fontSize === 15);
}

console.log('--- 3. 创建-显隐-销毁生命周期 ---');
{
  const calls = [];
  global.wx.createGameClubButton = (o) => {
    calls.push(JSON.parse(JSON.stringify(o)));
    return { hide() { calls.push('hide'); }, show() { calls.push('show'); }, destroy() { calls.push('destroy'); } };
  };
  const rect = { left: 120, top: 58, width: 64, height: 28, fontSize: 10 };
  T('show 创建成功', club.show(rect) === true && club.exists());
  const arg = calls[0];
  T('参数透传（type=text / text=游戏圈 / 白字深底胶囊）',
    arg.type === 'text' && arg.text === '游戏圈' &&
    arg.style.left === 120 && arg.style.top === 58 &&
    arg.style.width === 64 && arg.style.height === 28 &&
    arg.style.fontSize === 10 && arg.style.color === '#FFFFFF' &&
    arg.style.backgroundColor === '#2A2745' && arg.style.textAlign === 'center');
  T('胶囊样式（圆角=高/2 / 行高=高 / 带描边）',
    arg.style.borderRadius === 14 && arg.style.lineHeight === 28 &&
    arg.style.borderWidth === 1 && !!arg.style.borderColor);
  club.hide();  T('hide 调用按钮', calls[1] === 'hide');
  club.reveal(); T('reveal 调用按钮', calls[2] === 'show');
  club.show({ left: 1, top: 1, width: 44, height: 24, fontSize: 10 });
  T('重复 show 先销毁旧按钮', calls[3] === 'destroy' && calls[4].style.left === 1 && club.exists());
  club.destroy(); T('destroy 调用并置空', calls[5] === 'destroy' && !club.exists());
  club.hide(); club.reveal(); // 无按钮时安全
  T('无按钮时 hide/reveal 安全', calls[6] === undefined);
  // 异常兜底
  global.wx.createGameClubButton = () => { throw new Error('unsupported client'); };
  T('创建抛异常 → 返回 false', club.show(rect) === false && !club.exists());
  global.wx.createGameClubButton = () => undefined;
  T('创建返回 undefined → 返回 false', club.show(rect) === false);
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
