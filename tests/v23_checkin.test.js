// v1.11 每日签到（连续签到里程碑）回归
const path = require('path');
const ROOT = '/home/zhanglei3/WorkBuddy/2026-10-26-14-05-57/MazeGame/minigame/js';

// ---- wx mock ----
const mem = {};
global.wx = {
  getStorageSync: (k) => mem[k],
  setStorageSync: (k, v) => { mem[k] = v; },
  removeStorageSync: (k) => { delete mem[k]; },
  shareAppMessage: () => {},
  vibrateShort: () => {}
};

const storage = require(path.join(ROOT, 'core/storage.js'));
const task = require(path.join(ROOT, 'core/task.js'));
const checkin = require(path.join(ROOT, 'core/checkin.js'));
const theme = require(path.join(ROOT, 'core/theme.js'));

let pass = 0, fail = 0;
function T(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}

// 日期注入：与 v19/v22 同款跨天回归手法
const REAL_KEY = storage.dailyKey.bind(storage);
function setDay(key) { storage.dailyKey = function () { return key }; }
function dateAt(n) { // 2026-11-01 + n 天
  const d = new Date(2026, 10, 1 + n);
  const m = ('0' + (d.getMonth() + 1)).slice(-2);
  const dd = ('0' + d.getDate()).slice(-2);
  return d.getFullYear() + '-' + m + '-' + dd;
}

async function main() {
  console.log('--- 1. 奖励表合规 ---');
  T('光尘表 7 天一循环且递增', checkin.DUST_TABLE.length === 7 &&
    checkin.DUST_TABLE.every((v, i) => i === 0 || v > checkin.DUST_TABLE[i - 1]));
  T('里程碑 4 档：3/7/14/30', checkin.MILESTONES.map(m => m.day).join(',') === '3,7,14,30');
  T('7 天里程碑送皮肤 dawn', checkin.MILESTONES.some(m => m.day === 7 && m.reward.skin === 'dawn'));
  T('奖励不含广告次数字段', checkin.MILESTONES.every(m => !('ad' in m.reward)));

  console.log('--- 2. 晨曦皮肤（签到限定） ---');
  T('theme 已注册 dawn', !!theme.THEMES.dawn);
  T('dawn 位于 ORDER 末位', theme.ORDER[theme.ORDER.length - 1] === 'dawn');
  T('dawn 标记 exclusive（不走光尘/碎片/广告）', theme.THEMES.dawn.exclusive === true);
  T('dawn 无碎片兑换价', theme.getShardCost('dawn') === 0);
  T('dawn 含完整 --panel 系列（弹窗实底对比度规范）',
    ['--panel', '--panel-2', '--panel-line'].every(k => !!theme.THEMES.dawn.vars[k]));

  console.log('--- 3. 基础签到流 ---');
  setDay(dateAt(0)); // 2026-11-01
  const d0 = storage.getDust();
  let r = checkin.sign();
  T('首次签到成功', r.ok === true);
  T('首次签到 +20 光尘', storage.getDust() === d0 + 20 && r.got.some(g => g.kind === 'dust' && g.n === 20));
  T('连续天数记 1', r.streak === 1);
  T('info().signed=true', checkin.info().signed === true);
  r = checkin.sign();
  T('当日重复签到拒绝', r.ok === false && r.reason === 'signed');

  console.log('--- 4. 连续签到与里程碑 ---');
  // 第 2 天（昨天已签）
  setDay(dateAt(1));
  r = checkin.sign();
  T('次日签到连续 +1', r.ok && r.streak === 2);
  T('第 2 天奖励 25 光尘', storage.getDust() === d0 + 20 + 25);
  // 第 3 天 → 里程碑 碎片×5
  setDay(dateAt(2));
  const sh0 = storage.getShards();
  r = checkin.sign();
  T('第 3 天触发碎片×5 里程碑', r.msGot.some(g => g.kind === 'shard'));
  T('碎片确实 +5', storage.getShards() === sh0 + 5);
  T('里程碑记录 day=3', checkin.info().ms.find(m => m.day === 3).got === true);
  // 跳过 4/5/6，直接验证 7 天皮肤：用 STREAK_OVERRIDE 对齐档位（不影响真实 streak 存档）
  checkin.setStreakOverride(6);
  setDay(dateAt(3));
  r = checkin.sign();
  T('override 下签到仍成功（真实 streak 正常累计）', r.ok && r.streak === 4);
  checkin.setStreakOverride(null);

  // 干净存档直测 7 天皮肤：重置后手动构造连续 6 天存档再签
  mem['maze_checkin_v1'] = { last: dateAt(9), streak: 6, total: 6, msAwarded: [3] };
  setDay(dateAt(10));
  const skins0 = storage.getUnlockedSkins();
  r = checkin.sign();
  const skinGot = r.msGot.some(g => g.kind === 'skin' && g.n === 'dawn');
  T('连续 7 天签到解锁晨曦皮肤', skinGot && storage.getUnlockedSkins().indexOf('dawn') !== -1 && skins0.indexOf('dawn') === -1);
  T('第 7 天签到奖励 50 光尘（循环表末档）', r.got.some(g => g.kind === 'dust' && g.n === 50));
  r = checkin.sign();
  T('7 天里程碑不重复发放', !r.ok || !r.msGot.some(g => g.kind === 'skin'));

  console.log('--- 5. 断签与恢复 ---');
  mem['maze_checkin_v1'] = { last: dateAt(19), streak: 9, total: 9, msAwarded: [] };
  setDay(dateAt(25)); // 断签 5 天
  let inf = checkin.info();
  T('断签后连续清零', inf.signed === false && inf.streak === 0);
  T('累计天数保留不回退', inf.total === 9);
  T('未签时今日可得为第 1 档', inf.todayDust === 20);
  r = checkin.sign();
  T('断签后重签从 1 计', r.ok && r.streak === 1);
  // 昨天签过今天未签 → 视为连续可续
  mem['maze_checkin_v1'] = { last: dateAt(25), streak: 4, total: 12, msAwarded: [] };
  setDay(dateAt(26));
  inf = checkin.info();
  T('昨天已签时连续保留（今天可续）', inf.streak === 4 && inf.signed === false);
  T('未签时今日可得为第 5 档', inf.todayDust === 40);

  console.log('--- 6. info 摘要与赛季联动 ---');
  mem['maze_checkin_v1'] = { last: dateAt(26), streak: 5, total: 13, msAwarded: [3] };
  setDay(dateAt(26));
  inf = checkin.info();
  T('nextMs 指向 7 天皮肤档', inf.nextMs && inf.nextMs.day === 7 && inf.nextMs.left === 2);
  T('已签时 todayDust 展示今日已得档位', inf.signed === true && inf.todayDust === 40);
  const season = require(path.join(ROOT, 'core/season.js'));
  const xp0 = season.info().xp;
  mem['maze_checkin_v1'] = { last: '', streak: 0, total: 0, msAwarded: [] };
  setDay(dateAt(27));
  r = checkin.sign();
  T('签到发放赛季 XP（回访行为联动）', r.ok && season.info().xp === xp0 + 10);

  console.log('--- 7. 外观元数据与皮肤行卡 ---');
  T('晨昏与共称号已登记 COSMETIC_META', !!task.COSMETIC_META.title['晨昏与共']);
  T('applyReward 支持 skin 奖励', (function () {
    mem['maze_skins_v1'] = [];
    const got = task.applyReward({ skin: 'dawn' });
    return got.length === 1 && got[0].kind === 'skin' && storage.getUnlockedSkins().indexOf('dawn') !== -1;
  })());

  console.log('--- 8. 重置进度覆盖签到键 ---');
  mem['maze_checkin_v1'] = { last: dateAt(27), streak: 3, total: 3, msAwarded: [3] };
  storage.resetProgress();
  T('resetProgress 清除签到存档', !mem['maze_checkin_v1'] || mem['maze_checkin_v1'].streak === undefined);

  console.log('\n===== v23 每日签到：' + pass + ' 通过 / ' + fail + ' 失败 =====');
  if (fail > 0) process.exit(1);
}

main().finally(function () { storage.dailyKey = REAL_KEY; });
