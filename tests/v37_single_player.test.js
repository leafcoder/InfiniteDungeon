// v1.4 硬删除 + 纯单机回归
// 用户两项决策：① 暂不接后端，只做单机游戏；② 确认不回退。
// 本文件把「迷宫玩法层已物理删除 / 塔防不依赖 maze / 零后端能力 / 老存档兼容」固化为断言。
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
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }
function allJs() {
  const out = [];
  const walk = function (dir) {
    fs.readdirSync(dir).forEach(function (f) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (/\.js$/.test(f)) out.push(fs.readFileSync(p, 'utf8'));
    });
  };
  walk(ROOT);
  return out.join('\n');
}

console.log('--- 1. 迷宫玩法层已物理删除 ---');
const removed = [
  'core/maze.js', 'core/play.js', 'core/mercy.js', 'core/endless.js',
  'core/weekly.js', 'core/festival.js', 'core/mutation.js', 'core/challenge.js',
  'core/ngplus.js', 'scene/GameScene.js', 'render/board.js'
];
removed.forEach(function (f) { T('已删除 ' + f, !exists(f)); });
T('共删除 11 个迷宫专属文件', removed.length === 11);
T('源码不再 require 任何已删模块', !/require\([^)]*\/(maze|play|mercy|endless|weekly|festival|mutation|challenge|ngplus|GameScene|board)['"]?\)/.test(allJs()));
T('源码不再有 switch(game) 调用', !/this\.sm\.switch\('game'/.test(allJs()));

console.log('--- 2. 保留模块完整（外围系统 / 老存档兼容） ---');
const kept = [
  'core/mapgen.js', 'core/tower.js', 'core/mode.js', 'core/storage.js', 'core/task.js',
  'core/season.js', 'core/checkin.js', 'core/codex.js', 'core/theme.js', 'core/ad.js',
  'core/analytics.js', 'scene/HomeScene.js', 'scene/TowerScene.js', 'scene/Modals.js',
  'scene/TaskPanel.js', 'scene/SceneManager.js', 'main.js'
];
kept.forEach(function (f) { T('保留 ' + f, exists(f)); });
const storage = require(path.join(ROOT, 'core/storage.js'));
const Modals = require(path.join(ROOT, 'scene/Modals.js'));
T('storage.completeLevel 保留（老存档进度不回收）', typeof storage.completeLevel === 'function');
T('codex.js 保留（图鉴历史陈列，里程碑不失效）', typeof require(path.join(ROOT, 'core/codex.js')).checkMilestones === 'function');
T('showCodex 仍可构造', !!Modals.showCodex(makeSM(), null));
T('showJournal 仍可构造（JOURNAL_ZONES 未丢）', !!Modals.showJournal(makeSM(), null));

console.log('--- 3. mapgen 解耦：塔防不再依赖 maze.js ---');
const mapgen = require(path.join(ROOT, 'core/mapgen.js'));
const TowerCore = require(path.join(ROOT, 'core/tower.js'));
T('mapgen 导出 4 个纯算法', ['generateMaze', 'bfsPath', 'getOpenDirs', 'getLevelConfig'].every(k => typeof mapgen[k] === 'function'));
T('mapgen 零 wx 依赖', src('core/mapgen.js').indexOf('wx.') === -1);
T('tower.js 改 require mapgen', src('core/tower.js').indexOf("require('./mapgen')") >= 0);
T('tower.js 不再 require maze', src('core/tower.js').indexOf("require('./maze')") === -1);
const m1 = mapgen.generateMaze(30, 1.5, 12345);
const m2 = mapgen.generateMaze(30, 1.5, 12345);
T('同种子生成逐格一致（可复现）', JSON.stringify(m1.grid) === JSON.stringify(m2.grid));
T('栅格 29x43 且全图连通', m1.W === 29 && m1.H === 43 && !!mapgen.bfsPath(m1.grid, m1.start, m1.end));
T('bfsPath 不含起点、含终点', (function () {
  const p = mapgen.bfsPath(m1.grid, m1.start, m1.end);
  if (!p || !p.length) return false;
  const notStart = !(p[0].x === m1.start.x && p[0].y === m1.start.y);
  const atEnd = p[p.length - 1].x === m1.end.x && p[p.length - 1].y === m1.end.y;
  return notStart && atEnd;
})());
const seeds = [1, 12345, 99991, 2026, 777];
const dists = seeds.map(function (s) {
  const c = new TowerCore(30, { seed: s, aspect: 1.5 });
  return c.stats().pathDist;
});
T('5 个种子路径距离全部落在 20–28 格', dists.every(d => d >= 20 && d <= 28));
T('塔防地图解耦后路径长度未漂移', dists[0] === 26 && dists[1] === 27 && dists[2] === 28);
T('每个种子都有合法塔位', seeds.every(function (s) { return new TowerCore(30, { seed: s, aspect: 1.5 }).slots.length > 0; }));

console.log('--- 4. 唯一玩法：main.js 只注册 home / tower ---');
const mainSrc = src('main.js');
T('register 调用恰好 2 处', (mainSrc.match(/sm\.register\(/g) || []).length === 2);
T('不再注册 game 场景', mainSrc.indexOf("register('game'") === -1);
T('注册 home 与 tower', mainSrc.indexOf("register('home'") >= 0 && mainSrc.indexOf("register('tower'") >= 0);
T('不再导出回退开关', typeof require(path.join(ROOT, 'core/mode.js')).setMazeEnabled === 'undefined');
const main = require(path.join(ROOT, 'main.js'));
let bootOk = true;
try { main.boot(); } catch (e) { bootOk = false; console.log('    boot error: ' + e.message); }
T('main.boot() 无头启动不抛错', bootOk);

console.log('--- 5. 首页运行时：唯一入口指向塔防 ---');
const HomeScene = require(path.join(ROOT, 'scene/HomeScene.js'));
const sm = makeSM();
const hs = new HomeScene(sm);
hs.enter();
hs.draw(ctxStub());
T('主 CTA 为「▶ 开始守卫」', hs.goBtn.label === '▶ 开始守卫');
T('可见 DOCK 恰 3 项', hs.dock.filter(d => !d.hidden).length === 3);
T('节日 / 异变横幅恒为空', hs.festRect === null && hs.mutRect === null);
T('首页无 _enterGame 闸门', typeof hs._enterGame === 'undefined');
storage.setFlag('towerTut');
hs.goBtn.onTap();
T('主 CTA 直接进入 tower', sm.switched.length === 1 && sm.switched[0].name === 'tower');
const TowerScene = require(path.join(ROOT, 'scene/TowerScene.js'));
const ts = new TowerScene(makeSM());
ts.enter({ seed: 1 });
ts.draw(ctxStub());
T('塔防场景可运行（prep 阶段）', ts.core.phase === 'prep' && ts.core.stats().pathLen >= 20);

console.log('--- 6. 纯单机：无自建后端 / 无云同步 / 无数据出端 ---');
const code = allJs();
T('无 wx.request 调用', !/wx\.request\s*\(/.test(code));
T('无 wx.cloud / uploadFile / downloadFile / connectSocket', !/wx\.(cloud|uploadFile|downloadFile|connectSocket)\b/.test(code));
T('无 wx.login / getUserInfo / 开放数据域', !/wx\.(login|getUserInfo|getOpenDataContext)\b/.test(code));
T('无微信托管数据上报 setUserCloudStorage', !/setUserCloudStorage\s*\(/.test(code));
T('业务源码无 http(s) 端点', !/https?:\/\//.test(code));
const analytics = require(path.join(ROOT, 'core/analytics.js'));
T('analytics 无 configure / setTransport / flush', typeof analytics.configure === 'undefined' && typeof analytics.setTransport === 'undefined' && typeof analytics.flush === 'undefined');
T('analytics 只写本机缓冲', analytics.track('td_start', { seed: 1 }).queued >= 1 && mem[analytics.ANALYTICS_KEY].length >= 1);
const gameJson = fs.readFileSync('/home/zhanglei3/WorkBuddy/2026-10-26-14-05-57/MazeGame/minigame/game.json', 'utf8');
const projJson = fs.readFileSync('/home/zhanglei3/WorkBuddy/2026-10-26-14-05-57/MazeGame/minigame/project.config.json', 'utf8');
T('game.json 无云开发 / 域名字段', !/cloud|http/i.test(gameJson));
T('project.config.json 无 cloudfunctionRoot', projJson.indexOf('cloudfunctionRoot') === -1);

console.log('--- 7. 老存档迁移兼容 ---');
storage.resetProgress();
for (let i = 1; i <= 120; i++) storage.completeLevel(i, { time: 9, steps: 9, swipe: 0, stars: 3, gems: 0, gemTotal: 0 });
T('老玩家 120 关进度仍可读', Object.keys(storage.getProgress().completed).length === 120);
const oldStat = storage.heroStats();
T('heroStats 保留老星数（皮肤/英雄不回收）', oldStat.stars >= 360 && oldStat.clears >= 120);
storage.resetProgress();
storage.recordTowerRun(30);
const newStat = storage.heroStats();
T('塔防进度可取较大值充当解锁源', newStat.stars >= 30 && newStat.clears >= 1 && newStat.towerRuns === 1);
storage.resetProgress();
T('resetProgress 仍清理塔防统计', storage.getStats().bestTowerWave === 0 && storage.getStats().towerRuns === 0);

console.log('');
console.log('===== v37 硬删除·纯单机：' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail > 0 ? 1 : 0);
