// 连败保护：同一关连续失败时逐级轻减（仅主线 mode=level 生效）
// 设计原则：只做「无感知减弱」，不做负向惩罚；胜利即清零
const KEY = 'maze_mercy_v1';

function get() {
  try {
    const s = wx.getStorageSync(KEY);
    return (s && typeof s === 'object') ? s : { failStreak: 0, level: 0 };
  } catch (e) {
    return { failStreak: 0, level: 0 };
  }
}

function save(s) {
  try { wx.setStorageSync(KEY, s) } catch (e) {}
}

// 失败记录：同关连败累积；换关重开计数（换关说明玩家在前进，不是卡关）
function recordFail(level) {
  const s = get();
  if (s.level === level) s.failStreak += 1;
  else { s.level = level; s.failStreak = 1; }
  save(s);
  return s.failStreak;
}

// 通关清零（任何模式通关都算走出挫败）
function recordWin() {
  save({ failStreak: 0, level: 0 });
}

// 当前轻减档位（同关连败 0/1 次无保护）
function streakFor(level) {
  const s = get();
  return (s.level === level && s.failStreak >= 2) ? s.failStreak : 0;
}

// 轻减参数（确定性 gift：level+streak 哈希，避免随机影响测试与回放）
const GIFT_POOL = ['shield', 'cloak', 'freeze', 'dash'];
function mercyFor(level, streak) {
  if (!streak || streak < 2) return null;
  const slow = streak >= 4 ? 0.75 : (streak === 3 ? 0.85 : 1);
  const extraInvuln = 3000 + (streak >= 4 ? 2000 : 0);
  const h = ((level * 131 + streak * 17) >>> 0) % GIFT_POOL.length;
  return {
    streak: streak,
    slow: slow,
    extraInvuln: extraInvuln,
    gift: GIFT_POOL[h]
  };
}

module.exports = {
  recordFail: recordFail,
  recordWin: recordWin,
  streakFor: streakFor,
  mercyFor: mercyFor
};
