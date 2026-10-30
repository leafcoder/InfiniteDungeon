/**
 * 系统弹窗构建器（M3）
 * 各系统 1:1 迁移自小程序版首页弹层：
 * - supply   补给站：光尘余额 + 道具时长升级 + 技能解锁 + 皮肤切换
 * - ach      成就图鉴：成就列表（解锁态）+ 图鉴收集度
 * - rank     排行榜：本机最佳（微信好友榜需 open data context，此处展示本机数据 + 提示）
 * - daily    每日挑战：今日状态 + 开始
 * - weekly   周挑战：本周 5 关计划（词缀）+ 完成态 + 开始
 * - code     挑战码：模板生成 + 复制口令；进入游戏页自动读剪贴板识别
 */
const storage = require('../core/storage')
const theme = require('../core/theme')
const weekly = require('../core/weekly')
const challenge = require('../core/challenge')
const ad = require('../core/ad')
const Modal = require('../ui/Modal')
const AdSim = require('../ui/AdSim')

const UPG_FX = { cloak: '隐身衣', freeze: '冰冻星', dash: '加速鞋' } // 可升级道具（与 storage.getUpgrades 同源）
// 强化道具 → 矢量图标映射（此前直接 ick: k，Icons.js 无 'freeze'/'dash'，图标空白）
const UPG_ICON = { cloak: 'cloak', freeze: 'snow', dash: 'shoe' }

function L(t, o) {
  const ln = { t: t }
  if (o) for (const k in o) ln[k] = o[k]
  return ln
}

/* ---------- 补给站（单页内联购买，行卡直接点按） ---------- */

const SKIN_ICON = { classic: 'castle', glow: 'leaf', festival: 'lantern', cosmos: 'spark', abyss: 'wave', sakura: 'flower' }
const SKIN_COL = { classic: '#FFC15E', glow: '#6FE3D2', festival: '#FF7A92', cosmos: '#9B8CFF', abyss: '#40E0FF', sakura: '#FF9ECB' }
const UPG_COL = { cloak: '#9B8CFF', freeze: '#6FE3D2', dash: '#FF9F6E' }

// 皮肤行卡（补给站与独立皮肤弹窗共用，避免重复逻辑）
// refresh(modal)：状态变化后的刷新回调——传入被点行所在弹窗时就地刷新（无闪烁），
// 传 null 表示从广告确认页返回，需重建容器弹窗
function buildSkinRows(sm, refresh) {
  const cur = storage.getTheme()
  const unlocked = storage.getUnlockedSkins()
  const rows = []
  for (let i = 0; i < theme.ORDER.length; i++) {
    const k = theme.ORDER[i]
    const t = theme.getTheme(k)
    const has = unlocked.indexOf(k) !== -1
    const using = cur === k
    rows.push({
      ick: SKIN_ICON[k] || 'spark',
      icCol: SKIN_COL[k] || '#9B8CFF',
      title: t.label,
      sub: t.desc || (has ? '已拥有' : '光尘解锁 · 或看广告免费解锁'),
      tag: using ? '使用中' : has ? '点按切换' : t.price + '✦',
      tagColor: using ? '#FFC15E' : has ? '#6FE3D2' : '#FFD86E',
      dim: using,
      onTap: function (m) {
        if (using) return
        if (!has) {
          // 光尘足额：直接解锁并穿上
          if (storage.spendDust(t.price)) {
            storage.unlockSkin(k)
            storage.setTheme(k)
            sm.toast('已解锁并切换：' + t.label)
            refresh(m)
            return
          }
          // 光尘不足：转看广告免费解锁确认页
          sm.sceneModal(adUnlockSkin(sm, k, t, function () { refresh(null) }))
          return
        }
        storage.setTheme(k)
        sm.toast('已切换：' + t.label)
        refresh(m)
      }
    })
  }
  return rows
}

// 看广告解锁皮肤确认页（光尘不足时的免费替代路径）
function adUnlockSkin(sm, k, t, reopen) {
  const finish = function (ok) {
    if (!ok) { sm.toast('广告未看完，未能解锁'); reopen(); return }
    storage.unlockSkin(k)
    storage.setTheme(k)
    sm.toast('广告解锁成功：' + t.label)
    reopen()
  }
  return new Modal(sm, {
    title: '免费解锁「' + t.label + '」',
    lines: [
      L('光尘不足？观看一段广告即可免费解锁该皮肤，解锁后立即穿上。', { s: 12.5 }),
      L(''),
      L('✦ 也可继续攒光尘（' + t.price + '✦）解锁，通关 / 每日挑战 / 广告均可获取。', { s: 11, c: '#9AA0C8' })
    ],
    buttons: [
      {
        label: '▶ 看广告解锁', primary: true,
        onTap: function () {
          const handled = ad.showRewarded(finish)
          // 无广告位（DEV）时走模拟广告页；adSim 须挂到当前场景（sceneAd），场景才会驱动 update/draw
          if (!handled) sm.sceneAd(new AdSim(sm, finish, '解锁皮肤：' + t.label))
        }
      },
      { label: '取消', onTap: reopen }
    ],
    onClose: reopen
  })
}

// 英雄行卡（皮肤弹窗与补给站共用）：条件达成即解锁，广告/光尘走手动路径
function buildHeroRows(sm, refresh) {
  const cur = storage.getHero()
  const stats = storage.heroStats()
  return storage.HEROES.map(function (h) {
    const avail = storage.heroAvailable(h.id)
    const using = cur === h.id
    let tag = ''
    let tagColor = '#FFD86E'
    if (using) { tag = '使用中'; tagColor = '#FFC15E' }
    else if (avail) { tag = '点按切换'; tagColor = '#6FE3D2' }
    else if (h.by === 'stars') tag = '⭐ ' + h.need
    else if (h.by === 'clears') tag = '通关 ' + h.need
    else if (h.by === 'ad') tag = '看广告'
    else tag = h.price + '✦'
    // 未达成条件时副标题附带当前进度，让"还差多少"一眼可见
    let sub = h.desc
    if (!avail && h.by === 'stars') sub += '（当前 ' + stats.stars + ' 星）'
    if (!avail && h.by === 'clears') sub += '（当前 ' + stats.clears + ' 关）'
    return {
      hero: h.pal,            // 英雄小人 chip（调色板驱动），比抽象图标更直观
      icCol: h.pal.tunic,
      title: h.name,
      sub: sub,
      tag: tag,
      tagColor: tagColor,
      dim: using,
      onTap: function (m) {
        if (using) return
        if (avail) {
          storage.setHero(h.id)
          sm.toast('已换上：' + h.name)
          refresh(m)
          return
        }
        if (h.by === 'stars' || h.by === 'clears') {
          const cur2 = storage.heroStats()
          const lack = h.need - (h.by === 'stars' ? cur2.stars : cur2.clears)
          sm.toast(h.by === 'stars' ? '还差 ' + lack + ' 颗星解锁' : '还差 ' + lack + ' 关通关解锁')
          return
        }
        if (h.by === 'dust') {
          if (storage.buyHero(h.id)) {
            sm.toast('已解锁并换上：' + h.name)
            refresh(m)
          } else {
            sm.sceneModal(adUnlockHero(sm, h, function () { refresh(null) }))
          }
          return
        }
        // ad：看广告免费解锁确认页
        sm.sceneModal(adUnlockHero(sm, h, function () { refresh(null) }))
      }
    }
  })
}

// 看广告解锁英雄确认页（ad 类直接入口；dust 类光尘不足时的免费替代路径）
function adUnlockHero(sm, h, reopen) {
  const finish = function (ok) {
    if (!ok) { sm.toast('广告未看完，未能解锁'); reopen(); return }
    storage.unlockHero(h.id)
    storage.setHero(h.id)
    sm.toast('广告解锁成功：' + h.name)
    reopen()
  }
  const priceTip = h.by === 'dust' ? '（' + h.price + '✦）' : ''
  return new Modal(sm, {
    title: '解锁英雄「' + h.name + '」' + priceTip,
    lines: [
      L('观看一段广告即可免费解锁该英雄，解锁后立即换上。', { s: 12.5 }),
      L(''),
      L('造型与主题皮肤相互独立，随时可在皮肤弹窗中切换。', { s: 11, c: '#9AA0C8' })
    ],
    buttons: [
      {
        label: '▶ 看广告解锁', primary: true,
        onTap: function () {
          const handled = ad.showRewarded(finish)
          if (!handled) sm.sceneAd(new AdSim(sm, finish, '解锁英雄：' + h.name))
        }
      },
      { label: '取消', onTap: reopen }
    ],
    onClose: reopen
  })
}

// 独立皮肤弹窗（首页顶栏「皮肤」钮入口，比补给站更醒目）
function showSkin(sm, onClose) {
  const makeOpts = function () {
    const rows = buildSkinRows(sm, apply)
    rows.push({ header: '英雄' })
    buildHeroRows(sm, apply).forEach(function (r) { rows.push(r) })
    return {
      title: '主题皮肤',
      lines: [
        L('✦ 光尘 ' + storage.getDust() + ' · 轻点即可切换或解锁', { c: '#FFC15E', b: true, s: 13 }),
        L('皮肤 ' + storage.getUnlockedSkins().length + '/' + theme.ORDER.length + ' · 英雄 ' + storage.getHeroCollected() + '/' + storage.HEROES.length, { c: '#6FE3D2', s: 11.5 })
      ],
      rows: rows,
      buttons: [{ label: '关闭' }],
      onClose: onClose
    }
  }
  // m 为被点行所在弹窗：是本弹窗 → 就地刷新（无闪烁）；否则（广告确认页返回）→ 重建
  const apply = function (m) {
    if (m && m.title === '主题皮肤') m.refresh(makeOpts())
    else sm.sceneModal(new Modal(sm, makeOpts()))
  }
  return new Modal(sm, makeOpts())
}

/* ---------- 设置（音效 / 震动 / 重置进度） ---------- */

function showSettings(sm, onClose) {
  const makeOpts = function () {
    const sound = storage.getSetting('sound', true)
    const vib = storage.getSetting('vibration', true)
    const tut = storage.getSetting('tutorial', true)
    const rows = [
      {
        ick: 'bolt', icCol: '#FFD86E',
        title: '音效', sub: '背景与事件音效',
        tag: sound ? '开' : '关', tagColor: sound ? '#6FE3D2' : '#9AA0C8',
        onTap: function (m) {
          storage.setSetting('sound', !sound)
          const on = storage.getSetting('sound', true)
          sm.toast('音效' + (on ? '已开启' : '已关闭'))
          apply(m)
        }
      },
      {
        ick: 'shield', icCol: '#6FE3D2',
        title: '震动', sub: '关键事件震动反馈',
        tag: vib ? '开' : '关', tagColor: vib ? '#6FE3D2' : '#9AA0C8',
        onTap: function (m) {
          storage.setSetting('vibration', !vib)
          const on = storage.getSetting('vibration', true)
          sm.toast('震动' + (on ? '已开启' : '已关闭'))
          apply(m)
        }
      },
      {
        ick: 'map', icCol: '#9B8CFF',
        title: '新手引导', sub: '关卡内的移动/道具/新机制教学提示',
        tag: tut ? '开' : '关', tagColor: tut ? '#6FE3D2' : '#9AA0C8',
        onTap: function (m) {
          storage.setSetting('tutorial', !tut)
          const on = storage.getSetting('tutorial', true)
          sm.toast('新手引导' + (on ? '已开启' : '已关闭'))
          apply(m)
        }
      }
    ]
    return {
      title: '设置',
      lines: [L('调整游戏体验', { c: '#FFC15E', b: true, s: 13 })],
      rows: rows,
      buttons: [
        { label: '重置进度', onTap: function () { sm.sceneModal(confirmReset(sm, back)) } },
        { label: '关闭' }
      ],
      onClose: onClose
    }
  }
  // 开关切换：就地刷新（此前整弹重建会重播入场动画 → 视觉闪烁）
  const apply = function (m) {
    if (m && m.title === '设置') m.refresh(makeOpts())
    else back()
  }
  const back = function () { sm.sceneModal(new Modal(sm, makeOpts())) }
  return new Modal(sm, makeOpts())
}

// 重置进度二次确认（保留广告解锁的关卡）
function confirmReset(sm, back) {
  return new Modal(sm, {
    title: '重置进度？',
    lines: [L('将清空所有关卡通关记录、皮肤与光尘（广告解锁的关卡保留）。此操作不可撤销。', { s: 12 })],
    buttons: [
      { label: '确认重置', primary: true, onTap: function () { storage.resetProgress(); sm.toast('进度已重置'); sm.sceneModal(back()) } },
      { label: '取消', onTap: function () { sm.sceneModal(back()) } }
    ]
  })
}

function showSupply(sm, onClose) {
  const makeOpts = function () {
    const rows = []

    rows.push({ header: '旅人之路 · 永久天赋' })
    const tals = storage.getTalents()
    for (const tk in storage.TALENT_META) {
      ;(function (tk) {
        const meta = storage.TALENT_META[tk]
        const lv = tals[tk] || 0
        const maxed = lv >= storage.TAL_MAX
        rows.push({
          ick: meta.icon,
          icCol: meta.col,
          title: meta.name + ' · Lv' + lv,
          sub: meta.desc,
          tag: maxed ? 'MAX' : storage.TAL_COST[lv] + '✦',
          tagColor: maxed ? '#9AA0C8' : '#FFD86E',
          dim: maxed,
          onTap: function (m) {
            if (maxed) { sm.toast('已满级'); return }
            if (storage.buyTalent(tk)) sm.toast(meta.name + ' 升到 Lv' + (lv + 1) + '！')
            else sm.toast('光尘不足')
            apply(m)
          }
        })
      })(tk)
    }

    rows.push({ header: '道具强化 · 永久生效' })
    const ups = storage.getUpgrades()
    for (const k in UPG_FX) {
      ;(function (k) {
        const lv = ups[k] || 0
        const maxed = lv >= storage.UPG_COST.length
        rows.push({
          ick: UPG_ICON[k] || 'star',
          icCol: UPG_COL[k] || '#FFC15E',
          title: UPG_FX[k] + ' · Lv' + lv,
          sub: maxed ? '已达最高等级' : '下一级延时 +' + storage.UPG_DELTA[k] + 's',
          tag: maxed ? 'MAX' : storage.UPG_COST[lv] + '✦',
          tagColor: maxed ? '#9AA0C8' : '#FFD86E',
          dim: maxed,
          onTap: function (m) {
            if (maxed) { sm.toast('已满级'); return }
            if (storage.buyUpgrade(k)) sm.toast('升级成功！')
            else sm.toast('光尘不足')
            apply(m)
          }
        })
      })(k)
    }

    rows.push({ header: '技能' })
    const sk = storage.getSkills()
    for (const key in storage.SKILL_META) {
      ;(function (key) {
        const meta = storage.SKILL_META[key]
        rows.push({
          ick: key === 'dash' ? 'bolt' : 'eye',
          icCol: key === 'dash' ? '#FFD86E' : '#6FE3D2',
          title: meta.name,
          sub: meta.desc + (sk[key] ? '' : '（每局限用次数）'),
          tag: sk[key] ? '已解锁' : storage.SKILL_COST[key] + '✦',
          tagColor: sk[key] ? '#6FE3D2' : '#FFD86E',
          dim: !!sk[key],
          onTap: function (m) {
            if (sk[key]) { sm.toast('已解锁'); return }
            if (storage.buySkill(key)) sm.toast('已解锁 ' + meta.name)
            else sm.toast('光尘不足')
            apply(m)
          }
        })
      })(key)
    }

    rows.push({ header: '皮肤' })
    buildSkinRows(sm, apply).forEach(function (r) { rows.push(r) })

    rows.push({ header: '英雄' })
    buildHeroRows(sm, apply).forEach(function (r) { rows.push(r) })

    return {
      title: '补给站',
      lines: [L('✦ 光尘 ' + storage.getDust() + ' · 通关/每日/广告获取（不可充值）', { c: '#FFC15E', b: true, s: 14 })],
      rows: rows,
      buttons: [{ label: '关闭' }],
      onClose: onClose
    }
  }
  // 购买/皮肤切换：就地刷新（不重播入场动画、保留滚动位置）
  const apply = function (m) {
    if (m && m.title === '补给站') m.refresh(makeOpts())
    else sm.sceneModal(new Modal(sm, makeOpts()))
  }
  return new Modal(sm, makeOpts())
}

/* ---------- 成就图鉴 ---------- */

function showAch(sm, onClose) {
  const list = storage.achList()
  const done = storage.getStats().ach || {}
  const rows = []
  for (let i = 0; i < list.length; i++) {
    const a = list[i]
    const got = !!done[a.id]
    rows.push({
      ick: got ? 'rank' : 'lock',
      icCol: got ? '#FFC15E' : '#9AA0C8',
      title: a.name,
      sub: a.desc,
      tag: got ? '已解锁' : '+' + (a.reward || 0) + '✦',
      tagColor: got ? '#FFC15E' : '#FFD86E',
      dim: !got
    })
  }
  // 图鉴收集度（信息行，不可点）
  const cx = storage.getCodex()
  let monsterN = 0
  let itemN = 0
  for (const k in cx) { if (k.indexOf('m_') === 0) monsterN++; else if (k.indexOf('i_') === 0 || k.indexOf('fx_') === 0) itemN++ }
  rows.push({ header: '图鉴收集 · 游玩自动收录' })
  rows.push({
    ick: 'monster',
    icCol: '#FF7A92',
    title: '怪物遭遇 ' + monsterN + ' 种',
    sub: '与各类怪物照面即收录',
    tag: monsterN >= 6 ? '收集达人' : '收集中',
    tagColor: monsterN >= 6 ? '#6FE3D2' : '#9AA0C8'
  })
  rows.push({
    ick: 'bag',
    icCol: '#FF9F6E',
    title: '道具拾取 ' + itemN + ' 种',
    sub: '拾取道具与触发机关即收录',
    tag: itemN >= 8 ? '百宝箱' : '收集中',
    tagColor: itemN >= 8 ? '#6FE3D2' : '#9AA0C8'
  })
  return new Modal(sm, {
    title: '成就图鉴',
    lines: [
      L('成就 ' + Object.keys(done).length + '/' + list.length + ' · 达成成就永久点亮', { b: true, c: '#FFC15E', s: 13.5 }),
      L('皮肤收集 ' + storage.getUnlockedSkins().length + '/' + theme.ORDER.length + ' · 光尘解锁更多主题', { c: '#6FE3D2', s: 11.5 })
    ],
    rows: rows,
    buttons: [{ label: '关闭' }],
    onClose: onClose
  })
}

/* ---------- 排行榜 ---------- */

function showRank(sm, onClose) {
  const st = storage.getStats()
  const prog = storage.getProgress()
  const done = Object.keys(prog.completed || {}).length
  let stars = 0
  for (const k in prog.completed) stars += (prog.completed[k].stars || 1)
  const rows = [
    {
      ick: 'map',
      icCol: '#6FE3D2',
      title: '通关进度',
      sub: done >= storage.TOTAL ? '全制霸！地宫已被你踩平' : '距离全制霸还差 ' + (storage.TOTAL - done) + ' 关',
      tag: done + '/' + storage.TOTAL,
      tagColor: '#FFC15E'
    },
    {
      ick: 'star',
      icCol: '#FFD86E',
      title: '累计星数',
      sub: '三星通关是最高评价',
      tag: '★ ' + stars,
      tagColor: '#FFD86E'
    },
    {
      ick: 'daily',
      icCol: '#FFC15E',
      title: '每日挑战最佳',
      sub: st.bestDaily && st.bestDaily.gems ? '单局最高收集 ' + st.bestDaily.gems + ' 光尘' : '今日布局全服一致，来刷个记录',
      tag: (st.bestDaily && st.bestDaily.gems ? st.bestDaily.gems + '✦' : '—'),
      tagColor: '#6FE3D2'
    },
    {
      ick: 'survival',
      icCol: '#FF7A92',
      title: '生存模式最佳',
      sub: st.bestWave ? '在第 ' + st.bestWave + ' 波倒下' : '无尽波次，看你能撑几波',
      tag: st.bestWave ? '第 ' + st.bestWave + ' 波' : '—',
      tagColor: '#FF7A92'
    },
    {
      ick: 'bolt',
      icCol: '#9B8CFF',
      title: '历史最速通关',
      sub: st.bestTime ? '最快一局 ' + st.bestTime + ' 秒' : '还没有速通记录',
      tag: st.bestTime ? st.bestTime + 's' : '—',
      tagColor: '#9B8CFF'
    }
  ]
  return new Modal(sm, {
    title: '排行榜',
    lines: [
      L('本机成绩总览', { b: true, c: '#FFC15E', s: 13.5 }),
      L('好友排行可在微信「小游戏」内查看好友名次。', { s: 10.5, c: '#9AA0C8' })
    ],
    rows: rows,
    buttons: [{ label: '关闭' }],
    onClose: onClose
  })
}

/* ---------- 每日挑战 ---------- */

function showDaily(sm, startFn, onClose) {
  const key = storage.dailyKey()
  const rec = storage.getDaily()[key]
  return new Modal(sm, {
    title: '每日挑战',
    lines: [
      L('今日布局：' + key, { b: true, c: '#FFC15E' }),
      L('全服同一迷宫（按日期种子生成），每日 0 点刷新。', { s: 12 }),
      L(''),
      rec
        ? L('今日最佳：' + rec.gems + '✦ · ' + rec.steps + ' 步 · ' + rec.time + 's', { c: '#6FE3D2' })
        : L('今日尚未挑战'),
      L('完成即得光尘（首次全额，破纪录有加成）。', { s: 12 })
    ],
    buttons: [
      { label: '开始挑战', primary: true, onTap: function () { startFn() } },
      { label: '关闭' }
    ],
    onClose: onClose
  })
}

/* ---------- 周挑战 ---------- */

function showWeekly(sm, startFn, onClose) {
  const plan = weekly.getPlan()
  const prog = weekly.weekProgress()
  let next = -1
  for (let i = 0; i < plan.length; i++) { if (!plan[i].done) { next = i; break } }
  const rows = []
  for (let i = 0; i < plan.length; i++) {
    ;(function (i) {
      const p = plan[i]
      const names = p.mods.map(function (mk) {
        for (let j = 0; j < weekly.MODS.length; j++) if (weekly.MODS[j].key === mk) return weekly.MODS[j].name
        return mk
      }).join('+') || '无'
      rows.push({
        ick: p.done ? 'check' : (i === next ? 'sword' : 'lock'),
        icCol: p.done ? '#6FE3D2' : (i === next ? '#FFC15E' : '#9AA0C8'),
        title: '第 ' + (i + 1) + ' 关 · ' + p.level + ' 关模板',
        sub: '词缀：' + names,
        tag: p.done ? '已完成' : (i === next ? '可挑战' : '依次解锁'),
        tagColor: p.done ? '#6FE3D2' : (i === next ? '#FFC15E' : '#9AA0C8'),
        dim: p.done || (i !== next),
        onTap: function () {
          if (i === next) startFn(i, p)
          else if (!p.done) sm.toast('先完成第 ' + (next + 1) + ' 关')
        }
      })
    })(i)
  }
  const canStart = next >= 0 && next < 5
  const wk = weekly.weekKey()
  const allDone = prog.done >= 5
  const claimed = storage.weeklyRewardClaimed(wk)
  const btns = []
  if (allDone && !claimed) {
    // 周奖励（E1）：5 关全完成 → 一次性领取 +30✦ 与限定称号
    btns.push({
      label: '领取周奖励 +30✦', primary: true,
      onTap: function () {
        const dust = storage.claimWeeklyReward(wk)
        if (dust > 0) {
          sm.toast('周奖励 +' + dust + '✦ · 获得称号「本周行者」')
          sm.sceneModal(showWeekly(sm, startFn, onClose))
        }
      }
    })
  } else if (canStart) {
    btns.push({ label: '挑战第 ' + (next + 1) + ' 关', primary: true, onTap: function () { startFn(next, plan[next]) } })
  } else {
    btns.push({ label: claimed ? '本周已完成 · 奖励已领' : '本周已完成', primary: false, onTap: null })
  }
  btns.push({ label: '关闭' })
  const claimLine = claimed
    ? L('限定称号「本周行者」已获得', { c: '#6FE3D2', s: 11.5 })
    : (allDone ? L('周奖励待领取：+30✦ 与称号「本周行者」', { c: '#FFD86E', b: true, s: 11.5 }) : L('完成本周全部 5 关可领周奖励 +30✦', { s: 11.5, c: '#9AA0C8' }))
  return new Modal(sm, {
    title: '周挑战',
    lines: [
      L('本周 ' + weekly.weekKey() + ' · 进度 ' + prog.done + '/5 · 周一 0 点刷新', { b: true, c: '#FFC15E', s: 12.5 }),
      L('5 个词缀关卡，全服同一布局，按顺序挑战。', { s: 11.5, c: '#9AA0C8' }),
      claimLine
    ],
    rows: rows,
    buttons: btns,
    onClose: onClose
  })
}

/* ---------- 挑战码 ---------- */

function showCode(sm, startFn, onClose) {
  const T = challenge.TEMPLATES
  // 会话内稳定种子：选模板/词缀时口令前缀不变
  const state = { tpl: 0, mods: [], seed: Math.floor(Math.random() * 0xFFF) }
  const build = function (existing) {
    const rows = []
    rows.push({ header: '模板' })
    T.forEach(function (t, i) {
      rows.push({
        ick: ['shield', 'sword', 'crown'][i] || 'sword',
        icCol: ['#6FE3D2', '#FF7A92', '#FFD86E'][i] || '#FFC15E',
        title: t.name,
        sub: '固定种子布局，全服一致',
        tag: state.tpl === i ? '✓ 已选' : '选择',
        tagColor: state.tpl === i ? '#FFC15E' : '#9AA0C8',
        dim: state.tpl === i,
        onTap: function (m) { state.tpl = i; build(m) }
      })
    })
    rows.push({ header: '词缀 · 点选叠加' })
    weekly.MODS.forEach(function (m) {
      const on = state.mods.indexOf(m.key) !== -1
      rows.push({
        ick: on ? 'check' : 'plus',
        icCol: on ? '#6FE3D2' : '#9AA0C8',
        title: m.name + ' · ' + m.desc,
        sub: on ? '点击移除' : '提高难度，通关更刺激',
        tag: on ? '已添加' : '添加',
        tagColor: on ? '#6FE3D2' : '#9AA0C8',
        dim: false,
        onTap: function (m) {
          if (on) state.mods = state.mods.filter(function (k) { return k !== m.key })
          else state.mods.push(m.key)
          build(m)
        }
      })
    })
    const code = challenge.encode(state.tpl, state.mods, state.seed)
    const opts = {
      title: '挑战码',
      lines: [
        L('把口令发给好友，对方点「粘贴口令」进入同一关卡；回首页也会自动识别剪贴板。', { s: 11, c: '#9AA0C8' }),
        { t: code, b: true, s: 21, c: '#FFC15E', ac: 'center', gap: true }
      ],
      rows: rows,
      buttons: [
        { label: '复制口令', primary: true, onTap: function () {
          copyText(code)
          sm.toast('口令已复制，去发给好友吧')
        } },
        { label: '粘贴口令', onTap: function () { pasteCode(sm, startFn) } },
        { label: '关闭' }
      ],
      onClose: onClose
    }
    // 选模板/词缀：就地刷新（不重播入场动画、保留滚动位置）
    if (existing) return existing.refresh(opts)
    return new Modal(sm, opts)
  }
  return build()
}

function copyText(text) {
  try {
    wx.setClipboardData({ data: text })
  } catch (e) {}
}

function pasteCode(sm, startFn) {
  try {
    wx.getClipboardData({
      success: function (res) {
        const dec = challenge.decode(res.data)
        if (!dec) { sm.toast('剪贴板没有有效口令，可手动输入'); manualInput(sm, startFn); return }
        startFn(dec)
      },
      fail: function () { manualInput(sm, startFn) }
    })
  } catch (e) {
    manualInput(sm, startFn)
  }
}

// 手动输入兜底（剪贴板读取失败/无效时）：editable showModal
function manualInput(sm, startFn) {
  try {
    wx.showModal({
      title: '输入挑战口令',
      content: '',
      editable: true,
      placeholderText: '粘贴或输入 MZ 开头的 9 位口令',
      success: function (res) {
        if (!res.confirm) return
        const dec = challenge.decode(res.content || '')
        if (!dec) { sm.toast('口令无效：应为 MZ 开头的 9 位码'); return }
        startFn(dec)
      }
    })
  } catch (e) {
    sm.toast('当前环境不支持输入口令')
  }
}

module.exports = {
  showSupply: showSupply,
  showSkin: showSkin,
  showSettings: showSettings,
  showAch: showAch,
  showRank: showRank,
  showDaily: showDaily,
  showWeekly: showWeekly,
  showCode: showCode,
  pasteCode: pasteCode
}
