// 激励视频广告对接回归：真实广告位 ID / 官方 show→load→show 重试链 / 防御性兜底
const path = require('path');
const ROOT = '/home/zhanglei3/WorkBuddy/2026-10-26-14-05-57/MazeGame/minigame/js';

global.wx = {};
const ad = require(path.join(ROOT, 'core/ad.js'));

let pass = 0, fail = 0;
function T(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}
const tick = () => new Promise((r) => setTimeout(r, 0));

// 构造可编程的 RewardedVideoAd mock
function makeAd(behavior) {
  const st = { close: null, showN: 0, loadN: 0 };
  const m = {
    show() { st.showN++; return behavior.show(st.showN); },
    load() { st.loadN++; return behavior.load ? behavior.load(st.loadN) : Promise.resolve(); },
    onClose(f) { st.close = f; },
    offClose(f) { if (st.close === f) st.close = null; },
    onError() {},
    fireClose(res) { if (st.close) st.close(res); },
    _st: st
  };
  return m;
}

function setWx(mock) {
  global.wx = mock ? { createRewardedVideoAd: () => mock } : {};
}

(async function main() {
  console.log('--- 1. 真实广告位对接 ---');
  T('AD_UNIT_ID 已填，AD_DEV=false（真实广告模式）', ad.AD_DEV === false);

  console.log('--- 2. 单例 + 创建即预加载 ---');
  let created = 0;
  let preloadN = 0;
  global.wx = { createRewardedVideoAd: () => { created++; return makeAd({ show: () => Promise.resolve(), load: () => { preloadN++; return Promise.resolve(); } }); } };
  ad._reset();
  ad.showRewarded(() => {});
  await tick();
  T('广告实例只创建一次（单例）', created === 1);
  T('创建后立即预加载 load（缩短首次拉起）', preloadN === 1);

  console.log('--- 3. 完整看完 → 回调成功 ---');
  {
    ad._reset();
    const m = makeAd({ show: () => Promise.resolve() });
    setWx(m);
    let ok = null, handled = null;
    handled = ad.showRewarded((r) => { ok = r; });
    await tick();
    m.fireClose({ isEnded: true });
    await tick();
    T('isEnded=true → cb(true)', ok === true);
    T('返回 true（页面层不再展示模拟广告）', handled === true);
    T('回调后 offClose 解绑', m._st.close === null);
  }

  console.log('--- 4. show 失败 → load 重试 → 成功（官方示例流程） ---');
  {
    ad._reset();
    const m = makeAd({
      show: (n) => (n === 1 ? Promise.reject(new Error('not loaded')) : Promise.resolve()),
      load: () => Promise.resolve()
    });
    setWx(m);
    let ok = null;
    ad.showRewarded((r) => { ok = r; });
    await tick();
    T('首次 show 失败后自动重试（show 共 2 次 / load 共 2 次=预加载1+重试1）', m._st.showN === 2 && m._st.loadN === 2);
    m.fireClose({ isEnded: true });
    await tick();
    T('重试成功后完整看完 → cb(true)', ok === true);
  }

  console.log('--- 5. 彻底失败 → 回调失败 ---');
  {
    ad._reset();
    const m = makeAd({ show: () => Promise.reject(new Error('no fill')), load: () => Promise.reject(new Error('load fail')) });
    setWx(m);
    let ok = null, handled = null;
    handled = ad.showRewarded((r) => { ok = r; });
    await tick();
    T('load+show 均失败 → cb(false)', ok === false && handled === true);
    T('失败后 offClose 解绑（不悬挂监听）', m._st.close === null);
  }

  console.log('--- 6. 环境异常防御 ---');
  {
    ad._reset();
    const m = makeAd({ show: () => Promise.reject(new Error('x')), load: () => undefined }); // load 返回非 promise
    setWx(m);
    let ok = null;
    ad.showRewarded((r) => { ok = r; });
    await tick();
    T('load 返回 undefined 不崩溃 → cb(false)', ok === false);
  }
  {
    ad._reset();
    const m = {
      show() { throw new Error('show throws sync'); }, // show 同步抛异常
      load() { return Promise.reject(new Error('x')); },
      onClose() {}, offClose() {}, onError() {}
    };
    setWx(m);
    let ok = null;
    ad.showRewarded((r) => { ok = r; });
    await tick();
    T('show 同步抛异常 → 走重试兜底 cb(false)', ok === false);
  }
  {
    ad._reset();
    setWx(null); // wx.createRewardedVideoAd 缺失
    let ok = null, handled = null;
    handled = ad.showRewarded((r) => { ok = r; });
    T('无广告能力 → cb(false) 且 handled=true', ok === false && handled === true);
  }
  {
    const saved = global.wx; global.wx = undefined;
    ad._reset();
    let ok = null;
    ad.showRewarded((r) => { ok = r; });
    T('wx 整体缺失 → 安全 cb(false)', ok === false);
    global.wx = saved;
  }

  console.log('\n通过 ' + pass + ' / 失败 ' + fail);
  process.exit(fail ? 1 : 0);
})();
