/**
 * 系统弹窗构建器（v1.4 单塔防 / 纯单机版）
 * 保留的面板：补给站、皮肤、设置、成就、赛季、图鉴（含旅人手记）、签到、首入引导。
 * 已随迷宫玩法删除：每日 / 周挑战 / 节日 / 无尽 / 轮回 / 挑战码 / 剪贴板口令。
 * 补给站只保留塔防内真实生效的皮肤 / 英雄；天赋、道具强化、技能等迷宫机制
 * 已无消费方，UI 一并下线（storage API 与老存档数据保留，不回收）。
 * 图鉴主进度已迁到塔防条目；迷宫时代条目封存为只读档案区，不计入里程碑分母。
 */
const storage = require('../core/storage')
const theme = require('../core/theme')
const ad = require('../core/ad')
const task = require('../core/task')
const checkin = require('../core/checkin')
const codex = require('../core/codex')
const season = require('../core/season')
const analytics = require('../core/analytics')
const Modal = require('../ui/Modal')
const AdSim = require('../ui/AdSim')
const TaskPanel = require('../scene/TaskPanel')

function L(t, o) {
  const ln = { t: t }
  if (o) for (const k in o) ln[k] = o[k]
  return ln
}

const SKIN_ICON = { classic: 'castle', glow: 'leaf', festival: 'lantern', cosmos: 'spark', abyss: 'wave', sakura: 'flower', dawn: 'spark' }
const SKIN_COL = { classic: '#FFC15E', glow: '#6FE3D2', festival: '#FF7A92', cosmos: '#9B8CFF', abyss: '#40E0FF', sakura: '#FF9ECB', dawn: '#FFB46E' }

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
    const shardCost = theme.getShardCost(k)
    const myShards = storage.getShards()
    let sub, tag, tagColor
    if (using) { sub = t.desc || '已装备'; tag = '使用中'; tagColor = '#FFC15E' }
    else if (has) { sub = t.desc || '已拥有'; tag = '点按切换'; tagColor = '#6FE3D2' }
    else if (t.exclusive) { sub = t.exclusiveHint || '限定获取'; tag = '限定'; tagColor = '#FF9E4A' }
    else if (shardCost > 0 && myShards >= shardCost) { sub = '碎片 ' + myShards + '/' + shardCost + ' · 可兑换'; tag = '碎片兑换'; tagColor = '#6FE3D2' }
    else if (shardCost > 0) { sub = '碎片 ' + myShards + '/' + shardCost + ' · 每日全勤+3'; tag = t.price + '✦'; tagColor = '#FFD86E' }
    else { sub = t.desc || '光尘解锁 · 或看广告免费解锁'; tag = t.price + '✦'; tagColor = '#FFD86E' }
    rows.push({
      ick: SKIN_ICON[k] || 'spark',
      icCol: SKIN_COL[k] || '#9B8CFF',
      title: t.label,
      sub: sub,
      tag: tag,
      tagColor: tagColor,
      dim: using,
      onTap: function (m) {
        if (using) return
        if (!has) {
          // 限定皮肤（签到等来源专属）：不走光尘/碎片/广告任何获取路径
          if (t.exclusive) {
            sm.toast(t.exclusiveHint || '该皮肤为限定获取')
            return
          }
          // 碎片优先：持有足够则碎片兑换（任务货币闭环）
          if (shardCost > 0 && storage.getShards() >= shardCost) {
            storage.spendShard(shardCost)
            storage.unlockSkin(k)
            storage.setTheme(k)
            sm.toast('碎片兑换：' + t.label)
            refresh(m)
            return
          }
          // 该皮肤支持碎片兑换但碎片不足 → 打开引导页（展示缺口+天数，并提供光尘/广告即时解锁）
          if (shardCost > 0) {
            sm.sceneModal(shardGuide(sm, k, t, shardCost, function () { refresh(null) }))
            return
          }
          // 非碎片皮肤：原光尘足额直接解锁
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
  const finish = function (ok, why) {
    if (!ok) {
      if (why === 'daily') sm.toast('今日广告次数已达上限（' + ad.DAILY_LIMIT + ' 次/日）')
      else if (why === 'interval') sm.toast('操作太频繁，请 ' + ad.freqState().nextInSec + ' 秒后再试')
      else sm.toast('广告未看完，未能解锁')
      reopen(); return
    }
    storage.unlockSkin(k)
    storage.setTheme(k)
    sm.toast('广告解锁成功：' + t.label)
    reopen()
  }
  return new Modal(sm, {
    title: '免费解锁「' + t.label + '」',
    lines: [
      L('光尘不足？观看一段广告即可免费解锁该皮肤，解锁后立即穿上。', { s: 12.5 }),
      L('今日剩余广告次数 ' + ad.freqState().remain + '/' + ad.DAILY_LIMIT, { s: 10.5, c: '#9AA0C8' }),
      L(''),
      L('✦ 也可继续攒光尘（' + t.price + '✦）解锁，通关 / 每日挑战 / 广告均可获取。', { s: 11, c: '#9AA0C8' })
    ],
    buttons: [
      {
        label: '▶ 看广告解锁', primary: true,
        onTap: function () {
          const handled = ad.showRewarded(finish)
          // 无广告位（DEV）时走模拟广告页；打开即计数（recordShown，与真实广告口径一致）；
          // adSim 须挂到当前场景（sceneAd），场景才会驱动 update/draw
          if (!handled) { ad.recordShown(); sm.sceneAd(new AdSim(sm, finish, '解锁皮肤：' + t.label)) }
        }
      },
      { label: '取消', onTap: reopen }
    ],
    onClose: reopen
  })
}

// 碎片不足引导页：明确「还差多少 / 每日全勤 +3 / 预计天数」，并给出即时解锁替代路径
function shardGuide(sm, k, t, cost, reopen) {
  const info = task.shardNeed(cost)
  const buttons = []
  const canDust = storage.getDust() >= t.price
  const onDust = function () {
    if (!storage.spendDust(t.price)) { sm.toast('光尘不足'); reopen(); return }
    storage.unlockSkin(k)
    storage.setTheme(k)
    sm.toast('光尘解锁：' + t.label)
    reopen()
  }
  if (canDust) buttons.push({ label: '✦ 光尘解锁（' + t.price + '）', primary: true, onTap: onDust })
  buttons.push({
    label: '▶ 看广告解锁', primary: !canDust,
    onTap: function () { sm.sceneModal(adUnlockSkin(sm, k, t, reopen)) }
  })
  buttons.push({
    label: '去做每日任务（+3碎片/天）',
    onTap: function () {
      reopen() // 先关引导，回到外观页
      sm.sceneModal(TaskPanel.build(sm, function () { reopen() })) // 任务面板关闭后重新打开外观页
    }
  })
  buttons.push({ label: '取消', onTap: reopen })
  return new Modal(sm, {
    title: '碎片不足 · 兑换「' + t.label + '」',
    lines: [
      L('还差 ' + info.need + ' 碎片（持有 ' + info.have + '/' + cost + '）。', { s: 13, b: true, c: '#FFC15E' }),
      L('每日任务全部完成可领 ' + task.FULL_DAILY.shard + ' 碎片，预计还需约 ' + info.days + ' 天集齐。', { s: 11.5, c: '#9AA0C8' }),
      L(''),
      L('也可立刻用光尘或看广告解锁，立即穿上。', { s: 11, c: '#9AA0C8' })
    ],
    buttons: buttons,
    onClose: reopen
  })
}

// 英雄行卡（皮肤弹窗与补给站共用）：条件达成即解锁，广告/光尘走手动路径
function buildHeroRows(sm, refresh) {
  const cur = storage.getHero()
  const stats = storage.heroStats()
  // 解锁源已迁入波数口径，进度单位固定为「波 / 局」
  const uStar = ' 波'
  const uClear = ' 局'
  return storage.HEROES.map(function (h) {
    const avail = storage.heroAvailable(h.id)
    const using = cur === h.id
    let tag = ''
    let tagColor = '#FFD86E'
    if (using) { tag = '使用中'; tagColor = '#FFC15E' }
    else if (avail) { tag = '点按切换'; tagColor = '#6FE3D2' }
    else if (h.by === 'stars') { tag = '还差 ' + Math.max(0, h.need - stats.stars) + uStar; tagColor = '#9AA0C8' }
    else if (h.by === 'clears') { tag = '还差 ' + Math.max(0, h.need - stats.clears) + uClear; tagColor = '#9AA0C8' }
    else if (h.by === 'ad') { tag = '看广告'; tagColor = '#9AA0C8' }
    else { tag = h.price + '✦' }
    // 副标题恒为一句短文案（≤11 字），进度走 tag，特性名并入标题——避免超出行卡宽度
    let sub = h.desc
    const trait = storage.HERO_TRAITS[h.id]
    let title = h.name
    if (trait && avail) {
      title += ' · ' + trait.name
      sub = trait.desc
    }
    return {
      // 英雄小人 chip（调色板驱动）：必须带上 outfit 职业配件字段，
      // 否则弹窗预览缺帽子/武器等造型，与游戏内实际皮肤对不上（getHeroPal 仅运行时注入）
      hero: Object.assign({}, h.pal, { outfit: h.outfit || 'rover' }),
      icCol: h.pal.tunic,
      title: title,
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
          sm.toast(h.by === 'stars' ? '还差 ' + lack + ' 波解锁' : '还差 ' + lack + ' 局守卫解锁')
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
  const finish = function (ok, why) {
    if (!ok) {
      if (why === 'daily') sm.toast('今日广告次数已达上限（' + ad.DAILY_LIMIT + ' 次/日）')
      else if (why === 'interval') sm.toast('操作太频繁，请 ' + ad.freqState().nextInSec + ' 秒后再试')
      else sm.toast('广告未看完，未能解锁')
      reopen(); return
    }
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
      L('今日剩余广告次数 ' + ad.freqState().remain + '/' + ad.DAILY_LIMIT, { s: 10.5, c: '#9AA0C8' }),
      L(''),
      L('造型与主题皮肤相互独立，随时可在皮肤弹窗中切换。', { s: 11, c: '#9AA0C8' })
    ],
    buttons: [
      {
        label: '▶ 看广告解锁', primary: true,
        onTap: function () {
          const handled = ad.showRewarded(finish)
          // 打开模拟页即计数（与真实广告口径一致）
          if (!handled) { ad.recordShown(); sm.sceneAd(new AdSim(sm, finish, '解锁英雄：' + h.name)) }
        }
      },
      { label: '取消', onTap: reopen }
    ],
    onClose: reopen
  })
}

// 外观行卡（头像框 / 称号）：装备 / 使用中(点按卸下) / 点按装备
function buildCosmRows(sm, refresh) {
  const active = storage.getActiveCosmetic()
  const cos = storage.getCosmetics()
  const mk = function (kind, id) {
    const meta = task.cosmeticMeta(kind, id)
    const using = (kind === 'frame' ? active.frame : active.title) === id
    return {
      ick: kind === 'frame' ? 'crown' : 'star',
      icCol: meta.color,
      title: meta.name,
      sub: meta.desc || (kind === 'frame' ? '头像框' : '称号'),
      tag: using ? '使用中 · 点按卸下' : '点按装备',
      tagColor: using ? '#FFC15E' : '#6FE3D2',
      dim: using,
      onTap: function (m) {
        if (using) {
          if (kind === 'frame') storage.setActiveFrame(null); else storage.setActiveTitle(null)
          sm.toast('已卸下' + (kind === 'frame' ? '头像框' : '称号'))
          refresh(m); return
        }
        if (kind === 'frame') storage.setActiveFrame(id); else storage.setActiveTitle(id)
        sm.toast('已装备：' + meta.name)
        refresh(m)
      }
    }
  }
  return {
    frames: cos.frames.map(function (id) { return mk('frame', id) }),
    titles: cos.titles.map(function (id) { return mk('title', id) })
  }
}

// 独立外观弹窗（首页顶栏「皮肤」钮入口）：主题皮肤 + 英雄 + 任务头像框/称号，统一穿戴入口
function showSkin(sm, onClose) {
  const makeOpts = function () {
    const rows = buildSkinRows(sm, apply)
    rows.push({ header: '英雄' })
    buildHeroRows(sm, apply).forEach(function (r) { rows.push(r) })
    const cos = storage.getCosmetics()
    const cm = buildCosmRows(sm, apply)
    if (cos.frames.length) {
      rows.push({ header: '头像框' })
      cm.frames.forEach(function (r) { rows.push(r) })
    }
    if (cos.titles.length) {
      rows.push({ header: '称号' })
      cm.titles.forEach(function (r) { rows.push(r) })
    }
    if (!cos.frames.length && !cos.titles.length) {
      rows.push({ header: '头像框 / 称号' })
      rows.push({ title: '完成任务获取', sub: '周常「本周塔尖挑战」与每周全勤可获奖品', dim: true })
    }
    return {
      title: '外观',
      lines: [
        L('✦ 光尘 ' + storage.getDust() + ' · 碎片 ' + storage.getShards() + ' · 轻点即可切换或兑换', { c: '#FFC15E', b: true, s: 13 }),
        L('皮肤 ' + storage.getUnlockedSkins().length + '/' + theme.ORDER.length + ' · 英雄 ' + storage.getHeroCollected() + '/' + storage.HEROES.length + ' · 外观 ' + (cos.frames.length + cos.titles.length), { c: '#6FE3D2', s: 11.5 })
      ],
      rows: rows,
      buttons: [{ label: '关闭' }],
      onClose: onClose
    }
  }
  // m 为被点行所在弹窗：是本弹窗 → 就地刷新（无闪烁）；否则（广告确认页返回）→ 重建
  const apply = function (m) {
    if (m && m.title === '外观') m.refresh(makeOpts())
    else sm.sceneModal(new Modal(sm, makeOpts()))
  }
  return new Modal(sm, makeOpts())
}

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
    // 挑战码已随迷宫玩法删除（纯单机不再提供口令 / 剪贴板入口）
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
    lines: [L('将清空通关记录、探索度、光尘、皮肤、英雄、天赋、技能、成就与图鉴。广告解锁的关卡、系统设置与每日/周挑战历史保留。此操作不可撤销。', { s: 12 })],
    buttons: [
      {
        label: '确认重置', primary: true,
        onTap: function () {
          storage.resetProgress()
          sm.toast('进度已重置')
          // 重建首页：switch 重入会 exit+enter，全部数据与布局从存档重读，
          // 避免弹窗关闭后首页仍显示重置前的旧缓存（光尘/关卡/皮肤）
          sm.switch('home')
        }
      },
      { label: '取消', onTap: function () { back() } }
    ]
  })
}

function showSupply(sm, onClose) {
  const makeOpts = function () {
    const rows = []

    // 迷宫时代的天赋 / 道具强化 / 技能在塔防内已无任何消费方，购买等于空耗光尘。
    // 补给站只保留真实生效的外观收集（皮肤 / 英雄）；storage 侧 API 与老存档数据不删。
    rows.push({ header: '皮肤' })
    buildSkinRows(sm, apply).forEach(function (r) { rows.push(r) })

    rows.push({ header: '英雄' })
    buildHeroRows(sm, apply).forEach(function (r) { rows.push(r) })

    return {
      title: '补给站',
      lines: [L('✦ 光尘 ' + storage.getDust() + ' · 守卫结算 / 签到 / 广告获取（不可充值）', { c: '#FFC15E', b: true, s: 14 })],
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

function showAch(sm, onClose) {
  const list = storage.achList()
  const rows = []
  for (let i = 0; i < list.length; i++) {
    const a = list[i]
    const got = a.unlocked
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
  // 本机成绩摘要（原「排行榜」下线后迁移至此，不再单占 Dock 入口）
  // 图鉴 / 伙伴 / 手记已收进图鉴面板，成就面板回归纯成就清单
  const st = storage.getStats()
  const prog = storage.getProgress()
  let stars = 0
  for (const k in (prog.completed || {})) stars += (prog.completed[k].stars || 1)
  return new Modal(sm, {
    title: '成就',
    lines: [
      L('成就 ' + list.filter(function (a) { return a.unlocked; }).length + '/' + list.length + ' · 达成成就永久点亮', { b: true, c: '#FFC15E', s: 13.5 }),
      L('皮肤收集 ' + storage.getUnlockedSkins().length + '/' + theme.ORDER.length + ' · 光尘解锁更多主题', { c: '#6FE3D2', s: 11.5 }),
      L('累计 ★' + stars + ' · 最速 ' + (st.bestTime ? st.bestTime + 's' : '—') + ' · 生存第 ' + (st.bestWave ? st.bestWave + ' 波' : '—'), { c: '#9AA0C8', s: 11 })
    ],
    rows: rows,
    buttons: [{ label: '关闭' }],
    onClose: onClose
  })
}

// 赛季奖励描述：把 rewardFor 的键值对转成可读文本
function seasonRewardDesc(rw) {
  if (!rw || typeof rw !== 'object') return ''
  const parts = []
  if (rw.frame) parts.push('头像框「' + rw.frame + '」')
  if (rw.title) parts.push('称号「' + rw.title + '」')
  if (rw.shard) parts.push(rw.shard + ' 碎片')
  if (rw.dust) parts.push(rw.dust + ' 光尘')
  if (rw.revive) parts.push(rw.revive + ' 复活')
  if (rw.unlock) parts.push(rw.unlock + ' 解锁券')
  return parts.join(' · ')
}

// 赛季征程面板：等级 / 进度 / 剩余天数 + 可领奖励一键领取
function showSeason(sm, onClose) {
  const info = season.info()
  function buildRows() {
    const s = season.info()
    const inf = checkin.info()
    // 签到回看与赛季领奖共用「今日徽章」一个入口，签到完成后仍可随时查连续天数
    const rows = [
      { header: '今日签到' },
      {
        ick: 'daily', icCol: '#FFC15E',
        title: '每日签到 · 连续 ' + inf.streak + ' 天',
        sub: inf.signed ? '今日已签到 · 明天再来领光尘' : ('今日可领 ' + inf.todayDust + ' 光尘'),
        tag: inf.signed ? '已签到' : '签到 ›',
        tagColor: inf.signed ? '#9AA0C8' : '#6EE7A0',
        onTap: function () { sm.sceneModal(showCheckin(sm, onClose)) }
      }
    ]
    s.claimable.forEach(function (lv) {
      const rw = s.rewardFor(lv)
      rows.push({
        ick: 'star',
        icCol: '#FFC15E',
        title: 'Lv.' + lv + ' 赛季奖励',
        sub: seasonRewardDesc(rw),
        tag: '领取',
        tagColor: '#6EE7A0',
        onTap: function (m) {
          const r = season.claim(lv)
          if (r.ok) {
            try { analytics.track('season_claim', { level: lv }) } catch (e) {}
            sm.toast('已领取 Lv.' + lv + ' 奖励')
            if (m && m.rows) m.rows = buildRows() // 刷新列表
          } else {
            sm.toast('领取失败：' + (r.reason || '未知'))
          }
        }
      })
    })
    if (rows.length === 2) {
      rows.push({ header: '暂无可领赛季奖励 · 通关 / 完成挑战获取赛季经验' })
    }
    return rows
  }
  const rows = buildRows()
  const m = new Modal(sm, {
    title: '赛季征程 · 第 ' + info.season + ' 赛季',
    lines: [
      L('Lv.' + info.level + ' / ' + info.maxLevel + ' · 进度 ' + info.into + '/' + info.perLevel + ' · 剩余 ' + info.left + ' 天', { b: true, c: '#FFC15E', s: 13.5 }),
      L('赛季结束 XP 与未领奖励将重置，限时稀缺请尽早领取', { c: '#9AA0C8', s: 11 })
    ],
    rows: rows,
    buttons: [{ label: '关闭' }],
    onClose: onClose
  })
  return m
}

// 首入引导页（onboarding）：操作 / 玩法总览，关闭后由调用方标记 seen
function showIntro(sm, onClose) {
  const rows = [
    { ick: 'daily', icCol: '#FFD86E', title: '每日签到', sub: '连续登录送光尘，里程碑解锁专属皮肤' },
    { ick: 'rank', icCol: '#FFC15E', title: '赛季征程', sub: '通关 / 完成任务累积经验，升级领奖励' },
    { ick: 'bag', icCol: '#FF9F6E', title: '道具背包', sub: '右下角点按使用：隐身 / 冰冻 / 魔弹…' },
    { ick: 'monster', icCol: '#FF7A92', title: '避怪寻路', sub: '拖动旅人绕开怪物，找到发光出口通关' }
  ]
  return new Modal(sm, {
    title: '欢迎来到无尽地宫',
    lines: [
      L('拖动屏幕，带旅人走向发光的出口', { b: true, c: '#FFD86E', s: 14 }),
      L('收集光点兑换光尘，解锁皮肤与能力；异变日挑战更刺激', { c: '#DCD6FF', s: 11.5 })
    ],
    rows: rows,
    buttons: [{ label: '开始探索', primary: true }],
    onClose: onClose
  })
}

// 地宫图鉴（守卫篇）：塔防条目为主进度，迷宫时代条目作为只读档案区。
// 里程碑分母冻结在塔防条目上（见 core/codex.js 迁移口径），老存档零回收。
function showCodex(sm, onClose) {
  const prog = codex.progress(function () { return storage.getCodex() })
  const cx = storage.getCodex()
  const rows = []
  for (let g = 0; g < codex.GROUP_ORDER.length; g++) {
    const gk = codex.GROUP_ORDER[g]
    const gp = prog.byGroup[gk]
    const archived = gk === 'archive'
    rows.push({ header: codex.GROUP_LABEL[gk] + ' ' + gp.got + '/' + gp.total })
    const list = codex.byGroup(gk)
    for (let i2 = 0; i2 < list.length; i2++) {
      const e = list[i2]
      const n = cx[e.key] || 0
      if (n > 0) {
        rows.push({
          ick: archived ? 'book' : 'check',
          icCol: e.color,
          title: e.glyph + ' ' + e.name,
          sub: archived ? ('迷宫时代档案 · ' + e.desc) : e.desc,
          tag: archived ? '已封存' : '×' + n,
          tagColor: e.color
        })
      } else {
        rows.push({
          ick: 'lock',
          icCol: '#9AA0C8',
          title: '？？？',
          sub: archived ? '迷宫时代档案 · 已封存，不再新增' : '守卫局内对应行为即可收录',
          tag: archived ? '已封存' : '未收录',
          tagColor: '#9AA0C8',
          dim: true
        })
      }
    }
  }
  // 收集里程碑状态行
  const msRows = codex.MILESTONES.map(function (ms) {
    const got = !!storage.getFlag(ms.flag)
    return {
      ick: got ? 'rank' : 'lock',
      icCol: got ? '#FFD86E' : '#9AA0C8',
      title: '称号「' + ms.title + '」',
      sub: got ? ('已达成 · ' + ms.desc) : ('达成条件：' + ms.desc + '（+' + ms.shard + ' 碎片）'),
      tag: got ? '已达成' : '收集目标',
      tagColor: got ? '#FFD86E' : '#9AA0C8',
      dim: !got
    }
  })
  // 收集与成就：低频系统收进同一分组；伙伴（迷宫遭遇）换成真实生效的守卫战绩
  const achList = storage.achList()
  const achGot = achList.filter(function (a) { return a.unlocked; }).length
  const jr = storage.journalList().filter(function (j) { return j.unlocked; }).length
  const st = storage.getStats()
  const overview = [
    { header: '收集与成就' },
    {
      ick: 'rank', icCol: '#FFC15E',
      title: '成就 ' + achGot + '/' + achList.length,
      sub: '达成成就永久点亮 · 含本机成绩摘要',
      tag: '查看 ›', tagColor: '#FFC15E',
      onTap: function () { sm.sceneModal(showAch(sm, onClose)) }
    },
    {
      ick: 'book', icCol: '#9B8CFF',
      title: '旅人手记 ' + jr + '/12 段',
      sub: '迷宫时代档案 · 已封存，老存档篇章仍可阅读',
      tag: '阅读 ›', tagColor: '#9B8CFF',
      onTap: function () { sm.sceneModal(showJournal(sm, onClose)) }
    },
    {
      ick: 'shield', icCol: '#6FE3D2',
      title: '守卫战绩 · 最佳 ' + (st.bestTowerWave || 0) + ' 波',
      sub: '累计 ' + (st.towerRuns || 0) + ' 局 / ' + (st.totalTowerWaves || 0) + ' 波',
      tag: '本机', tagColor: '#6FE3D2'
    }
  ]
  return new Modal(sm, {
    title: '地宫图鉴',
    lines: [
      L('守卫篇 ' + prog.got + '/' + prog.total + ' · 迷宫时代档案 ' + prog.archive.got + '/' + prog.archive.total + '（已封存）', { b: true, c: '#7FD8FF', s: 13 }),
      L('建塔 / 击杀 / 选赐福 / 守住波次即自动收录', { s: 11, c: '#9AA0C8' })
    ],
    rows: overview.concat([{ header: '收集里程碑' }]).concat(msRows).concat(rows),
    buttons: [{ label: '关闭' }],
    onClose: onClose
  })
}

function showCheckin(sm, onClose) {
  const inf = checkin.info()
  // 里程碑行：已领 → check 图标 + 绿 tag；未达成 → lock + 灰 tag + 还差 N 天
  const rows = inf.ms.map(function (m) {
    const isNext = inf.nextMs && inf.nextMs.day === m.day
    return {
      ick: m.got ? 'check' : (isNext ? 'spark' : 'lock'),
      icCol: m.got ? '#6FE3D2' : (isNext ? '#FFB46E' : '#9AA0C8'),
      title: '连续 ' + m.day + ' 天 · ' + m.label,
      sub: m.got ? '已领取' : (isNext ? '再签 ' + m.left + ' 天即可领取' : '尚未达成'),
      tag: m.got ? '已领取' : (isNext ? '进行中' : m.day + ' 天'),
      tagColor: m.got ? '#6FE3D2' : (isNext ? '#FFB46E' : '#9AA0C8'),
      dim: !isNext && !m.got,
      onTap: null
    }
  })
  const btns = []
  if (!inf.signed) {
    btns.push({
      label: '立即签到 +' + inf.todayDust + ' 光尘', primary: true,
      onTap: function () {
        const r = checkin.sign()
        if (!r.ok) { sm.toast('今日已签到'); sm.sceneModal(showCheckin(sm, onClose)); return }
        try { analytics.track('checkin', { streak: r.streak, dust: inf.todayDust }) } catch (e) {}
        let msg = '签到成功 · +' + inf.todayDust + ' 光尘 · 连续 ' + r.streak + ' 天'
        if (r.msGot.length) {
          const skinGot = r.msGot.some(function (g) { return g.kind === 'skin' })
          msg += skinGot ? ' · 解锁皮肤「晨曦」！' : ' · 里程碑达成！'
        }
        sm.toast(msg)
        sm.sceneModal(showCheckin(sm, onClose))
      }
    })
  } else {
    btns.push({ label: '今日已签到 · 明天再来', primary: false, onTap: null })
  }
  btns.push({ label: '关闭' })
  return new Modal(sm, {
    title: '每日签到',
    lines: [
      L('已连续签到 ' + inf.streak + ' 天 · 累计 ' + inf.total + ' 天', { b: true, c: '#FFB46E' }),
      L('每日签到送光尘（连续越久送越多），断签不扣已得奖励、连续从 1 重新计。', { s: 12 }),
      L(''),
      inf.nextMs
        ? L('下一个里程碑：' + inf.nextMs.label + '（还差 ' + inf.nextMs.left + ' 天）', { s: 12, c: '#6FE3D2' })
        : L('全部里程碑已达成，感谢坚守地宫！', { s: 12, c: '#6FE3D2' })
    ],
    rows: rows,
    buttons: btns,
    onClose: onClose
  })
}

/* ---------- 旅人手记（迷宫时代档案 · 已封存，随图鉴保留） ---------- */
const JOURNAL_ZONES = ['入门森林', '迷雾峡谷', '流光回廊', '熔岩深渊', '星海之巅', '虚空回响']

function showJournal(sm, onClose) {
  const list = storage.journalList()
  const rows = []
  let lastZone = -1
  list.forEach(function (j) {
    if (j.zone !== lastZone) {
      lastZone = j.zone
      rows.push({ header: JOURNAL_ZONES[j.zone] || ('第 ' + (j.zone + 1) + ' 区') })
    }
    const isMaster = j.kind === 'master'
    rows.push({
      ick: j.unlocked ? 'book' : 'lock',
      icCol: j.unlocked ? (isMaster ? '#FFC15E' : '#9B8CFF') : '#9AA0C8',
      title: j.unlocked ? j.title : '？？？',
      sub: j.unlocked ? (isMaster ? '迷宫时代 · 制霸篇章 · 点开阅读' : '迷宫时代 · 首通篇章 · 点开阅读') : '迷宫时代档案 · 已封存',
      tag: j.unlocked ? '阅读 ›' : '🔒',
      tagColor: j.unlocked ? '#9B8CFF' : '#9AA0C8',
      dim: !j.unlocked,
      onTap: j.unlocked ? function () { sm.sceneModal(journalDetail(sm, j, function () { sm.sceneModal(showJournal(sm, onClose)) })) } : null
    })
  })
  return new Modal(sm, {
    title: '旅人手记',
    lines: [
      L('地宫为何沉没？火把从哪来？', { b: true, c: '#9B8CFF', s: 13 }),
      L('迷宫时代档案 · 共 12 段，已封存不再新增；老存档已解锁的篇章仍可阅读。', { s: 11, c: '#9AA0C8' })
    ],
    rows: rows,
    buttons: [{ label: '关闭', onTap: null }],
    onClose: onClose
  })
}

function journalDetail(sm, j, back) {
  return new Modal(sm, {
    title: j.title,
    lines: [
      L('迷宫时代档案 · ' + JOURNAL_ZONES[j.zone] + ' · ' + (j.kind === 'master' ? '制霸' : '首通'), { s: 11, c: '#9B8CFF', ac: 'center' }),
      { t: j.text, s: 12.5, c: '#F3F1FF', gap: true }
    ],
    buttons: [
      { label: '返回目录', primary: true, onTap: function () { back() } },
      { label: '关闭', onTap: null }
    ]
  })
}

module.exports = {
  showSupply: showSupply,
  showSkin: showSkin,
  shardGuide: shardGuide,
  showSettings: showSettings,
  showAch: showAch,
  showSeason: showSeason,
  showIntro: showIntro,
  showCheckin: showCheckin,
  showCodex: showCodex,
  showJournal: showJournal
}
