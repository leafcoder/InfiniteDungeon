const storage = require('../../utils/storage.js');
const theme = require('../../utils/theme.js');
const ad = require('../../utils/ad.js');
const codex = require('../../utils/codex.js');
const weekly = require('../../utils/weekly.js');
const challenge = require('../../utils/challenge.js');

// 5 个主题分区，每区 20 关（分区色随皮肤切换）
const ZONES = [
  { key: 'forest', name: '入门森林', range: '1–20 关', start: 1, end: 20 },
  { key: 'canyon', name: '迷雾峡谷', range: '21–40 关', start: 21, end: 40 },
  { key: 'corridor', name: '流光回廊', range: '41–60 关', start: 41, end: 60 },
  { key: 'lava', name: '熔岩深渊', range: '61–80 关', start: 61, end: 80 },
  { key: 'star', name: '星海之巅', range: '81–100 关', start: 81, end: 100 },
  { key: 'void', name: '虚空回响', range: '101–120 关', start: 101, end: 120 }
];

// 补给站条目（延时强化）—— glyph/color 与游戏内背包槽位保持同源
const SUPPLY = [
  { key: 'cloak', label: '隐身延时', glyph: '隐', color: '#9B8CFF', base: storage.UPG_BASE.cloak, delta: storage.UPG_DELTA.cloak },
  { key: 'freeze', label: '冰冻延时', glyph: '冰', color: '#5BC8FF', base: storage.UPG_BASE.freeze, delta: storage.UPG_DELTA.freeze },
  { key: 'dash', label: '加速延时', glyph: '速', color: '#FF9F6E', base: storage.UPG_BASE.dash, delta: storage.UPG_DELTA.dash },
  { key: 'magnet', label: '磁铁延时', glyph: '磁', color: '#5EE6D8', base: storage.UPG_BASE.magnet, delta: storage.UPG_DELTA.magnet },
  { key: 'flare', label: '照明延时', glyph: '灯', color: '#FF6B6B', base: storage.UPG_BASE.flare, delta: storage.UPG_DELTA.flare },
  { key: 'decoy', label: '诱饵延时', glyph: '饵', color: '#FF9EC4', base: storage.UPG_BASE.decoy, delta: storage.UPG_DELTA.decoy }
];

Page({
  data: {
    zones: [],
    activeZone: '',
    total: storage.TOTAL,
    doneCount: 0,
    continueLevel: 1,
    percent: 0,
    themeStyle: '',
    theme: 'classic',
    dust: 0,
    themeList: [],
    supplyOpen: false,
    supplyList: [],
    // 每日挑战 / 成就 / 设置（P3）
    dailyDone: false,
    dailyStreak: 0,
    achOpen: false,
    achTab: 'ach',
    achList: [],
    achUnlocked: 0,
    achTotal: 0,
    stats: {},
    settings: { mute: false, reduceMotion: false, highContrast: false },
    // 周挑战（P2）
    weeklyOpen: false,
    weeklyPlan: [],
    weeklyDone: 0,
    weeklyTotal: 5,
    // 图鉴（P2）
    codexList: [],
    codexUnlocked: 0,
    // 关卡解锁面板（广告整合 v2）
    unlockOpen: false,
    unlockLevel: 0,
    unlockDustCost: 30,
    // DEV 模拟广告层
    simAd: false,
    simLeft: 3,
    simDone: false,
    // 生存模式 / 排行榜（P10）
    bestWave: 0,
    rankOpen: false,
    rankList: [],
    // 挑战码（P10 UGC）
    challengeOpen: false,
    chTemplate: 0,
    chTemplates: challenge.TEMPLATES,
    chMods: weekly.MODS,
    chModsOn: {},
    chCode: '',
    chInput: '',
    chErr: '',
    // 补给站主动技 tab
    supplyTab: 'up',
    skillList: [],
    // 皮肤解锁动效
    skinFx: ''
  },

  onShow() {
    this.data.theme = storage.getTheme();
    this.setData({
      theme: this.data.theme,
      themeStyle: theme.themeStyle(this.data.theme)
    });
    this.refresh();
  },

  onHide() {
    // 离开页面时终止未完成的模拟广告（视为未看完）
    if (this._simTimer) {
      clearInterval(this._simTimer);
      this._simTimer = null;
      this.setData({ simAd: false, simDone: false, simLeft: 3 });
      if (this._simFinish) {
        const f = this._simFinish;
        this._simFinish = null;
        f(false);
      }
    }
  },

  refresh() {
    const p = storage.getProgress();
    const zc = theme.zoneColors(this.data.theme);
    const zones = ZONES.map(function (z, zi) {
      const hue = zc[zi];
      const levels = [];
      let doneInZone = 0;
      const span = z.end - z.start + 1;
      for (let i = z.start; i <= z.end; i++) {
        const done = !!p.completed[i];
        const locked = i > p.unlocked;
        const rec = p.completed[i];
        const stars = (rec && rec.stars) ? rec.stars : 0;
        const perfect = !!(rec && rec.gemTotal > 0 && rec.gems === rec.gemTotal);
        if (done) doneInZone++;
        levels.push({
          n: i,
          locked: locked,
          // 锁定关中只有"下一个待解锁关"可看广告解锁（防止跳关）
          adOpen: locked && i === p.unlocked + 1,
          done: done,
          stars: stars,
          perfect: perfect,
          current: !locked && !done && i === p.unlocked,
          delay: Math.min((i - z.start) * 12, 500)
        });
      }
      const unlocked = z.start <= p.unlocked;
      return {
        key: z.key,
        name: z.name,
        range: z.range,
        hue: hue,
        unlocked: unlocked,
        locked: !unlocked,
        done: doneInZone,
        total: span,
        percent: Math.round((doneInZone / span) * 100),
        levels: levels,
        delay: zi * 80
      };
    });
    const doneCount = Object.keys(p.completed).length;
    const continueLevel = Math.min(p.unlocked, storage.TOTAL);
    // 默认定位到「继续关」所在分区；用户手动切换 Tab 后不再被覆盖
    let defaultZone = ZONES[0].key;
    for (let zi = 0; zi < ZONES.length; zi++) {
      if (continueLevel >= ZONES[zi].start && continueLevel <= ZONES[zi].end) {
        defaultZone = ZONES[zi].key;
        break;
      }
    }
    const setObj = {
      zones: zones,
      doneCount: doneCount,
      continueLevel: continueLevel,
      percent: Math.round((doneCount / storage.TOTAL) * 100)
    };
    if (!this.data.activeZone) setObj.activeZone = defaultZone;
    this.setData(setObj);
    this.refreshEconomy();
    this.refreshMeta();
  },

  // 每日挑战 / 成就 / 设置 / 周挑战 / 图鉴
  refreshMeta() {
    const date = storage.dailyKey();
    const d = storage.getDaily();
    const st = storage.getStats();
    const list = storage.achList();
    const unlocked = list.filter(function (a) { return a.unlocked; }).length;
    // 图鉴：遭遇记录 → 条目解锁态
    const got = storage.getCodex();
    const cList = codex.CODEX.map(function (c) {
      return {
        key: c.key,
        name: got[c.key] ? c.name : '？？？',
        glyph: c.glyph,
        color: got[c.key] ? c.color : '#8A8FA8',
        group: c.group,
        desc: got[c.key] ? c.desc : '遭遇后解锁图鉴描述',
        unlocked: !!got[c.key]
      };
    });
    const wp = weekly.weekProgress();
    // 排行榜（本机最佳记录）：按关卡号排序取前 12
    const rankList = [];
    const p2 = storage.getProgress();
    for (let lv = 1; lv <= storage.TOTAL; lv++) {
      const rec = p2.completed[lv];
      if (rec) rankList.push({ lv: lv, time: rec.time, stars: rec.stars || 0 });
      if (rankList.length >= 12) break;
    }
    this.setData({
      dailyDone: !!d[date],
      dailyStreak: st.dailyStreak || 0,
      achList: list,
      achUnlocked: unlocked,
      achTotal: list.length,
      stats: st,
      bestWave: st.bestWave || 0,
      settings: {
        mute: storage.getSetting('mute', false),
        reduceMotion: storage.getSetting('reduceMotion', false),
        highContrast: storage.getSetting('highContrast', false)
      },
      codexList: cList,
      codexUnlocked: cList.filter(function (c) { return c.unlocked; }).length,
      weeklyPlan: weekly.getPlan(),
      weeklyDone: wp.done,
      weeklyTotal: wp.total,
      rankList: rankList
    });
  },

  onDaily() {
    wx.navigateTo({ url: '/pages/game/game?level=45&daily=1&seed=' + storage.dailySeed() });
  },

  // 生存模式入口
  onSurvival() {
    wx.navigateTo({ url: '/pages/game/game?survival=1' });
  },

  // 排行榜（本机最佳记录面板）
  onRankOpen() {
    this.refreshMeta();
    this.setData({ rankOpen: true });
  },
  onRankClose() {
    this.setData({ rankOpen: false });
  },

  // —— 挑战码（自定义挑战生成器）——
  onChallengeOpen() {
    this.setData({ challengeOpen: true, chErr: '' });
  },
  onChallengeClose() {
    this.setData({ challengeOpen: false });
  },
  onChTemplate() {
    this.setData({ chTemplate: (this.data.chTemplate + 1) % challenge.TEMPLATES.length });
  },
  onChMod(e) {
    const k = e.currentTarget.dataset.k;
    const on = Object.assign({}, this.data.chModsOn);
    if (on[k]) delete on[k];
    else on[k] = true;
    this.setData({ chModsOn: on });
  },
  onChGen() {
    const mods = Object.keys(this.data.chModsOn);
    const seed = Math.floor(Math.random() * 4096);
    const code = challenge.encode(this.data.chTemplate, mods, seed);
    this.setData({ chCode: code, chErr: '' });
  },
  onChCopy() {
    if (!this.data.chCode) return;
    wx.setClipboardData({ data: this.data.chCode });
  },
  onChInput(e) {
    this.setData({ chInput: e.detail.value, chErr: '' });
  },
  onChPaste() {
    const that = this;
    wx.getClipboardData({
      success: function (r) {
        if (r.data) that.setData({ chInput: r.data, chErr: '' });
      }
    });
  },
  onChPlay() {
    const parsed = challenge.decode(this.data.chInput);
    if (!parsed) {
      this.setData({ chErr: '挑战码无效，请检查后重试' });
      return;
    }
    let url = '/pages/game/game?level=' + parsed.level + '&seed=' + parsed.seed;
    if (parsed.mods.length) url += '&mods=' + parsed.mods.join(',');
    this.setData({ challengeOpen: false });
    wx.navigateTo({ url: url });
  },

  // —— 补给站：强化 / 主动技 双 tab ——
  onSupplyTab(e) {
    const t = e.currentTarget.dataset.t;
    if (t !== 'up' && t !== 'skill') return;
    this.setData({ supplyTab: t });
    if (t === 'skill') this.refreshSkills();
  },
  refreshSkills() {
    const owned = storage.getSkills();
    const dust = storage.getDust();
    const list = ['dash', 'insight'].map(function (k) {
      const m = storage.SKILL_META[k];
      return {
        key: k,
        name: m.name,
        desc: m.desc,
        uses: m.uses,
        cost: storage.SKILL_COST[k],
        glyph: k === 'dash' ? '闪' : '视',
        color: k === 'dash' ? '#FF9F6E' : '#9B8CFF',
        owned: !!owned[k],
        poor: !owned[k] && dust < storage.SKILL_COST[k]
      };
    });
    this.setData({ skillList: list });
  },
  onBuySkill(e) {
    const k = e.currentTarget.dataset.k;
    if (storage.buySkill(k)) {
      this.refreshSkills();
      this.refreshEconomy();
      wx.showToast({ title: '已解锁 · 游戏内使用', icon: 'success' });
    } else {
      wx.showToast({ title: '光尘不足', icon: 'none' });
    }
  },

  onAchOpen() {
    this.refreshMeta();
    this.setData({ achOpen: true, achTab: 'ach' });
  },
  onAchClose() {
    this.setData({ achOpen: false });
  },
  // 成就 / 设置 / 图鉴 分页切换
  onAchTab(e) {
    const t = e.currentTarget.dataset.t;
    if (t !== 'ach' && t !== 'set' && t !== 'codex') return;
    this.setData({ achTab: t });
  },

  // 周挑战（P2）
  onWeeklyOpen() {
    this.refreshMeta();
    this.setData({ weeklyOpen: true });
  },
  onWeeklyClose() {
    this.setData({ weeklyOpen: false });
  },
  onWeeklyPlay(e) {
    const idx = e.currentTarget.dataset.i;
    const item = this.data.weeklyPlan[idx];
    if (!item) return;
    wx.navigateTo({ url: '/pages/game/game?weekly=' + idx });
  },

  onToggleSetting(e) {
    const k = e.currentTarget.dataset.k;
    const cur = storage.getSetting(k, false);
    storage.setSetting(k, !cur);
    this.refreshMeta();
  },

  // 光尘 / 皮肤解锁态 / 补给站列表
  refreshEconomy() {
    const dust = storage.getDust();
    const unlocked = storage.getUnlockedSkins();
    const themeList = theme.ORDER.map(function (k) {
      return {
        key: k,
        label: theme.THEMES[k].label,
        price: theme.THEMES[k].price,
        locked: unlocked.indexOf(k) === -1
      };
    });
    const ups = storage.getUpgrades();
    const supplyList = SUPPLY.map(function (s) {
      const lv = ups[s.key] || 0;
      const max = lv >= storage.UPG_COST.length;
      const cost = max ? 0 : storage.UPG_COST[lv];
      return {
        key: s.key,
        label: s.label,
        glyph: s.glyph,
        color: s.color,
        lv: lv,
        effect: (s.base + s.delta * lv).toFixed(1) + 's',
        max: max,
        cost: cost,
        // 光尘不足时按钮置为禁用态（不可点，给出明确视觉反馈）
        poor: !max && dust < cost
      };
    });
    this.setData({ dust: dust, themeList: themeList, supplyList: supplyList });
  },

  onTheme(e) {
    const k = e.currentTarget.dataset.k;
    if (k === this.data.theme) return;
    const item = this.data.themeList.find(function (t) { return t.key === k; });
    if (item && item.locked) {
      const that = this;
      wx.showModal({
        title: '解锁皮肤 · ' + item.label,
        content: '花费 ' + item.price + ' 光尘解锁「' + item.label + '」皮肤？当前光尘 ' + this.data.dust,
        confirmColor: '#FFD86E',
        success: function (r) {
          if (!r.confirm) return;
          if (storage.spendDust(item.price)) {
            storage.unlockSkin(k);
            // 皮肤解锁动效（vanity）：金色光环提示
            that.setData({ skinFx: item.label });
            setTimeout(function () {
              that.setData({ skinFx: '' });
            }, 1600);
            that.applyThemeKey(k);
          } else {
            wx.showToast({ title: '光尘不足', icon: 'none' });
          }
        }
      });
      return;
    }
    this.applyThemeKey(k);
  },

  applyThemeKey(k) {
    this.data.theme = k;
    storage.setTheme(k);
    this.setData({ theme: k, themeStyle: theme.themeStyle(k) });
    this.refresh();
  },

  onSupplyOpen() {
    this.setData({ supplyOpen: true });
  },
  onSupplyClose() {
    this.setData({ supplyOpen: false });
  },
  noop() {},

  onBuyUpgrade(e) {
    const k = e.currentTarget.dataset.k;
    const item = this.data.supplyList.find(function (s) { return s.key === k; });
    if (item && item.poor) {
      wx.showToast({ title: '光尘不足', icon: 'none' });
      return;
    }
    if (storage.buyUpgrade(k)) {
      this.refreshEconomy();
      wx.showToast({ title: '强化成功', icon: 'success' });
    } else {
      wx.showToast({ title: '光尘不足', icon: 'none' });
    }
  },

  onContinue() {
    wx.navigateTo({ url: '/pages/game/game?level=' + this.data.continueLevel });
  },

  onHow() {
    wx.navigateTo({ url: '/pages/game/game?level=' + this.data.continueLevel + '&tutorial=1' });
  },

  // —— 分区 Tab 导航（替代 100 关平铺，只渲染当前分区）——
  onZoneTab(e) {
    const k = e.currentTarget.dataset.k;
    if (k === this.data.activeZone) return;
    this.setData({ activeZone: k });
  },
  // 跳到「继续关」所在分区并滚动定位
  onJumpLatest() {
    const cl = this.data.continueLevel;
    let k = ZONES[0].key;
    for (let zi = 0; zi < ZONES.length; zi++) {
      if (cl >= ZONES[zi].start && cl <= ZONES[zi].end) { k = ZONES[zi].key; break; }
    }
    this.setData({ activeZone: k });
    wx.pageScrollTo({ selector: '.zones', duration: 280 });
  },

  openLevel(e) {
    const n = e.currentTarget.dataset.n;
    if (n <= this.data.continueLevel) {
      wx.navigateTo({ url: '/pages/game/game?level=' + n });
      return;
    }
    // 锁定关：打开解锁面板（只允许逐关解锁，防止跳关）
    const p = storage.getProgress();
    if (n !== p.unlocked + 1) {
      wx.showToast({ title: '请先解锁前面的关卡', icon: 'none' });
      return;
    }
    this.setData({ unlockOpen: true, unlockLevel: n });
  },

  // —— 解锁面板（广告整合 v2）——
  onUnlockClose() {
    this.setData({ unlockOpen: false });
  },

  // 路径一：观看广告免费解锁
  onUnlockAd() {
    if (this._unlockBusy) return;
    this._unlockBusy = true;
    const n = this.data.unlockLevel;
    const that = this;
    const finish = function (ok) {
      that._unlockBusy = false;
      if (!ok) {
        wx.showToast({ title: '广告未看完，未能解锁', icon: 'none' });
        return;
      }
      storage.adUnlockTo(n);
      that.setData({ unlockOpen: false });
      that.refresh();
      wx.showToast({ title: '已解锁第 ' + n + ' 关', icon: 'success' });
    };
    // DEV 模拟模式：展示全屏模拟广告页（页面层），流程与真机一致
    if (ad.AD_DEV) {
      this._simFinish = finish;
      this.setData({ simAd: true, simLeft: 3, simDone: false });
      this._simTimer = setInterval(function () {
        const left = that.data.simLeft - 1;
        if (left > 0) {
          that.setData({ simLeft: left });
          return;
        }
        clearInterval(that._simTimer);
        that._simTimer = null;
        that.setData({ simDone: true });
      }, 1000);
      return;
    }
    ad.showRewarded(finish);
  },

  // 路径二：花费光尘解锁（给不想看广告的玩家）
  onUnlockDust() {
    const n = this.data.unlockLevel;
    const cost = this.data.unlockDustCost;
    if (!storage.spendDust(cost)) {
      wx.showToast({ title: '光尘不足', icon: 'none' });
      return;
    }
    storage.adUnlockTo(n);
    this.setData({ unlockOpen: false });
    this.refresh();
    wx.showToast({ title: '已解锁第 ' + n + ' 关', icon: 'success' });
  },

  // DEV 模拟广告层关闭：倒计时结束=看完；提前 ✕=未看完
  onSimClose() {
    const ok = !!this.data.simDone;
    if (this._simTimer) {
      clearInterval(this._simTimer);
      this._simTimer = null;
    }
    this.setData({ simAd: false, simDone: false, simLeft: 3 });
    if (this._simFinish) {
      const f = this._simFinish;
      this._simFinish = null;
      f(ok);
    }
  },

  reset() {
    wx.showModal({
      title: '重置进度',
      content: '确定要清空全部 120 关的通关记录吗？（光尘、已解锁皮肤与广告解锁的关卡将保留）此操作不可恢复。',
      confirmColor: '#6FE3D2',
      success: (r) => {
        if (r.confirm) {
          storage.resetProgress();
          this.refresh();
        }
      }
    });
  }
});
