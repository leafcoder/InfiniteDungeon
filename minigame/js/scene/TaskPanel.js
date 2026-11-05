/**
 * 任务面板（日常 / 周常）
 * 复用 Modal 组件（实底 .panel，符合弹窗规范）；行卡展示任务名 / 进度 / 状态，
 * 可领取项高亮「领取」并点击发放，领取后重建面板刷新状态与全勤进度。
 */
const task = require('../core/task')
const season = require('../core/season')
const Modal = require('../ui/Modal')

function rewardText(rw) {
  const parts = []
  if (rw.dust) parts.push(rw.dust + '✦')
  if (rw.revive) parts.push(rw.revive + '复活券')
  if (rw.unlock) parts.push(rw.unlock + '解锁券')
  if (rw.shard) parts.push(rw.shard + '碎片')
  if (rw.frame) parts.push('头像框·' + rw.frame)
  if (rw.title) parts.push('称号·' + rw.title)
  return parts.join('+')
}

function iconFor(cat) {
  if (cat === 'collect') return 'leaf'
  if (cat === 'social') return 'book'
  return 'tower'
}

function build(sm, onClose, isRefresh) {
  if (!isRefresh) task.track('expose') // 面板首次打开记曝光；领取后重建为刷新不重复记
  const st = task.getState()
  const rows = []

  function pushTask(t, prefix) {
    const pct = Math.min(100, Math.round((t.progress / t.target) * 100))
    const sub = t.desc + ' · ' + t.progress + '/' + t.target + ' (' + pct + '%)'
    let tag, tagColor, onTap = null
    if (t.claimed) {
      tag = '已领取'; tagColor = '#6FE3D2'
    } else if (t.canClaim) {
      tag = '领取'; tagColor = '#FFC15E'
      onTap = function (m) {
        task.track('click')
        const r = task.claim(t.id)
        if (!r.ok) return
        const msgs = []
        r.got.forEach(function (g) { msgs.push(rewardText(g)) })
        r.fullBonus.forEach(function (g) { msgs.push('全勤+' + rewardText(g)) })
        const sb = r.streakBonus || []
        sb.forEach(function (g) { msgs.push('连勤+' + rewardText(g)) })
        if (msgs.length) sm.toast('领取：' + msgs.join('，'))
        if (m && m.close) m.close()
        sm.sceneModal(build(sm, onClose, true))
      }
    } else {
      tag = '进行中'; tagColor = '#9AA0C8'
    }
    rows.push({
      icon: iconFor(t.cat),
      title: prefix + t.name,
      sub: sub,
      tag: tag,
      tagColor: tagColor,
      dim: t.claimed,
      onTap: onTap
    })
  }

  // 连续全勤进度：跨日累积目标，给玩家「明天还要回来续上」的理由
  const si = task.streakInfo()
  rows.push({
    icon: 'crown',
    title: '🔥 连续全勤 ' + si.streak + ' 天',
    sub: si.next ? ('再 ' + si.next.left + ' 天得 ' + si.next.label) : '全部里程碑已达成 · 保持纪录',
    tag: si.next ? '进行中' : '✓',
    tagColor: si.next ? '#FFC15E' : '#6FE3D2',
    dim: !si.next
  })
  // 今日主题：每天确定性轮换 target/奖励/名称，给玩家「今天有什么新目标」的期待
  const th = st.theme || task.themeInfo()
  rows.push({
    icon: 'daily',
    title: '【每日任务 · ' + th.label + '】',
    sub: th.desc + ' · 0 点刷新换主题',
    tag: '', tagColor: th.color, dim: true
  })
  st.daily.forEach(function (t) { pushTask(t, '') })
  rows.push({ icon: 'weekly', title: '【每周任务】', sub: '周一 0 点刷新', tag: '', tagColor: '#9B8CFF', dim: true })
  st.weekly.forEach(function (t) { pushTask(t, '') })

  if (st.dailyFull) rows.push({ icon: 'leaf', title: '每日全勤达成', sub: '已发放皮肤碎片 ×' + task.FULL_DAILY.shard, tag: '✓', tagColor: '#6FE3D2', dim: true })
  if (st.weeklyFull) rows.push({ icon: 'crown', title: '每周全勤达成', sub: '已发放限定称号', tag: '✓', tagColor: '#6FE3D2', dim: true })

  // ---- 赛季征程（免费通行证）：把日常/周常/无尽塔行为串进同一个 30 天目标 ----
  const sea = season.info()
  rows.push({
    icon: 'tower',
    title: '【第 ' + sea.season + ' 赛季 · 第 ' + sea.day + '/' + sea.totalDays + ' 天】',
    sub: sea.left > 0 ? ('还剩 ' + sea.left + ' 天 · 赛季结束未领奖励失效') : '本赛季最后一日 · 尽快领取',
    tag: '', tagColor: '#E36BFF', dim: true
  })
  rows.push({
    icon: 'spark',
    title: '赛季 Lv.' + sea.level + '/' + sea.maxLevel,
    sub: sea.level >= sea.maxLevel ? '已满级 · ' + sea.claimable.length + ' 项待领' : ('本级进度 ' + sea.into + '/' + sea.perLevel + ' · 通关/任务/无尽塔可得赛季经验'),
    tag: sea.claimable.length > 0 ? sea.claimable.length + ' 项可领' : '进行中',
    tagColor: sea.claimable.length > 0 ? '#FFC15E' : '#9AA0C8',
    dim: sea.claimable.length === 0
  })
  // 已达标未领的等级逐级给领取行（上限 6 行防面板溢出，更早的先进度行提示总数）
  sea.claimable.slice(0, 6).forEach(function (lv) {
    const rw = sea.rewardFor(lv)
    rows.push({
      icon: 'spark',
      title: '第 ' + lv + ' 级奖励',
      sub: rewardText(rw),
      tag: '领取', tagColor: '#FFC15E',
      onTap: function (m) {
        const r = season.claim(lv)
        if (!r.ok) return
        const msgs = []
        r.got.forEach(function (g) { msgs.push(rewardText(g)) })
        if (msgs.length) sm.toast('赛季奖励：' + msgs.join('，'))
        if (m && m.close) m.close()
        sm.sceneModal(build(sm, onClose, true))
      }
    })
  })

  return new Modal(sm, {
    title: '任务',
    rows: rows,
    buttons: [{ label: '关闭' }],
    onClose: onClose
  })
}

module.exports = { build: build }
