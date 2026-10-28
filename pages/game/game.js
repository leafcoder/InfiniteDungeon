const maze = require('../../utils/maze.js');
const storage = require('../../utils/storage.js');
const theme = require('../../utils/theme.js');
const codex = require('../../utils/codex.js');
const weekly = require('../../utils/weekly.js');
const ad = require('../../utils/ad.js');

// 道具效果标签（时长由 storage.fxDuration 按强化等级决定）
const FX_LABEL = { cloak: '隐身', freeze: '冰冻', dash: '加速', shield: '护盾', magnet: '磁铁', flare: '照明', decoy: '诱饵', hourglass: '回溯' };
// 道具字形（背包槽位与画布内统一使用，避免两处各写一份三元表达式）
const FX_GLYPH = { cloak: '隐', freeze: '冰', dash: '速', shield: '盾', magnet: '磁', flare: '灯', decoy: '饵', hourglass: '沙' };
// 道具主色（Canvas 粒子、槽位底色、补给站图标共用）
const FX_COLOR = {
  cloak: '#9B8CFF',
  freeze: '#5BC8FF',
  dash: '#FF9F6E',
  shield: '#6EE7A0',
  magnet: '#5EE6D8',
  flare: '#FF6B6B',
  decoy: '#FF9EC4',
  hourglass: '#B8A9FF'
};
// 皮肤专属拖尾色（vanity）
const TRAIL_COLOR = { classic: '#FFD86E', glow: '#6FE3D2', festival: '#FF8A8A', cosmos: '#9B8CFF' };
// 剧情章节过场（每 20 关首次进入触发）
const STORY_CHAPTERS = {
  21: { id: 'c21', title: '第二章 · 迷雾峡谷', art: '🌫️🌫️🌫️', lines: ['森林的尽头弥漫着不散的迷雾。', '老旅人说，峡谷里藏着会追人的影子。', '屏住呼吸，别让它们听见你的脚步。'] },
  41: { id: 'c41', title: '第三章 · 流光回廊', art: '✨🌌✨', lines: ['峡谷的底部，是一座会发光的回廊。', '墙壁里流淌着远古的光尘。', '收集它们——它们是你唯一的武器。'] },
  61: { id: 'c61', title: '第四章 · 熔岩深渊', art: '🔥🌋🔥', lines: ['越往下走，越热。', '深渊的岩浆在墙后翻涌，单向的门只许进不许出。', '小心每一步，这里的怪物不打算让你活着离开。'] },
  81: { id: 'c81', title: '终章 · 星海之巅', art: '⭐🌊⭐', lines: ['穿过深渊，你看见了星空。', '迷宫之主就等在这里——它守着出口的最后一把钥匙。', '别回头，跑。'] }
};
// 背包容量（槽位数上限）
const BAG_MAX = 3;
// #RRGGBB → rgba(r,g,b,a)
function hexToRgba(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(function (c) { return c + c; }).join('') : h, 16);
  if (isNaN(n)) return 'rgba(255,255,255,' + a + ')';
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}
// 方向反查（行进中即时转向用）
const OPPD = { U: 'D', D: 'U', L: 'R', R: 'L' };
// 方向向量（闸门/暗室判定用）
const DIRV_MAP = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };

Page({
  data: {
    level: 1,
    timeText: '00:00',
    hint: '',
    swipeTip: false,
    showWin: false,
    winTime: '',
    isNew: false,
    // 首次玩法演示
    tutorialOpen: false,
    tutStep: 0,
    // 失败弹层
    showFail: false,
    failReason: '',
    // 皮肤
    themeStyle: '',
    // 星级评分展示
    stars: 3,
    mTime: 0,
    mSteps: 0,
    mSwipe: 0,
    stepOK: true,
    swipeOK: true,
    timeOK: true,
    bestSteps: 1,
    // 收集物 / 道具
    gems: 0,
    gemTotal: 0,
    perfect: false,
    dustEarn: 0,
    heldItem: '',
    bag: [],
    bagSel: 0,
    bagFull: false,
    fxChips: [],
    keyOn: false,
    hasKey: false,
    bossOn: false,
    bossTimeText: '',
    bossDanger: false,
    dailyTag: false,
    achToast: false,
    achToastNames: [],
    dailyStreak: 0,
    hasReplay: false,
    // 加载过渡页（进入关卡 / 重玩时显示，首帧绘制后淡出）
    loading: true,
    loadingTip: '生成迷宫中…'
  },

  onLoad(opt) {
    this.level = parseInt(opt.level, 10) || 1;
    this.forceTutorial = opt.tutorial === '1';
    this.dailyMode = opt.daily === '1';
    this.survivalMode = opt.survival === '1';
    this.weeklyIdx = (opt.weekly !== undefined && opt.weekly !== '') ? parseInt(opt.weekly, 10) : -1;
    this.weeklyMode = this.weeklyIdx >= 0 && this.weeklyIdx <= 4;
    this.seed = opt.seed ? (parseInt(opt.seed, 10) >>> 0) : undefined;
    // 周挑战：计划由周种子确定性生成；seed 不指定时用周种子派生，保证全周一致
    this.weekPlan = null;
    if (this.weeklyMode) {
      this.weekPlan = weekly.getPlan()[this.weeklyIdx];
      this.level = this.weekPlan.level;
      if (this.seed === undefined) this.seed = (weekly.weekSeed() + this.weeklyIdx * 97) >>> 0;
    }
    // 挑战码自定义关（P2 UGC）：mods=逗号分隔词缀，复用周挑战词缀机制
    this.customMods = opt.mods ? opt.mods.split(',').filter(Boolean) : null;
    if (this.customMods && this.customMods.length) {
      this.weekPlan = { level: this.level, mods: this.customMods };
      this.customMode = true;
      if (this.seed === undefined) this.seed = (parseInt(opt.seed, 10) || (Date.now() % 100000)) >>> 0;
    }
    this.theme = storage.getTheme();
    this.muted = storage.getSetting('mute', false);
    this.reduceMotion = storage.getSetting('reduceMotion', false);
    this.highContrast = storage.getSetting('highContrast', false);
    this.setData({ level: this.level, themeStyle: theme.themeStyle(this.theme), dailyTag: this.dailyMode });
    this.rafId = null;
    this.timer = null;
    this.stepping = false;
    this.pendingDir = null;
    this.waiting = false;
    this._sx = 0;
    this._sy = 0;
    this.tutTimer = null;
    this.dead = false;
    this.reviveUsed = false;   // 广告复活每局限一次
    this.paused = false;       // 剧情过场暂停
    // 剧情章节：每 20 关首次进入触发（生存/自定义/周挑战不触发）
    this.pendingStory = null;
    if (!this.survivalMode && !this.customMode && !this.weeklyMode) {
      const ch = STORY_CHAPTERS[this.level];
      if (ch && !storage.isStorySeen(ch.id)) this.pendingStory = ch;
    }
    this.initAudio();
  },

  onReady() {
    this.setupCanvas();
  },

  onHide() {
    this.stopLoop();
    this.clearTutTimer();
  },

  onUnload() {
    this.stopLoop();
    this.clearTutTimer();
  },

  /* ============ 音频 / 震动 ============ */
  initAudio() {
    try {
      this.audio_win = wx.createInnerAudioContext();
      this.audio_win.src = 'audio/win.wav';
      this.audio_fail = wx.createInnerAudioContext();
      this.audio_fail.src = 'audio/fail.wav';
      this.audio_click = wx.createInnerAudioContext();
      this.audio_click.src = 'audio/click.wav';
      this.audio_pick = wx.createInnerAudioContext();
      this.audio_pick.src = 'audio/pick.wav';
      this.audio_power = wx.createInnerAudioContext();
      this.audio_power.src = 'audio/power.wav';
      this.audio_tick = wx.createInnerAudioContext();
      this.audio_tick.src = 'audio/tick.wav';
      this.audio_achv = wx.createInnerAudioContext();
      this.audio_achv.src = 'audio/achv.wav';
      this.audio_boss = wx.createInnerAudioContext();
      this.audio_boss.src = 'audio/boss.wav';
      this.audio_alert = wx.createInnerAudioContext();
      this.audio_alert.src = 'audio/alert.wav';
      this.audio_portal = wx.createInnerAudioContext();
      this.audio_portal.src = 'audio/portal.wav';
      this.audio_warn = wx.createInnerAudioContext();
      this.audio_warn.src = 'audio/warn.wav';
    } catch (e) {}
  },
  playSound(name) {
    if (this.muted) return;
    try {
      const a = this['audio_' + name];
      if (!a) return;
      a.stop();
      a.play();
    } catch (e) {}
  },
  vibrate(type) {
    try {
      wx.vibrateShort({ type: type });
    } catch (e) {
      try { wx.vibrateShort(); } catch (e2) {}
    }
  },

  setupCanvas() {
    const that = this;
    wx.createSelectorQuery()
      .select('#maze')
      .fields({ node: true, size: true })
      .select('#radar')
      .fields({ node: true, size: true })
      .exec(function (res) {
        if (!res || !res[0] || !res[0].node) return;
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        let dpr = 2;
        try {
          dpr = wx.getWindowInfo().pixelRatio || 2;
        } catch (e) {
          dpr = wx.getSystemInfoSync().pixelRatio || 2;
        }
        const w = res[0].width;
        const h = res[0].height;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);
        that.canvas = canvas;
        that.ctx = ctx;
        that.cw = w;
        that.ch = h;
        // 危险雷达：第二块独立 canvas，玩家居中显示怪物相对方向
        if (res[1] && res[1].node) {
          const rcanvas = res[1].node;
          const rctx = rcanvas.getContext('2d');
          const rw = res[1].width;
          const rh = res[1].height;
          rcanvas.width = rw * dpr;
          rcanvas.height = rh * dpr;
          rctx.scale(dpr, dpr);
          that.radarCanvas = rcanvas;
          that.radarCtx = rctx;
          that.rcw = rw;
          that.rch = rh;
        }
        that.initLevel();
        if (!storage.getTutorialSeen() || that.forceTutorial) {
          that.setData({ tutorialOpen: true, tutStep: 0 });
          that.startTutTimer();
        }
      });
  },

  initLevel() {
    // —— 加载过渡页：进入 / 重玩关卡时显示动态加载层 ——
    if (this._loadTimer) { clearInterval(this._loadTimer); this._loadTimer = null; }
    this._loadStart = Date.now();
    this.setData({ loading: true, loadingTip: '生成迷宫中…' });
    const LOAD_TIPS = ['生成迷宫中…', '规划安全路线…', '唤醒沉睡守卫…', '点亮光尘…', '校准传送门…'];
    let _lti = 0;
    const _that = this;
    this._loadTimer = setInterval(function () {
      _lti = (_lti + 1) % LOAD_TIPS.length;
      _that.setData({ loadingTip: LOAD_TIPS[_lti] });
    }, 620);

    // 按画布宽高比生成矩形迷宫（格子保持正方形，铺满屏幕）
    const aspect = this.cw > 0 && this.ch > 0 ? this.ch / this.cw : 1;
    const m0 = maze.generateMaze(this.level, aspect, this.seed);
    // 虚空回响（L101-120）：左右对称镜像迷宫（BFS 校验可达，不可达则退化回退）
    if (this.level >= 101 && !this.survivalMode) {
      this.voidZone = true;
      this.maze = maze.mirrorMaze(m0);
    } else {
      this.voidZone = false;
      this.maze = m0;
    }
    const m = this.maze;
    this.cell = Math.floor(Math.min(this.cw / m.W, this.ch / m.H));
    this.offX = Math.floor((this.cw - this.cell * m.W) / 2);
    this.offY = Math.floor((this.ch - this.cell * m.H) / 2);
    this.state = {
      x: m.start.x,
      y: m.start.y,
      dir: null,
      cameFrom: null,
      visited: {}
    };
    this.state.visited[m.start.x + ',' + m.start.y] = true;
    this.visual = { x: m.start.x, y: m.start.y };
    this.monsters = maze.placeMonsters(this.level, m, this.seed);
    // 传送门（P7）：须在 placeItems 之前放置，道具/钥匙会避开传送门格
    m.portals = maze.placePortals(this.level, m, this.monsters, this.seed);
    this.portals = m.portals;
    // 单向门（P2）：在道具之前放置（道具避开单向格），并按玩家规则验证可达性
    m.oneways = maze.placeOneWays(this.level, m, this.monsters, this.portals, this.seed);
    this.onewayMap = null;
    if (m.oneways && m.oneways.length) {
      this.onewayMap = {};
      for (let i = 0; i < m.oneways.length; i++) {
        const o = m.oneways[i];
        this.onewayMap[o.x + ',' + o.y] = o.dir;
      }
    }
    // 宝藏暗室（P9）：假墙，撞开得宝
    m.secrets = maze.placeSecrets(this.level, m, this.seed);
    this.secretMap = {};
    for (let i = 0; i < m.secrets.length; i++) {
      this.secretMap[m.secrets[i].x + ',' + m.secrets[i].y] = m.secrets[i];
    }
    // 动态闸门（P9）：周期开合的通路门
    m.gates = maze.placeGates(this.level, m, this.monsters, this.portals, m.oneways, this.seed);
    this.gates = m.gates;
    // 词缀判断：周挑战与挑战码自定义共用
    const modOn = (k) => {
      return (this.weeklyMode || this.customMode) && this.weekPlan && this.weekPlan.mods.indexOf(k) !== -1;
    };
    this._modOn = modOn;
    // 周挑战词缀：noitem 时清空道具生成
    let its = maze.placeItems(this.level, m, this.monsters, this.seed);
    if (modOn('noitem')) {
      its.items = its.items.filter(function (it) { return it.type === 'key'; });
      its.gemTotal = 0;
    }
    this.items = its.items;
    this.gemTotal = its.gemTotal;
    m.key = its.key;
    // 守门怪（P9）：L68+ 带钥匙关，放在钥匙附近（须在 key 确定后）
    if (!this.survivalMode) {
      const gk = maze.placeGatekeeper(this.level, m, this.monsters, m.key, this.seed);
      if (gk) this.monsters.push(gk);
    }
    this.itemMap = {};
    for (let i = 0; i < its.items.length; i++) {
      const it = its.items[i];
      this.itemMap[it.x + ',' + it.y] = it;
    }
    this.bullets = [];
    this.dead = false;
    this.stepping = false;
    this.waiting = false;
    this.pendingDir = null;
    this.lastMonsterMove = Date.now();
    this.steps = 0;
    this.swipeDist = 0;
    this.swipeCount = 0;
    this.collected = 0;
    this.bag = [];          // 背包：[{ type, count }]，最多 BAG_MAX 种
    this.bagSel = 0;        // 当前选中的槽位下标
    this.heldItem = null;   // 兼容旧逻辑：指向当前选中槽位的道具类型
    this.fx = { cloak: 0, freeze: 0, dash: 0, magnet: 0, flare: 0, decoy: 0 };
    this.decoyPos = null;   // 诱饵所在格（fx.decoy > 0 期间怪物改追诱饵，Boss 无视）
    this.portalCd = false;  // 传送门防回弹：瞬移后直到离开传送门格才解除
    this.pathHistory = [];  // 位置历史（沙漏回溯 / 广告复活用）
    this.hourglassBank = 0; // 虚空回响：每集齐 3 光点充能 1 次时间回溯
    this.ghostPath = [];    // 幽灵竞速：本次路线采样
    this.shield = false;
    this.invulnUntil = 0;
    this.usedItem = false;
    this._vanityTick = 0;   // 皮肤拖尾粒子节拍
    this.insightUntil = 0;  // 透视技能截止时间
    this.failPath = null;   // 死亡回顾：距出口最优路径
    this._doubleClaimed = false; // 每日双倍广告每局一次
    this.shakeMag = 0;
    this._shakeX = 0;
    this._shakeY = 0;
    this._bossTxt = null;
    this._bossSec = null;
    this._weeklyBonusGiven = false; // 周挑战全清奖励每次重玩只判一次
    this.hunterMode = this.level === 75; // 猎手反转关：抓逃跑 Boss 拿钥匙
    this.bossOn = this.level >= 76 && this.level <= 100 && !this.survivalMode; // 伪 Boss 预热 L76-79 + 真 Boss L80-100（虚空无 Boss）
    this.pseudoBoss = this.bossOn && this.level <= 79; // 伪 Boss：限时追逐但仅 LOS 追击，不含狂暴/冲刺
    // 生存模式：清空常规怪物，波次系统接管
    this.wave = 0;
    this.waveTotal = 9999; // 无尽生存：波次持续生成，不设上限（玩家阵亡即结束并记录存活波数）
    this.waveTimeLeft = 0;
    this._waveGrace = 1600;
    if (this.survivalMode) this.monsters = [];
    // 主动技（技能树 2.0）
    const sk = storage.getSkills();
    this.skillOwned = { dash: !!sk.dash, insight: !!sk.insight };
    this.skillUses = {
      dash: sk.dash ? storage.SKILL_META.dash.uses : 0,
      insight: sk.insight ? storage.SKILL_META.insight.uses : 0
    };
    this.particles = [];
    this.trail = [];
    this.introT = 0;
    this.lastTick = Date.now();
    // 迷雾探索模式（L41+）：seen=已探索记忆，fogLit=当前亮度（平滑淡入淡出）
    // 词缀：fog 强制迷雾、dark 夜幕（视野半径减半）
    this.darkMode = false;
    this.fogEnabled = this.level >= 41 || this.survivalMode;
    if (this.weeklyMode || this.customMode) {
      if (this._modOn('fog')) this.fogEnabled = true;
      if (this._modOn('dark')) { this.fogEnabled = true; this.darkMode = true; }
    }
    if (this.fogEnabled) {
      const W = m.W, H = m.H;
      this.seen = [];
      this.fogLit = [];
      for (let y = 0; y < H; y++) {
        this.seen.push(new Array(W).fill(false));
        this.fogLit.push(new Array(W).fill(0));
      }
      this.revealAround();
    } else {
      this.seen = null;
      this.fogLit = null;
    }
    const keyPos = m.key;
    this.hasKey = false;
    // 星级 BFS 与玩家规则一致（含单向门），保证"理论最优"公平
    this.bestSteps = (keyPos ? maze.bfsStepsKey(m.grid, m.start, keyPos, m.end, m.portals, this.onewayMap) : maze.bfsSteps(m.grid, m.start, m.end, m.portals, this.onewayMap)) || 1;
    const cfg = maze.getLevelConfig(this.level);
    // 词缀：haste 怪物提速 25%、slow 玩家步速降低
    this.monsterStepMs = Math.max(240, 400 - cfg.monsterTier * 40 - Math.floor(this.level / 4));
    if (this._modOn('haste')) {
      this.monsterStepMs = Math.max(200, Math.round(this.monsterStepMs * 0.75));
    }
    this.bulletSpeed = 0.16 + cfg.monsterTier * 0.03;
    this.bulletInterval = 4;
    // 逃跑 Boss（猎手反转）节拍：比玩家慢，比巡逻怪快
    this.fleeStepMs = Math.max(300, Math.round(this.monsterStepMs * 1.25));
    // Boss 限时追逐配置（须在 bestSteps / monsterStepMs 之后计算）+ Boss 2.0 阶段状态
    if (this.bossOn) {
      this.bossStepMs = Math.max(260, Math.round(this.monsterStepMs * 0.92));
      const best = this.bestSteps || 1;
      // 伪 Boss（L76-79）：固定 45s 限时，永不开狂暴/冲刺；真 Boss 按最优步数 ×1.15
      this.bossTimeLeft = this.pseudoBoss ? 45 : Math.max(45, Math.round(best * 1.15));
      this.bossTimeTotal = this.bossTimeLeft;
      this.bossPhase = this.pseudoBoss ? 0 : 1; // 0=无阶段（伪 Boss） 1=正常 2=狂暴
      this.lastDash = 0;         // 上次冲刺时间
      this.dashWarn = null;      // 冲刺预警 { cells, until, boss, path }
      this.lastBossMove = 0;
    }
    this.startTime = Date.now();
    this.stepMs = Math.max(70, 130 - Math.floor(this.level / 2));
    if (this._modOn('slow')) {
      this.stepMs = Math.round(this.stepMs * 1.5);
    }
    // 词缀：more 围剿（怪物 +2，从走廊召唤追击型影卫）；生存模式由波次接管，跳过
    if (this._modOn('more') && !this.survivalMode) {
      this.summonPatrol(2);
    }
    // 沙漏道具：L41+ 每关在随机空格放一个（种子确定性，保证每日挑战布局一致）
    if (this.level >= 41 && !this.survivalMode && !this._modOn('noitem')) {
      let s2 = (this.seed !== undefined ? this.seed : this.level * 7919) >>> 0 || 1;
      const lcg = function () { s2 = (Math.imul(s2, 1664525) + 1013904223) >>> 0; return s2 / 4294967296; };
      for (let tries = 0; tries < 80; tries++) {
        const hx = 1 + Math.floor(lcg() * (m.W - 2));
        const hy = 1 + Math.floor(lcg() * (m.H - 2));
        if (m.grid[hy][hx] !== 1) continue;
        const hk = hx + ',' + hy;
        if (this.itemMap[hk] || (m.start.x === hx && m.start.y === hy) || (m.end.x === hx && m.end.y === hy)) continue;
        if (this.portalAt(hx, hy) >= 0) continue;
        if (m.oneways && m.oneways.some(function (o) { return o.x === hx && o.y === hy; })) continue;
        if (m.gates && m.gates.some(function (g) { return g.x === hx && g.y === hy; })) continue;
        const hit = { x: hx, y: hy, type: 'hourglass', taken: false };
        this.items.push(hit);
        this.itemMap[hk] = hit;
        break;
      }
    }
    // 幽灵竞速：每日挑战加载本机最佳路线
    this.ghost = this.dailyMode ? storage.getGhost(storage.dailyKey()) : null;
    this._ghostIdx = 0;
    // 三星目标（P0：条件公开化，与结算判定完全一致）
    const goalBest = this.bestSteps || 1;
    this.setData({
      hint: '',
      showWin: false,
      showFail: false,
      timeText: '00:00',
      swipeTip: !storage.getTutorialSeen(),
      gems: 0,
      gemTotal: this.gemTotal,
      heldItem: '',
      bag: [],
      bagSel: 0,
      bagFull: false,
      fxChips: [],
      fogOn: this.fogEnabled,
      keyOn: !!keyPos,
      hasKey: false,
      bossOn: this.bossOn,
      bossTimeText: this.bossOn ? this.fmt(Math.ceil(this.bossTimeLeft)) : '',
      bossDanger: false,
      bossRage: false,
      achToast: false,
      achToastNames: [],
      // 三星目标
      goalTime: Math.max(8, Math.round(goalBest * 0.45)),
      goalSteps: Math.ceil(goalBest * 1.35),
      goalSwipe: Math.max(3, Math.round(goalBest / 6)),
      // 周挑战 / 挑战码词缀条
      weeklyTag: this.weeklyMode || (this.customMode && this.weekPlan && this.weekPlan.mods.length > 0),
      weeklyMods: (this.weeklyMode || this.customMode) ? this.weekPlan.mods.map(function (k) {
        for (let i = 0; i < weekly.MODS.length; i++) {
          if (weekly.MODS[i].key === k) return weekly.MODS[i];
        }
        return null;
      }).filter(Boolean) : [],
      // 生存模式
      survivalOn: this.survivalMode,
      waveText: this.survivalMode ? '准备…' : '',
      // 主动技按钮
      skillDash: this.skillOwned.dash,
      skillInsight: this.skillOwned.insight,
      skillDashN: this.skillUses.dash,
      skillInsightN: this.skillUses.insight,
      // 剧情过场
      storyOpen: false,
      storyData: null
    });
    if (this.survivalMode) this.setData({ hint: '生存模式 · 坚持尽可能多的波次！' });
    else if (this.hunterMode) this.setData({ hint: '猎手反转 · 抓住宝藏Boss拿钥匙，再前往终点！' });
    else if (this.voidZone) this.setData({ hint: '虚空回响 · 迷宫左右对称，集 3 光点充能时间回溯' });
    else if (this.fogEnabled) this.setData({ hint: '迷雾笼罩：靠近才能看清前方' });
    else if (this.dailyMode) this.setData({ hint: '每日挑战 · 今日布局（' + storage.dailyKey() + '）' });
    if (this.weeklyMode) this.setData({ hint: '周挑战 ' + (this.weeklyIdx + 1) + '/5 · 第 ' + this.level + ' 关' });
    if (this.bossOn) this.playSound('boss');
    if (this.hunterMode) this.playSound('boss');
    // 图鉴遭遇：怪物 / 传送门 / 单向门（首次遭遇解锁）
    if (this.monsters) {
      for (let i = 0; i < this.monsters.length; i++) {
        const mm = this.monsters[i];
        if (mm.isBoss && mm.flee) storage.encounterCodex('monster_flee');
        else if (mm.isBoss) storage.encounterCodex('monster_boss');
        else if (mm.isGatekeeper) storage.encounterCodex('monster_gatekeeper');
        else if (mm.freezeRes) storage.encounterCodex('monster_freezeres');
        else if (mm.behavior >= 2) storage.encounterCodex('monster_shoot');
        else if (mm.behavior === 1) storage.encounterCodex('monster_chase');
        else storage.encounterCodex('monster_patrol');
      }
    }
    if (this.portals && this.portals.length) storage.encounterCodex('mach_portal');
    if (this.onewayMap) storage.encounterCodex('mach_oneway');
    if (this.gates && this.gates.length) storage.encounterCodex('mach_gate');
    if (this.secretMap && Object.keys(this.secretMap).length) storage.encounterCodex('mach_secret');
    this.draw();
    this._finishLoading();
    // 剧情过场：先弹面板，关闭后再开循环（游戏暂停）
    if (this.pendingStory) {
      this.setData({ storyOpen: true, storyData: this.pendingStory });
      this.paused = true;
      return;
    }
    this.startLoop();
  },

  // 加载过渡页：保证最小展示时长（约 620ms），避免动画被一帧跳过；清理提示计时器
  _finishLoading() {
    const that = this;
    if (this._loadTimer) { clearInterval(this._loadTimer); this._loadTimer = null; }
    const elapsed = Date.now() - (this._loadStart || Date.now());
    const wait = Math.max(0, 620 - elapsed);
    setTimeout(function () { that.setData({ loading: false }); }, wait);
  },

  // 剧情过场关闭：标记已读、重置计时基线并开跑
  onStoryClose() {
    if (!this.pendingStory) return;
    storage.markStorySeen(this.pendingStory.id);
    this.pendingStory = null;
    this.paused = false;
    this.startTime = Date.now();
    this.lastTick = Date.now();
    this.lastMonsterMove = Date.now();
    this.setData({ storyOpen: false, storyData: null });
    this.playSound('click');
    this.startLoop();
  },

  // 召唤 n 只追击型影卫（Boss 狂暴 / 周挑战"围剿"用）：找远离玩家、不与他怪重叠的直走廊
  summonPatrol(n) {
    if (!this.maze || !this.state) return 0;
    const grid = this.maze.grid;
    const W = this.maze.W;
    const H = this.maze.H;
    const px = this.state.x;
    const py = this.state.y;
    let made = 0;
    let summonCount = 0;
    for (let i = 0; i < this.monsters.length; i++) {
      if (this.monsters[i].summoned) summonCount++;
    }
    // 尝试若干次随机采样走廊
    for (let tries = 0; tries < 60 && made < n && summonCount < 2; tries++) {
      const horiz = Math.random() < 0.5;
      const y = 1 + Math.floor(Math.random() * (H - 2));
      const x = 1 + Math.floor(Math.random() * (W - 2));
      if (grid[y][x] !== 1) continue;
      // 沿方向扩展最长 6 格直走廊
      const cells = [];
      if (horiz) {
        for (let k = 0; k < 6; k++) {
          const nx = x + k;
          if (nx >= W - 1 || grid[y][nx] !== 1) break;
          cells.push({ x: nx, y: y });
        }
      } else {
        for (let k = 0; k < 6; k++) {
          const ny = y + k;
          if (ny >= H - 1 || grid[ny][x] !== 1) break;
          cells.push({ x: x, y: ny });
        }
      }
      if (cells.length < 3) continue;
      // 远离玩家 >=4，且不与现有怪物所在格重叠
      const c0 = cells[0];
      if ((c0.x - px) * (c0.x - px) + (c0.y - py) * (c0.y - py) < 16) continue;
      let overlap = false;
      for (let i = 0; i < this.monsters.length; i++) {
        const om = this.monsters[i];
        if (om.x === c0.x && om.y === c0.y) overlap = true;
        if (om.path && om.path[0].x === c0.x && om.path[0].y === c0.y) overlap = true;
      }
      if (overlap) continue;
      this.monsters.push({
        path: cells,
        pi: 0,
        pdir: 1,
        behavior: 1,
        x: c0.x,
        y: c0.y,
        vx: c0.x,
        vy: c0.y,
        alert: 0,
        chasing: false,
        lastSeen: null,
        shootCd: 0,
        summoned: true,
        name: '影卫'
      });
      storage.encounterCodex('monster_chase');
      made++;
      summonCount++;
    }
    if (made > 0) {
      this.playSound('warn');
      this.vibrate('medium');
    }
    return made;
  },

  startLoop() {
    if (this.rafId) return;
    const that = this;
    const loop = function () {
      that.tick();
      that.rafId = that.canvas.requestAnimationFrame(loop);
    };
    loop();
    this.timer = setInterval(function () {
      that.updateTime();
    }, 500);
  },

  stopLoop() {
    if (this.rafId && this.canvas) {
      this.canvas.cancelAnimationFrame(this.rafId);
    }
    this.rafId = null;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  tick() {
    const now = Date.now();
    // 剧情过场：暂停一切模拟，仅绘制
    if (this.paused) {
      this.draw();
      return;
    }
    // 道具效果倒计时（毫秒）
    if (this.fx) {
      const dt = this.lastTick ? now - this.lastTick : 16;
      this.lastTick = now;
      let changed = false;
      const keys = ['cloak', 'freeze', 'dash', 'magnet', 'flare', 'decoy'];
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (this.fx[k] > 0) {
          this.fx[k] = Math.max(0, this.fx[k] - dt);
          if (this.fx[k] === 0) changed = true;
        }
      }
      // 诱饵到期：从世界中移除
      if (this.fx.decoy === 0 && this.decoyPos) this.decoyPos = null;
      if (changed || now - (this._fxUI || 0) > 250) {
        this._fxUI = now;
        this.syncFxUI();
      }
    }
    // 动态闸门运行时：开→关循环；玩家站在门格上时推迟切换（不夹人）
    if (this.gates && this.gates.length && this.state) {
      for (let i = 0; i < this.gates.length; i++) {
        const g = this.gates[i];
        if (!g._init) {
          g._init = true;
          g._open = true;
          g._next = now + g.openMs + g.offset;
        }
        if (this.state.x === g.x && this.state.y === g.y) {
          g._next = Math.max(g._next, now + 350);
          g._warn = false;
          continue;
        }
        if (now >= g._next) {
          g._open = !g._open;
          g._next = now + (g._open ? g.openMs : g.closedMs);
          // 切换瞬间若离玩家近给音效反馈
          const pd = Math.abs(g.x - this.state.x) + Math.abs(g.y - this.state.y);
          if (pd <= 4) this.playSound('tick');
        }
        g._warn = (g._next - now) < 800; // 切换前 0.8s 预警闪烁
      }
    }
    // 生存模式波次推进
    if (this.survivalMode && !this.dead && !(this.data.showWin || this.data.showFail)) {
      const sdt = this.lastTick ? (now - this.lastTick) : 16;
      if (this.wave === 0) {
        this._waveGrace -= sdt;
        if (this._waveGrace <= 0) this.startWave(1);
      } else if (this.wave >= 1 && this.wave <= this.waveTotal) {
        this.waveTimeLeft -= sdt / 1000;
        if (this.waveTimeLeft <= 0) {
          if (this.wave >= this.waveTotal) {
            this.onWin();
          } else {
            this.startWave(this.wave + 1);
          }
        }
        if (now - (this._waveUI || 0) > 400) {
          this._waveUI = now;
          this.setData({ waveText: '第 ' + this.wave + ' 波 · ' + Math.max(0, Math.ceil(this.waveTimeLeft)) + 's' });
        }
      }
    }
    // 幽灵竞速：按时间轴插值本机最佳路线位置
    if (this.ghost && this.ghost.path && this.ghost.path.length && !this.data.showWin) {
      const gt = (now - this.startTime) / 1000;
      const gp = this.ghost.path;
      while (this._ghostIdx < gp.length - 1 && gp[this._ghostIdx + 1].t <= gt) this._ghostIdx++;
      const ga = gp[this._ghostIdx];
      const gb = gp[Math.min(this._ghostIdx + 1, gp.length - 1)];
      const gspan = Math.max(0.001, gb.t - ga.t);
      const gf = Math.min(1, Math.max(0, (gt - ga.t) / gspan));
      this.ghostPos = { x: ga.x + (gb.x - ga.x) * gf, y: ga.y + (gb.y - ga.y) * gf };
    } else {
      this.ghostPos = null;
    }
    // Boss 限时倒计时（P2）：每秒递减；最后 10 秒脉冲+震动+tick 音；归零失败
    if (this.bossOn && !this.dead && !(this.data.showWin || this.data.showFail || this.data.tutorialOpen)) {
      const bdt = this.lastTick ? (now - this.lastTick) : 16;
      this.bossTimeLeft -= bdt / 1000;
      if (this.bossTimeLeft <= 0) {
        this.bossTimeLeft = 0;
        this.setData({ bossTimeText: '00:00', bossDanger: false });
        this.onFail('时间耗尽，被 Boss 追上了');
      } else {
        const txt = this.fmt(Math.ceil(this.bossTimeLeft));
        if (txt !== this._bossTxt) {
          this._bossTxt = txt;
          this.setData({ bossTimeText: txt, bossDanger: this.bossTimeLeft <= 10 });
        }
        if (this.bossTimeLeft <= 10) {
          const sec = Math.ceil(this.bossTimeLeft);
          if (sec !== this._bossSec) {
            this._bossSec = sec;
            if (sec > 0) { this.vibrate('light'); this.playSound('tick'); }
          }
        }
        // Boss 2.0：剩余时间过半 → 狂暴阶段（提速 + 召唤影卫），一次性
        if (this.bossPhase === 1 && this.bossTimeLeft <= this.bossTimeTotal / 2) {
          this.bossPhase = 2;
          this.bossStepMs = Math.max(200, Math.round(this.bossStepMs * 0.8));
          this.playSound('boss');
          this.vibrate('heavy');
          this.summonPatrol(1);
          this.setData({ bossRage: true, hint: 'Boss 狂暴！小心冲刺预警' });
        }
        // Boss 2.0：狂暴阶段周期性冲刺——先 1 秒红色预警，再沿 BFS 路径瞬移 3 格
        if (this.bossPhase === 2 && !this.dead) {
          const cloakedNow = this.fx && this.fx.cloak > 0;
          if (this.dashWarn && now >= this.dashWarn.until) {
            // 预警结束：执行冲刺
            const b = this.dashWarn.boss;
            const path = this.dashWarn.path;
            const jump = Math.min(3, path.length);
            const dest = path[jump - 1];
            b.x = dest.x;
            b.y = dest.y;
            this.spawnParticles(b.x, b.y, '#FF4D4D', 14, 0.006);
            this.shakeMag = this.reduceMotion ? 4 : 9;
            this.dashWarn = null;
            this.lastDash = now;
            this.vibrate('heavy');
          } else if (!this.dashWarn && !cloakedNow && now - (this.lastDash || 0) > 7000) {
            const b = this.findBoss();
            if (b) {
              const path = maze.bfsPath(this.maze.grid, { x: b.x, y: b.y }, { x: this.state.x, y: this.state.y });
              // 距离 2~5 格才冲（太近白冲、太远冲不到）
              if (path && path.length >= 2 && path.length <= 6) {
                this.dashWarn = {
                  cells: path.slice(0, Math.min(4, path.length)),
                  path: path,
                  until: now + 1000,
                  boss: b
                };
                this.playSound('warn');
                this.vibrate('medium');
              }
            }
          }
          // 玩家隐身：取消未发射的预警
          if (this.dashWarn && cloakedNow) this.dashWarn = null;
        }
      }
    }
    if (this.visual && this.state) {
      this.visual.x += (this.state.x - this.visual.x) * 0.4;
      this.visual.y += (this.state.y - this.visual.y) * 0.4;
      // 拖尾轨迹
      if (!this.trail) this.trail = [];
      this.trail.push({ x: this.visual.x, y: this.visual.y, t: now });
      while (this.trail.length && now - this.trail[0].t > 480) this.trail.shift();
      // 皮肤 vanity：移动时留下皮肤专属色微粒
      if (now - (this._vanityTick || 0) > 120) {
        const movedD = Math.abs(this.visual.x - this.state.x) + Math.abs(this.visual.y - this.state.y);
        if (movedD > 0.12) {
          this._vanityTick = now;
          this.spawnParticles(this.visual.x - 0.5, this.visual.y - 0.5, TRAIL_COLOR[this.theme] || '#FFD86E', 1, 0.0012);
        }
      }
    }
    // 粒子更新
    if (this.particles && this.particles.length) {
      const pdt = 16;
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx * pdt;
        p.y += p.vy * pdt;
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.life -= pdt;
        if (p.life <= 0) this.particles.splice(i, 1);
      }
    }
    // 开场淡入
    if (this.introT < 420) this.introT = Math.min(420, this.introT + 16);
    // 迷雾亮度平滑（朝目标插值：当前可见≈1，已探索暗记忆≈0.32，未探索=0）
    if (this.fogEnabled && this.fogLit && this.visual) {
      const m = this.maze;
      const pr = this.visual.x, pc = this.visual.y;
      const insight = now < (this.insightUntil || 0);
      const Rvis = insight ? 99 : 3.2; // 透视技能：全图显形
      for (let y = 0; y < m.H; y++) {
        for (let x = 0; x < m.W; x++) {
          let t;
          if (!this.seen[y][x]) t = 0;
          else {
            const dx = x - pr, dy = y - pc;
            const d = Math.sqrt(dx * dx + dy * dy);
            t = d <= Rvis ? (1 - 0.14 * (d / Rvis)) : 0.32;
          }
          const cur = this.fogLit[y][x];
          this.fogLit[y][x] = cur + (t - cur) * 0.12;
        }
      }
      // 玩家所在格始终清晰
      const pxi = Math.round(this.visual.x), pyi = Math.round(this.visual.y);
      if (this.fogLit[pyi] && this.fogLit[pyi][pxi] !== undefined) {
        this.fogLit[pyi][pxi] = Math.max(this.fogLit[pyi][pxi], 0.99);
      }
    }
    const frozen = this.data.showWin || this.data.showFail || this.data.tutorialOpen;
    if (!frozen && this.monsters) {
      this.updateMonsters(now);
      this.updateBullets();
      this.checkCollision();
    } else if (this.monsters) {
      for (let i = 0; i < this.monsters.length; i++) {
        const mm = this.monsters[i];
        mm.vx += (mm.x - mm.vx) * 0.35;
        mm.vy += (mm.y - mm.vy) * 0.35;
      }
    }
    // Boss 逼近时轻微震动（P4）：压迫感反馈
    if (this.bossOn && this.monsters && this.visual) {
      for (let i = 0; i < this.monsters.length; i++) {
        const bb = this.monsters[i];
        if (!bb.isBoss) continue;
        const bdx = bb.vx - this.visual.x;
        const bdy = bb.vy - this.visual.y;
        if (Math.sqrt(bdx * bdx + bdy * bdy) < 2.6) {
          this.shakeMag = Math.max(this.shakeMag || 0, this.reduceMotion ? 1 : 2.6);
        }
      }
    }
    // 屏幕震动（P4）：碰撞/失败/Boss 靠近时触发，逐帧衰减
    let shake = this.shakeMag || 0;
    if (shake > 0.2) {
      const amp = this.reduceMotion ? shake * 0.4 : shake;
      this._shakeX = (Math.random() * 2 - 1) * amp;
      this._shakeY = (Math.random() * 2 - 1) * amp;
      this.shakeMag = shake * 0.86;
    } else {
      this._shakeX = 0;
      this._shakeY = 0;
      this.shakeMag = 0;
    }
    this.draw();
  },

  updateTime() {
    if (this.data.showWin || this.data.showFail) return;
    const t = Math.floor((Date.now() - this.startTime) / 1000);
    this.setData({ timeText: this.fmt(t) });
  },

  fmt(t) {
    const m = Math.floor(t / 60);
    const s = t % 60;
    return (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
  },

  /* ============ 怪物系统（含警戒值） ============ */

  hasLOS(mx, my, px, py, grid) {
    if (mx !== px && my !== py) return false;
    if (mx === px) {
      const a = Math.min(my, py);
      const b = Math.max(my, py);
      for (let y = a + 1; y < b; y++) {
        if (grid[y][mx] !== 1) return false;
      }
    } else {
      const a = Math.min(mx, px);
      const b = Math.max(mx, px);
      for (let x = a + 1; x < b; x++) {
        if (grid[my][x] !== 1) return false;
      }
    }
    return true;
  },

  nearestPathIndex(m) {
    if (!m.path || !m.path.length) return 0;
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < m.path.length; i++) {
      const dx = m.x - m.path[i].x;
      const dy = m.y - m.path[i].y;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  },

  updateMonsters(now) {
    const grid = this.maze.grid;
    const px = this.state.x;
    const py = this.state.y;
    const frozen = this.fx && this.fx.freeze > 0;
    const cloaked = this.fx && this.fx.cloak > 0;
    // 诱饵（P7）：生效期间，追击/射击怪物把"感知目标"从玩家改为诱饵（Boss 无视诱饵）
    const decoyOn = this.fx && this.fx.decoy > 0 && this.decoyPos;
    const tx = decoyOn ? this.decoyPos.x : px;
    const ty = decoyOn ? this.decoyPos.y : py;
    // 满警戒（>=80）的怪物会加速追击
    let effMs = this.monsterStepMs;
    for (let i = 0; i < this.monsters.length; i++) {
      if (this.monsters[i].alert >= 80) {
        effMs = Math.min(effMs, this.monsterStepMs * 0.55);
      }
    }
    if (now - this.lastMonsterMove >= effMs) {
      this.lastMonsterMove = now;
      for (let i = 0; i < this.monsters.length; i++) {
        const m = this.monsters[i];
        if (m.isBoss) {
          // 逃跑 Boss（猎手反转关）：独立节拍逃窜
          if (m.flee && now - (m._lastMove || 0) >= this.fleeStepMs) {
            m._lastMove = now;
            this.stepFlee(m, grid, px, py);
          }
          continue; // 追击 Boss 走独立节拍
        }
        // 冰冻免疫：冰甲怪免疫冰冻（诱饵生效期间护甲被削弱才可冻）
        const canFreeze = !m.freezeRes || decoyOn;
        if (frozen && canFreeze) continue;
        if (m.isGatekeeper) {
          this.stepGatekeeper(m, grid, tx, ty);
          continue;
        }
        const los = !cloaked && m.behavior >= 1 && this.hasLOS(m.x, m.y, tx, ty, grid);
        if (los) {
          // 看到目标（玩家或诱饵）：警戒上升并记录最后位置
          m.alert = Math.min(100, m.alert + 26);
          m.lastSeen = { x: tx, y: ty };
          if (m.x === tx) {
            const ny = m.y + (ty > m.y ? 1 : -1);
            if (grid[ny] && grid[ny][m.x] === 1) m.y = ny;
          } else {
            const nx = m.x + (tx > m.x ? 1 : -1);
            if (grid[m.y] && grid[m.y][nx] === 1) m.x = nx;
          }
          m.chasing = true;
          // 首次进入追击：警戒音提示（P0 音效补全）
          if (!m._alerted) {
            m._alerted = true;
            this.playSound('alert');
          }
          if (m.behavior >= 2) {
            m.shootCd -= 1;
            if (m.shootCd <= 0) {
              this.spawnBullet(m, tx, ty);
              m.shootCd = this.bulletInterval;
            }
          }
        } else {
          // 看不到玩家：警戒缓慢衰减
          m.alert = Math.max(0, m.alert - 3);
          if (m.alert >= 45 && m.lastSeen) {
            // 警戒仍高：朝"最后看到的位置"搜索（沿自己走廊靠拢）
            let moved = false;
            if (m.x !== m.lastSeen.x && grid[m.y] && grid[m.y][m.x + (m.lastSeen.x > m.x ? 1 : -1)] === 1) {
              m.x += (m.lastSeen.x > m.x ? 1 : -1);
              moved = true;
            } else if (m.y !== m.lastSeen.y && grid[m.y + (m.lastSeen.y > m.y ? 1 : -1)] && grid[m.y + (m.lastSeen.y > m.y ? 1 : -1)][m.x] === 1) {
              m.y += (m.lastSeen.y > m.y ? 1 : -1);
              moved = true;
            } else {
              m.lastSeen = null; // 已抵达，停止搜索
            }
            if (moved && m.behavior >= 2) m.shootCd = Math.max(0, m.shootCd - 1);
          } else {
            // 警戒已凉：恢复常规巡逻（无巡逻路径的生存刷怪改为随机漫游）
            if (m.chasing) {
              m.pi = this.nearestPathIndex(m);
              m.chasing = false;
            }
            if (!m.path || !m.path.length) {
              const rdirs = maze.getOpenDirs(grid, m.x, m.y);
              if (rdirs.length) {
                const rd = rdirs[Math.floor(Math.random() * rdirs.length)];
                m.x += DIRV_MAP[rd][0];
                m.y += DIRV_MAP[rd][1];
              }
              if (m.behavior >= 2) m.shootCd = Math.max(0, m.shootCd - 1);
            } else {
              let ni = m.pi + m.pdir;
              if (ni >= m.path.length || ni < 0) {
                m.pdir *= -1;
                ni = m.pi + m.pdir;
                if (ni < 0 || ni >= m.path.length) ni = m.pi;
              }
              m.pi = ni;
              m.x = m.path[ni].x;
              m.y = m.path[ni].y;
              if (m.behavior >= 2) m.shootCd = Math.max(0, m.shootCd - 1);
            }
          }
        }
      }
    }
    // Boss 主动追击（独立节拍，不受巡逻节奏影响）
    if (this.bossOn && !frozen && now - (this.lastBossMove || 0) >= this.bossStepMs) {
      this.lastBossMove = now;
      for (let i = 0; i < this.monsters.length; i++) {
        const b = this.monsters[i];
        if (b.isBoss) this.stepBoss(b, grid, px, py, cloaked);
      }
    }
    for (let i = 0; i < this.monsters.length; i++) {
      const mm = this.monsters[i];
      mm.vx += (mm.x - mm.vx) * 0.35;
      mm.vy += (mm.y - mm.vy) * 0.35;
    }
  },

  // Boss 每步：可见则 BFS 直追玩家；隐身则前往最后已知位置，找不到则漫游
  findBoss() {
    if (!this.monsters) return null;
    for (let i = 0; i < this.monsters.length; i++) {
      if (this.monsters[i].isBoss) return this.monsters[i];
    }
    return null;
  },

  stepBoss(b, grid, px, py, cloaked) {
    b.alert = 100;
    b.chasing = true;
    const DIR = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
    if (cloaked) {
      if (b.lastSeen) {
        const step = maze.bfsStepToward(grid, { x: b.x, y: b.y }, b.lastSeen);
        if (step) {
          b.x += step.x; b.y += step.y;
          if (b.x === b.lastSeen.x && b.y === b.lastSeen.y) b.lastSeen = null;
        } else {
          b.lastSeen = null;
        }
      } else {
        const dirs = maze.getOpenDirs(grid, b.x, b.y);
        if (dirs.length) {
          const d = dirs[Math.floor(Math.random() * dirs.length)];
          b.x += DIR[d][0]; b.y += DIR[d][1];
        }
      }
      return;
    }
    b.lastSeen = { x: px, y: py };
    const step = maze.bfsStepToward(grid, { x: b.x, y: b.y }, { x: px, y: py });
    if (step) {
      b.x += step.x; b.y += step.y;
    }
  },

  // 逃跑 Boss（猎手反转关）：以玩家为源做 BFS 洪泛，向距离最大的相邻格逃窜
  stepFlee(m, grid, px, py) {
    const H = grid.length;
    const W = grid[0].length;
    const dist = {};
    const q = [[px, py]];
    dist[px + ',' + py] = 0;
    let head = 0;
    while (head < q.length) {
      const cur = q[head++];
      const cx = cur[0], cy = cur[1];
      const dirs = ['U', 'D', 'L', 'R'];
      for (let i = 0; i < dirs.length; i++) {
        const d = dirs[i];
        const nx = cx + (d === 'L' ? -1 : d === 'R' ? 1 : 0);
        const ny = cy + (d === 'U' ? -1 : d === 'D' ? 1 : 0);
        if (nx >= 0 && nx < W && ny >= 0 && ny < H && grid[ny][nx] === 1 && dist[nx + ',' + ny] === undefined) {
          dist[nx + ',' + ny] = dist[cx + ',' + cy] + 1;
          q.push([nx, ny]);
        }
      }
    }
    const DIRV = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
    const curKey = m.x + ',' + m.y;
    let bestDir = null;
    let bestD = dist[curKey] !== undefined ? dist[curKey] : -1;
    const dirs2 = ['U', 'D', 'L', 'R'];
    for (let i = 0; i < dirs2.length; i++) {
      const d = dirs2[i];
      const nx = m.x + DIRV[d][0];
      const ny = m.y + DIRV[d][1];
      if (nx < 0 || ny < 0 || ny >= H || nx >= W || grid[ny][nx] !== 1) continue;
      const dd = dist[nx + ',' + ny];
      // 不可达区域视为更安全（洪泛只在连通域内）；同分不偏移，保持确定性
      const eff = dd === undefined ? 1e9 : dd;
      if (eff > bestD) {
        bestD = eff;
        bestDir = d;
      }
    }
    if (bestDir) {
      m.x += DIRV[bestDir][0];
      m.y += DIRV[bestDir][1];
    }
  },

  // 守门怪：guard（静止警戒）→ chase（追击，离哨位 8 格回防）→ return（归位）
  stepGatekeeper(m, grid, tx, ty) {
    const dx = m.x - tx;
    const dy = m.y - ty;
    const pd = Math.sqrt(dx * dx + dy * dy);
    if (m.mode === 'guard') {
      if (pd <= 4.5) {
        m.mode = 'chase';
        m.chasing = true;
        m.alert = 100;
        if (!m._alerted) {
          m._alerted = true;
          this.playSound('alert');
          this.vibrate('light');
        }
      }
      return;
    }
    if (m.mode === 'chase') {
      const pdx = m.x - m.post.x;
      const pdy = m.y - m.post.y;
      if (Math.sqrt(pdx * pdx + pdy * pdy) > 8) {
        m.mode = 'return';
        m.chasing = false;
        return;
      }
      if (pd > 6) {
        // 玩家跑远：警戒衰减，衰减完回防
        m.alert = Math.max(0, m.alert - 8);
        if (m.alert <= 0) {
          m.mode = 'return';
          m.chasing = false;
          return;
        }
      }
      const step = maze.bfsStepToward(grid, { x: m.x, y: m.y }, { x: tx, y: ty });
      if (step) {
        m.x += step.x;
        m.y += step.y;
      }
      return;
    }
    // return：回哨位
    const pdx2 = m.x - m.post.x;
    const pdy2 = m.y - m.post.y;
    if (pdx2 === 0 && pdy2 === 0) {
      m.mode = 'guard';
      m.alert = 0;
      m._alerted = false;
      return;
    }
    const step2 = maze.bfsStepToward(grid, { x: m.x, y: m.y }, m.post);
    if (step2) {
      m.x += step2.x;
      m.y += step2.y;
    } else {
      m.mode = 'guard';
    }
  },

  spawnBullet(m, px, py) {
    let dx = 0;
    let dy = 0;
    if (m.x === px) dy = py > m.y ? 1 : -1;
    else dx = px > m.x ? 1 : -1;
    this.bullets.push({ x: m.x, y: m.y, dx: dx, dy: dy });
  },

  updateBullets() {
    if (this.fx && this.fx.freeze > 0) return; // 冰冻：子弹定身
    const grid = this.maze.grid;
    const sp = this.bulletSpeed;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.dx * sp;
      b.y += b.dy * sp;
      const cx = Math.round(b.x);
      const cy = Math.round(b.y);
      if (cx < 0 || cy < 0 || cy >= grid.length || cx >= grid[0].length || grid[cy][cx] !== 1) {
        this.bullets.splice(i, 1);
      }
    }
  },

  spawnParticles(gx, gy, color, count, speed) {
    if (!this.particles) this.particles = [];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (speed || 0.003) * (0.5 + Math.random());
      this.particles.push({
        x: gx + 0.5,
        y: gy + 0.5,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 380 + Math.random() * 320,
        maxLife: 700,
        color: color
      });
    }
  },

  checkCollision() {
    if (Date.now() < this.invulnUntil) return;
    const px = this.visual.x;
    const py = this.visual.y;
    for (let i = 0; i < this.monsters.length; i++) {
      const m = this.monsters[i];
      if (Math.abs(m.vx - px) < 0.5 && Math.abs(m.vy - py) < 0.5) {
        // 逃跑 Boss：撞上即抓捕（拿钥匙），不是死亡
        if (m.flee) {
          this.catchFleeBoss(m, i);
          return;
        }
        if (this.consumeShield()) return;
        this.onFail(m.isBoss ? '被迷宫之主抓住了' : '被怪物抓住了', m);
        return;
      }
    }
    for (let i = 0; i < this.bullets.length; i++) {
      const b = this.bullets[i];
      if (Math.abs(b.x - px) < 0.5 && Math.abs(b.y - py) < 0.5) {
        if (this.consumeShield()) { this.bullets.splice(i, 1); return; }
        this.onFail('被怪物子弹击中', null);
        return;
      }
    }
  },

  // 抓捕逃跑 Boss：获得钥匙，Boss 消失
  catchFleeBoss(m, idx) {
    this.hasKey = true;
    this.hunterCaught = true;
    this.monsters.splice(idx, 1);
    this.playSound('power');
    this.vibrate('medium');
    this.spawnParticles(m.x, m.y, '#FFD86E', 20, 0.006);
    this.spawnParticles(m.x, m.y, '#6FE3D2', 12, 0.005);
    this.setData({ hasKey: true, keyOn: true, hint: '抓住宝藏Boss！获得钥匙，前往终点！' });
  },

  consumeShield() {
    if (!this.shield) return false;
    this.shield = false;
    this.invulnUntil = Date.now() + 1300;
    this.playSound('power');
    this.vibrate('medium');
    this.spawnParticles(this.state.x, this.state.y, '#6EE7A0', 16, 0.005);
    this.syncFxUI();
    return true;
  },

  onFail(reason, monster) {
    if (this.data.showWin || this.data.showFail) return;
    // 时光沙漏：背包里有则自动消耗，回退 3 步并获得短暂无敌（挫败缓冲）
    if (this.bag) {
      for (let i = 0; i < this.bag.length; i++) {
        if (this.bag[i].type === 'hourglass') {
          const slot = this.bag[i];
          slot.count--;
          if (slot.count <= 0) this.bag.splice(i, 1);
          this.syncBagUI();
          this.doRewind(3, 2000);
          this.playSound('portal');
          this.vibrate('medium');
          this.spawnParticles(this.state.x, this.state.y, '#B8A9FF', 16, 0.005);
          this.setData({ hint: '时光沙漏发动！回溯 3 步' });
          storage.encounterCodex('item_hourglass');
          return;
        }
      }
    }
    this.dead = true;
    this.stepping = false;
    this.shakeMag = this.reduceMotion ? 5 : 12;
    this.playSound('fail');
    this.vibrate('heavy');
    // 生存模式：阵亡即结算，记录实际存活波数为最佳成绩
    if (this.survivalMode) {
      const st = storage.getStats();
      const reached = Math.max(1, this.wave);
      if (reached > (st.bestWave || 0)) {
        st.bestWave = reached;
        storage.saveStats(st);
      }
      if (reached >= 10) storage.tryU('survivor'); // 无尽生存：撑过 10 波解锁成就
    }
    // 死亡回顾：被谁抓 + 距出口还差几步 + 最优路径残影
    const review = this.buildDeathReview(monster);
    this.failPath = review.path;
    this.setData({
      showFail: true,
      failReason: reason,
      failHint: review.hint,
      failMonster: review.name,
      canRevive: !this.reviveUsed
    });
  },

  // 死亡回顾数据：{ name, hint, path }
  buildDeathReview(monster) {
    const out = {
      name: monster ? (monster.name || (monster.isBoss ? '迷宫之主' : '怪物')) : '',
      hint: '',
      path: null
    };
    try {
      if (this.survivalMode) {
        out.hint = '存活到第 ' + Math.max(1, this.wave) + ' 波' + (this.wave > (this._bestWaveShown || 0) ? ' · 新纪录！' : '');
        return out;
      }
      const grid = this.maze.grid;
      const from = { x: this.state.x, y: this.state.y };
      let path = null;
      if (this.maze.key && !this.hasKey) {
        const toKey = maze.bfsPath(grid, from, this.maze.key, 500);
        const toEnd = toKey ? maze.bfsPath(grid, this.maze.key, this.maze.end, 500) : null;
        if (toKey && toEnd) path = toKey.concat(toEnd);
      } else {
        path = maze.bfsPath(grid, from, this.maze.end, 500);
      }
      if (path && path.length) {
        out.path = path;
        const extra = path.length - (this.bestSteps || path.length);
        out.hint = '距出口还差 ' + path.length + ' 步' + (extra > 0 ? '（最优路线 ' + (this.bestSteps || '?') + ' 步）' : '');
      } else {
        out.hint = '出口近在咫尺，下次一定！';
      }
    } catch (e) {}
    return out;
  },

  // 回溯 n 步（沙漏 / 广告复活共用）
  doRewind(n, invulnMs) {
    const s = this.state;
    const back = Math.min(n, this.pathHistory.length);
    const target = back > 0 ? this.pathHistory[this.pathHistory.length - back] : { x: s.x, y: s.y };
    this.pathHistory.length = Math.max(0, this.pathHistory.length - back);
    s.x = target.x;
    s.y = target.y;
    s.dir = null;
    s.cameFrom = null;
    s.visited = {};
    s.visited[s.x + ',' + s.y] = true;
    this.visual.x = s.x;
    this.visual.y = s.y;
    this.stepping = false;
    this.waiting = false;
    this.dead = false;
    this.invulnUntil = Date.now() + (invulnMs || 1800);
    this.revealAround();
  },

  // 广告复活：失败面板点击 → 看广告 → 回退 3 步 + 无敌 2.5 秒（每局限一次）
  onReviveAd() {
    if (this.reviveUsed || !this.data.showFail) return;
    const that = this;
    const grant = function () {
      that.reviveUsed = true;
      that.setData({ showFail: false });
      that.dead = false;
      that.doRewind(3, 2500);
      // 生存模式：复活时把近身怪推远
      if (that.survivalMode) that.pushMonstersAway(8);
      that.playSound('portal');
      that.spawnParticles(that.state.x, that.state.y, '#FFD86E', 18, 0.006);
      that.setData({ hint: '复活成功！继续冒险' });
      that.startLoop();
    };
    if (ad.AD_DEV) {
      // DEV 模拟：直接发放（上线配置广告位后走真实激励视频）
      grant();
      return;
    }
    ad.showRewarded(function (ok) {
      if (ok) grant();
      else wx.showToast({ title: '广告未看完', icon: 'none' });
    });
  },

  // 生存模式复活：把距玩家 8 格内的怪传送到远处
  pushMonstersAway(minDist) {
    const grid = this.maze.grid;
    const px = this.state.x;
    const py = this.state.y;
    for (let i = 0; i < this.monsters.length; i++) {
      const m = this.monsters[i];
      const d = Math.abs(m.x - px) + Math.abs(m.y - py);
      if (d < minDist) {
        const far = this.findFarCells(px, py, minDist, 1);
        if (far.length) {
          m.x = far[0].x;
          m.y = far[0].y;
          if (m.path) m.pi = this.nearestPathIndex(m);
        }
      }
    }
  },

  // 找距玩家 BFS ≥ dist 的格子（生存模式刷怪/推怪用）
  findFarCells(px, py, minDist, want) {
    const grid = this.maze.grid;
    const H = grid.length;
    const W = grid[0].length;
    const dist = {};
    const q = [[px, py]];
    dist[px + ',' + py] = 0;
    let head = 0;
    while (head < q.length) {
      const cur = q[head++];
      const cx = cur[0], cy = cur[1];
      const dirs = ['U', 'D', 'L', 'R'];
      for (let i = 0; i < dirs.length; i++) {
        const d = dirs[i];
        const nx = cx + (d === 'L' ? -1 : d === 'R' ? 1 : 0);
        const ny = cy + (d === 'U' ? -1 : d === 'D' ? 1 : 0);
        if (nx >= 0 && nx < W && ny >= 0 && ny < H && grid[ny][nx] === 1 && dist[nx + ',' + ny] === undefined) {
          dist[nx + ',' + ny] = dist[cx + ',' + cy] + 1;
          q.push([nx, ny]);
        }
      }
    }
    const far = [];
    for (const k in dist) {
      if (dist[k] >= minDist) {
        const p = k.split(',');
        far.push({ x: +p[0], y: +p[1], d: dist[k] });
      }
    }
    far.sort(function (a, b) { return b.d - a.d; });
    return far.slice(0, want * 3);
  },

  // 生存模式：开启第 n 波
  startWave(n) {
    this.wave = n;
    this.waveTimeLeft = 20 + n * 4;
    const count = n + 1;
    const grid = this.maze.grid;
    const px = this.state.x;
    const py = this.state.y;
    const far = this.findFarCells(px, py, 8, count);
    let made = 0;
    for (let i = 0; i < far.length && made < count; i += 2) {
      const c = far[i];
      const m = {
        path: null,
        pi: 0,
        pdir: 1,
        behavior: n >= 2 ? (n >= 4 ? 2 : 1) : 1,
        x: c.x,
        y: c.y,
        vx: c.x,
        vy: c.y,
        shootCd: 3,
        chasing: true,
        alert: 100,
        lastSeen: null,
        waveSpawn: true,
        name: n >= 4 ? '狙击手' : '追猎者'
      };
      if (n >= 4) m.freezeRes = false;
      this.monsters.push(m);
      made++;
      this.spawnParticles(c.x, c.y, '#FF6B6B', 8, 0.004);
    }
    // 波间补给：随机道具落在远离玩家的位置
    if (n > 1) {
      const types = ['cloak', 'freeze', 'dash', 'shield', 'magnet', 'flare', 'decoy', 'hourglass'];
      const t = types[Math.floor(Math.random() * types.length)];
      const cells = this.findFarCells(px, py, 4, 1);
      if (cells.length) {
        const c = cells[0];
        const kk = c.x + ',' + c.y;
        if (!this.itemMap[kk]) {
          const it = { x: c.x, y: c.y, type: t, taken: false };
          this.items.push(it);
          this.itemMap[kk] = it;
        }
      }
    }
    this.playSound('warn');
    this.vibrate('medium');
    this.setData({ waveText: '第 ' + n + ' 波 · ' + Math.ceil(this.waveTimeLeft) + 's', hint: '第 ' + n + ' 波来袭！' });
  },

  /* ============ 收集物 / 道具 ============ */
  checkPickup() {
    if (!this.state || !this.itemMap) return;
    const key = this.state.x + ',' + this.state.y;
    const it = this.itemMap[key];
    if (!it || it.taken) return;
    it.taken = true;
    if (it.type === 'gem') {
      this.collected++;
      this.playSound('pick');
      this.spawnParticles(it.x, it.y, '#FFD86E', 8, 0.0035);
      this.setData({ gems: this.collected });
      storage.encounterCodex('gem');
      this.maybeChargeHourglass(1); // 虚空回响：每 3 光点充能时间回溯
    } else if (it.type === 'key') {
      this.hasKey = true;
      this.playSound('power');
      this.vibrate('medium');
      this.spawnParticles(it.x, it.y, '#FFD86E', 16, 0.006);
      this.setData({ hasKey: true });
      storage.encounterCodex('item_key');
    } else {
      // 装入背包：同类道具叠加计数，不同类占新槽位
      storage.encounterCodex('item_' + it.type);
      const col = FX_COLOR[it.type] || '#FF9F6E';
      // 先判断容量：背包满且无同类槽位时不消耗道具，避免原地反复触发反馈
      const canStack = this.bag.some(function (s) { return s.type === it.type; });
      if (this.bag.length >= BAG_MAX && !canStack) {
        it.taken = false;
        this.setData({ hint: '背包已满 · 先用掉一个道具' });
        return;
      }
      this.playSound('power');
      this.vibrate('light');
      this.spawnParticles(it.x, it.y, col, 12, 0.004);
      const slot = this.addToBag(it.type);
      if (slot) this.setData({ hint: '获得 ' + FX_LABEL[it.type] + ' ×' + slot.count });
      this.syncBagUI();
    }
  },

  // 虚空回响：集齐 3 光点充能 1 次时间回溯（hourglass 自动在被抓时发动）
  maybeChargeHourglass(n) {
    if (!this.voidZone) return;
    this.hourglassBank = (this.hourglassBank || 0) + (n || 1);
    while (this.hourglassBank >= 3) {
      const slot = this.addToBag('hourglass');
      if (!slot) { this.hourglassBank = 3; break; } // 背包满则保留计数，待有空位再给
      this.hourglassBank -= 3;
      this.syncBagUI();
      this.setData({ hint: '集齐 3 光点 · 时间回溯充能 +1' });
      this.playSound('power');
    }
  },

  // 背包：同类型叠加 count，不同类型占新槽位；满则返回 null
  addToBag(type) {
    for (let i = 0; i < this.bag.length; i++) {
      if (this.bag[i].type === type) {
        this.bag[i].count++;
        return this.bag[i];
      }
    }
    if (this.bag.length >= BAG_MAX) return null;
    const slot = { type: type, count: 1 };
    this.bag.push(slot);
    this.bagSel = this.bag.length - 1;
    return slot;
  },

  // 选中某个槽位
  onSelectItem(e) {
    const i = parseInt(e.currentTarget.dataset.i, 10);
    if (isNaN(i) || i < 0 || i >= this.bag.length) return;
    this.bagSel = i;
    this.playSound('click');
    this.syncBagUI();
  },

  // 背包 → 视图层
  syncBagUI() {
    const list = [];
    for (let i = 0; i < this.bag.length; i++) {
      const s = this.bag[i];
      const col = FX_COLOR[s.type] || '#FFFFFF';
      list.push({
        type: s.type,
        glyph: FX_GLYPH[s.type] || '?',
        label: FX_LABEL[s.type] || s.type,
        count: s.count,
        color: col,
        // 选中槽位底色（预先算好 rgba，避免依赖 CSS color-mix 的基础库支持）
        bg: i === this.bagSel ? hexToRgba(col, 0.32) : 'rgba(255,255,255,0.07)',
        sel: i === this.bagSel
      });
    }
    const sel = this.bag[this.bagSel];
    this.heldItem = sel ? sel.type : null;
    this.setData({
      bag: list,
      bagSel: this.bagSel,
      bagFull: this.bag.length >= BAG_MAX,
      heldItem: this.heldItem || ''
    });
  },

  // 查询某格是否为传送门：返回门下标（0/1），不是则 -1
  portalAt(x, y) {
    if (!this.portals) return -1;
    for (let i = 0; i < this.portals.length; i++) {
      if (this.portals[i].x === x && this.portals[i].y === y) return i;
    }
    return -1;
  },

  // 磁铁：生效期间自动吸附周围光点
  applyMagnet() {
    if (!this.items || !this.state) return;
    const px = this.state.x, py = this.state.y;
    const R = 2.6, r2 = R * R;
    let got = 0;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it.taken || it.type !== 'gem') continue;
      const dx = it.x - px, dy = it.y - py;
      if (dx * dx + dy * dy <= r2) {
        it.taken = true;
        this.collected++;
        got++;
        this.spawnParticles(it.x, it.y, '#FFD86E', 6, 0.003);
      }
    }
    if (got > 0) {
      this.playSound('pick');
      this.setData({ gems: this.collected });
      this.maybeChargeHourglass(got); // 虚空回响：磁铁吸到的光点也计入充能
    }
  },

  onUseItem() {
    const slot = this.bag[this.bagSel];
    if (!slot) return;
    const t = slot.type;
    // 沙漏：被动触发（被抓瞬间自动回溯），不支持手动使用
    if (t === 'hourglass') {
      this.setData({ hint: '时光沙漏会在被抓的瞬间自动生效' });
      return;
    }
    this.usedItem = true;
    if (t === 'shield') {
      // 护盾：使用后常驻，抵挡一次碰撞
      this.shield = true;
    } else if (t === 'freeze') {
      // 冰冻：冰甲怪免疫（诱饵生效期间被削弱才可冻）
      const hasRes = this.monsters && this.monsters.some(function (m) { return m.freezeRes && !m.isBoss; });
      if (hasRes && !(this.fx.decoy > 0)) {
        this.setData({ hint: '提示：场上有冰甲怪对冰冻免疫，先用诱饵削弱' });
      }
      const dur = Math.round(storage.fxDuration(t) * 1000);
      this.fx[t] = Math.min((this.fx[t] || 0) + dur, dur * 3);
    } else {
      // 强化等级决定实际时长（基础 + 每级增量）；重复使用则叠加剩余时间
      const dur = Math.round(storage.fxDuration(t) * 1000);
      this.fx[t] = Math.min((this.fx[t] || 0) + dur, dur * 3);
    }
    // 消耗一个
    slot.count--;
    if (slot.count <= 0) {
      this.bag.splice(this.bagSel, 1);
      if (this.bagSel >= this.bag.length) this.bagSel = Math.max(0, this.bag.length - 1);
    }
    this.playSound('power');
    this.vibrate('medium');
    if (t === 'flare') this.spawnParticles(this.state.x, this.state.y, '#FFF4D6', 16, 0.006);
    else if (t === 'magnet') this.spawnParticles(this.state.x, this.state.y, '#5EE6D8', 14, 0.005);
    else if (t === 'decoy') {
      // 诱饵：放在使用时的玩家格上，怪物（非 Boss）改追诱饵
      this.decoyPos = { x: this.state.x, y: this.state.y };
      this.spawnParticles(this.state.x, this.state.y, FX_COLOR.decoy, 14, 0.005);
    }
    this.syncFxUI();
    this.syncBagUI();
  },

  syncFxUI() {
    const chips = [];
    const keys = ['cloak', 'freeze', 'dash', 'magnet', 'flare', 'decoy'];
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (this.fx[k] > 0) chips.push({ type: k, label: FX_LABEL[k], sec: Math.ceil(this.fx[k] / 1000) });
    }
    if (this.shield) chips.push({ type: 'shield', label: FX_LABEL.shield, sec: '' });
    this.setData({ fxChips: chips });
  },

  /* ============ 玩法演示 ============ */
  startTutTimer() {
    const that = this;
    this.clearTutTimer();
    this.tutTimer = setInterval(function () {
      if (!that.data.tutorialOpen) return;
      that.setData({ tutStep: (that.data.tutStep + 1) % 3 });
    }, 3400);
  },
  clearTutTimer() {
    if (this.tutTimer) {
      clearInterval(this.tutTimer);
      this.tutTimer = null;
    }
  },
  onTutNext() {
    this.setData({ tutStep: (this.data.tutStep + 1) % 3 });
  },
  onTutPrev() {
    this.setData({ tutStep: (this.data.tutStep + 2) % 3 });
  },
  onTutClose() {
    this.clearTutTimer();
    storage.setTutorialSeen();
    this.setData({ tutorialOpen: false, swipeTip: true });
  },

  /* ============ 输入（滑动转向） ============ */
  onTouchStart(e) {
    const t = e.touches && e.touches[0];
    if (!t) return;
    this._sx = t.clientX;
    this._sy = t.clientY;
  },
  onTouchMove() {},
  onTouchEnd(e) {
    if (this.data.tutorialOpen || this.data.showWin || this.data.showFail) return;
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - this._sx;
    const dy = t.clientY - this._sy;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (Math.max(adx, ady) < 18) return;
    this.swipeDist += Math.max(adx, ady);
    this.swipeCount++;
    const d = adx > ady ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U');
    this.onSwipe(d);
  },
  onSwipe(d) {
    if (this.data.showWin || this.data.showFail || this.data.tutorialOpen) return;
    this.pendingDir = d;
    if (!this.stepping) this.tryConsumePending();
  },
  tryConsumePending() {
    if (!this.pendingDir || !this.state) return;
    const s = this.state;
    const d = this.pendingDir;
    if (this.canGo(d)) {
      this.pendingDir = null;
      this.inputDir(d);
    }
    // 方向暂不可走：保留缓冲，等走到可转向的位置再消费（不丢滑动）
  },

  // 目标方向是否可走：闸门关闭视为墙；撞向暗室假墙则撞开（不移动）
  canGo(d) {
    const s = this.state;
    if (!s) return false;
    const opens = maze.getOpenDirs(this.maze.grid, s.x, s.y, this.onewayMap);
    const nx = s.x + DIRV_MAP[d][0];
    const ny = s.y + DIRV_MAP[d][1];
    if (opens.indexOf(d) === -1) {
      // 前方是墙：若是未撞开的暗室假墙 → 撞开
      if (this.maze.grid[ny] && this.maze.grid[ny][nx] === 0 && this.secretMap && this.secretMap[nx + ',' + ny]) {
        this.breakSecret(nx, ny);
      }
      return false;
    }
    if (this.gateClosedAt(nx, ny)) {
      this.setData({ hint: '闸门关闭 · 等待开启' });
      return false;
    }
    return true;
  },

  // 某格闸门当前是否关闭
  gateClosedAt(x, y) {
    if (!this.gates) return false;
    for (let i = 0; i < this.gates.length; i++) {
      const g = this.gates[i];
      if (g.x === x && g.y === y && g._init && !g._open) return true;
    }
    return false;
  },

  // 撞开宝藏暗室：墙变通路，掉落光尘 + 随机道具
  breakSecret(x, y) {
    const sk = x + ',' + y;
    if (!this.secretMap || !this.secretMap[sk]) return;
    delete this.secretMap[sk];
    if (this.maze.secrets) {
      for (let i = 0; i < this.maze.secrets.length; i++) {
        const s2 = this.maze.secrets[i];
        if (s2.x === x && s2.y === y) s2.broken = true;
      }
    }
    this.maze.grid[y][x] = 1;
    storage.addDust(5);
    const types = ['cloak', 'freeze', 'dash', 'shield', 'magnet', 'flare', 'decoy', 'hourglass'];
    const t = types[Math.floor(Math.random() * types.length)];
    const it = { x: x, y: y, type: t, taken: false };
    this.items.push(it);
    this.itemMap[sk] = it;
    this.playSound('power');
    this.vibrate('heavy');
    this.spawnParticles(x, y, '#C9A96E', 18, 0.005);
    this.spawnParticles(x, y, '#FFD86E', 10, 0.004);
    this.revealAround();
    this.setData({ hint: '发现宝藏暗室！+5✦ 与一个道具' });
  },

  inputDir(d) {
    if (this.data.showWin || this.data.showFail || this.data.tutorialOpen || this.paused) return;
    if (!this.canGo(d)) return;
    const s = this.state;
    if (this.data.swipeTip) this.setData({ swipeTip: false });
    s.dir = d;
    s.atFork = false; // 玩家显式选向：解除路口等待
    s.visited = {};
    s.visited[s.x + ',' + s.y] = true;
    if (!this.stepping) {
      this.stepping = true;
      this.stepLoop();
    }
  },

  stepLoop() {
    const that = this;
    const s = this.state;
    // 行进中即时转向：缓冲的方向现在可走则立刻转（直行优先，不必等停下）
    if (this.pendingDir && s.dir !== null) {
      if (this.canGo(this.pendingDir)) {
        const d = this.pendingDir;
        this.pendingDir = null;
        if (d !== s.dir) {
          s.dir = d;
          s.cameFrom = OPPD[d];
          s.atFork = false;
          s.visited = {};
          s.visited[s.x + ',' + s.y] = true;
        }
      }
    }
    // 前方闸门已关闭：原地等待（每帧重查，开闸自动续行）
    if (s.dir !== null) {
      const nx = s.x + DIRV_MAP[s.dir][0];
      const ny = s.y + DIRV_MAP[s.dir][1];
      if (this.gateClosedAt(nx, ny)) {
        this.stepping = false;
        this.waiting = true;
        this.tryConsumePending();
        if (this.stepping) return;
        this.setData({ hint: '闸门关闭 · 等待开启' });
        return;
      }
    }
    const px = s.x;
    const py = s.y;
    const res = maze.step(s, this.maze.grid, this.onewayMap);
    // 单向滑梯：被强制改变方向离开单向格时给轻反馈
    if (this.onewayMap && this.onewayMap[px + ',' + py] && (s.x !== px || s.y !== py)) {
      this.spawnParticles(px, py, '#6FE3D2', 5, 0.003);
    }
    // 按实际位移计步：走进格子就计 1（修复分叉格漏计导致"实际步数 < 最优"）
    if (s.x !== px || s.y !== py) {
      this.steps++;
      // 位置历史（沙漏回溯 / 广告复活）与幽灵竞速采样
      this.pathHistory.push({ x: px, y: py });
      this.ghostPath.push({ t: (Date.now() - this.startTime) / 1000, x: s.x, y: s.y });
    }
    // 传送门（P7）：踩上门格瞬移到孪生门；冷却防止两门间来回弹
    if (this.portals && (s.x !== px || s.y !== py)) {
      const pi = this.portalAt(s.x, s.y);
      if (pi >= 0) {
        if (!this.portalCd) {
          const twin = this.portals[1 - pi];
          s.x = twin.x;
          s.y = twin.y;
          s.visited = {};
          s.visited[twin.x + ',' + twin.y] = true;
          this.portalCd = true;
          this.playSound('portal');
          this.vibrate('light');
          this.spawnParticles(px, py, '#7FD8FF', 8, 0.004);
          this.spawnParticles(twin.x, twin.y, '#C79BFF', 12, 0.005);
          this.setData({ hint: '传送！' });
        }
      } else {
        this.portalCd = false; // 已离开传送门格：解除冷却
      }
    }
    this.checkPickup();
    if (this.fx && this.fx.magnet > 0) this.applyMagnet();
    this.revealAround();
    if (res === 'won') {
      if ((this.maze.key || this.hunterMode) && !this.hasKey) {
        // 终点已上锁：未持钥匙不结算，提示返回取钥匙（终点为死路，可原路返回）
        this.stepping = false;
        this.waiting = true;
        this.setData({ hint: this.hunterMode ? '钥匙在宝藏Boss身上 · 先抓住它！' : '终点已上锁 · 滑动返回取钥匙' });
        return;
      }
      this.stepping = false;
      this.onWin();
      return;
    }
    if (res === 'wait') {
      this.stepping = false;
      this.waiting = true;
      this.tryConsumePending();
      if (this.stepping) return;
      this.setData({ hint: '路口 · 滑动选择方向' });
      return;
    }
    this.waiting = false;
    this.setData({ hint: '' });
    const ms = (this.fx && this.fx.dash > 0) ? Math.max(45, this.stepMs * 0.5) : this.stepMs;
    setTimeout(function () {
      if (that.stepping) that.stepLoop();
    }, ms);
  },

  // 标记玩家周围为已探索（迷雾模式）
  revealAround() {
    if (!this.fogEnabled || !this.state) return;
    const m = this.maze;
    const px = this.state.x, py = this.state.y;
    const R = (this.fx && this.fx.flare > 0) ? 7.6 : (this.darkMode ? 1.9 : 3.6); // 照明弹扩大 / 夜幕减半
    const r2 = R * R;
    const x0 = Math.max(0, Math.floor(px - R));
    const x1 = Math.min(m.W - 1, Math.ceil(px + R));
    const y0 = Math.max(0, Math.floor(py - R));
    const y1 = Math.min(m.H - 1, Math.ceil(py + R));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - px, dy = y - py;
        if (dx * dx + dy * dy <= r2) this.seen[y][x] = true;
      }
    }
  },

  onWin() {
    // 生存模式：独立结算
    if (this.survivalMode) return this.onSurvivalWin();
    const that = this;
    // 通关粒子爆发
    this.spawnParticles(this.state.x, this.state.y, '#FFD86E', 14, 0.006);
    this.spawnParticles(this.state.x, this.state.y, '#6FE3D2', 14, 0.005);
    const t = Math.floor((Date.now() - this.startTime) / 1000);
    const steps = this.steps;
    const swipe = this.swipeCount;
    const best = this.bestSteps || 1;
    // 评分标准：步数接近最优 / 操作次数少 / 用时短
    const parTime = Math.max(8, Math.round(best * 0.45));
    const stepOK = steps <= best * 1.35;
    // 直行优先后滑动次数大幅下降：达标线由 best/3 收紧至 best/6
    const swipeOK = swipe <= Math.max(3, Math.round(best / 6));
    const timeOK = t <= parTime;
    const cnt = (stepOK ? 1 : 0) + (swipeOK ? 1 : 0) + (timeOK ? 1 : 0);
    const stars = cnt >= 3 ? 3 : cnt >= 2 ? 2 : 1;
    const gemTotal = this.gemTotal;
    const gems = this.collected;
    const perfect = gemTotal > 0 && gems === gemTotal;
    // 光尘收益：首通全额，复刷 50% 衰减（至少 1）；每日挑战给保底奖励；周挑战每关固定 10✦
    const firstClear = !storage.getProgress().completed[this.level];
    let dustEarn = this.dailyMode ? Math.max(3, gems) : (firstClear ? gems : Math.max(1, Math.floor(gems / 2)));
    let weeklyBonus = 0;
    if (this.weeklyMode) {
      const doneArr = storage.completeWeekLevel(weekly.weekKey(), this.weeklyIdx);
      dustEarn = 10;
      const allDone = doneArr.every(function (d) { return d; });
      if (allDone && !this._weeklyBonusGiven) {
        this._weeklyBonusGiven = true;
        weeklyBonus = 30;
        dustEarn += 30;
      }
    }
    storage.addDust(dustEarn);
    // 幽灵竞速：每日挑战保存本机最佳路线
    if (this.dailyMode && this.ghostPath.length > 2) {
      const ghostSaved = storage.saveGhost(storage.dailyKey(), this.ghostPath, t);
      if (ghostSaved) this.ghost = null; // 本局成为新幽灵，不再显示旧幽灵
    }
    // 微信云存储打点（好友排行预留）
    if (!this.dailyMode && !this.weeklyMode && !this.customMode) {
      storage.reportScoreKV(this.level, t);
    }
    const rec = { time: t, steps: steps, swipe: swipe, stars: stars, gems: gems, gemTotal: gemTotal };
    // 每日 / 周挑战 / 挑战码自定义不写入主线进度
    let r = { isNew: false };
    if (!this.dailyMode && !this.weeklyMode && !this.customMode) r = storage.completeLevel(this.level, rec);
    // 每日挑战：记录当日最佳 + 维护连续天数
    let dailyInfo = null;
    if (this.dailyMode) dailyInfo = storage.completeDaily(storage.dailyKey(), rec);
    // 统计 + 成就解锁
    const newAch = storage.recordWin(this.level, {
      stars: stars,
      timeOK: timeOK,
      perfect: perfect,
      usedItem: this.usedItem,
      boss: this.bossOn,
      hunter: this.hunterMode && this.hunterCaught,
      gems: gems,
      dust: dustEarn
    });
    const achNames = [];
    for (let i = 0; i < newAch.length; i++) achNames.push(newAch[i].name);
    if (dailyInfo && dailyInfo.newAch) {
      for (let i = 0; i < dailyInfo.newAch.length; i++) achNames.push(dailyInfo.newAch[i]);
    }
    if (achNames.length) this.showAchToast(achNames);
    this.playSound('win');
    this.vibrate('medium');
    this.setData({
      showWin: true,
      winTime: this.fmt(t),
      isNew: this.dailyMode ? !!(dailyInfo && dailyInfo.better) : r.isNew,
      dailyStreak: dailyInfo ? dailyInfo.streak : 0,
      weeklyBonus: weeklyBonus,
      weeklyTag: this.weeklyMode,
      stars: stars,
      mTime: t,
      mSteps: steps,
      mSwipe: swipe,
      stepOK: stepOK,
      swipeOK: swipeOK,
      timeOK: timeOK,
      bestSteps: best,
      gems: gems,
      gemTotal: gemTotal,
      perfect: perfect,
      dustEarn: dustEarn,
      canDouble: this.dailyMode && !this._doubleClaimed,
      doubleClaimed: false,
      hasReplay: that.ghostPath.length > 1
    }, function () {
      that.drawReplay();
    });
  },

  // 结算路径回放（#62）：把本次 ghostPath 缩略绘制成路线图
  drawReplay() {
    const path = this.ghostPath;
    if (!path || path.length < 2) return;
    const that = this;
    wx.createSelectorQuery()
      .select('#replay')
      .fields({ node: true, size: true })
      .exec(function (res) {
        if (!res || !res[0] || !res[0].node) return;
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        let dpr = 2;
        try { dpr = wx.getWindowInfo().pixelRatio || 2; } catch (e) {}
        const w = res[0].width;
        const h = res[0].height;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);
        that.replayCanvas = canvas;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#14132C';
        that.roundRect(ctx, 0, 0, w, h, 16);
        ctx.fill();
        let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
        for (let i = 0; i < path.length; i++) {
          const p = path[i];
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
        const pad = 18;
        const spanX = Math.max(1, maxX - minX);
        const spanY = Math.max(1, maxY - minY);
        const s = Math.min((w - 2 * pad) / spanX, (h - 2 * pad) / spanY);
        const ox = (w - spanX * s) / 2 - minX * s;
        const oy = (h - spanY * s) / 2 - minY * s;
        const tx = function (x) { return ox + x * s; };
        const ty = function (y) { return oy + y * s; };
        // 路线折线（金色）
        ctx.strokeStyle = '#FFD86E';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(tx(path[0].x), ty(path[0].y));
        for (let i = 1; i < path.length; i++) ctx.lineTo(tx(path[i].x), ty(path[i].y));
        ctx.stroke();
        // 起点（薄荷）/ 终点（粉）
        ctx.fillStyle = '#6FE3D2';
        ctx.beginPath();
        ctx.arc(tx(path[0].x), ty(path[0].y), 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FF7A92';
        ctx.beginPath();
        ctx.arc(tx(path[path.length - 1].x), ty(path[path.length - 1].y), 5, 0, Math.PI * 2);
        ctx.fill();
      });
  },

  // 保存路线分享图（#62）：导出临时图片并拉起分享菜单
  onSaveShare() {
    if (!this.replayCanvas) {
      wx.showToast({ title: '路线图生成中', icon: 'none' });
      return;
    }
    const that = this;
    wx.canvasToTempFilePath({
      canvas: this.replayCanvas,
      success: function (r) {
        wx.showShareImageMenu({ path: r.tempFilePath });
      },
      fail: function () {
        wx.showToast({ title: '分享图生成失败', icon: 'none' });
      }
    });
  },

  // 每日挑战双倍光尘（广告点位 2）
  onDoubleDust() {
    if (this._doubleClaimed || !this.data.showWin || !this.data.canDouble) return;
    const that = this;
    const grant = function () {
      that._doubleClaimed = true;
      const base = that.data.dustEarn;
      storage.addDust(base);
      that.playSound('achv');
      that.spawnParticles(that.state.x, that.state.y, '#FFD86E', 20, 0.006);
      that.setData({ dustEarn: base * 2, canDouble: false, doubleClaimed: true });
    };
    if (ad.AD_DEV) {
      grant();
      return;
    }
    ad.showRewarded(function (ok) {
      if (ok) grant();
      else wx.showToast({ title: '广告未看完', icon: 'none' });
    });
  },

  // 生存模式结算
  onSurvivalWin() {
    this.stopLoop();
    const t = Math.floor((Date.now() - this.startTime) / 1000);
    const dustEarn = 25;
    storage.addDust(dustEarn);
    const st = storage.getStats();
    const waveRecord = this.wave > (st.bestWave || 0);
    st.bestWave = Math.max(st.bestWave || 0, this.wave);
    storage.saveStats(st);
    const newAch = storage.recordWin(0, {
      stars: 3,
      timeOK: true,
      perfect: false,
      usedItem: this.usedItem,
      boss: false,
      survival: true,
      gems: this.collected,
      dust: dustEarn
    });
    const achNames = [];
    for (let i = 0; i < newAch.length; i++) achNames.push(newAch[i].name);
    if (achNames.length) this.showAchToast(achNames);
    this.playSound('win');
    this.vibrate('medium');
    this.spawnParticles(this.state.x, this.state.y, '#6FE3D2', 20, 0.006);
    this.setData({
      showWin: true,
      winTime: this.fmt(t),
      isNew: waveRecord,
      survivalTag: true,
      stars: 3,
      stepOK: true,
      swipeOK: true,
      timeOK: true,
      gems: this.collected,
      gemTotal: this.gemTotal,
      dustEarn: dustEarn,
      canDouble: false,
      failHint: '',
      hint: ''
    });
  },

  // 主动技使用（技能树 2.0）
  onUseSkill(e) {
    const k = e.currentTarget.dataset.k;
    if (!this.skillOwned || !this.skillOwned[k] || this.skillUses[k] <= 0) return;
    if (this.data.showWin || this.data.showFail || this.data.tutorialOpen || this.paused || this.dead) return;
    if (k === 'dash') {
      const s = this.state;
      const d = s.dir || this.pendingDir;
      if (!d) {
        this.setData({ hint: '先滑动选定方向，再使用闪现步' });
        return;
      }
      const nx = s.x + DIRV_MAP[d][0];
      const ny = s.y + DIRV_MAP[d][1];
      if (this.maze.grid[ny] && this.maze.grid[ny][nx] === 1 && !this.gateClosedAt(nx, ny)) {
        this.pathHistory.push({ x: s.x, y: s.y });
        s.x = nx;
        s.y = ny;
        s.visited = {};
        s.visited[nx + ',' + ny] = true;
        this.visual.x = nx;
        this.visual.y = ny;
        this.steps++;
        this.ghostPath.push({ t: (Date.now() - this.startTime) / 1000, x: nx, y: ny });
        this.skillUses.dash--;
        this.playSound('portal');
        this.vibrate('medium');
        this.spawnParticles(nx, ny, '#FF9F6E', 12, 0.005);
        this.checkPickup();
        this.revealAround();
        if (maze.isEnd(this.maze.grid, nx, ny) && (this.hasKey || !(this.maze.key || this.hunterMode))) this.onWin();
      } else {
        this.setData({ hint: '闪现目标被挡住了' });
        return;
      }
    } else if (k === 'insight') {
      this.skillUses.insight--;
      this.insightUntil = Date.now() + 3000;
      this.playSound('power');
      this.spawnParticles(this.state.x, this.state.y, '#9B8CFF', 16, 0.005);
      this.setData({ hint: '透视！迷雾全图显形 3 秒' });
    } else {
      return;
    }
    this.setData({ skillDashN: this.skillUses.dash, skillInsightN: this.skillUses.insight });
  },

  // 成就解锁浮层（P3）
  showAchToast(names) {
    if (!names || !names.length) return;
    this.setData({ achToast: true, achToastNames: names });
    this.playSound('achv');
    const that = this;
    if (this._achTimer) clearTimeout(this._achTimer);
    this._achTimer = setTimeout(function () {
      that.setData({ achToast: false, achToastNames: [] });
    }, 2800);
  },

  onRestart() {
    this.playSound('click');
    // 生存模式：重开 = 重新进入（换随机种子）
    if (this.survivalMode) {
      wx.redirectTo({ url: '/pages/game/game?survival=1' });
      return;
    }
    // 挑战码自定义：保留词缀重开
    if (this.customMode && this.customMods && this.customMods.length) {
      wx.redirectTo({ url: '/pages/game/game?level=' + this.weekPlan.level + '&mods=' + this.customMods.join(',') });
      return;
    }
    this.initLevel();
  },

  onNext() {
    this.playSound('click');
    // 周挑战：进入本周下一关，打完 5 关返回首页
    if (this.weeklyMode) {
      if (this.weeklyIdx < 4) {
        wx.redirectTo({ url: '/pages/game/game?weekly=' + (this.weeklyIdx + 1) });
      } else {
        wx.navigateBack();
      }
      return;
    }
    if (this.level >= storage.TOTAL) {
      wx.navigateBack();
      return;
    }
    wx.redirectTo({ url: '/pages/game/game?level=' + (this.level + 1) });
  },

  onBack() {
    wx.navigateBack();
  },

  /* ============ 渲染 ============ */
  draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    const m = this.maze;
    const cell = this.cell;
    const offX = this.offX;
    const offY = this.offY;
    const now = Date.now() / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(now * Math.PI * 1.6);

    ctx.clearRect(0, 0, this.cw, this.ch);
    ctx.fillStyle = '#15132E';
    ctx.fillRect(0, 0, this.cw, this.ch);
    // 开场淡入
    const introA = this.introT === undefined ? 1 : Math.min(1, this.introT / 420);
    if (introA < 1) ctx.globalAlpha = introA;
    // 屏幕震动偏移（P4）
    ctx.save();
    ctx.translate(this._shakeX || 0, this._shakeY || 0);

    // 路径走廊
    ctx.fillStyle = '#2B2A52';
    for (let y = 0; y < m.H; y++) {
      for (let x = 0; x < m.W; x++) {
        if (m.grid[y][x] === 1) {
          ctx.fillRect(offX + x * cell, offY + y * cell, cell, cell);
        }
      }
    }

    // 已走过轨迹（薄荷青微光）
    if (this.state && this.state.visited) {
      ctx.fillStyle = this.highContrast ? 'rgba(111,227,210,0.34)' : 'rgba(111,227,210,0.16)';
      const keys = Object.keys(this.state.visited);
      for (let i = 0; i < keys.length; i++) {
        const p = keys[i].split(',');
        const vx = parseInt(p[0], 10);
        const vy = parseInt(p[1], 10);
        ctx.beginPath();
        ctx.arc(offX + (vx + 0.5) * cell, offY + (vy + 0.5) * cell, cell * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 怪物巡逻走廊（危险淡红，帮助预判；迷雾模式下隐藏以免泄漏路线）
    if (this.monsters && !this.fogEnabled) {
      ctx.fillStyle = 'rgba(255,90,110,0.10)';
      for (let i = 0; i < this.monsters.length; i++) {
        const path = this.monsters[i].path;
        if (!path) continue; // Boss 无巡逻路径
        for (let j = 0; j < path.length; j++) {
          ctx.fillRect(offX + path[j].x * cell, offY + path[j].y * cell, cell, cell);
        }
      }
    }

    // 起点
    ctx.save();
    ctx.shadowColor = 'rgba(111,227,210,0.9)';
    ctx.shadowBlur = 14 + pulse * 12;
    ctx.fillStyle = '#6FE3D2';
    this.roundRect(ctx, offX + m.start.x * cell, offY + m.start.y * cell, cell, cell, cell * 0.22);
    ctx.fill();
    ctx.restore();

    // 终点 / 锁门
    const ex = m.end.x, ey = m.end.y;
    const locked = (this.maze.key || this.hunterMode) && !this.hasKey;
    if (locked) {
      // 上锁终点：暗格 + 金色挂锁
      ctx.save();
      ctx.fillStyle = 'rgba(18,16,38,0.92)';
      this.roundRect(ctx, offX + ex * cell, offY + ey * cell, cell, cell, cell * 0.22);
      ctx.fill();
      const lcx = offX + (ex + 0.5) * cell, lcy = offY + (ey + 0.5) * cell;
      ctx.strokeStyle = 'rgba(255,216,110,0.85)';
      ctx.lineWidth = Math.max(2, cell * 0.07);
      ctx.beginPath();
      ctx.arc(lcx, lcy - cell * 0.06, cell * 0.12, Math.PI, 0);
      ctx.stroke();
      ctx.fillStyle = '#FFD86E';
      ctx.fillRect(lcx - cell * 0.16, lcy - cell * 0.02, cell * 0.32, cell * 0.26);
      ctx.fillStyle = '#16213A';
      ctx.beginPath();
      ctx.arc(lcx, lcy + cell * 0.1, cell * 0.04, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      ctx.save();
      ctx.shadowColor = 'rgba(255,122,146,0.9)';
      ctx.shadowBlur = 14 + pulse * 12;
      ctx.fillStyle = '#FF7A92';
      this.roundRect(ctx, offX + ex * cell, offY + ey * cell, cell, cell, cell * 0.22);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(offX + (ex + 0.5) * cell, offY + (ey + 0.5) * cell, cell * 0.2, 0, Math.PI * 2);
      ctx.fill();

      // 终点传送门（双弧旋转）
      const pcx = offX + (ex + 0.5) * cell;
      const pcy = offY + (ey + 0.5) * cell;
      const rot = (Date.now() / 1000) % (Math.PI * 2);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,122,146,' + (0.5 + pulse * 0.3) + ')';
      ctx.lineWidth = Math.max(2, cell * 0.07);
      ctx.lineCap = 'round';
      for (let k = 0; k < 2; k++) {
        ctx.beginPath();
        ctx.arc(pcx, pcy, cell * (0.42 + k * 0.14), rot + k * Math.PI * 0.7, rot + k * Math.PI * 0.7 + Math.PI * 0.8);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 传送门（P7）：双门异色漩涡，成对呼应（迷雾未探索时不显示）
    if (this.portals) {
      const prot = (Date.now() / 700) % (Math.PI * 2);
      const PCOL = ['#7FD8FF', '#C79BFF'];
      for (let i = 0; i < this.portals.length; i++) {
        const p = this.portals[i];
        if (this.fogEnabled && (!this.seen[p.y] || !this.seen[p.y][p.x])) continue;
        const pcx = offX + (p.x + 0.5) * cell;
        const pcy = offY + (p.y + 0.5) * cell;
        ctx.save();
        ctx.strokeStyle = PCOL[i];
        ctx.shadowColor = PCOL[i];
        ctx.shadowBlur = 12 + pulse * 10;
        ctx.lineWidth = Math.max(2, cell * 0.07);
        ctx.lineCap = 'round';
        const spin = i === 0 ? prot : -prot;
        for (let k = 0; k < 2; k++) {
          ctx.beginPath();
          ctx.arc(pcx, pcy, cell * (0.3 + k * 0.13), spin + k * Math.PI * 0.8, spin + k * Math.PI * 0.8 + Math.PI * 0.9);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(pcx, pcy, cell * 0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // 单向门（P2）：青色箭头标注离开方向
    if (this.maze.oneways && this.maze.oneways.length) {
      const OCOL = 'rgba(111,227,210,0.9)';
      const AV = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
      for (let i = 0; i < this.maze.oneways.length; i++) {
        const o = this.maze.oneways[i];
        if (this.fogEnabled && (!this.seen[o.y] || !this.seen[o.y][o.x])) continue;
        const ox = offX + (o.x + 0.5) * cell;
        const oy = offY + (o.y + 0.5) * cell;
        const v = AV[o.dir];
        ctx.save();
        ctx.strokeStyle = OCOL;
        ctx.fillStyle = OCOL;
        ctx.lineWidth = Math.max(2, cell * 0.08);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ox - v[0] * cell * 0.22, oy - v[1] * cell * 0.22);
        ctx.lineTo(ox + v[0] * cell * 0.22, oy + v[1] * cell * 0.22);
        ctx.stroke();
        // 箭头头部
        const hx = ox + v[0] * cell * 0.26;
        const hy = oy + v[1] * cell * 0.26;
        const pw = cell * 0.12;
        ctx.beginPath();
        ctx.moveTo(hx + v[0] * pw, hy + v[1] * pw);
        ctx.lineTo(hx - v[1] * pw - v[0] * pw * 0.4, hy + v[0] * pw - v[1] * pw * 0.4);
        ctx.lineTo(hx + v[1] * pw - v[0] * pw * 0.4, hy - v[0] * pw - v[1] * pw * 0.4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // 动态闸门（P9）：开放=边框微光，关闭=能量横杆，切换前 0.8s 金色预警闪烁
    if (this.gates && this.gates.length) {
      for (let i = 0; i < this.gates.length; i++) {
        const g = this.gates[i];
        if (this.fogEnabled && (!this.seen[g.y] || !this.seen[g.y][g.x])) continue;
        const gx = offX + g.x * cell;
        const gy = offY + g.y * cell;
        const warnC = 'rgba(255,216,110,' + (0.45 + 0.5 * Math.abs(Math.sin(Date.now() / 90))) + ')';
        ctx.save();
        if (g._open) {
          ctx.strokeStyle = g._warn ? warnC : 'rgba(143,163,200,0.5)';
          ctx.lineWidth = Math.max(2, cell * 0.08);
          ctx.strokeRect(gx + cell * 0.15, gy + cell * 0.15, cell * 0.7, cell * 0.7);
        } else {
          ctx.strokeStyle = g._warn ? warnC : 'rgba(143,163,200,0.95)';
          ctx.lineWidth = Math.max(2, cell * 0.09);
          ctx.lineCap = 'round';
          for (let k = 0; k < 3; k++) {
            const yy = gy + cell * (0.25 + k * 0.25);
            ctx.beginPath();
            ctx.moveTo(gx + cell * 0.12, yy);
            ctx.lineTo(gx + cell * 0.88, yy);
            ctx.stroke();
          }
        }
        ctx.restore();
      }
    }

    // 宝藏暗室（P9）：未撞开的假墙带暗金色菱形微光（提示可撞）
    if (this.maze.secrets && this.maze.secrets.length) {
      for (let i = 0; i < this.maze.secrets.length; i++) {
        const sc = this.maze.secrets[i];
        if (sc.broken) continue;
        if (this.fogEnabled && (!this.seen[sc.y] || !this.seen[sc.y][sc.x])) continue;
        const scx = offX + (sc.x + 0.5) * cell;
        const scy = offY + (sc.y + 0.5) * cell;
        ctx.save();
        ctx.fillStyle = 'rgba(201,169,110,' + (0.4 + pulse * 0.3) + ')';
        const sr = cell * 0.14;
        ctx.beginPath();
        ctx.moveTo(scx, scy - sr);
        ctx.lineTo(scx + sr, scy);
        ctx.lineTo(scx, scy + sr);
        ctx.lineTo(scx - sr, scy);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // Boss 冲刺预警（Boss 2.0）：红色闪烁格子
    if (this.dashWarn) {
      const blink = 0.28 + 0.3 * Math.abs(Math.sin(Date.now() / 110));
      for (let i = 0; i < this.dashWarn.cells.length; i++) {
        const c = this.dashWarn.cells[i];
        ctx.fillStyle = 'rgba(255,77,77,' + blink + ')';
        ctx.fillRect(offX + c.x * cell + 2, offY + c.y * cell + 2, cell - 4, cell - 4);
      }
    }

    // 视线预警线（追击/射击怪物；迷雾下仅当怪物已暴露时显示）
    if (this.monsters && !this.data.tutorialOpen) {
      for (let i = 0; i < this.monsters.length; i++) {
        const mm = this.monsters[i];
        if (this.fogEnabled && (!this.seen[mm.y] || !this.seen[mm.y][mm.x])) continue;
        if (mm.behavior >= 1 && this.hasLOS(mm.x, mm.y, this.state.x, this.state.y, m.grid)) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255,90,110,' + (0.22 + pulse * 0.22) + ')';
          ctx.lineWidth = Math.max(2, cell * 0.06);
          ctx.setLineDash([cell * 0.16, cell * 0.16]);
          ctx.beginPath();
          ctx.moveTo(offX + (mm.vx + 0.5) * cell, offY + (mm.vy + 0.5) * cell);
          ctx.lineTo(offX + (this.visual.x + 0.5) * cell, offY + (this.visual.y + 0.5) * cell);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // 收集物 / 道具
    this.drawItems(ctx, cell, offX, offY, pulse);

    // 幽灵竞速：本机最佳路线的半透明残影
    if (this.ghostPos) {
      const gpx = offX + (this.ghostPos.x + 0.5) * cell;
      const gpy = offY + (this.ghostPos.y + 0.5) * cell;
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#FFD86E';
      ctx.beginPath();
      ctx.arc(gpx, gpy, cell * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = 'rgba(255,216,110,0.6)';
      ctx.lineWidth = Math.max(1, cell * 0.05);
      ctx.stroke();
      ctx.restore();
    }

    // 死亡回顾：失败面板打开时显示距出口的最优路径（金色虚线）
    if (this.data.showFail && this.failPath && this.failPath.length) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,216,110,0.7)';
      ctx.lineWidth = Math.max(2, cell * 0.09);
      ctx.setLineDash([cell * 0.22, cell * 0.2]);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(offX + (this.state.x + 0.5) * cell, offY + (this.state.y + 0.5) * cell);
      for (let i = 0; i < this.failPath.length; i++) {
        ctx.lineTo(offX + (this.failPath[i].x + 0.5) * cell, offY + (this.failPath[i].y + 0.5) * cell);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 诱饵（P7）：放在世界坐标上的粉色诱饵标记，脉动呼吸
    if (this.fx && this.fx.decoy > 0 && this.decoyPos) {
      const dp = this.decoyPos;
      if (!this.fogEnabled || (this.seen[dp.y] && this.seen[dp.y][dp.x])) {
        const dcx = offX + (dp.x + 0.5) * cell;
        const dcy = offY + (dp.y + 0.5) * cell;
        ctx.save();
        ctx.globalAlpha = 0.75 + pulse * 0.25;
        ctx.shadowColor = FX_COLOR.decoy;
        ctx.shadowBlur = 12 + pulse * 12;
        ctx.fillStyle = FX_COLOR.decoy;
        this.diamond(ctx, dcx, dcy, cell * 0.28);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold ' + Math.round(cell * 0.3) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('饵', dcx, dcy + cell * 0.02);
        ctx.restore();
      }
    }

    // 怪物
    if (this.monsters) {
      for (let i = 0; i < this.monsters.length; i++) {
        const mb = this.monsters[i];
        if (mb.isBoss) this.drawBoss(ctx, mb, cell, offX, offY, pulse);
        else this.drawMonster(ctx, mb, cell, offX, offY, pulse);
      }
    }

    // 子弹
    if (this.bullets && this.bullets.length) {
      ctx.save();
      ctx.shadowColor = 'rgba(255,120,90,0.9)';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#FF8A5A';
      for (let i = 0; i < this.bullets.length; i++) {
        const b = this.bullets[i];
        ctx.beginPath();
        ctx.arc(offX + (b.x + 0.5) * cell, offY + (b.y + 0.5) * cell, cell * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Boss 危险暗角（P2/P4）：Boss 越近，红色警示越浓
    if (this.bossOn && this.monsters && this.visual) {
      let boss = null;
      for (let i = 0; i < this.monsters.length; i++) {
        if (this.monsters[i].isBoss) { boss = this.monsters[i]; break; }
      }
      if (boss) {
        const ddx = boss.vx - this.visual.x;
        const ddy = boss.vy - this.visual.y;
        const dist = Math.sqrt(ddx * ddx + ddy * ddy);
        if (dist < 7) {
          const pcx = offX + (this.visual.x + 0.5) * cell;
          const pcy = offY + (this.visual.y + 0.5) * cell;
          const a = (1 - dist / 7) * 0.45;
          const grad = ctx.createRadialGradient(pcx, pcy, cell * 0.6, pcx, pcy, Math.max(this.cw, this.ch));
          grad.addColorStop(0, 'rgba(255,40,60,0)');
          grad.addColorStop(1, 'rgba(255,40,60,' + a.toFixed(3) + ')');
          ctx.save();
          ctx.fillStyle = grad;
          ctx.fillRect(-60, -60, this.cw + 120, this.ch + 120);
          ctx.restore();
        }
      }
    }

    // 粒子特效
    if (this.particles && this.particles.length) {
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        const a = Math.max(0, Math.min(1, p.life / p.maxLife));
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(offX + p.x * cell, offY + p.y * cell, cell * 0.09 * (0.5 + a * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = introA;
    }

    // 小人（暖光发光体）
    const cx = offX + (this.visual.x + 0.5) * cell;
    const cy = offY + (this.visual.y + 0.5) * cell;
    const r = cell * 0.34;
    ctx.save();
    ctx.shadowColor = 'rgba(255,193,94,0.95)';
    ctx.shadowBlur = 16 + pulse * 14;
    ctx.fillStyle = '#FFC15E';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // 高对比度模式：给主角加白色描边环，提升辨识度
    if (this.highContrast) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = Math.max(2, cell * 0.08);
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    const ceX = r * 0.36;
    const ceY = -r * 0.08;
    const ceR = r * 0.26;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(cx - ceX, cy + ceY, ceR, 0, Math.PI * 2);
    ctx.arc(cx + ceX, cy + ceY, ceR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2D2A55';
    const cePr = ceR * 0.55;
    ctx.beginPath();
    ctx.arc(cx - ceX, cy + ceY, cePr, 0, Math.PI * 2);
    ctx.arc(cx + ceX, cy + ceY, cePr, 0, Math.PI * 2);
    ctx.fill();

    // 拖尾（渐隐光点）
    if (!this.reduceMotion && this.trail && this.trail.length > 1) {
      for (let i = 0; i < this.trail.length - 1; i++) {
        const tp = this.trail[i];
        const a = (i / this.trail.length) * 0.35;
        ctx.fillStyle = 'rgba(255,193,94,' + a.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(offX + (tp.x + 0.5) * cell, offY + (tp.y + 0.5) * cell, cell * 0.12 + cell * 0.1 * (i / this.trail.length), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 隐身护盾光环
    if (this.fx && this.fx.cloak > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(155,140,255,' + (0.4 + 0.3 * pulse) + ')';
      ctx.lineWidth = Math.max(2, cell * 0.12);
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.55, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 护盾光环（绿色，抵挡一次碰撞）
    if (this.shield) {
      ctx.save();
      ctx.strokeStyle = 'rgba(110,231,160,' + (0.5 + 0.3 * pulse) + ')';
      ctx.shadowColor = 'rgba(110,231,160,0.8)';
      ctx.shadowBlur = 10 + pulse * 8;
      ctx.lineWidth = Math.max(2, cell * 0.1);
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 分叉路口方向提示
    if (this.waiting && this.state) {
      const came = this.state.cameFrom;
      const opens = maze.getOpenDirs(this.maze.grid, this.state.x, this.state.y, this.onewayMap).filter(function (o) {
        return o !== came;
      });
      for (let i = 0; i < opens.length; i++) {
        this.drawForkHint(ctx, cx, cy, opens[i], cell, pulse);
      }
    }

    // 迷雾遮罩：未探索=全黑，已探索=暗记忆，照亮处=透出
    if (this.fogEnabled && this.fogLit) {
      const lit = this.fogLit;
      const W = this.maze.W, H = this.maze.H;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const l = lit[y][x];
          if (l >= 0.985) continue;
          const a = 1 - l;
          ctx.fillStyle = 'rgba(8,7,24,' + a.toFixed(3) + ')';
          ctx.fillRect(offX + x * cell, offY + y * cell, cell, cell);
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // 危险雷达：玩家居中，绘制怪物/Boss/终点的相对方向
    this.drawRadar();
  },

  // 右下角小地图（#71 重写）：真实迷宫缩略图，融入导航玩法
  // - 走廊结构 + 玩家/终点/道具/怪物点位
  // - 迷雾关（L41+）仅显示已探索区域（雾战），普通关显示全貌
  drawRadar() {
    const rctx = this.radarCtx;
    if (!rctx || !this.maze || !this.visual) return;
    const rw = this.rcw, rh = this.rch;
    const cx = rw / 2, cy = rh / 2;
    const R = Math.min(rw, rh) / 2 - 1;
    const m = this.maze;
    const W = m.W, H = m.H;
    const grid = m.grid;
    const fog = this.fogEnabled;
    const visited = this.state ? this.state.visited : null;
    const now = Date.now() / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(now * Math.PI * 1.6);
    rctx.clearRect(0, 0, rw, rh);

    // 小地图格子尺寸与居中偏移
    const cs = Math.max(1, Math.floor(Math.min(rw, rh) / Math.max(W, H)));
    const mapW = cs * W, mapH = cs * H;
    const ox = (rw - mapW) / 2, oy = (rh - mapH) / 2;

    // 底盘圆盘（限制迷宫绘制在圆内，保持雷达质感）
    rctx.save();
    rctx.beginPath();
    rctx.arc(cx, cy, R, 0, Math.PI * 2);
    rctx.fillStyle = 'rgba(10,12,32,0.62)';
    rctx.fill();
    rctx.clip();

    // 走廊结构：floor=亮格，wall=暗格；迷雾关只画已探索
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const floor = grid[y][x] === 1;
        if (fog && !(visited && visited[x + ',' + y])) continue; // 未探索：留空→雾战
        rctx.fillStyle = floor
          ? (fog ? 'rgba(150,205,255,0.42)' : 'rgba(150,205,255,0.30)')
          : 'rgba(255,255,255,0.10)';
        rctx.fillRect(ox + x * cs, oy + y * cs, cs, cs);
      }
    }

    // 道具（黄色小点）：未拾取且在视野/已探索
    if (this.items) {
      for (let i = 0; i < this.items.length; i++) {
        const it = this.items[i];
        if (it.taken) continue;
        if (fog && !(visited && visited[it.x + ',' + it.y])) continue;
        rctx.fillStyle = '#FFD86E';
        rctx.beginPath();
        rctx.arc(ox + (it.x + 0.5) * cs, oy + (it.y + 0.5) * cs, Math.max(1.5, cs * 0.32), 0, Math.PI * 2);
        rctx.fill();
      }
    }

    // 终点（绿色）
    const ex = m.end.x, ey = m.end.y;
    if (!fog || (visited && visited[ex + ',' + ey])) {
      rctx.fillStyle = '#6EE7A0';
      rctx.beginPath();
      rctx.arc(ox + (ex + 0.5) * cs, oy + (ey + 0.5) * cs, Math.max(2, cs * 0.4), 0, Math.PI * 2);
      rctx.fill();
    }

    // 怪物 / Boss（红点，Boss 更大并脉动；迷雾关仅显示已探索格）
    if (this.monsters) {
      for (let i = 0; i < this.monsters.length; i++) {
        const mm = this.monsters[i];
        if (fog && !(visited && visited[mm.x + ',' + mm.y])) continue;
        const mx = ox + (mm.vx + 0.5) * cs, my = oy + (mm.vy + 0.5) * cs;
        if (mm.isBoss) {
          rctx.save();
          rctx.shadowColor = 'rgba(255,77,99,0.9)';
          rctx.shadowBlur = 8 + pulse * 6;
          rctx.fillStyle = '#FF4D63';
          rctx.beginPath();
          rctx.arc(mx, my, Math.max(3, cs * 0.5 + pulse * 1.5), 0, Math.PI * 2);
          rctx.fill();
          rctx.restore();
        } else {
          const hot = mm.alert >= 80 || mm.behavior >= 1;
          rctx.fillStyle = hot ? '#FF6B81' : '#FF9AAE';
          rctx.beginPath();
          rctx.arc(mx, my, Math.max(1.8, cs * 0.34), 0, Math.PI * 2);
          rctx.fill();
        }
      }
    }

    // 玩家（暖金圆心，带光晕）
    const plx = ox + (this.visual.x + 0.5) * cs, ply = oy + (this.visual.y + 0.5) * cs;
    rctx.save();
    rctx.shadowColor = 'rgba(255,193,94,0.95)';
    rctx.shadowBlur = 10;
    rctx.fillStyle = '#FFC15E';
    rctx.beginPath();
    rctx.arc(plx, ply, Math.max(2.5, cs * 0.42), 0, Math.PI * 2);
    rctx.fill();
    rctx.restore();

    rctx.restore(); // clip

    // 外圈描边
    rctx.lineWidth = 2;
    rctx.strokeStyle = 'rgba(111,227,210,0.45)';
    rctx.beginPath();
    rctx.arc(cx, cy, R, 0, Math.PI * 2);
    rctx.stroke();
  },

  alertColor(a) {
    a = Math.max(0, Math.min(100, a)) / 100;
    let r, g, b;
    if (a < 0.5) {
      const t = a / 0.5;
      r = 111 + (255 - 111) * t;
      g = 227 + (159 - 227) * t;
      b = 210 + (110 - 210) * t;
    } else {
      const t = (a - 0.5) / 0.5;
      r = 255;
      g = 159 + (77 - 159) * t;
      b = 110 + (99 - 110) * t;
    }
    return 'rgb(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + ')';
  },

  drawMonster(ctx, m, cell, offX, offY, pulse) {
    const cx = offX + (m.vx + 0.5) * cell;
    const cy = offY + (m.vy + 0.5) * cell;
    const r = cell * 0.36;
    const body = m.alert >= 80 ? '#FF4D63' : (m.behavior >= 1 ? '#FF4D63' : '#FF7A92');
    ctx.save();
    ctx.shadowColor = 'rgba(255,77,99,0.9)';
    ctx.shadowBlur = 14 + pulse * 10 + m.alert * 0.12;
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    // 角
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.5, cy - r * 0.7);
    ctx.lineTo(cx - r * 0.18, cy - r * 1.15);
    ctx.lineTo(cx + r * 0.08, cy - r * 0.7);
    ctx.moveTo(cx + r * 0.5, cy - r * 0.7);
    ctx.lineTo(cx + r * 0.18, cy - r * 1.15);
    ctx.lineTo(cx - r * 0.08, cy - r * 0.7);
    ctx.fill();
    ctx.restore();
    // 眼睛
    const meX = r * 0.34;
    const meY = -r * 0.04;
    const meR = r * 0.28;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(cx - meX, cy + meY, meR, 0, Math.PI * 2);
    ctx.arc(cx + meX, cy + meY, meR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2A0E16';
    const mePr = meR * 0.5;
    ctx.beginPath();
    ctx.arc(cx - meX, cy + meY, mePr, 0, Math.PI * 2);
    ctx.arc(cx + meX, cy + meY, mePr, 0, Math.PI * 2);
    ctx.fill();
    // 警戒条（头顶）：青→橙→红
    if (m.alert > 0) {
      const bw = cell * 0.72;
      const bh = Math.max(3, cell * 0.1);
      const bx = cx - bw / 2;
      const by = cy - r - cell * 0.34;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = this.alertColor(m.alert);
      ctx.fillRect(bx, by, bw * (m.alert / 100), bh);
      ctx.restore();
    }
  },

  // Boss 渲染（P2）：体型更大、暗红渐变身体 + 金色王冠 + 发光竖瞳
  drawBoss(ctx, b, cell, offX, offY, pulse) {
    const cx = offX + (b.vx + 0.5) * cell;
    const cy = offY + (b.vy + 0.5) * cell;
    const r = cell * 0.52;
    // 迷雾中尚未暴露时，只画警示环提示追兵方位（保留追逐压迫感又不完全泄题）
    if (this.fogEnabled && this.seen && this.seen[b.y] && !this.seen[b.y][b.x]) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,70,90,' + (0.35 + pulse * 0.35) + ')';
      ctx.lineWidth = Math.max(2, cell * 0.09);
      ctx.setLineDash([cell * 0.12, cell * 0.12]);
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return;
    }
    // 身体
    ctx.save();
    ctx.shadowColor = 'rgba(255,40,60,0.95)';
    ctx.shadowBlur = 22 + pulse * 16;
    const grad = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
    grad.addColorStop(0, '#FF6B7F');
    grad.addColorStop(1, '#8E0F2A');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // 王冠
    ctx.save();
    ctx.fillStyle = '#FFD86E';
    ctx.shadowColor = 'rgba(255,216,110,0.9)';
    ctx.shadowBlur = 10 + pulse * 8;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.52, cy - r * 0.60);
    ctx.lineTo(cx - r * 0.30, cy - r * 1.04);
    ctx.lineTo(cx - r * 0.10, cy - r * 0.68);
    ctx.lineTo(cx + r * 0.10, cy - r * 1.04);
    ctx.lineTo(cx + r * 0.30, cy - r * 0.68);
    ctx.lineTo(cx + r * 0.52, cy - r * 0.60);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // 发光竖瞳
    const bx = r * 0.34;
    const by = -r * 0.02;
    const br = r * 0.20;
    ctx.fillStyle = '#FFE9A8';
    ctx.beginPath();
    ctx.ellipse(cx - bx, cy + by, br * 0.62, br, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + bx, cy + by, br * 0.62, br, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4A0410';
    ctx.beginPath();
    ctx.ellipse(cx - bx, cy + by, br * 0.28, br * 0.6, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + bx, cy + by, br * 0.28, br * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  },

  drawForkHint(ctx, cx, cy, dir, cell, pulse) {
    const vec = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] }[dir];
    const dist = cell * 0.66;
    const tipx = cx + vec[0] * dist;
    const tipy = cy + vec[1] * dist;
    const a = cell * 0.22;
    const px = -vec[1];
    const py = vec[0];
    ctx.save();
    ctx.shadowColor = 'rgba(111,227,210,0.95)';
    ctx.shadowBlur = 12 + pulse * 10;
    ctx.strokeStyle = 'rgba(111,227,210,0.95)';
    ctx.lineWidth = Math.max(3, cell * 0.09);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(tipx - vec[0] * a - px * a * 0.7, tipy - vec[1] * a - py * a * 0.7);
    ctx.lineTo(tipx, tipy);
    ctx.lineTo(tipx - vec[0] * a + px * a * 0.7, tipy - vec[1] * a + py * a * 0.7);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, cell * 0.1, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(111,227,210,0.8)';
    ctx.fill();
    ctx.restore();
  },

  diamond(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
  },

  drawItems(ctx, cell, offX, offY, pulse) {
    if (!this.items) return;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it.taken) continue;
      const cx = offX + (it.x + 0.5) * cell;
      const cy = offY + (it.y + 0.5) * cell;
      ctx.save();
      if (it.type === 'gem') {
        ctx.shadowColor = 'rgba(255,216,110,0.95)';
        ctx.shadowBlur = 12 + pulse * 10;
        ctx.fillStyle = '#FFD86E';
        this.diamond(ctx, cx, cy, cell * 0.26);
        ctx.fill();
      } else if (it.type === 'key') {
        // 钥匙：金黄球头 + 钥匙杆 + 齿
        ctx.shadowColor = 'rgba(255,216,110,0.95)';
        ctx.shadowBlur = 12 + pulse * 10;
        ctx.fillStyle = '#FFD86E';
        ctx.beginPath();
        ctx.arc(cx, cy - cell * 0.12, cell * 0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(cx - cell * 0.045, cy - cell * 0.02, cell * 0.09, cell * 0.32);
        ctx.fillRect(cx + cell * 0.045, cy + cell * 0.16, cell * 0.11, cell * 0.06);
        ctx.shadowBlur = 0;
      } else {
        const col = FX_COLOR[it.type] || '#FF9F6E';
        const glyph = FX_GLYPH[it.type] || '?';
        ctx.shadowColor = col;
        ctx.shadowBlur = 12 + pulse * 10;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(cx, cy, cell * 0.32, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,0.96)';
        ctx.font = 'bold ' + Math.round(cell * 0.36) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(glyph, cx, cy + cell * 0.02);
      }
      ctx.restore();
    }
  },

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
});
