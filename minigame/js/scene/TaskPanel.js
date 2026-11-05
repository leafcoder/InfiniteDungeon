/**
 * 任务面板（日常 / 周常）
 * 复用 Modal 组件（实底 .panel，符合弹窗规范）；行卡展示任务名 / 进度 / 状态，
 * 可领取项高亮「领取」并点击发放，领取后重建面板刷新状态与全勤进度。
 */
const task = require('../core/task')
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

  rows.push({ icon: 'daily', title: '【每日任务】', sub: '0 点刷新 · 完成领奖', tag: '', tagColor: '#FFC15E', dim: true })
  st.daily.forEach(function (t) { pushTask(t, '') })
  rows.push({ icon: 'weekly', title: '【每周任务】', sub: '周一 0 点刷新', tag: '', tagColor: '#9B8CFF', dim: true })
  st.weekly.forEach(function (t) { pushTask(t, '') })

  if (st.dailyFull) rows.push({ icon: 'leaf', title: '每日全勤达成', sub: '已发放皮肤碎片 ×' + task.FULL_DAILY.shard, tag: '✓', tagColor: '#6FE3D2', dim: true })
  if (st.weeklyFull) rows.push({ icon: 'crown', title: '每周全勤达成', sub: '已发放限定称号', tag: '✓', tagColor: '#6FE3D2', dim: true })

  return new Modal(sm, {
    title: '任务',
    rows: rows,
    buttons: [{ label: '关闭' }],
    onClose: onClose
  })
}

module.exports = { build: build }
